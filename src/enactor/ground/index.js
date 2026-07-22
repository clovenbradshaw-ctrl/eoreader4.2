// EO: CON·EVA(Field,Link,Network → Link,Lens, Binding,Tracing) — barrel
// The ground holon: cite-or-veto. The integrity guarantee.

export { bindCitations, renderBound, isFactualClaim, UNSOURCED_MARK } from './bind.js';
export { runVetoes, VETOES, isUnbound, isAbstention } from './veto.js';
// The per-section cite-then-flag the arc reuses (spec-the-arc §5.5): the turn's
// bind+veto guarantee, run at section grain against a cluster's own span set.
export { bindAndVeto } from './section.js';
// Per-proposition grounding provenance — veto on propositional MEANING, not raw spans. Each
// proposition of a response is verbatim (lifted), grounded (its figures stand in the same
// relation a read span asserts), or grounded-to-the-VOID (witnessed by nothing read — it
// rests on the model's own training). Nothing is groundless: void is the ground of last
// resort, named so the surface can raise it. A response can be a mix; the void-grounded
// propositions are the ones a veto flags.
export { classifyProvenance, namedFigures, isContrastiveLoser } from './provenance.js';
// Per-SPAN provenance — the answer-grain projection of the type law. Every span the reader
// hovers is grounded EITHER to a source (with the precise line it came from — the jumpable
// "where") OR to the void (the model's own words). So "every span needs to be grounded" is
// a projection, not a restriction: the reader always sees whether a span was read or said.
export { groundSpans, groundSummary } from './spans.js';
// supportVerdict is the answer-grain bind-check the grounding BADGE reads: it turns the span tally
// into an honest "is this actually grounded, or the model's own words wearing a source's passages?"
// decision (SUPPORT_FLOOR). Modality-neutral, so the chat answer path and the text organ share it.
export { supportVerdict, SUPPORT_FLOOR } from './spans.js';
// groundText composes the span-grounding chain (segment → groundSpans → groundSummary →
// supportVerdict) once, modality-neutrally — the fold summary stands on the same ground as
// a chat answer through it, rather than re-wiring the three steps at each call site.
export { groundText } from './compose.js';
// citationHolds is the per-CITATION honesty gate the render binder reads: below the verbatim floor a
// lexical passage match may stand only if the passage actually WITNESSES the claim (propositional
// correspondence, not shared words), so a citation is never severed from the claim it carries.
export { citationHolds, CITE_VERBATIM } from './spans.js';
// contentTerms is the span module's own content-word read (stopwords stripped) —
// the substantiveness floor the weld's refold signal shares with the witness gate.
export { contentTerms } from './spans.js';
// The reflection: parse the model's OUTPUT back into EOT, compare each proposition with
// the document graph, and judge the groundedness of what the graph holds — counting the
// diverse, independent origins that witness each claim (docs/creative-grounded-modes.md).
export { reflectAnswer, eotLineOf, senseOfModality, witnessesForProps } from './reflect.js';
// The diversity half's other end: are the answer's witnesses MEANINGFULLY DISTINCT? reflectAnswer
// counts independent root origins; this asks whether those origins are really independent VOICES
// (not mirrors, reprints, or the same publisher) and whether they reach two — the "sourced from
// multiple, meaningfully distinct sources" measure that keys the corroboration walk (turn/corroborate.js).
export { registrableHost, witnessDescriptor, sameWitness, distinctVoices,
         distinctWitnessCount, distinctEnough, reflectionWitnesses,
         underCorroborated, corroborationCensus } from './corroboration.js';
// The write-time source gate (docs/archon-source-gate.md). The ARCHON the streaming boundary
// gate consults at each period: a sentence is admitted only when every proposition it asserts is
// grounded in the document AND corroborated by ≥2 distinct witnessing spans (the write-time twin of
// bind+veto — cite-as-you-write, drop the unsourceable).
export { archonReview, buildArchon } from './archon.js';
// The answer weighed by the reader's own reaction (the Born measure): the physics check the
// lexical veto battery cannot make. The reader is asked to REACT to its own draft, and that
// reaction is projected onto a valence basis and put through the Born rule — a positive
// reaction (the good frame holds its squared mass) goes forward, a negative one goes back.
export { assessAnswer, bornAssessment, embeddingAssessment, valenceAtoms, buildAssessmentMessages, SYSTEM_ASSESS } from './validate.js';
// The crosswalk that learns (docs/coreference-timeline.md): a corroborated cross-source synonym
// pair, gated by this holon's own distinctEnough, promoted into a standing engine-tier candidate
// via core/conventions/ledger.js's support/strain register.
export { createSynonymPromotion } from './synonym-promotion.js';
