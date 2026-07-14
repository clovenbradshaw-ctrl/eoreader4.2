// EO: SIG·INS·DEF(Void → Entity,Atmosphere, Making,Binding,Dissecting) — local custody of the bytes read
// Custody — "these are the bytes I read" (docs/attestation-spec.md §3). The FIRST of the
// four attestation functions and the only one you must never outsource: custody is yours,
// attestation is theirs (§0). You hold the payload; a witness (§4) only co-signs it.
//
// A capture mints a frozen custody record (§3.2) whose load-bearing field is the PIN —
// `payload_sha256`, the SHA-256 of the response body AS RECEIVED. Not the hash of the WARC/
// WACZ container (which carries timestamps and repack metadata and would drift), but the bytes
// themselves, so the pin is STABLE under re-containerisation. That pin IS the `capture_sha256`
// the web-page row of docs/retrieval-spec.md §5 already reserves — custody does not mint a
// competing address, it fills that IOU: a capture composes straight into a citable span_id via
// retrieve/pin.js `webSource(url, payload_sha256)`.
//
// This core is pure and offline: the actual FETCH lives behind a seam (path C in-tab fetch,
// path B companion fetcher, path A extension — §3.1), exactly as ingest/websource.js keeps
// search/fetch behind the proxy seam. Given a fetched payload it mints the record, computes the
// pin, and pins the span. The raw bytes are retained by the fetch layer (ingest/opfs-store.js)
// or a WACZ container; custody holds the RECORD and the pin that resolves back to them.

import { webSource, spanId, sha256Hex, verifyOnResolve, parseSpanId } from '../surfer/retrieve/index.js';

// ── the three custody paths (§3.1) ─────────────────────────────────────────────
// Chosen by source class. No single path covers everything, and pretending one does is the
// error §3.1 warns against. The record carries which path took it so fidelity is legible.
export const PATHS = Object.freeze({
  A: 'A',   // browser extension (ArchiveWeb.page → WACZ) — session-fidelity, paywalled/auth pages
  B: 'B',   // companion fetcher on your own infra → WARC/WACZ — bulk, public, scheduled
  C: 'C',   // in-tab fetch where CORS permits — APIs, FeatureServers, your own scrapers' targets
});
const isPath = (p) => p === 'A' || p === 'B' || p === 'C';

// ── provenance class — the two-category axis (intentional vs peripheral) ────────
// ORTHOGONAL to the preservation tier (frontier.js): the tier says HOW MUCH we kept, this says
// whether the source was DELIBERATELY added by the user or picked up ambiently by a wider crawl.
// Both stay fully provenance-traced; the class only governs whether peripheral sources enter an
// answer's scope (a global / per-topic toggle read at retrieval time — see scopeAdmits below).
export const PROVENANCE_CLASSES = Object.freeze(['intentional', 'peripheral']);
const isClass = (c) => c === 'intentional' || c === 'peripheral';

// ── the WACZ container reference (§3.1, §3.2) ───────────────────────────────────
// `wacz:<file_sha256>#<record_id>` — the file that holds the bytes and the record inside it.
// The container hash is NOT the pin (it drifts on repack); it only says where the bytes live.
export const formatContainer = ({ fileSha256, recordId } = {}) =>
  fileSha256 ? `wacz:${fileSha256}${recordId ? `#${recordId}` : ''}` : null;

export const parseContainer = (str) => {
  if (typeof str !== 'string') return null;
  const m = str.match(/^wacz:([^#]+)(?:#(.+))?$/);
  if (!m) return null;
  return { scheme: 'wacz', fileSha256: m[1], recordId: m[2] || null };
};

// ── computing the pin (§3.2) ────────────────────────────────────────────────────
// The SHA-256 of the response body as received. Injectable `hash` (default WebCrypto via
// pin.js) so the module is testable with a stub and runs on exotic runtimes. Bytes may arrive
// as a Uint8Array (path B/C) or, absent the raw body, as the decoded text — either hashes.
export const computePayloadSha256 = async (body, hash = sha256Hex) => {
  if (body == null) throw new Error('custody: no body to pin — a capture with no bytes has no pin (§3.3 rule 1)');
  return (await hash(body)).toLowerCase();
};

// Detect whether a request carried authentication, WITHOUT reading the secret (§3.2, §3.3.3):
// the PRESENCE of a Cookie / Authorization header is what marks the capture, so IA's
// unauthenticated crawl is EXPECTED to diverge (§5.4 `paywall`) and that divergence is a typed
// non-finding rather than a mystery. Header names are matched case-insensitively.
export const wasAuthenticated = (requestHeaders = {}) => {
  for (const k of Object.keys(requestHeaders || {})) {
    const low = k.toLowerCase();
    if (low === 'cookie' || low === 'authorization') return true;
  }
  return false;
};

// A deterministic capture id from the pin — colon-namespaced, sliced short like a web-source
// record id (ingest/websource.js). The pin already IS the identity; this is a handle for it.
export const captureId = (payloadSha256) => `cap:${String(payloadSha256 || '').replace(/^[^:]*:/, '').slice(0, 16)}`;

// ── minting the custody record (§3.2) ───────────────────────────────────────────
// mkCapture(payload, { hash?, provenanceClass? }) → a frozen capture record. The pin is taken
// verbatim if the fetcher shipped a real sha256 (path B/A compute it at fetch time), else
// computed here from `payload.body` / `payload.text`. Timestamps are NEVER minted here —
// `fetched_at` is stamped by the fetcher (the same discipline ingest/websource.js follows), so
// this core stays deterministic and unit-testable with no clock. Throws when no pin can be
// produced: rule §3.3.1 — no bytes, no custody, and a record with no pin cannot enter the tape.
export const mkCapture = async (payload = {}, { hash = sha256Hex, provenanceClass = 'peripheral' } = {}) => {
  const url = payload.span_source || payload.url || null;
  if (!url) throw new Error('custody: no span_source — a capture must name the URL it holds bytes for');
  const payload_sha256 = payload.payload_sha256
    ? String(payload.payload_sha256).toLowerCase()
    : await computePayloadSha256(payload.body ?? payload.text, hash);
  const request_headers = payload.request_headers || {};
  const cls = isClass(payload.provenance_class) ? payload.provenance_class
    : isClass(provenanceClass) ? provenanceClass : 'peripheral';
  return Object.freeze({
    schema: 'capture/1',
    id: captureId(payload_sha256),
    kind: 'capture',
    span_source: url,
    fetched_at: payload.fetched_at || null,        // stamped by the fetcher, never minted here
    path: isPath(payload.path) ? payload.path : null,
    request_headers,
    response_status: payload.response_status ?? null,
    response_headers: payload.response_headers || {},
    payload_sha256,                                 // ← THE PIN (§3.2)
    container: payload.container || formatContainer(payload.container_ref || {}),
    renderer: payload.renderer || null,             // e.g. "chrome/126", if JS-rendered (§5.4 render)
    authenticated: typeof payload.authenticated === 'boolean'
      ? payload.authenticated : wasAuthenticated(request_headers),
    provenance_class: cls,
  });
};

// ── the pin, as a citable address (bridges to retrieve/pin.js §5) ───────────────
// capturePin(capture) → the { uri, revision } web-source pin the retrieval spec defines: the URL
// is metadata, the payload hash is the revision. captureSpanId composes it with a holon path
// into one immutable span_id the ledger cites (§5 rule 4: web pages are captured, not linked).
export const capturePin = (capture) => webSource(capture?.span_source, capture?.payload_sha256);
export const captureSpanId = (capture, holonPath, range = {}) => spanId(capturePin(capture), holonPath, range);

// verifyCustody({ capture, bytes, hash? }) → the typed integrity verdict of pin.js run against
// the pin: 'match' when the held bytes re-hash to the pin, 'mismatch' when they drifted (which
// is INFORMATION, flagged, never swallowed — §5.1). This is how "you hold the bytes" is checked
// on every resolve; custody that cannot reproduce its pin is not custody.
export const verifyCustody = ({ capture, bytes, hash = sha256Hex } = {}) =>
  verifyOnResolve({ spanId: captureSpanId(capture, 'payload'), bytes, hash });

// admissible(capture) → does this capture satisfy rule §3.3.1 (a resolvable pin + a source)?
// The gate a claim passes before it may enter the tape: NO CLAIM WITHOUT CUSTODY.
export const admissible = (capture) =>
  !!capture && !!capture.span_source && !!capture.payload_sha256 &&
  !!parseSpanId(captureSpanId(capture, 'payload'));

// scopeAdmits(capture, { peripheralOn }) → whether this capture may enter an answer's scope
// given the peripheral toggle (global or per-topic). Intentional sources always pass; peripheral
// ones pass only while the toggle is on. Provenance is UNAFFECTED — a filtered-out source is
// still held, still pinned, still traceable; the toggle governs reach into an answer, not custody.
export const scopeAdmits = (capture, { peripheralOn = true } = {}) =>
  capture?.provenance_class === 'intentional' || peripheralOn !== false;

// ── the custody store — append-only, never overwrites ───────────────────────────
// Holds capture RECORDS (the bytes themselves live in OPFS / a WACZ container). Keyed by the
// pin, so the SAME bytes captured twice are ONE record; different bytes are a different capture
// (a changed page is a new pin, a new custody, exactly as retrieve/pin.js content-addresses).
// It never mutates a held record — custody is a ledger, not a cache.
export const createCustodyStore = () => {
  const byId = new Map();          // capture id → capture
  const byPin = new Map();         // payload_sha256 → capture id

  const hold = (capture) => {
    if (!admissible(capture)) return { held: null, fresh: false, reason: 'inadmissible' };
    const prev = byPin.get(capture.payload_sha256);
    if (prev && byId.has(prev)) return { held: byId.get(prev), fresh: false, reason: 'already-held' };
    byId.set(capture.id, capture);
    byPin.set(capture.payload_sha256, capture.id);
    return { held: capture, fresh: true, reason: null };
  };
  const get = (id) => byId.get(id) || null;
  const byPayload = (sha) => { const id = byPin.get(String(sha || '').toLowerCase()); return id ? byId.get(id) : null; };
  const all = () => [...byId.values()];

  return { hold, get, byPayload, all };
};
