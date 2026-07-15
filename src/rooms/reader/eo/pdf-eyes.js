// EO: SIG·INS(Void → Entity,Field, Making,Tending) — render a PDF page natively, read the pixels with the eyes
// The PDF eyes — render each page the way a viewer draws it, then read the pixels.
//
// A PDF's embedded text layer is ONE reading, and not always a good one: a scanned page has
// no text layer at all, and a "searchable PDF" carries a text layer that is itself a stale
// OCR. So this module RENDERS a page natively — rasterises it to a canvas at OCR resolution,
// the same pixels a PDF viewer would show — and reads that raster with the reader's OCR eyes
// (rooms/reader/eo/ocr-eyes.js: Tesseract always, a VLM when the cheap eye is doubtful). Those
// readings are handed back alongside the born-digital text layer (organs/in/pdf.js
// pdfTextReading) so the quorum (organs/in/ocr-quorum.js) can reconcile pixels against embedded
// text, page by page.
//
// THE COORDINATE CONTRACT. The text-layer eye speaks scale-1 point-space, top-left origin
// (organs/in/pdf.js boxOf flips PDF's bottom-up Y). We render at scale s for OCR quality, so
// the raster's boxes are in device pixels; dividing them by s brings every OCR line back to the
// SAME point-space the text layer uses, so the two eyes' boxes align in the quorum. Without
// that the born-digital line and its OCR twin would never cluster and every page would read as
// a wall of single-eye lines.
//
// COST, NOT CORRECTNESS. Rendering + OCR is dear (a raster per page, a Tesseract pass per page),
// so the policy decides WHICH pages earn it — 'auto' renders only the pages whose text layer is
// missing or thin (the scanned/figure pages, where pixels are the only truth); 'all' renders
// every page (maximum corroboration, for a record where accuracy outweighs latency); 'fast' is
// the deterministic eye alone; 'text-only' skips rendering entirely (the classic text read).
// Which reading is BELIEVED is always the quorum's call, decided by agreement — never by which
// eye happened to run. Browser-only glue (pdf.js render + a canvas); the pure decisions below
// are exported and driven in Node by the tests.

import { readWithEyes } from './ocr-eyes.js';

// ── pure decisions — exported, tested in Node ──────────────────────────────────────

// A page's text layer, as the caller extracted it: [{ str, … }]. Textless when no run carries
// a non-whitespace character (a scanned or purely pictorial page — pdf.js hands back empty runs).
export const pageTextChars = (items = []) =>
  items.reduce((n, it) => n + (String(it.str ?? '').match(/\S/g) || []).length, 0);

// The smallest count of non-whitespace characters a page's text layer can carry and still be
// trusted as born-digital. Below it the page is a scan (0 chars) or a figure page with a stray
// caption — either way the pixels are the real reading, so the eyes are woken. A normal text
// page clears this by an order of magnitude, so it is never needlessly OCR'd.
export const MIN_TEXT_CHARS = 16;

// Does this page earn a native render + OCR, under the policy?
//   'text-only' → never (the classic text-layer read).
//   'all'       → always (corroborate even a clean born-digital page).
//   'auto'/'fast' (default) → only when the text layer is missing or thin.
export const pageNeedsOcr = ({ items = [], policy = 'auto' } = {}) => {
  if (policy === 'text-only') return false;
  if (policy === 'all') return true;
  return pageTextChars(items) < MIN_TEXT_CHARS;
};

// The render scale for a page of (width,height) points: aim for OCR-legible resolution
// (~maxSide on the long edge) without allocating a canvas that would blow the tab's memory.
// Clamped to [1, 4] — never smaller than the page's own points, never past 4× (≈288 DPI).
export const scaleForViewport = (width, height, { maxSide = 2600 } = {}) => {
  const longEdge = Math.max(Number(width) || 0, Number(height) || 0);
  if (!(longEdge > 0)) return 2;
  return Math.max(1, Math.min(4, maxSide / longEdge));
};

// Bring a raster box back to point-space by scaling every coordinate by `factor` (= 1/scale).
// Speaks the three box shapes an eye returns (ocr-quorum.js normBox): a Tesseract rect, a W3C
// xywh array, and a VLM quad — the same rectangle, just divided down.
export const scaleBbox = (bbox, factor) => {
  if (!bbox) return bbox;
  if (Array.isArray(bbox)) return bbox.map((v) => (typeof v === 'number' ? v * factor : v));
  const out = {};
  for (const k of ['x0', 'y0', 'x1', 'y1']) if (typeof bbox[k] === 'number') out[k] = bbox[k] * factor;
  return out;
};

// The image-eye policy this PDF policy maps to (ocr-eyes.js readWithEyes): 'all' forces the VLM,
// 'fast' is deterministic-only, everything else is 'auto' (VLM woken only when Tesseract doubts).
const eyePolicyFor = (policy) => (policy === 'all' ? 'all' : policy === 'fast' ? 'fast' : 'auto');

// Fold the per-page eye readings into one reading PER ENGINE, spanning the document. Each page
// was read at its own render scale, so every line's box is divided back to point-space and
// tagged with its page here — the one place raster pixels become document coordinates. Pure, so
// the box math and the engine grouping are driven in Node; the browser half only supplies the
// rasters and the eyes.
//   pageResults  [{ page, scale, readings:[{ engine, lines:[{ text, bbox, confidence }] }] }]
//   → { ocrReadings:[{engine,lines:[{text,bbox,page,confidence}]}], eyes:[name], ocrPages:[page] }
export const foldPageReadings = (pageResults = []) => {
  const byEngine = new Map();
  const woke = new Set();
  const ocrPages = [];
  for (const pr of pageResults) {
    if (!pr || !Array.isArray(pr.readings) || !pr.readings.length) continue;
    ocrPages.push(pr.page);
    const f = 1 / (pr.scale || 1);
    for (const r of pr.readings) {
      woke.add(r.engine);
      const lines = (r.lines || []).map((ln) => ({
        text: ln.text, bbox: scaleBbox(ln.bbox, f), confidence: ln.confidence, page: pr.page,
      }));
      if (!byEngine.has(r.engine)) byEngine.set(r.engine, []);
      byEngine.get(r.engine).push(...lines);
    }
  }
  return {
    ocrReadings: [...byEngine.entries()].map(([engine, lines]) => ({ engine, lines })),
    eyes: [...woke],
    ocrPages,
  };
};

// ── browser glue — render a page, read it, normalise it back to point-space ─────────

// Render one pdf.js page to a white-backed canvas at `scale`, as PNG bytes + an object URL.
// White background: a transparent canvas rasterises text onto nothing and OCRs far worse.
const renderPageRaster = async (pdf, pageNo, { scale } = {}) => {
  const page = await pdf.getPage(pageNo);                 // pdf.js caches pages — cheap to re-get
  const base = page.getViewport({ scale: 1 });
  const s = scale || scaleForViewport(base.width, base.height);
  const vp = page.getViewport({ scale: s });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(vp.width));
  canvas.height = Math.max(1, Math.ceil(vp.height));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const blob = await new Promise((res) => canvas.toBlob((b) => res(b), 'image/png'));
  const url = blob ? URL.createObjectURL(blob) : null;
  return { blob, url, width: vp.width, height: vp.height, scale: s };
};

// readPdfWithEyes({ pdf, textPages, policy, getVision, onProgress, signal }) →
//   { ocrReadings:[{engine,lines:[{text,bbox,page,confidence}]}], ocrPages:[pageNo], eyes:[name], rendered:[{page,width,height,scale}] }
//
//   pdf        the pdf.js document (for rendering the chosen pages).
//   textPages  [{ pageNumber, width, height, items }] the caller already extracted — the text
//              layer per page, read here only to DECIDE which pages need the eyes.
//
// Best-effort per page: a page that fails to render or read is skipped (its text layer still
// stands in the quorum), never fatal. OCR line boxes come back in point-space, page-tagged, so
// the caller can hand them straight to ingestPdf({ readings }) beside the text-layer eye.
export const readPdfWithEyes = async ({ pdf, textPages = [], policy = 'auto', getVision, onProgress, signal } = {}) => {
  const say = typeof onProgress === 'function' ? onProgress : () => {};
  const pageResults = [];   // { page, scale, readings } per OCR'd page — folded (pure) below
  const rendered = [];

  for (const pg of textPages) {
    if (signal && signal.aborted) throw new DOMException('aborted', 'AbortError');
    if (!pageNeedsOcr({ items: pg.items, policy })) continue;

    let raster = null;
    try { raster = await renderPageRaster(pdf, pg.pageNumber, {}); }
    catch { continue; }                                    // render failed — the text layer stands
    if (!raster || !raster.url) continue;
    rendered.push({ page: pg.pageNumber, width: raster.width, height: raster.height, scale: raster.scale });

    say(`Rendering page ${pg.pageNumber} and reading it…`);
    let readings = [];
    try {
      const out = await readWithEyes({ blob: raster.blob, url: raster.url }, { policy: eyePolicyFor(policy), getVision, onProgress: say });
      readings = out.readings || [];
    } catch { /* the eyes are best-effort; the text layer still reads this page */ }
    finally { try { URL.revokeObjectURL(raster.url); } catch {} }   // no viewer consumes it yet — don't leak

    if (readings.length) pageResults.push({ page: pg.pageNumber, scale: raster.scale, readings });
  }

  // The pure fold — normalise every box back to point-space, tag its page, group by engine.
  return { ...foldPageReadings(pageResults), rendered };
};
