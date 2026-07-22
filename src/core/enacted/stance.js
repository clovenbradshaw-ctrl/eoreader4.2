// EO: DEF·EVA·REC(Field,Atmosphere → Lens,Paradigm, Dissecting,Binding,Composing) — re-export shim; recalibration as logged REC
// Renamed to calibration-fold.js (docs/universalizing-stance-face.md §3): "stance"
// here named a drift-calibration threshold (band, step), unrelated to core/cube.js's
// Mode × Object Stance face — one of four unrelated concepts the word "stance"
// collided across in this codebase. This is a re-export shim, kept for one release so
// existing imports of this path (core/enacted/index.js, core/enacted/loop.js) keep
// resolving; see calibration-fold.js for the real content. tests/stance-registry.test.js
// enforces that this file stays a shim and never grows a local definition of its own.
export { calibrationFold as stanceFold, createCalibration as createStance, BORN_FRAME } from './calibration-fold.js';
