// EO: EVA·NUL(Network,Field → Void, Tracing,Clearing) — the live console: a terminal that witnesses the turn
// rooms/reader/console-surface.js — a self-contained, bottom-docked developer
// terminal, in the same isolated vanilla-DOM idiom as the chat/vault launchers
// (rooms/chat/mount.js, rooms/archive/vault-mount.js): boot drops a "Console"
// launcher into the page, and opening it streams — live — everything the app is
// doing, so a freeze is visible as it happens instead of after the export.
//
// It taps ONLY the surface membrane (window.EO), never engine internals:
//   audit.subscribe   the structured per-turn stage fold — route → … → llm →
//                     settle — each step with its ms and compact data. The
//                     BACKBONE: when a turn hangs, the last step it printed IS
//                     where it hung (the essay froze after `prompt`, with no
//                     `llm` step ever arriving).
//   app.subscribe     the reader session's own fan-out — 'busy' (the activity
//                     label), 'log' (the web/model/search event ring), 'stream'
//                     and 'messages' (token + research-beat heartbeats).
//   console.*         the engine's own logs (webllm load %, warnings, boot).
//   window errors     uncaught exceptions + unhandled rejections.
//
// And it runs its OWN no-progress detector — "no sign of life for N seconds" —
// mirroring the engine's 45s stall watchdog (rooms/reader/app.js makeStallGuard),
// but in the surface, so it lights up even when the engine watchdog itself is the
// thing that failed to fire. That is the exact fault class behind the essay hang:
// the turn stopped emitting steps and nothing recovered it.
//
// Presentation only. It reads the record; it never writes one.

const STYLE_ID = 'eo-console-style';
const OPEN_KEY = 'eo_console_open';
const HEIGHT_KEY = 'eo_console_height';
const MAX_LINES = 2000;

// no progress for this long, on an unfinished turn, escalates the status light
const STALL_SOFT = 6000;
const STALL_HARD = 20000;
const STALL_FROZEN = 45000;   // the engine watchdog's own window (app.js makeStallGuard)

const CSS = `
.eo-con-fab{position:fixed;left:18px;bottom:18px;z-index:2147482900;display:flex;align-items:center;gap:7px;
  padding:8px 13px;border-radius:9px;border:1px solid #2b3240;background:#0d1117;color:#c9d1d9;cursor:pointer;
  font:600 12px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;box-shadow:0 6px 20px rgba(0,0,0,.28)}
.eo-con-fab:hover{background:#161b22;border-color:#3d4657}
.eo-con-fab__dot{width:8px;height:8px;border-radius:50%;background:#6e7681;transition:background .2s}
.eo-con-fab[data-state="work"] .eo-con-fab__dot{background:#a5a5ff;animation:eo-con-pulse 1.1s ease-in-out infinite}
.eo-con-fab[data-state="soft"] .eo-con-fab__dot{background:#e3b341;animation:eo-con-pulse 1.1s ease-in-out infinite}
.eo-con-fab[data-state="frozen"] .eo-con-fab__dot{background:#ff7b72}
.eo-con-fab[data-open="1"]{display:none}
@keyframes eo-con-pulse{0%,100%{opacity:1}50%{opacity:.35}}
/* On phones the launcher folds to its status dot, clear of the chat composer. */
@media (max-width: 820px){
  .eo-con-fab{left:10px;bottom:calc(10px + env(safe-area-inset-bottom));padding:8px}
  .eo-con-fab__label{display:none}
  .eo-con{height:46vh}
}

.eo-con{position:fixed;left:0;right:0;bottom:0;z-index:2147482901;height:34vh;display:none;flex-direction:column;
  background:#0b0e14;color:#c9d1d9;border-top:1px solid #2b3240;box-shadow:0 -10px 40px rgba(0,0,0,.4);
  font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.eo-con[data-open="1"]{display:flex}
.eo-con[data-h="tall"]{height:64vh}
.eo-con[data-h="min"]{height:38px}
.eo-con[data-h="min"] .eo-con__body,.eo-con[data-h="min"] .eo-con__status{display:none}

.eo-con__head{display:flex;align-items:center;gap:10px;padding:6px 10px;border-bottom:1px solid #1c2230;
  background:#0d1117;flex:0 0 auto;flex-wrap:wrap}
.eo-con__title{font-weight:700;color:#e6edf3;letter-spacing:.02em}
.eo-con__prov{color:#8a93a1;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:38vw}
.eo-con__spacer{flex:1}
.eo-con__head input.eo-con__filter{background:#0b0e14;border:1px solid #2b3240;color:#c9d1d9;border-radius:6px;
  padding:4px 8px;font:inherit;width:150px}
.eo-con__head select,.eo-con__head button{background:#161b22;border:1px solid #2b3240;color:#c9d1d9;border-radius:6px;
  padding:4px 8px;font:11px ui-monospace,monospace;cursor:pointer}
.eo-con__head button:hover,.eo-con__head select:hover{background:#21262d;border-color:#3d4657}

.eo-con__status{display:flex;align-items:center;gap:9px;padding:5px 12px;border-bottom:1px solid #1c2230;
  background:#0d1117;flex:0 0 auto;font-size:11.5px}
.eo-con__sdot{width:9px;height:9px;border-radius:50%;background:#6e7681;flex:0 0 auto}
.eo-con__status[data-state="work"] .eo-con__sdot{background:#a5a5ff;animation:eo-con-pulse 1.1s ease-in-out infinite}
.eo-con__status[data-state="soft"] .eo-con__sdot{background:#e3b341;animation:eo-con-pulse 1.1s ease-in-out infinite}
.eo-con__status[data-state="hard"] .eo-con__sdot{background:#f0883e;animation:eo-con-pulse .7s ease-in-out infinite}
.eo-con__status[data-state="frozen"] .eo-con__sdot{background:#ff7b72}
.eo-con__stext{color:#8b949e}
.eo-con__status[data-state="frozen"] .eo-con__stext{color:#ff9a92}
.eo-con__status[data-state="soft"] .eo-con__stext,.eo-con__status[data-state="hard"] .eo-con__stext{color:#e3b341}

.eo-con__body{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:6px 12px 12px;
  scrollbar-width:thin;scrollbar-color:#30363d #0b0e14}
.eo-con__body::-webkit-scrollbar{width:10px}
.eo-con__body::-webkit-scrollbar-thumb{background:#30363d;border-radius:5px}
.eo-con__ln{display:flex;gap:8px;white-space:pre-wrap;word-break:break-word;padding:.5px 0}
.eo-con__ln[hidden]{display:none}
.eo-con__t{color:#7c8592;flex:0 0 auto}
.eo-con__c{flex:0 0 auto;width:52px;text-align:right;color:#7c8592;opacity:1}
.eo-con__m{flex:1;min-width:0}
.eo-con__ln--head .eo-con__m{color:#a5a5ff;font-weight:700}
.eo-con__ln--ok .eo-con__m{color:#56d364}
.eo-con__ln--step .eo-con__m{color:#adbac7}
.eo-con__ln--llm .eo-con__m{color:#d2a8ff}
.eo-con__ln--app .eo-con__m{color:#58a6ff}
.eo-con__ln--warn .eo-con__m{color:#e3b341}
.eo-con__ln--error .eo-con__m{color:#ff7b72}
.eo-con__ln--muted .eo-con__m{color:#8a93a1}
.eo-con__ln--stall .eo-con__m{color:#f0883e;font-weight:600}
.eo-con__eo{color:#7c8592;font-size:10.5px}
.eo-con__ms{color:#8a93a1}
.eo-con__empty{color:#8a93a1;padding:14px 2px}
`;

const CH = Object.freeze({
  turn: 'turn', llm: 'llm', app: 'app', sys: 'sys', err: 'err', con: 'con',
});

const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
const clip = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const hhmmss = (ms) => {
  const d = new Date(ms);
  const p = (x) => String(x).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
};

// One step's data, compacted to a line: its ms, the salient rest (faces/eo stripped
// and shown faintly), clipped. Honest — it shows the real payload, just short.
const compactStep = (data) => {
  const d = data || {};
  const { ms, eo, faces, ...rest } = d;
  let body = '';
  try {
    const s = JSON.stringify(rest);
    body = (s && s !== '{}') ? s.replace(/"/g, '').replace(/,/g, ', ').replace(/:/g, ':') : '';
  } catch { body = ''; }
  return { ms: Number.isFinite(ms) ? Math.round(ms) : null, eo: eo || null, body: clip(body, 160) };
};

const fmtArg = (a) => {
  if (a instanceof Error) return `${a.name}: ${a.message}`;
  if (typeof a === 'string') return a;
  if (a == null) return String(a);
  try { return clip(JSON.stringify(a), 220); } catch { return String(a); }
};

// ── the docked terminal ───────────────────────────────────────────────────────
// mountConsole(host, { audit, app, appName, version }) → unmount. Everything is
// self-contained: a FAB toggles the panel, the panel streams the three taps and
// runs the stall detector, and unmount restores console.* and drops the DOM.
export function mountConsole(host, { audit, app, appName = 'EO Reader', version = '' } = {}) {
  if (typeof document === 'undefined' || !host || !audit) return () => {};
  if (!document.getElementById(STYLE_ID)) {
    const st = document.createElement('style'); st.id = STYLE_ID; st.textContent = CSS; document.head.appendChild(st);
  }
  const el = (t, cls, text) => { const e = document.createElement(t); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  // ── the launcher + panel shell ──────────────────────────────────────────────
  const fab = el('button', 'eo-con-fab'); fab.title = 'Open the audit console';
  const fabDot = el('span', 'eo-con-fab__dot'); fab.append(fabDot, el('span', 'eo-con-fab__label', 'Console'));

  const panel = el('div', 'eo-con');
  const head = el('div', 'eo-con__head');
  const title = el('span', 'eo-con__title', '›_ console');
  const prov = el('span', 'eo-con__prov', `${appName} ${version}`.trim());
  const spacer = el('span', 'eo-con__spacer');
  const filterInput = el('input', 'eo-con__filter'); filterInput.type = 'search'; filterInput.placeholder = 'filter…';
  const levelSel = el('select');
  for (const [v, label] of [['all', 'all'], ['warn', 'warn+'], ['error', 'errors']]) {
    const o = el('option', null, label); o.value = v; levelSel.append(o);
  }
  const clearBtn = el('button', null, 'clear');
  const copyBtn = el('button', null, 'copy');
  const exportBtn = el('button', null, 'export ⤓');
  const heightBtn = el('button', null, '⤢');
  const closeBtn = el('button', null, '×');
  head.append(title, prov, spacer, filterInput, levelSel, clearBtn, copyBtn, exportBtn, heightBtn, closeBtn);

  const status = el('div', 'eo-con__status');
  const sdot = el('span', 'eo-con__sdot');
  const stext = el('span', 'eo-con__stext', 'idle');
  status.append(sdot, stext);

  const body = el('div', 'eo-con__body');
  const empty = el('div', 'eo-con__empty', 'Waiting for the app… ask something, and every stage streams here.');
  body.append(empty);

  panel.append(head, status, body);
  host.append(fab, panel);

  // ── line ring ───────────────────────────────────────────────────────────────
  let autoscroll = true;
  let filterText = '';
  let levelFilter = 'all';
  const lineMatches = (node) => {
    if (levelFilter === 'error' && !node.classList.contains('eo-con__ln--error')) return false;
    if (levelFilter === 'warn' && !(node.classList.contains('eo-con__ln--error') || node.classList.contains('eo-con__ln--warn') || node.classList.contains('eo-con__ln--stall'))) return false;
    if (filterText && !node.textContent.toLowerCase().includes(filterText)) return false;
    return true;
  };

  const pushLine = ({ chan = CH.sys, level = 'muted', text = '', ms = null, eo = null }) => {
    if (empty.parentNode) empty.remove();
    const ln = el('div', `eo-con__ln eo-con__ln--${level}`);
    ln.append(el('span', 'eo-con__t', hhmmss(Date.now())));
    ln.append(el('span', 'eo-con__c', chan));
    const m = el('span', 'eo-con__m');
    m.append(document.createTextNode(text));
    if (ms != null) { m.append(el('span', 'eo-con__ms', `  ${ms}ms`)); }
    if (eo) { m.append(el('span', 'eo-con__eo', `   ${eo}`)); }
    ln.append(m);
    if (!lineMatches(ln)) ln.hidden = true;
    body.append(ln);
    while (body.childElementCount > MAX_LINES) body.firstElementChild.remove();
    if (autoscroll) body.scrollTop = body.scrollHeight;
  };

  // keep autoscroll off when the user scrolls up to read; resume at the bottom
  body.addEventListener('scroll', () => {
    autoscroll = body.scrollHeight - body.scrollTop - body.clientHeight < 24;
  });
  const applyFilter = () => { for (const ln of body.children) ln.hidden = !lineMatches(ln); if (autoscroll) body.scrollTop = body.scrollHeight; };
  filterInput.addEventListener('input', () => { filterText = filterInput.value.toLowerCase().trim(); applyFilter(); });
  levelSel.addEventListener('change', () => { levelFilter = levelSel.value; applyFilter(); });
  clearBtn.addEventListener('click', () => { body.innerHTML = ''; body.append(empty); });

  // ── open / close / height ────────────────────────────────────────────────────
  const setOpen = (open) => {
    panel.setAttribute('data-open', open ? '1' : '0');
    fab.setAttribute('data-open', open ? '1' : '0');
    try { localStorage.setItem(OPEN_KEY, open ? '1' : '0'); } catch { /* session-only */ }
    if (open && autoscroll) body.scrollTop = body.scrollHeight;
  };
  fab.addEventListener('click', () => setOpen(true));
  closeBtn.addEventListener('click', () => setOpen(false));
  const HEIGHTS = ['', 'tall', 'min'];
  const setHeight = (h) => { panel.setAttribute('data-h', h); try { localStorage.setItem(HEIGHT_KEY, h); } catch { /* ignore */ } };
  heightBtn.addEventListener('click', () => {
    const cur = panel.getAttribute('data-h') || '';
    setHeight(HEIGHTS[(HEIGHTS.indexOf(cur) + 1) % HEIGHTS.length]);
    if (autoscroll) body.scrollTop = body.scrollHeight;
  });

  // ── copy / export ─────────────────────────────────────────────────────────────
  copyBtn.addEventListener('click', async () => {
    const text = [...body.children].filter(n => !n.hidden).map(n => n.textContent).join('\n');
    try { await navigator.clipboard.writeText(text); copyBtn.textContent = 'copied'; }
    catch { copyBtn.textContent = 'copy failed'; }
    setTimeout(() => { copyBtn.textContent = 'copy'; }, 1200);
  });
  exportBtn.addEventListener('click', () => {
    try {
      const jsonl = audit.exportJSONL ? audit.exportJSONL() : '';
      const blob = new Blob([jsonl], { type: 'application/x-ndjson' });
      const a = el('a'); a.href = URL.createObjectURL(blob);
      a.download = `eo-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) { pushLine({ chan: CH.con, level: 'error', text: `export failed: ${e && e.message}` }); }
  });

  // ── the stall detector (mirrors app.js makeStallGuard, in the surface) ─────────
  let activeTurnId = null;
  let activeQuestion = '';
  let activeSince = 0;
  let lastLifeAt = 0;
  let lastStage = '';
  let streamChars = 0;
  let stallLevelEmitted = 0;    // 0 none, 1 soft, 2 hard, 3 frozen — one line per crossing
  const life = () => { lastLifeAt = Date.now(); };

  const setStatus = (state, text) => {
    status.setAttribute('data-state', state);
    stext.textContent = text;
    fab.setAttribute('data-state', state === 'hard' ? 'soft' : state);
  };

  const tick = () => {
    if (!activeTurnId) { setStatus('idle', 'idle'); return; }
    const now = Date.now();
    const elapsed = ((now - activeSince) / 1000).toFixed(1);
    const quiet = now - lastLifeAt;
    const stg = lastStage || '—';
    const streamed = streamChars ? ` · ${streamChars} chars` : '';
    if (quiet >= STALL_FROZEN) {
      setStatus('frozen', `■ FROZEN? ${activeTurnId} stuck at "${stg}" — no progress for ${(quiet / 1000) | 0}s (past the ${STALL_FROZEN / 1000}s watchdog window)`);
      if (stallLevelEmitted < 3) { stallLevelEmitted = 3; pushLine({ chan: CH.con, level: 'stall', text: `■ ${activeTurnId} appears FROZEN at "${stg}" — no sign of life for ${(quiet / 1000) | 0}s. The engine watchdog should have fired at ${STALL_FROZEN / 1000}s.` }); }
    } else if (quiet >= STALL_HARD) {
      setStatus('hard', `⏳ ${activeTurnId} "${stg}" — no progress for ${(quiet / 1000) | 0}s`);
      if (stallLevelEmitted < 2) { stallLevelEmitted = 2; pushLine({ chan: CH.con, level: 'stall', text: `⏳ ${activeTurnId} stalling at "${stg}" — ${(quiet / 1000) | 0}s without a step or token.` }); }
    } else if (quiet >= STALL_SOFT) {
      setStatus('soft', `slow · ${activeTurnId} "${stg}" — ${(quiet / 1000).toFixed(0)}s quiet · ${elapsed}s total`);
      if (stallLevelEmitted < 1) { stallLevelEmitted = 1; pushLine({ chan: CH.con, level: 'muted', text: `· ${activeTurnId} quiet ${(quiet / 1000) | 0}s at "${stg}" (still within tolerance)` }); }
    } else {
      setStatus('work', `▸ ${activeTurnId} · ${stg} · ${elapsed}s${streamed}`);
    }
  };
  const stallTimer = setInterval(tick, 400);

  // ── tap 1: the audit backbone (turn lifecycle + every stage step) ─────────────
  const turnState = new Map();   // id → { rendered, finished }
  const onAudit = (t) => {
    try {
      if (!t || !t.id) return;
      let ts = turnState.get(t.id);
      if (!ts) {
        ts = { rendered: 0, finished: false };
        turnState.set(t.id, ts);
        activeTurnId = t.id; activeQuestion = t.question || '';
        activeSince = t.startedAt || Date.now(); lastLifeAt = Date.now();
        lastStage = ''; streamChars = 0; stallLevelEmitted = 0;
        pushLine({ chan: CH.turn, level: 'head', text: `▶ ${t.id}  ${clip(oneLine(t.question), 120)}` });
      }
      for (let i = ts.rendered; i < t.steps.length; i++) {
        const s = t.steps[i];
        const { ms, eo, body: b } = compactStep(s.data);
        const isLlm = s.name === 'llm';
        const isErr = s.name === 'error';
        lastStage = s.name;
        pushLine({
          chan: isLlm ? CH.llm : CH.turn,
          level: isErr ? 'error' : isLlm ? 'llm' : 'step',
          text: `  ${s.name.padEnd(11)}${b}`, ms, eo,
        });
      }
      ts.rendered = t.steps.length;
      life();
      if (t.finishedAt && !ts.finished) {
        ts.finished = true;
        if (activeTurnId === t.id) { activeTurnId = null; }
        const bad = t.route === 'error';
        const ans = t.answer ? ` · ${clip(oneLine(t.answer), 72)}` : '';
        pushLine({ chan: CH.turn, level: bad ? 'error' : 'ok', text: `■ ${t.id}  ${t.route || '?'}${ans}`, ms: t.durationMs });
      }
      tick();   // refresh the live status the instant a turn starts/steps/finishes, not on the next interval
    } catch { /* the console must never cost the app a turn */ }
  };
  const unsubAudit = audit.subscribe(onAudit);

  // ── tap 2: the reader session's fan-out (busy / log / stream / web) ───────────
  // The session keeps its own append-only log ring (app.state.log); on each 'log'
  // emit we print only what's new since the last id we saw.
  let lastLogId = null;
  let lastBusy = '';
  const printNewLogs = () => {
    const arr = (app && app.state && app.state.log) || [];
    let seen = lastLogId == null;
    for (const e of arr) {
      if (!seen) { if (e.id === lastLogId) seen = true; continue; }
      pushLine({ chan: CH.app, level: 'app', text: `${e.kind}: ${oneLine(e.text)}${e.effect ? '  — ' + oneLine(e.effect) : ''}` });
    }
    if (arr.length) lastLogId = arr[arr.length - 1].id;
  };

  const onApp = (kind, data) => {
    try {
      life();
      if (kind === 'log') { printNewLogs(); return; }
      if (kind === 'busy') {
        const label = (app.state.busy && (app.state.busy.label || app.state.busy.kind)) || '';
        if (label && label !== lastBusy) { lastBusy = label; pushLine({ chan: CH.app, level: 'muted', text: `busy: ${label}` }); }
        else if (!label) lastBusy = '';
        return;
      }
      if (kind === 'stream') { streamChars += 1; return; }   // token heartbeat — feeds liveness + the status counter
      if (kind === 'web') { pushLine({ chan: CH.app, level: 'app', text: `web: ${typeof data === 'string' ? data : JSON.stringify(data || {})}` }); return; }
      // 'messages' and any other kind: liveness only (already fed by life())
    } catch { /* ignore */ }
  };
  const unsubApp = (app && app.subscribe) ? app.subscribe(onApp) : null;

  // ── tap 3: console.* + uncaught errors ────────────────────────────────────────
  const original = {};
  let reentrant = false;
  const METHODS = { log: 'muted', info: 'muted', debug: 'muted', warn: 'warn', error: 'error' };
  for (const method of Object.keys(METHODS)) {
    const orig = console[method];
    original[method] = orig;
    console[method] = function (...args) {
      try { orig && orig.apply(console, args); } catch { /* ignore */ }
      if (reentrant) return;
      reentrant = true;
      try { pushLine({ chan: CH.sys, level: METHODS[method], text: args.map(fmtArg).join(' ') }); } catch { /* ignore */ }
      reentrant = false;
    };
  }
  const onWinErr = (e) => { try { pushLine({ chan: CH.err, level: 'error', text: `uncaught: ${(e && (e.message || (e.error && e.error.message))) || 'error'}` }); } catch { /* ignore */ } };
  const onRej = (e) => { try { const r = e && e.reason; pushLine({ chan: CH.err, level: 'error', text: `unhandled rejection: ${(r && (r.message || r)) || 'error'}` }); } catch { /* ignore */ } };
  window.addEventListener('error', onWinErr);
  window.addEventListener('unhandledrejection', onRej);

  // ── header provenance (best-effort, refreshed on activity) ────────────────────
  const refreshProv = () => {
    try {
      const p = app && app.provenance ? app.provenance() : null;
      const commit = p && p.build && (p.build.shortCommit || p.build.commit);
      const model = p && p.model && (p.model.label || p.model.model);
      prov.textContent = [
        `${appName} ${version}`.trim(),
        commit ? `build ${String(commit).slice(0, 7)}` : null,
        model ? `model ${model}` : 'model loading…',
      ].filter(Boolean).join('  ·  ');
    } catch { /* keep the last text */ }
  };
  refreshProv();
  const provTimer = setInterval(refreshProv, 4000);

  // ── backfill: don't open onto an empty screen ─────────────────────────────────
  try {
    const recent = (audit.turns || []).slice(-6);
    if (recent.length) {
      empty.remove();
      pushLine({ chan: CH.con, level: 'muted', text: `— ${recent.length} earlier turn${recent.length === 1 ? '' : 's'} on the record —` });
      for (const t of recent) {
        const ended = t.finishedAt ? `${t.route || '?'} · ${t.durationMs}ms` : `unfinished (last: ${t.steps.length ? t.steps[t.steps.length - 1].name : '—'})`;
        pushLine({ chan: CH.turn, level: t.finishedAt ? (t.route === 'error' ? 'error' : 'muted') : 'stall', text: `▷ ${t.id}  ${clip(oneLine(t.question), 90)}  —  ${ended}` });
        turnState.set(t.id, { rendered: t.steps.length, finished: !!t.finishedAt });
      }
    }
    const arr = (app && app.state && app.state.log) || [];
    if (arr.length) lastLogId = arr[arr.length - 1].id;   // don't replay old logs, start fresh
  } catch { /* ignore */ }

  pushLine({ chan: CH.con, level: 'muted', text: `console attached · watching audit + session + console · stall watch at ${STALL_SOFT / 1000}/${STALL_HARD / 1000}/${STALL_FROZEN / 1000}s` });

  // restore last open/height
  try {
    if (localStorage.getItem(OPEN_KEY) === '1') setOpen(true);
    const h = localStorage.getItem(HEIGHT_KEY); if (h != null) setHeight(h);
  } catch { /* ignore */ }
  tick();

  // ── unmount ───────────────────────────────────────────────────────────────────
  return () => {
    clearInterval(stallTimer); clearInterval(provTimer);
    try { unsubAudit && unsubAudit(); } catch { /* ignore */ }
    try { unsubApp && unsubApp(); } catch { /* ignore */ }
    for (const method of Object.keys(METHODS)) { try { console[method] = original[method]; } catch { /* ignore */ } }
    window.removeEventListener('error', onWinErr);
    window.removeEventListener('unhandledrejection', onRej);
    fab.remove(); panel.remove();
  };
}
