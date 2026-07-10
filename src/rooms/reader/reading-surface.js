// EO: NUL(Field → Void, Clearing) — reading-JSONL DOM surface
// reader/reading-surface.js — a surface to SEE the reading of any document, as JSONL.
//
// The engine reads every ingested document through its whole predictive stack (ingest/read.js:
// the γ-mass prediction, the two surprise channels, the connectivity bridge, the turning-point
// spine, and — injected — the enacted DEF·EVA·REC loop). readingJsonl renders that read as an
// append-only stream of typed JSON records; this is the DOM surface over it, framework-free so
// it owes nothing to the host's runtime and drops into any element — a standalone page or the
// app's right panel alike. It is the reading-mode twin of the deep-research surface
// (research/surface.js): one projection, shown, with a JSONL download.
//
// No model, no embedder, no weights — the read is the mechanical γ-mass reading, so the surface
// runs anywhere the src/ modules load.

import { ingestText } from '../../organs/in/text.js';
import { readingJsonl } from '../../organs/ingest/index.js';
import { enactedReadingTo } from '../../enactor/enact/index.js';

// The frame layer is injected (ingest is a lower holon than enact); the surface has both, so
// it hands readIngest the enacted reader and the JSONL carries the frame-restructuring records.
const enacted = (doc) => enactedReadingTo(doc, (doc.units || doc.sentences || []).length - 1);

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const SURFACE_CSS = `
.rds{display:flex;flex-direction:column;height:100%;min-height:0;background:#0f1115;color:#e6e9ef;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13.5px}
.rds *{box-sizing:border-box}
.rds-head{flex:0 0 auto;display:flex;align-items:center;gap:12px;padding:11px 16px;background:#151922;border-bottom:1px solid #262c39}
.rds-head .rds-mark{font-weight:700;font-size:14px;letter-spacing:.01em}
.rds-head .rds-sub{font-size:11px;color:#8791a3}
.rds-head .rds-sp{margin-left:auto}
.rds-btn{border:1px solid #2d3444;background:#1b2130;color:#e6e9ef;border-radius:8px;padding:6px 12px;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer}
.rds-btn:hover{background:#232b3d}
.rds-btn[disabled]{opacity:.5;cursor:default}
.rds-in{flex:0 0 auto;display:flex;gap:8px;align-items:stretch;padding:10px 16px;background:#12161d;border-bottom:1px solid #262c39}
.rds-in textarea{flex:1;min-height:44px;max-height:160px;resize:vertical;border:1px solid #2d3444;border-radius:8px;padding:8px 10px;font:inherit;font-size:12.5px;background:#0c0e13;color:#e6e9ef}
.rds-in .rds-col{display:flex;flex-direction:column;gap:6px;justify-content:flex-start}
.rds-body{flex:1 1 auto;min-height:0;overflow:auto;padding:10px 0}
.rds-jsonl{margin:0;padding:0 16px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.55;white-space:pre-wrap;word-break:break-word}
.rds-line{padding:1px 0;border-left:2px solid transparent;padding-left:8px}
.rds-line .k{color:#7aa2f7}
.rds-line .s{color:#9ece6a}
.rds-line .n{color:#e0af68}
.rds-line .b{color:#bb9af7}
.rds-line .p{color:#8791a3}
.rds-t-head{border-left-color:#7aa2f7;color:#c0caf5}
.rds-t-structure{border-left-color:#3d4657}
.rds-t-turn{border-left-color:#e0af68}
.rds-t-rec{border-left-color:#f7768e}
.rds-t-stats{border-left-color:#bb9af7}
.rds-empty{color:#8791a3;padding:24px 16px;text-align:center}
.rds-err{color:#f7768e;font-size:12px;padding:8px 16px}
.rds-count{font-size:11px;color:#8791a3;padding:6px 16px}
`;

// Light JSON-syntax coloring for one record, keys/strings/numbers/booleans — a viewer aid,
// never a parser (the raw line is what the download and clipboard carry).
const colorize = (obj) => {
  const j = JSON.stringify(obj);
  return j.replace(/("(\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(\.\d+)?/g, (m, str, _q, colon, bool) => {
    if (str && colon) return `<span class="k">${esc(str)}</span>${colon}`;
    if (str) return `<span class="s">${esc(str)}</span>`;
    if (bool) return `<span class="b">${esc(m)}</span>`;
    return `<span class="n">${esc(m)}</span>`;
  });
};

// mountReadingSurface(el, opts) → { destroy, read }
//   opts.doc        an already-ingested doc to read (skips the text box's first ingest)
//   opts.text       initial document text to seed the input box with
//   opts.readOpts   options forwarded to readingJsonl (k, max, budget) — enacted is wired in
//   opts.onClose    show a close button that calls this
//   opts.title      header label (default "Reading — JSONL")
export const mountReadingSurface = (el, opts = {}) => {
  const root = document.createElement('div');
  root.className = 'rds';
  const style = document.createElement('style');
  style.textContent = SURFACE_CSS;
  root.appendChild(style);
  root.insertAdjacentHTML('beforeend', `
    <div class="rds-head">
      <span class="rds-mark">⛁ ${esc(opts.title || 'Reading — JSONL')}</span>
      <span class="rds-sub"></span>
      <span class="rds-sp"></span>
      <button class="rds-btn rds-copy" disabled>Copy</button>
      <button class="rds-btn rds-dl" disabled>Download .jsonl</button>
      ${opts.onClose ? '<button class="rds-btn rds-close" title="Close">✕</button>' : ''}
    </div>
    <div class="rds-in">
      <textarea class="rds-text" placeholder="Paste a document — or drop a .txt/.md file — and read it."></textarea>
      <div class="rds-col">
        <button class="rds-btn rds-read">Read ▸</button>
        <button class="rds-btn rds-file">Open file…</button>
        <input type="file" class="rds-fileinput" accept=".txt,.md,.markdown,text/*" hidden />
      </div>
    </div>
    <div class="rds-err" style="display:none"></div>
    <div class="rds-count" style="display:none"></div>
    <div class="rds-body"><div class="rds-empty">No reading yet. Paste a document above and press Read.</div></div>
  `);
  el.appendChild(root);

  const $ = (s) => root.querySelector(s);
  const bodyEl = $('.rds-body');
  const errEl = $('.rds-err');
  const countEl = $('.rds-count');
  const subEl = $('.rds-head .rds-sub');
  let jsonl = '';
  let docName = 'reading';

  const showErr = (m) => { errEl.style.display = m ? '' : 'none'; errEl.textContent = m || ''; };

  const render = (text) => {
    const lines = text ? text.split('\n') : [];
    if (!lines.length) { bodyEl.innerHTML = '<div class="rds-empty">Nothing to read.</div>'; return; }
    const html = ['<div class="rds-jsonl">'];
    for (const ln of lines) {
      let obj; try { obj = JSON.parse(ln); } catch { html.push(`<div class="rds-line">${esc(ln)}</div>`); continue; }
      html.push(`<div class="rds-line rds-t-${esc(obj.type || 'x')}">${colorize(obj)}</div>`);
    }
    html.push('</div>');
    bodyEl.innerHTML = html.join('');
    const head = lines[0] ? safeParse(lines[0]) : null;
    subEl.textContent = head ? `${head.docId} · ${head.units} units · ${head.turns} turns` : '';
    countEl.style.display = ''; countEl.textContent = `${lines.length} records`;
  };

  const readDoc = (doc) => {
    try {
      jsonl = readingJsonl(doc, { ...(opts.readOpts || {}), enacted });
      docName = (doc.docId || 'reading').replace(/[^\w.-]+/g, '-');
      render(jsonl);
      showErr('');
      $('.rds-copy').disabled = false; $('.rds-dl').disabled = false;
    } catch (e) { showErr('Could not read: ' + (e?.message || e)); }
  };

  const readText = async (text, name) => {
    const t = String(text || '').trim();
    if (!t) return showErr('Paste some text first.');
    showErr('');
    const btn = $('.rds-read'); btn.disabled = true; btn.textContent = 'Reading…';
    try { readDoc(await ingestText(t, {})); if (name) docName = String(name).replace(/[^\w.-]+/g, '-'); }
    catch (e) { showErr('Ingest failed: ' + (e?.message || e)); }
    btn.disabled = false; btn.textContent = 'Read ▸';
  };

  $('.rds-read').addEventListener('click', () => readText($('.rds-text').value));
  $('.rds-file').addEventListener('click', () => $('.rds-fileinput').click());
  $('.rds-fileinput').addEventListener('change', async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const text = await f.text(); $('.rds-text').value = text; readText(text, f.name);
  });
  // Drag-and-drop a text file onto the input.
  const inBox = $('.rds-in');
  inBox.addEventListener('dragover', (e) => { e.preventDefault(); });
  inBox.addEventListener('drop', async (e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0]; if (!f) return;
    const text = await f.text(); $('.rds-text').value = text; readText(text, f.name);
  });

  $('.rds-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(jsonl); const b = $('.rds-copy'); b.textContent = 'Copied'; setTimeout(() => (b.textContent = 'Copy'), 1200); }
    catch { showErr('Clipboard blocked — select and copy manually.'); }
  });
  $('.rds-dl').addEventListener('click', () => {
    if (!jsonl) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([jsonl], { type: 'application/x-ndjson' }));
    a.download = `${docName}.reading.jsonl`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });
  if (opts.onClose) $('.rds-close').addEventListener('click', () => opts.onClose());

  // Seed: an already-ingested doc reads immediately; seed text just fills the box.
  if (opts.doc) readDoc(opts.doc);
  else if (opts.text) $('.rds-text').value = opts.text;

  return { destroy: () => root.remove(), read: readText };
};

const safeParse = (s) => { try { return JSON.parse(s); } catch { return null; } };
