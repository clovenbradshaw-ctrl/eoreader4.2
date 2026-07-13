// EO: SIG·NUL(Field → Void,Lens, Making,Binding,Clearing) — the dashboard's DOM surface + launcher
// dashboard/mount.js — the surface that ties the parts together, in the same isolated, vanilla-DOM
// idiom as the vault/chat launchers (rooms/archive/vault-mount.js): boot drops a 📊 button into the
// page, opening it shows the dashboard, and each metric is a tile projected from its reading log.
//
// The refresh cycle is the whole feature made mechanical: pull the page (the CORS feed proxy, the
// same `fetchUrl` the reader ingests with), parse it, read the value at the pinned selector, and
// APPEND it to the watch's log. The tile is then re-projected. A user who understands nothing about
// code clicks a number once (picker.js) and gets a metric that updates itself every time they look.
// Presentation + orchestration only — the reading and the state math are what the tests pin.

import { renderDashboard, DASHBOARD_CSS } from './render.js';
import { extractFromDoc } from './select.js';
import { readValue } from './extract.js';
import { makeReading } from './spec.js';
import { mountPicker } from './picker.js';
import { createDashboardStore } from './store.js';

const nowIso = () => { try { return new Date().toISOString(); } catch { return null; } };

// Parse fetched HTML into a document the selector can run against. Browser only (DOMParser); a
// caller without one gets a null doc and the reading records "couldn't parse".
const parseDoc = (html) => {
  if (typeof DOMParser === 'undefined') return null;
  try { return new DOMParser().parseFromString(String(html || ''), 'text/html'); } catch { return null; }
};

// refreshWatch(store, fetchUrl, watch) → pull the page once, read the pinned value, append a
// reading (ok OR a witnessed failure). Non-throwing: every outcome becomes a reading, never an
// exception that stalls the batch.
export const refreshWatch = async (store, fetchUrl, watch) => {
  const at = nowIso();
  try {
    const res = await fetchUrl(watch.url);
    const doc = parseDoc(res && res.text);
    if (!doc) { store.appendReading(watch.id, makeReading({ at, ok: false, error: 'could not parse page' })); return; }
    const got = extractFromDoc(doc, watch.selector, watch.attr);
    if (!got.ok) { store.appendReading(watch.id, makeReading({ at, raw: got.raw, ok: false, error: got.error })); return; }
    const rv = readValue(got.raw, watch.kind);
    store.appendReading(watch.id, makeReading({ at, raw: got.raw, value: rv.value, currency: rv.currency, display: rv.display, ok: true }));
  } catch (e) {
    store.appendReading(watch.id, makeReading({ at, ok: false, error: (e && e.message) ? `fetch failed: ${e.message}` : 'fetch failed' }));
  }
};

// mountDashboard(root, { store, fetchUrl }) → { destroy, refreshAll }. Renders the grid from the
// store, re-renders on every store change, and wires the tile actions + the add-a-metric flow.
export const mountDashboard = (root, { store, fetchUrl } = {}) => {
  if (typeof document === 'undefined' || !root) return { destroy() {}, refreshAll() {} };
  const D = root.ownerDocument || document;
  if (!D.getElementById('eo-dash-style')) { const s = D.createElement('style'); s.id = 'eo-dash-style'; s.textContent = DASHBOARD_CSS; D.head.appendChild(s); }

  root.classList.add('eo-dash');
  root.innerHTML = `
    <div class="eo-dash-bar">
      <h3>📊 Dashboard</h3>
      <button class="eo-dash-refreshall" title="Pull every metric now">↻ Refresh all</button>
      <button class="eo-dash-add">+ Add metric</button>
    </div>
    <div class="eo-dash-body"></div>`;
  const body = root.querySelector('.eo-dash-body');
  const addBtn = root.querySelector('.eo-dash-add');
  const refreshAllBtn = root.querySelector('.eo-dash-refreshall');

  let mode = 'grid';   // 'grid' | 'add' | 'pick'
  let unmountPicker = null;

  const renderGrid = () => {
    const now = Date.parse(nowIso());
    body.innerHTML = renderDashboard(store.watches(), store.state.readings, { now });
  };

  const busy = (on) => { refreshAllBtn.disabled = on; refreshAllBtn.textContent = on ? '↻ Refreshing…' : '↻ Refresh all'; };

  const refreshAll = async () => {
    const watches = store.watches();
    if (!watches.length) return;
    busy(true);
    // Sequential — the feed proxy is one lane, and a metric-by-metric beat keeps the UI honest.
    for (const w of watches) { await refreshWatch(store, fetchUrl, w); }
    busy(false);
  };
  const refreshOne = async (id) => {
    const w = store.watches().find((x) => x.id === id);
    if (w) await refreshWatch(store, fetchUrl, w);
  };

  // The add-a-metric flow: ask for a URL, pull it, open the picker, and on a pick save the watch
  // + its first reading.
  const startAdd = () => {
    mode = 'add';
    body.innerHTML = `
      <form class="eo-dash-addform" style="max-width:520px;margin:8px auto;display:flex;flex-direction:column;gap:10px">
        <label style="font-weight:650;color:#374151">Page to watch
          <input class="eo-dash-url" type="url" placeholder="https://example.com/page-with-a-number" required
            style="width:100%;padding:10px 12px;border:1px solid #dde0e5;border-radius:9px;font:inherit;margin-top:5px">
        </label>
        <div class="eo-dash-addmsg" style="font-size:12.5px;color:#6b7280;min-height:16px"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button type="button" class="eo-dash-addcancel" style="padding:8px 14px;border:1px solid #dde0e5;border-radius:8px;background:#fff;color:#6b7280;cursor:pointer">Cancel</button>
          <button type="submit" class="eo-dash-addgo" style="padding:8px 16px;border:0;border-radius:8px;background:#4338ca;color:#fff;font-weight:650;cursor:pointer">Fetch page →</button>
        </div>
      </form>`;
    const form = body.querySelector('.eo-dash-addform');
    const urlInput = body.querySelector('.eo-dash-url');
    const msg = body.querySelector('.eo-dash-addmsg');
    body.querySelector('.eo-dash-addcancel').addEventListener('click', () => { mode = 'grid'; renderGrid(); });
    urlInput.focus();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = urlInput.value.trim();
      if (!url) return;
      msg.textContent = 'Fetching the page…';
      const go = body.querySelector('.eo-dash-addgo'); go.disabled = true;
      let html = '';
      try { const res = await fetchUrl(url); html = res && res.text; } catch (err) { msg.textContent = `Couldn't fetch: ${err && err.message ? err.message : 'network error'}`; go.disabled = false; return; }
      if (!html) { msg.textContent = "The page came back empty. Check the URL and try again."; go.disabled = false; return; }
      openPicker(url, html);
    });
  };

  const openPicker = (url, html) => {
    mode = 'pick';
    body.innerHTML = '<div class="eo-dash-pickhost" style="position:absolute;inset:0"></div>';
    body.style.position = 'relative';
    const pickHost = body.querySelector('.eo-dash-pickhost');
    unmountPicker = mountPicker(pickHost, {
      url, html,
      onCancel: () => { closePicker(); mode = 'grid'; renderGrid(); },
      onPick: (spec) => {
        const w = store.addWatch({ url: spec.url, selector: spec.selector, attr: spec.attr, kind: spec.kind, label: spec.label });
        const rv = readValue(spec.raw, spec.kind);
        store.appendReading(w.id, makeReading({ at: nowIso(), raw: spec.raw, value: rv.value, currency: rv.currency, display: rv.display, ok: spec.raw != null }));
        closePicker();
        mode = 'grid';
        renderGrid();
      },
    });
  };
  const closePicker = () => { if (unmountPicker) { try { unmountPicker(); } catch { /* ignore */ } unmountPicker = null; } };

  // Tile actions (event-delegated over the grid).
  body.addEventListener('click', async (e) => {
    if (mode !== 'grid') return;
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    if (action === 'remove') { store.removeWatch(id); return; }
    if (action === 'open') { const w = store.watches().find((x) => x.id === id); if (w) D.defaultView.open(w.url, '_blank', 'noopener'); return; }
    if (action === 'refresh') { btn.textContent = '⋯'; await refreshOne(id); }
  });

  addBtn.addEventListener('click', startAdd);
  refreshAllBtn.addEventListener('click', refreshAll);

  const unsub = store.subscribe(() => { if (mode === 'grid') renderGrid(); });
  renderGrid();

  return {
    refreshAll,
    destroy: () => { try { unsub(); } catch { /* ignore */ } closePicker(); root.innerHTML = ''; root.classList.remove('eo-dash'); },
  };
};

const LAUNCH_STYLE_ID = 'eo-dash-launcher-style';
const LAUNCH_CSS = `
.eo-dash-fab{position:fixed;right:20px;bottom:210px;z-index:2147483000;width:52px;height:52px;border-radius:50%;border:0;background:#4338ca;color:#fff;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.25);font-size:22px}
.eo-dash-fab:hover{background:#3730a3}
.eo-dash-panel{position:fixed;right:20px;bottom:274px;z-index:2147483000;width:min(680px,94vw);height:min(620px,78vh);background:#fff;color:#1b1f24;border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.32);overflow:hidden;display:none;flex-direction:column}
.eo-dash-panel[data-open="1"]{display:flex}
.eo-dash-panel__head{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #e6e8ec;font-weight:700}
.eo-dash-panel__head button{width:28px;height:28px;border:0;border-radius:8px;background:transparent;color:#9aa1ab;cursor:pointer;font-size:18px}
.eo-dash-panel__head button:hover{background:#f0f1f3;color:#1b1f24}
.eo-dash-panel__body{flex:1;min-height:0;position:relative}
.eo-dash-panel__body .eo-dash{position:absolute;inset:0}
`;

// mountDashboardLauncher(host, { fetchUrl, store }) → unmount(). The floating 📊 entry point, in
// the vault/chat launcher idiom. Always available (a dashboard needs no login), it lazily mounts
// the dashboard on first open and refreshes every metric each time it's opened — so a tile is
// current the moment you look at it. `fetchUrl(url) → { text }` is the page-pull the boot binds
// to the web client; `store` defaults to a localStorage-backed one so metrics survive reloads.
export const mountDashboardLauncher = (host, { fetchUrl, store } = {}) => {
  if (typeof document === 'undefined' || !host || typeof fetchUrl !== 'function') return () => {};
  if (!document.getElementById(LAUNCH_STYLE_ID)) { const st = document.createElement('style'); st.id = LAUNCH_STYLE_ID; st.textContent = LAUNCH_CSS; document.head.appendChild(st); }
  const theStore = store || createDashboardStore();

  const fab = document.createElement('button'); fab.className = 'eo-dash-fab'; fab.title = 'Live dashboard'; fab.textContent = '📊';
  const panel = document.createElement('div'); panel.className = 'eo-dash-panel';
  const head = document.createElement('div'); head.className = 'eo-dash-panel__head';
  const title = document.createElement('span'); title.textContent = '📊 Live dashboard';
  const close = document.createElement('button'); close.textContent = '×'; close.title = 'Close';
  head.append(title, close);
  const body = document.createElement('div'); body.className = 'eo-dash-panel__body';
  panel.append(head, body);
  host.append(fab, panel);

  let dash = null;
  const open = () => {
    panel.setAttribute('data-open', '1');
    if (!dash) dash = mountDashboard(body, { store: theStore, fetchUrl });
    // Freshen every metric on open — a look is a pull.
    dash.refreshAll();
  };
  fab.addEventListener('click', () => (panel.getAttribute('data-open') === '1' ? panel.setAttribute('data-open', '0') : open()));
  close.addEventListener('click', () => panel.setAttribute('data-open', '0'));

  return () => {
    try { dash && dash.destroy(); } catch { /* ignore */ }
    fab.remove(); panel.remove();
  };
};
