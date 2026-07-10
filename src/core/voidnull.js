// EO: DEF·SEG(Field → Void,Field, Clearing,Dissecting,Unraveling) — derived void null (Born)
// The VOID boundary — a derived, online noise null.
//
// The abstention readers (equivalence.js, motion.js) used to take a CONSTANT
// threshold: `minOverlap` / `nullExtent`, a number the caller computed by hand
// (run many noise instances, take the max) and passed in. A constant is a number
// you invent. This module replaces it with a number the signal computes for you.
//
// The rule is one line: a proposed structure must exceed what the void would
// produce on its own, or it is void. The "void" is the field's own non-cohering
// background — the also-ran overlaps, the snow chains, the noise that did not
// cohere. Their scores are samples of what chance produces. The boundary is a
// high quantile of THAT distribution, estimated as the reading proceeds. SYN fires
// when the proposed structure beats the noise null; NUL holds it and VOID asserts
// absence when it does not.
//
// This is the Born rule for the engine. The noise null is the amplitude
// distribution; the quantile is the Born probability; the reading is the
// measurement. The only human input is `alpha`, the tolerated probability of
// mistaking noise for structure — a policy, not an overlap value. The physics
// computes the threshold that delivers it.
//
// Four requirements, each guarding a specific failure (see §4 of the spec):
//
//   • leave-one-out  — estimate a candidate's null from the background EXCLUDING
//     that candidate, so a real shape never has to outrank itself.
//   • extreme-value  — the thing that fools you is the LARGEST chance structure
//     (the longest snow chain), a max over many draws, not a typical draw. The
//     null is the (1-α) bound on the max of N background draws, ≈ μ + z·σ with
//     z = Φ⁻¹((1-α)^(1/N)) — the multiple-comparison / extreme-value correction.
//   • robust to a few real structures — when several real shapes are present they
//     are background to each other and would poison the floor. Fit the null to the
//     BULK (the lower mode), cutting the handful of high outliers at the first gap
//     a noise bulk would almost never produce. A few outliers must not raise the
//     bar for everyone.
//   • causal & adaptive — estimate from the field as read SO FAR, never the whole
//     signal. `createNoiseFloor` accumulates the background as a streaming estimate
//     and the threshold tracks the live noise, drifting as it drifts.
//
// One firing rule, modality-blind, fed a modality-specific score. Audio overlaps
// are bounded fractions (k / partials) — an additive grain, read on a LINEAR scale.
// Video extents are unbounded pixel counts, heavy-tailed under percolation — read
// on a LOG scale so the 35%-snow tail does not defeat the projection. The grain
// (the finest distinction) is DERIVED from each signal's own discretisation — one
// partial out of the query, one pixel of area — never invented.

// ---- math: streaming-friendly moments, robust location, inverse normal CDF ----

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const std  = (xs) => { const m = mean(xs); return Math.sqrt(mean(xs.map(x => (x - m) ** 2))); };
const median = (xs) => {
  if (!xs.length) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  const i = s.length >> 1;
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
};

// Inverse standard-normal CDF (Acklam's rational approximation, |error| < 1.2e-9).
// Turns a Born probability into the number of σ above the mean that delivers it.
const invNormCdf = (p) => {
  if (p <= 0) return -38;
  if (p >= 1) return 38;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pl = 0.02425, ph = 1 - pl;
  let q, r;
  if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p <= ph) { q = p - 0.5; r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
};

// The extreme-value z: how many σ above the bulk mean the max of N chance draws
// reaches at the (1-α) level. P(max of N > μ+zσ) = α  ⇒  Φ(z)^N = 1-α.
// This single term carries both the multiplicity (the ln N from "max of many")
// and the tolerance (the ln 1/α from alpha): the snow case is a max-order-statistic
// problem, and z grows with N precisely so the longest-of-many chain sits AT it.
export const extremeValueZ = (N, alpha) => invNormCdf(Math.pow(1 - alpha, 1 / Math.max(2, N)));

// Below this many background samples the noise floor cannot be known: abstain
// (NUL + VOID), never SYN. Cold start approaches the boundary from below — assume
// nothing until the void is measured. A contaminated bulk (almost all real
// structure, little noise) trips the same guard: a thin background is itself a VOID.
export const MIN_SAMPLES = 4;

// A jump larger than GAP·(bulk spacing) marks the edge of the noise bulk: above it
// sit "a handful of genuine high-scoring structures" (the other octaves), which are
// trimmed so they do not poison the floor. A smooth chance tail (snow at any
// density) has no such gap and is kept whole — exactly why the 35% chain, merely
// the longest of many, stays inside its own null and fires VOID.
const GAP = 2.5;

// ---- the derived null ------------------------------------------------------

// Estimate the noise null from a background of structure scores.
//
//   background  the also-ran scores (samples of what chance produces)
//   scale       'linear' (bounded scores, e.g. overlaps) | 'log' (heavy-tailed
//               positive scores, e.g. pixel extents under percolation)
//   alpha       tolerated false-positive rate; the quantile is 1-α
//   N           the competition size for the extreme-value correction (how many
//               chance structures the max is taken over). Defaults to the sample count.
//   grain       the finest meaningful difference in the score's own units (derived
//               from the signal's discretisation); floors the projection so a single
//               quantisation step above a flat bulk is not mistaken for structure.
//   leaveOut    a candidate score to exclude (leave-one-out) before estimating.
//
// Returns the threshold a proposed structure must EXCEED to fire SYN. Returns
// Infinity to abstain (cold start / thin background) — the engine then holds NUL
// and asserts VOID rather than forcing a SYN off a null it cannot trust.
export const deriveNull = (background, { scale = 'linear', alpha = 0.01, N, grain = 0, leaveOut = null } = {}) => {
  let xs = background.filter(x => Number.isFinite(x) && (scale !== 'log' || x > 0));
  if (leaveOut != null) {
    const i = xs.findIndex(x => Math.abs(x - leaveOut) < 1e-12);
    if (i >= 0) xs.splice(i, 1);
  }
  if (xs.length < MIN_SAMPLES) return Infinity;          // cold start → abstain

  const n = N || xs.length + 1;
  const z = extremeValueZ(n, alpha);
  const toW   = scale === 'log' ? Math.log : (x) => x;   // work in the modality's natural scale
  const fromW = scale === 'log' ? Math.exp : (x) => x;
  const w = xs.map(toW).sort((a, b) => a - b);

  // Cut the bulk at the first gap a noise bulk would not produce, fitting only the
  // lower mode so a few real structures (the other octaves) do not raise the bar.
  const m = median(w);
  const lowDev = w.filter(x => x <= m).map(x => m - x);   // one-sided spread, immune to upper outliers
  const seedFloor = scale === 'log'
    ? (grain > 0 ? Math.log(1 + grain / Math.max(median(xs), grain)) : 1e-9)
    : grain;
  const seed = Math.max(mean(lowDev) * 1.2533, seedFloor, 1e-9);
  let cut = w.length;
  for (let i = Math.floor(w.length / 2); i < w.length - 1; i++) {
    if (w[i + 1] - w[i] > GAP * seed) { cut = i + 1; break; }
  }
  const bulkW = w.slice(0, Math.max(cut, Math.ceil(w.length / 2)));   // always keep ≥ the lower half
  if (bulkW.length < MIN_SAMPLES) return Infinity;       // contaminated/thin bulk → abstain

  const bulkLin = bulkW.map(fromW);
  // The extreme-value projection on the working scale catches heavy tails (35% snow);
  // the linear-grain projection floors it so a flat low-density bulk is not mistaken
  // for structure yet a faint real shape still clears. The boundary is the max.
  const projection = fromW(mean(bulkW) + z * std(bulkW));
  const grainFloor = mean(bulkLin) + z * grain;
  return Math.max(projection, grainFloor);
};

// ---- DEF: how many readings the field's geography holds ------------
//
// eigenLenses ranks a field's readings by Born weight, but HOW MANY readings the
// field actually holds is not a universal constant — it is a property of the
// spectrum's own shape. A flat spectrum (isotropic noise, a single register, a
// collinear field) holds ONE reading; a spectrum with a real elbow holds as many
// readings as sit above it. The two hand-rolled rules both fail: "top lenses to 90%
// Born mass (cap 12)" saturates the cap on any spread spectrum (every reading
// flickers, over-segmenting), and "eigenvalues above the void floor" over-abstains on
// a flat-but-high-rank spectrum (many near-equal readings read as noise).
//
// This finds the count the same way the void finds any structure — but pointed at the
// GAP spectrum, not the eigenvalues. The reading count is the elbow: the largest
// eigenvalue drop, kept only if it exceeds what the gaps' own background would produce
// by chance. Gap-spacings are heavy-tailed order statistics, so the void reads them on
// the LOG scale (deriveNull's percolation setting). No significant gap → the spectrum
// is flat → k=1 and abstain (assert one reading, no internal boundary), so the SAME
// test that counts the readings also yields the abstention. The count "generates" where
// structure is found and "dissipates" to one where it is not — no universal segmenter,
// a geography-derived one. The Born assignment on top of the k lenses stays universal.
//
//   eigenvalues  the Born spectrum, descending (eigenLenses(rho).map(l => l.weight)).
//   alpha        tolerated false-elbow rate (default 0.05).
//   maxK         cap on the returned count (default 12).
//   window       how many leading eigenvalues to weigh the elbow over (default 20).
//
// Returns { k, gap, floor, abstain }. Pure on its input — reads no module state and
// never mutates the array (parity: same spectrum, same reading count, forever).
export const DEF = (eigenvalues, { alpha = 0.05, maxK = 12, window = 20 } = {}) => {
  const ev = (eigenvalues || []).filter(Number.isFinite);
  if (ev.length < 2) return { k: ev.length, gap: 0, floor: null, abstain: true };
  const lim = Math.min(ev.length, Math.max(2, window | 0));
  const gaps = [];
  for (let i = 1; i < lim; i++) gaps.push(ev[i - 1] - ev[i]);   // descending → gaps ≥ 0
  let kGap = 1, maxGap = -Infinity;
  for (let i = 0; i < gaps.length; i++) if (gaps[i] > maxGap) { maxGap = gaps[i]; kGap = i + 1; }
  const floor = deriveNull(gaps, { scale: 'log', alpha, N: gaps.length, leaveOut: maxGap });
  // A cleared gap is a drop BETWEEN a top group and the tail — by construction that is
  // at least two distinguishable reading groups, so a significant elbow reads ≥2. A flat
  // spectrum clears nothing and abstains to one reading. (The min-2 only ever applies on
  // the structure branch; noise never reaches it.)
  if (Number.isFinite(floor) && maxGap > floor)
    return { k: Math.max(2, Math.min(maxK, kGap)), gap: maxGap, floor, abstain: false };
  return { k: 1, gap: Number.isFinite(maxGap) ? maxGap : 0, floor: Number.isFinite(floor) ? floor : null, abstain: true };
};

// ---- the bounded-signal boundary: a per-decision Born line -----------------

// deriveNull's extreme-value bound answers "what is the MAX of N chance draws" —
// the longest-snow-chain question. It is calibrated for UNBOUNDED, heavy-tailed
// scores (pixel extents under percolation) or fine-grained counts, where a real
// structure can tower arbitrarily over the noise. Pointed instead at a BOUNDED
// signal — a cosine in [-1,1], an overlap FRACTION in [0,1], read at a coarse
// grain (a few tokens) — that same bound overshoots the signal's own ceiling:
// z·grain alone can exceed 1, so nothing ever clears it and every real match is
// rejected. (Measured: a 27-cell centroid blob derives a line > 1.0; a 2-token
// confirm needs a fraction > 1.0. The Born rule, misapplied, reads VOID forever.)
//
// The fix keeps the Born rule but reads the line as a SINGLE decision against the
// noise, not the max of many: N=2 (this draw vs one chance draw), the minimal
// multiple-comparison. The boundary is then the bulk's own (1-α) upper bound —
// "just above what a typical chance value reaches" — robust to the handful of real
// matches the bulk-fit trims. When even that cannot land below the signal's
// structural `ceiling` (the bound is degenerate: cold start, a contaminated bulk,
// or a grain too coarse to resolve a boundary at all), fall back to the caller's
// constant. The physics sets the line wherever the background can support one; the
// constant holds only at the edge it cannot. This is the bounded-signal complement
// to deriveNull, for the relation-cosine and token-overlap floors.
export const boundedNull = (background, { alpha = 0.05, leaveOut = null, grain = 0, ceiling = 1, fallback } = {}) => {
  const line = deriveNull(background, { scale: 'linear', alpha, N: 2, grain, leaveOut });
  return (Number.isFinite(line) && line < ceiling) ? line : fallback;
};

// ---- SEG: the change-point complement to boundedNull -----------------
//
// A boundary detector reads a per-position score CURVE — a departure (relEntropy),
// an incommensurability (commutator norm), any streaming change signal — and must
// answer WHERE the real cuts are. The two failure modes are symmetric: a fixed
// threshold either floods the curve with noise peaks or rejects every real one. This
// reads the curve against the void instead: keep the LOCAL maxima that clear the
// bounded per-decision line (boundedNull — a change-point score is a bounded departure,
// not a heavy tail, so it takes the N=2 Born line, never the log-tail bound), then
// suppress any two chosen peaks within `tol` so one boundary is not counted twice.
// boundedNull sets the line; SEG reads the curve against it. Pure — no state.
//
//   scores   the per-position score curve (non-finite / ≤0 entries are ignored).
//   alpha    the bounded-void tolerance (default 0.05).
//   tol      the suppression radius: chosen peaks sit > tol apart (default 1).
//   indices  optional positions to report instead of array indices (e.g. a windowed
//            score that starts at offset W maps peak k → indices[k]).
//
// Returns the chosen peak positions, ascending. Empty when the background is too thin
// to derive a line (cold start) — abstain rather than cut on an untrusted floor.
export const SEG = (scores, { alpha = 0.05, tol = 1, indices = null } = {}) => {
  const at = (k) => (indices ? indices[k] : k);
  const vals = [];
  for (const s of scores) if (Number.isFinite(s) && s > 0) vals.push(s);
  if (vals.length < MIN_SAMPLES) return [];
  const line = boundedNull(vals, { alpha, ceiling: Infinity, fallback: median(vals) });
  if (!Number.isFinite(line)) return [];
  const rad = Math.max(1, tol | 0);
  const cand = [];
  for (let k = 0; k < scores.length; k++) {
    const v = scores[k];
    if (!Number.isFinite(v) || v <= line) continue;
    let isMax = true;
    for (let j = Math.max(0, k - rad); j <= Math.min(scores.length - 1, k + rad); j++)
      if (j !== k && Number.isFinite(scores[j]) && scores[j] > v) { isMax = false; break; }
    if (isMax) cand.push({ i: at(k), v });
  }
  cand.sort((a, b) => b.v - a.v);
  const chosen = [];
  for (const c of cand) if (chosen.every((x) => Math.abs(x - c.i) > tol)) chosen.push(c.i);
  return chosen.sort((a, b) => a - b);
};

// ---- the streaming estimator: causal, adaptive, updated each step ----------

// Maintain the background score distribution as a streaming estimate. `observe`
// each non-cohering score as the reading proceeds; `threshold` reads off the
// derived null from the field SO FAR (leaving out the candidate under test). The
// boundary tracks the live noise and drifts as the noise drifts — precision
// adaptation, the engine setting its own gain from its own running sense of normal.
export const createNoiseFloor = ({ scale = 'linear', alpha = 0.01, grain = 0, N = null } = {}) => {
  const samples = [];
  return {
    observe(score) { if (Number.isFinite(score)) samples.push(score); return this; },
    observeAll(scores) { for (const s of scores) this.observe(s); return this; },
    get count() { return samples.length; },
    samples() { return samples.slice(); },
    // The derived boundary at the current cursor. `leaveOut` excludes the proposal
    // under test; `N` overrides the competition size for this read.
    threshold({ leaveOut = null, N: n = N } = {}) {
      return deriveNull(samples, { scale, alpha, N: n, grain, leaveOut });
    },
    // SYN iff the proposed structure beats what the void would produce by chance.
    beats(s, opts = {}) { return s > this.threshold(opts); },
  };
};
