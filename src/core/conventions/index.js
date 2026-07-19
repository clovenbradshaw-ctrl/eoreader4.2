// EO: DEF·EVA·REC(Field → Kind,Paradigm, Dissecting,Binding,Composing) — barrel
// The conventions holon: the learned-rules ledger (REC) and the Pass 0
// induction that fills it before the reading loop runs.

// Five registers are LEARN-ONLY now — auxiliary, role, conjunction, nonperson, field-label
// carry no seed (measured 2026-07: the full suite reads identically without them; the
// mechanisms — gravity, cap-rate, construction, symmetry — already cover what they listed).
export { SEDIMENT, SEDIMENT_LANG } from './sediment-en.js';
export { induceLiteracy } from './literacy.js';
export { createConventions, SEED_SPEECH, SEED_ABBREVIATIONS,
         SEED_COPULA, SEED_MODIFIER, SEED_RELATION_TYPES,
         SEED_PREPOSITION, SEED_FUNCTION, SEED_STARTER,
         SEED_DEMONYM, SEED_CALENDAR } from './ledger.js';
export { induceAttributionVerbs, induceAttributionFrames, induceAttributions,
         induceCalendarTokens, induceCalendar } from './induce.js';
// The scale-free slot-induction primitive (slots.js): units → company → slots → lift, one
// operation at every scale and modality. The ledger builds a field from it when handed a token
// stream; a consumer can also use it directly to climb rungs (words → phrases → …).
export { createSlotField, induceSlots, BOUNDARY } from './slots.js';
// Corpus conventions as an inheritable prior — carry the harvested relation vocabulary (the
// HOW) into a new reading, so a corpus-attested verb met once is held firm, not weak. Opt-in.
export { corpusRelationsInherit } from './corpus.js';
// Packaged English verb morphology — the closed irregular base→past map (the realizer's
// regular rules handle the productive cases). The same kind of curated lexical convention as
// the seed lists above.
export { SEED_IRREGULAR_PAST, SEED_PAST_FORMS } from './english-verbs.js';
