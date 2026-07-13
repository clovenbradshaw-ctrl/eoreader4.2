// EO: SIG·NUL(Field,Void → Void,Atmosphere, Tending,Clearing) — the pre-verbal felt sense
// The geometry IS the feeling (spec §5). No language model runs here. Every signal is a
// handful of dot products over vectors the fold already computed — negligible cost, run
// continuously. The output is a scalar field, not words:
//
//   drift          1 − cos(anchor, readingCentroid)   — "we've left the topic"
//   concentration  from fold scalars (concentrated/margin/w/top) — "nothing solid underfoot"
//   novelty        cos-distance of this reading from prior-turn readings — "new territory"
//
// `anchor` is the SESSION TOPIC (sense/centroid.js), not the live query — a contentless
// follow-up ("go research that") must not let retrieval wander freely (spec §5). This
// module takes the anchor as an input and never reads engine internals: it operates on a
// normalized FoldSnapshot (see snapshotShape below), so murmur stays decoupled from the
// turn pipeline (spec §3 — "imports no engine internals beyond the event types").

// ── vector primitives ────────────────────────────────────────────────────────
// Self-contained (the codebase has a dozen local `cosine`s; murmur keeps its own so it
// imports nothing from the engine). Tolerant of null / length-mismatch: a missing vector
// is not an error, it is "no geometric signal available".
export const cosine = (a, b) => {
  if (!a || !b || !a.length || !b.length) return null;
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d > 0 ? dot / d : null;
};

export const meanVec = (vecs) => {
  const vs = (vecs || []).filter(v => v && v.length);
  if (!vs.length) return null;
  const dim = vs[0].length;
  const out = new Float32Array(dim);
  for (const v of vs) for (let i = 0; i < Math.min(dim, v.length); i++) out[i] += v[i];
  for (let i = 0; i < dim; i++) out[i] /= vs.length;
  return out;
};

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// ── concentration (spec §5, with the load-bearing caveat) ──────────────────────
// Diffuse evidence is the feel of nothing solid underfoot. But low concentration ALONE
// is not drift: a diffuse corpus whose fold still LOCKS onto an on-topic focus with high
// bayes is fine (worst-movie exchange 1: concentrated:false, w:0.20, but focus locked,
// bayes 0.86–0.93 → do NOT fire). So concentration is reported as a scalar for `unease`
// to weigh LOW, and it never triggers on its own (spec §5, §7).
//   inputs: { concentrated:boolean, margin:0..1, w:0..1, top:0..1, focus:id|null }
// Returns 0..1 where 1 = rock-solid footing, 0 = fully diffuse.
export const concentrationScore = (c = {}) => {
  const parts = [];
  if (typeof c.margin === 'number') parts.push(clamp01(c.margin / 0.3));   // 0.15 margin ⇒ ~0.5
  if (typeof c.w === 'number')      parts.push(clamp01(c.w));
  if (typeof c.top === 'number')    parts.push(clamp01(c.top));
  let score = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0.5;
  // A locked focus with a hard `concentrated` flag lifts the floor — the fold found solid
  // ground even if the corpus was diffuse. This is the exchange-1 exemption.
  if (c.concentrated === true) score = Math.max(score, 0.6);
  if (c.concentrated === false && c.focus == null) score = Math.min(score, 0.35);
  return clamp01(score);
};

// ── the raw geometric signal for one fold snapshot ─────────────────────────────
// snapshotShape (all fields optional except ref):
//   ref:              { turnId, stepName, t }        — what it is about, by reference only
//   query:            string                          — the live query (for deictic detection)
//   anchorVec:        Float32Array|number[]|null      — the SESSION-TOPIC anchor (from centroid.js)
//   readingCentroid:  Float32Array|number[]|null      — centroid of THIS turn's reading …
//   readingVecs:      Array<vec>|null                 — … or the per-stop vectors to average
//   priorCentroids:   Array<{vector,ref}>|Array<vec>  — prior-turn readings (novelty/recognition);
//                        a {vector,ref} record carries the earlier locus, a bare vec is tolerated
//   concentration:    { concentrated, margin, w, top, focus }
//   measuresMeaning:  boolean                          — is cosine meaningful here? (the firewall)
//
// Returns { drift, concentration, novelty, recognitionSim, recognitionRef, readingCentroid,
//           anchor, ref, geometric } where `geometric` is true when drift/novelty came from real
//           vectors, and `recognitionRef` is the LOCUS of the nearest prior reading (or null).
export const senseSignal = (snap = {}) => {
  const ref = snap.ref || null;
  const anchor = snap.anchorVec || null;
  const reading = snap.readingCentroid || meanVec(snap.readingVecs);
  const measures = snap.measuresMeaning !== false;   // default true; false = hash space, no cosine

  const concentration = concentrationScore(snap.concentration || {});

  // drift — the felt distance between what the conversation is ABOUT and where we ARE.
  // Only geometric when both vectors exist in a meaning-measuring space (spec: a cosine in
  // hash space measures nothing). Absent that, drift is null (not zero) — the sense simply
  // has no drift reading this stop, and the register layer will not raise `drift`.
  let drift = null, geometric = false;
  if (measures && anchor && reading) {
    const c = cosine(anchor, reading);
    if (c != null) { drift = clamp01(1 - c); geometric = true; }
  }

  // novelty — how far this reading sits from the nearest prior-turn reading. A spike is
  // "huh, new territory" (spec §5, §7 — SEMANTIC novelty, not token perplexity).
  // recognitionSim is the flip side: near a prior centroid = "seen this before" (§7).
  // recognitionRef names WHICH prior it matched (the argmax locus) — the thread a phase-4
  // recognition link pulls on. A bare-vector prior (old shape) is tolerated but yields no ref.
  let novelty = null, recognitionSim = null, recognitionRef = null;
  if (measures && reading && snap.priorCentroids?.length) {
    let best = null, bestRef = null;   // nearest prior by cosine (null = no comparable prior found)
    for (const p of snap.priorCentroids) {
      const pv = p && p.vector ? p.vector : p;          // {vector,ref} record or bare vector
      const c = cosine(reading, pv);
      if (c != null && (best === null || c > best)) { best = c; bestRef = (p && p.ref) ? p.ref : null; }
    }
    if (best !== null) {
      recognitionSim = clamp01(best);
      novelty = clamp01(1 - best);
      recognitionRef = bestRef;
    }
  }

  return Object.freeze({
    ref,
    drift, concentration, novelty, recognitionSim, recognitionRef,
    readingCentroid: reading, anchor,
    geometric,
  });
};
