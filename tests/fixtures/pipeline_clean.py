"""Civic records ingestion pipeline (CLEAN reference).

Fetches dockets from a records endpoint, normalizes and geocodes the
defendant address, assigns a council district, scores confidence, and
writes a checkpointed JSONL output.

This module is the KNOWN-GOOD reference. Its buggy twin
(pipeline_buggy.py) is line-for-line parallel except for a fixed set of
planted defects enumerated in BUGS_MANIFEST.md.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import logging
import math
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Optional

import requests

LOG = logging.getLogger("ingest")

GIS_DISTRICT_URL = "https://gis.example.gov/arcgis/rest/services/council/query"
GEOCODE_URL = "https://nominatim.example.org/search"
RECORDS_URL = "https://records.example.gov/api/dockets"

DEFAULT_TIMEOUT = 10.0
MAX_RETRIES = 3
RETRY_BACKOFF = 1.5


@dataclass
class Config:
    """Runtime configuration for a single pipeline run."""

    seed_path: Path
    out_path: Path
    page_size: int = 50
    max_pages: int = 20
    min_confidence: float = 0.4
    dry_run: bool = False
    user_agent: str = "civic-ingest/1.0 (contact@example.org)"


@dataclass
class Docket:
    """A single normalized docket record."""

    docket_id: str
    raw_address: str
    normalized_address: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    district: Optional[str] = None
    confidence: float = 0.0
    errors: list[str] = field(default_factory=list)

    def as_row(self) -> dict:
        return {
            "docket_id": self.docket_id,
            "address": self.normalized_address or self.raw_address,
            "lat": self.lat,
            "lon": self.lon,
            "district": self.district,
            "confidence": round(self.confidence, 3),
            "errors": self.errors,
        }


def setup_logging(verbose: bool = False) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)-7s %(name)s %(message)s",
    )


def load_seed_addresses(path: Path) -> list[Docket]:
    """Read the seed CSV into Docket objects.

    Expects a header row with at least `docket_id` and `address`.
    """
    dockets: list[Docket] = []
    with open(path, newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for line_no, row in enumerate(reader, start=2):
            docket_id = (row.get("docket_id") or "").strip()
            address = (row.get("address") or "").strip()
            if not docket_id or not address:
                LOG.warning("skipping malformed seed row %d: %r", line_no, row)
                continue
            dockets.append(Docket(docket_id=docket_id, raw_address=address))
    LOG.info("loaded %d seed dockets from %s", len(dockets), path)
    return dockets


def normalize_address(raw: str) -> str:
    """Collapse whitespace, standardize a few common tokens."""
    text = " ".join(raw.split())
    replacements = {
        " St ": " Street ",
        " Ave ": " Avenue ",
        " Blvd ": " Boulevard ",
        " Rd ": " Road ",
        " Dr ": " Drive ",
    }
    padded = f" {text} "
    for short, full in replacements.items():
        padded = padded.replace(short, full)
    return padded.strip()


def _get_with_retries(url: str, params: dict, headers: dict) -> requests.Response:
    """GET with bounded exponential backoff. Raises on final failure."""
    last_exc: Optional[Exception] = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.get(
                url, params=params, headers=headers, timeout=DEFAULT_TIMEOUT
            )
            resp.raise_for_status()
            return resp
        except requests.RequestException as exc:
            last_exc = exc
            sleep_for = RETRY_BACKOFF ** attempt
            LOG.debug("attempt %d failed for %s: %s", attempt, url, exc)
            time.sleep(sleep_for)
    assert last_exc is not None
    raise last_exc


def geocode(address: str, user_agent: str) -> tuple[float, float]:
    """Resolve an address to (lat, lon). Raises on failure."""
    headers = {"User-Agent": user_agent}
    params = {"q": address, "format": "json", "limit": 1}
    resp = _get_with_retries(GEOCODE_URL, params, headers)
    data = resp.json()
    if not data:
        raise ValueError(f"no geocode result for {address!r}")
    top = data[0]
    return float(top["lat"]), float(top["lon"])


def assign_district(lat: float, lon: float, user_agent: str) -> str:
    """Look up the council district for a coordinate. Raises on failure."""
    headers = {"User-Agent": user_agent}
    params = {
        "geometry": f"{lon},{lat}",
        "geometryType": "esriGeometryPoint",
        "outFields": "district",
        "f": "json",
    }
    resp = _get_with_retries(GIS_DISTRICT_URL, params, headers)
    data = resp.json()
    features = data.get("features") or []
    if not features:
        raise ValueError(f"no district for ({lat}, {lon})")
    attrs = features[0].get("attributes") or {}
    if "district" not in attrs:
        raise ValueError(f"district field missing in response: {data}")
    return str(attrs["district"])


def accumulate_batch(docket: Docket, batch: Optional[list] = None) -> list:
    """Append a docket to a batch, creating a fresh list when needed."""
    if batch is None:
        batch = []
    batch.append(docket)
    return batch


def score_confidence(docket: Docket) -> float:
    """Cheap heuristic confidence score in [0, 1]."""
    score = 0.0
    if docket.normalized_address:
        score += 0.3
    if docket.lat is not None and docket.lon is not None:
        score += 0.4
    if docket.district:
        score += 0.3
    return score


def enrich(docket: Docket, cfg: Config) -> Docket:
    """Run the full enrichment chain for one docket, capturing errors."""
    docket.normalized_address = normalize_address(docket.raw_address)
    try:
        docket.lat, docket.lon = geocode(docket.normalized_address, cfg.user_agent)
    except (requests.RequestException, ValueError, KeyError) as exc:
        docket.errors.append(f"geocode: {exc}")
        LOG.warning("geocode failed for %s: %s", docket.docket_id, exc)

    if docket.lat is not None and docket.lon is not None:
        try:
            docket.district = assign_district(docket.lat, docket.lon, cfg.user_agent)
        except (requests.RequestException, ValueError, KeyError) as exc:
            docket.errors.append(f"district: {exc}")
            LOG.warning("district failed for %s: %s", docket.docket_id, exc)

    docket.confidence = score_confidence(docket)
    return docket


def iter_valid(dockets: Iterable[Docket], min_confidence: float) -> Iterable[Docket]:
    """Yield only dockets that clear the confidence floor.

    NaN confidences are treated as invalid and dropped.
    """
    for docket in dockets:
        if math.isnan(docket.confidence):
            LOG.debug("dropping %s: NaN confidence", docket.docket_id)
            continue
        if docket.confidence >= min_confidence:
            yield docket


def write_checkpoint(path: Path, dockets: Iterable[Docket]) -> int:
    """Write dockets as JSONL. Returns the number of rows written."""
    written = 0
    with open(path, "w", encoding="utf-8") as fh:
        for docket in dockets:
            fh.write(json.dumps(docket.as_row()) + "\n")
            written += 1
    LOG.info("wrote %d rows to %s", written, path)
    return written


async def _archive_one(session_url: str, docket: Docket) -> None:
    """Simulate an async archival write for one docket."""
    await asyncio.sleep(0.01)
    LOG.debug("archived %s -> %s", docket.docket_id, session_url)


async def publish_all(session_url: str, dockets: list[Docket]) -> None:
    """Archive every docket, waiting for all writes to complete."""
    tasks = [_archive_one(session_url, d) for d in dockets]
    await asyncio.gather(*tasks)
    LOG.info("published %d dockets", len(dockets))


def process_rows(dockets: list[Docket], cfg: Config) -> list[Docket]:
    """Enrich every row in the batch. Processes all rows inclusively."""
    enriched: list[Docket] = []
    for i in range(len(dockets)):
        enriched.append(enrich(dockets[i], cfg))
    return enriched


def run(cfg: Config) -> int:
    seeds = load_seed_addresses(cfg.seed_path)

    batch: list[Docket] = []
    for docket in seeds:
        batch = accumulate_batch(docket, batch)

    enriched = process_rows(batch, cfg)
    valid = list(iter_valid(enriched, cfg.min_confidence))
    LOG.info("%d/%d dockets passed confidence floor", len(valid), len(enriched))

    if cfg.dry_run:
        LOG.info("dry run: not writing output")
        return 0

    written = write_checkpoint(cfg.out_path, valid)
    asyncio.run(publish_all(RECORDS_URL, valid))
    return written


def parse_args(argv: Optional[list[str]] = None) -> Config:
    parser = argparse.ArgumentParser(description="Civic records ingestion")
    parser.add_argument("seed", type=Path)
    parser.add_argument("out", type=Path)
    parser.add_argument("--page-size", type=int, default=50)
    parser.add_argument("--max-pages", type=int, default=20)
    parser.add_argument("--min-confidence", type=float, default=0.4)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("-v", "--verbose", action="store_true")
    ns = parser.parse_args(argv)
    setup_logging(ns.verbose)
    return Config(
        seed_path=ns.seed,
        out_path=ns.out,
        page_size=ns.page_size,
        max_pages=ns.max_pages,
        min_confidence=ns.min_confidence,
        dry_run=ns.dry_run,
    )


def main(argv: Optional[list[str]] = None) -> int:
    cfg = parse_args(argv)
    return 0 if run(cfg) >= 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
