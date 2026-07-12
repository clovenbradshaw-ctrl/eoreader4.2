// EO: INS·SIG(Void,Entity → Entity,Field, Making,Tending) — the steer event + its bias
// On a Born-rule collapse (steer/collapse.js), murmur appends a STEER event — a thought written
// to push the physics back toward the user's discourse thread (spec §4a). This module builds
// that event and the read side the projection consumes.
//
//   SteerEvent = {
//     kind:"steer",     NOT "assertion"/"claim"/grounded event (spec §9.1)
//     anchor,           the session topic we drifted FROM
//     awayFrom,         the drifted cluster we're pulling AWAY from
//     amplitude,        ψ — how hard to bias
//     phrase,           narrator mutter, for audit legibility only (NEVER prompt content, §9.3)
//     ref, ts, ttl      steer events DECAY — corrections, not permanent truth (spec §4a, §9.7)
//   }
//
// The next projection reads live steer events as a retrieval/fold BIAS TERM: re-weight toward
// `anchor`, down-weight `awayFrom`. That — and only that — is "push the physics back". Because
// the log is the source of truth, the correction lives IN the truth (auditable, replayable),
// not in a hidden side channel.
//
// STEER IS NEVER EVIDENCE (spec §9.2). It biases physics; it is structurally barred from
// citation, grounding, and the answer prompt. The membrane test enforces this.

const asArray = (v) => (v == null ? null : (Array.isArray(v) ? v : Array.from(v)));

// buildSteer({ anchor, awayFrom, amplitude, phrase, ref, ttlMs }, now) → a frozen SteerEvent.
// Vectors are copied to plain arrays so the event is a value, not a live reference into the
// sense's mutating state.
export const buildSteer = ({ anchor, awayFrom, amplitude, phrase = null, ref = null, ttlMs = 45000 } = {}, now = () => Date.now()) =>
  Object.freeze({
    kind: 'steer',
    anchor: asArray(anchor),
    awayFrom: asArray(awayFrom),
    amplitude: typeof amplitude === 'number' ? amplitude : 0,
    phrase: phrase == null ? null : String(phrase),
    ref: ref ? Object.freeze({ turnId: ref.turnId ?? null, stepName: ref.stepName ?? null }) : null,
    ts: now(),
    ttl: ttlMs,
  });

export const isSteer = (e) => !!e && e.kind === 'steer' && Array.isArray(e.anchor ?? []) && typeof e.amplitude === 'number';

// The live, non-expired steer events at time `now` — the projection weights recent/relevant
// events over stale ones, and append-only means a wrong steer is SUPERSEDED, never deleted
// (spec §9.7). Decays by ttl.
export const liveSteers = (events = [], now = Date.now()) =>
  (events || []).filter(e => isSteer(e) && (now - e.ts) < e.ttl);

// steerBias(events, now) → { towardAnchor, awayFromCluster, biasStrength } | null.
// The ONE new reader (spec §10): map live steer events to a retrieval/fold re-weighting. The
// projection's steer consumer calls this; no other component reads steer events. The bias
// strength is the strongest live amplitude, decayed — steer is a WEAK prior on the projection
// (spec §9.6), an explicit user turn dominates it. This function returns the modulation only;
// it deliberately produces NO text, so nothing here can leak into the answer prompt.
export const steerBias = (events = [], now = Date.now()) => {
  const ls = liveSteers(events, now);
  if (!ls.length) return null;
  // Strongest live steer wins the direction; strength decays linearly to zero over its ttl.
  let best = null, bestStrength = -1;
  for (const e of ls) {
    const age = now - e.ts;
    const decayFactor = Math.max(0, 1 - age / e.ttl);
    const strength = e.amplitude * decayFactor;
    if (strength > bestStrength) { bestStrength = strength; best = e; }
  }
  if (!best) return null;
  return Object.freeze({
    towardAnchor: best.anchor,
    awayFromCluster: best.awayFrom,
    biasStrength: bestStrength,   // 0..1 weak prior — the projection must let a user turn dominate
  });
};
