// EO: SIG(Lens → Lens, Tending) — barrel
// The binvis surface's entrance: the byte-structure render (Aldo Cortesi's binvis, docs/
// binvis-surface.md) — the modality-blind Hilbert-curve render plus its byte-class
// taxonomy and layer registry. A consumer (boot.js, the reader room's launcher) imports
// only from here — never render.strict.js / curve.js / classify.js directly.

export { buildScene, renderToContainer, locate, toBytes } from './render.strict.js';
export { d2xy, xy2d, sideFor } from './curve.js';
export {
  byteClass, byteColor, BINVIS_PALETTE, CLASSES, CLASS_LABEL, LAYERS, DEFAULT_LAYER,
} from './classify.js';
export { windowedEntropy, entropyColor, ENTROPY_STOPS } from './entropy.js';
export { significanceColor, SIGNIFICANCE_STOPS } from './significance.js';
