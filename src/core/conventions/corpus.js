// EO: REC(Field → Kind, Composing) — corpus conventions as prior
// Inheriting corpus conventions — the HOW a reader brings to a new document.
//
// data/conventions/corpus-relations.json holds the relation-predicate vocabulary harvested
// from the corpus (docs/corpus-conventions.md): which verbs are relation predicates, with
// counts. This turns that file into an `inherit` array for createConventions, so a reader
// can carry "made / went / seemed ARE relation verbs" into a fresh document as a prior.
//
// The effect lands in the recurrence gate (perceiver/parse/pipeline.js): a relation verb met
// only ONCE in a short new document is normally held weak (×0.5 coupling) until it recurs.
// A corpus-attested verb is held FIRM instead — the corpus already watched it bond hundreds
// of times, so the new document need not re-earn it. More real relations therefore survive
// into the graph the generator speaks from. It is OPT-IN: pass the result as
// conventionsOpts.inherit; with no prior the gate is byte-identical. Conventions only — the
// relation vocabulary (the HOW), never any book's content (the WHAT).

export const corpusRelationsInherit = (corpus, { minCount = 4, cap = 50 } = {}) => {
  const verbs = corpus?.relationVerbs || [];
  return verbs
    .filter((v) => v?.via && v.count >= minCount)
    // support = corpus count (capped) so the prior is strong but still defeasible: a
    // document that keeps breaking the bond can still strain it past support.
    .map((v) => ({ kind: 'relation', token: v.via, support: Math.min(v.count, cap) }));
};
