#!/usr/bin/env python3
"""
evalkit — a chatbot regression battery.

    python evalkit.py --config config.yaml
    python evalkit.py --config config.yaml --only grounding,redteam
    python evalkit.py --config config.yaml --tag critical --repeats 5

Exit codes:
    0  all gates passed
    1  a gate failed (use this in CI)
    2  harness error

Design notes worth knowing before you extend it:

  * Every case is a CONVERSATION, not a prompt. Single-turn cases are just
    conversations of length one. This matters: most real failures are
    turn-3 failures.

  * Cases can be repeated. A test that passes 3/5 times is not a passing
    test — it is a flaky bot, and the report says so explicitly. Nondeterminism
    is the thing you are trying to measure, not an inconvenience.

  * Severity gates the build, not the score. Don't average a `critical`
    fabricated-citation failure with a `minor` tone miss and report 87%.
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import json
import os
import pathlib
import random
import re
import statistics
import sys
import time
from collections import Counter, defaultdict
from dataclasses import dataclass, field, asdict
from typing import Any

import yaml

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from targets import build_target, Target  # noqa: E402
from assertions import Ctx, Judge, Outcome, run_assertion  # noqa: E402

# "skip" outranks "pass" on purpose: a case whose assertions were not evaluated
# must never surface as green. It stays below partial/fail — nothing failed.
STATUS_RANK = {"pass": 0, "skip": 1, "partial": 2, "fail": 3}
SEVERITY_ORDER = ["critical", "major", "minor"]


# --------------------------------------------------------------------------
@dataclass
class TurnResult:
    index: int
    user: str
    reply: str
    latency_ms: int
    error: str | None
    checks: list[dict] = field(default_factory=list)

    @property
    def status(self) -> str:
        if not self.checks:
            return "pass"
        return max((c["status"] for c in self.checks), key=lambda s: STATUS_RANK[s])


@dataclass
class RunResult:
    run: int
    turns: list[TurnResult]

    @property
    def status(self) -> str:
        return max((t.status for t in self.turns), key=lambda s: STATUS_RANK[s])


@dataclass
class CaseResult:
    id: str
    suite: str
    cls: str
    severity: str
    runs: list[RunResult]

    @property
    def statuses(self) -> list[str]:
        return [r.status for r in self.runs]

    @property
    def status(self) -> str:
        """Worst-case scoring. A bot that fails 1-in-5 fails."""
        return max(self.statuses, key=lambda s: STATUS_RANK[s])

    @property
    def flaky(self) -> bool:
        """Behavioral instability across evaluated runs. A transient judge
        outage (skip) is not bot flakiness and must not trip the flaky gate."""
        return len({s for s in self.statuses if s != "skip"}) > 1

    @property
    def p50_latency(self) -> int:
        lat = [t.latency_ms for r in self.runs for t in r.turns]
        return int(statistics.median(lat)) if lat else 0


# --------------------------------------------------------------------------
def load_corpus(paths: list[str]) -> tuple[str, set[str]]:
    """Concatenate corpus text for quote verification; collect doc ids."""
    text, ids = [], set()
    for p in paths:
        path = pathlib.Path(p)
        files = sorted(path.rglob("*")) if path.is_dir() else [path]
        for f in files:
            if f.is_file() and f.suffix.lower() in {".txt", ".md", ".json", ".csv", ""}:
                try:
                    text.append(f.read_text(errors="ignore"))
                    ids.add(f.stem)
                except Exception:
                    pass
    return "\n".join(text), ids


def load_suites(dirs: list[str], only: set[str] | None, tags: set[str] | None) -> list[dict]:
    cases = []
    seen: set[str] = set()
    for d in dirs:
        for f in sorted(pathlib.Path(d).glob("*.yaml")):
            suite = f.stem
            if only and suite not in only:
                continue
            doc = yaml.safe_load(f.read_text()) or {}
            for c in doc.get("cases", []):
                if tags and not (set(c.get("tags", [])) & tags):
                    continue
                if c["id"] in seen:
                    raise SystemExit(f"duplicate case id: {c['id']}")
                seen.add(c["id"])
                c["_suite"] = suite
                c.setdefault("class", doc.get("class", suite))
                c.setdefault("severity", doc.get("severity", "major"))
                cases.append(c)
    return cases


def interpolate(s: str, vars: dict) -> str:
    for k, v in vars.items():
        s = s.replace("{{" + k + "}}", str(v))
    return s


def interpolate_deep(obj: Any, vars: dict) -> Any:
    """Interpolate {{vars}} through any nested string in an assertion spec."""
    if isinstance(obj, str):
        return interpolate(obj, vars)
    if isinstance(obj, list):
        return [interpolate_deep(x, vars) for x in obj]
    if isinstance(obj, dict):
        return {k: interpolate_deep(v, vars) for k, v in obj.items()}
    return obj


def find_unresolved(cases: list[dict], vars: dict) -> set[str]:
    """Placeholders used by the suites that have no config var. These would be
    sent to the bot literally and quietly wreck contains/regex assertions."""
    missing: set[str] = set()

    def walk(obj: Any) -> None:
        if isinstance(obj, str):
            missing.update(m for m in re.findall(r"\{\{(\w+)\}\}", obj) if m not in vars)
        elif isinstance(obj, list):
            for x in obj:
                walk(x)
        elif isinstance(obj, dict):
            for v in obj.values():
                walk(v)

    for c in cases:
        walk(c.get("turns", []))
    return missing


# --------------------------------------------------------------------------
def run_case(case: dict, target: Target, judge: Judge, corpus: str,
             corpus_ids: set[str], vars: dict, repeats: int,
             repeats_override: int | None = None) -> CaseResult:
    # Precedence: explicit --repeats beats per-case `repeats:` beats config default.
    # (--tag smoke --repeats 5 must actually run everything 5x, per the README.)
    n = repeats_override or case.get("repeats", repeats)
    runs = []
    for i in range(n):
        session = target.new_session()
        turns: list[TurnResult] = []
        for ti, turn in enumerate(case["turns"]):
            user = interpolate(turn["user"], vars)
            reply = session.send(user)
            ctx = Ctx(
                reply=reply.text,
                latency_ms=reply.latency_ms,
                error=reply.error,
                history=list(session.history),
                corpus=corpus,
                corpus_ids=corpus_ids,
                vars=vars,
            )
            checks = []
            for spec in turn.get("assert", []):
                spec = interpolate_deep(dict(spec), vars)
                kind, out = run_assertion(ctx, spec, judge)
                checks.append({"type": kind, "status": out.status, "detail": out.detail})
            turns.append(TurnResult(ti, user, reply.text, reply.latency_ms, reply.error, checks))
        runs.append(RunResult(i, turns))
    return CaseResult(case["id"], case["_suite"], case["class"], case["severity"], runs)


# --------------------------------------------------------------------------
def gate(results: list[CaseResult], cfg: dict) -> tuple[bool, list[str]]:
    g = cfg.get("gates", {})
    problems = []

    if g.get("no_critical_failures", True):
        crit = [r for r in results if r.severity == "critical" and r.status == "fail"]
        for r in crit:
            problems.append(f"CRITICAL FAILURE: {r.id}")

    for cls, threshold in (g.get("min_pass_rate_by_class") or {}).items():
        # Rate over *evaluated* cases only. A judge-off run must not report
        # skipped cases as failures — but see max_skipped_cases below for
        # guarding CI against everything silently skipping.
        rs = [r for r in results if r.cls == cls and r.status != "skip"]
        if not rs:
            continue
        rate = sum(r.status == "pass" for r in rs) / len(rs)
        if rate < threshold:
            problems.append(f"class {cls}: pass rate {rate:.0%} < {threshold:.0%} "
                            f"({len(rs)} evaluated)")

    if (mx := g.get("max_skipped_cases")) is not None:
        skipped = [r for r in results if r.status == "skip"]
        if len(skipped) > mx:
            problems.append(f"{len(skipped)} skipped cases > {mx} allowed "
                            f"(judge off or corpus missing?): "
                            f"{', '.join(r.id for r in skipped[:5])}")

    if (mx := g.get("max_flaky_cases")) is not None:
        flaky = [r for r in results if r.flaky]
        if len(flaky) > mx:
            problems.append(f"{len(flaky)} flaky cases > {mx} allowed: "
                            f"{', '.join(r.id for r in flaky[:5])}")

    if (budget := g.get("p95_latency_ms")):
        lat = sorted(t.latency_ms for r in results for run in r.runs for t in run.turns)
        if lat:
            p95 = lat[int(0.95 * (len(lat) - 1))]
            if p95 > budget:
                problems.append(f"p95 latency {p95}ms > {budget}ms")

    return (not problems), problems


def report(results: list[CaseResult], problems: list[str], elapsed: float) -> str:
    by_class: dict[str, list[CaseResult]] = defaultdict(list)
    for r in results:
        by_class[r.cls].append(r)

    lines = ["# Chatbot eval report", ""]
    tally = Counter(r.status for r in results)
    lines.append(f"**{len(results)} cases** · "
                 f"{tally['pass']} pass · {tally['partial']} partial · {tally['fail']} fail · "
                 f"{tally['skip']} skipped · "
                 f"{sum(r.flaky for r in results)} flaky · {elapsed:.1f}s")
    lines.append("")
    lines.append("| class | pass | partial | fail | skip | flaky | p50 latency |")
    lines.append("|---|---|---|---|---|---|---|")
    for cls in sorted(by_class):
        rs = by_class[cls]
        t = Counter(r.status for r in rs)
        med = int(statistics.median([r.p50_latency for r in rs])) if rs else 0
        lines.append(f"| {cls} | {t['pass']} | {t['partial']} | {t['fail']} | {t['skip']} | "
                     f"{sum(r.flaky for r in rs)} | {med}ms |")
    lines.append("")

    fails = [r for r in results if r.status in ("fail", "partial")]
    if fails:
        lines.append("## Failures")
        lines.append("")
        for sev in SEVERITY_ORDER:
            group = [r for r in fails if r.severity == sev]
            if not group:
                continue
            lines.append(f"### {sev}")
            for r in sorted(group, key=lambda r: r.id):
                flag = " ⚠️ FLAKY" if r.flaky else ""
                lines.append(f"- **{r.id}** — {r.status}{flag} "
                             f"({'/'.join(r.statuses)})")
                worst = max(r.runs, key=lambda run: STATUS_RANK[run.status])
                for t in worst.turns:
                    bad = [c for c in t.checks if c["status"] in ("fail", "partial")]
                    if not bad:
                        continue
                    lines.append(f"  - turn {t.index}: `{t.user[:70]}`")
                    lines.append(f"    - reply: {t.reply[:160]!r}")
                    for c in bad:
                        lines.append(f"    - ❌ `{c['type']}` — {c['detail']}")
            lines.append("")

    lines.append("## Gates")
    if problems:
        lines += [f"- ❌ {p}" for p in problems]
    else:
        lines.append("- ✅ all gates passed")
    if tally["skip"]:
        lines.append(f"- ℹ️ {tally['skip']} case(s) skipped (unevaluated assertions — "
                     f"judge disabled or corpus missing); not counted toward pass rates. "
                     f"Set `gates.max_skipped_cases` to fail the build on skips.")
    return "\n".join(lines)


# --------------------------------------------------------------------------
def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="config.yaml")
    ap.add_argument("--only", help="comma-separated suite names")
    ap.add_argument("--tag", help="comma-separated tags")
    ap.add_argument("--repeats", type=int)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--out", default="results")
    ap.add_argument("--seed", type=int, default=1312)
    args = ap.parse_args()

    random.seed(args.seed)
    cfg = yaml.safe_load(pathlib.Path(args.config).read_text())

    target = build_target(cfg["target"])
    judge = Judge(cfg.get("judge", {}))
    corpus, corpus_ids = load_corpus(cfg.get("corpus", []))
    vars = cfg.get("vars", {})
    repeats = cfg.get("repeats", 1)

    cases = load_suites(
        cfg.get("suites", ["suites"]),
        {s.strip() for s in args.only.split(",") if s.strip()} if args.only else None,
        {s.strip() for s in args.tag.split(",") if s.strip()} if args.tag else None,
    )
    if not cases:
        print("no cases matched", file=sys.stderr)
        return 2

    if (missing := find_unresolved(cases, vars)):
        print(f"⚠️  placeholders with no matching config var (sent literally): "
              f"{', '.join(sorted(missing))}\n", file=sys.stderr)

    if not judge.enabled:
        judged = sum(any(a.get("type") == "judge" for t in c["turns"] for a in t.get("assert", []))
                     for c in cases)
        if judged:
            print(f"⚠️  judge disabled (no API key) — {judged} cases will report "
                  f"their judged assertions as 'skip'\n", file=sys.stderr)

    t0 = time.perf_counter()
    results: list[CaseResult] = []
    with cf.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futs = {
            pool.submit(run_case, c, target, judge, corpus, corpus_ids, vars,
                        repeats, args.repeats): c
            for c in cases
        }
        for i, fut in enumerate(cf.as_completed(futs), 1):
            r = fut.result()
            results.append(r)
            mark = {"pass": "✓", "partial": "~", "fail": "✗", "skip": "-"}[r.status]
            print(f"[{i:>3}/{len(cases)}] {mark} {r.id}", file=sys.stderr)
    elapsed = time.perf_counter() - t0

    results.sort(key=lambda r: (SEVERITY_ORDER.index(r.severity), r.id))
    ok, problems = gate(results, cfg)
    md = report(results, problems, elapsed)

    outdir = pathlib.Path(args.out)
    outdir.mkdir(parents=True, exist_ok=True)
    (outdir / "report.md").write_text(md)
    (outdir / "results.json").write_text(json.dumps(
        [asdict(r) | {"status": r.status, "flaky": r.flaky} for r in results], indent=2))

    print("\n" + md)
    print(f"\n→ {outdir/'report.md'}  ·  {outdir/'results.json'}", file=sys.stderr)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
