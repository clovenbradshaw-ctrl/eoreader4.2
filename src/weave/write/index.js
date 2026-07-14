// EO: INS·CON·SYN·DEF·EVA(Network,Field,Entity → Field,Lens,Network,Void, Making,Composing,Binding,Tracing) — barrel
// write — the GENERATION faculty: the cursor turned forward. (SPEC, the Enacted Writer)
//
// The reading side already runs "the substrate reasons, the model renders"; this is
// that discipline extended to PRODUCTION. The substrate reasons over hashIds, fixes
// structure/identity/ordering/grounding, and draws the self/world line; the model's
// only job is to collapse a locally resolved impression into one fluent surface beat.
//
// The faculty, one holon, whole at its own scale (open src/write/, run its tests,
// swap the backend without touching parse/ or retrieve/):
//
//   fold.js       frontier + integral — the running state, γ-decayed firm dossier (§2)
//   folds.js      Map<Holder, Fold> — beliefOf, modelOf; the nested instrument root (§3,§9,§20)
//   scheduler.js  the DAG + the two gates (arity HARD, resolution SOFT) + posture (§3,§4)
//   cursor.js     the membrane — identity collapses to surface, no hashId leaks (§5)
//   spurt.js      the write loop — render a beat, surf its seam, advance the fold (§6)
//   witness.js    rebind + source veto + the provenance type law (§7)
//   voids.js      the open-Resolution query — the idle fuel + the "Open" ledger (§15,§16)
//   idle.js       the governed idle loop — reafferent, firewalled, self-terminating (§15)
//
// The Streaming Answer (docs/streaming-answer.md) points that same loop at the
// retrieval subgraph, so a grounded answer is realised one streamed sentence per
// surfer stop:
//   plan.js       the span→cell resolver — a surfer stop becomes a cursor cell (§2)
//   frame.js      the piece-grain frame — each beat's site, measured not declared (§8)
//   answer.js     the streaming answer loop — beat per stop, bound by the witness (§4)
//
// The formal event op(Site, Resolution, Provenance, t) and the me-ness type law live
// in the genome (core/event.js, core/provenance.js) because the event vocabulary and
// the self/world line are the system's, not this faculty's.

export {
  createFold, DEFAULT_GAMMA, DEFAULT_KEEP,
} from './fold.js';
export {
  createFolds, INSTRUMENT, READER, STATUS,
  beliefNotation, isModeled, canAnchor, beliefValue,
} from './folds.js';
export {
  schedule, propagateResolution, arityReady, judge, overclaims, groupByGranularity,
} from './scheduler.js';
export { buildCursor, assertNoLeak, serialize } from './cursor.js';
export { witness, rebind, groundedClaim, claimsOf } from './witness.js';
export { openLedger, openResolutions, isOpen, pickVoid, HEDGE_BELOW } from './voids.js';
export { createIdleLoop, seededRng, RESTING, SURFING } from './idle.js';
export { surfToPlan, stopToCell } from './plan.js';
export { frameAt, SITES } from './frame.js';
// The paragraph loop — the answer path's current posture (turn/stages.js llm): the model is
// trusted with the fold's content and answers one paragraph per call; grounding stays
// mechanical and downstream (the binder cites, the fact-checker adjudicates, the veto flags).
export { streamParagraphs, CONTINUE_CUE, firstSentenceOf } from './paragraphs.js';
// Writing is reading backwards — the demonstrable kernel (the holon above is the
// production path). Referring-expression generation by INVERSE coref (emit a pronoun
// only where the reader's field resolves it back to the meant entity — gender
// conformance + γ-activation + distinctness, the reading rules run in reverse), with the
// me-ness/self line (given = perceiver/not-mine; generated = enactor/mine; read back =
// self) and a separate reader-model thread (theory of mind). Concept→traverse→words:
// hold the activated graph as the imagistic concept, traverse it for the order of saying.
export { createReaderModel, writeReferring } from './refer.js';
export { conceptToPlan, speakConcept } from './traverse.js';
// Gender inferred by reading (γ-recency over the committed entities + the lexical gender of
// the pronouns that corefer to them) — not a name table. Silent where the text gives no
// evidence, so the referrer falls back to the name rather than fabricating "it".
export { inferGenders } from './genders.js';
// The phraser → talker hand-off: this engine determines the grounded propositions (content,
// fabrication-incapable); an LLM talker only rewords them fluently, behind a propositional
// veto. phraserBrief packages the determined content; talkThenVerify realises it and strips
// any proposition the talker added that the document does not witness.
export { phraserBrief, realizationPrompt, talkThenVerify, speakTriples } from './brief.js';
// The redaction membrane — the cursor run BACKWARDS (write/redact.js). cursor.js keeps hashIds
// out so the model sees clean names (correctness); this keeps NAMES out so a REMOTE model sees
// only opaque tokens (confidentiality). The talker structures the typed EO graph over tokens;
// de-pseudonymization and the a/an grammar fix run locally after, on the real names it never
// saw. assertNoNameLeak is the mechanical membrane (mirror of assertNoLeak).
// Two carriers: redact() feeds RDF-star (familiar to the model, but only CON/SIG edges + five
// annotations survive); redactEot() feeds native EOT with the notation taught in-message — the
// fuller richness (NUL absence, EVA transitions, SYN, SEG, polarity, the claim register) the
// RDF projection drops. Both share the one membrane (assertNoNameLeak) and the local restore.
export { redact, redactEot, EOT_LEGEND, restore, realizeRestored, fixArticles, buildTable, redactionTable, assertNoNameLeak } from './redact.js';
// The brief as RDF-star: the x→relation→y triple an LLM already knows, annotated with the EO
// richness a flat triple loses — the operator, the site terrain, the resolution band (how
// definitely it holds), the arrow of time, the provenance door. The triple is the fact; the
// eo: annotations are how to say it. EO graph in a notation the model can consume.
export { briefRDF, rdfRealizationPrompt } from './rdf.js';
// Assemble what the LLM would be told: the whole pipeline — thread salience → adaptive surf →
// salient edges → EO-enriched RDF-star → the realization prompt — in one call. Returns exactly
// the system+user the talker would receive, plus the structure behind the selection.
export { assembleBrief } from './assemble.js';
// Thinking is the phraser→talker arc turned INWARD: voice an impression to yourself, read
// your own words back (READ_BACK-of-prior-self), let the hearing re-focus the graph, voice
// again — inner speech as spreading activation, grounded, firewalled (every thought is mine
// and cannot witness), self-terminating. The phraser is the inner voice; no model needed.
export { think, everyThoughtIsMine, worthSayingAloud, resolveVoids, inquire } from './think.js';
// Grammatical encoding (surface only): join adjacent same-subject clauses into one
// sentence with a compound predicate — the standard NLG aggregation move, so the
// generator says "He woke, saw his legs, and turned" rather than three choppy clauses. It
// does not re-inflect verbs or re-decide reference; provenance/self pass through.
export { realize, speak } from './realize.js';
// A grammar rule held and tested — the write-side EVA: apply while it reads back, toggle off
// when it fails. Pronominalisation and aggregation are governed by it, as gender is in coref.
export { createRule } from './eva.js';
// The weight of the turn — the surf's discarded dynamics, broadcast (docs/weight-of-the-
// turn.md): the trajectory lifted into a weighted arc (turns by rewrite magnitude,
// relations by thread salience), the turn voiced as a turn under an eva-governed
// supersession form, and every rendered connective leashed to what the arc actually holds.
export { arcGravity, speakArc, arcLines, turnWeights, connectiveLeash, supersededBetween, predOf, ARC_CUE } from './gravity.js';

// (seam healing) re-exported so the module stays behind the entrance
export { toPast } from './morph.js';
export { buildConceptTokenMap } from './concept-tokens.js';
export { defaultPantheonBank, defaultSiteBank, defaultStanceBanks, dialMultipliers, mountPersonality, resolveOverlap, stanceFamily } from './voice.js';
