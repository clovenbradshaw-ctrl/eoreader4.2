// EO: SIG·INS(Void → Entity,Field, Making,Tending) — file import router (organs)
// Unified file import for the reader — one router, lazy extractors, onto the organs.
//
// The reader used to import plain text only (readAsText). This lets it import what the
// ingestion organs already understand: a PDF, a scanned image, an audio or video file, a
// spreadsheet, a web page, a MIDI score — each sniffed by type, extracted by the RIGHT front-end, and
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

// The MIDI reader is a pure, dependency-free local module (no CDN, no browser API), so —
// unlike the heavy extractors — it is safe to bind statically; the summary uses its
// pitch-namer directly rather than a lazily-rebound global.
import { parseMidi, midiNoteName } from './midi.js'; import { fromSubtitle } from './import-subtitle.js';

// WebGPU if the browser offers it, else WASM — the same probe transcribe.html uses.
let _device = null;
const device = async () => {
  if (_device) return _device;
  _device = 'wasm';
  try { if (typeof navigator !== 'undefined' && navigator.gpu && await navigator.gpu.requestAdapter()) _device = 'webgpu'; } catch {}
  return _device;
};

const TEXT_EXT  = ['txt', 'text', 'log', 'rst'], HTML_EXT = ['html', 'htm', 'xhtml'];
const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tif', 'tiff'];
const AUDIO_EXT = ['mp3', 'm4a', 'wav', 'ogg', 'oga', 'flac', 'aac', 'opus', 'weba'], VIDEO_EXT = ['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v'];
const MIDI_EXT  = ['mid', 'midi', 'smf', 'kar', 'rmi'], SUBTITLE_EXT = ['srt', 'vtt'];
// Markdown is its OWN modality (not folded into TEXT_EXT above) so the Native tab can render
// it typeset (markdown-render.js) instead of the plain reflow every other text file gets.
const MD_EXT = ['md', 'markdown'];
// A recognised source-code extension → the language name code-highlight.js's LANGS table
// keys on, so `source.language` needs no translation to reach the highlighter. This is the
// kind:'code' the source-viewer UI already has a landing-page case and an explorer genre
// chip for (index.html's _sourceLandingVM, _genre) — nothing before this ever produced it.
const CODE_LANG_BY_EXT = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp', cs: 'csharp', php: 'php',
  sh: 'shell', bash: 'shell', sql: 'sql', css: 'css', scss: 'css', less: 'css',
  yml: 'yaml', yaml: 'yaml',
};
const extOf  = (name) => (String(name || '').split('.').pop() || '').toLowerCase();
const titleOf = (name) => String(name || 'file').replace(/\.[^.]+$/, '');

// importAnyFile(file, { onProgress }) → { text, title, meta }.
export async function importAnyFile(file, opts = {}) {
  const name = file.name || 'file';
  const ext = extOf(name);
  const mime = (file.type || '').toLowerCase();
  const title = titleOf(name);
  const say = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};

  if (mime.includes('subrip') || mime.includes('vtt') || SUBTITLE_EXT.includes(ext)) { say('Reading the captions…'); return await fromSubtitle(file, title, name); }   // timed cues (import-subtitle.js) — checked before plain-text below

  // Markdown — read verbatim (no extractor, no module load); the Native tab typesets it.
  if (MD_EXT.includes(ext)) {
    const text = await file.text();
    return { text, title, meta: { modality: 'markdown', coverage: { complete: true, chars: text.length, dropped: [] } } };
  }

  // Source code — checked by extension, not mime (a code file's browser-reported mime is
  // inconsistent — often empty or generic — so the extension is the only reliable signal).
  // Read verbatim, same as plain text below; the background read (parseText) is the same
  // one a text file gets too, so this costs nothing extra — it only tags what the file IS.
  if (CODE_LANG_BY_EXT[ext]) {
    const text = await file.text();
    return { text, title, meta: { modality: 'code', language: CODE_LANG_BY_EXT[ext], coverage: { complete: true, chars: text.length, dropped: [] } } };
  }

  // TEXT — no extractor, no module load.
  if (mime.startsWith('text/plain') || TEXT_EXT.includes(ext)) {
    const text = await file.text();
    return { text, title, meta: { modality: 'text', coverage: { complete: true, chars: text.length, dropped: [] } } };
  }

  // HTML / scraped page — Readability strips the chrome, Turndown → Markdown, webpage organ.
  if (mime.includes('html') || HTML_EXT.includes(ext)) {
    say('Reading the page…');
    return await fromHtml(file, title, name);
  }

  // PDF — the born-digital text layer AND the OCR of the natively-rendered page, reconciled by
  // the quorum (pdf organ). Scanned pages that carry no text layer are read from their pixels;
  // a clean born-digital page takes the text-layer-only fast path. Geometry kept as spans.
  if (mime === 'application/pdf' || ext === 'pdf') {
    say('Reading the PDF…');
    try { return await fromPdf(file, title, name, say, opts); }
    catch (e) {
      // pdf.js is a browser-side, CDN-loaded extractor. If that loader is offline/blocked (or a
      // browser refuses the worker module), the import must still LAND as a PDF source: the original
      // bytes are preserved by app/paper.js for the PDF surface, and the universal byte reader gives
      // the record a fixity-backed floor instead of failing the whole ingestion.
      say('PDF text extraction is unavailable — recording the PDF bytes…');
      const got = await fromBinary(file, title, name, mime || 'application/pdf');
      const reason = `PDF text extraction unavailable: ${String(e?.message || e).slice(0, 140)}`;
      return { ...got, meta: {
        ...got.meta,
        modality: 'pdf',
        extraction: 'binary-fallback',
        coverage: { ...(got.meta?.coverage || {}), complete: false,
          dropped: [...(got.meta?.coverage?.dropped || []), reason] },
      } };
    }
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
    return await fromImage(file, title, name, say, opts);
  }

  // MIDI — a SCORE, not audio: no waveform to hear, a timed list of notes to READ. Decoded
  // to a note sequence and raised by the music organ (pitch-class entities, interval bonds).
  // Checked before the audio branch because an `audio/midi` mime would otherwise be sent to
  // whisper, which has no waveform to decode.
  if (mime.includes('midi') || MIDI_EXT.includes(ext)) {
    say('Reading the score…');
    // A file that CLAIMS to be MIDI but isn't (a mislabeled .mid) falls through to the
    // universal byte reader rather than erroring — no file is refused.
    try { return await fromMidi(file, title, name); }
    catch (e) { say('Not a MIDI score — reading the bytes…'); return await fromBinary(file, title, name, mime); }
  }

  // Audio / video — decode the waveform, whisper hears it (audio organ); a VIDEO also has its PICTURE
  // read as motion + born-rule entities (motion.js), both senses folded onto the one source.
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

// The signature of a binary/structured format (PDF object syntax, mostly) surviving a UTF-8 text
// decode it was never meant for — `1 0 obj<<`, `endobj`, `stream`, `/Type /Page`, `xref`, `trailer`
// — plus the replacement-character scar (�) that decode leaves on the bytes it couldn't
// represent. Either signal alone can be a false positive (a paper THAT DISCUSSES PDF internals, a
// glyph); together, at these thresholds, they mark text a caller must not admit as ordinary prose.
const PDF_SYNTAX_RE = /\d+\s+\d+\s+obj\b|\bendobj\b|\bendstream\b|\/Type\s*\/(?:Page|Catalog|Font|XObject|Pages)\b|^\s*%PDF-\d|\bxref\b|\btrailer\b/m;
export const _looksLikeBinaryGarbage = (text) => {
  const sample = String(text || '').slice(0, 20000);
  if (!sample.trim()) return false;
  const replacementRatio = (sample.match(/�/g) || []).length / sample.length;
  const pdfHits = (sample.match(new RegExp(PDF_SYNTAX_RE, 'gm')) || []).length;
  return replacementRatio > 0.02 || pdfHits >= 3;
};

// mm:ss for a duration in seconds — the reader's clock, so a 3-minute piece reads "3:04".
const _clock = (sec) => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// A MIDI score → the human-readable reading shown as the document: what the file IS
// (format, tempo, key, meter, duration), what plays it (each track's instrument and note
// count), and what it plays (the pitch-class histogram + the opening melodic line). Pure,
// so the summary is pinned by a browserless test against a parsed score. `parsed` is a
// parseMidi() result; the note graph itself is raised separately by ingestMusic.
export const _midiSummary = (parsed, title = 'MIDI file') => {
  const { format, ppq, smpte, trackCount, notes = [], tracks = [], durationSec = 0,
          tempos = [], timeSignatures = [], keySignatures = [] } = parsed || {};
  const lines = [];
  lines.push(`# ${parsed?.name || title}`);
  lines.push('');
  const timing = smpte ? `SMPTE ${smpte.framesPerSec} fps` : `${ppq} ticks/quarter`;
  lines.push(`A Standard MIDI File — a musical score of ${notes.length.toLocaleString()} notes across ${trackCount} track${trackCount === 1 ? '' : 's'} (format ${format}, ${timing}).`);
  lines.push('');

  // The facts a listener would ask for first — tempo, meter, key, length.
  const bpms = [...new Set(tempos.map((t) => t.bpm))];
  if (bpms.length) lines.push(`- **Tempo:** ${bpms.length === 1 ? `${bpms[0]} BPM` : `${bpms.length} changes (${bpms.slice(0, 4).join(', ')}${bpms.length > 4 ? '…' : ''} BPM)`}`);
  if (timeSignatures.length) lines.push(`- **Time signature:** ${[...new Set(timeSignatures.map((t) => `${t.numerator}/${t.denominator}`))].join(', ')}`);
  const keys = [...new Set(keySignatures.map((k) => k.name).filter(Boolean))];
  if (keys.length) lines.push(`- **Key:** ${keys.join(', ')}`);
  lines.push(`- **Duration:** ${_clock(durationSec)} (${durationSec.toFixed(1)}s)`);

  // The pitch range and the pitch-class histogram — the piece's raw tonal content.
  if (notes.length) {
    const midis = notes.map((n) => n.midi);
    const lo = Math.min(...midis), hi = Math.max(...midis);
    lines.push(`- **Range:** ${midiNoteName(lo)} – ${midiNoteName(hi)} (${hi - lo} semitones)`);
    const counts = new Map();
    for (const n of notes) counts.set(n.pc, (counts.get(n.pc) || 0) + 1);
    const hist = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    lines.push(`- **Pitch classes:** ${hist.map(([pc, c]) => `${pc}×${c}`).join('  ')}`);
  }
  lines.push('');

  // Who plays — one row per SOUNDING track, with its instrument and how much it plays. A
  // conductor/meta track (tempo and key, no notes) carries no voice; its facts already
  // surfaced above, so it is counted, not listed.
  const voiced = tracks.filter((t) => t.noteCount > 0);
  if (voiced.length) {
    lines.push('## Tracks');
    for (const t of voiced) {
      const label = t.name || (t.isPercussion ? 'Percussion' : `Track ${t.index}`);
      const inst = t.instrument ? ` — ${t.instrument}` : '';
      const rng = ` · ${midiNoteName(Math.min(...t.notes.map((n) => n.midi)))}–${midiNoteName(Math.max(...t.notes.map((n) => n.midi)))}`;
      lines.push(`- **${label}**${inst}: ${t.noteCount} note${t.noteCount === 1 ? '' : 's'}${rng}`);
    }
    if (voiced.length < tracks.length) lines.push(`- _(${tracks.length - voiced.length} conductor/meta track${tracks.length - voiced.length === 1 ? '' : 's'} with no notes)_`);
    lines.push('');
  }

  // What it plays — the opening line, note names in time order, so the melody is legible
  // as text (and every note is on the spine as a pitch-class entity besides).
  if (notes.length) {
    lines.push('## Opening line');
    const head = notes.slice(0, 48).map((n) => n.name);
    lines.push(head.join(' ') + (notes.length > 48 ? ' …' : ''));
  }
  return lines.join('\n');
};

// ── extractors — each lazy-loads its front-end and hands off to an organ ──────────────

async function fromMidi(file, title, name) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const parsed = parseMidi(bytes);

  // The note graph: every note in time order, each carrying its clock, handed to the music
  // organ (pitch-class entities + interval bonds). Nothing is dropped — the whole score.
  const { ingestMusic } = await IN();
  const doc = ingestMusic({
    name,
    notes: parsed.notes.map((n) => ({ name: n.name, midi: n.midi, start: n.start, dur: n.dur, velocity: n.velocity, track: n.track, channel: n.channel })),
    metadata: {
      title: parsed.name || title,
      ...(parsed.tempos[0] ? { tempo: `${parsed.tempos[0].bpm} BPM` } : {}),
      ...(parsed.keySignatures[0]?.name ? { key: parsed.keySignatures[0].name } : {}),
      ...(parsed.timeSignatures[0] ? { meter: `${parsed.timeSignatures[0].numerator}/${parsed.timeSignatures[0].denominator}` } : {}),
      format: `SMF format ${parsed.format}`,
    },
  });
  // The doc's readable text is the score summary, not the bare pitch-class list — so the
  // source tab shows what the file is and plays, and `midi` carries the full decode for a
  // richer viewer (a piano roll) that wants the addressable notes rather than the prose.
  const text = _midiSummary(parsed, title);
  doc.text = text;
  doc.midi = parsed;

  const dropped = parsed.hangingNotes ? [`${parsed.hangingNotes} note(s) had no note-off and were not sounded`] : [];
  return { text, title: parsed.name || title, meta: { modality: 'music', doc, midi: parsed,
    coverage: { complete: dropped.length === 0, notes: parsed.notes.length, tracks: parsed.trackCount,
                seconds: Math.round(parsed.durationSec * 10) / 10, warnings: parsed.warnings, dropped } } };
}


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

// A PDF is read by MORE THAN ONE EYE. First the born-digital text layer (pdf.js text-items with
// geometry). Then — the request's heart — each page is RENDERED NATIVELY (rasterised, the way a
// viewer draws it) and the pixels are read by the OCR eyes (rooms/reader/eo/pdf-eyes.js →
// ocr-eyes.js): Tesseract always, a VLM when the cheap eye is doubtful. The text layer (a
// ground-truth eye) and the OCR readings are handed to the SAME quorum a scan gets (the pdf
// organ → organs/in/quorum-doc.js): the best line per page is elected, disagreements between the
// embedded text and the visible pixels are flagged, and each eye's reliability is learned. Then
// the shaky OCR lines are re-read in the document's own confident vocabulary (ocr-context.js).
//
// The policy governs SPEND, never correctness (opts.eyes): 'auto' (default) renders only the
// pages whose text layer is missing or thin — the scanned/figure pages, where the pixels are the
// only truth — so a clean born-digital PDF pays nothing and takes the classic text-layer path;
// 'all' renders every page for maximum corroboration; 'text-only' skips rendering entirely.
// Best-effort throughout: if pdf.js render or the OCR eyes are unavailable, the text layer alone
// still reads the document — a PDF is never refused over a missing model.
async function fromPdf(file, title, name, say, opts = {}) {
  const pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.min.mjs');
  try { pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs'; } catch {}
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items = tc.items.filter(it => 'str' in it).map(it => ({ str: it.str, transform: it.transform, width: it.width, height: it.height, hasEOL: it.hasEOL }));
    pages.push({ pageNumber: p, width: vp.width, height: vp.height, items });
    if (p % 5 === 0) say('Read page ' + p + ' / ' + pdf.numPages + '…');
  }
  const { ingestPdf, pdfTextReading, resolveOcrInContext } = await IN();

  // ── RENDER NATIVELY + READ WITH EYES — the doubtful pages, or every page under 'all' ──
  let eyes = { ocrReadings: [], ocrPages: [], eyes: [], rendered: [] };
  const policy = opts.eyes || 'auto';
  if (policy !== 'text-only') {
    try {
      const { readPdfWithEyes } = await import(new URL('./eo/pdf-eyes.js', import.meta.url).href);
      eyes = await readPdfWithEyes({ pdf, textPages: pages, policy, getVision, onProgress: say, signal: opts.signal });
    } catch (e) { /* the eyes are best-effort — the text layer still reads the document */ }
  }

  // ── RECONCILE — the quorum path when the eyes read any page, else the classic text read ──
  let doc, guesses = 0, quorum = null;
  if (eyes.ocrReadings.length) {
    const readings = [pdfTextReading(pages), ...eyes.ocrReadings].filter(r => r.lines && r.lines.length);
    doc = ingestPdf({ name, readings, pageCount: pdf.numPages, metadata: { title } });
    // The shaky lines re-read in context — a garble becomes a belief-marked GUESS at what it
    // likely means given the document's own confident vocabulary. Best-effort; inert on a clean read.
    try { guesses = resolveOcrInContext(doc, { lexicon: opts.ocrLexicon || null }).edits || 0; }
    catch { /* the elected reading still stands */ }
    quorum = { eyes: doc.quorum?.eyes || [], ocrPages: eyes.ocrPages, best: doc.quorum?.best || null,
               disagreements: (doc.quorum?.disagreements || []).length, reliability: doc.reliability || [] };
  } else {
    doc = ingestPdf({ name, pages, metadata: { title } });
  }
  if (!doc.text || !doc.text.trim()) throw new Error('this PDF has no recoverable text — even rendering the pages and reading the pixels came up empty');

  // WHICH pages STILL have no text — a page is only "textless" now if NEITHER the text layer NOR
  // the eyes found anything on it (a truly blank page, or a scan no eye could read). A scanned
  // page that OCR read is no longer dropped in silence — it lands, reconciled, like any other.
  const withText = new Set(doc.spans.map(s => s.page).filter(p => p != null));
  const textlessPages = [];
  for (let p = 1; p <= pdf.numPages; p++) if (!withText.has(p)) textlessPages.push(p);

  if (eyes.ocrPages.length) say(`Rendered and read ${eyes.ocrPages.length} page(s) with the eyes (${eyes.eyes.join(' + ') || 'none'})${quorum && quorum.disagreements ? ` — ${quorum.disagreements} line(s) where the pixels and the text layer disagree` : ''}.`);
  if (textlessPages.length) say(`Note: ${textlessPages.length} page(s) still carry no recoverable text (p. ${textlessPages.join(', ')}).`);

  const coverage = {
    complete: textlessPages.length === 0,
    pages: pdf.numPages, pagesWithText: pdf.numPages - textlessPages.length, textlessPages,
    rendered: eyes.rendered.length, ocrPages: eyes.ocrPages, eyes: eyes.eyes,
    disagreements: quorum ? quorum.disagreements : 0, guesses,
    dropped: textlessPages.length ? [`${textlessPages.length} page(s) with no recoverable text (blank, or a scan no eye could read): p. ${textlessPages.join(', ')}`] : [],
  };
  return { text: doc.text, title, meta: { modality: 'pdf', doc, quorum, coverage } };
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

// An image is read twice over. First as a DOCUMENT — but not by one eye. A SET OF WITNESSES
// reads the scan (rooms/reader/eo/ocr-eyes.js): the cheap deterministic eye (Tesseract) always,
// and the VLM eye (Florence-2 OCR) woken when that first reading is doubtful. Their readings are
// reconciled by the QUORUM (organs/in/ocr-quorum.js) — best line elected (DEF), disagreements
// flagged (EVA), each eye's reliability learned (REC) — and then re-read IN CONTEXT
// (organs/in/ocr-context.js): a shaky line becomes a belief-marked GUESS at what it likely means
// given the document's own confident vocabulary, every guess auditable and revertible on the log.
// Only when the eyes come up empty (a photograph, not a scan) does the scene path wake: Florence-2's
// structured region captions composed into spatial prose (organs/in/scene.js) and raised by the
// image organ. What used to be the dead end "no text found" is still the scene path.
let _vision = null;
const getVision = async () => {
  if (!_vision) {
    const { createFlorenceVision } = await import(new URL('./eo/vision.js', import.meta.url).href);
    _vision = createFlorenceVision();
  }
  return _vision;
};
async function fromImage(file, title, name, say, opts = {}) {
  const url = URL.createObjectURL(file);
  try {
    let ocrDoc = null, quorum = null, guesses = 0;
    try {
      const { readWithEyes } = await import(new URL('./eo/ocr-eyes.js', import.meta.url).href);
      // The set of witnesses reads the scan. The VLM eye is woken (and its model loaded) only if
      // the policy asks — getVision is passed lazily and awaited inside the eye, never up front.
      const { readings, eyes, woke } = await readWithEyes({ blob: file, url }, {
        policy: opts.eyes || 'auto',
        onProgress: say,
        getVision,
      });
      if (readings.length) {
        const { ingestOcr, resolveOcrInContext } = await IN();
        const doc = ingestOcr({ name, readings });
        // Enough letters to call it a document? A photograph makes an eye hallucinate a
        // few stray glyphs; those must not gate the scene reading off.
        if (((doc.text || '').match(/[\p{L}\p{N}]/gu) || []).length >= 12) {
          // The context layer — guess what the shaky lines likely mean, from the doc's own
          // confident vocabulary (and the corpus, when the caller threads one). Best-effort:
          // a clean scan is inert here, and a failure leaves the elected reading standing.
          try { guesses = resolveOcrInContext(doc, { lexicon: opts.ocrLexicon || null }).edits || 0; }
          catch { /* the quorum reading still stands */ }
          ocrDoc = doc;
          quorum = { eyes, woke, best: doc.quorum?.best || null, disagreements: (doc.quorum?.disagreements || []).length, reliability: doc.reliability || [] };
        }
      }
    } catch (e) { /* OCR unavailable or failed — the scene reading below still stands */ }
    if (ocrDoc) return { text: ocrDoc.text, title, meta: { modality: 'ocr', doc: ocrDoc, quorum,
      coverage: { complete: true, lines: ocrDoc.spans.length, eyes: quorum?.eyes || [], guesses, disagreements: quorum?.disagreements || 0, dropped: [] } } };

    say('No text in the image — looking at the scene…');
    const vision = await getVision();
    const seen = await vision.describe(file, { onProgress: (m) => { if (m && m.status === 'progress' && m.progress != null) say('Loading the vision model… ' + Math.round(m.progress) + '%'); } });
    const { composeScene, ingestImage } = await IN();
    const scene = composeScene({ ...seen, name, metadata: { title } });
    if (!scene.text || !scene.text.trim()) throw new Error('nothing recognizable in the image');
    const doc = ingestImage(scene);
    return { text: scene.text, title, meta: { modality: 'image', doc, witness: seen.witness, cached: !!seen.cached,
      coverage: { complete: true, regions: (scene.regions || []).length, dropped: [] } } };
  } finally { URL.revokeObjectURL(url); }
}

// One whisper pipeline per session — the model is ~150 MB of WASM/WebGPU memory, so a
// second import must reuse the first load, never stack another instance.
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
export async function _transcribeWindows(asr, mono, SR, duration, norm, { onPartial, signalSpans, signal } = {}) {
  const WIN = 30, HOP = 25, DEDUP = 0.2;   // seconds: window, hop, overlap-dedup tolerance
  const denom = Math.max(duration, 0.001);
  const utterances = [];
  // The signal/noise holons already told us where the sound is. A window that overlaps NO
  // signal holon is silence/noise — whisper would hear nothing there — so we skip decoding it
  // rather than pay 30s of model time to transcribe a hush. This is the "transcribe only the
  // signal" half of "separate signal from noise, THEN transcribe if necessary".
  const overlapsSignal = (a, b) => !signalSpans || !signalSpans.length
    || signalSpans.some((s) => a < s.end && b > s.start);
  let lastEnd = -Infinity, acc = '';
  // The timed words heard so far, flattened across every utterance — handed to onPartial so the
  // surface can render the transcript live (click-to-seek + karaoke) as it fills, not just a string.
  const heardWords = () => utterances.flatMap((u) => u.words.map((w) => ({ text: w.text, start: w.start, end: w.end })));
  for (let a = 0; a === 0 || a < duration; a += HOP) {
    if (signal && signal.aborted) throw new DOMException('aborted', 'AbortError');
    const b = Math.min(a + WIN, Math.max(duration, a + 0.001));   // a ≤30s window; a short clip is one pass
    if (!overlapsSignal(a, b)) {
      if (typeof onPartial === 'function') { try { onPartial({ text: acc, pct: Math.min(100, Math.round(b / denom * 100)), words: heardWords() }); } catch {} }
      if (b >= duration) break;
      continue;
    }
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
    if (typeof onPartial === 'function') { try { onPartial({ text: acc, pct: Math.min(100, Math.round(b / denom * 100)), words: heardWords() }); } catch {} }
    if (b >= duration) break;
  }
  return { utterances, text: acc };
}

// The smallest total of signal (above the noise floor) that is worth loading a 150 MB speech
// model for. Below it the clip reads as silence or steady noise: the source still lands, with
// its waveform and its holons, but transcription is skipped — "THEN transcribe IF NECESSARY".
const MIN_SIGNAL_SECONDS = 0.3;

async function fromMedia(file, title, name, say, opts = {}) {
  const SR = 16000;
  // Decode to mono 16 kHz — the rate whisper wants — via an offline graph.
  const AC = (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext));
  if (!AC) throw new Error('this browser cannot decode audio');
  // Guard the guaranteed-OOM cases before allocating: the decode materializes the WHOLE
  // clip as full-rate PCM (1h of stereo 44.1kHz ≈ 1.3GB) in a tab that may also hold
  // model weights — past these (generous) bounds the import would crash the tab, not land.
  if (file.size > 500 * 1024 * 1024) throw new Error('this clip is too large to decode in the browser (over 500 MB) — split it or transcribe a compressed copy');

  const isVideo = !!opts.isVideo;
  const mediaKind = isVideo ? 'video' : 'audio';
  // A playable handle on the original file, kept for the session so the source can be
  // heard/watched back with the transcript aligned. (Not revoked — playback needs it.)
  const media = (typeof URL !== 'undefined' && URL.createObjectURL) ? URL.createObjectURL(file) : null;

  // ── THE PICTURE, DEFERRED (video only). ───────────────────────────────────────────────────────
  // A video carries a second sense the waveform cannot: what MOVED. This defers the visual reading the
  // way transcription is deferred — a `watch` thunk the caller runs in the background AFTER the source
  // lands (app.js). It extracts frames (video-frames.js, the browser front-end) and runs the retina
  // (motion.js readVideo): the activity envelope, the cuts and nested shots, the surprise/dwell
  // decomposition, and — the request's heart — the BORN-RULE entity detection (bornEntities), which
  // recovers the moving things by squaring their persistence and reading the distribution, no model
  // and no labels. It needs no audio, so it is built here and used by BOTH the normal path and the
  // no-audio-track path below. Null for a pure-audio import.
  const watch = isVideo ? async ({ signal, onProgress } = {}) => {
    if (signal && signal.aborted) throw new DOMException('aborted', 'AbortError');
    const say2 = typeof onProgress === 'function' ? onProgress : () => {};
    const { extractVideoFrames } = await import(new URL('./video-frames.js', import.meta.url).href);
    const { readVideo } = await IN();
    const ex = await extractVideoFrames(file, { signal, onProgress: say2 });
    if (!ex.frames.length) return { text: '', doc: null, artefacts: null, empty: true,
      coverage: { complete: false, frames: 0, dropped: ['no video frames could be decoded in the browser'] } };
    say2('Reading what moved…');
    const r = readVideo({ name: `${name}-video`, title, frames: ex.frames, fps: ex.fps, media, mediaKind, metadata: { title } });
    const cov = {
      complete: true,
      frames: ex.sampled, requestedFrames: ex.requested,
      fps: Math.round(ex.fps * 100) / 100, width: ex.width, height: ex.height,
      shots: r.shots.shotCount, cuts: r.analysis.cuts,
      entities: r.entities.entities.length, measuredTracks: r.entities.measured,
      dropped: ex.requested > ex.sampled ? [`${ex.requested - ex.sampled} frame(s) the codec would not yield`] : [],
    };
    return { text: r.doc.text, doc: r.doc, coverage: cov,
      artefacts: { peaks: r.peaks, analysis: r.analysis, shots: r.shots, tracks: r.tracks, entities: r.entities,
                   persistence: r.persistence, fps: ex.fps, width: ex.width, height: ex.height } };
  } : null;

  const buf = await file.arrayBuffer();
  const tmp = new AC();
  let decoded;
  try {
    decoded = await tmp.decodeAudioData(buf);
  } catch (e) {
    try { tmp.close(); } catch {}
    // A pure-audio file that will not decode is an error. A VIDEO with no (decodable) audio track is
    // NOT — it simply has nothing to hear (like this clip, a ball on static). Fall back to a
    // picture-only reading: the source lands from the `watch` thunk (app.js), never refused, with a
    // coverage receipt that names the missing audio. Skipping this used to fail the WHOLE import.
    if (!isVideo) throw new Error('this browser cannot decode this audio');
    return { text: '', title, meta: {
      modality: 'video', doc: null, media, isVideo, mediaKind,
      watch, transcribe: null, transcribable: false,
      coverage: { complete: true, audio: false, dropped: ['no audio track — the picture is read; there is nothing to hear'] },
    } };
  }
  try { tmp.close(); } catch {}
  const duration = decoded.duration;
  if (duration > 3 * 3600) throw new Error('this clip is too long to transcribe in the browser (over 3 hours) — split it first');
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(duration * SR)), SR);
  const srcNode = off.createBufferSource(); srcNode.buffer = decoded; srcNode.connect(off.destination); srcNode.start();
  const mono = (await off.startRendering()).getChannelData(0);
  decoded = null;   // release the full-rate PCM before whisper holds the tab for minutes

  // ── PHASE 1 — the pre-transcription reading, computed AT ONCE. ────────────────────────
  // The waveform, the basic analysis, and the signal/noise nested holons — all cheap, all
  // synchronous, all from the PCM we already have. This is what makes the source appear
  // immediately, with a drawable waveform and a real reading, before a word is transcribed.
  say('Reading the waveform…');
  const { ingestAcoustic, waveformPeaks, analyzeAudio, separateHolons } = await IN();
  const peaks = waveformPeaks(mono, 900);
  const analysis = analyzeAudio(mono, SR);
  const holons = separateHolons(mono, SR);
  const acousticDoc = ingestAcoustic({ name, title, duration, sampleRate: SR, analysis, holons, peaks, media, mediaKind });

  const necessary = holons.signalSeconds >= MIN_SIGNAL_SECONDS;
  const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');

  // ── PHASE 2 — transcription, DEFERRED. ────────────────────────────────────────────────
  // Handed back as a thunk the caller runs in the background AFTER the source has landed, so
  // loading whisper never blocks the source from appearing. Null when there is no signal to
  // hear (the "if necessary" gate). It transcribes only the windows a signal holon covers.
  const transcribe = necessary ? async ({ onPartial, signal, twoWitness } = {}) => {
    if (signal && signal.aborted) throw new DOMException('aborted', 'AbortError');
    const { asr, dev } = await _loadWhisper();
    const witness = `whisper-base · ${dev}`;
    const { utterances, text: liveText } = await _transcribeWindows(asr, mono, SR, duration, norm, {
      onPartial, signalSpans: holons.signalSpans, signal,
    });

    // A transcript is one READING, not the objective truth of the waveform. When "audit
    // readings" is on, take a SECOND witness — the same model relistening with a different
    // chunking — so its divergences become auditable EVA events, not a silent single answer.
    const alternates = [];
    if (twoWitness) {
      try {
        const out2 = await asr(mono, { return_timestamps: true, chunk_length_s: 20, stride_length_s: 3 });
        const altWords = _whisperUtterances(out2, norm).flatMap(u => u.words);
        if (altWords.length) alternates.push({ label: `whisper-base relisten · ${dev}`, words: altWords });
      } catch (e) { /* best-effort; the first reading still stands */ }
    }

    const fullText = (liveText || utterances.map(u => u.words.map(w => w.text).join(' ')).join(' ')).trim();
    if (!fullText) return { text: '', doc: null, coverage: { complete: true, seconds: Math.round(duration * 10) / 10, utterances: 0, dropped: ['no speech found in the signal'] }, empty: true };

    const { ingestAudio, acousticSignal, resolveTranscript, diarize } = await IN();
    // AUTONOMOUS per-word acoustics — reusing the pre-transcription reading, not re-asking a
    // model. The cochlea already separated signal from noise (holons) and measured the room
    // (analysis); here each WORD span is read against that SAME waveform, so every word carries
    // a belief grounded in the truth. Best-effort: a failure leaves the words un-scored.
    try {
      const flat = utterances.flatMap((u) => u.words);
      const sig = acousticSignal(mono, SR, flat.map((w) => ({ start: w.start, end: w.end })), { analysis, signalSpans: holons.signalSpans });
      flat.forEach((w, i) => { if (sig[i]) { w.acous = sig[i].acous; w.snr = sig[i].snr; w.signal = sig[i].signal; } });
    } catch (e) { /* best-effort; the model's confidence still stands */ }

    // WHO is speaking — read from the same waveform. Each utterance's voice signature (pitch by
    // autocorrelation, spectral shape by FFT) is clustered into speakers (voices.js); every word
    // inherits its utterance's speaker so the transcript can be read, exported and coloured by turn.
    // Best-effort and defeasible — a failure just leaves the transcript speaker-less, as before.
    let speakers = [], diarizeWitnesses = [];
    if (signal && signal.aborted) throw new DOMException('aborted', 'AbortError');
    try {
      const dz = diarize(mono, SR, utterances);
      if (dz && dz.count > 0) {
        speakers = dz.speakers;
        diarizeWitnesses = dz.witnesses || [];
        utterances.forEach((u, i) => { const s = dz.assign[i]; u.speaker = s; (u.words || []).forEach((w) => { w.speaker = s; }); });
      }
    } catch (e) { /* best-effort; the transcript stands without speaker labels */ }

    // The word-level doc carries the acoustic reading forward (waveform, analysis, holons,
    // media) so the transcript's source keeps everything the pre-reading gave it — plus the
    // speaker roster, per-word speaker, and the auditable merge/keep trail the diarization left.
    const doc = ingestAudio({ name, duration, device: dev, witness, utterances, alternates, media, mediaKind, peaks, analysis, holons, sampleRate: SR, speakers, diarizeWitnesses });
    // GRAPH-AWARE, self-editing resolution — fold near-spelling names onto their most-BELIEVED
    // hearing, the edits landing on THIS append-only log (hear.js §2). Inert on a clean read.
    let reheard = 0;
    try { reheard = resolveTranscript(doc).edits || 0; }
    catch (e) { /* best-effort; the first-pass transcript still stands */ }
    const lastHeard = utterances.length ? utterances[utterances.length - 1].end : 0;
    return { text: fullText, doc, coverage: { complete: true, seconds: Math.round(duration * 10) / 10, heardTo: Math.round(lastHeard * 10) / 10, utterances: utterances.length, reheard, dropped: [] } };
  } : null;

  const coverage = {
    complete: true,
    seconds: Math.round(duration * 10) / 10,
    signalSeconds: Math.round(holons.signalSeconds * 10) / 10,
    signalHolons: holons.signalSpans.length,
    transcribable: necessary,
    dropped: necessary ? [] : ['no signal above the noise floor — not transcribed'],
  };

  return { text: acousticDoc.text, title, meta: {
    modality: 'audio', doc: acousticDoc, duration, media, isVideo, mediaKind,
    waveform: peaks, analysis, holons, transcribe, transcribable: necessary,
    watch,
    coverage,
  } };
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
