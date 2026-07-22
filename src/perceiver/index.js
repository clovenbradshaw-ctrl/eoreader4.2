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
  composeGroupedNote, NOTE_GROUPS, plainRel, rankProperties,
} from './surfaces.js';
export { readingAt } from './reading.js';
// The Lens — the named, addressable selection rule a reading is read under (§1). A Lens
// conditions the three Ground-column prior channels (Void / Field / Atmosphere); every
// reading records its lensId (L2). Carries the two horizon coordinates (gamma, horizon) and
// the optional Atmosphere corpus seed as one object.
export { makeLens, lensId, resolveLens, DEFAULT_LENS, DEFAULT_GAMMA, HORIZONS } from './lens.js';
export { significanceSpine } from './spine.js';
export { predictNext } from './predict.js';
export { mutualNearestPairs, discoverEquivalences } from './equivalence.js';
export {
  discoverPropositionEquivalence, attestEquivalenceFrom, mutualNearestPropositions,
  evaluatePropositionPair, propositionText, propositionPolarity,
} from './proposition-equivalence.js';
export { siteRoles, markSites, siteIndices } from './site.js';
export { referentialConfidence, REFERENT_MARGIN } from './referent.js';
// A figure's perspective — when a referent is a person/agent, the reading as IT holds it:
// its verbatim quotes, its speech acts, and the universe its own words instantiate.
export { perspectiveOf, scanQuotes } from './perspective.js';
// The attribution nest — who is speaking, and through whose mouth. A voice rarely reaches the
// page bare: the narrator reports that a study found that the villagers said the river was
// rising. Reads that Russian nest-doll of attribution — quote / reported-speech / "according
// to" / citation frames, each recursed into its own content, cut where the stack would cycle
// (novels → research → novels) — and derives the outward-in LENS CHAIN a claim is seen through.
export { attributionNesting, nestFrames, attributionChains, innermostBearer, relaysOfPerspective } from './attribution-nesting.js';
// The Rashomon fold — two figures' folds over the same events, and their DIFFERENCE (agree /
// conflict / diverge / each own) as a first-class object. Pure lexical floor (diffPerspectives),
// lifted by the learned same-assertion judgment when a meaning embedder is warm (learnedDiff);
// mergePerspectives unions one figure's fold across sources for the topic-scope diff.
export { diffPerspectives, learnedDiff, mergePerspectives, claimText, claimPhrase, claimPolarity } from './perspective-diff.js';
// The shared claim/figure extractor behind a figure's fold (used by perspective + transmission).
export { claimsFromDoc, figuresFromDoc, foldOfQuotes, parseFold } from './figure-fold.js';
// Idea transmission — a claim traced from one voice into another's, in document time, marking
// where it mutated (an inverted echo). Pure lexical floor + a learned lift; the Rashomon discipline
// pointed at circulation instead of comparison.
export { traceTransmission, transmissionFloor } from './idea-transmission.js';
// A fold against its own past — what changed between two runs of the same comparison or trace, so
// a saved (standing) fold can say what moved since you last looked. Pure (prev, curr) → delta.
export { foldDelta, compareDelta, traceDelta } from './fold-delta.js';
// Fragility — which contested claims are load-bearing: rank the record's disputes by how much of
// the record hangs off the same subject and would fall with it. Pure (claims, contested) → ranked.
export { rankFragility } from './fragility.js';
// Chronology — the order events are TOLD vs. the order they HAPPENED: read the dates the text
// states, order events by story-time, surface where the telling jumps back (flashback). Pure.
export { readDates, buildChronology } from './chronology.js';
// The holonic containment address a referent earns from its span — the nesting the
// flat depth-1 id used to throw away (referent-nesting.js, docs/referent-journey.md).
export { referentNesting, nestingSummary } from './referent-nesting.js';
// nestComposite/nestBoundaries (nest.js) are deliberately NOT re-exported here: nest.js
// reads surfer/index.js (for surfFold) and organs/in/index.js (for createCompositeDoc), and
// both of those already depend on THIS entrance (surf.js -> readingAt, reading-dispatch.js ->
// buildTextReading) — riding this barrel would close the cycle the instant it loads, the same
// hazard the audio/waveform and embed-hash seams record. A caller reads the leaf directly
// (a declared seam in core/seams.js).
// The individuation gate — type every referent by how far it climbed the helix (SIG → INS →
// CON): aggregate coupling per node, read each off the (mass, coupling, agency, INS'd?) plane
// into holon / emanon / protogon / field / void, and log a name binding as a promotion REC.
export { REFERENT_TYPES, couplingByNode, deriveGates, salienceOf, classifyReferent,
         classifyReferents, typeReferents, provisionalId, promotionEvent,
         promoteBoundDescriptors } from './individuation.js';
// The deviation-waveform perceiver contract (docs/omnimodal-waveform.md §2): the
// Reading shape every perceiver emits and the invariant core (src/weave/waveform/)
// validates against before building a WaveformModel. Three of the four
// reference perceivers, so organs/in/reading-dispatch.js can reach them
// through this one entrance. NOT audio/waveform.js: it depends on
// organs/in/acoustic.js (for separateHolons), and organs/in/acoustic.js itself
// depends on organs/ingest (attachReading) which depends on THIS barrel
// (organs/ingest/read.js) — so re-exporting it here would close that cycle the
// instant this barrel is evaluated. reading-dispatch.js reaches it as a
// declared seam (src/core/seams.js) instead.
export { ROLES, validateReading, assertReading } from './contract.js';
export { buildTextReading } from './text/waveform.js';
export { decodeWav } from './audio/wav.js';
export { buildTabularReading } from './tabular/waveform.js';
export { buildBinaryReading } from './binary/waveform.js';
