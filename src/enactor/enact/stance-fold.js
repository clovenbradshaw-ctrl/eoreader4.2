// EO: DEF·EVA·REC(Atmosphere → Lens,Paradigm, Making,Tracing,Composing) — re-export shim; stance fold
// The stance layer as a fold — moved into the pure enacted engine (core/enacted/
// stance.js) so loop.js can drive it in-step without the faculty adapter reaching up
// into itself (the one-way dependency the enact holon keeps). This is a re-export shim
// so existing import paths (tests, probes, enact/index.js) keep resolving.

export { stanceFold, createStance } from '../../core/enacted/stance.js';
