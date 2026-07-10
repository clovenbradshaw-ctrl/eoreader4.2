// EO: EVA·SIG·SYN·REC(Network,Field → Lens,Network, Binding,Tracing,Composing) — barrel
// perceiver — the PERCEIVER faculty (add-on 2 §A): Existence · constitute. It
// brings the reading into being, constituting structure from the unit stream — the
// first of the cognition triad (perceiver → surfer → enactor), the one the surfer
// then navigates. The three levels of reading and the consciousness that folds them.
// Pure on (doc, cursor/spans); no model in the loop.
//
// The dependency runs ONE way: the surfer rides the perceiver's reading, so this
// face exposes only the perceiver's own currency and reaches into no other faculty.
// Surfing, answerability, sequence/motion readings are the surfer's — import them
// from the surfer's face, not here.
//
//   existenceSurface     level 1 — raw text
//   structureSurface     level 2 — the extracted SEG/CON/SIG/SYN graph
//   significanceSurface  level 3 — prediction + surprise (reading mode)
//   consciousness        the integration the enactor reads
//   readingAt            significance at a single cursor (UI reading mode)

export {
  existenceSurface, structureSurface, figureSurface, namedReferents,
  significanceSurface, consciousness, serializeNotes, serializeEOT,
  composeGroupedNote, NOTE_GROUPS, plainRel,
} from './surfaces.js';
export { readingAt } from './reading.js';
export { significanceSpine } from './spine.js';
export { predictNext } from './predict.js';
export { mutualNearestPairs, discoverEquivalences } from './equivalence.js';
export {
  discoverPropositionEquivalence, attestEquivalenceFrom, mutualNearestPropositions,
  evaluatePropositionPair, propositionText, propositionPolarity,
} from './proposition-equivalence.js';
export { siteRoles, markSites, siteIndices } from './site.js';
export { referentialConfidence, REFERENT_MARGIN } from './referent.js';
// The holonic containment address a referent earns from its span — the nesting the
// flat depth-1 id used to throw away (referent-nesting.js, docs/referent-journey.md).
export { referentNesting, nestingSummary } from './referent-nesting.js';
