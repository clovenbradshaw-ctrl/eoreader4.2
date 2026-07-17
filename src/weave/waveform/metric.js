// EO: NUL(Field → Field, Tracing) — shared field arithmetic for the waveform core
// Pure vector math the invariant core and every reference perceiver share. Nothing
// here knows what a Field's components MEAN (perceiver-private, contract.js) — it
// only knows how to compare and average them.

// The default metric (Reading.metric may override): 1 − cosine similarity, so
// metric(f,f) ≈ 0 (identical) and two orthogonal fields read 1, two opposed
// fields read 2. Bounded [0,2] — every Born-null call below that reads it on a
// bounded/linear scale (boundedNull, not deriveNull's log/heavy-tail branch).
export const cosineMetric = (a, b) => {
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom <= 1e-12) return 0;               // two zero/near-zero fields: not comparable, not different
  const cos = Math.max(-1, Math.min(1, dot / denom));
  return 1 - cos;
};

// The whole-Reading center — a robust (componentwise-median) estimate so a
// handful of extreme units (a title page, a burst of silence) do not drag the
// background off-centre the way a mean would.
export const robustMean = (fields) => {
  if (!fields.length) return [];
  const dim = fields[0].length;
  const out = new Array(dim).fill(0);
  for (let d = 0; d < dim; d++) {
    const col = fields.map((f) => f[d]).sort((a, b) => a - b);
    const mid = col.length >> 1;
    out[d] = col.length % 2 ? col[mid] : (col[mid - 1] + col[mid]) / 2;
  }
  return out;
};

// A causal EWMA over fields, one componentwise update per step. `reset()` starts
// a fresh estimate at the next `update` (used at a frame boundary, §3.1: the
// rolling estimate resets at frame boundaries, never slides blindly across them).
export const createEwma = (decay = 0.6) => {
  let state = null;
  return {
    update(field) {
      if (!state) { state = field.slice(); return state; }
      const out = new Array(field.length);
      for (let i = 0; i < field.length; i++) out[i] = decay * state[i] + (1 - decay) * field[i];
      state = out;
      return state;
    },
    reset() { state = null; },
    get current() { return state; },
  };
};

// The mean field over [start, end) — the "windowField" of §3.4/§3.1: a small
// neighbourhood's centroid, used both for the frame-boundary novelty curve and
// for echo windows. Clamped to the unit range.
export const windowMean = (units, start, end) => {
  const lo = Math.max(0, start), hi = Math.min(units.length, end);
  const fields = [];
  for (let i = lo; i < hi; i++) fields.push(units[i].field);
  if (!fields.length) return null;
  const dim = fields[0].length;
  const out = new Array(dim).fill(0);
  for (const f of fields) for (let d = 0; d < dim; d++) out[d] += f[d];
  for (let d = 0; d < dim; d++) out[d] /= fields.length;
  return out;
};

// The novelty / departure curve (§3.1's bootstrap, §3.3's change-points, and
// audio's "novelty-kernel boundaries over the self-similarity matrix" — all the
// same computation): at each interior position, how much the window just BEFORE
// differs from the window just AFTER, under the Reading's own metric. Modality-
// blind by construction — the only inputs are `units[i].field` and `metric`.
export const noveltyCurve = (units, metric, half = 3) => {
  const n = units.length;
  const scores = new Array(n).fill(0);
  for (let i = half; i < n - half; i++) {
    const before = windowMean(units, i - half, i);
    const after = windowMean(units, i, i + half);
    if (!before || !after) continue;
    scores[i] = metric(before, after);
  }
  return scores;
};
