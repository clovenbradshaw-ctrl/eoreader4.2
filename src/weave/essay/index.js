// EO: SYN·CON·EVA·DEF(Field,Network,Link → Network,Link,Lens, Composing,Binding,Making) — barrel
// essay — coherent longform as a projection over an append-only event log
// (docs/longform-generation.md).
//
// The essay organ, rebuilt on the deep-research pattern: commitments before
// prose. The spine (a DAG of section intents) holds the shape; the carry (a
// small chunk: thesis, terminal claim, open threads, claim ledger) crosses
// each doorway; the log holds everything else, re-illuminated on demand. Per
// section: explore candidate claims cheaply, consolidate by bind and veto,
// render one prose pass from the survivors — gated for coherence, with
// bounded spine revision as the mechanism rather than the exception. The
// live panel is a fold over the generation's own event stream; progress is
// the state of the commitment graph, never a percentage.
//
// Sits beside src/longgen/ (the autoregressive closure) and src/research/
// (deep research): three projections over the same discipline.

export {
  EKIND, REVISE_OPS, FINDING_KINDS,
  planDrafted, sectionEntered, depRelit, spansLit, claimProposed, claimBound,
  candidateVetoed, threadOpened, threadPaid, threadDeferred, spineRevised,
  sectionAccepted, carryCheckpoint, reconcileFinding,
} from './events.js';

export {
  SECTION_STATES, SECTION_MODALITIES, SEAM_MODALITIES,
  makeSection, makeSpine, sectionOf, renderOrder, withState,
  reorder, insert, split, merge, replan,
} from './spine.js';

export { makeProposition, propositionOf, numbersIn, surfaceAgrees } from './proposition.js';
export { renderChart, renderPullquote, renderDivider, validateSurface } from './renderers.js';

export { initCarry, updateCarry, capCarry, replanCarry, threadsDue } from './carry.js';
export { GATE_IDS, GATE_DEFAULTS, runGates } from './gates.js';
export { termsOf, termSimilarity, polarityOf, claimSimilarity, contradicts, repeats } from './terms.js';
export { projectEssay } from './project.js';
export { liveView, describeEvent } from './live.js';
export { reconcile } from './reconcile.js';
export { runEssay, KNOB_DEFAULTS, END } from './driver.js';
