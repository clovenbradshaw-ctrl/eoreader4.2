// EO: INS·CON·EVA(Entity → Entity,Link,Lens, Making,Binding,Tracing) — third-party witnesses of a capture
// Witness — "a neutral party saw the same thing at the same time" (docs/attestation-spec.md §4).
// The SECOND attestation function: custody (custody.js) is yours, the witness is theirs, and the
// whole architecture rests on never confusing the two (§0). A witness does not back up your bytes
// — it INDEPENDENTLY re-fetches the URL and co-signs (or diverges from) what it saw. A witness is
// a Lens: one third party's reading of one situation (§9 assembly 2).
//
// This is a SOURCING seam, exactly like ingest/webfetch's proxy seam: the core here is pure and
// offline — it mints witness records, builds the SPN2 / CDX request SHAPES, parses their
// responses, and drives a fire-and-forget job queue — while the actual HTTP is an injected
// `client`. Nothing here holds a credential or reaches the network; §4.1 explicitly warns that
// SPN's auth and rate limits drift, so the request template is here and the send is the caller's.
//
// Two services, on purpose (§4.4): Internet Archive and archive.today FAIL FOR DIFFERENT REASONS,
// and two witnesses with uncorrelated failure modes corroborate far better than two with the same
// one. Their diversity is the engine's existing witness currency (core/witness.js makeDiversity):
// two services that both captured are two VOICES → 'corroborated'.

import { makeDiversity } from '../core/index.js';

// ── the witness services (§4.1, §4.4) ───────────────────────────────────────────
export const SERVICES = Object.freeze({
  IA: Object.freeze({ id: 'web.archive.org', label: 'Internet Archive', api: true,  ignoresRobots: false, withdrawable: true }),
  AT: Object.freeze({ id: 'archive.today',   label: 'archive.today',    api: false, ignoresRobots: true,  withdrawable: false }),
});
const KNOWN_SERVICE = new Set([SERVICES.IA.id, SERVICES.AT.id]);

// The lifecycle of one witness request. Terminal states are success | failed | unarchived |
// withdrawn. `withdrawn` is set later by watch.js (§7.2) — a capture that EXISTED and is now
// gone — and it is a finding, not a failure.
export const WITNESS_STATUS = Object.freeze(['requested', 'queued', 'success', 'failed', 'unarchived', 'withdrawn']);

// ── the id_ replay flag (§4.2) — the single easiest thing to get wrong ───────────
// The RAW, unmodified payload as captured. Every comparison in the spec uses id_; the default
// (rewritten) replay injects a toolbar and proxies links and would report ~100% false divergence.
// So `idReplayUrl` is the one this module hands out, and it always carries the flag.
export const idReplayUrl = (waybackTimestamp, url) =>
  waybackTimestamp && url ? `https://web.archive.org/web/${waybackTimestamp}id_/${url}` : null;

// waybackToIso('20260714192311') → '2026-07-14T19:23:11Z'. Pure string surgery on the 14-digit
// CDX/SPN timestamp — no clock, no timezone guess (Wayback timestamps are UTC by definition).
export const waybackToIso = (ts) => {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(String(ts || ''));
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : null;
};

// ── SPN2 request/response shapes (§4.1) ──────────────────────────────────────────
// The request TEMPLATE only — no Authorization header is minted here (the LOW accesskey:secret is
// the caller's credential, injected by the client seam). capture_all rides on; skip_first_archive
// is 0 so a fresh capture is forced (we want OUR contemporaneous witness, not a months-old one).
export const spnSaveRequest = (url, { captureAll = true, skipFirstArchive = false } = {}) => ({
  method: 'POST',
  url: 'https://web.archive.org/save',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `url=${encodeURIComponent(url)}&capture_all=${captureAll ? 1 : 0}&skip_first_archive=${skipFirstArchive ? 1 : 0}`,
});
export const spnStatusRequest = (jobId) => ({
  method: 'GET', url: `https://web.archive.org/save/status/${encodeURIComponent(jobId)}`,
});

// parseSaveResponse(json) → { job_id } | null. The POST returns a queued job; we record the id
// and move on (§4.1 — do not block the crawl).
export const parseSaveResponse = (json) => {
  const id = json && (json.job_id || json.jobId);
  return id ? { job_id: String(id) } : null;
};

// parseStatusResponse(json) → a normalized status update. success carries the wayback timestamp
// (→ captured_at ISO + the id_ replay URL); pending stays queued; anything else is a typed fail.
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
// array-of-arrays with a header row; we key each row by the header so a field reorder on their
// side does not silently misalign columns. The digest is IA's base32 SHA-1 of the payload.
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

// ── the witness record (§9 assembly 2) ──────────────────────────────────────────
// A witness is a Lens. `tier` marks a near-miss witness (§8.2) — fired WITHOUT custody, so the
// address is preserved against link rot even though no bytes were kept. `capture_id` ties a
// full-custody witness back to the capture it co-signs (null for a near-miss).
export const mkWitness = (fields = {}) => {
  const service = fields.service || (fields.serviceKey && SERVICES[fields.serviceKey]?.id) || null;
  return Object.freeze({
    schema: 'witness/1', kind: 'witness',
    service,
    url: fields.url || null,
    capture_id: fields.capture_id || null,
    tier: fields.tier || 'collapsed',       // 'collapsed' (has custody) | 'near-miss' (no custody)
    status: WITNESS_STATUS.includes(fields.status) ? fields.status : 'requested',
    requested_at: fields.requested_at || null,   // stamped by the caller, never minted here
    job: fields.job || null,
    captured_at: fields.captured_at || null,
    wayback_timestamp: fields.wayback_timestamp || null,
    cdx_digest: fields.cdx_digest || null,
    replay: fields.replay || null,
    error: fields.error || null,
  });
};

const withStatus = (w, patch) => mkWitness({ ...w, ...patch });

// ── the fire-and-forget queue (§4.1, step 3) ─────────────────────────────────────
// Non-blocking by construction: `request` enqueues a witness (status 'requested') and returns
// immediately; the crawl moves on. `advance(client)` is what you call LATER, off the critical
// path — it sends pending saves, polls queued jobs, and settles them. Deduped by service+url so
// the same page is not re-requested from the same witness while one is in flight.
export const createWitnessQueue = () => {
  const byKey = new Map();   // `${service} ${url}` → witness record
  const key = (service, url) => `${service} ${url}`;

  const request = ({ serviceKey = 'IA', service, url, requested_at = null, capture_id = null, tier = 'collapsed' } = {}) => {
    const svc = service || SERVICES[serviceKey]?.id || null;
    if (!svc || !KNOWN_SERVICE.has(svc)) return { witness: null, fresh: false, reason: 'unknown-service' };
    if (!url) return { witness: null, fresh: false, reason: 'no-url' };
    const k = key(svc, url);
    const prev = byKey.get(k);
    // In-flight or settled-success requests are not re-fired; a terminal failure MAY be retried.
    if (prev && (prev.status === 'requested' || prev.status === 'queued' || prev.status === 'success'))
      return { witness: prev, fresh: false, reason: 'already-' + prev.status };
    const w = mkWitness({ service: svc, url, requested_at, capture_id, tier, status: 'requested' });
    byKey.set(k, w);
    return { witness: w, fresh: true, reason: null };
  };

  // Drive one witness one step: requested → (client.save) → queued; queued → (client.status) →
  // success | queued | failed. The client is injected: `{ save(service,url) → {job_id} | null,
  // status(service,jobId) → raw status json }`. A save that returns null (refused / blocked) is a
  // typed 'unarchived' (§10), not a silent drop. Errors from the client settle to 'failed'.
  const step = async (w, client) => {
    try {
      if (w.status === 'requested') {
        const res = await client.save(w.service, w.url);
        if (!res || !res.job_id) return withStatus(w, { status: 'unarchived' });
        return withStatus(w, { status: 'queued', job: res.job_id });
      }
      if (w.status === 'queued' && w.job) {
        const upd = parseStatusResponse(await client.status(w.service, w.job), w.url);
        return withStatus(w, upd);
      }
    } catch (e) {
      return withStatus(w, { status: 'failed', error: String(e && e.message || e) });
    }
    return w;
  };

  // advance(client) → settle every non-terminal witness by one step. Returns the current list.
  const advance = async (client) => {
    for (const [k, w] of byKey) {
      if (w.status === 'requested' || w.status === 'queued') byKey.set(k, await step(w, client));
    }
    return list();
  };

  const list = () => [...byKey.values()];
  const forUrl = (url) => list().filter((w) => w.url === url);
  const get = (service, url) => byKey.get(key(service, url)) || null;
  return { request, advance, list, forUrl, get };
};

// ── near-miss witnessing (§8.2, step 4) ──────────────────────────────────────────
// The cheapest insurance in the spec: a high-amplitude span that did NOT collapse still gets one
// SPN call, so its address survives link rot if the investigation turns and you want it in
// November. No custody, no bytes — a witness with tier 'near-miss'. The amplitude gate lives in
// frontier.js; this is the witness half.
export const nearMissRequest = (queue, { url, requested_at = null, serviceKey = 'IA' } = {}) =>
  queue.request({ serviceKey, url, requested_at, tier: 'near-miss', capture_id: null });

// ── witness diversity (§4.4) — two voices, uncorrelated failure ─────────────────
// The witnesses that SUCCEEDED for one capture, folded into the engine's witness currency. Each
// distinct service that captured is one voice; both witnessing → 'corroborated'. Witnesses share
// one sense (the web), so they never reach cross-modal on their own — that rung is for a capture
// held through two SENSE-CHANNELS (a page AND a scan), which custody, not witnessing, supplies.
export const witnessDiversity = (witnesses = []) => {
  const voices = new Set(witnesses.filter((w) => w && w.status === 'success').map((w) => w.service));
  return makeDiversity({ origins: voices.size, voices: voices.size, senses: voices.size > 0 ? ['web'] : [] });
};

// witnessed(witnesses) → the plain corroboration read a publication needs: how many independent
// archives hold this capture, and whether that clears the corroboration bar (§4.4).
export const witnessed = (witnesses = []) => {
  const d = witnessDiversity(witnesses);
  return { voices: d.voices, tier: d.tier, corroborated: d.voices >= 2, services: [...new Set(witnesses.filter((w) => w?.status === 'success').map((w) => w.service))].sort() };
};
