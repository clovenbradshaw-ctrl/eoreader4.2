// EO: SIG·DEF(Entity,Field → Lens, Tending,Making) — the import reveal's surface pick
// first-surface.js — which surface a freshly imported source opens FIRST, as a pure
// function so the routing is guarded by a test the browserless CI can run (the surface
// that calls it, index.html _revealImport, is not).
//
// THE POINT OF THE REVEAL. The moment a source lands — any modality: a PDF, a photo, an
// hour of audio, a spreadsheet — the first thing rendered is the ENGINE'S OWN reading of
// it: the causal DAG the source is read as asserting, or the entity web of its figures
// and bonds. No model runs and none is needed; everything shown is the parser's and the
// graph projections' work, available the instant the doc lands. The reveal is the proof,
// up front, of what the reader does before any LLM says a word.
//
// The ORGAN that read the file picks the surface:
//   · structured modalities (a table's records, a JSON tree's leaves, a binary's string
//     runs) open the ENTITY WEB — their entities and bonds are the reading; running the
//     causal-marker cursor over cell prose would only surface noise;
//   · prose-bearing modalities (text, PDF, web page, an OCR'd scan, a photo's scene, an
//     audio/video transcript…) open the CAUSAL DAG when a causal claim was read — the
//     most impressive projection the engine owns — and fall back to the entity web when
//     none was;
//   · a prose source in a topic with no read entities yet still opens the DAG surface:
//     its reading-flow cursor (sentences + discourse relations) renders for ANY doc with
//     sentences, so the reveal never lands on a blank.
//
// Returns 'causal' | 'entity' | null (null = no overlay; the source tab itself is the
// reveal — e.g. a binary whose string runs raised no entities).

export const STRUCTURED_MODALITIES = Object.freeze(['table', 'json', 'binary']);

export function firstSurfaceKind({ modality = 'text', causalEdges = 0, entities = 0 } = {}) {
  if (STRUCTURED_MODALITIES.includes(modality)) return entities > 0 ? 'entity' : null;
  if (causalEdges > 0) return 'causal';
  if (entities > 0) return 'entity';
  return 'causal';
}
