// EO: SEG·EVA(Field → Field,Lens, Dissecting,Tracing) — the SEG cut
// predict/segment.js — the SEG cut, learned from the note grain's own surprise.
//
// The grain-nested predictor (grained.js) took phrase boundaries as INPUT. Finding
// them is the SEG problem — the Existence→Structure cut — and the README's claim
// is that the signal marks them itself: "predicting the next position and being
// surprised when it deviates marks the frame the shape turned." A first attempt
// at a flat surprise threshold over-fired badly (24 phrases for 8): a cold model
// is surprised everywhere, not only at boundaries, so a fixed cutoff turns a
// plateau of newness into a crowd of false cuts.
//
// This derives the cut the way the void-boundary does (scripts/void-boundary.mjs,
// read/voidnull.js): the threshold is a READOUT the signal computes from its own
// surprise background — a high quantile — and the only number a human states is
// ALPHA, the tolerated rate of mistaking ordinary newness for a boundary. Two more
// signal-derived guards turn the plateau into peaks:
//
//   · a boundary is a LOCAL PEAK in surprise, not merely a high value — the rise
//     marks the discontinuity, the plateau does not;
//   · a minimum phrase length (minGap) — two cuts cannot sit on top of each other,
//     because a phrase has extent (the same "a shape has extent" coherence the
//     video reader uses to tell a blob from snow).
//
// Pure over the surprise series; no model call beyond the note grain already run.

import { predictiveSequenceReading } from '../../surfer/sequence.js';

// The high quantile of a value list — the signal's own background level. `q` in
// [0,1]; q = 1 − alpha is "the level only an alpha-fraction of surprises exceed".
const quantile = (xs, q) => {
  if (!xs.length) return Infinity;
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))));
  return s[i];
};

// Learn boundaries from a per-step surprise series ([{at, surprise}], at ascending
// and contiguous). Returns sorted unique phrase-START indices, always including 0.
//   alpha  — tolerated false-cut rate; the threshold is the (1−alpha) quantile of
//            the signal's OWN surprise. Smaller alpha → fewer, surer cuts.
//   minGap — the minimum phrase length; a peak within minGap of the last accepted
//            cut is suppressed (the stronger peak wins).
export const learnBoundariesFromSurprise = (series, { alpha = 0.25, minGap = 2 } = {}) => {
  if (!series.length) return [0];
  const at = series.map((s) => s.at);
  const sv = series.map((s) => s.surprise);
  const threshold = quantile(sv, 1 - alpha);

  // candidate local peaks at or above the signal-derived threshold
  const peaks = [];
  for (let k = 0; k < sv.length; k++) {
    const v = sv[k];
    if (v < threshold) continue;
    const leftOk = k === 0 || sv[k - 1] <= v;
    const rightOk = k === sv.length - 1 || sv[k + 1] <= v;
    if (leftOk && rightOk) peaks.push({ at: at[k], v });
  }

  // greedily accept peaks strongest-first, enforcing the minimum phrase length —
  // so the tallest cut in a neighbourhood wins and no two cuts crowd. Seeded with
  // the 0 start, so the opening phrase is also at least minGap long (no degenerate
  // length-1 phrase right after the start).
  peaks.sort((a, b) => b.v - a.v);
  const accepted = [0];
  for (const p of peaks) {
    if (accepted.every((q) => Math.abs(q - p.at) >= minGap)) accepted.push(p.at);
  }
  return [...new Set(accepted)].sort((a, b) => a - b);
};

// Convenience: learn boundaries straight off a music doc (runs the note grain).
export const learnBoundaries = (doc, { order = 2, alpha = 0.25, minGap = 2 } = {}) => {
  const steps = predictiveSequenceReading(doc, { order });
  return learnBoundariesFromSurprise(steps.map((s) => ({ at: s.at, surprise: s.surprise })), { alpha, minGap });
};

// Score learned boundaries against a known truth, matching within ±tol positions.
// Precision/recall/F1 over the cuts (the 0 start is excluded — it is not a learned
// decision). A clean readout of how well the SEG cut was recovered.
export const segmentationScore = (found, truth, { tol = 1 } = {}) => {
  const f = found.filter((x) => x > 0);
  const t = truth.filter((x) => x > 0);
  const usedT = new Set();
  let tp = 0;
  for (const c of f) {
    const m = t.findIndex((x, i) => !usedT.has(i) && Math.abs(x - c) <= tol);
    if (m >= 0) { tp++; usedT.add(m); }
  }
  const precision = f.length ? tp / f.length : 0;
  const recall = t.length ? tp / t.length : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  const round = (x) => Math.round(x * 1000) / 1000;
  return { precision: round(precision), recall: round(recall), f1: round(f1), tp, found: f.length, truth: t.length };
};
