// EO: DEF·EVA·REC(Field → Kind,Paradigm, Dissecting,Binding,Composing) — barrel
// The conventions holon: the learned-rules ledger (REC) and the Pass 0
// induction that fills it before the reading loop runs.

export { createConventions, SEED_SPEECH, SEED_ABBREVIATIONS,
         SEED_COPULA, SEED_MODIFIER, SEED_RELATION_TYPES,
         SEED_PREPOSITION, SEED_AUXILIARY, SEED_ROLE, SEED_FUNCTION, SEED_STARTER,
         SEED_CONJUNCTION, SEED_FIELD_LABEL, SEED_DEMONYM, SEED_CALENDAR,
         SEED_NONPERSON } from './ledger.js';
export { induceAttributionVerbs }  from './induce.js';
// Corpus conventions as an inheritable prior — carry the harvested relation vocabulary (the
// HOW) into a new reading, so a corpus-attested verb met once is held firm, not weak. Opt-in.
export { corpusRelationsInherit } from './corpus.js';
// Packaged English verb morphology — the closed irregular base→past map (the realizer's
// regular rules handle the productive cases). The same kind of curated lexical convention as
// the seed lists above.
export { SEED_IRREGULAR_PAST, SEED_PAST_FORMS } from './english-verbs.js';
