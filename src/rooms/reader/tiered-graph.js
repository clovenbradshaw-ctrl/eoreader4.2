// EO: NUL(Network → Void, Clearing) — tiered graph SVG renderer
// mountTieredGraph — the pivotable tiered graph surface. Entities as nodes
// across the three helix tiers — existence (the source and the figures INSed
// from it), structure (the bonds between them), significance (the claims
// those bonds trace to) — connected by operator edges, each edge wearing its
// glyph ON the line. Three switchable layouts (flow · tiers · radial, radial
// default) with animated pivoting, tier filtering, a names toggle, pan/zoom/
// fit, and click-to-inspect.
//
// READABILITY RULES (the point of this surface — it must never read as a
// hairball):
//   · operator glyphs sit bare on the line with a paper-coloured halo, and
//     HIDE on edges too short to carry them (screen-space test, re-run on
//     every zoom) — a glyph never smothers the edge it annotates;
//   · labels are collision-culled: candidates are placed by priority (the
//     document first, then degree) and any label whose box would overlap an
//     already-placed one is dropped, not drawn;
//   · label and glyph sizes are zoom-invariant (font-size 11/k) — zooming in
//     reveals more culled labels rather than inflating the ones you have;
//   · a de-overlap pass separates any two nodes closer than a minimum
//     distance, then clamps into the canvas;
//   · rings/ranks are ordered by where their neighbours sit (angular mean in
//     radial, barycentre in flow), and the document sits at the radial centre;
//   · names toggles persistent labels; the hovered node's full name always
//     shows, whatever the toggle says.
//
// The host builds the {nodes, edges} data honestly from the record
// (app.dc.js _tieredGraphData); this module only draws. Pure DOM + SVG, no
// dependencies; returns { destroy }.
//
//   nodes: [{ id, tier: 0|1|2, label, kind, ref }]
//   edges: [{ a, b, tier, gl, code }]   — a → b, gl = operator glyph
//   onOpen(node)  optional — "open →" in the inspector for kinds that navigate

const TIER = {
  0: { fill: '#7F77DD', stroke: '#534AB7', edge: '#7F77DD', name: 'existence',    chipBg: '#EEEDFE', chipFg: '#3C3489', glyphs: '∅○●' },
  1: { fill: '#1D9E75', stroke: '#0F6E56', edge: '#1D9E75', name: 'structure',    chipBg: '#E1F5EE', chipFg: '#085041', glyphs: '｜⋈△' },
  2: { fill: '#EF9F27', stroke: '#BA7517', edge: '#EF9F27', name: 'significance', chipBg: '#FAEEDA', chipFg: '#633806', glyphs: '⊢⊨⊛' },
};

const STYLE_ID = 'eo-tg-style';
const CSS = `
.eo-tg{font-family:var(--sans,system-ui,sans-serif);color:var(--ink,#15181e);}
.eo-tg .tg-btn{font-size:12px;padding:5px 10px;border:1px solid var(--line2,#e5e7eb);border-radius:7px;background:var(--card,#fff);color:var(--ink2,#555);cursor:pointer;display:inline-flex;align-items:center;gap:5px;line-height:1.2;}
.eo-tg .tg-btn:hover{background:var(--app,#f4f5f7);}
.eo-tg .tg-btn.on{background:var(--ink,#15181e);color:var(--card,#fff);border-color:var(--ink,#15181e);}
.eo-tg .tg-chip{font-size:11px;padding:4px 9px;border-radius:7px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;border:1px solid transparent;user-select:none;}
.eo-tg .tg-chip .gl{font-size:13px;letter-spacing:2px;font-family:var(--mono,ui-monospace,Menlo,monospace);}
.eo-tg .tg-chip.off{opacity:0.35;}
.eo-tg .tg-seg{display:inline-flex;border:1px solid var(--line2,#e5e7eb);border-radius:8px;overflow:hidden;}
.eo-tg .tg-seg .tg-btn{border:none;border-radius:0;}
.eo-tg .tg-node{cursor:pointer;}
.eo-tg .tg-node circle{transition:r .15s;}
.eo-tg .tg-plabel{paint-order:stroke;stroke:var(--card,#fff);stroke-linejoin:round;fill:var(--ink,#15181e);pointer-events:none;}
.eo-tg .tg-eglyph{paint-order:stroke;stroke:var(--card,#fff);stroke-linejoin:round;pointer-events:none;font-family:var(--mono,ui-monospace,Menlo,monospace);}
`;

const NS = 'http://www.w3.org/2000/svg';

export function mountTieredGraph(root, { nodes: inNodes = [], edges: inEdges = [], onOpen = null, countsLabel = '' } = {}) {
  if (!document.getElementById(STYLE_ID)) {
    const st = document.createElement('style'); st.id = STYLE_ID; st.textContent = CSS; document.head.appendChild(st);
  }
  const el = (t, a = {}) => { const e = document.createElement(t); for (const k in a) { if (k === 'text') e.textContent = a[k]; else if (k === 'html') e.innerHTML = a[k]; else e.setAttribute(k, a[k]); } return e; };
  const sv = (t, a = {}) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const nodes = inNodes.map((n) => ({ ...n, x: 340, y: 220, px: 340, py: 220, tx: 340, ty: 220, rank: 0, _ang: 0 }));
  const byId = {}; nodes.forEach((n) => byId[n.id] = n);
  const edges = inEdges.filter((e) => byId[e.a] && byId[e.b]);
  const inN = {}, deg = {};
  nodes.forEach((n) => { inN[n.id] = []; deg[n.id] = 0; });
  edges.forEach((e) => { inN[e.b].push(e.a); deg[e.a]++; deg[e.b]++; });

  // rank = longest path from a root, over the (acyclic by construction) DAG
  const indeg = {}; nodes.forEach((n) => indeg[n.id] = 0);
  edges.forEach((e) => indeg[e.b]++);
  const order = [], q = nodes.filter((n) => indeg[n.id] === 0).map((n) => n.id);
  const din = {}; nodes.forEach((n) => din[n.id] = indeg[n.id]);
  while (q.length) { const id = q.shift(); order.push(id); edges.forEach((e) => { if (e.a === id) { din[e.b]--; if (din[e.b] === 0) q.push(e.b); } }); }
  order.forEach((id) => { const n = byId[id]; edges.forEach((e) => { if (e.b === id) n.rank = Math.max(n.rank, byId[e.a].rank + 1); }); });
  let maxRank = 0; nodes.forEach((n) => maxRank = Math.max(maxRank, n.rank));

  const W = 680, H = 440, state = { layout: 'radial', orient: 'h', rot: 0, tiers: { 0: true, 1: true, 2: true }, sel: null, names: false, hover: null };

  // ── shell ────────────────────────────────────────────────────────────────
  const wrap = el('div', { class: 'eo-tg', role: 'region', 'aria-label': 'Interactive record graph: nodes across three helix tiers, connected by operator edges' });
  wrap.innerHTML =
    '<div style="border:1px solid var(--line,#e5e7eb);border-radius:12px;overflow:hidden;background:var(--card,#fff);">' +
    '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;border-bottom:1px solid var(--line,#e5e7eb);background:var(--app,#f7f8fb);">' +
      '<div class="tg-seg">' +
        '<button class="tg-btn" data-layout="flow">⇢ flow</button>' +
        '<button class="tg-btn" data-layout="tiers">≡ tiers</button>' +
        '<button class="tg-btn on" data-layout="radial">◎ radial</button>' +
      '</div>' +
      '<button class="tg-btn" data-pivot>⟲ <span data-pivot-lbl>rotate</span></button>' +
      '<button class="tg-btn" data-names title="Toggle persistent node names — hover always shows the full name">names</button>' +
      '<div style="display:flex;gap:5px;margin-left:auto;">' +
        '<button class="tg-btn" data-zin aria-label="zoom in">+</button>' +
        '<button class="tg-btn" data-zout aria-label="zoom out">−</button>' +
        '<button class="tg-btn" data-fit>⌖ fit</button>' +
      '</div>' +
    '</div>' +
    '<div style="display:flex;align-items:center;gap:7px;padding:8px 12px;border-bottom:1px solid var(--line,#e5e7eb);flex-wrap:wrap;">' +
      '<span style="font-size:11px;color:var(--ink3,#999);letter-spacing:.04em;margin-right:2px;">tiers</span>' +
      [0, 1, 2].map((t) => '<span class="tg-chip" data-tier="' + t + '" style="background:' + TIER[t].chipBg + ';color:' + TIER[t].chipFg + ';"><span class="gl">' + TIER[t].glyphs + '</span>' + TIER[t].name + '</span>').join('') +
    '</div>' +
    '<div style="position:relative;background:var(--card,#fff);background-image:radial-gradient(var(--line,#e5e7eb) 0.5px,transparent 0.5px);background-size:16px 16px;">' +
      '<svg data-svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block;touch-action:none;cursor:grab;">' +
        '<defs><marker data-marker markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L5,3 L0,6 Z" fill="#B4B2A9"/></marker></defs>' +
        '<g data-vp><g data-edges></g><g data-nodes></g><g data-labels></g></g>' +
      '</svg>' +
    '</div>' +
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:9px;padding:9px 13px;border-top:1px solid var(--line,#e5e7eb);background:var(--app,#f7f8fb);font-size:12px;color:var(--ink2,#555);min-height:20px;">' +
      '<div data-detail style="display:flex;align-items:center;gap:9px;min-width:0;flex:1;flex-wrap:wrap;"><span style="color:var(--ink3,#999);">click a node to inspect · drag to pan · scroll to zoom</span></div>' +
      '<span data-counts style="font-family:var(--mono,ui-monospace,monospace);color:var(--ink3,#999);flex:0 0 auto;">' + esc(countsLabel) + '</span>' +
    '</div>' +
    '</div>';
  root.appendChild(wrap);

  // the marker id must be unique per mount or filters collide across mounts
  const mk = 'tg-eh-' + Math.floor(Math.random() * 1e9);
  wrap.querySelector('[data-marker]').setAttribute('id', mk);

  const svg = wrap.querySelector('[data-svg]'), gN = wrap.querySelector('[data-nodes]'), gE = wrap.querySelector('[data-edges]'), gL = wrap.querySelector('[data-labels]'), vp = wrap.querySelector('[data-vp]');
  const detail = wrap.querySelector('[data-detail]'), countsEl = wrap.querySelector('[data-counts]');

  // ── layouts ──────────────────────────────────────────────────────────────
  // De-overlap: any two nodes closer than minD are pushed apart, then clamped
  // into the canvas — no layout is allowed to stack nodes.
  function separate(iters, minD) {
    for (let it = 0; it < iters; it++) {
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j]; let dx = b.tx - a.tx, dy = b.ty - a.ty;
        const d = Math.hypot(dx, dy) || 0.01;
        if (d < minD) { const f = (minD - d) / 2 / d; dx *= f; dy *= f; a.tx -= dx; a.ty -= dy; b.tx += dx; b.ty += dy; }
      }
    }
    nodes.forEach((n) => { n.tx = Math.max(28, Math.min(W - 28, n.tx)); n.ty = Math.max(22, Math.min(H - 22, n.ty)); });
  }
  // Rank/band ordering by barycentre of in-neighbours: nodes land near what
  // they hang from, so edges run short and cross rarely.
  const orderBy = (arr, posOf) => {
    const scored = arr.map((n, i) => { const ps = inN[n.id].map(posOf).filter((v) => v != null);
      return [n, ps.length ? ps.reduce((s, v) => s + v, 0) / ps.length : i, i]; });
    scored.sort((a, b) => (a[1] - b[1]) || (a[2] - b[2]));
    return scored.map((s) => s[0]);
  };
  function layoutFlow() {
    const byRank = {}; nodes.forEach((n) => (byRank[n.rank] = byRank[n.rank] || []).push(n));
    const ranks = Object.keys(byRank).map(Number).sort((a, b) => a - b);
    const pos = {}; ranks.forEach((r) => byRank[r].forEach((n, i) => pos[n.id] = i));
    ranks.forEach((r, k) => { if (!k) return;
      byRank[r] = orderBy(byRank[r], (id) => pos[id]);
      byRank[r].forEach((n, i) => pos[n.id] = i); });
    const horiz = state.orient === 'h';
    ranks.forEach((r) => { const arr = byRank[r], cnt = arr.length;
      arr.forEach((n, idx) => {
        const along = 55 + (n.rank / (maxRank || 1)) * ((horiz ? W : H) - 110);
        const cross = cnt < 2 ? (horiz ? H : W) / 2 : 34 + (idx / (cnt - 1)) * ((horiz ? H : W) - 68);
        if (horiz) { n.tx = along; n.ty = cross; } else { n.tx = cross; n.ty = along; }
      }); });
    separate(60, 30);
  }
  function layoutTiers() {
    const horiz = state.orient === 'h';
    const groups = { 0: [], 1: [], 2: [] }; nodes.forEach((n) => groups[n.tier].push(n));
    const pos = {}; [0, 1, 2].forEach((t) => groups[t].forEach((n, i) => pos[n.id] = i));
    [1, 2].forEach((t) => { groups[t] = orderBy(groups[t], (id) => pos[id]); groups[t].forEach((n, i) => pos[n.id] = i); });
    [0, 1, 2].forEach((t) => {
      const arr = groups[t], n = arr.length;
      if (horiz) {
        const bandY = 68 + t * ((H - 136) / 2), perRow = Math.ceil(n / 2);
        arr.forEach((nd, k) => { const row = Math.floor(k / perRow), col = k % perRow, rc = Math.min(perRow, n - row * perRow);
          nd.tx = rc < 2 ? W / 2 : 60 + (col / (rc - 1)) * (W - 120);
          nd.ty = bandY - 18 + row * 44; });
      } else {
        const bandX = 88 + t * ((W - 176) / 2), perCol = Math.ceil(n / 2);
        arr.forEach((nd, k) => { const col = Math.floor(k / perCol), row = k % perCol, cc = Math.min(perCol, n - col * perCol);
          nd.ty = cc < 2 ? H / 2 : 52 + (row / (cc - 1)) * (H - 104);
          nd.tx = bandX - 18 + col * 46; });
      }
    });
  }
  function layoutRadial() {
    // The document is the root of the record — it sits at the centre. Each
    // ring is ordered by the circular mean angle of its neighbours in the
    // ring below (a bond between its participants, a claim over its bond),
    // with a small phase offset per ring so spokes never align.
    const cx = W / 2, cy = H / 2;
    const groups = { 0: [], 1: [], 2: [] };
    nodes.forEach((n) => { if (n.kind === 'doc') { n.tx = cx; n.ty = cy; n._ang = 0; } else groups[n.tier].push(n); });
    const meanAng = (ids) => { let sx = 0, sy = 0, c = 0;
      ids.forEach((id) => { const m = byId[id]; if (m && m.kind !== 'doc') { sx += Math.cos(m._ang); sy += Math.sin(m._ang); c++; } });
      return c ? Math.atan2(sy, sx) : null; };
    [0, 1, 2].forEach((t) => {
      const arr = groups[t], n = arr.length, r = 62 + t * 84;
      if (t > 0) {
        arr.forEach((nd) => { const a = meanAng(inN[nd.id]); nd._want = a == null ? 0 : a; });
        arr.sort((a, b) => (a._want - b._want));
      }
      arr.forEach((nd, k) => {
        const ang = state.rot * Math.PI / 180 + t * 0.4 + (k / Math.max(1, n)) * Math.PI * 2;
        nd._ang = ang; nd.tx = cx + Math.cos(ang) * r; nd.ty = cy + Math.sin(ang) * r; });
    });
    separate(50, 28);
  }
  function relayout() {
    if (state.layout === 'flow') layoutFlow(); else if (state.layout === 'tiers') layoutTiers(); else layoutRadial();
    animate();
  }

  // ── marks: each edge is a group of path + bare glyph with a paper halo ───
  const nodeEls = {}, edgeEls = [];
  nodes.forEach((n) => {
    const g = sv('g', { class: 'tg-node' }); g.style.transform = 'translate(' + n.x + 'px,' + n.y + 'px)';
    const c = sv('circle', { r: n.kind === 'doc' ? 9 : 7, fill: TIER[n.tier].fill, stroke: TIER[n.tier].stroke, 'stroke-width': 1.2 });
    g.appendChild(c);
    g.addEventListener('click', (ev) => { ev.stopPropagation(); select(n.id); });
    g.addEventListener('mouseenter', () => { if (!state.sel) { state.hover = n.id; refine(); } });
    g.addEventListener('mouseleave', () => { if (!state.sel) { state.hover = null; refine(); } });
    gN.appendChild(g); nodeEls[n.id] = { g, c };
  });
  edges.forEach((e) => {
    const g = sv('g', {});
    const p = sv('path', { fill: 'none', stroke: TIER[e.tier].edge, 'stroke-width': 1.1, 'stroke-opacity': 0.42, 'marker-end': 'url(#' + mk + ')' });
    const mt = sv('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 11, fill: TIER[e.tier].stroke, class: 'tg-eglyph' });
    mt.textContent = e.gl || '·';
    g.appendChild(p); g.appendChild(mt); gE.appendChild(g);
    edgeEls.push({ g, p, mt, e });
  });

  function draw(mid) {
    edgeEls.forEach((o) => {
      const a = byId[o.e.a], b = byId[o.e.b];
      const ax = mid ? a.x : a.tx, ay = mid ? a.y : a.ty, bx = mid ? b.x : b.tx, by = mid ? b.y : b.ty;
      const dx = bx - ax, dy = by - ay, cx = (ax + bx) / 2 - dy * 0.08, cy = (ay + by) / 2 + dx * 0.08;
      const ux = bx - cx, uy = by - cy, L = Math.hypot(ux, uy) || 1, ex = bx - ux / L * 9, ey = by - uy / L * 9;
      o.p.setAttribute('d', 'M' + ax.toFixed(1) + ',' + ay.toFixed(1) + ' Q' + cx.toFixed(1) + ',' + cy.toFixed(1) + ' ' + ex.toFixed(1) + ',' + ey.toFixed(1));
      o.mt.setAttribute('x', (ax * 0.25 + cx * 0.5 + bx * 0.25).toFixed(1));
      o.mt.setAttribute('y', (ay * 0.25 + cy * 0.5 + by * 0.25).toFixed(1));
    });
  }

  let animT = null;
  function animate() {
    nodes.forEach((n) => { n.px = n.x; n.py = n.y; });
    const start = performance.now(), dur = 460;
    if (animT) cancelAnimationFrame(animT);
    gL.innerHTML = '';   // labels re-seat once the motion settles
    function frame(t) {
      const k = Math.min(1, (t - start) / dur), e = 1 - Math.pow(1 - k, 3);
      nodes.forEach((n) => { n.x = n.px + (n.tx - n.px) * e; n.y = n.py + (n.ty - n.py) * e;
        nodeEls[n.id].g.style.transform = 'translate(' + n.x.toFixed(1) + 'px,' + n.y.toFixed(1) + 'px)'; });
      draw(true);
      if (k < 1) animT = requestAnimationFrame(frame); else { draw(false); refine(); }
    }
    animT = requestAnimationFrame(frame);
  }

  function neighborSet(id) { const s = {}; edges.forEach((e) => { if (e.a === id) s[e.b] = 1; if (e.b === id) s[e.a] = 1; }); return s; }

  // ── refine: the readability pass. Zoom-invariant sizes, short-edge glyph
  // culling, and greedy collision-culled labels placed by priority ──────────
  function refine() {
    const k = view.k, fs = (11 / k).toFixed(2), sw = (3 / k).toFixed(2), gsw = (3.4 / k).toFixed(2), minLen = 24;
    edgeEls.forEach((o) => { const a = byId[o.e.a], b = byId[o.e.b];
      const vis = (Math.hypot(b.x - a.x, b.y - a.y) * k > minLen) && state.tiers[a.tier] && state.tiers[b.tier];
      const inc = !state.sel || o.e.a === state.sel || o.e.b === state.sel;
      o.mt.style.display = (vis && inc) ? '' : 'none';
      o.mt.setAttribute('font-size', fs); o.mt.style.strokeWidth = gsw + 'px'; });
    gL.innerHTML = '';
    let cands = [];
    if (state.sel) {
      const nb = neighborSet(state.sel);
      cands = [byId[state.sel]].concat(Object.keys(nb).map((x) => byId[x]).filter((n) => state.tiers[n.tier]));
    } else if (state.names) {
      cands = nodes.filter((n) => state.tiers[n.tier])
        .sort((x, y) => (x.kind === 'doc' ? -1 : y.kind === 'doc' ? 1 : deg[y.id] - deg[x.id]));
    }
    // the hovered node's full name ALWAYS shows, whatever the names toggle says
    if (state.hover && !state.sel) {
      const hn = byId[state.hover];
      cands = [hn].concat(cands.filter((n) => n.id !== hn.id));
      nodeEls[hn.id].c.setAttribute('r', hn.kind === 'doc' ? 11 : 9);
    } else if (!state.sel) {
      nodes.forEach((n) => nodeEls[n.id].c.setAttribute('r', n.kind === 'doc' ? 9 : 7));
    }
    const placed = [];
    cands.forEach((n) => {
      const left = n.x > W * 0.62;
      const t = sv('text', { 'font-size': fs, 'text-anchor': left ? 'end' : 'start', class: 'tg-plabel' });
      t.style.strokeWidth = sw + 'px';
      t.setAttribute('x', (n.x + (left ? -11 : 11)).toFixed(1)); t.setAttribute('y', (n.y + 3.5).toFixed(1));
      t.textContent = n.label; gL.appendChild(t);
      const bb = t.getBBox(), box = { x: bb.x - 1, y: bb.y - 1, w: bb.width + 2, h: bb.height + 2 };
      const hit = placed.some((pp) => !(box.x + box.w < pp.x || pp.x + pp.w < box.x || box.y + box.h < pp.y || pp.y + pp.h < box.y));
      if (hit) gL.removeChild(t); else placed.push(box);
    });
  }

  function applyFilter() {
    nodes.forEach((n) => { const on = state.tiers[n.tier]; nodeEls[n.id].g.style.opacity = on ? 1 : 0.08; nodeEls[n.id].g.style.pointerEvents = on ? 'auto' : 'none'; });
    edgeEls.forEach((o) => { const vis = state.tiers[byId[o.e.a].tier] && state.tiers[byId[o.e.b].tier]; o.g.style.opacity = vis ? 1 : 0.06; });
    refine();
  }

  function select(id) {
    state.sel = id; state.hover = null;
    const nb = neighborSet(id);
    nodes.forEach((n) => { nodeEls[n.id].g.style.opacity = (n.id === id || nb[n.id]) ? 1 : 0.1;
      nodeEls[n.id].c.setAttribute('r', n.id === id ? 9 : (n.kind === 'doc' ? 9 : 7)); });
    edgeEls.forEach((o) => { const inc = o.e.a === id || o.e.b === id;
      o.g.style.opacity = inc ? 1 : 0.12;
      o.p.setAttribute('stroke-width', inc ? 2 : 1.1); o.p.setAttribute('stroke-opacity', inc ? 0.85 : 0.3); });
    refine();
    const n = byId[id], ins = edges.filter((e) => e.b === id), outs = edges.filter((e) => e.a === id);
    const glyphs = (arr) => arr.map((e) => e.gl).join(' ') || '—';
    countsEl.style.display = 'none';   // the inspector needs the full footer row
    detail.innerHTML = '<span style="width:16px;height:16px;flex:0 0 auto;border-radius:5px;background:' + TIER[n.tier].fill + ';display:inline-block;"></span>' +
      '<span style="color:var(--ink,#15181e);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:34%;">' + esc(n.label) + '</span>' +
      '<span style="color:var(--ink3,#999);">' + TIER[n.tier].name + '</span>' +
      '<span style="color:var(--ink2,#555);white-space:nowrap;">in <span style="font-size:14px;font-family:var(--mono,monospace);">' + esc(glyphs(ins)) + '</span></span>' +
      '<span style="color:var(--ink2,#555);white-space:nowrap;">out <span style="font-size:14px;font-family:var(--mono,monospace);">' + esc(glyphs(outs)) + '</span></span>';
    if (onOpen && (n.kind === 'ent' || n.kind === 'doc')) {
      const b = el('button', { class: 'tg-btn', text: 'open →' }); b.style.marginLeft = 'auto'; b.style.flex = '0 0 auto';
      b.addEventListener('click', () => onOpen(n)); detail.appendChild(b);
    }
  }
  function deselect() {
    state.sel = null;
    nodes.forEach((n) => nodeEls[n.id].c.setAttribute('r', n.kind === 'doc' ? 9 : 7));
    edgeEls.forEach((o) => { o.p.setAttribute('stroke-width', 1.1); o.p.setAttribute('stroke-opacity', 0.42); });
    applyFilter();
    detail.innerHTML = '<span style="color:var(--ink3,#999);">click a node to inspect · drag to pan · scroll to zoom</span>';
    countsEl.style.display = '';
  }

  // ── pan / zoom (labels re-refine after zoom so culling tracks scale) ─────
  const view = { x: 0, y: 0, k: 1 };
  let refineT = null;
  function apply() { vp.setAttribute('transform', 'translate(' + view.x.toFixed(1) + ',' + view.y.toFixed(1) + ') scale(' + view.k.toFixed(3) + ')'); }
  function schedule() { if (refineT) clearTimeout(refineT); refineT = setTimeout(refine, 110); }
  function fit() {
    const xs = nodes.map((n) => n.tx), ys = nodes.map((n) => n.ty);
    const a = Math.min.apply(0, xs) - 45, b = Math.max.apply(0, xs) + 45, c = Math.min.apply(0, ys) - 28, d = Math.max.apply(0, ys) + 28;
    const k = Math.min(W / (b - a), H / (d - c), 1.5); view.k = k; view.x = (W - (a + b) * k) / 2; view.y = (H - (c + d) * k) / 2; apply(); refine();
  }

  let drag = null;
  const onDown = (e) => { drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }; svg.style.cursor = 'grabbing'; svg.setPointerCapture(e.pointerId); };
  const onMove = (e) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    const r = svg.getBoundingClientRect(), sc = W / r.width; view.x = drag.vx + dx * sc; view.y = drag.vy + dy * sc; apply(); };
  const onUp = () => { if (drag && !drag.moved) deselect(); drag = null; svg.style.cursor = 'grab'; };
  const onWheel = (e) => { e.preventDefault(); const r = svg.getBoundingClientRect(), sc = W / r.width;
    const mx = (e.clientX - r.left) * sc, my = (e.clientY - r.top) * sc, f = e.deltaY < 0 ? 1.12 : 1 / 1.12, nk = Math.max(0.4, Math.min(3, view.k * f));
    view.x = mx - (mx - view.x) * (nk / view.k); view.y = my - (my - view.y) * (nk / view.k); view.k = nk; apply(); schedule(); };
  svg.addEventListener('pointerdown', onDown); svg.addEventListener('pointermove', onMove); svg.addEventListener('pointerup', onUp);
  svg.addEventListener('wheel', onWheel, { passive: false });

  // ── controls ─────────────────────────────────────────────────────────────
  wrap.querySelectorAll('[data-layout]').forEach((b) => b.addEventListener('click', () => {
    wrap.querySelectorAll('[data-layout]').forEach((x) => x.classList.remove('on')); b.classList.add('on');
    state.layout = b.dataset.layout;
    wrap.querySelector('[data-pivot-lbl]').textContent = state.layout === 'radial' ? 'rotate' : 'pivot';
    if (state.sel) deselect();
    relayout(); setTimeout(fit, 470);
  }));
  wrap.querySelector('[data-pivot]').addEventListener('click', () => {
    if (state.layout === 'radial') state.rot = (state.rot + 45) % 360; else state.orient = state.orient === 'h' ? 'v' : 'h';
    if (state.sel) deselect();
    relayout(); setTimeout(fit, 470);
  });
  const namesBtn = wrap.querySelector('[data-names]');
  namesBtn.addEventListener('click', () => { state.names = !state.names; namesBtn.classList.toggle('on', state.names); if (state.sel) deselect(); else refine(); });
  wrap.querySelectorAll('[data-tier]').forEach((ch) => ch.addEventListener('click', () => {
    const t = ch.dataset.tier; state.tiers[t] = !state.tiers[t]; ch.classList.toggle('off', !state.tiers[t]);
    if (state.sel) deselect(); else applyFilter();
  }));
  wrap.querySelector('[data-zin]').addEventListener('click', () => { view.k = Math.min(3, view.k * 1.2); apply(); schedule(); });
  wrap.querySelector('[data-zout]').addEventListener('click', () => { view.k = Math.max(0.4, view.k / 1.2); apply(); schedule(); });
  wrap.querySelector('[data-fit]').addEventListener('click', fit);

  layoutRadial(); nodes.forEach((n) => { n.x = n.tx; n.y = n.ty; nodeEls[n.id].g.style.transform = 'translate(' + n.x + 'px,' + n.y + 'px)'; });
  draw(false); applyFilter(); fit();

  return { destroy() { if (animT) cancelAnimationFrame(animT); if (refineT) clearTimeout(refineT); wrap.remove(); } };
}
