// EO: SEG(Void → Field, Dissecting) — SmolDocling adapter → assembleDocument
// The SmolDocling adapter — a layout-aware VLM's conversion, onto the spine.
//
// SmolDocling is a document-conversion VLM (a 93M vision encoder + a 135M language
// model, SmolVLM-based) that runs on the same Transformers.js / WebGPU runtime as
// the SmolLM2 / Llama talkers — no new backend. Its output is DocTags: a structured
// stream that names each region's ROLE (title, section-header, paragraph, list-item,
// table, caption, page-footer) and, crucially, its READING ORDER and location. That
// is exactly what this spine wants — structure the flat OCR path has to guess at.
//
// (Runtime note for the caller, not this pure adapter: SmolVLM v1 has ONNX exports
// widely deployed in Transformers.js + WebGPU; as of mid-2026 SmolVLM2 still shipped
// no ONNX config, so stay on the v1-based SmolDocling export.)
//
// This adapter ingests the ALREADY-PARSED DocTags — the caller runs the VLM and the
// DocTags reader; nothing is bundled (image.js's rule). A table becomes one block
// per cell (so each figure is an addressable passage carrying its row/col), every
// other region a block carrying its role and reading-order rank. The layout is the
// reading order; significance predicts the next region and is surprised by one the
// layout did not lead it to expect — L3 math, unchanged.

import { assembleDocument } from './document.js';

// docling: { name?, blocks:[{ text, type, level?, page?, bbox?, cells? }], metadata? }
// `type` is the DocTag role. A block whose type is 'table' may carry `cells:[{ text, row, col, bbox? }]`.
export const ingestDocling = (docling = {}) => {
  const { name = `docling-${Date.now()}`, blocks: regions = [] } = docling;

  const blocks = [];
  regions.forEach((r) => {
    const type = r.type || r.kind || 'text';
    if (type === 'table' && Array.isArray(r.cells)) {
      for (const c of r.cells) {
        const t = String(c.text ?? '').trim();
        if (!t) continue;
        blocks.push({ text: t, kind: 'cell', page: c.page ?? r.page ?? null, bbox: c.bbox ?? null, ref: { table: r.id ?? null, row: c.row ?? null, col: c.col ?? null } });
      }
      return;
    }
    const t = String(r.text ?? '').trim();
    if (!t) return;
    // Map DocTag roles onto block kinds the assembler and downstream reader understand.
    const kind = /title|header|head/i.test(type) ? 'heading'
      : /list/i.test(type) ? 'list-item'
      : /caption/i.test(type) ? 'caption'
      : /foot|page-/i.test(type) ? 'furniture'
      : 'paragraph';
    blocks.push({ text: t, kind, level: r.level ?? null, page: r.page ?? null, bbox: r.bbox ?? null, ref: { docTag: type } });
  });

  return assembleDocument({
    name, modality: 'docling', blocks,
    metadata: docling.metadata || {},
    extra: { converter: 'smoldocling', layoutAware: true },
  });
};
