// EO: SEG·SIG·DEF(Field,Network → Field,Lens,Paradigm, Clearing,Dissecting) — segment by significance
// The one segmentation operator, named — docs/segment-by-significance.md.
//
// There are no hard rules — only signals measured against their own noise null, at
// whatever grain the caller reads at. Both arms of this already existed, unnamed,
// scattered across callers that each reinvented a threshold:
//
//   the cut arm    — voidnull.js SEG(scores, {alpha, tol}): a per-position score curve,
//                    keep the local maxima that clear the bounded (N=2) Born line.
//   the group arm  — spectral.js buildDensity → eigenLenses, voidnull.js DEF(eigenvalues):
//                    how many communities a set of vectors' density operator holds, derived
//                    from a null-gated eigen-gap, never a caller-hardcoded count.
//
// This module adds nothing mathematically — it is the public face docs/segment-by-
// significance.md §6.1 calls for, so a caller reaching for "the segmentation primitive"
// finds one place regardless of whether the case is a curve (segmentCurve) or a graph/
// community (segmentGroups), and a third case neither arm covers alone: a per-unit
// dominant-group ASSIGNMENT stream, where the group switch itself needs the same
// null-gating a score-curve peak gets (segmentSwitches) instead of a fixed run-length
// rule. No behaviour change to SEG/DEF/buildDensity/eigenLenses themselves.

import { SEG, DEF, boundedNull } from './voidnull.js';
import { buildDensity, eigenLenses } from './spectral.js';

// ---- the cut arm: segment a 1-D score curve -------------------------------------
//
// Direct pass-through to SEG (voidnull.js) — named here so a caller does not need to
// know the curve case lives in voidnull.js versus the graph case in spectral.js.
export const segmentCurve = (scores, opts = {}) => SEG(scores, opts);

// ---- the group arm: how many communities, and which one each unit is in --------
//
//   vectors   equal-length per-unit activations (a cast profile, an operator profile,
//             any basis — buildDensity is basis-agnostic).
//   weights   optional per-vector salience (default 1, passed through to buildDensity).
//   opts      { alpha, maxK, window } passed to DEF; the group count is DERIVED from
//             the eigen-gap, never supplied by the caller as a fixed k.
//
// Returns { k, abstain, gap, floor, lenses, assign, score }. `k`/`abstain`/`gap`/`floor`
// are DEF's own fields verbatim (k=1, abstain=true on a flat spectrum — one reading,
// not an arbitrary split). `lenses` is the retained top-k eigen-lenses (Born-ranked).
// `assign(vector)` returns the lens index that vector expresses with maximal Born
// probability |⟨lens|v⟩|² among the retained k — the same rule SIG uses, inlined so a
// caller iterating many vectors against a fixed lens set need not re-import spectral.js.
// `score(vector)` returns { dom, top1, top2 } — the winning lens, its Born probability,
// and the runner-up's — the switch-confidence signal segmentSwitches needs; a vector
// with only one candidate lens gets top2=0 (a switch into a one-lens field is always
// maximally confident, correctly).
export const segmentGroups = (vectors, weights = null, opts = {}) => {
  const { rho } = buildDensity(vectors, weights);
  if (!rho.length) return { k: 0, abstain: true, gap: 0, floor: null, lenses: [], assign: () => -1, score: () => ({ dom: -1, top1: 0, top2: 0 }) };
  const all = eigenLenses(rho);
  const { k, gap, floor, abstain } = DEF(all.map((l) => l.weight), opts);
  const lenses = all.slice(0, k);
  const rank = (v) => {
    let top1 = -Infinity, top2 = -Infinity, bi = 0;
    for (let l = 0; l < lenses.length; l++) {
      let c = 0; for (let j = 0; j < v.length; j++) c += v[j] * lenses[l].lens[j];
      const p = c * c;
      if (p > top1) { top2 = top1; top1 = p; bi = l; } else if (p > top2) { top2 = p; }
    }
    return { dom: lenses.length ? bi : -1, top1: lenses.length ? top1 : 0, top2: Number.isFinite(top2) ? top2 : 0 };
  };
  return { k, abstain, gap, floor, lenses, assign: (v) => rank(v).dom, score: rank };
};

// ---- the switch arm: is a dominant-group CHANGE a real boundary? ---------------
//
// A per-unit best-group assignment (segmentGroups().score, run over a document's
// units) proposes a switch every time the best group changes. Cutting on every
// proposed switch unconditionally floods short/noisy spans with boundaries; a fixed
// run-length floor (absorb any run shorter than N) is a hand-set constant, the thing
// this whole module exists to replace. Instead: read the switch's own DECISIVENESS —
// the Born-probability margin its winner beat the runner-up by, top1−top2, a purely
// local "how confidently was this unit assigned" signal independent of run history —
// and gate it against the void the reading's OWN candidate switches produce, the same
// discipline SEG applies to a score-curve peak.
//
//   raw       per-unit { dom, top1, top2 } from a full group search (segmentGroups().
//             score) — dom the best-scoring group (or -1, no signal at this unit),
//             top1/top2 its winning and runner-up Born probabilities.
//   opts.alpha    the bounded-void tolerance (default 0.05), passed to boundedNull.
//   opts.minRun   the cold-start fallback: with too few candidate switches to derive a
//                 line (< MIN_SAMPLES), a switch is accepted unless it would leave a run
//                 shorter than minRun — boundedNull's own "the constant holds only at
//                 the edge the physics cannot reach" (voidnull.js), not a parallel rule.
//
// Returns the resolved per-unit group assignment: every accepted switch starts a new
// run; every rejected one CARRIES the prior run's group forward (the `carry` idiom —
// a rejected switch is not a boundary, not an error, a held superposition resolved by
// staying with what came before). No signal at a unit (dom=-1) always carries.
export const segmentSwitches = (raw, { alpha = 0.05, minRun = 3 } = {}) => {
  const n = raw.length;
  const out = new Array(n).fill(-1);
  if (!n) return out;

  // Pass 1 — propose: every position where dom differs from the currently-carried
  // group is a candidate switch; its margin (top1−top2) is purely local, so this pass
  // needs no run-state beyond "what group is currently carried."
  let group = null;
  const candidates = [];   // { i, margin }
  for (let i = 0; i < n; i++) {
    const { dom, top1, top2 } = raw[i];
    if (dom === -1) continue;
    if (group === null) { group = dom; continue; }   // first signal — always instantiates
    if (dom !== group) { candidates.push({ i, margin: Math.max(0, top1 - top2), dom }); group = dom; }
  }

  // Pass 2 — gate: derive the line from ALL candidate margins (leave-one-out per
  // candidate); defer to the minRun rule only where the void cannot be measured.
  const margins = candidates.map((c) => c.margin);
  const gated = new Map();   // i → true | false | null (defer)
  for (const c of candidates) {
    const line = boundedNull(margins, { alpha, ceiling: 1, leaveOut: c.margin, fallback: NaN });
    gated.set(c.i, Number.isFinite(line) ? c.margin > line : null);
  }

  // Pass 3 — resolve: re-walk, applying the gated decisions (with the minRun fallback
  // for deferred ones), carrying the previous run's group across every rejected
  // switch and every no-signal unit.
  group = null;
  let lastStart = 0;
  for (let i = 0; i < n; i++) {
    const { dom } = raw[i];
    if (dom === -1) { out[i] = group ?? -1; continue; }
    if (group === null) { group = dom; lastStart = i; out[i] = group; continue; }
    if (dom === group) { out[i] = group; continue; }
    const decision = gated.get(i);
    const accept = decision === null ? (i - lastStart >= minRun) : decision;
    if (accept) { group = dom; lastStart = i; out[i] = group; }
    else out[i] = group;   // absorbed — carry
  }
  return out;
};
