// EO: SEG(Void → Field, Dissecting) — native-text PDF adapter → assembleDocument
// The native-text PDF adapter — for civic PDFs that carry a real text layer.
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

import { assembleDocument } from './document.js';

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

// pdf: { name?, pages:[{ pageNumber?, width, height, items:[{ str, transform, width, height, hasEOL }] }], metadata? }
export const ingestPdf = (pdf = {}) => {
  const { name = `pdf-${Date.now()}`, pages = [] } = pdf;
  const blocks = [];
  const pageLines = [];

  pages.forEach((pg, pi) => {
    const pageNo = pg.pageNumber ?? pi + 1;
    const lines = linesOf(pg.items || [], pg.height || 0);
    pageLines.push({ page: pageNo, lines });
    for (const ln of lines) {
      blocks.push({
        text: ln.text,
        kind: 'line',
        page: pageNo,
        bbox: [Math.round(ln.x), Math.round(ln.y), Math.round(ln.w), Math.round(ln.h)],
      });
    }
  });

  return assembleDocument({
    name, modality: 'pdf', blocks,
    // The universal metadata slot — a PDF's front matter is its Info dictionary /
    // XMP (title, author, producer, dates), read by the caller and passed through.
    metadata: pdf.metadata || {},
    extra: { pageCount: pages.length, pageLines },
  });
};
