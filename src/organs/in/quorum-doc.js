// EO: DEF·EVA·REC(Lens → Field,Lens,Paradigm, Binding,Tracing,Composing) — lay a reconciled quorum on the spine
// The quorum's landing — one reconciliation, laid on the append-only spine, shared by every
// modality whose text is read by a SET OF EYES.
//
// resolveOcr (organs/in/ocr-quorum.js) is the pure brain: several eyes read the same surface,
// the best line is elected (DEF), the disagreements weighed (EVA), each eye's reliability
// learned (REC). This module is the one place that turns that result into a doc on the
// universal contract — the elected lines assembled by the span-assembler, and the quorum's own
// DEF·EVA·REC trail appended to the SAME log the blocks landed on, so the audit reads one
// record. Both organs that read with eyes use it:
//
//   · organs/in/ocr.js  — a scanned image's eyes (Tesseract + a VLM's OCR), reconciled.
//   · organs/in/pdf.js  — the born-digital TEXT LAYER (a ground-truth eye) beside the OCR of
//                         the natively-rendered page raster, reconciled the same way.
//
// One reconciliation, two modalities, one trail — the DRY the holon tree asks for (no organ
// re-implements how a quorum lands; it just says WHICH eyes read and in WHAT modality).

import { assembleDocument } from './document.js';
import { resolveOcr }       from './ocr-quorum.js';

// assembleQuorumDoc({ name, modality, readings, page?, metadata?, extra? }) → doc
//
//   readings  [{ engine, groundTruth?, lines:[{ text, bbox, confidence?, page? }] }] — the eyes.
//   page      the default page for lines that carry none (single-image OCR passes 1).
//   extra     modality-specific fields folded onto the doc (tier, derivedFrom, pageCount…);
//             the eyes that read are always merged in as `eyes`.
//
// The doc carries the per-line quorum facts the reader already knows to look for —
// doc.confidence / doc.belief / doc.witnesses (index-aligned to doc.spans) — plus the learned
// reliability rule and the { eyes, best, disagreements } summary, exactly as the OCR organ has
// always exposed them.
export const assembleQuorumDoc = ({ name, modality, readings = [], page = 1, metadata = {}, extra = {} } = {}) => {
  const q = resolveOcr(readings, { page });

  const doc = assembleDocument({
    name, modality, blocks: q.blocks,
    metadata,
    extra: { ...extra, eyes: q.eyes },
  });

  // Lay the DEF·EVA·REC trail on the log the blocks already landed on. The EVA points at the
  // real, addressable span the reader can open; the REC records each eye; the DEF names the
  // most reliable eye the page taught us to trust.
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
  doc.confidence  = doc.spans.map((s) => s.ref?.confidence ?? null);
  doc.belief      = doc.spans.map((s) => s.ref?.belief ?? null);
  doc.witnesses   = doc.spans.map((s) => s.ref?.witnesses ?? null);
  doc.reliability = q.reliability;                 // the learned "which eye is best" rule
  doc.quorum      = { eyes: q.eyes, best: q.best, disagreements: q.disagreements };
  return doc;
};
