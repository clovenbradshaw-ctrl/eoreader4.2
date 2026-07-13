// EO: INS·NUL(Field → Entity,Void, Making,Clearing) — the facing renderer DOM surface
// surface.js — the facing-page WYSIWYG renderer. Framework-free, so it owes nothing to the host
// runtime and drops into any element (the standalone render.html or a panel in the reader).
//
// LEFT: the source, in three panes — HTML · CSS · JS — each editable. RIGHT: the live render, a
// sandboxed iframe whose `srcdoc` IS assembleDocument(state). Type on the left; the right pane
// re-renders (debounced), executing the HTML and the JavaScript. Under the render, a console strip
// shows what the code DID — every console.* and every thrown error, mirrored back by the injected
// shim (facing.js CONSOLE_SHIM). The facing-page idiom of replay.js, pointed at code.
//
// Security posture: the iframe is sandboxed `allow-scripts` (NOT allow-same-origin), so the
// rendered code runs its own JS but cannot reach this page's origin, storage, or cookies. A
// deliberate "allow same-origin" toggle widens it for content that needs fetch/canvas, at the
// user's explicit choice.

import { assembleDocument, splitSource, consoleLineOf } from './facing.js';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CSS = `
.fr{--bg:#0c0e12;--panel:#14171e;--panel2:#1b1f28;--ink:#e7ecf3;--dim:#8b93a2;--line:#252b36;
  --accent:#7bd0ff;--warn:#e0a24a;--err:#ff6b6b;--ok:#5bd08a;
  --mono:'SFMono-Regular',ui-monospace,Menlo,Consolas,monospace;--sans:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
  background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:13.5px;line-height:1.5;
  display:flex;flex-direction:column;height:100%;min-height:0}
@media (prefers-color-scheme:light){.fr{--bg:#f4f6fa;--panel:#fff;--panel2:#eef1f6;--ink:#141821;--dim:#5a6474;--line:#dde3ec;--accent:#2a7fd0}}
:root[data-theme="dark"] .fr{--bg:#0c0e12;--panel:#14171e;--panel2:#1b1f28;--ink:#e7ecf3;--dim:#8b93a2;--line:#252b36}
:root[data-theme="light"] .fr{--bg:#f4f6fa;--panel:#fff;--panel2:#eef1f6;--ink:#141821;--dim:#5a6474;--line:#dde3ec;--accent:#2a7fd0}
.fr *{box-sizing:border-box}
.fr button{font-family:var(--sans);font-size:12.5px;padding:5px 11px;border-radius:8px;border:1px solid var(--line);background:var(--panel2);color:var(--ink);cursor:pointer;transition:.12s}
.fr button:hover{border-color:var(--accent)}
.fr button.on{background:var(--accent);border-color:var(--accent);color:#04121c;font-weight:650}

.fr-bar{flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:9px 14px;background:var(--panel);border-bottom:1px solid var(--line);flex-wrap:wrap}
.fr-title{font-weight:650;font-size:13.5px;display:flex;align-items:center;gap:8px}
.fr-title .dot{width:8px;height:8px;border-radius:50%;background:var(--accent)}
.fr-spacer{flex:1}
.fr-load{display:flex;align-items:center;gap:6px}
.fr-load input{background:var(--panel2);border:1px solid var(--line);color:var(--ink);border-radius:8px;padding:5px 9px;font-family:var(--mono);font-size:12px;width:min(38vw,340px)}
.fr-toggle{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dim)}

.fr-split{flex:1;min-height:0;display:grid;grid-template-columns:1fr 1fr;gap:0}
@media (max-width:820px){.fr-split{grid-template-columns:1fr;grid-template-rows:1fr 1fr}}
.fr-side{min-width:0;min-height:0;display:flex;flex-direction:column;border-right:1px solid var(--line)}
.fr-tabs{flex:0 0 auto;display:flex;gap:2px;padding:8px 10px 0;background:var(--panel)}
.fr-tabs button{border-radius:8px 8px 0 0;border-bottom:none;font-family:var(--mono);font-size:12px}
.fr-tabs .grow{flex:1}
.fr-tabs .hint{font-size:10.5px;color:var(--dim);align-self:center;padding:0 6px}
.fr-editor{flex:1;min-height:0;display:flex}
.fr-editor textarea{flex:1;width:100%;height:100%;resize:none;border:none;outline:none;padding:12px 14px;
  background:var(--panel);color:var(--ink);font-family:var(--mono);font-size:12.5px;line-height:1.6;tab-size:2}
.fr-editor textarea::placeholder{color:var(--dim)}

.fr-view{min-width:0;min-height:0;display:flex;flex-direction:column;background:var(--panel)}
.fr-viewhead{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:7px 12px;border-bottom:1px solid var(--line);font-size:11.5px;color:var(--dim)}
.fr-viewhead .grow{flex:1}
.fr-frame{flex:1;min-height:0;position:relative;background:#fff}
.fr-frame iframe{width:100%;height:100%;border:none;display:block;background:#fff}
.fr-console{flex:0 0 auto;max-height:34%;overflow:auto;border-top:1px solid var(--line);background:var(--panel2);font-family:var(--mono);font-size:11.5px}
.fr-console .row{display:flex;gap:8px;padding:3px 12px;border-bottom:1px solid color-mix(in srgb,var(--line) 55%,transparent)}
.fr-console .lvl{flex:0 0 auto;width:44px;text-transform:uppercase;font-size:9.5px;letter-spacing:.5px;padding-top:1px}
.fr-console .lvl.log{color:var(--dim)} .fr-console .lvl.info{color:var(--accent)}
.fr-console .lvl.warn{color:var(--warn)} .fr-console .lvl.error{color:var(--err)}
.fr-console .txt{flex:1;white-space:pre-wrap;word-break:break-word}
.fr-console .empty{padding:8px 12px;color:var(--dim)}
`;

const DEMO = {
  html: '<main>\n  <h1>Facing renderer</h1>\n  <p>Edit the HTML, CSS, or JS — the page re-renders as you type.</p>\n  <button id="go">Count: 0</button>\n</main>',
  css: 'body{font-family:system-ui;margin:0;display:grid;place-items:center;height:100vh;background:#0f1220;color:#e7ecf3}\nh1{font-size:26px;margin:0 0 6px}\nbutton{font-size:16px;padding:10px 18px;border-radius:10px;border:none;cursor:pointer;background:#7bd0ff;color:#04121c}',
  js: "let n = 0;\nconst b = document.getElementById('go');\nb.addEventListener('click', () => { n++; b.textContent = 'Count: ' + n; console.log('clicked', n); });\nconsole.log('ready');",
};

// mountFacingRenderer(el, opts) → { setSource, run, destroy }. opts:
//   source    — { html, css, js } | a raw string (auto-split) | a full HTML document string
//   filename  — a hint for splitting a raw-string source
//   fetchUrl  — async (url) → { text } for the "load a URL" box (optional; the reader passes its
//               proxy-backed client; standalone render.html passes a direct+proxy fetcher)
//   autoRun   — re-render on edit (default true); false renders only on Run / Ctrl-Enter
export const mountFacingRenderer = (el, opts = {}) => {
  const norm = (src) => {
    if (!src) return { html: '', css: '', js: '' };
    if (typeof src === 'string') { const p = splitSource(src, opts.filename); return { html: p.html, css: p.css, js: p.js }; }
    return { html: src.html || '', css: src.css || '', js: src.js || '' };
  };
  const state = {
    ...(opts.source ? norm(opts.source) : { ...DEMO }),
    active: 'html', auto: opts.autoRun !== false, sameOrigin: false, console: [],
  };

  el.classList.add('fr');
  el.innerHTML = `<style>${CSS}</style>
  <div class="fr-bar">
    <div class="fr-title"><span class="dot"></span>Facing renderer <span style="color:var(--dim);font-weight:400">— HTML · CSS · JS, rendered live</span></div>
    <div class="fr-spacer"></div>
    <div class="fr-load"><input class="fr-url" placeholder="load a URL (raw .html / .js / .css)…" /><button class="fr-loadbtn">Load</button></div>
    <label class="fr-toggle"><input type="checkbox" class="fr-same" /> allow same-origin</label>
    <button class="fr-run">Run ▸</button>
    <label class="fr-toggle"><input type="checkbox" class="fr-auto" ${state.auto ? 'checked' : ''}/> auto</label>
  </div>
  <div class="fr-split">
    <div class="fr-side">
      <div class="fr-tabs">
        <button data-tab="html">HTML</button>
        <button data-tab="css">CSS</button>
        <button data-tab="js">JS</button>
        <span class="grow"></span>
        <span class="hint">⌘/Ctrl-Enter to run</span>
      </div>
      <div class="fr-editor"><textarea class="fr-src" spellcheck="false"></textarea></div>
    </div>
    <div class="fr-view">
      <div class="fr-viewhead"><span>Live render</span><span class="grow"></span><span class="fr-status"></span></div>
      <div class="fr-frame"><iframe class="fr-iframe" title="render" sandbox="allow-scripts allow-modals allow-popups"></iframe></div>
      <div class="fr-console"></div>
    </div>
  </div>`;

  const $ = (sel) => el.querySelector(sel);
  const iframe = $('.fr-iframe');
  const textarea = $('.fr-src');
  const consoleEl = $('.fr-console');
  const statusEl = $('.fr-status');
  const tabBtns = [...el.querySelectorAll('.fr-tabs button[data-tab]')];

  let debounce = null;
  const run = () => {
    state.console = [];
    renderConsole();
    iframe.setAttribute('sandbox', 'allow-scripts allow-modals allow-popups' + (state.sameOrigin ? ' allow-same-origin' : ''));
    iframe.srcdoc = assembleDocument({ html: state.html, css: state.css, js: state.js });
    statusEl.textContent = 'rendered';
    setTimeout(() => { if (statusEl.textContent === 'rendered') statusEl.textContent = ''; }, 1200);
  };
  const scheduleRun = () => { if (!state.auto) return; clearTimeout(debounce); debounce = setTimeout(run, 320); };

  const renderConsole = () => {
    if (!state.console.length) { consoleEl.innerHTML = '<div class="empty">Console — console.log and errors from the render appear here.</div>'; return; }
    consoleEl.innerHTML = state.console.map((l) =>
      `<div class="row"><span class="lvl ${esc(l.level)}">${esc(l.level)}</span><span class="txt">${esc(l.text)}</span></div>`).join('');
    consoleEl.scrollTop = consoleEl.scrollHeight;
  };

  const showTab = (tab) => {
    state.active = tab;
    tabBtns.forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    textarea.value = state[tab] || '';
    textarea.placeholder = tab === 'html' ? '<!-- HTML or a whole page -->' : tab === 'css' ? '/* CSS */' : '// JavaScript';
  };

  // ── wiring ──
  tabBtns.forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  textarea.addEventListener('input', () => { state[state.active] = textarea.value; scheduleRun(); });
  textarea.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); run(); }
    if (e.key === 'Tab') { e.preventDefault(); const s = textarea.selectionStart, t = textarea.value; textarea.value = t.slice(0, s) + '  ' + t.slice(textarea.selectionEnd); textarea.selectionStart = textarea.selectionEnd = s + 2; state[state.active] = textarea.value; scheduleRun(); }
  });
  $('.fr-run').addEventListener('click', run);
  $('.fr-auto').addEventListener('change', (e) => { state.auto = e.target.checked; if (state.auto) run(); });
  $('.fr-same').addEventListener('change', (e) => { state.sameOrigin = e.target.checked; run(); });

  const loadUrl = async () => {
    const url = String($('.fr-url').value || '').trim();
    if (!url || typeof opts.fetchUrl !== 'function') { if (!opts.fetchUrl) statusEl.textContent = 'no loader wired'; return; }
    statusEl.textContent = 'loading…';
    try {
      const { text } = await opts.fetchUrl(url);
      const p = splitSource(text, url);
      Object.assign(state, { html: p.html, css: p.css, js: p.js });
      showTab(p.mode === 'js' ? 'js' : p.mode === 'css' ? 'css' : 'html');
      run();
      statusEl.textContent = 'loaded';
    } catch (e) { statusEl.textContent = 'load failed'; }
  };
  $('.fr-loadbtn').addEventListener('click', loadUrl);
  $('.fr-url').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); loadUrl(); } });

  // The diagnostics channel — the shim's postMessages become console rows (facing.js consoleLineOf).
  const onMsg = (e) => {
    const line = consoleLineOf(e.data);
    if (!line) return;
    if (line.level === 'ready') return;       // the shim's boot ping — not a user log
    state.console.push(line);
    if (state.console.length > 300) state.console.shift();
    renderConsole();
  };
  window.addEventListener('message', onMsg);

  showTab('html');
  renderConsole();
  run();

  return {
    setSource: (src, filename) => {
      Object.assign(state, norm(src));
      const mode = typeof src === 'string' ? splitSource(src, filename).mode : 'html';
      showTab(mode === 'js' ? 'js' : mode === 'css' ? 'css' : 'html');
      run();
    },
    run,
    destroy: () => { window.removeEventListener('message', onMsg); clearTimeout(debounce); el.innerHTML = ''; },
  };
};
