// EO: CON(Network → Link, Making) — the pipeline surface's node/edge canvas
// pipeline-canvas.js — the palette (click a kind to drop a node) and the canvas itself: nodes as
// positioned boxes with in/out port dots, edges as SVG bezier paths, drag-to-move and
// drag-from-port-to-port-to-wire. Split out of pipeline-surface.js (which owns the DOM shell +
// top bar + inspector wiring) purely to stay under the repo's 250-line god-module ceiling.
//
// Every function here takes the shared `ctx` the mount builds (pipeline-surface.js): `ctx.engine`
// (the graph CRUD), `ctx.dom` (element refs), `ctx.state` (currentId/selection/connecting/
// dragging/lastRun — the UI-local, non-persisted bits), and `ctx.rerender()` (call after a
// selection/drag change that the engine itself won't emit a subscribe event for).
import { nodeKindList, kindOf } from './pipeline-nodes.js';
import { el, svgEl, portPos, bezier, CATEGORY_COLOR, STATUS_COLOR } from './pipeline-dom.js';

export const renderPalette = (ctx) => {
  const { palette } = ctx.dom;
  palette.innerHTML = '';
  for (const [cat, label] of [['source', 'SOURCE'], ['process', 'PROCESS'], ['output', 'OUTPUT']]) {
    palette.appendChild(el('div', 'eo-pipe-pal-group', label));
    for (const kind of nodeKindList().filter((k) => k.category === cat)) {
      const btn = el('button', 'eo-pipe-pal-btn', kind.label);
      btn.onclick = () => {
        const g = ctx.ensureGraph();
        const n = g.nodes.length;
        ctx.engine.addNode(g.id, kind.id, { x: 60 + (n % 6) * 40, y: 40 + Math.floor(n / 6) * 40 });
      };
      palette.appendChild(btn);
    }
  }
};

export const renderCanvas = (ctx) => {
  const { nodesLayer, svg } = ctx.dom;
  const g = ctx.graph();
  nodesLayer.innerHTML = ''; svg.innerHTML = '';
  if (!g) return;
  for (const edge of g.edges) {
    const a = g.nodes.find((n) => n.id === edge.from), b = g.nodes.find((n) => n.id === edge.to);
    if (!a || !b) continue;
    const path = svgEl('path', { class: 'eo-pipe-edge', d: bezier(portPos(a, 'out'), portPos(b, 'in')) });
    path.style.pointerEvents = 'stroke'; path.style.cursor = 'pointer';
    path.setAttribute('title', 'click to disconnect');
    path.onclick = () => ctx.engine.disconnect(g.id, edge.id);
    svg.appendChild(path);
  }
  for (const node of g.nodes) {
    const kind = kindOf(node.kind);
    const box = el('div', 'eo-pipe-node' + (ctx.state.selection.has(node.id) ? ' eo-pipe-sel' : ''));
    box.style.left = node.x + 'px'; box.style.top = node.y + 'px';
    const hd = el('div', 'eo-pipe-node-hd');
    const dot = el('span', 'eo-pipe-node-cat'); dot.style.background = CATEGORY_COLOR[kind ? kind.category : 'process'];
    hd.append(dot, el('span', null, kind ? kind.label : node.kind));
    box.appendChild(hd);
    const sub = node.kind === 'source' ? (node.sourceSn ? String(node.sourceSn) : 'no source chosen')
      : (kind ? `${kind.accepts || '—'} → ${kind.produces || 'sink'}` : '');
    box.appendChild(el('div', 'eo-pipe-node-body', sub));
    const st = ctx.state.lastRun.statusById[node.id];
    if (st) {
      const sdot = el('span', 'eo-pipe-status-dot');
      sdot.style.background = st.ok ? STATUS_COLOR.ok : STATUS_COLOR.err;
      sdot.title = st.ok ? JSON.stringify(st.meta || {}) : st.error;
      box.appendChild(sdot);
    }
    if (kind && kind.accepts) {
      const p = el('div', 'eo-pipe-port eo-pipe-port-in');
      p.onpointerdown = (e) => {
        e.stopPropagation();
        if (ctx.state.connecting) { ctx.engine.connect(g.id, ctx.state.connecting.fromId, node.id); ctx.state.connecting = null; ctx.rerender(); }
      };
      box.appendChild(p);
    }
    if (kind && kind.produces) {
      const p = el('div', 'eo-pipe-port eo-pipe-port-out');
      p.onpointerdown = (e) => { ctx.state.connecting = { fromId: node.id }; e.preventDefault(); e.stopPropagation(); };
      box.appendChild(p);
    }
    box.onpointerdown = (e) => {
      if (e.target.classList.contains('eo-pipe-port')) return;
      if (e.shiftKey) { ctx.state.selection.has(node.id) ? ctx.state.selection.delete(node.id) : ctx.state.selection.add(node.id); }
      else if (!ctx.state.selection.has(node.id)) ctx.state.selection = new Set([node.id]);
      const p = ctx.toCanvasPoint(e);
      ctx.state.dragging = { nodeId: node.id, ox: p.x - node.x, oy: p.y - node.y };
      e.preventDefault();
      ctx.rerender();
    };
    nodesLayer.appendChild(box);
  }
};

// attachCanvasEvents(ctx) — drag-to-move (persisted to the engine on pointerup, previewed live via
// direct node.x/y mutation + rerender in between) and a click on empty canvas clearing selection.
// Connecting an edge is wired in renderCanvas itself (each port owns its own pointerdown), since it
// needs the specific node/kind the port belongs to.
export const attachCanvasEvents = (ctx) => {
  const { canvasWrap, canvas } = ctx.dom;
  ctx.toCanvasPoint = (e) => {
    const rect = canvasWrap.getBoundingClientRect();
    return { x: e.clientX - rect.left + canvasWrap.scrollLeft, y: e.clientY - rect.top + canvasWrap.scrollTop };
  };
  canvasWrap.onpointermove = (e) => {
    const d = ctx.state.dragging; if (!d) return;
    const g = ctx.graph(); const node = g && g.nodes.find((n) => n.id === d.nodeId);
    if (!node) return;
    const p = ctx.toCanvasPoint(e);
    node.x = Math.max(0, p.x - d.ox); node.y = Math.max(0, p.y - d.oy);
    ctx.rerender();
  };
  canvasWrap.onpointerup = () => {
    const d = ctx.state.dragging;
    if (d) { const g = ctx.graph(); const node = g && g.nodes.find((n) => n.id === d.nodeId); if (node) ctx.engine.moveNode(g.id, node.id, node.x, node.y); }
    ctx.state.dragging = null; ctx.state.connecting = null;
  };
  canvasWrap.onpointerdown = (e) => {
    if (e.target === canvasWrap || e.target === canvas) { ctx.state.selection = new Set(); ctx.rerender(); }
  };
};
