// EO: SEG·DEF·EVA·REC(Void,Lens → Field,Lens,Paradigm, Dissecting,Binding,Tracing,Composing) — PDF adapter: text layer + rendered-raster OCR, reconciled
// The PDF adapter — the born-digital text layer AND the OCR of the natively-rendered page,
// reconciled by the same quorum a scan gets.
//
// The naive path is `page.getTextContent()` → join every `str` into one blob. That
// throws away the two things a groundable civic record needs: WHERE each run sits,
// and WHICH characters of the whole document it is. pdf.js hands each text run a
// `transform` (a 2×3 matrix — position, scale, skew) plus its `width`/`height`. We
// KEEP that geometry. Runs on a shared baseline are stitched into a line; each line
// becomes a block with a real page + bounding box, and the assembler records its
// character range into the reconstructed text.
//
// That is the difference the comment in the assembler names: an EVA event can then
// point at "page 3, the box at (72,410,468,24), chars 1840–1905", so a claim traces
// back to a passage a reader can find on the page — not a flat string that can only
// gesture at the document. No pdf.js is bundled; the caller runs it and passes the
// extracted pages in (image.js's rule — the model/library is injected, never bundled).
//
// BUT A TEXT LAYER IS ONE EYE, AND NOT ALWAYS A TRUSTWORTHY ONE. A scanned page carries no
// text layer at all (it used to be dropped, punted to "import as an image"); a "searchable
// PDF" carries a text layer that is itself a stale OCR, dressed as embedded text. So the
// reader now RENDERS each page natively (rasterizes it, the way a PDF viewer draws it) and
// reads the pixels with the OCR eyes — Tesseract, and a VLM when doubtful — then hands the
// text-layer reading AND the OCR readings to the SAME quorum a scan gets (organs/in/ocr-quorum
// via quorum-doc.js). The text layer rides in as a GROUND-TRUTH eye: the document's own bytes
// are elected when present and believed at the witness cap, but where the rendered pixels
// disagree with the embedded text, the divergence is flagged (EVA) rather than trusted blind.
// A clean born-digital page needs no second eye and takes the classic single-eye path below,
// unchanged; the quorum path is entered only when the caller actually ran OCR on some page.

import { assembleDocument }  from './document.js';
import { assembleQuorumDoc } from './quorum-doc.js';

// A text run's box, from its transform. transform = [a, b, c, d, e, f]; (e,f) is the
// text-space origin, d the vertical scale (≈ font size). PDF y grows UP the page, so
// we flip against the page height to get a top-left box the same way a screen reads.
const boxOf = (item, pageHeight) => {
  const t = item.transform || [1, 0, 0, item.height || 10, 0, 0];
  const x = t[4];
  const yUp = t[5];
  const h = item.height || Math.hypot(t[2], t[3]) || 10;
  const w = item.width || 0;
  const y = pageHeight ? pageHeight - yUp - h : yUp;   // flip to top-left origin
  return [x, y, w, h];
};

// Stitch runs sharing a baseline (within a fraction of the line height) into lines,
// left-to-right. This is the reading order of the page, recovered from geometry.
const linesOf = (items, pageHeight) => {
  const runs = items
    .map(it => ({ str: String(it.str ?? ''), box: boxOf(it, pageHeight), eol: it.hasEOL }))
    .filter(r => r.str.length);
  runs.sort((a, b) => a.box[1] - b.box[1] || a.box[0] - b.box[0]);

  const lines = [];
  let cur = null;
  for (const r of runs) {
    const [x, y, w, h] = r.box;
    const tol = Math.max(2, h * 0.6);
    if (cur && Math.abs(y - cur.y) <= tol) {
      // Same line: add a space if the runs don't already touch.
      const gap = x - (cur.x + cur.w);
      cur.text += (gap > h * 0.25 && !/\s$/.test(cur.text) ? ' ' : '') + r.str;
      cur.w = (x + w) - cur.x;
      cur.h = Math.max(cur.h, h);
    } else {
      if (cur) lines.push(cur);
      cur = { text: r.str, x, y, w, h };
    }
  }
  if (cur) lines.push(cur);
  return lines;
};

// A line's box in top-left point-space, rounded to whole units — the shape both the block
// and the text-layer eye speak, so the born-digital lines align with the rendered raster's
// OCR (which the caller normalises back to the same point-space before handing it in).
const lineBox = (ln) => [Math.round(ln.x), Math.round(ln.y), Math.round(ln.w), Math.round(ln.h)];

// The born-digital lines of each page, in reading order — the geometry recovered once, shared
// by the classic single-eye path and the text-layer eye of the quorum path.
const pageLinesOf = (pages = []) => pages.map((pg, pi) => ({
  page: pg.pageNumber ?? pi + 1,
  lines: linesOf(pg.items || [], pg.height || 0),
}));

// pdfTextReading(pages) — the PDF's OWN embedded text as a GROUND-TRUTH eye for the quorum.
// The caller pairs this with the OCR readings of the natively-rendered page rasters and hands
// the set to ingestPdf({ readings }); the quorum elects this eye where it read (the document's
// bytes are not put to a vote) and flags where the pixels disagree. `confidence: null` — a
// born-digital layer carries no per-line score, and needs none; being the source is enough.
export const pdfTextReading = (pages = []) => ({
  engine: 'pdf-text-layer',
  groundTruth: true,
  lines: pageLinesOf(pages).flatMap(({ page, lines }) =>
    lines.map((ln) => ({ text: ln.text, bbox: lineBox(ln), page, confidence: null }))),
});

// pdf: { name?, metadata?, and EITHER
//   pages:    [{ pageNumber?, width, height, items:[{ str, transform, width, height, hasEOL }] }]  — the classic single-eye (born-digital) path, OR
//   readings: [{ engine, groundTruth?, lines:[{ text, bbox, page, confidence? }] }], pageCount?  — the QUORUM path: the text-layer eye
//             (pdfTextReading) reconciled with the OCR of the rendered raster. }
export const ingestPdf = (pdf = {}) => {
  const { name = `pdf-${Date.now()}`, pages = [], metadata = {} } = pdf;

  // ── The quorum path — many eyes on the rendered page, reconciled (organs/in/quorum-doc.js) ──
  // Entered only when the caller ran OCR on at least one page; a fully born-digital import
  // never pays for it and takes the classic path below. Page-aware alignment keeps each
  // physical line on its own page (ocr-quorum.js), so a multi-page PDF reconciles page by page.
  if (Array.isArray(pdf.readings) && pdf.readings.length) {
    return assembleQuorumDoc({
      name, modality: 'pdf', readings: pdf.readings,
      metadata,
      extra: { tier: 'pdf-quorum', pageCount: pdf.pageCount ?? pages.length },
    });
  }

  // ── The classic path — a born-digital PDF read by its text layer alone ──
  const pageLines = pageLinesOf(pages);
  const blocks = pageLines.flatMap(({ page, lines }) =>
    lines.map((ln) => ({ text: ln.text, kind: 'line', page, bbox: lineBox(ln) })));

  return assembleDocument({
    name, modality: 'pdf', blocks,
    // The universal metadata slot — a PDF's front matter is its Info dictionary /
    // XMP (title, author, producer, dates), read by the caller and passed through.
    metadata,
    extra: { pageCount: pages.length, pageLines },
  });
};
