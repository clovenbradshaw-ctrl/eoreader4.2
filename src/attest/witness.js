// EO: INS·CON·EVA(Entity → Entity,Link,Lens, Making,Binding,Tracing) — third-party witnesses of a capture
// Witness — "a neutral party saw the same thing at the same time" (docs/attestation-spec.md §4).
// The SECOND attestation function: custody (custody.js) is yours, the witness is theirs, and the
// whole architecture rests on never confusing the two (§0). A witness does not back up your bytes
// — it INDEPENDENTLY re-fetches the URL and co-signs (or diverges from) what it saw. A witness is
// a Lens: one third party's reading of one situation (§9 assembly 2).
//
// This is a SOURCING seam: the core here is pure and offline — it mints witness records and drives a
// fire-and-forget job queue — while the actual HTTP is an injected `client`. The request SHAPES and
// response PARSERS it drives live in wayback.js (the IA protocol seam), re-exported below so the
// witness holon reaches through one entrance. Nothing here holds a credential or reaches the network.
//
// Two services, on purpose (§4.4): Internet Archive and archive.today FAIL FOR DIFFERENT REASONS,
// and two witnesses with uncorrelated failure modes corroborate far better than two with the same
// one. Their diversity is the engine's existing witness currency (core/witness.js makeDiversity):
// two services that both captured are two VOICES → 'corroborated'.

import { makeDiversity } from '../core/index.js';
import { idReplayUrl, parseStatusResponse, newestCdxDigest } from './wayback.js';

// The Wayback/IA request shapes + parsers, re-exported so callers reach them through the witness
// entrance exactly as before (both the no-key flow and the legacy keyed SPN2 path).
export {
  idReplayUrl, waybackToIso,
  saveTriggerRequest, availabilityRequest, parseAvailability, waybackSnapshotUrl, isFreshCapture,
  spnSaveRequest, spnStatusRequest, parseSaveResponse, parseStatusResponse,
  cdxRequest, parseCdxRows, newestCdxDigest,
} from './wayback.js';

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
    replay: fields.replay || null,                 // the id_ RAW-payload replay (span-verify uses this)
    snapshot: fields.snapshot || null,             // the canonical human replay (the citable URL)
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

  // Drive one witness one step. TWO client shapes, and the shape picks the path:
  //   no-key (default) — `{ trigger, available → parseAvailability shape | null, cdx? }`. requested →
  //     (trigger fires GET /save) → queued; queued → (poll available) → success once the fresh closest
  //     lands, filling snapshot + digest. A 429 is RETRYABLE: a throw stays non-terminal so the next
  //     advance() re-attempts (backoff is the client's, §6). `available` → null means "not yet". The
  //     caller flags WITNESS_INCOMPLETE after its own patience (§6 + the span-verify in ladder.js).
  //   legacy keyed — `{ save → {job_id} | null, status → json }`. The SPN2 credential path: save→null
  //     is 'unarchived', a client error settles to 'failed'. Unchanged.
  const noKey = (client) => typeof client?.trigger === 'function' && typeof client?.available === 'function';

  const stepNoKey = async (w, client) => {
    try {
      if (w.status === 'requested') { await client.trigger(w.service, w.url); return withStatus(w, { status: 'queued' }); }
      if (w.status === 'queued') {
        const av = await client.available(w.service, w.url);
        if (!av) return w;                                    // fresh closest not landed yet — keep polling
        let cdx_digest = w.cdx_digest;
        try { if (typeof client.cdx === 'function') cdx_digest = newestCdxDigest(await client.cdx(w.service, w.url)) ?? cdx_digest; } catch { /* digest is best-effort */ }
        return withStatus(w, {
          status: 'success',
          wayback_timestamp: av.wayback_timestamp,
          captured_at: av.captured_at,
          replay: idReplayUrl(av.wayback_timestamp, w.url),
          snapshot: av.snapshot_url,
          cdx_digest,
        });
      }
    } catch { return w; }                                     // 429 / transient — stay non-terminal, retry next advance
    return w;
  };

  const stepKeyed = async (w, client) => {
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

  const step = (w, client) => (noKey(client) ? stepNoKey(w, client) : stepKeyed(w, client));

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
