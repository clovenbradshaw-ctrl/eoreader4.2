// EO: INS·EVA·SIG(Void,Entity,Atmosphere → Entity,Field, Making,Binding,Tending) — barrel
// The steer holon: impression → attention/confidence modulation (spec §4a, §10). The Born-rule
// collapse decides whether a raised signal is rendered; on collapse a steer event biases the
// next projection's physics — and only that. Steer is never evidence (spec §9.2).

export { amplitude, commitProbability, bornCollapse } from './collapse.js';
export { buildSteer, isSteer, liveSteers, steerBias } from './event.js';
