// EO: SIG·INS(Field → Entity, Making,Binding) — the pipeline surface's DOM shell
// pipeline-surface.js — a self-contained, vanilla-DOM node-graph editor, in the same isolated
// idiom as rooms/chat/mount.js and rooms/reader/console-surface.js: it owns its own markup and
// styles (pipeline-dom.js) and delegates the two interactive halves — the canvas
// (pipeline-canvas.js) and the parameter inspector (pipeline-inspector.js) — to their own modules,
// sharing one `ctx` object so state (selection, drag, the last run's status) lives in one place.
// Wire a Source to a Transcript/Waveform/Characters reading, a reading to a Motifs or Top-N
// filter, and any of that to a sink — a new Drive note, a downloaded file, an arbitrary webhook,
// or a TouchDesigner instance over the local OSC bridge (tools/touchdesigner-bridge) — n8n-style,
// anything to anything.
//
// createPipelineSurface({ app }) → the fully-wired object window.EO.pipeline holds: the graph
// CRUD/run (pipeline-engine.js) plus open(opts)/close()/toggle() for the overlay. `opts.sourceIds`
// (open only) seeds one Source node per id not already on the current graph — the convenience
// link the Sources tab's "Surface" button uses so opening from a selection isn't a blank canvas.
import { createPipelineEngine } from './pipeline-engine.js';
import { STYLE_ID, CSS, el } from './pipeline-dom.js';
import { renderPalette, renderCanvas, attachCanvasEvents } from './pipeline-canvas.js';
import { renderInspector } from './pipeline-inspector.js';

export function mountPipelineSurface(root, { engine } = {}) {
  if (typeof document === 'undefined' || !root || !engine) return { open() {}, close() {}, toggle() {}, destroy() {} };
  if (!document.getElementById(STYLE_ID)) {
    const st = document.createElement('style'); st.id = STYLE_ID; st.textContent = CSS; document.head.appendChild(st);
  }

  const overlay = el('div', 'eo-pipe-overlay');
  const bar = el('div', 'eo-pipe-bar');
  const body = el('div', 'eo-pipe-body');
  const palette = el('div', 'eo-pipe-palette');
  const canvasWrap = el('div', 'eo-pipe-canvas-wrap');
  const canvas = el('div', 'eo-pipe-canvas');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'eo-pipe-svg');
  const nodesLayer = el('div'); nodesLayer.style.position = 'absolute'; nodesLayer.style.inset = '0';
  const inspector = el('div', 'eo-pipe-inspector');
  const logPanel = el('div', 'eo-pipe-log');
  canvas.append(svg, nodesLayer);
  canvasWrap.appendChild(canvas);
  body.append(palette, canvasWrap, inspector);
  overlay.append(bar, body, logPanel);
  root.appendChild(overlay);

  const graphSelect = document.createElement('select');
  const btnNew = el('button', null, 'New'), btnRename = el('button', null, 'Rename'), btnDelete = el('button', null, 'Delete');
  const btnRun = el('button', 'eo-pipe-run', 'Run ▸'), btnLog = el('button', null, 'Log');
  const status = el('span', 'eo-pipe-status', '');
  const btnClose = el('button', null, '✕');
  bar.append(el('strong', null, 'Surface'), graphSelect, btnNew, btnRename, btnDelete, btnRun, btnLog, status, el('div', 'eo-pipe-spacer'), btnClose);

  const ctx = {
    engine,
    dom: { overlay, bar, palette, canvasWrap, canvas, svg, nodesLayer, inspector, logPanel },
    state: { currentId: null, selection: new Set(), connecting: null, dragging: null, lastRun: { statusById: {} }, logOpen: false },
    graph() { return engine.get(ctx.state.currentId); },
    ensureGraph() {
      if (ctx.state.currentId && ctx.graph()) return ctx.graph();
      const list = engine.list();
      const g = list.length ? engine.get(list[0].id) : engine.create('Surface 1');
      ctx.state.currentId = g.id;
      return g;
    },
    rerender() { renderCanvas(ctx); renderInspector(ctx); },
  };
  attachCanvasEvents(ctx);

  const renderBar = () => {
    graphSelect.innerHTML = '';
    for (const g of engine.list()) {
      const o = document.createElement('option'); o.value = g.id; o.textContent = g.name;
      if (g.id === ctx.state.currentId) o.selected = true;
      graphSelect.appendChild(o);
    }
  };
  const renderLog = () => {
    logPanel.className = 'eo-pipe-log' + (ctx.state.logOpen ? ' eo-pipe-log-open' : '');
    logPanel.innerHTML = '';
    const g = ctx.graph(); if (!g) return;
    for (const node of g.nodes) {
      const st = ctx.state.lastRun.statusById[node.id]; if (!st) continue;
      const row = el('div', 'eo-pipe-log-row' + (st.ok ? '' : ' eo-pipe-log-err'), `${node.kind} — ${st.ok ? 'ok' : 'error: ' + st.error}`);
      logPanel.appendChild(row);
    }
  };
  const render = () => { renderBar(); renderCanvas(ctx); renderInspector(ctx); renderLog(); };

  graphSelect.onchange = () => { ctx.state.currentId = graphSelect.value; ctx.state.selection = new Set(); render(); };
  btnNew.onclick = () => { const name = prompt('Surface name', 'Untitled surface'); if (name) { ctx.state.currentId = engine.create(name).id; render(); } };
  btnRename.onclick = () => { const g = ctx.graph(); if (!g) return; const name = prompt('Rename surface', g.name); if (name) engine.rename(g.id, name); };
  btnDelete.onclick = () => {
    const g = ctx.graph(); if (!g) return;
    if (confirm(`Delete surface "${g.name}"? This cannot be undone.`)) { engine.remove(g.id); ctx.state.currentId = null; render(); }
  };
  btnRun.onclick = async () => {
    const g = ctx.graph(); if (!g) return;
    status.textContent = 'running…'; btnRun.disabled = true;
    try { ctx.state.lastRun = await engine.run(g.id); status.textContent = `done — ${g.nodes.length} node${g.nodes.length === 1 ? '' : 's'}`; }
    catch (e) { status.textContent = `failed — ${String((e && e.message) || e)}`; }
    btnRun.disabled = false; ctx.state.logOpen = true;
    renderCanvas(ctx); renderLog();
  };
  btnLog.onclick = () => { ctx.state.logOpen = !ctx.state.logOpen; renderLog(); };
  btnClose.onclick = () => close();

  const unsubscribe = engine.subscribe(() => render());

  const open = (opts = {}) => {
    ctx.ensureGraph();
    if (opts.sourceIds && opts.sourceIds.length) {
      const g = ctx.graph();
      const already = new Set(g.nodes.filter((n) => n.kind === 'source').map((n) => n.sourceSn));
      let i = g.nodes.length;
      for (const sn of opts.sourceIds) {
        if (already.has(sn)) continue;
        engine.addNode(g.id, 'source', { x: 60 + (i % 6) * 40, y: 40 + Math.floor(i / 6) * 40, sourceSn: sn });
        i++;
      }
    }
    overlay.classList.add('eo-pipe-open');
    render();
  };
  const close = () => overlay.classList.remove('eo-pipe-open');
  const toggle = (opts) => (overlay.classList.contains('eo-pipe-open') ? close() : open(opts));
  const destroy = () => { unsubscribe(); overlay.remove(); };

  renderPalette(ctx);
  render();

  return { open, close, toggle, destroy };
}

// createPipelineSurface({ app }) — the one-call factory boot.js uses: builds the engine, mounts
// the overlay onto document.body, and returns the merged object (graph CRUD/run + open/close/
// toggle) that becomes window.EO.pipeline. Kept here (rather than inlined in boot.js) so boot.js's
// own line count — already pinned at its god-module baseline — doesn't have to grow to wire this in.
export function createPipelineSurface({ app } = {}) {
  const engine = createPipelineEngine({ app });
  let surface = { open() {}, close() {}, toggle() {} };
  try { if (typeof document !== 'undefined') surface = mountPipelineSurface(document.body, { engine }); }
  catch (e) { console.warn('[EO] pipeline surface not mounted', e); }
  return Object.freeze({ ...engine, open: surface.open, close: surface.close, toggle: surface.toggle });
}
