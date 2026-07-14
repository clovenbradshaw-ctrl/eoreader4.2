// EO: SEG·DEF·EVA·REC(Void,Lens → Field,Lens,Paradigm, Dissecting,Binding,Tracing,Composing) — OCR adapter + quorum → assembleDocument
// The OCR adapter — one eye's word boxes, or a QUORUM of eyes reconciled.
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
//
// AND — when the caller loads more than one OCR engine (a set of witnesses, multiple
// eyes), it passes their readings as `readings:[{engine,lines}]` and this adapter
// hands them to the QUORUM (organs/in/ocr-quorum.js): the eyes are reconciled line by
// line, the best reading elected (DEF), the disagreements weighed (EVA), and a rule
// learned about which eye to trust (REC). One eye in `readings` reads exactly like the
// classic single-list path — the quorum is a superset, never a tax on the common case.

import { assembleDocument } from './document.js';
import { resolveOcr } from './ocr-quorum.js';

const bbox = (b) => b ? [b.x0, b.y0, (b.x1 - b.x0), (b.y1 - b.y0)] : null;

// ocr: { name?, page?, lines?:[{ text, bbox, confidence }], words?:[{ text, bbox, confidence, line }],
//        readings?:[{ engine, lines:[{ text, bbox, confidence, page? }] }], metadata?, derivedFrom? }
// Accepts Tesseract's `data.lines` directly, a flat word list to be grouped by line, or —
// the quorum path — several eyes' readings to be reconciled.
export const ingestOcr = (ocr = {}) => {
  const { name = `ocr-${Date.now()}`, page = 1 } = ocr;

  // ── The quorum path — a set of witnesses read the same image ──────────────────
  if (Array.isArray(ocr.readings) && ocr.readings.length) return ingestOcrQuorum(ocr, { name, page });

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
    // An OCR is READ FROM a scan — a derived document, not an independent witness. When the
    // caller ingested the source image too, it passes its docId here, and the reflection loop
    // folds the OCR onto that root so a scan and its OCR corroborate as ONE origin, not two.
    extra: { tier: 'tesseract', ...(ocr.derivedFrom != null ? { derivedFrom: ocr.derivedFrom } : {}) },
  });
  // Per-span confidence, for a reader that wants to see which passages the OCR was unsure of.
  doc.confidence = doc.spans.map(s => s.ref?.confidence ?? null);
  return doc;
};

// ingestOcrQuorum(ocr, { name, page }) — reconcile several eyes into one doc.
//
// resolveOcr does the pure reconciliation; assembleDocument lays the elected lines on the
// spine (each INS carrying its page/box/char locus); then the quorum's own DEF·EVA·REC marks
// are appended to the SAME append-only log — the frames it weighed (EVA, one per shaky line,
// pointing at the addressable span) and the rule it learned (REC, one per eye, plus a DEF
// naming the most reliable). The per-line facts — belief, witnesses, agreement — ride
// doc.spans[i].ref, so grounding renders "this line, elected from florence, 2/3 eyes, belief
// 0.54" beside the passage itself.
const ingestOcrQuorum = (ocr, { name, page }) => {
  const q = resolveOcr(ocr.readings, { page });

  const doc = assembleDocument({
    name, modality: 'ocr', blocks: q.blocks,
    metadata: ocr.metadata || {},
    extra: { tier: 'quorum', eyes: q.eyes, ...(ocr.derivedFrom != null ? { derivedFrom: ocr.derivedFrom } : {}) },
  });

  // Lay the DEF·EVA·REC trail on the log the blocks already landed on.
  q.ledger.forEach((e) => {
    if (e.op === 'EVA' && e.index != null) {
      const span = doc.spans[e.index];
      if (span) doc.log.append({ op: 'EVA', id: span.id, reason: e.reason, value: e.value, sentIdx: e.index, locus: `${name}#char=${span.charStart},${span.charEnd}` });
    } else if (e.op === 'REC' && e.kind === 'eye-reliability') {
      doc.log.append({ op: 'REC', kind: 'eye-reliability', engine: e.engine, weight: e.weight, checked: e.checked });
    } else if (e.op === 'DEF' && e.kind === 'most-reliable-eye') {
      doc.log.append({ op: 'DEF', key: 'most-reliable-eye', value: e.value });
    }
  });

  // The per-span reads the whole engine already knows to look for, plus the quorum's own.
  doc.confidence = doc.spans.map((s) => s.ref?.confidence ?? null);
  doc.belief = doc.spans.map((s) => s.ref?.belief ?? null);
  doc.witnesses = doc.spans.map((s) => s.ref?.witnesses ?? null);
  doc.reliability = q.reliability;                 // the learned "which eye is best" rule
  doc.quorum = { eyes: q.eyes, best: q.best, disagreements: q.disagreements };
  return doc;
};
