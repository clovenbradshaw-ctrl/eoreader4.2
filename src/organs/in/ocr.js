// EO: SEG(Void → Field, Dissecting) — OCR adapter (Tesseract) → assembleDocument
// The OCR adapter — Tesseract's word boxes, the deterministic fallback tier.
//
// When a VLM is overkill or the record must be reproducible (an OCR you can diff
// commit-to-commit), Tesseract.js gives word-level bounding boxes with no model
// download and no nondeterminism. This adapter takes that hierarchy — blocks →
// paragraphs → lines → words, each with a bbox and a confidence — and lays the
// LINES onto the spine as addressable blocks, the same contract the native-text PDF
// produces, so a scanned page and a born-digital page read identically downstream.
//
// Confidence is kept, not thresholded away: a low-confidence line is still a real
// passage an EVA event can point at (and flag as shaky), the way the audio adapter
// keeps the second-witness mark rather than silently trusting the first reading.

import { assembleDocument } from './document.js';

const bbox = (b) => b ? [b.x0, b.y0, (b.x1 - b.x0), (b.y1 - b.y0)] : null;

// ocr: { name?, page?, lines?:[{ text, bbox, confidence }], words?:[{ text, bbox, confidence, line }], metadata? }
// Accepts Tesseract's `data.lines` directly, or a flat word list to be grouped by line.
export const ingestOcr = (ocr = {}) => {
  const { name = `ocr-${Date.now()}`, page = 1 } = ocr;

  let lines = ocr.lines;
  if (!lines && Array.isArray(ocr.words)) {
    const byLine = new Map();
    ocr.words.forEach((w, i) => {
      const key = w.line ?? i;
      if (!byLine.has(key)) byLine.set(key, []);
      byLine.get(key).push(w);
    });
    lines = [...byLine.values()].map(ws => ({
      text: ws.map(w => w.text).join(' '),
      bbox: ws.reduce((acc, w) => {
        const b = w.bbox; if (!b) return acc;
        return acc ? { x0: Math.min(acc.x0, b.x0), y0: Math.min(acc.y0, b.y0), x1: Math.max(acc.x1, b.x1), y1: Math.max(acc.y1, b.y1) } : { ...b };
      }, null),
      confidence: ws.reduce((s, w) => s + (w.confidence ?? 0), 0) / (ws.length || 1),
    }));
  }

  const blocks = (lines || [])
    .map(ln => ({ text: String(ln.text ?? '').trim(), bbox: bbox(ln.bbox), page: ln.page ?? page, kind: 'line', ref: ln.confidence != null ? { confidence: +Number(ln.confidence).toFixed(1) } : null }))
    .filter(b => b.text);

  const doc = assembleDocument({
    name, modality: 'ocr', blocks,
    metadata: ocr.metadata || {},
    extra: { tier: 'tesseract' },
  });
  // Per-span confidence, for a reader that wants to see which passages the OCR was unsure of.
  doc.confidence = doc.spans.map(s => s.ref?.confidence ?? null);
  return doc;
};
