// EO: NUL·SYN·CON·EVA·DEF·REC(Field,Network,Paradigm → Network,Lens,Field, Composing,Binding,Tracing) — barrel
// The frame holon — ONE interior structure, instantiated per modality at the
// membrane (docs/frame-holon.md).
//
// This is the log / projection / active-path / bind spine `src/tasks/` proved on
// the generation axis, factored out so every axis names the same object:
// discourse routing (docs/frame-binding-route.md), long generation (src/tasks/),
// and sequence prediction (src/predict/grained.js) are the SAME holon over
// different organs/in membranes. Everything here lives between organs/in and
// organs/out, on the unit/prop stream, below where modality is visible — so it
// is modality-blind by construction, the same way core/unit.js "carries no
// modality, so it cannot leak."
//
// What the holon owns (one implementation, all modalities):
//   events.js     the append-only log: the five TaskEvent kinds + `bind`
//   project.js    the pure projection: the nested tree + the ACTIVE PATH (the
//                 stack — what "in scope" means), replay-stable
//   bind.js       the bind decision: NUL-gated argmax over the path's couplings,
//                 with the incumbent-as-resting-potential relaxation
//   node.js       statuses, rollups, the leaf folds (output/sources/progress)
//   grain.js      the cube reading and the grain-coherence (confab) guard
//   constants.js  the runaway guards (depth / fanout / nodes)
//
// What varies per modality is NOT here: the raise (SIG, organs/in), the bind's
// term-space (which overlap metric measures EVA — the caller hands couplings in
// as numbers), and, for a generative frame, the leaf's render (INS @ Figure,
// organs/out). Binding, push, pop, and return do not vary.
//
// `src/tasks/` delegates its spine to this module (its events, node, grain,
// constants, and projection re-export from here), so tests/tasks.test.js is the
// parity pin: the generation side runs on the shared holon unchanged.

export {
  KIND, openEvent, decomposeEvent, stepEvent, completeEvent, failEvent, bindEvent,
} from './events.js';
export { projectFrameStack } from './project.js';
export { decideBind, BIND_MOVES } from './bind.js';
export {
  STATUS, rollupStatus, isTerminal, assembleOutput, assembleSources, progressOf,
} from './node.js';
export {
  TASK_OPS, GROUND, FIGURE, PATTERN,
  objectGrainOf, holonGrainOf, cubeCellOf, actsOf, grainCoherence, annotateGrain,
} from './grain.js';
export { MAX_DEPTH, MAX_FANOUT, MAX_NODES } from './constants.js';
