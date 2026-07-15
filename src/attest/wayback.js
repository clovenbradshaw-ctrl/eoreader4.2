// EO: INS·SIG(Entity → Entity,Lens, Making,Binding) — Wayback/IA request shapes + parsers
// The Internet Archive protocol seam (docs/attestation-spec.md §4): the request TEMPLATES and the
// response PARSERS the witness (witness.js) drives, split out so the witness object and its queue
// stay small. Pure and offline — nothing here holds a credential or reaches the network; the send is
// the caller's injected client. §4.1 warns SPN's auth and rate limits drift, so the template lives
// here and the HTTP is elsewhere.
//
// TWO capture paths. The NO-KEY flow (the default) is three public GETs — fire /save, poll the
// Availability API for the fresh closest, read the CDX digest — needing no auth and no S3 key, and
// browser-safe (the Availability API is a plain JSON GET, sidestepping the CORS wall on /save's
// headers). The LEGACY keyed SPN2 job path (save → job_id → /save/status) still works for a
// credential holder but is no longer required (the S3-key assumption is dropped, §6).

// ── the id_ replay flag (§4.2) — the single easiest thing to get wrong ───────────
// The RAW, unmodified payload as captured. Every comparison in the spec uses id_; the default
// (rewritten) replay injects a toolbar and proxies links and would report ~100% false divergence.
export const idReplayUrl = (waybackTimestamp, url) =>
  waybackTimestamp && url ? `https://web.archive.org/web/${waybackTimestamp}id_/${url}` : null;

// waybackToIso('20260714192311') → '2026-07-14T19:23:11Z'. Pure string surgery on the 14-digit
// CDX/SPN timestamp — no clock, no timezone guess (Wayback timestamps are UTC by definition).
export const waybackToIso = (ts) => {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(String(ts || ''));
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : null;
};

// ── the no-key witness flow (§4.1) — three public GETs, no credential ─────────────
// (1) Fire the save — a plain GET on /save/{url} triggers a capture. No body, no Authorization. The
// response may carry a Content-Location, but it is not guaranteed and captures lag, so we poll (2).
export const saveTriggerRequest = (url) => ({ method: 'GET', url: `https://web.archive.org/save/${url}` });

// (2) The Availability API — the keyless way to get the canonical snapshot back. Needs nothing.
export const availabilityRequest = (url) => ({
  method: 'GET', url: `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`,
});

// parseAvailability(json) → the closest snapshot, normalized, or null. `{ archived_snapshots:
// { closest: { available, url, timestamp, status } } }`; once our fresh capture lands, `closest` is
// it (timestamp ≈ now — the caller checks freshness with isFreshCapture).
export const parseAvailability = (json) => {
  const c = json && json.archived_snapshots && json.archived_snapshots.closest;
  if (!c || c.available === false || !c.timestamp) return null;
  const ts = String(c.timestamp);
  return {
    available: true,
    snapshot_url: c.url || waybackSnapshotUrl(ts, null),
    wayback_timestamp: ts,
    http_status: c.status != null ? String(c.status) : null,
    captured_at: waybackToIso(ts),
  };
};

// waybackSnapshotUrl(ts, url) → the canonical human replay `…/web/{ts}/{url}` (the citable snapshot).
// The RAW-payload comparison still uses idReplayUrl (the id_ flag).
export const waybackSnapshotUrl = (waybackTimestamp, url) =>
  waybackTimestamp ? `https://web.archive.org/web/${waybackTimestamp}/${url || ''}` : null;

// isFreshCapture(timestamp, { now, withinMs }) → is this OUR contemporaneous capture, not a months-old
// one the API already held? Pure: `now` is injected epoch-ms. Default window 1h (captures lag minutes).
export const isFreshCapture = (waybackTimestamp, { now, withinMs = 3_600_000 } = {}) => {
  const iso = waybackToIso(waybackTimestamp);
  if (iso == null || !Number.isFinite(now)) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && (now - t) <= withinMs && (now - t) >= -withinMs;
};

// ── SPN2 request/response shapes (§4.1) — the LEGACY keyed path ───────────────────
// Kept for a credential holder (the LOW accesskey:secret job path). Request TEMPLATE only — no
// Authorization minted here (the key is the caller's). skip_first_archive 0 forces a fresh capture.
export const spnSaveRequest = (url, { captureAll = true, skipFirstArchive = false } = {}) => ({
  method: 'POST',
  url: 'https://web.archive.org/save',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `url=${encodeURIComponent(url)}&capture_all=${captureAll ? 1 : 0}&skip_first_archive=${skipFirstArchive ? 1 : 0}`,
});
export const spnStatusRequest = (jobId) => ({
  method: 'GET', url: `https://web.archive.org/save/status/${encodeURIComponent(jobId)}`,
});

// parseSaveResponse(json) → { job_id } | null. The POST returns a queued job; record the id and move
// on (§4.1 — do not block the crawl).
export const parseSaveResponse = (json) => {
  const id = json && (json.job_id || json.jobId);
  return id ? { job_id: String(id) } : null;
};

// parseStatusResponse(json) → a normalized status update. success carries the wayback timestamp (→
// captured_at ISO + id_ replay); pending stays queued; anything else is a typed fail.
export const parseStatusResponse = (json, url) => {
  const status = json && json.status;
  if (status === 'success') {
    const ts = json.timestamp || null;
    return { status: 'success', wayback_timestamp: ts, captured_at: waybackToIso(ts), replay: idReplayUrl(ts, url || json.original_url) };
  }
  if (status === 'pending') return { status: 'queued' };
  return { status: 'failed', error: (json && (json.message || json.status_ext || json.exception)) || 'unknown' };
};

// ── CDX request/parse (§4.3) — the capture history, used by watch.js (§7) ─────────
export const cdxRequest = (url, { fields = 'timestamp,digest,statuscode,mimetype,length' } = {}) => ({
  method: 'GET',
  url: `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}&output=json&fl=${encodeURIComponent(fields)}`,
});

// parseCdxRows(json) → [{ timestamp, digest, statuscode, mimetype, length }, …]. CDX json is
// array-of-arrays with a header row; we key each row by the header so a field reorder on their side
// does not silently misalign columns. The digest is IA's base32 SHA-1 of the payload.
export const parseCdxRows = (json) => {
  if (!Array.isArray(json) || json.length === 0) return [];
  const rows = Array.isArray(json[0]) ? json : null;
  if (!rows) return [];
  const header = rows[0].map(String);
  return rows.slice(1).map((r) => {
    const o = {};
    header.forEach((h, i) => { o[h] = r[i]; });
    return o;
  });
};

// newestCdxDigest(json) → the digest of the most-recent capture row, or null (step 3, the bundle's
// fingerprint — IA's SHA-1, no auth). Tolerates the header-keyed shape (parseCdxRows) and the bare
// array-of-arrays a `limit=-1` query returns (digest is the 6th column, index 5).
export const newestCdxDigest = (json) => {
  const rows = parseCdxRows(json);
  if (rows.length) return rows[rows.length - 1].digest ?? null;
  if (Array.isArray(json) && Array.isArray(json[json.length - 1])) return json[json.length - 1][5] ?? null;
  return null;
};
