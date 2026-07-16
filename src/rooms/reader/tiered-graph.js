// EO: NUL(Network → Void, Clearing) — tiered graph SVG renderer
// mountTieredGraph — the pivotable tiered graph surface. Entities as nodes
// across the three helix tiers — existence (the source and the figures INSed
// from it), structure (the bonds between them), significance (the claims
// those bonds trace to) — connected by operator edges, each edge wearing its
// glyph ON the line. Four switchable layouts (flow · tiers · radial · time,
// radial default) with animated pivoting, tier filtering, a names toggle,
// pan/zoom/fit, and click-to-inspect.
//
// THE FOLD CURSOR (reason/cursor.js `upto`). A graph is readGraph(log, cursor);
// what you see is the fold at cursor = IDENTITY — upto:Infinity, the reading as
// it stood at the END. This surface exposes that `upto` as a scrubber: the cursor
// walks the fold's construction order (the order the reading folded nodes in —
// the source, then the figures INSed from it, then the claims traced over them),
// revealing nodes and the edges between them up to step k. It is LAYOUT-AGNOSTIC —
// the layout still decides WHERE a node sits; the cursor decides HOW MUCH of the
// fold is shown. An edge reveals only once BOTH its figures have — a bond can't be
// folded before the two things it binds. Slide (or ▶ play) to the end for the whole
// fold. This is distinct from the ⏱ time axis (record-time, a spatial reading);
// the cursor is process-time (construction order), and it rides every layout.
//
// READABILITY RULES (the point of this surface — it must never read as a
// hairball):
//   · operator glyphs sit bare on the line with a paper-coloured halo, and
//     HIDE on edges too short to carry them (screen-space test, re-run on
//     every zoom) — a glyph never smothers the edge it annotates;
//   · labels are collision-culled: candidates are placed by priority (the
//     source/document first, then degree) and any label whose box would overlap
//     an already-placed label OR sit on top of a node circle is dropped, not
//     drawn — the selected/hovered neighbourhood is exempt from the node test so
//     its names always read;
//   · label and glyph sizes are zoom-invariant (font-size 11/k) — zooming in
//     reveals more culled labels rather than inflating the ones you have;
//   · a de-overlap pass separates any two nodes closer than a minimum
//     distance, then clamps into the canvas;
//   · tiers/rings occupy only the tiers that hold nodes — an absent tier never
//     leaves a hollow lane — and are ordered by where their neighbours sit
//     (angular mean in radial, barycentre in flow); a single source/document
//     sits at the radial centre, the rest ringing out from it;
//   · names toggles persistent labels; the hovered node's full name always
//     shows, whatever the toggle says.
//
// The host builds the {nodes, edges} data honestly from the record
// (app.dc.js _tieredGraphData); this module only draws. Pure DOM + SVG, no
// dependencies; returns { destroy }.
//
//   nodes: [{ id, tier: 0|1|2, label, kind, ref }]
//   edges: [{ a, b, tier, gl, code }]   — a → b, gl = operator glyph
//   onOpen(node)    optional — "open →" in the inspector for kinds that navigate
//   onSelect(node)  optional — fires when a node is clicked/selected, so the host
//                   can mirror the selection (e.g. the overlay's details panel)

import { foldTime, TIME_GRAINS } from '../../surfer/fold/index.js';
import { spreadDefault, clampBox, applySpread, applyAttraction, hitNode } from './tiered-graph-forces.js';

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
.eo-tg .tg-fold{font-size:11px;padding:4px 8px;}
.eo-tg .tg-cur{font-size:11px;padding:4px 8px;}
.eo-tg input[type=range].tg-curslider{flex:1 1 140px;min-width:120px;accent-color:var(--ink,#15181e);cursor:pointer;height:4px;}
.eo-tg input[type=range].tg-forceslider{flex:0 1 96px;min-width:70px;accent-color:var(--ink,#15181e);cursor:pointer;height:4px;vertical-align:middle;}
.eo-tg .tg-pin{fill:none;stroke:var(--ink,#15181e);stroke-opacity:.55;stroke-width:1.2;stroke-dasharray:2 2;pointer-events:none;}
.eo-tg .tg-axisline{stroke:var(--line2,#e5e7eb);stroke-width:1;stroke-dasharray:2 3;}
.eo-tg .tg-axislabel{fill:var(--ink3,#999);font-size:10px;font-family:var(--mono,ui-monospace,Menlo,monospace);paint-order:stroke;stroke:var(--card,#fff);stroke-width:3px;stroke-linejoin:round;}
`;

const NS = 'http://www.w3.org/2000/svg';

export function mountTieredGraph(root, { nodes: inNodes = [], edges: inEdges = [], onOpen = null, onSelect = null, countsLabel = '' } = {}) {
  if (!document.getElementById(STYLE_ID)) {
    const st = document.createElement('style'); st.id = STYLE_ID; st.textContent = CSS; document.head.appendChild(st);
  }
  const el = (t, a = {}) => { const e = document.createElement(t); for (const k in a) { if (k === 'text') e.textContent = a[k]; else if (k === 'html') e.innerHTML = a[k]; else e.setAttribute(k, a[k]); } return e; };
  const sv = (t, a = {}) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // _seq is the node's place in the fold's construction order — the order the host folded
  // it in (source → figures → claims). The cursor's `upto` reads this off each node.
  const nodes = inNodes.map((n, i) => ({ ...n, x: 340, y: 220, px: 340, py: 220, tx: 340, ty: 220, rank: 0, _ang: 0, _seq: i }));
  const byId = {}; nodes.forEach((n) => byId[n.id] = n);
  // The record's root anchor — the source/document a reading folds out from. The honest data
  // builders emit it as kind 'source' (a single-entity web) or one per source (a topic web);
  // earlier callers used 'doc'. Recognise both so the anchor is centred in radial, drawn a touch
  // larger, and given first claim on a label — none of which fired while this read only 'doc'.
  const isRoot = (n) => n && (n.kind === 'source' || n.kind === 'doc');
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

  // names default ON — the first thing an import reveals must read as ITS OWN entities
  // ("Springfield", "Imani Okafor"), not anonymous circles awaiting a hover.
  // The time axis lays nodes out by their record-time (n.t), folded into bands at a
  // chosen grain (state.grain, default 'auto' — foldTime picks a grain from the span).
  // cursor.upto starts at the end (cursorMax) — IDENTITY, the whole fold. Scrubbing it back
  // reveals fewer construction steps; it never mutates the graph, only how much of it shows.
  const cursorMax = Math.max(0, nodes.length - 1);
  const W = 680, H = 440, state = { layout: 'radial', orient: 'h', rot: 0, tiers: { 0: true, 1: true, 2: true }, sel: null, names: true, hover: null, grain: 'auto', cursor: cursorMax, rho: spreadDefault(nodes.length), alpha: 0 };
  // The id of the node the radial layout parks at the centre (a single source root), or null when
  // no layout centres one. refine() reads it to seat that node's label ABOVE the dot and never cull
  // it — the anchor's name must read even though a ring node sits right beside it.
  let centreId = null;

  // A node is "revealed" once the fold cursor has reached its construction step. The cursor
  // gates visibility on EVERY layout, stacked with the tier filter — the layout decides where
  // a node sits, the cursor decides whether the fold has folded it in yet.
  const seqVisible = (n) => n._seq <= state.cursor;

  // ── shell ────────────────────────────────────────────────────────────────
  const wrap = el('div', { class: 'eo-tg', role: 'region', 'aria-label': 'Interactive record graph: nodes across three helix tiers, connected by operator edges' });
  wrap.innerHTML =
    '<div style="border:1px solid var(--line,#e5e7eb);border-radius:12px;overflow:hidden;background:var(--card,#fff);">' +
    '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;border-bottom:1px solid var(--line,#e5e7eb);background:var(--app,#f7f8fb);">' +
      '<div class="tg-seg">' +
        '<button class="tg-btn" data-layout="flow">⇢ flow</button>' +
        '<button class="tg-btn" data-layout="tiers">≡ tiers</button>' +
        '<button class="tg-btn on" data-layout="radial">◎ radial</button>' +
        '<button class="tg-btn" data-layout="time">⏱ time</button>' +
      '</div>' +
      '<button class="tg-btn" data-pivot>⟲ <span data-pivot-lbl>rotate</span></button>' +
      '<button class="tg-btn on" data-names title="Toggle persistent node names — hover always shows the full name">names</button>' +
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
    '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--line,#e5e7eb);flex-wrap:wrap;">' +
      '<span style="font-size:11px;color:var(--ink3,#999);letter-spacing:.04em;margin-right:2px;" title="Spread all nodes apart (repel) or pull bonded nodes together (gather). Drag a node to pin it.">forces</span>' +
      '<label style="font-size:11px;color:var(--ink2,#555);display:inline-flex;align-items:center;gap:5px;" title="Repel — spread every node apart">repel<input class="tg-forceslider" data-rho type="range" min="1" max="2.2" step="0.05" value="' + state.rho.toFixed(2) + '" aria-label="repel — node spread"></label>' +
      '<label style="font-size:11px;color:var(--ink2,#555);display:inline-flex;align-items:center;gap:5px;" title="Gather — pull bonded nodes together (radial &amp; flow)">gather<input class="tg-forceslider" data-alpha type="range" min="0" max="1" step="0.05" value="' + state.alpha.toFixed(2) + '" aria-label="gather — pull bonded nodes together"></label>' +
      '<button class="tg-btn tg-cur" data-freset title="Reset spread &amp; gather to the default">⟲ reset</button>' +
      '<button class="tg-btn tg-cur" data-pins hidden title="Release every pinned node">⟲ pins</button>' +
    '</div>' +
    '<div data-cursorrow style="display:none;align-items:center;gap:7px;padding:8px 12px;border-bottom:1px solid var(--line,#e5e7eb);flex-wrap:wrap;">' +
      '<span style="font-size:11px;color:var(--ink3,#999);letter-spacing:.04em;margin-right:2px;" title="Scrub the fold&#39;s construction — the graph as it stood at step k. Slide to the end for the whole fold.">cursor</span>' +
      '<button class="tg-btn tg-cur" data-curstep="-1" aria-label="step back" title="Step back">‹</button>' +
      '<button class="tg-btn tg-cur" data-curplay aria-label="play the fold" title="Play the fold&#39;s construction">▶</button>' +
      '<button class="tg-btn tg-cur" data-curstep="1" aria-label="step forward" title="Step forward">›</button>' +
      '<input class="tg-curslider" data-curslider type="range" min="0" max="' + cursorMax + '" value="' + cursorMax + '" step="1" aria-label="fold cursor position">' +
      '<button class="tg-btn tg-cur" data-curend title="Jump to the end — the whole fold (∞)">∞ end</button>' +
      '<span data-curnote style="font-size:11px;color:var(--ink3,#999);font-family:var(--mono,ui-monospace,monospace);flex:0 0 auto;"></span>' +
    '</div>' +
    '<div data-foldrow style="display:none;align-items:center;gap:5px;padding:8px 12px;border-bottom:1px solid var(--line,#e5e7eb);flex-wrap:wrap;">' +
      '<span style="font-size:11px;color:var(--ink3,#999);letter-spacing:.04em;margin-right:2px;" title="Fold the time axis to a coarser or finer grain">fold</span>' +
      TIME_GRAINS.map((g) => '<button class="tg-btn tg-fold" data-grain="' + g.id + '" title="' + g.label + '">' + g.label + '</button>').join('') +
      '<span data-foldnote style="font-size:11px;color:var(--ink3,#999);margin-left:auto;"></span>' +
    '</div>' +
    '<div style="position:relative;background:var(--card,#fff);background-image:radial-gradient(var(--line,#e5e7eb) 0.5px,transparent 0.5px);background-size:16px 16px;">' +
      '<svg data-svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block;touch-action:none;cursor:grab;">' +
        '<defs><marker data-marker markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L5,3 L0,6 Z" fill="#B4B2A9"/></marker></defs>' +
        '<g data-vp><g data-axis></g><g data-edges></g><g data-nodes></g><g data-labels></g></g>' +
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

  const svg = wrap.querySelector('[data-svg]'), gN = wrap.querySelector('[data-nodes]'), gE = wrap.querySelector('[data-edges]'), gL = wrap.querySelector('[data-labels]'), gA = wrap.querySelector('[data-axis]'), vp = wrap.querySelector('[data-vp]');
  const detail = wrap.querySelector('[data-detail]'), countsEl = wrap.querySelector('[data-counts]');
  const foldRow = wrap.querySelector('[data-foldrow]'), foldNote = wrap.querySelector('[data-foldnote]');
  const curRow = wrap.querySelector('[data-cursorrow]'), curSlider = wrap.querySelector('[data-curslider]'), curNote = wrap.querySelector('[data-curnote]'), curPlay = wrap.querySelector('[data-curplay]');
  const rhoSlider = wrap.querySelector('[data-rho]'), alphaSlider = wrap.querySelector('[data-alpha]'), pinsBtn = wrap.querySelector('[data-pins]');

  // ── layouts ──────────────────────────────────────────────────────────────
  // De-overlap: any two nodes closer than minD are pushed apart, then clamped
  // into the canvas — no layout is allowed to stack nodes.
  function separate(iters, minD, box) {
    const bx = box || { x0: 28, y0: 22, x1: W - 28, y1: H - 22 };
    for (let it = 0; it < iters; it++) {
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j]; let dx = b.tx - a.tx, dy = b.ty - a.ty;
        const d = Math.hypot(dx, dy) || 0.01;
        // a pinned node is an anchor — it shoves its neighbour but never yields itself
        if (d < minD) { const f = (minD - d) / 2 / d; dx *= f; dy *= f;
          if (!a.pinned) { a.tx -= dx; a.ty -= dy; } if (!b.pinned) { b.tx += dx; b.ty += dy; } }
      }
    }
    nodes.forEach((n) => { if (n.pinned) return; n.tx = Math.max(bx.x0, Math.min(bx.x1, n.tx)); n.ty = Math.max(bx.y0, Math.min(bx.y1, n.ty)); });
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
    // Bands run across the OCCUPIED tiers only — an absent tier reserves no lane, so two present
    // tiers sit as a close pair rather than straddling the empty gap a third would fill. Within a
    // band a tier's nodes take as many columns as the canvas holds at a legible spacing, wrapping
    // to extra rows only on overflow and centred on the band, so long labels stop crowding their
    // neighbour and the whole band stays a tidy strip.
    const horiz = state.orient === 'h';
    const groups = { 0: [], 1: [], 2: [] }; nodes.forEach((n) => groups[n.tier].push(n));
    const pos = {}; [0, 1, 2].forEach((t) => groups[t].forEach((n, i) => pos[n.id] = i));
    [1, 2].forEach((t) => { groups[t] = orderBy(groups[t], (id) => pos[id]); groups[t].forEach((n, i) => pos[n.id] = i); });
    const present = [0, 1, 2].filter((t) => groups[t].length);
    const P = present.length;
    // Bands sit a MODERATE, centred distance apart — enough to read three strips as three tiers,
    // but never flung to opposite edges (which, with two tiers, would strand the source a full
    // canvas above its figures). The gap is capped so a source-plus-figures web stays compact.
    const gapH = Math.min((H - 116) / Math.max(1, P - 1), 150), topH = H / 2 - gapH * (P - 1) / 2;
    const gapV = Math.min((W - 168) / Math.max(1, P - 1), 210), topV = W / 2 - gapV * (P - 1) / 2;
    present.forEach((t, bi) => {
      const arr = groups[t], n = arr.length;
      if (horiz) {
        const band = P < 2 ? H / 2 : topH + bi * gapH, span = W - 120;
        const cols = Math.max(1, Math.min(n, Math.floor(span / 120) + 1)), rows = Math.ceil(n / cols);
        arr.forEach((nd, k) => { const row = Math.floor(k / cols), rc = Math.min(cols, n - row * cols);
          nd.tx = rc < 2 ? W / 2 : 60 + ((k % cols) / (rc - 1)) * span;
          nd.ty = band + (row - (rows - 1) / 2) * 32; });
      } else {
        const band = P < 2 ? W / 2 : topV + bi * gapV, span = H - 104;
        const rows = Math.max(1, Math.min(n, Math.floor(span / 64) + 1)), cols = Math.ceil(n / rows);
        arr.forEach((nd, k) => { const col = Math.floor(k / rows), cc = Math.min(rows, n - col * rows);
          nd.ty = cc < 2 ? H / 2 : 52 + ((k % rows) / (cc - 1)) * span;
          nd.tx = band + (col - (cols - 1) / 2) * 46; });
      }
    });
  }
  function layoutRadial() {
    // The source is the root of the record — a single one sits at the centre and the rest
    // rings out from it; a topic web with many sources keeps them on the innermost ring
    // instead of picking one to crown. Rings are assigned by OCCUPIED tier, so an absent tier
    // (e.g. no standing claims) never leaves a hollow ring between two populated ones. Each
    // ring is ordered by the circular mean angle of its neighbours on the ring within (a bond
    // between its participants, a claim over its bond), with a small phase offset per ring so
    // spokes never align.
    const cx = W / 2, cy = H / 2;
    const roots = nodes.filter(isRoot);
    const centre = roots.length === 1 ? roots[0] : null;
    centreId = centre ? centre.id : null;
    const groups = { 0: [], 1: [], 2: [] };
    nodes.forEach((n) => { if (n === centre) { n.tx = cx; n.ty = cy; n._ang = 0; } else groups[n.tier].push(n); });
    const meanAng = (ids) => { let sx = 0, sy = 0, c = 0;
      ids.forEach((id) => { const m = byId[id]; if (m && m !== centre) { sx += Math.cos(m._ang); sy += Math.sin(m._ang); c++; } });
      return c ? Math.atan2(sy, sx) : null; };
    const ringTiers = [0, 1, 2].filter((t) => groups[t].length);
    ringTiers.forEach((t, ri) => {
      const arr = groups[t], n = arr.length, r = (centre ? 74 : 62) + ri * 84;
      if (ri > 0) {
        arr.forEach((nd) => { const a = meanAng(inN[nd.id]); nd._want = a == null ? 0 : a; });
        arr.sort((a, b) => (a._want - b._want));
      }
      arr.forEach((nd, k) => {
        const ang = state.rot * Math.PI / 180 + ri * 0.4 + (k / Math.max(1, n)) * Math.PI * 2;
        nd._ang = ang; nd.tx = cx + Math.cos(ang) * r; nd.ty = cy + Math.sin(ang) * r; });
    });
    separate(50, 28);
  }
  // The time axis: fold node record-times into bands, lay the bands out left→right
  // (oldest → newest). The fold grain (state.grain) is what "folds it in different ways" —
  // coarser folds more instants into one band, finer splits them apart. Nodes with no time
  // fall into a trailing "undated" band so the axis never pretends to know a time it wasn't given.
  const AX_L = 64, AX_R = W - 30, AX_TOP = 56, AX_BOT = H - 34;
  function layoutTime() {
    const fold = foldTime(nodes, state.grain, { timeOf: (n) => n.t });
    const B = fold.bands.length || 1;
    const axW = AX_R - AX_L, axH = AX_BOT - AX_TOP, midY = (AX_TOP + AX_BOT) / 2;
    fold.bands.forEach((band, bi) => {
      const cx = B < 2 ? (AX_L + AX_R) / 2 : AX_L + (bi + 0.5) / B * axW;
      const slotW = B < 2 ? axW : axW / B;
      const usableW = Math.max(30, slotW - 26);   // a gutter keeps adjacent bands' blocks apart
      const arr = band.items.slice().sort((a, b) => (a.tier - b.tier) || 0);
      const m = arr.length;
      // A band is a time BUCKET, not an instant, so its members share its slot — fill that slot as a
      // grid (columns across, then rows), centred on the band's time-x and the axis mid-line. A busy
      // band becomes a compact block AT ITS TIME instead of a one-pixel tower; and a lone "all" band
      // — every node in one bucket, so the axis carries no real time distinction — spreads across the
      // whole width rather than collapsing into a single unreadable column. Columns stay ≥92px so the
      // block never runs the de-overlap pass (which would drift a node off its own band).
      const cols = Math.max(1, Math.min(m, Math.floor(usableW / 92) + 1));
      const rows = Math.ceil(m / cols);
      const colGap = cols < 2 ? 0 : Math.min(usableW / (cols - 1), 130);
      const rowGap = rows < 2 ? 0 : Math.min(axH / (rows - 1), 46);
      arr.forEach((nd, k) => {
        const row = Math.floor(k / cols), col = k % cols, rc = Math.min(cols, m - row * cols);
        nd.tx = cx + (col - (rc - 1) / 2) * colGap;
        nd.ty = midY + (row - (rows - 1) / 2) * rowGap;
      });
    });
    drawAxis(fold.bands, fold);
  }
  function drawAxis(bands, fold) {
    gA.innerHTML = '';
    const B = bands.length; if (!B) return;
    for (let i = 1; i < B; i++) {
      const x = AX_L + (i / B) * (AX_R - AX_L);
      gA.appendChild(sv('line', { class: 'tg-axisline', x1: x.toFixed(1), y1: (AX_TOP - 14).toFixed(1), x2: x.toFixed(1), y2: (AX_BOT + 8).toFixed(1) }));
    }
    bands.forEach((band, bi) => {
      const x = B < 2 ? (AX_L + AX_R) / 2 : AX_L + (bi + 0.5) / B * (AX_R - AX_L);
      const t = sv('text', { class: 'tg-axislabel', x: x.toFixed(1), y: (AX_TOP - 20).toFixed(1), 'text-anchor': 'middle' });
      t.textContent = band.label;
      gA.appendChild(t);
    });
    if (foldNote) foldNote.textContent = fold
      ? `${fold.grain}${fold.requested === 'auto' ? ' (auto)' : ''} · ${B} band${B === 1 ? '' : 's'}${fold.undated ? ` · ${fold.undated} undated` : ''}`
      : '';
  }
  // The forces layer: relax the deterministic seed under the two global knobs. Spread
  // pushes everything apart (every layout); gather pulls bonded nodes together along the
  // layout's free axis (radial + flow only). Pinned nodes are then snapped back to where
  // the user parked them, and a final ρ-aware de-overlap re-spreads any pile-up. Runs at
  // layout time ONLY — never per cursor step — so scrubbing the fold leaves positions static.
  function forces() {
    const geom = { W, H, cx: W / 2, cy: H / 2, midY: (AX_TOP + AX_BOT) / 2, AX_TOP, AX_BOT, orient: state.orient, centreId };
    applySpread(nodes, state.layout, state.rho, geom);
    applyAttraction(nodes, state.layout, state.alpha, { edges, byId, geom });
    nodes.forEach((n) => { if (n.pinned) { n.tx = n.pinX; n.ty = n.pinY; } });
    if (state.layout === 'flow' || state.layout === 'radial') separate(24, 28 * state.rho, clampBox(state.rho, geom));
  }
  function relayout() {
    if (state.layout !== 'time') gA.innerHTML = '';
    centreId = null;   // only radial re-arms it; every other layout seats the root at an edge
    if (state.layout === 'flow') layoutFlow();
    else if (state.layout === 'tiers') layoutTiers();
    else if (state.layout === 'time') layoutTime();
    else layoutRadial();
    forces();
    animate();
  }

  // ── marks: each edge is a group of path + bare glyph with a paper halo ───
  const nodeEls = {}, edgeEls = [];
  nodes.forEach((n) => {
    const g = sv('g', { class: 'tg-node' }); g.style.transform = 'translate(' + n.x + 'px,' + n.y + 'px)';
    const pin = sv('circle', { r: (isRoot(n) ? 9 : 7) + 4, class: 'tg-pin' }); pin.style.display = 'none';
    const c = sv('circle', { r: isRoot(n) ? 9 : 7, fill: TIER[n.tier].fill, stroke: TIER[n.tier].stroke, 'stroke-width': 1.2 });
    g.appendChild(pin); g.appendChild(c);
    // a drag that lands on a node also fires the circle's click — swallow that one so a pull-to-pin
    // never doubles as a select (which would flip the host's details panel).
    g.addEventListener('click', (ev) => { ev.stopPropagation(); if (justDragged) { justDragged = false; return; } select(n.id); });
    g.addEventListener('mouseenter', () => { if (!state.sel) { state.hover = n.id; refine(); } });
    g.addEventListener('mouseleave', () => { if (!state.sel) { state.hover = null; refine(); } });
    gN.appendChild(g); nodeEls[n.id] = { g, c, pin };
  });
  edges.forEach((e) => {
    const g = sv('g', {});
    const p = sv('path', { fill: 'none', stroke: TIER[e.tier].edge, 'stroke-width': 1.1, 'stroke-opacity': 0.42, 'marker-end': 'url(#' + mk + ')' });
    const mt = sv('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 11, fill: TIER[e.tier].stroke, class: 'tg-eglyph' });
    mt.textContent = e.gl || '·';
    g.appendChild(p); g.appendChild(mt); gE.appendChild(g);
    // An edge's construction step is when its LATER figure arrives — a bond can't fold before
    // both things it binds are in the graph. The cursor reveals it only at/after that step.
    edgeEls.push({ g, p, mt, e, seq: Math.max(byId[e.a]._seq, byId[e.b]._seq) });
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
      const vis = (Math.hypot(b.x - a.x, b.y - a.y) * k > minLen) && state.tiers[a.tier] && state.tiers[b.tier] && o.seq <= state.cursor;
      const inc = !state.sel || o.e.a === state.sel || o.e.b === state.sel;
      o.mt.style.display = (vis && inc) ? '' : 'none';
      o.mt.setAttribute('font-size', fs); o.mt.style.strokeWidth = gsw + 'px'; });
    gL.innerHTML = '';
    let cands = [];
    const privileged = new Set();   // labels the local focus wants read even where they graze a node
    if (state.sel) {
      const nb = neighborSet(state.sel);
      privileged.add(state.sel); Object.keys(nb).forEach((x) => privileged.add(x));
      cands = [byId[state.sel]].concat(Object.keys(nb).map((x) => byId[x]).filter((n) => state.tiers[n.tier] && seqVisible(n)));
    } else if (state.names) {
      cands = nodes.filter((n) => state.tiers[n.tier] && seqVisible(n))
        .sort((x, y) => (isRoot(x) ? -1 : isRoot(y) ? 1 : deg[y.id] - deg[x.id]));
    }
    // the hovered node's full name ALWAYS shows, whatever the names toggle says — and so do the
    // names of the entities it connects to, so a hover reveals the whole local neighbourhood
    // rather than only the single node under the cursor. The neighbours lead the label priority,
    // so they place before unrelated culled labels.
    if (state.hover && !state.sel) {
      const hn = byId[state.hover];
      const nb = neighborSet(hn.id);
      const neigh = Object.keys(nb).map((x) => byId[x]).filter((n) => n && state.tiers[n.tier] && seqVisible(n));
      privileged.add(hn.id); neigh.forEach((n) => privileged.add(n.id));
      cands = [hn, ...neigh].concat(cands.filter((n) => n.id !== hn.id && !nb[n.id]));
      nodeEls[hn.id].c.setAttribute('r', isRoot(hn) ? 11 : 9);
    } else if (!state.sel) {
      nodes.forEach((n) => nodeEls[n.id].c.setAttribute('r', isRoot(n) ? 9 : 7));
    }
    // The occupied boxes seed with every visible node circle, so an ambient label is culled when it
    // would sit ON a node (its own excepted) — not only when it collides with another label. This is
    // what stops a long name ("David Scott") smothering the next node along. The boxes are world-space,
    // so zooming in shrinks them and the culled labels return. The selected/hovered neighbourhood is
    // privileged: those names must read, so they skip the node test (they still avoid each other).
    const rectHit = (a, b) => !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
    const nodeBoxes = nodes.filter((n) => state.tiers[n.tier] && seqVisible(n)).map((n) => {
      const rr = (isRoot(n) ? 9 : 7) + 2;
      return { id: n.id, x: n.x - rr, y: n.y - rr, w: rr * 2, h: rr * 2 };
    });
    const placed = [];
    cands.forEach((n) => {
      // The centred root reads best ABOVE its dot (a ring node always sits to its side); every other
      // node keeps the side placement, flipping to the left once it crosses into the right margin.
      const centred = n.id === centreId, left = !centred && n.x > W * 0.62;
      const t = sv('text', { 'font-size': fs, 'text-anchor': centred ? 'middle' : (left ? 'end' : 'start'), class: 'tg-plabel' });
      t.style.strokeWidth = sw + 'px';
      t.setAttribute('x', (centred ? n.x : n.x + (left ? -11 : 11)).toFixed(1));
      t.setAttribute('y', (centred ? n.y - 13 : n.y + 3.5).toFixed(1));
      t.textContent = n.label; gL.appendChild(t);
      const bb = t.getBBox(), box = { x: bb.x - 1, y: bb.y - 1, w: bb.width + 2, h: bb.height + 2 };
      const priv = centred || privileged.has(n.id);   // the anchor and the local focus must read
      const hitLabel = placed.some((pp) => rectHit(box, pp));
      const hitNode = !priv && nodeBoxes.some((nb) => nb.id !== n.id && rectHit(box, nb));
      if (hitLabel || hitNode) gL.removeChild(t); else placed.push(box);
    });
  }

  function applyFilter() {
    nodes.forEach((n) => {
      const past = seqVisible(n), on = past && state.tiers[n.tier];
      // not-yet-folded nodes fade back further (0.05) than tier-filtered ones (0.08), so the
      // eye reads "the fold hasn't reached this" apart from "you turned this tier off".
      nodeEls[n.id].g.style.opacity = on ? 1 : (past ? 0.08 : 0.05);
      nodeEls[n.id].g.style.pointerEvents = on ? 'auto' : 'none';
    });
    edgeEls.forEach((o) => {
      const past = o.seq <= state.cursor, vis = past && state.tiers[byId[o.e.a].tier] && state.tiers[byId[o.e.b].tier];
      o.g.style.opacity = vis ? 1 : (past ? 0.06 : 0.03);
    });
    refine();
  }

  function select(id) {
    state.sel = id; state.hover = null;
    const nb = neighborSet(id);
    nodes.forEach((n) => { const past = seqVisible(n); nodeEls[n.id].g.style.opacity = !past ? 0.05 : (n.id === id || nb[n.id]) ? 1 : 0.1;
      nodeEls[n.id].c.setAttribute('r', n.id === id ? 9 : (isRoot(n) ? 9 : 7)); });
    edgeEls.forEach((o) => { const inc = (o.e.a === id || o.e.b === id) && o.seq <= state.cursor;
      o.g.style.opacity = inc ? 1 : (o.seq <= state.cursor ? 0.12 : 0.03);
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
    // "open →" navigates via the node's ref, so it belongs to exactly the nodes that carry one —
    // the entities (a source/claim has none). Gating on ref, not a kind string, keeps the button
    // honest: it appears iff onOpen has somewhere to go. (The old 'ent'/'doc' test matched neither
    // the 'entity' the builder emits nor a real ref, so the button never showed.)
    if (onOpen && n.ref) {
      const b = el('button', { class: 'tg-btn', text: 'open →' }); b.style.marginLeft = 'auto'; b.style.flex = '0 0 auto';
      b.addEventListener('click', () => onOpen(n)); detail.appendChild(b);
    }
    if (onSelect) { try { onSelect(n); } catch { /* the host's mirror must never break the select */ } }
  }
  function deselect() {
    state.sel = null;
    nodes.forEach((n) => nodeEls[n.id].c.setAttribute('r', isRoot(n) ? 9 : 7));
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

  let drag = null, justDragged = false;
  // pointer → world (vp-content) coords: undo the viewBox scale, then the pan/zoom transform
  const worldOf = (e) => { const r = svg.getBoundingClientRect(), sc = W / r.width;
    return { wx: ((e.clientX - r.left) * sc - view.x) / view.k, wy: ((e.clientY - r.top) * sc - view.y) / view.k }; };
  const onDown = (e) => {
    const { wx, wy } = worldOf(e);
    // a pointerdown ON a node grabs THAT node (drag-to-pin); on empty canvas it pans
    const node = hitNode(nodes, wx, wy, isRoot, 6, (n) => state.tiers[n.tier] && seqVisible(n));
    drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false, node };
    svg.style.cursor = 'grabbing'; svg.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    if (drag.node && drag.moved) {   // node-drag: pin it under the pointer, never pan
      const { wx, wy } = worldOf(e), bx = clampBox(state.rho, { W, H, cx: W / 2, cy: H / 2 });
      const n = drag.node; n.tx = n.x = Math.max(bx.x0, Math.min(bx.x1, wx)); n.ty = n.y = Math.max(bx.y0, Math.min(bx.y1, wy));
      n.pinned = true; n.pinX = n.tx; n.pinY = n.ty;
      nodeEls[n.id].g.style.transform = 'translate(' + n.x.toFixed(1) + 'px,' + n.y.toFixed(1) + 'px)';
      nodeEls[n.id].pin.style.display = ''; pinsBtn.hidden = false; draw(true); return;
    }
    const r = svg.getBoundingClientRect(), sc = W / r.width; view.x = drag.vx + dx * sc; view.y = drag.vy + dy * sc; apply(); };
  const onUp = () => {
    if (drag && drag.node && drag.moved) { justDragged = true; draw(false); refine(); }
    else if (drag && !drag.moved) deselect();
    drag = null; svg.style.cursor = 'grab';
  };
  const onWheel = (e) => { e.preventDefault(); const r = svg.getBoundingClientRect(), sc = W / r.width;
    const mx = (e.clientX - r.left) * sc, my = (e.clientY - r.top) * sc, f = e.deltaY < 0 ? 1.12 : 1 / 1.12, nk = Math.max(0.4, Math.min(3, view.k * f));
    view.x = mx - (mx - view.x) * (nk / view.k); view.y = my - (my - view.y) * (nk / view.k); view.k = nk; apply(); schedule(); };
  svg.addEventListener('pointerdown', onDown); svg.addEventListener('pointermove', onMove); svg.addEventListener('pointerup', onUp);
  svg.addEventListener('wheel', onWheel, { passive: false });

  // ── controls ─────────────────────────────────────────────────────────────
  const pivotBtn = wrap.querySelector('[data-pivot]');
  const syncFoldChips = () => wrap.querySelectorAll('[data-grain]').forEach((c) => c.classList.toggle('on', c.dataset.grain === state.grain));
  const syncLayoutChrome = () => {
    const isTime = state.layout === 'time';
    foldRow.style.display = isTime ? 'flex' : 'none';   // the fold controls only bite on the time axis
    pivotBtn.style.display = isTime ? 'none' : 'inline-flex';  // no pivot on a left→right time axis
  };
  wrap.querySelectorAll('[data-layout]').forEach((b) => b.addEventListener('click', () => {
    wrap.querySelectorAll('[data-layout]').forEach((x) => x.classList.remove('on')); b.classList.add('on');
    state.layout = b.dataset.layout;
    wrap.querySelector('[data-pivot-lbl]').textContent = state.layout === 'radial' ? 'rotate' : 'pivot';
    syncLayoutChrome();
    clearPins();   // a pin fixed to a ring position is meaningless once the layout changes
    if (state.sel) deselect();
    relayout(); setTimeout(fit, 470);
  }));
  wrap.querySelectorAll('[data-grain]').forEach((c) => c.addEventListener('click', () => {
    state.grain = c.dataset.grain; syncFoldChips();
    if (state.layout !== 'time') return;   // a fold pick outside the time axis just arms the grain
    if (state.sel) deselect();
    relayout(); setTimeout(fit, 470);
  }));
  syncFoldChips();
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

  // ── forces: repel (ρ) / gather (α) sliders, reset, release-pins ────────────
  // A drag on a slider fires 'input' every few pixels; collapse the flood to one relayout
  // per frame (each animate() cancels the last, so the graph smoothly follows the knob).
  let forceRaf = null;
  const forceRelayout = () => { if (forceRaf) return; forceRaf = requestAnimationFrame(() => { forceRaf = null; relayout(); setTimeout(fit, 470); }); };
  const clearPins = () => { nodes.forEach((n) => { n.pinned = false; nodeEls[n.id].pin.style.display = 'none'; }); pinsBtn.hidden = true; };
  rhoSlider.addEventListener('input', () => { state.rho = +rhoSlider.value; if (state.sel) deselect(); forceRelayout(); });
  alphaSlider.addEventListener('input', () => { state.alpha = +alphaSlider.value; if (state.sel) deselect(); forceRelayout(); });
  wrap.querySelector('[data-freset]').addEventListener('click', () => {
    state.rho = spreadDefault(nodes.length); state.alpha = 0;
    rhoSlider.value = state.rho.toFixed(2); alphaSlider.value = '0';
    if (state.sel) deselect(); relayout(); setTimeout(fit, 470);
  });
  pinsBtn.addEventListener('click', () => { clearPins(); if (state.sel) deselect(); relayout(); setTimeout(fit, 470); });

  // ── the fold cursor: scrub `upto` over construction order, on any layout ───
  // Positions never move as the cursor scrubs (the layout is computed for the whole fold);
  // only how much of it is revealed changes, so the graph builds up in place rather than
  // reflowing. Playing walks step→step to the end.
  let playT = null;
  function stopPlay() { if (playT) { clearTimeout(playT); playT = null; } curPlay.textContent = '▶'; curPlay.classList.remove('on'); }
  function curNoteText() {
    if (state.cursor >= cursorMax) return 'fold · ' + (cursorMax + 1) + ' node' + (cursorMax === 0 ? '' : 's');
    const cur = nodes[state.cursor];
    return 'step ' + (state.cursor + 1) + '/' + (cursorMax + 1) + (cur ? ' · ' + cur.label : '');
  }
  function setCursor(k, fromSlider) {
    state.cursor = Math.max(0, Math.min(cursorMax, k | 0));
    if (!fromSlider) curSlider.value = state.cursor;
    curNote.textContent = curNoteText();
    applyFilter();
  }
  curPlay.addEventListener('click', () => {
    if (playT) { stopPlay(); return; }
    if (state.sel) deselect();
    if (state.cursor >= cursorMax) setCursor(0);   // replay from the start
    curPlay.textContent = '❚❚'; curPlay.classList.add('on');
    const tick = () => { if (state.cursor >= cursorMax) { stopPlay(); return; } setCursor(state.cursor + 1); playT = setTimeout(tick, 460); };
    playT = setTimeout(tick, 260);
  });
  curSlider.addEventListener('input', () => { stopPlay(); if (state.sel) deselect(); setCursor(+curSlider.value, true); });
  wrap.querySelectorAll('[data-curstep]').forEach((b) => b.addEventListener('click', () => { stopPlay(); if (state.sel) deselect(); setCursor(state.cursor + (+b.dataset.curstep)); }));
  wrap.querySelector('[data-curend]').addEventListener('click', () => { stopPlay(); if (state.sel) deselect(); setCursor(cursorMax); });
  // the cursor only earns its row when there are enough steps to walk
  if (cursorMax >= 2) { curRow.style.display = 'flex'; curNote.textContent = curNoteText(); }

  layoutRadial(); forces(); nodes.forEach((n) => { n.x = n.tx; n.y = n.ty; nodeEls[n.id].g.style.transform = 'translate(' + n.x + 'px,' + n.y + 'px)'; });
  draw(false); applyFilter(); fit();

  return { destroy() { if (animT) cancelAnimationFrame(animT); if (refineT) clearTimeout(refineT); if (forceRaf) cancelAnimationFrame(forceRaf); stopPlay(); wrap.remove(); } };
}
