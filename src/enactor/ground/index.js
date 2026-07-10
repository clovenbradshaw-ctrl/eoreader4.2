// EO: CON·EVA(Field,Link,Network → Link,Lens, Binding,Tracing) — barrel
// The ground holon: cite-or-veto. The integrity guarantee.

export { bindCitations, renderBound } from './bind.js';
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
export { classifyProvenance } from './provenance.js';
// Per-SPAN provenance — the answer-grain projection of the type law. Every span the reader
// hovers is grounded EITHER to a source (with the precise line it came from — the jumpable
// "where") OR to the void (the model's own words). So "every span needs to be grounded" is
// a projection, not a restriction: the reader always sees whether a span was read or said.
export { groundSpans, groundSummary } from './spans.js';
// supportVerdict is the answer-grain bind-check the grounding BADGE reads: it turns the span tally
// into an honest "is this actually grounded, or the model's own words wearing a source's passages?"
// decision (SUPPORT_FLOOR). Modality-neutral, so the chat answer path and the text organ share it.
export { supportVerdict, SUPPORT_FLOOR } from './spans.js';
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
export { reflectAnswer, eotLineOf } from './reflect.js';
