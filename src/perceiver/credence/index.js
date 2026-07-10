// EO: SIG·SEG·EVA·DEF·NUL(Field,Entity,Network,Lens,Atmosphere → Link,Atmosphere,Lens,Void,Field, Tending,Binding,Tracing,Dissecting,Unraveling,Clearing) — barrel
// The credence holon (source-trajectory spec §7): a second projection over the
// one append-only log that tracks where a source moves on the (M, O) plane —
// modelfulness and orientation — segmented into regimes, conditioned on domain.
// It depends on `core` only and adds no new spine.
//
// Barrel re-export, the holon convention (mirrors src/ground, src/retrieve). The
// write side (createCredenceBook) and the read side (projectCredence) are the two
// halves; the integration points (credenceReweight, credenceFlag) are pure and
// gated OFF until the separation gate passes (§12).

export {
  projectCredence, credence, credenceStats, weightByIndep,
  CREDENCE_KINDS, CLASS, NUL_O, DEFAULT_CREDENCE_RULES,
} from './project.js';
export { createCredenceBook, defaultIndependence } from './book.js';
export { createPageHinkley } from './detect.js';
export { createBetaFilter, createEwFilter, betai, betaInv } from './filters.js';
export { credenceEnabled, credenceReweight, credenceFlag } from './integrate.js';
