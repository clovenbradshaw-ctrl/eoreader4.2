// EO: SEG·SIG·CON·SYN·INS·EVA·DEF·NUL(Void,Field,Network,Kind,Atmosphere → Void,Entity,Kind,Field,Network,Lens,Atmosphere, Clearing,Dissecting,Tending,Binding,Tracing,Making,Composing) — barrel
// The arc holon: multi-section grounded generation. A turn produces one
// grounded answer; an arc produces a long, multi-section answer by planning
// sections from retrieved evidence, generating each as a gated sub-turn, and
// stopping when the evidence budget is spent — length emergent, not exogenous.
//
// `arc` orchestrates; it imports no other holon's internals (it depends on the
// public faces of retrieve, ground, model, audit, and turn). Each section's
// generate→bind→veto reuses the turn's own grounding with a section sub-claim
// in place of the raw question. Nothing in parse, core, or ui changes.

export { runArc } from './pipeline.js';
export { classifyScope, isPointScope } from './scope.js';
export { bindableSpans, clusterByEmbedding } from './cluster.js';
export { planSections, reconcile } from './plan.js';
export { evaCoverageGate, overlap, groundSaturation } from './saturation.js';
export { generateSection, stripUnboundCorrective } from './generate.js';
export { assembleArc, arcSources } from './assemble.js';
export {
  BIND_THRESHOLD, CLUSTER_COS, COVERAGE_CUT, FLOOR_TOKENS, ceilingFor,
  REBIND_THRESHOLD, EPSILON, NOVELTY_FLOOR, MAX_SECTIONS, MAX_TOTAL_TOKENS,
} from './constants.js';
