// EO: SEG(Field → Field, Dissecting) — frame/turn detection (docs/omnimodal-waveform.md §3.3)
// Confirmed structural boundaries (Turn) partition the Reading into Frame regions
// that the local-strain baseline resets at. Candidates come from two unioned
// sources — the perceiver's own coarse `segments` and core-detected change-points
// where a GLOBAL rolling baseline shifts — and a candidate is CONFIRMED only once
// its strain_delta clears a Born null derived from the whole population of
// candidates. `boundedNull` (voidnull.js) is the only thing asked to find the
// line; nothing here is a modality-specific detector.
//
// The bootstrap (§3.1): frame detection needs strain, strain needs frames. Pass 1
// computes strain against a GLOBAL rolling estimate — one EWMA that never resets
// — which is exactly the signature a regime change leaves: right after a break
// the global EWMA still reflects the OLD regime, so strain spikes for a few units
// until it catches up. That spike is what finds the frames. Pass 2 recomputes
// strain against those DETECTED frames (a fresh EWMA per frame, reset at each
// start) — this is the final, reported `strain`. Deliberately NOT a loop that
// feeds pass-2's (frame-reset) strain back into boundary detection: resetting a
// baseline at a frame start is exactly what flattens strain there, so re-deriving
// boundaries from it would erase the very break used to define the frame — an
// oscillation, not a fixpoint. Two passes is the whole mechanism; spec's own
// language ("converges in two passes") matches this directly.

import { boundedNull } from '../../core/index.js';
import { createEwma } from './metric.js';

const TOL_DEFAULT = 2;      // suppression radius: two chosen boundaries must sit > tol apart

const median = (xs) => {
  const s = xs.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!s.length) return 0;
  const i = s.length >> 1;
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
};

// The global rolling estimate (never resets) and its strain — pass 1's boundary
// signal. `strain[i] = metric(field[i], the EWMA as it stood BEFORE unit i)` —
// predict, then observe, then update, the same causal order `reading.js` uses
// ("prediction reads only events before the cursor"). Updating before
// comparing would leak the current observation into its own baseline: for two
// anti-parallel regimes of different magnitude that leak can rotate the
// blended baseline onto the NEW regime's own direction, making a real jump
// read as zero strain instead of a spike — measured directly on a synthetic
// two-regime fixture, not a hypothetical.
const computeGlobalStrain = (units, metric) => {
  const ewma = createEwma();
  return units.map((u) => {
    const predicted = ewma.current || u.field;
    const s = metric(u.field, predicted);
    ewma.update(u.field);
    return s;
  });
};

// Local maxima of a score curve, suppressed within `tol` of a stronger neighbour
// — the same discipline voidnull's SEG applies, done here over an arbitrary
// pre-computed curve rather than re-deriving the line first (confirmTurns below
// derives the line once, over every surviving candidate, not per-peak).
const localMaxima = (scores, tol) => {
  const out = [];
  for (let i = 0; i < scores.length; i++) {
    const v = scores[i];
    if (!Number.isFinite(v) || v <= 0) continue;
    let isMax = true;
    for (let j = Math.max(0, i - tol); j <= Math.min(scores.length - 1, i + tol); j++) {
      if (j !== i && scores[j] > v) { isMax = false; break; }
    }
    if (isMax) out.push(i);
  }
  return out;
};

// Merge two ascending index lists, deduping any pair closer than `tol`.
const mergeCandidates = (a, b, tol) => {
  const all = [...new Set([...a, ...b])].sort((x, y) => x - y);
  const out = [];
  for (const c of all) if (!out.length || c - out[out.length - 1] > tol) out.push(c);
  return out;
};

// Confirm candidates as turns: strain_delta must clear a Born line derived from
// the population of ALL candidate deltas (never a constant). `hot` marks the
// top tail — a stricter line, so the render can pick one peak callout without
// treating every confirmed turn as equally salient.
const confirmTurns = (candidates, deltas, { alpha = 0.05, hotAlpha = 0.01 } = {}) => {
  const finite = deltas.filter((d) => Number.isFinite(d) && d > 0);
  const line = boundedNull(finite, { alpha, ceiling: Infinity, fallback: median(finite) });
  const hotLine = boundedNull(finite, { alpha: hotAlpha, ceiling: Infinity, fallback: line });
  const turns = [];
  for (let i = 0; i < candidates.length; i++) {
    const d = deltas[i];
    if (!Number.isFinite(d) || !Number.isFinite(line) || d <= line) continue;
    turns.push({ ordinal: candidates[i], strain_delta: d, hot: Number.isFinite(hotLine) && d > hotLine });
  }
  return { turns, line };
};

// framesFromTurns — partition [0, n) by a sorted, deduped list of confirmed turn
// ordinals. Labels a frame from any perceiver coarse Segment that overlaps it;
// a core-only frame (no overlapping label) renders unnamed (`label: null`).
export const framesFromTurns = (n, turns, coarseSegments) => {
  const bounds = [0, ...turns.map((t) => t.ordinal), n].filter((b, i, a) => i === 0 || b > a[i - 1]);
  const frames = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const start = bounds[i], end = bounds[i + 1];
    const overlap = coarseSegments.find((s) => s.start < end && s.end > start);
    frames.push({ start, end, label: overlap ? overlap.label : null });
  }
  return frames;
};

// computeLocalStrain — per-unit deviation vs. THIS FRAME's own rolling estimate
// (§3.1): a fresh EWMA per frame, reset at every frame start, never sliding
// blindly across a structural boundary the way a whole-document window would.
// This is pass 2 — the strain the WaveformModel actually reports.
export const computeLocalStrain = (units, metric, frames) => {
  const strain = new Array(units.length).fill(0);
  for (const f of frames) {
    const ewma = createEwma();
    for (let i = f.start; i < f.end; i++) {
      const predicted = ewma.current || units[i].field;
      strain[i] = metric(units[i].field, predicted);
      ewma.update(units[i].field);
    }
  }
  return strain;
};

// buildFramesAndTurns — pass 1 (global strain → candidates → confirmed turns →
// frames), pass 2 (local strain under those frames). Returns the frames, turns,
// the final local strain, the turn-confirmation line (for the discard ledger's
// "what null was this measured against"), and a `{passes,stable}` pair — always
// {2,true} here since there is no feedback loop left to destabilize; kept in the
// return shape as the seam for a future refinement pass, not a live mechanism.
export const buildFramesAndTurns = (units, metric, coarseSegments, opts = {}) => {
  const tol = opts.tol ?? TOL_DEFAULT;
  const globalStrain = computeGlobalStrain(units, metric);
  const peakCandidates = localMaxima(globalStrain, tol);
  const coarseStarts = coarseSegments.filter((s) => s.level === 'coarse' && s.start > 0).map((s) => s.start);
  const candidates = mergeCandidates(peakCandidates, coarseStarts, tol);
  const deltas = candidates.map((c) => globalStrain[c] || 0);
  const { turns, line } = confirmTurns(candidates, deltas, opts);
  const frames = framesFromTurns(units.length, turns, coarseSegments);
  const strain = computeLocalStrain(units, metric, frames);
  return { frames, turns, strain, line, passes: 2, stable: true };
};
