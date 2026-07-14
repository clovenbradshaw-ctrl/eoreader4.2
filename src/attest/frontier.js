// EO: NUL·SIG·EVA(Void,Entity → Void,Entity,Lens, Clearing,Dissecting,Binding,Tracing) — the preservation frontier
// Selective preservation (docs/attestation-spec.md §8). We do not preserve everything — we
// preserve the salient, and we LOG THE DECISION. This is the section an adversary attacks, so it
// is the one that has to be strongest, and its strength is a single idea: the selection leaves a
// trace. A NUL'd span is not absent from the tape; it is present as an ADDRESS and a DECISION —
// its amplitude, its phase, the seed that decided, and the reason (§8.3).
//
// Four fates for a span, not two (§8.3): collapsed, rejected-for-cause, encountered-and-passed,
// never-reached. The third is where the honesty lives, the fourth where the residual risk lives.
//
// The gate is SEEDED and probabilistic (§8.6). A hard threshold is tunable to taste — set it at
// 0.5 and inconvenient material falls below it, and nobody, including you, can prove the cutoff
// wasn't chosen to produce the corpus you wanted. A seeded gate cannot be tuned this way: the
// misses are the sampler's, drawn reproducibly from a seed that is in the ledger, so bias toward
// missing what you'd rather not find is impossible. And because the frontier carries the seed and
// the scores, a critic can RE-RUN THE GATE (§8.5) — the ablation, promoted to a public instrument,
// which converts "you preserved only what fit your story" from an insinuation into a testable claim.
//
// Pure and deterministic: no Math.random (the draw is a hash of seed+address), no clock (times are
// the caller's). Salience amplitude is computed upstream (surfer/salience.js) and passed in.

// ── the preservation tiers (§8.2) ────────────────────────────────────────────────
export const PRESERVATION_TIERS = Object.freeze({
  collapsed: 'collapsed',          // entered the tape: full custody + witness + attest + anchor + watch
  'near-miss': 'near-miss',        // high amplitude, did not collapse: witness WITHOUT custody (fire SPN)
  encountered: 'encountered',      // NUL'd: address + amplitude + phase + seed. no bytes, no witness
  'never-reached': 'never-reached',// outside the crawl: only the envelope (§8.7)
});

// ── the seeded probabilistic gate (§8.6) ─────────────────────────────────────────
// A deterministic [0,1) draw from the crawl seed and the span's address — same seed + same address
// → same draw, forever. This is the whole bias defense: the misses are not chosen, they are drawn,
// and the draw is reproducible by anyone holding the seed.
const mixU32 = (str) => {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d) >>> 0; h ^= h >>> 15; h = Math.imul(h, 0x846ca68b) >>> 0; h ^= h >>> 16;
  return h >>> 0;
};
export const unitDraw = (seed, address) => mixU32(`${seed}:${address}`) / 4294967296;

// The collapse probability from amplitude and the exploration temperature. temperature 1 → p is
// the amplitude itself; temperature > 1 RAISES low amplitudes (funds the anomaly, §8.7 — explores
// what the field argues against); temperature < 1 sharpens toward the high-amplitude head.
const collapseProb = (amplitude, temperature = 1) =>
  Math.max(0, Math.min(1, amplitude)) ** (1 / Math.max(1e-6, temperature));

// classify({ amplitude, seed, address, temperature, nearMissThreshold }) → { tier, collapsed,
// draw, p }. The gate decision for one encountered span. Collapse iff the seeded draw falls under
// the amplitude-derived probability; a non-collapse at high amplitude is a NEAR-MISS (the tail the
// sampler didn't draw — witness it anyway), a non-collapse at low amplitude is ENCOUNTERED (NUL).
export const classify = ({ amplitude = 0, seed = 'crawl', address = '', temperature = 1, nearMissThreshold = 0.25 } = {}) => {
  const draw = unitDraw(seed, address);
  const p = collapseProb(amplitude, temperature);
  const collapsed = draw < p;
  const tier = collapsed ? 'collapsed' : (amplitude >= nearMissThreshold ? 'near-miss' : 'encountered');
  return { tier, collapsed, draw, p };
};

// ── the frontier record (§8.3) ───────────────────────────────────────────────────
// A NUL'd span, present as an address + a decision. `witness` holds a near-miss SPN job (the
// address preserved against link rot without custody) or null for a bare encounter. `phase` is the
// salience phase; `reason` is why it did not collapse. The id is `h-<n>` in the spec's examples.
export const mkFrontier = ({ id, uri, amplitude = 0, phase = 'neutral', seed = 'crawl', reason = 'below-draw', witness = null, tier = null } = {}) => {
  const fid = String(id || '').startsWith('h-') ? String(id) : `h-${id}`;
  return Object.freeze({
    schema: 'frontier/1', kind: 'frontier',
    id: fid, uri: uri || null,
    amplitude, phase, seed, reason,
    witness,                                          // a near-miss SPN job id, or null
    tier: tier || (witness ? 'near-miss' : 'encountered'),
  });
};

// frontierFromDecision(decision, meta) → a frontier record from a classify() result for a span
// that did NOT collapse. A near-miss carries its witness job; an encounter carries none.
export const frontierFromDecision = (decision, { id, uri, phase = 'neutral', seed = 'crawl', witness = null } = {}) =>
  mkFrontier({ id, uri, amplitude: undefined, phase, seed, reason: decision.tier === 'near-miss' ? 'high-amplitude-missed-draw' : 'below-draw', witness: decision.tier === 'near-miss' ? witness : null, tier: decision.tier });

// ── re-collapse (§8.3) — the frontier is a queue, not a bin ──────────────────────
// A NUL'd address is re-collapsible: when the investigation turns and it becomes salient, it
// collapses THEN, and the tape shows both the original pass and the revision, with dates. Returns
// the re-collapse event referencing the original NUL.
export const recollapse = (frontier, { at = null, amplitude = null } = {}) => Object.freeze({
  schema: 'recollapse/1', kind: 'recollapse',
  from: frontier.id, uri: frontier.uri,
  was: { amplitude: frontier.amplitude, tier: frontier.tier, seed: frontier.seed },
  now: { amplitude: amplitude ?? frontier.amplitude, tier: 'collapsed' },
  at,
});

// ── ablation (§8.5) — a critic re-runs the gate ──────────────────────────────────
// Publish the frontier (addresses + scores, no bytes) and anyone re-runs the salience gate with
// different parameters to see what WOULD have collapsed. Same seed → same draws, so a changed
// collapse set reflects the PARAMETER, not luck. Returns { wouldCollapse, added, dropped } vs the
// original collapse set — the testable answer to "you kept only what fit your story."
export const ablate = ({ records = [], collapsedIds = [], temperature = 1, nearMissThreshold = 0.25 } = {}) => {
  const before = new Set(collapsedIds);
  const wouldCollapse = [];
  for (const r of records) {
    const d = classify({ amplitude: r.amplitude, seed: r.seed, address: r.uri || r.id, temperature, nearMissThreshold });
    if (d.collapsed) wouldCollapse.push(r.id);
  }
  const now = new Set(wouldCollapse);
  return {
    temperature,
    wouldCollapse,
    added: wouldCollapse.filter((id) => !before.has(id)),      // would collapse now, did not before
    dropped: [...before].filter((id) => !now.has(id)),          // collapsed before, would not now
  };
};

// publishFrontier(records) → the publishable projection: addresses and scores, NEVER bytes and no
// custody obligation (§8.5). This is exactly what a critic needs to re-run the gate and diff.
export const publishFrontier = (records = []) => records.map((r) => ({
  id: r.id, uri: r.uri, amplitude: r.amplitude, phase: r.phase, seed: r.seed, reason: r.reason, tier: r.tier,
}));

// ── the crawl envelope (§8.7) — what remains unmeasurable, declared ──────────────
// A page never reached leaves no trace but the envelope: the seeds, domains, depth, and date range
// the crawl bounded itself to. It ships with every published finding so a null result reads as
// "outside my boundary", never "does not exist" (§8.7). Bounding is not enumerating — the unreached
// is an unknown unknown, declared here rather than concealed.
export const mkEnvelope = ({ seeds = [], domains = [], depth = null, date_range = null } = {}) => Object.freeze({
  schema: 'envelope/1', kind: 'envelope',
  seeds: Object.freeze([...seeds]), domains: Object.freeze([...domains]), depth, date_range,
});

const hostOf = (url) => { try { return new URL(url).hostname; } catch { return null; } };

// withinEnvelope(url, envelope) → is this URL inside the declared boundary? Domain membership,
// suffix-matched so a subdomain of a declared domain counts.
export const withinEnvelope = (url, envelope) => {
  const host = hostOf(url);
  if (!host || !envelope) return false;
  return envelope.domains.some((d) => host === d || host.endsWith(`.${d}`));
};

// nullResultReading(url, envelope) → how a null must be read for this URL (§8.7): 'outside-boundary'
// when the crawl never bounded to it (so absence says nothing), 'within-boundary-not-found' when it
// was inside the envelope and still not found (a stronger, but still bounded, negative).
export const nullResultReading = (url, envelope) =>
  withinEnvelope(url, envelope) ? 'within-boundary-not-found' : 'outside-boundary';

// ── EOT signals (§8.3) ───────────────────────────────────────────────────────────
// The frontier NUL line; the full assembly (uri, amplitude, phase, seed, reason, witness) is
// rendered in eot.js.
export const frontierNulSig = (frontierId) => `!NUL frontier.${frontierId}`;
export const frontierEvaSig = (frontierId) => `!EVA frontier.${frontierId}`;
