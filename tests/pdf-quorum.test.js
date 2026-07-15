// The PDF read by more than one eye — the born-digital text layer reconciled with the OCR of
// the natively-rendered page, page by page. These drive the PURE brain (ocr-quorum.js), the PDF
// organ (pdf.js, quorum path), and the pure render/eye decisions (rooms/reader/eo/pdf-eyes.js)
// in Node exactly as the browser does — no pdf.js, no canvas, no model: an "eye" is a list of
// lines with boxes, and a "page" is the text-items pdf.js would hand back.
//
// What they pin down: page-aware alignment (a line on p.1 never folds into p.5), the born-digital
// text layer as a GROUND-TRUTH eye (elected over an OCR misread, believed at the witness cap even
// when it read alone, but flagged when the pixels disagree), a mixed born-digital + scanned PDF
// losing nothing, the classic single-eye path staying byte-for-byte, and the cost policy that
// decides which pages earn a native render.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveOcr, ocrBelief } from '../src/organs/in/ocr-quorum.js';
import { ingestPdf, pdfTextReading } from '../src/organs/in/index.js';
import { CONVERSATIONAL_CAP } from '../src/turn/converse/index.js';
import {
  pageTextChars, pageNeedsOcr, scaleForViewport, scaleBbox, foldPageReadings, MIN_TEXT_CHARS,
} from '../src/rooms/reader/eo/pdf-eyes.js';

const box = (x0, y0, x1, y1) => ({ x0, y0, x1, y1 });

// A pdf.js-style text item: one run at (x, yUp) baseline, height h. transform = [a,b,c,d,e,f].
const item = (str, x, yUp, h = 10, w = 100) => ({ str, transform: [1, 0, 0, h, x, yUp], width: w, height: h });

// ── ocrBelief — the ground-truth eye is not held to the corroboration bar ─────────

test('ocrBelief: a ground-truth reading is believed at the witness cap, even alone', () => {
  const born      = ocrBelief({ groundTruth: true, eyes: 1 });                    // text layer, no OCR looked
  const bornSplit = ocrBelief({ groundTruth: true, eyes: 2, agreement: 0.5 });    // OCR disagreed
  const loneOcr   = ocrBelief({ eyes: 1, confidence: 0.95 });                     // a lone pixel eye

  assert.equal(born, CONVERSATIONAL_CAP, "the document's own text reaches the cap on its own say-so");
  assert.equal(bornSplit, CONVERSATIONAL_CAP, 'a disagreeing OCR eye does not lower the born-digital belief');
  assert.ok(loneOcr <= CONVERSATIONAL_CAP * 0.5 + 1e-9, 'a lone PIXEL eye is still held to the single-eye ceiling');
  assert.ok(born > loneOcr, 'ground truth outranks a lone confident pixel reading');
});

// ── page-aware alignment — a physical line lives on ONE page ──────────────────────

test('resolveOcr: identical boxes on different pages never fold into one line', () => {
  // Two eyes, each reading the same box on page 1 AND page 2 — geometry repeats page to page.
  const q = resolveOcr([
    { engine: 'a', lines: [
      { text: 'Header', bbox: box(72, 40, 300, 60), page: 1 },
      { text: 'Header', bbox: box(72, 40, 300, 60), page: 2 },
    ] },
    { engine: 'b', lines: [
      { text: 'Header', bbox: box(72, 41, 300, 61), page: 1 },
      { text: 'Header', bbox: box(72, 41, 300, 61), page: 2 },
    ] },
  ]);
  assert.equal(q.blocks.length, 2, 'two physical lines — one per page — not one merged cluster');
  assert.deepEqual(q.blocks.map((b) => b.page), [1, 2], 'in page order');
  for (const b of q.blocks) assert.equal(b.ref.eyes, 2, 'each page has both eyes as witnesses');
});

// ── the born-digital text layer as a ground-truth eye ─────────────────────────────

test('the text layer is elected over an OCR misread, and the divergence is flagged', () => {
  const q = resolveOcr([
    { engine: 'pdf-text-layer', groundTruth: true, lines: [
      { text: 'Section 4: Findings', bbox: box(72, 100, 400, 120), page: 1, confidence: null },
    ] },
    { engine: 'tesseract', lines: [
      { text: 'Sectlon 4: Findlngs', bbox: box(73, 101, 401, 121), page: 1, confidence: 66 },
    ] },
  ]);
  assert.equal(q.blocks.length, 1);
  const line = q.blocks[0];
  assert.equal(line.text, 'Section 4: Findings', "the document's own bytes win, not the OCR misread");
  assert.equal(line.ref.elected, 'pdf-text-layer');
  assert.equal(line.ref.groundTruth, true);
  assert.equal(line.ref.eyes, 2);
  assert.equal(line.ref.disagreement, true, 'the pixels disagreeing with the text layer is flagged');
  assert.equal(line.ref.belief, CONVERSATIONAL_CAP, 'believed at the cap despite the disagreement');
  assert.ok(q.disagreements.some((d) => d.kind === 'split'), 'the split rides the EVA worklist');
});

test('a born-digital line the OCR eyes did not read is NOT flagged single-eye', () => {
  // Page 1 born-digital (text layer only); page 2 scanned (OCR only). The p.1 line must land,
  // believed at the cap, and NOT appear as a single-eye disagreement — it is the document itself.
  const q = resolveOcr([
    { engine: 'pdf-text-layer', groundTruth: true, lines: [
      { text: 'Born-digital paragraph.', bbox: box(72, 100, 400, 120), page: 1, confidence: null },
    ] },
    { engine: 'tesseract', lines: [
      { text: 'Scanned line one', bbox: box(70, 90, 402, 112), page: 2, confidence: 80 },
    ] },
    { engine: 'florence2-ocr', lines: [
      { text: 'Scanned line one', bbox: box(71, 91, 403, 113), page: 2, confidence: null },
    ] },
  ]);
  const born = q.blocks.find((b) => b.page === 1);
  assert.equal(born.ref.belief, CONVERSATIONAL_CAP, 'the born-digital line is believed at the cap alone');
  assert.equal(born.ref.eyes, 1, 'only the text layer read it');
  assert.ok(!q.disagreements.some((d) => d.readings[0].text === 'Born-digital paragraph.'),
    'a lone ground-truth line is not flagged as an uncorroborated single-eye reading');

  const scanned = q.blocks.find((b) => b.page === 2);
  assert.equal(scanned.ref.eyes, 2, 'the scanned line was read by two pixel eyes');
  assert.ok(scanned.ref.agreement === 1, 'the two OCR eyes agreed on the scanned line');
  assert.ok(scanned.ref.belief > CONVERSATIONAL_CAP * 0.5, 'two agreeing eyes beat the single-eye ceiling');
});

// ── the PDF organ, quorum path — the reconciled doc lands on the spine ────────────

test('ingestPdf({readings}) reconciles the text layer and OCR onto the spine', () => {
  const doc = ingestPdf({
    name: 'report.pdf', pageCount: 2, metadata: { title: 'Report' },
    readings: [
      { engine: 'pdf-text-layer', groundTruth: true, lines: [
        { text: 'Executive summary', bbox: [72, 100, 300, 20], page: 1, confidence: null },
      ] },
      { engine: 'tesseract', lines: [
        { text: 'Executlve summary', bbox: [73, 101, 300, 20], page: 1, confidence: 70 },   // p.1 misread
        { text: 'Scanned appendix line', bbox: [70, 90, 340, 22], page: 2, confidence: 82 }, // p.2 only OCR
      ] },
    ],
  });

  assert.equal(doc.modality, 'pdf');
  assert.equal(doc.pageCount, 2);
  assert.match(doc.text, /Executive summary/, 'the born-digital reading is elected into the text');
  assert.match(doc.text, /Scanned appendix line/, 'the OCR-only scanned page contributes its text — nothing dropped');
  assert.ok(Array.isArray(doc.belief) && doc.belief.length === doc.spans.length, 'per-line belief rides the doc');
  assert.ok(Array.isArray(doc.reliability), 'the learned reliability rule rides the doc');
  assert.equal(doc.quorum.eyes.length, 2, 'the doc records the eyes that read it');

  const log = doc.log.snapshot();
  assert.ok(log.some((e) => e.op === 'EVA'), 'the p.1 disagreement is an EVA on the log');
  assert.ok(log.some((e) => e.op === 'REC' && e.kind === 'eye-reliability'), 'each eye is a REC on the log');
  // Every span addresses its own text, and carries a page — the geometry survives.
  for (const s of doc.spans) {
    assert.equal(doc.text.slice(s.charStart, s.charEnd), s.text, 'the span tiles the reconstructed text');
    assert.ok(s.page === 1 || s.page === 2, 'every line keeps its page');
  }
});

test('pdfTextReading marks the text layer as a ground-truth eye with page-tagged boxes', () => {
  const pages = [
    { pageNumber: 1, width: 600, height: 800, items: [item('First line', 72, 700), item('Second line', 72, 680)] },
    { pageNumber: 2, width: 600, height: 800, items: [item('Third line', 72, 700)] },
  ];
  const eye = pdfTextReading(pages);
  assert.equal(eye.engine, 'pdf-text-layer');
  assert.equal(eye.groundTruth, true);
  assert.equal(eye.lines.length, 3, 'every born-digital line becomes an eye line');
  assert.deepEqual(eye.lines.map((l) => l.page), [1, 1, 2], 'each line carries its page');
  for (const l of eye.lines) {
    assert.ok(Array.isArray(l.bbox) && l.bbox.length === 4, 'a point-space [x,y,w,h] box');
    assert.equal(l.confidence, null, 'a born-digital layer carries no per-line score');
  }
});

// ── the classic path — a fully born-digital PDF is unchanged ──────────────────────

test('ingestPdf({pages}) still takes the classic single-eye path (no quorum, no belief)', () => {
  const pages = [{ pageNumber: 1, width: 600, height: 800, items: [item('Only the text layer', 72, 700)] }];
  const doc = ingestPdf({ name: 'clean.pdf', pages });
  assert.match(doc.text, /Only the text layer/);
  assert.equal(doc.pageCount, 1);
  assert.equal(doc.quorum, undefined, 'the classic path mints no quorum');
  assert.equal(doc.belief, undefined, 'and no per-line belief — a born-digital line is the document, not a reading');
  assert.ok(doc.spans.every((s) => s.ref == null), 'classic spans carry no quorum ref');
});

// ── the render / eye-cost decisions (pure, from pdf-eyes.js) ──────────────────────

test('pageTextChars counts non-whitespace glyphs across a page\'s runs', () => {
  assert.equal(pageTextChars([{ str: 'Hello ' }, { str: 'world' }]), 10);
  assert.equal(pageTextChars([{ str: '   ' }, { str: '' }]), 0, 'a whitespace-only / empty page reads as textless');
  assert.equal(pageTextChars([]), 0);
});

test('pageNeedsOcr: the policy governs which pages earn a native render', () => {
  const scanned = { items: [] };                                   // no text layer
  const thin    = { items: [{ str: 'Fig. 1' }] };                  // a stray caption, below the floor
  const prose   = { items: [{ str: 'A full paragraph of real body text on the page.' }] };

  assert.equal(pageNeedsOcr({ ...scanned, policy: 'auto' }), true, 'a scanned page is always read by the eyes');
  assert.equal(pageNeedsOcr({ ...thin, policy: 'auto' }), true, 'a thin text layer earns a second look');
  assert.equal(pageNeedsOcr({ ...prose, policy: 'auto' }), false, 'a real text page is not needlessly OCR\'d');
  assert.equal(pageNeedsOcr({ ...prose, policy: 'all' }), true, "'all' corroborates even a clean page");
  assert.equal(pageNeedsOcr({ ...scanned, policy: 'text-only' }), false, "'text-only' never renders");
  assert.ok(pageTextChars(prose.items) >= MIN_TEXT_CHARS && pageTextChars(thin.items) < MIN_TEXT_CHARS,
    'the floor separates a caption from a body page');
});

test('scaleForViewport aims for OCR-legible pixels, clamped to a memory-safe range', () => {
  const letter = scaleForViewport(612, 792);       // US Letter points
  assert.ok(letter > 1 && letter <= 4, 'a normal page is upscaled for legibility, within the cap');
  assert.equal(scaleForViewport(6000, 8000), 1, 'a huge page is not upscaled into an OOM canvas');
  assert.ok(scaleForViewport(0, 0) > 0, 'a degenerate page still yields a positive scale');
});

test('scaleBbox brings a raster box back to point-space in every box shape', () => {
  assert.deepEqual(scaleBbox({ x0: 20, y0: 40, x1: 220, y1: 88 }, 0.5), { x0: 10, y0: 20, x1: 110, y1: 44 });
  assert.deepEqual(scaleBbox([20, 40, 200, 48], 0.5), [10, 20, 100, 24]);
  assert.deepEqual(scaleBbox([20, 40, 220, 40, 220, 88, 20, 88], 0.5), [10, 20, 110, 20, 110, 44, 10, 44]);
  assert.equal(scaleBbox(null, 0.5), null);
});

test('foldPageReadings: per-page rasters become per-engine, point-space, page-tagged readings', () => {
  // Two pages, each rendered at 2× and read by Tesseract; page 2 also woke the VLM eye.
  const folded = foldPageReadings([
    { page: 1, scale: 2, readings: [
      { engine: 'tesseract', lines: [{ text: 'Page one', bbox: { x0: 20, y0: 40, x1: 200, y1: 80 }, confidence: 90 }] },
    ] },
    { page: 2, scale: 2, readings: [
      { engine: 'tesseract', lines: [{ text: 'Page two', bbox: [20, 40, 180, 40], confidence: 84 }] },
      { engine: 'florence2-ocr', lines: [{ text: 'Page two', bbox: [10, 20, 100, 20], confidence: null }] },
    ] },
    { page: 3, scale: 3, readings: [] },   // rendered but the eyes came up empty — contributes nothing
  ]);

  assert.deepEqual(folded.ocrPages, [1, 2], 'only pages an eye actually read count as OCR pages');
  assert.deepEqual(folded.eyes.sort(), ['florence2-ocr', 'tesseract'], 'every engine that woke is reported once');

  const tess = folded.ocrReadings.find((r) => r.engine === 'tesseract');
  assert.equal(tess.lines.length, 2, 'one engine, its lines gathered across every page it read');
  assert.deepEqual(tess.lines.map((l) => l.page), [1, 2], 'each line keeps its page');
  // The 2× raster box is divided back to point-space: {20,40,200,80} → {10,20,100,40}.
  assert.deepEqual(tess.lines[0].bbox, { x0: 10, y0: 20, x1: 100, y1: 40 }, 'boxes normalised to point-space');
});
