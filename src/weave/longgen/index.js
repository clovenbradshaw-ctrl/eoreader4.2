// EO: SYN·INS·EVA(Field,Network,Atmosphere → Network,Lens, Composing,Making,Tracing) — barrel
// The longgen holon — long generation across messages (docs/long-generation.md),
// the planner (docs/spec-planner.md).
//
// spec-generation.md Piece 3 (the autoregressive closure) wired from pieces that
// already exist: the conversation fold (converse), the forward move-predictor
// (predict), and the arc's realize+floor (arc). spec-planner.md turns the same
// closure into the planner — the surfer turned to write — by making its three faces
// real and checkable: Navigate (direction.js), Resolve with the operator HONORED
// (resolve.js), Render under the prompt contract (prompt.js); guarded by the
// answerability gate (answerable.js), shaped by the significance arc (shape.js),
// stopped by saturation/quiesce (continuation.js), and offered as a setting
// (generate.js). `longgen` orchestrates; it imports only public faces.

export { runContinuation } from './continuation.js';
export { predictDirection, selfMoveLog, SEED_MOVE } from './direction.js';
export { fieldStrain, MIN_FIELD } from './field.js';
export { holonicConfinement, toLensConfig } from './confine.js';
export { relax, relaxMove } from './relax.js';
export { exportAudit, diagnose } from './audit.js';
export { nulGate, participationRatio } from './nul.js';
export { resolveProposition, STANCE, EDGE_OPS } from './resolve.js';
export {
  classifyWantedType, groundSupplies, answerabilityGate, refusalAtom,
  developableRegions, followUpOffer, WANTED_TYPES,
} from './answerable.js';
export { arcPhase, phaseBias, applyPhaseBias, shouldCollapse } from './shape.js';
// Paragraph at a time — short output that coheres to a larger whole
// (docs/paragraph-at-a-time.md). The skeleton (SEG, the shape), the continuation
// render (condition the artifact, not the behavior), the progress fold (how far
// along, workspace not a bar), and the composer that walks the skeleton one
// paragraph per call — each a CONTINUATION, gated by EVA, resumable across messages.
export { buildSkeleton, headingOf } from './skeleton.js';
export {
  renderContinuation, seedFor, leadSentence, connectiveFor,
  realizeProse, SYSTEM_CONTINUE, DEFAULT_GENRE,
} from './render.js';
export { progressAgainst } from './progress.js';
// The walk — the in-run multi-paragraph loop (the multi-paragraph-walk spec): given
// a fold, a design, and a model, it emits paragraphs until the design is filled or
// the fold is spent. `composeParagraphs` is the older ground/skeleton-named face
// over the same walk (compose.js).
export { walk, sliceFor } from './walk.js';
// the load-and-thread weld: resolve an installed flow prior by facets (flow/select.js)
export { loadInstalledPrior } from '../../surfer/flow/select.js';
export { composeParagraphs, evaSplice, frameLeak } from './compose.js';
// The self-read weld — re-read an accepted paragraph through the grounder before
// it becomes the next prior; strike drifted sentences (number / refold / witness,
// docs/self-read-weld-measurement.md). The walk runs it by default (selfRead).
export { selfRead } from './weld.js';
// The prompt as a FOLD, and multi-response generation as variation + selection
// (docs/multi-response-folds.md): the arc-gap move deriver, the live-thread reader,
// the fold-prompt builder (build_prompt(prior, prevStep, liveGraph, arcPhase)), the
// flow-prior fitness function, and the best-of-n selector that keeps the on-manifold
// candidate.
export {
  buildFoldPrompt, build_prompt, foldBestOfN, arcGapMove, liveThreads,
  flowScorer, OP_DIRECTIVES, SYSTEM_FOLD,
} from './fold.js';
export {
  atomPrompt, stablePrefix, prefixCacheKey, readWindow,
  propositionInstruction, speculateNext, SYSTEM_WRITER,
} from './prompt.js';
export { generate, plainPath, compareModes } from './generate.js';
