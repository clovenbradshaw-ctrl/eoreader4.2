// EO: EVA·SIG(Field,Link → Lens, Binding,Tending) — term-overlap / polarity checks
// essay/terms.js — the mechanical term reading the gates and ledgers share.
//
// Contradiction and repetition checks must be MEASUREMENTS, not model calls —
// the ledger is consulted on every candidate claim, and a judgment there would
// put a model inside the coherence loop. This is the same offline
// term-overlap/polarity fallback the research driver uses for proposition
// equivalence (research/driver.js), kept local so the essay organ does not
// drag the whole research driver into its import graph. An injected embedder
// path can replace these wholesale (the proposition-equivalence seam); the
// event shapes are identical either way.

import { tok } from '../../perceiver/parse/index.js';

// Open-class terms surviving the perceiver's stop/length filter — the same
// tokens the citation binder scores with (ground/bind.js), so "coheres with
// the ledger" and "binds to a span" speak one vocabulary.
export const termsOf = (text) => [...new Set(tok(String(text ?? '')))];

// Overlap over the smaller set — two claims about the same thing score high
// even when one is terser.
export const termSimilarity = (aTerms, bTerms) => {
  const A = new Set(aTerms), B = new Set(bTerms);
  if (!A.size || !B.size) return { sim: 0, shared: 0 };
  let shared = 0;
  for (const t of A) if (B.has(t)) shared++;
  return { sim: shared / Math.min(A.size, B.size), shared };
};

const NEG = /\b(not|no|never|none|denied|denies|refused|refuses|without|cannot|can't|didn't|doesn't|don't|isn't|aren't|wasn't|weren't)\b/i;
export const polarityOf = (text) => (NEG.test(String(text ?? '')) ? '-' : '+');

export const claimSimilarity = (a, b) => termSimilarity(termsOf(a), termsOf(b));

// The same proposition under opposite polarity — a contradiction. High shared
// vocabulary, flipped negation. Hard fail at the ledger gate.
export const contradicts = (a, b, { simFloor = 0.5, minShared = 2 } = {}) => {
  const { sim, shared } = claimSimilarity(a, b);
  return sim >= simFloor && shared >= minShared && polarityOf(a) !== polarityOf(b);
};

// The same proposition, same polarity — a repeat. Soft fail: dropped or
// compressed, never a section-killer.
export const repeats = (a, b, { simFloor = 0.8, minShared = 3 } = {}) => {
  const { sim, shared } = claimSimilarity(a, b);
  return sim >= simFloor && shared >= minShared && polarityOf(a) === polarityOf(b);
};
