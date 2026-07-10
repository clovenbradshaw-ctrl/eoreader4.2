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

// The organ barrel, resolved relative to THIS module (works wherever the reader is served).
const IN = () => import(new URL('../organs/in/index.js', import.meta.url).href);

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
    return { text: await file.text(), title, meta: { modality: 'text' } };
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

  // Last resort: if it decodes as text, read it as text; otherwise refuse clearly.
  try {
    const text = await file.text();
    if (text && /\S/.test(text) && !/�{3}/.test(text)) return { text, title, meta: { modality: 'text' } };
  } catch {}
  throw new Error('unsupported file type (' + (mime || ext || name) + ')');
}

// ── extractors — each lazy-loads its front-end and hands off to an organ ──────────────

async function fromHtml(file, title, name) {
  const html = await file.text();
  let markdown = html, docTitle = title;
  try {
    const dom = new DOMParser().parseFromString(html, 'text/html');
    const { Readability } = await import('https://cdn.jsdelivr.net/npm/@mozilla/readability@0.5.0/+esm');
    const art = new Readability(dom).parse();
    const Turndown = (await import('https://cdn.jsdelivr.net/npm/turndown@7.2.0/+esm')).default;
    const td = new Turndown({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
    markdown = td.turndown((art && art.content) || dom.body.innerHTML || html);
    if (art && art.title) docTitle = art.title;
  } catch (e) { /* fall back to the raw markup as text */ }
  const { ingestWebpage } = await IN();
  const doc = ingestWebpage({ name, title: docTitle, markdown });
  return { text: doc.text, title: docTitle, meta: { modality: 'webpage', doc } };
}

async function fromPdf(file, title, name, say) {
  const pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.min.mjs');
  try { pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs'; } catch {}
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    pages.push({
      pageNumber: p, width: vp.width, height: vp.height,
      items: tc.items.filter(it => 'str' in it).map(it => ({ str: it.str, transform: it.transform, width: it.width, height: it.height, hasEOL: it.hasEOL })),
    });
    if (p % 5 === 0) say('Read page ' + p + ' / ' + pdf.numPages + '…');
  }
  const { ingestPdf } = await IN();
  const doc = ingestPdf({ name, pages, metadata: { title } });
  if (!doc.text || !doc.text.trim()) throw new Error('this PDF has no text layer — try it as a scanned image');
  return { text: doc.text, title, meta: { modality: 'pdf', doc } };
}

async function fromCsv(file, title, name, ext) {
  const text = await file.text();
  const Papa = (await import('https://cdn.jsdelivr.net/npm/papaparse@5.4.1/+esm')).default;
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, delimiter: ext === 'tsv' ? '\t' : '' });
  const rows = parsed.data || [];
  const columns = (parsed.meta && parsed.meta.fields) || (rows[0] ? Object.keys(rows[0]) : []);
  const { ingestTable } = await IN();
  const doc = ingestTable({ name, columns, rows });
  return { text: doc.sentences.join('\n'), title, meta: { modality: 'table', doc } };
}

async function fromJson(file, title, name) {
  const text = await file.text();
  let data;
  try { data = JSON.parse(text); }
  catch (e) { return { text, title, meta: { modality: 'text' } }; } // not valid JSON — read it as text
  const { ingestJson } = await IN();
  const doc = ingestJson({ name, data });
  return { text: doc.sentences.join('\n'), title, meta: { modality: 'json', doc } };
}

async function fromXlsx(file, title, name) {
  const XLSX = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
  const columns = (grid[0] || []).map(String);
  const rows = grid.slice(1);
  const { ingestTable } = await IN();
  const doc = ingestTable({ name, columns, rows });
  return { text: doc.sentences.join('\n'), title, meta: { modality: 'table', doc } };
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
    if (ocrDoc) return { text: ocrDoc.text, title, meta: { modality: 'ocr', doc: ocrDoc } };

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
    return { text: scene.text, title, meta: { modality: 'image', doc, witness: seen.witness, cached: !!seen.cached } };
  } finally { URL.revokeObjectURL(url); }
}

// Whisper's timestamped chunks → utterances of timed words. Each chunk is a breath group;
// its words get interpolated times, so the audio organ keeps a clock on every word.
function _whisperUtterances(out, norm) {
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
  const buf = await file.arrayBuffer();
  const tmp = new AC();
  let decoded;
  try { decoded = await tmp.decodeAudioData(buf.slice(0)); } finally { try { tmp.close(); } catch {} }
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * SR)), SR);
  const src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start();
  const mono = (await off.startRendering()).getChannelData(0);
  const duration = decoded.duration;

  // A playable handle on the original file, kept for the session so the source can be
  // heard/watched back with the transcript aligned. (Not revoked — playback needs it.)
  const media = (typeof URL !== 'undefined' && URL.createObjectURL) ? URL.createObjectURL(file) : null;

  say('Loading the speech model…');
  const dev = await device();
  const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0/+esm');
  const asr = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-base', { device: dev });
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
  return { text: fullText, title, meta: { modality: 'audio', doc, duration, media, isVideo: !!opts.isVideo, mediaKind: opts.isVideo ? 'video' : 'audio' } };
}
