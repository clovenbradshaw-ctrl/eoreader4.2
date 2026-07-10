// EO: DEF·EVA·REC(Network,Link → Lens,Atmosphere, Binding,Making,Composing) — barrel
// the enactor faculty — the ENACTOR's commit step (add-on 3 §1, §6).
//
// The judging-committing faculty is the enactor, and it is MODALITY-BLIND: the
// inner act of deciding-and-committing is mostly not language (a soccer player
// runs the full DEF·EVA·REC loop with no speech). So the gate — the DEF·EVA·REC
// collapse over PROPOSITIONS — lives here in the core, not in any output organ.
// Output organs are bare renderers: they produce candidate surfaces (the speech
// organ's segment.js turns the model's token murmur into candidate SVOs); the
// enactor judges them against the grounded basis and collapses what grounds into
// commitment. As input organs do no structuring (structure emerges in the core),
// output organs do no judging (commitment happens in the core).
//
//   basis  (buildBasis)  the DEF the gate holds — what the document SAYS and what
//                        the question ASKS, read from the surfer's stops.
//   props  (correspond)  the EVA measure — RELATIONAL correspondence over resolved
//                        propositions (paraphrase grounds, verbatim earns nothing).
//   gate   (runGate)     the REC collapse — projection beats the null → commit,
//                        else roll back, or VOID where the only amplitude is absence.
//
// Everything here is proposition-level and carries no modality: the same gate
// commits a spoken proposition, a pass, or a struck note. Only the renderer and
// the proposer differ per organ.

export { runGate, VOID_TOKEN } from './gate.js';
export { buildBasis } from './basis.js';
export { parseProps, correspondProp, propKey, relKey } from './props.js';
export { EFFERENCE, efferenceCopy, efferenceCopiesOf } from './efference.js';
export { createMonitor, MISMATCH_FLOOR } from './monitor.js';
export { SELF, WORLD, SELF_MISMATCH, isSelf, attenuates, createSelfModel } from '../core/self/index.js';
