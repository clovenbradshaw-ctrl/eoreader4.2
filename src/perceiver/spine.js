// EO: EVA·SEG(Network,Field → Field, Tracing) — significance spine / turning points
// The significance spine — the document read at document scale (surfing-next.md §1).
//
// surfFold reasons over a LOCAL reach (±16 around one anchor). That is right for a
// pointed turn, but it starves the whole-document tasks: a "summarize" was handed an
// even STRIDE across the body (retrieve/structural.js), arbitrary lines that happen to
// fall on the stride, not the lines where the document actually turns. The spine fixes
// that with the surf's own scalar, read across the whole text: the cursors of highest
// BAYESIAN surprise — where the reading was rewritten, not where a token merely looked
// odd — are the document's turning points, and those are the skeleton a summary wants.
//
// BOUNDED. readingAt rebuilds its γ-prior from the log each call (O(events)), so reading
// every cursor of a long document is O(units · events). The spine samples on a STRIDE
// sized to a fixed budget, so the cost stays flat regardless of document length — a
// coarse skeleton, honest about its grain (`stride` is returned and logged). A short
// document is read in full (stride 1).
//
// PURE + memoised. The reading is a pure function of the (append-only) log, so the spine
// is computed at most once per document and cached by identity. No embedder, no model —
// it rides the same L3 reading the UI's reading mode and the surf already run.

import { readingAt } from './reading.js';
import { siteIndices } from './site.js';

const DEFAULT_BUDGET = 600;   // at most this many readings, whatever the document length

const cache = new WeakMap();   // doc → spine, keyed by identity (the log is append-only)

const isBlank = (t) => !String(t || '').trim();

// significanceSpine(doc, { budget, k }) → { peaks, stride, sampled, units }
//   peaks    the k cursors of highest Bayesian surprise across the whole document, in
//            reading order — the document's turning points (site/furniture and blanks
//            skipped, the same units retrieval would never offer).
//   stride   the sampling grain (1 = read in full); returned so a caller can report it.
//   sampled  how many cursors were actually read.
//   units    the document length.
export const significanceSpine = (doc, { budget = DEFAULT_BUDGET, k = 12 } = {}) => {
  const units = doc?.units || doc?.sentences || [];
  const S = units.length;
  if (S === 0) return { peaks: [], stride: 1, sampled: 0, units: 0 };

  const memo = cache.get(doc);
  if (memo && memo.budget === budget && memo.k === k) return memo.spine;

  const sites = siteIndices(doc);
  const usable = (i) => !sites.has(i) && !isBlank(units[i]);

  const stride = Math.max(1, Math.ceil(S / budget));
  const sample = [];
  for (let c = 0; c < S; c += stride) {
    if (!usable(c)) continue;
    const r = readingAt(doc, c);
    sample.push({ idx: c, bayes: r?.bayes ?? 0 });
  }

  // The turning points: the strongest surprise across the sample, returned in reading
  // order so the talker reads them as a forward tour, not a ranked list.
  const peaks = [...sample]
    .sort((a, b) => b.bayes - a.bayes)
    .slice(0, k)
    .map(s => s.idx)
    .sort((a, b) => a - b);

  const spine = { peaks, stride, sampled: sample.length, units: S };
  cache.set(doc, { budget, k, spine });
  return spine;
};
