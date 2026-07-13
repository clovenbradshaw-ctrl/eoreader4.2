// EO: SIG·INS(Void → Entity,Field, Making,Tending) — file import router (organs)
// Unified file import for the reader — one router, lazy extractors, onto the organs.
//
// The reader used to import plain text only (readAsText). This lets it import what the
// ingestion organs already understand: a PDF, a scanned image, an audio or video file, a
// spreadsheet, a web page — each sniffed by type, extracted by the RIGHT front-end, and
// raised onto the spine by the matching organ (src/organs/in). The heavy extractors
// (whisper, pdf.js, Tesseract, Florence-2, SheetJS, Readability) are the same "inject the library,
// bundle nothing" seam the organs assume — so nothing loads until a file of that kind
// actually arrives, and one type's CDN failing never breaks the others.
//
// The contract back to the app is deliberately small: `{ text, title, meta }`. The reader
// ingests `text` exactly as it ingests a pasted book; `meta.modality` records how it was
// read, and `meta.doc` carries the full organ doc (spans, timings, provenance) for callers
// that want the addressable structure rather than just the prose.
//
// THE COVERAGE RECEIPT. Every path also returns `meta.coverage` — the proof that 100% of
// the file's content was processed, or the named account of what could not be:
//   { complete: boolean, dropped: [reason…], …per-modality counts }
// `complete: true` asserts every unit of the source landed in `text`/`meta.doc` (all sheets
// of a workbook, every row and overflow cell of a CSV, every page of a PDF, the full clip).
// When a source genuinely withholds content (a scanned page with no text layer), `complete`
// goes false and `dropped` names exactly what and why — never a silent partial read.

// The organ barrel, resolved relative to THIS module (works wherever the reader is served).
// This module lives at src/rooms/reader/, so the organs are two levels up — the 4.1 path
// (`../organs/`) resolved to a directory that does not exist here, which silently broke
// EVERY non-text import the moment its organ was needed.
const IN = () => import(new URL('../../organs/in/index.js', import.meta.url).href);

// WebGPU if the browser offers it, else WASM — the same probe transcribe.html uses.
let _device = null;
const device = async () => {
  if (_device) return _device;
  _device = 'wasm';
  try { if (typeof navigator !== 'undefined' && navigator.gpu && await navigator.gpu.requestAdapter()) _device = 'webgpu'; } catch {}
  return _device;
};

const TEXT_EXT  = ['txt', 'md', 'markdown', 'text', 'log', 'rst'];
const HTML_EXT  = ['html', 'htm', 'xhtml'];
const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tif', 'tiff'];
const AUDIO_EXT = ['mp3', 'm4a', 'wav', 'ogg', 'oga', 'flac', 'aac', 'opus', 'weba'];
const VIDEO_EXT = ['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v'];
const extOf  = (name) => (String(name || '').split('.').pop() || '').toLowerCase();
const titleOf = (name) => String(name || 'file').replace(/\.[^.]+$/, '');

// importAnyFile(file, { onProgress }) → { text, title, meta }.
export async function importAnyFile(file, opts = {}) {
  const name = file.name || 'file';
  const ext = extOf(name);
  const mime = (file.type || '').toLowerCase();
  const title = titleOf(name);
  const say = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};

  // TEXT / Markdown — no extractor, no module load.
  if (mime.startsWith('text/plain') || TEXT_EXT.includes(ext)) {
    const text = await file.text();
    return { text, title, meta: { modality: 'text', coverage: { complete: true, chars: text.length, dropped: [] } } };
  }

  // HTML / scraped page — Readability strips the chrome, Turndown → Markdown, webpage organ.
  if (mime.includes('html') || HTML_EXT.includes(ext)) {
    say('Reading the page…');
    return await fromHtml(file, title, name);
  }

  // Native-text PDF — pdf.js text-items with geometry, kept as spans (pdf organ).
  if (mime === 'application/pdf' || ext === 'pdf') {
    say('Reading the PDF…');
    return await fromPdf(file, title, name, say);
  }

  // Spreadsheet — SheetJS rows; CSV/TSV — Papaparse (table organ).
  if (/sheet|excel|spreadsheet/.test(mime) || ext === 'xlsx' || ext === 'xls') {
    say('Reading the spreadsheet…');
    return await fromXlsx(file, title, name);
  }
  if (mime.includes('csv') || mime.includes('tab-separated') || ext === 'csv' || ext === 'tsv') {
    say('Reading the table…');
    return await fromCsv(file, title, name, ext);
  }

  // JSON — parsed to a key-path tree (json organ). Malformed JSON falls through to text.
  if (mime.includes('json') || ext === 'json') {
    say('Reading the JSON…');
    return await fromJson(file, title, name);
  }

  // Image — a scan reads as a document (Tesseract word boxes, ocr organ); a photograph,
  // where OCR finds no prose, reads as a SCENE (Florence-2 regions, image organ).
  if (mime.startsWith('image/') || IMAGE_EXT.includes(ext)) {
    say('Recognizing the text…');
    return await fromImage(file, title, name, say);
  }

  // Audio / video — decode, then whisper hears it (audio organ). The speech only.
  if (mime.startsWith('audio/') || mime.startsWith('video/') || AUDIO_EXT.includes(ext) || VIDEO_EXT.includes(ext)) {
    say('Listening…');
    const isVideo = mime.startsWith('video/') || VIDEO_EXT.includes(ext);
    return await fromMedia(file, title, name, say, { ...opts, isVideo });
  }

  // If it decodes as text, read it as text.
  try {
    const text = await file.text();
    if (text && /\S/.test(text) && !/�{3}/.test(text))
      return { text, title, meta: { modality: 'text', coverage: { complete: true, chars: text.length, dropped: [] } } };
  } catch {}

  // Last resort — data is data: NO file is refused. The whole byte stream is admitted:
  // its identity is fixed (size + sha-256), and every printable run it carries is swept
  // onto the spine as an addressable block (the `strings` reading). Nothing is dropped;
  // what isn't text is still recorded, whole, as the bytes it is.
  say('Reading the bytes…');
  return await fromBinary(file, title, name, mime);
}

// ── coverage helpers — pure, exported for tests ────────────────────────────────────────

// The Readability retention gate. Readability exists to strip navigation chrome, but when
// it misfires it can return a sliver of the page — and taking that sliver unconditionally
// silently drops the rest of the document. Keep the extraction only when it retained at
// least half of the page's own text; below that, fall back to the FULL body and let the
// engine's chrome/frame layers hold the noise (they exist for exactly that).
const READABILITY_RETAIN = 0.5;
export const _keepExtract = (extractChars, bodyChars) =>
  bodyChars <= 0 || extractChars >= READABILITY_RETAIN * bodyChars;

// A workbook sheet's grid (array-of-arrays, row 0 the header) → the { columns, rows }
// shape ingestTable eats. Pure so the all-sheets sweep is testable without SheetJS.
export const _tableFromGrid = (grid = []) => ({
  columns: (grid[0] || []).map(String),
  rows: grid.slice(1),
});

// strings(1) over a byte array: the maximal runs of printable ASCII (+ tab), each at
// least `min` chars, with their byte offsets — so every run stays addressable back into
// the file it came from. The sweep visits every byte; what it returns is every piece of
// text the byte stream carries.
export const _printableRuns = (bytes, min = 4) => {
  const runs = [];
  // Runs are pure printable ASCII, so the default decoder reproduces them 1:1 — and
  // decoding the subarray at flush time costs one string per run, where a per-byte
  // String.fromCharCode array cost ~10-16x the file's size on a big binary import.
  const td = new TextDecoder();
  let start = -1;
  const flush = (end) => {
    if (start >= 0 && end - start >= min) runs.push({ text: td.decode(bytes.subarray(start, end)), start, end });
    start = -1;
  };
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if ((b >= 0x20 && b <= 0x7e) || b === 0x09) { if (start < 0) start = i; }
    else flush(i);
  }
  flush(bytes.length);
  return runs;
};

// ── extractors — each lazy-loads its front-end and hands off to an organ ──────────────

async function fromHtml(file, title, name) {
  const html = await file.text();
  let markdown = html, docTitle = title;
  let reader = 'raw-markup', retained = 1;
  try {
    // Readability needs the live DOM; parse a second copy for it, since it mutates what
    // it reads — the pristine `dom` stays the measure of what the page actually holds.
    const dom = new DOMParser().parseFromString(html, 'text/html');
    const bodyChars = (dom.body?.textContent || '').replace(/\s+/g, ' ').trim().length;
    let art = null;
    try {
      const { Readability } = await import('https://cdn.jsdelivr.net/npm/@mozilla/readability@0.5.0/+esm');
      art = new Readability(new DOMParser().parseFromString(html, 'text/html')).parse();
    } catch (e) { /* Readability unavailable — the full body below still stands */ }
    // The retention gate: Readability strips chrome, but a misfire returns a sliver and
    // taking it unconditionally silently drops the rest of the document. Keep the
    // extraction only when it retained the bulk of the page's own text; otherwise read
    // the FULL body and let the engine's chrome/frame layers hold the noise.
    const artText = art?.content ? String(art.textContent || '').replace(/\s+/g, ' ').trim() : '';
    const useArt = !!(art && art.content) && _keepExtract(artText.length, bodyChars);
    const Turndown = (await import('https://cdn.jsdelivr.net/npm/turndown@7.2.0/+esm')).default;
    const td = new Turndown({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
    markdown = td.turndown(useArt ? art.content : (dom.body?.innerHTML || html));
    reader = useArt ? 'readability' : 'full-body';
    retained = useArt && bodyChars > 0 ? Math.round(artText.length / bodyChars * 100) / 100 : 1;
    if (art && art.title) docTitle = art.title;
  } catch (e) { /* fall back to the raw markup as text */ }
  const { ingestWebpage } = await IN();
  const doc = ingestWebpage({ name, title: docTitle, markdown });
  return { text: doc.text, title: docTitle, meta: { modality: 'webpage', doc,
    coverage: { complete: true, reader, retained, blocks: doc.spans.length, dropped: [] } } };
}

async function fromPdf(file, title, name, say) {
  const pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.min.mjs');
  try { pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs'; } catch {}
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages = [];
  const textlessPages = [];   // pages whose text layer is empty (scanned/pictorial) — accounted, never silent
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items = tc.items.filter(it => 'str' in it).map(it => ({ str: it.str, transform: it.transform, width: it.width, height: it.height, hasEOL: it.hasEOL }));
    if (!items.some(it => /\S/.test(it.str))) textlessPages.push(p);
    pages.push({ pageNumber: p, width: vp.width, height: vp.height, items });
    if (p % 5 === 0) say('Read page ' + p + ' / ' + pdf.numPages + '…');
  }
  const { ingestPdf } = await IN();
  const doc = ingestPdf({ name, pages, metadata: { title } });
  if (!doc.text || !doc.text.trim()) throw new Error('this PDF has no text layer — try it as a scanned image');
  // A mixed PDF (born-digital pages + scans) used to lose its scanned pages in silence.
  // They still carry no text here — OCR is the image path's job — but the coverage
  // receipt now names every one, and the reader is told at import time.
  if (textlessPages.length) say(`Note: ${textlessPages.length} page(s) had no text layer (p. ${textlessPages.join(', ')}) — import those as images to OCR them.`);
  const coverage = {
    complete: textlessPages.length === 0,
    pages: pdf.numPages, pagesWithText: pdf.numPages - textlessPages.length, textlessPages,
    dropped: textlessPages.length ? [`${textlessPages.length} page(s) with no text layer (likely scanned): p. ${textlessPages.join(', ')}`] : [],
  };
  return { text: doc.text, title, meta: { modality: 'pdf', doc, coverage } };
}

async function fromCsv(file, title, name, ext) {
  const text = await file.text();
  const Papa = (await import('https://cdn.jsdelivr.net/npm/papaparse@5.4.1/+esm')).default;
  // header:false — the raw grid, full fidelity. Header mode loses content two ways: a row
  // wider than the header parks cells in __parsed_extra, and DUPLICATE header names collapse
  // onto one object key (the later cell silently overwrites the earlier) before the organ
  // ever sees them. The positional grid keeps every cell; ingestTable widens the header to
  // fit the raggedest row and dedupes colliding column keys itself.
  const parsed = Papa.parse(text, { header: false, skipEmptyLines: true, delimiter: ext === 'tsv' ? '\t' : '' });
  const { columns, rows } = _tableFromGrid(parsed.data || []);
  const { ingestTable } = await IN();
  const doc = ingestTable({ name, columns, rows });
  // Papaparse reports what it could not read cleanly (bad quotes, delimiter trouble) in
  // `errors`; those rows still land (Papa keeps parsing), but the receipt carries them.
  const errors = (parsed.errors || []).map(e => `row ${e.row ?? '?'}: ${e.message}`);
  return { text: doc.sentences.join('\n'), title, meta: { modality: 'table', doc,
    coverage: { complete: true, rows: rows.length, columns: doc.columns.length, parseErrors: errors, dropped: [] } } };
}

async function fromJson(file, title, name) {
  const text = await file.text();
  let data;
  try { data = JSON.parse(text); }
  catch (e) { // not valid JSON — read it whole as text
    return { text, title, meta: { modality: 'text', coverage: { complete: true, chars: text.length, dropped: [] } } };
  }
  const { ingestJson } = await IN();
  const doc = ingestJson({ name, data });
  return { text: doc.sentences.join('\n'), title, meta: { modality: 'json', doc,
    coverage: { complete: true, leaves: doc.counts.leaves, containers: doc.counts.containers, dropped: [] } } };
}

async function fromXlsx(file, title, name) {
  const XLSX = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
  const { ingestTable, createCompositeDoc } = await IN();
  // EVERY sheet — a workbook is not its first tab. Each sheet ingests as its own table
  // doc; a multi-sheet book composes them into ONE doc on the universal contract
  // (organs/in/composite.js), provenance kept per sheet, and the text carries every
  // sheet under its own heading.
  const sheets = [];
  for (const sheetName of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, blankrows: false, defval: '' });
    if (!grid.length) { sheets.push({ sheetName, doc: null, empty: true }); continue; }
    const { columns, rows } = _tableFromGrid(grid);
    const docName = wb.SheetNames.length > 1 ? `${name}#${sheetName}` : name;
    sheets.push({ sheetName, doc: ingestTable({ name: docName, columns, rows, metadata: { title, sheet: sheetName } }) });
  }
  const filled = sheets.filter(s => s.doc);
  if (!filled.length) throw new Error('this workbook has no rows on any sheet');
  const text = filled.length === 1
    ? filled[0].doc.sentences.join('\n')
    : filled.map(s => `## Sheet: ${s.sheetName}\n${s.doc.sentences.join('\n')}`).join('\n\n');
  const doc = filled.length === 1 ? filled[0].doc : createCompositeDoc(filled.map(s => s.doc));
  const emptySheets = sheets.filter(s => s.empty).map(s => s.sheetName);
  const coverage = {
    complete: true,
    sheets: wb.SheetNames.length, sheetsWithRows: filled.length,
    rows: filled.reduce((n, s) => n + s.doc.records.length, 0),
    // An empty sheet has no content to lose — noted for the record, not a drop.
    emptySheets,
    dropped: [],
  };
  return { text, title, meta: { modality: 'table', doc, docs: filled.map(s => s.doc), sheetNames: wb.SheetNames, coverage } };
}

// An image is read twice over. First as a DOCUMENT: Tesseract asks "is there prose in
// these pixels?" — milliseconds against the vision model's seconds, so OCR is the cheap
// gate in front of the expensive autoregressive decoder. Only when that reading comes up
// empty (a photograph, not a scan) does the vision organ wake: Florence-2's structured
// region captions (src/reader/eo/vision.js, content-address-cached in OPFS) composed into
// spatial prose by the scene composer (organs/in/scene.js) and raised onto the spine by
// the image organ. What used to be the dead end "no text found in the image" is now the
// scene path.
let _vision = null;
async function fromImage(file, title, name, say) {
  const url = URL.createObjectURL(file);
  try {
    let ocrDoc = null;
    try {
      const Tesseract = (await import('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/+esm')).default;
      const { data } = await Tesseract.recognize(url, 'eng', { logger: (m) => { if (m.status === 'recognizing text' && m.progress != null) say('Recognizing… ' + Math.round(m.progress * 100) + '%'); } });
      const lines = (data.lines || []).map(ln => ({ text: ln.text, bbox: ln.bbox, confidence: ln.confidence }));
      const { ingestOcr } = await IN();
      const doc = ingestOcr({ name, lines: lines.length ? lines : [{ text: data.text || '' }] });
      // Enough letters to call it a document? A photograph makes Tesseract hallucinate a
      // few stray glyphs; those must not gate the scene reading off.
      if (((doc.text || '').match(/[\p{L}\p{N}]/gu) || []).length >= 12) ocrDoc = doc;
    } catch (e) { /* OCR unavailable or failed — the scene reading below still stands */ }
    if (ocrDoc) return { text: ocrDoc.text, title, meta: { modality: 'ocr', doc: ocrDoc,
      coverage: { complete: true, lines: ocrDoc.spans.length, dropped: [] } } };

    say('No text in the image — looking at the scene…');
    if (!_vision) {
      const { createFlorenceVision } = await import(new URL('./eo/vision.js', import.meta.url).href);
      _vision = createFlorenceVision();
    }
    const seen = await _vision.describe(file, { onProgress: (m) => { if (m && m.status === 'progress' && m.progress != null) say('Loading the vision model… ' + Math.round(m.progress) + '%'); } });
    const { composeScene, ingestImage } = await IN();
    const scene = composeScene({ ...seen, name, metadata: { title } });
    if (!scene.text || !scene.text.trim()) throw new Error('nothing recognizable in the image');
    const doc = ingestImage(scene);
    return { text: scene.text, title, meta: { modality: 'image', doc, witness: seen.witness, cached: !!seen.cached,
      coverage: { complete: true, regions: (scene.regions || []).length, dropped: [] } } };
  } finally { URL.revokeObjectURL(url); }
}

// One whisper pipeline per session — the model is ~150 MB of WASM/WebGPU memory, so a
// second import or recording must reuse the first load, never stack another instance.
// Exported: the live-microphone cochlea (record-audio.js) hears through the same ear.
let _asrLoad = null;
export const _loadWhisper = () => {
  if (!_asrLoad) {
    _asrLoad = (async () => {
      const dev = await device();
      const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0/+esm');
      const asr = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-base', { device: dev });
      return { asr, dev };
    })();
    _asrLoad.catch(() => { _asrLoad = null; });   // a failed load stays retryable
  }
  return _asrLoad;
};

// Whisper's timestamped chunks → utterances of timed words. Each chunk is a breath group;
// its words get interpolated times, so the audio organ keeps a clock on every word.
// Exported: the live-microphone cochlea (record-audio.js) hears through the same ear.
export function _whisperUtterances(out, norm) {
  const utterances = [];
  for (const ch of (out && out.chunks) || []) {
    const ts = ch.timestamp || []; let a = ts[0], b = ts[1];
    const txt = String(ch.text || '').trim(); if (!txt || a == null) continue; if (b == null || b <= a) b = a + 0.5;
    const ws = txt.split(/\s+/).filter(Boolean); const tot = ws.reduce((s, w) => s + w.length, 0) || 1;
    let t = a; const words = [];
    for (const w of ws) { const d = (b - a) * (w.length / tot); words.push({ text: w, norm: norm(w), start: a + (t - a), end: a + (t - a) + d }); t += d; }
    if (words.length) utterances.push({ start: a, end: b, words });
  }
  return utterances;
}

// Transcribe the waveform WINDOW BY WINDOW so the reading can be watched as it happens.
// Whisper's native context is 30s; we decode one 30s window at a time (a 5s overlap so a
// word straddling a boundary is still heard whole), offset each window's word times back
// to the absolute clock, and drop the duplicates the overlap produces. After every window
// `onPartial({ text, pct })` fires — that is the "see it while it's processing" feed. A
// clip ≤30s is a single window, byte-for-byte the old one-shot decode.
export async function _transcribeWindows(asr, mono, SR, duration, norm, { onPartial } = {}) {
  const WIN = 30, HOP = 25, DEDUP = 0.2;   // seconds: window, hop, overlap-dedup tolerance
  const denom = Math.max(duration, 0.001);
  const utterances = [];
  let lastEnd = -Infinity, acc = '';
  for (let a = 0; a === 0 || a < duration; a += HOP) {
    const b = Math.min(a + WIN, Math.max(duration, a + 0.001));   // a ≤30s window; a short clip is one pass
    const seg = mono.slice(Math.floor(a * SR), Math.max(Math.floor(a * SR) + 1, Math.ceil(b * SR)));
    const out = await asr(seg, { return_timestamps: true });
    for (const u of _whisperUtterances(out, norm)) {
      const words = [];
      for (const w of u.words) {
        const ws = w.start + a, we = Math.max(w.end + a, w.start + a);
        if (ws < lastEnd - DEDUP) continue;             // already heard in the prior window's overlap
        words.push({ ...w, start: ws, end: we });
        lastEnd = Math.max(lastEnd, we);
      }
      if (words.length) utterances.push({ start: words[0].start, end: words[words.length - 1].end, words });
    }
    const text = utterances.map(u => u.words.map(w => w.text).join(' ')).join(' ').trim();
    if (text.length > acc.length) acc = text;
    if (typeof onPartial === 'function') { try { onPartial({ text: acc, pct: Math.min(100, Math.round(b / denom * 100)) }); } catch {} }
    if (b >= duration) break;
  }
  return { utterances, text: acc };
}

async function fromMedia(file, title, name, say, opts = {}) {
  const SR = 16000;
  // Decode to mono 16 kHz — the rate whisper wants — via an offline graph.
  const AC = (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext));
  if (!AC) throw new Error('this browser cannot decode audio');
  // Guard the guaranteed-OOM cases before allocating: the decode materializes the WHOLE
  // clip as full-rate PCM (1h of stereo 44.1kHz ≈ 1.3GB) in a tab that may also hold
  // model weights — past these (generous) bounds the import would crash the tab, not land.
  if (file.size > 500 * 1024 * 1024) throw new Error('this clip is too large to decode in the browser (over 500 MB) — split it or transcribe a compressed copy');
  const buf = await file.arrayBuffer();
  const tmp = new AC();
  let decoded;
  try { decoded = await tmp.decodeAudioData(buf); } finally { try { tmp.close(); } catch {} }
  const duration = decoded.duration;
  if (duration > 3 * 3600) throw new Error('this clip is too long to transcribe in the browser (over 3 hours) — split it first');
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(duration * SR)), SR);
  const src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start();
  const mono = (await off.startRendering()).getChannelData(0);
  decoded = null;   // release the full-rate PCM before whisper holds the tab for minutes

  // A playable handle on the original file, kept for the session so the source can be
  // heard/watched back with the transcript aligned. (Not revoked — playback needs it.)
  const media = (typeof URL !== 'undefined' && URL.createObjectURL) ? URL.createObjectURL(file) : null;

  say('Loading the speech model…');
  const { asr, dev } = await _loadWhisper();
  const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
  const witness = `whisper-base · ${dev}`;

  say('Transcribing…');
  // Live, windowed — the growing transcript streams back through onPartial so the reader
  // sees it fill in as it lands, instead of watching a spinner until it's all done.
  const { utterances, text: liveText } = await _transcribeWindows(asr, mono, SR, duration, norm, {
    onPartial: (p) => { if (typeof opts.onPartial === 'function') opts.onPartial(p); },
  });

  // A transcript is one READING, not the objective truth of the waveform. When "audit readings"
  // is on, take a SECOND witness — the same model relistening with a different chunking — so its
  // divergences from the first pass become auditable EVA events instead of a silent single answer.
  const alternates = [];
  if (opts.twoWitness) {
    say('Relistening for a second reading…');
    try {
      const out2 = await asr(mono, { return_timestamps: true, chunk_length_s: 20, stride_length_s: 3 });
      const altWords = _whisperUtterances(out2, norm).flatMap(u => u.words);
      if (altWords.length) alternates.push({ label: `whisper-base relisten · ${dev}`, words: altWords });
    } catch (e) { /* the second witness is best-effort; the first reading still stands */ }
  }

  const fullText = (liveText || utterances.map(u => u.words.map(w => w.text).join(' ')).join(' ')).trim();
  if (!fullText) throw new Error('no speech found in the file');

  const { ingestAudio } = await IN();
  const doc = ingestAudio({ name, duration, device: dev, witness, utterances, alternates, media });
  // The windowed decode walks the WHOLE waveform (0 → duration, overlapping hops), so the
  // clip is heard end to end; the receipt records how far the last heard word reaches.
  const lastHeard = utterances.length ? utterances[utterances.length - 1].end : 0;
  return { text: fullText, title, meta: { modality: 'audio', doc, duration, media, isVideo: !!opts.isVideo, mediaKind: opts.isVideo ? 'video' : 'audio',
    coverage: { complete: true, seconds: Math.round(duration * 10) / 10, heardTo: Math.round(lastHeard * 10) / 10, utterances: utterances.length, dropped: [] } } };
}

// Data is data — the universal fallback, so importAnyFile refuses NOTHING. The byte
// stream is admitted whole: fixity first (size + sha-256, computable before any reading
// of it), then the `strings` sweep — every printable run the bytes carry, each an
// addressable block with its byte offsets, assembled on the same spine every other
// modality lands on (organs/in/document.js, which also attaches the EoT reading).
async function fromBinary(file, title, name, mime) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let sha = null;
  try {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    sha = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  } catch { /* no WebCrypto — the bytes are still admitted, just unhashed */ }
  const runs = _printableRuns(bytes);
  const { assembleDocument } = await IN();
  const blocks = runs.map(r => ({ text: r.text, kind: 'strings', ref: { byteStart: r.start, byteEnd: r.end } }));
  const doc = assembleDocument({
    name, modality: 'binary', blocks,
    metadata: { title, bytes: bytes.length, ...(mime ? { mime } : {}), ...(sha ? { sha256: sha } : {}) },
    extra: { bytes: bytes.length, sha256: sha },
  });
  const text = doc.text && doc.text.trim()
    ? doc.text
    : `${name}: binary file, ${bytes.length.toLocaleString()} bytes${sha ? `, sha-256 ${sha}` : ''} — no printable text runs.`;
  return { text, title, meta: { modality: 'binary', doc,
    coverage: { complete: true, bytes: bytes.length, printableRuns: runs.length,
                printableChars: runs.reduce((s, r) => s + r.text.length, 0), sha256: sha, dropped: [] } } };
}
