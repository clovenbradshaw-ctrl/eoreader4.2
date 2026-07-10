// EO: NUL·SEG·SIG·CON·EVA·INS(Field,Kind,Network → Field,Network,Entity,Lens, Tending,Clearing,Making) — barrel
// The chorus holon — rendering the reader's folds as a weighted polyphony across
// holonic levels and across the three faces, governed by a Born measure over the
// 27-cell ground, with the vox demoted to a leaf (docs/chorus.md).
//
// eoreader4.1 read from one frame and spoke from one cell: the MiniLM vector
// collapsed to cosine against the 27 centroids, and the reader took the nearest
// one — argmax, a hard measurement, the bivalent compression the framework exists
// to prevent. This holon keeps the distribution instead of collapsing it.
//
// Build order (docs/chorus.md, "Build order"):
//   1. Probe A — read-only. If it fails, stop and fix the basis (probe.js).
//   2. The fold-voice and the Born weighting — deterministic, no model
//      (born.js, fold.js, marginals.js, governor.js).
//   3. The render — display only (render.js, levels.js).
//   4. Probes B and C alongside the render — set the vocabulary the render may use.
//   5. The vox leaf last, only if a reader wants sentences instead of the map (vox.js).
//
// Everything here is grounder-side, deterministic, and (save the injected vox
// surface) model-free. The physics vocabulary — interference, complementarity —
// stays in quotes until Probes B and C pass; the governor is real and cheap and
// gated by Probe A.

// The Born measure.
export { signedCosine, cubeAmplitudes, centeredAmplitudes, bornWeights, bornDistribution, sortedByWeight, topMass, frameMassPartition } from './born.js';

// The fold-voice and the face marginals.
export { foldVoice, cubeFolds, marginalFolds } from './fold.js';
export { cellCoords, cubeMarginals, marginalCells } from './marginals.js';

// The governor.
export { govern, DEFAULT_COVERAGE } from './governor.js';

// The level governor (projection sketch).
export { recStrain, ascendWhile } from './levels.js';

// Gate zero — the three probes.
export { probeA, probeB, probeC } from './probe.js';

// The render.
export { renderLane, recTransition, renderChorus, project, SILENCE_CELL } from './render.js';

// The vox leaf.
export { createVox } from './vox.js';
