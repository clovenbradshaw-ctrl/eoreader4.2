// EO: SIG·INS(Entity → Entity, Making) — the terrains room's one entrance (holon law).
// A prototype surface that paints the cube's nine Site-face terrains over one passage,
// so "what else can we draw over text besides entities?" has a runnable answer. The same
// surface also reads a CSV of feedback (feedback.js), so the answer holds for a table too.
export { mountTerrainSurface } from './surface.js';
export { buildOverlay, segment } from './overlay.js';
export { sceneFromCSV, sceneFromRows, sceneFromTable } from './feedback.js';
export * as scene from './scene.js';
