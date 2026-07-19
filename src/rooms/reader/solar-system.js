// EO: GEO(Gravity → Existence Orbit) — the EOGraph solar surface.
// mountSolarSystem — an EGOCENTRIC, POV-pivoting view of the record. Where the
// tiered DAG (tiered-graph.js) flattens the whole neighbourhood onto one radial
// plane, this centres ONE entity — its point of view — and reads the three helix
// tiers as three physical regimes ringing out from it:
//
//   · existence (tier 0, ∅○●) — the QUANTUM COLLAPSE: the source(s) the entity
//     precipitated out of. Something from nothing; the sun ignites. Innermost.
//   · structure (tier 1, ｜⋈△) — the CHEMISTRY: the entities it bonds to, held
//     by valence bonds. The molecular middle ring.
//   · meaning   (tier 2, ⊢⊨⊛) — the PHYSICS of ORBITAL ATTRACTION: the claims and
//     significance that hold about it, orbiting under the gravity of meaning. Outer.
//
// Click any body and the POV PIVOTS — that entity eases to the centre, re-collapses
// from its own sources, re-bonds, and its meaning re-orbits (the host reseeds the
// data via onPivot). Three regime toggles peel to a single "level of what's
// happening". The motion is one CALM rigid drift — the whole system turns slowly as
// a rigid body, so radial bonds never shear; a play/pause parks it.
//
// Same {nodes, edges} vocabulary as mountTieredGraph, so the host feeds it the SAME
// honest tiered data (app.dc.js tieredData). Pure DOM + SVG, no deps; returns { destroy }.
//
//   nodes: [{ id, tier: 0|1|2, label, kind, ref }]   — kind 'entity' bodies can be pivoted to
//   edges: [{ a, b, tier, gl, code }]                — gl = operator glyph on the bond
//   centreId  optional — the id to seat at the centre (else the most-bonded entity)
//   onPivot(node)   fires when an entity body is clicked — the host reseeds centred on it
//   onSelect(node)  fires on any selection — the host mirrors it into the details panel
//   onOpen(node)    optional — "open →" for a body that carries a ref

const NS = 'http://www.w3.org/2000/svg';

// The three regimes, keyed by tier. Palette is shared with tiered-graph.js's TIER so the
// two surfaces read as one system; `phys` names the regime, `blurb` explains the metaphor.
const REGIME = {
  0: { name: 'existence', phys: 'quantum',   fill: '#7F77DD', stroke: '#534AB7', chipBg: '#EEEDFE', chipFg: '#3C3489', glyphs: '∅○●', blurb: 'the source it collapsed out of' },
  1: { name: 'structure', phys: 'chemistry', fill: '#1D9E75', stroke: '#0F6E56', chipBg: '#E1F5EE', chipFg: '#085041', glyphs: '｜⋈△', blurb: 'what it bonds to' },
  2: { name: 'meaning',   phys: 'orbital',   fill: '#EF9F27', stroke: '#BA7517', chipBg: '#FAEEDA', chipFg: '#633806', glyphs: '⊢⊨⊛', blurb: 'the meaning orbiting it' },
};
const BAND = { 0: 104, 1: 178, 2: 250 };   // regime ring radii, inner → outer

const STYLE_ID = 'eo-ss-style';
const CSS = `
.eo-ss{font-family:var(--sans,system-ui,sans-serif);color:var(--ink,#15181e);}
.eo-ss .ss-btn{font-size:12px;padding:5px 10px;border:1px solid var(--line2,#e5e7eb);border-radius:7px;background:var(--card,#fff);color:var(--ink2,#555);cursor:pointer;display:inline-flex;align-items:center;gap:5px;line-height:1.2;}
.eo-ss .ss-btn:hover{background:var(--app,#f4f5f7);}
.eo-ss .ss-chip{font-size:11px;padding:4px 9px;border-radius:7px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;border:1px solid transparent;user-select:none;}
.eo-ss .ss-chip .gl{font-size:13px;letter-spacing:2px;font-family:var(--mono,ui-monospace,Menlo,monospace);}
.eo-ss .ss-chip.off{opacity:.35;}
.eo-ss .ss-node{cursor:pointer;}
.eo-ss .ss-node circle{transition:r .15s;}
.eo-ss .ss-orbit{fill:none;stroke-dasharray:2 5;stroke-width:1;opacity:.5;}
.eo-ss .ss-plabel{paint-order:stroke;stroke:var(--card,#fff);stroke-width:3px;stroke-linejoin:round;fill:var(--ink,#15181e);pointer-events:none;}
.eo-ss .ss-eglyph{paint-order:stroke;stroke:var(--card,#fff);stroke-width:3px;stroke-linejoin:round;pointer-events:none;font-family:var(--mono,ui-monospace,Menlo,monospace);}
.eo-ss .ss-reglabel{font-size:9px;letter-spacing:.08em;font-family:var(--mono,ui-monospace,monospace);pointer-events:none;text-transform:uppercase;}
`;

export function mountSolarSystem(root, { nodes: inNodes = [], edges: inEdges = [], centreId = null, onPivot = null, onSelect = null, onOpen = null, countsLabel = '' } = {}) {
  if (!document.getElementById(STYLE_ID)) {
    const st = document.createElement('style'); st.id = STYLE_ID; st.textContent = CSS; document.head.appendChild(st);
  }
  const el = (t, a = {}) => { const e = document.createElement(t); for (const k in a) { if (k === 'text') e.textContent = a[k]; else if (k === 'html') e.innerHTML = a[k]; else e.setAttribute(k, a[k]); } return e; };
  const sv = (t, a = {}) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const nodes = inNodes.map((n) => ({ ...n }));
  const byId = {}; nodes.forEach((n) => byId[n.id] = n);
  const edges = inEdges.filter((e) => byId[e.a] && byId[e.b]);
  const deg = {}; nodes.forEach((n) => deg[n.id] = 0);
  edges.forEach((e) => { deg[e.a]++; deg[e.b]++; });

  // The sun is the POV: the requested centre if it is a real entity, else the most-bonded
  // entity (the natural focus of an egocentric web), else the first node standing.
  const ents = nodes.filter((n) => n.kind === 'entity');
  let sun = (centreId && byId[centreId]) || ents.slice().sort((a, b) => deg[b.id] - deg[a.id])[0] || nodes[0] || null;
  if (!sun) { root.appendChild(el('div', { html: '<div style="padding:22px;color:#8A8A95;font-size:13px">Nothing to place in orbit yet.</div>' })); return { destroy() {} }; }

  // Each non-sun body's regime is its tier (0 source · 1 bonded entity · 2 claim) — the same
  // three levels the tier chips name, now read as quantum · chemistry · orbital. Bodies are
  // seeded evenly around their band; the drift then turns the whole system as one rigid body.
  const W = 680, H = 460, cx = W / 2, cy = H / 2;
  const bodies = nodes.filter((n) => n !== sun).map((n) => ({ n, tier: n.tier, band: BAND[n.tier] || BAND[1], ang: 0, r: massOf(n) }));
  const byBand = { 0: [], 1: [], 2: [] };
  bodies.forEach((b) => byBand[b.tier].push(b));
  [0, 1, 2].forEach((t) => { const arr = byBand[t], m = arr.length; arr.forEach((b, i) => { b.ang = (i / Math.max(1, m)) * Math.PI * 2 + t * 0.5; }); });
  function massOf(n) { return n === sun ? 13 : n.kind === 'entity' ? Math.min(11, 6 + (deg[n.id] || 0) * 0.7) : n.kind === 'source' ? 6 : 5; }

  const state = { spin: 0, playing: true, regimes: { 0: true, 1: true, 2: true }, sel: null, hover: null };
  const view = { x: 0, y: 0, k: 1 };

  // ── shell ──────────────────────────────────────────────────────────────────
  const wrap = el('div', { class: 'eo-ss', role: 'region', 'aria-label': 'Solar view: an entity at the centre, its existence, structure and meaning ringing out as three regimes' });
  wrap.innerHTML =
    '<div style="border:1px solid var(--line,#e5e7eb);border-radius:12px;overflow:hidden;background:var(--card,#fff);">' +
    '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;border-bottom:1px solid var(--line,#e5e7eb);background:var(--app,#f7f8fb);">' +
      '<span class="ss-btn" style="cursor:default;color:var(--ink2,#555);">☉ EOGraph</span>' +
      '<button class="ss-btn" data-play title="Pause or resume the drift">❚❚ <span data-playlbl>drift</span></button>' +
      '<div style="display:flex;gap:5px;margin-left:auto;">' +
        '<button class="ss-btn" data-zin aria-label="zoom in">+</button>' +
        '<button class="ss-btn" data-zout aria-label="zoom out">−</button>' +
        '<button class="ss-btn" data-fit>⌖ fit</button>' +
      '</div>' +
    '</div>' +
    '<div style="display:flex;align-items:center;gap:7px;padding:8px 12px;border-bottom:1px solid var(--line,#e5e7eb);flex-wrap:wrap;">' +
      '<span style="font-size:11px;color:var(--ink3,#999);letter-spacing:.04em;margin-right:2px;" title="Peel the view to a single regime — one level of what is happening">regimes</span>' +
      [0, 1, 2].map((t) => '<span class="ss-chip" data-reg="' + t + '" title="' + REGIME[t].phys + ' — ' + REGIME[t].blurb + '" style="background:' + REGIME[t].chipBg + ';color:' + REGIME[t].chipFg + ';"><span class="gl">' + REGIME[t].glyphs + '</span>' + REGIME[t].name + ' · ' + REGIME[t].phys + '</span>').join('') +
    '</div>' +
    '<div style="position:relative;background:var(--card,#fff);background-image:radial-gradient(var(--line,#e5e7eb) 0.5px,transparent 0.5px);background-size:16px 16px;">' +
      '<svg data-svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block;touch-action:none;cursor:grab;">' +
        '<defs>' +
          '<radialGradient data-well cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#7F77DD" stop-opacity="0.10"/><stop offset="55%" stop-color="#7F77DD" stop-opacity="0.03"/><stop offset="100%" stop-color="#7F77DD" stop-opacity="0"/></radialGradient>' +
          '<marker data-marker markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L5,3 L0,6 Z" fill="#B4B2A9"/></marker>' +
        '</defs>' +
        '<g data-vp><rect data-wellrect x="0" y="0" width="' + W + '" height="' + H + '" fill="url(#ss-well)"/><g data-orbits></g><g data-edges></g><g data-nodes></g><g data-labels></g></g>' +
      '</svg>' +
    '</div>' +
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:9px;padding:9px 13px;border-top:1px solid var(--line,#e5e7eb);background:var(--app,#f7f8fb);font-size:12px;color:var(--ink2,#555);min-height:20px;">' +
      '<div data-detail style="display:flex;align-items:center;gap:9px;min-width:0;flex:1;flex-wrap:wrap;"><span style="color:var(--ink3,#999);">click a body to pivot its POV · drag to pan · scroll to zoom</span></div>' +
      '<span data-counts style="font-family:var(--mono,ui-monospace,monospace);color:var(--ink3,#999);flex:0 0 auto;">' + esc(countsLabel) + '</span>' +
    '</div>' +
    '</div>';
  root.appendChild(wrap);

  // unique per mount so defs never collide across two EOGraph mounts on one page
  const uid = 'ss-' + Math.floor(Math.random() * 1e9);
  const wellGrad = wrap.querySelector('[data-well]'); wellGrad.setAttribute('id', uid + '-well');
  wrap.querySelector('[data-wellrect]').setAttribute('fill', 'url(#' + uid + '-well)');
  const mk = uid + '-mk'; wrap.querySelector('[data-marker]').setAttribute('id', mk);

  const svg = wrap.querySelector('[data-svg]'), gN = wrap.querySelector('[data-nodes]'), gE = wrap.querySelector('[data-edges]'), gL = wrap.querySelector('[data-labels]'), gO = wrap.querySelector('[data-orbits]'), vp = wrap.querySelector('[data-vp]');
  const detail = wrap.querySelector('[data-detail]'), countsEl = wrap.querySelector('[data-counts]');
  const playBtn = wrap.querySelector('[data-play]'), playLbl = wrap.querySelector('[data-playlbl]');

  // ── static marks: orbit rings + regime labels ───────────────────────────────
  [0, 1, 2].forEach((t) => {
    if (!byBand[t].length) return;
    gO.appendChild(sv('circle', { class: 'ss-orbit ss-orbit-' + t, cx, cy, r: BAND[t], stroke: REGIME[t].fill }));
    const rl = sv('text', { class: 'ss-reglabel ss-reglabel-' + t, x: cx, y: cy - BAND[t] - 6, 'text-anchor': 'middle', fill: REGIME[t].stroke, opacity: 0.7 });
    rl.textContent = REGIME[t].phys; gO.appendChild(rl);
  });

  // ── nodes: the sun + its orbiting bodies ────────────────────────────────────
  const sunEl = sv('g', { class: 'ss-node ss-sun' });
  sunEl.appendChild(sv('circle', { r: 20, fill: REGIME[sun.tier] ? REGIME[sun.tier].fill : '#7F77DD', opacity: 0.16 }));   // corona
  const sunC = sv('circle', { r: 13, fill: '#FBF3E6', stroke: REGIME[1].stroke, 'stroke-width': 2 });
  sunEl.appendChild(sunC);
  sunEl.addEventListener('click', (ev) => { ev.stopPropagation(); if (justDragged) { justDragged = false; return; } select(sun); });
  gN.appendChild(sunEl);

  const nodeEls = {};
  bodies.forEach((b) => {
    const n = b.n, g = sv('g', { class: 'ss-node' });
    const c = sv('circle', { r: b.r, fill: REGIME[b.tier].fill, stroke: REGIME[b.tier].stroke, 'stroke-width': 1.2 });
    // a source is drawn as a hollow "superposition" ring — the ∅ it collapses from — so the
    // quantum regime reads apart from the solid chemistry/meaning bodies.
    if (n.kind === 'source') { c.setAttribute('fill', 'var(--card,#fff)'); c.setAttribute('stroke-dasharray', '2 2'); }
    g.appendChild(c);
    g.addEventListener('click', (ev) => { ev.stopPropagation(); if (justDragged) { justDragged = false; return; } select(n); });
    g.addEventListener('mouseenter', () => { if (!state.sel) { state.hover = n.id; paint(); } });
    g.addEventListener('mouseleave', () => { if (!state.sel) { state.hover = null; paint(); } });
    gN.appendChild(g); nodeEls[n.id] = { g, c, b };
  });

  // ── edges: a bond from the sun (or between bodies) wearing its operator glyph ─
  const edgeEls = edges.map((e) => {
    const g = sv('g', {});
    const p = sv('path', { fill: 'none', stroke: REGIME[e.tier] ? REGIME[e.tier].fill : '#B4B2A9', 'stroke-width': 1.2, 'stroke-opacity': 0.45, 'marker-end': 'url(#' + mk + ')' });
    const mt = sv('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 11, fill: REGIME[e.tier] ? REGIME[e.tier].stroke : '#8A8A95', class: 'ss-eglyph' });
    mt.textContent = e.gl || '·';
    g.appendChild(p); g.appendChild(mt); gE.appendChild(g);
    return { g, p, mt, e };
  });

  const posOf = (id) => {
    if (id === sun.id) return { x: cx, y: cy };
    const ne = nodeEls[id]; if (!ne) return { x: cx, y: cy };
    const b = ne.b, a = b.ang + state.spin;
    return { x: cx + Math.cos(a) * b.band, y: cy + Math.sin(a) * b.band };
  };
  const positions = {};
  function place() {
    positions[sun.id] = { x: cx, y: cy };
    bodies.forEach((b) => { positions[b.n.id] = posOf(b.n.id); });
    sunEl.style.transform = 'translate(' + cx + 'px,' + cy + 'px)';
    bodies.forEach((b) => { const p = positions[b.n.id]; nodeEls[b.n.id].g.style.transform = 'translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px)'; });
    edgeEls.forEach((o) => {
      const a = positions[o.e.a] || posOf(o.e.a), z = positions[o.e.b] || posOf(o.e.b);
      const dx = z.x - a.x, dy = z.y - a.y, mx = (a.x + z.x) / 2, my = (a.y + z.y) / 2;
      const L = Math.hypot(dx, dy) || 1, ex = z.x - dx / L * 9, ey = z.y - dy / L * 9;
      o.p.setAttribute('d', 'M' + a.x.toFixed(1) + ',' + a.y.toFixed(1) + ' L' + ex.toFixed(1) + ',' + ey.toFixed(1));
      o.mt.setAttribute('x', mx.toFixed(1)); o.mt.setAttribute('y', my.toFixed(1));
      o.mt.style.display = (state.regimes[byId[o.e.a].tier] && state.regimes[byId[o.e.b].tier] && L * view.k > 26) ? '' : 'none';
    });
    labels();
  }

  // labels: the sun's name always reads (above its disc); an entity body's name reads when
  // its regime is on; a hovered/selected body reveals its own name whatever else is culled.
  function labels() {
    gL.innerHTML = '';
    const put = (id, above) => {
      const n = byId[id], p = positions[id]; if (!n || !p) return;
      const left = !above && p.x > W * 0.6;
      const t = sv('text', { class: 'ss-plabel', 'font-size': (11 / view.k).toFixed(2), 'text-anchor': above ? 'middle' : (left ? 'end' : 'start') });
      t.style.strokeWidth = (3 / view.k) + 'px';
      t.setAttribute('x', (above ? p.x : p.x + (left ? -12 : 12)).toFixed(1));
      t.setAttribute('y', (above ? p.y - 20 : p.y + 3.5).toFixed(1));
      t.textContent = n.label; gL.appendChild(t);
    };
    put(sun.id, true);
    bodies.forEach((b) => { const on = state.regimes[b.tier];
      const show = on && (b.n.kind === 'entity' || state.hover === b.n.id || state.sel === b.n.id);
      if (show) put(b.n.id, false); });
    if (state.hover && byId[state.hover] && !state.regimes[byId[state.hover].tier]) { /* regime off — stay hidden */ }
  }

  // paint: opacities for the regime toggles + the current hover/selection focus.
  function paint() {
    bodies.forEach((b) => { const on = state.regimes[b.tier];
      const foc = state.sel ? (b.n.id === state.sel || isBond(state.sel, b.n.id)) : (state.hover ? (b.n.id === state.hover || isBond(state.hover, b.n.id)) : true);
      nodeEls[b.n.id].g.style.opacity = on ? (foc ? 1 : 0.28) : 0.05;
      nodeEls[b.n.id].g.style.pointerEvents = on ? 'auto' : 'none';
      nodeEls[b.n.id].c.setAttribute('r', (state.hover === b.n.id || state.sel === b.n.id) ? b.r + 2 : b.r);
    });
    edgeEls.forEach((o) => { const on = state.regimes[byId[o.e.a].tier] && state.regimes[byId[o.e.b].tier];
      const foc = state.sel ? (o.e.a === state.sel || o.e.b === state.sel) : (state.hover ? (o.e.a === state.hover || o.e.b === state.hover) : true);
      o.g.style.opacity = on ? (foc ? 1 : 0.22) : 0.05;
      o.p.setAttribute('stroke-width', foc && (state.sel || state.hover) ? 2 : 1.2); });
    gO.querySelectorAll('[class*="ss-orbit-"]').forEach((c) => { const t = c.getAttribute('class').match(/ss-orbit-(\d)/); if (t) c.style.opacity = state.regimes[+t[1]] ? '' : 0.08; });
    gO.querySelectorAll('[class*="ss-reglabel-"]').forEach((c) => { const t = c.getAttribute('class').match(/ss-reglabel-(\d)/); if (t) c.style.opacity = state.regimes[+t[1]] ? 0.7 : 0.12; });
    labels();
  }
  const isBond = (a, b) => edges.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));

  function select(n) {
    state.sel = n.id; state.hover = null; paint();
    countsEl.style.display = 'none';
    const reg = REGIME[n.tier] || REGIME[1];
    const ins = edges.filter((e) => e.b === n.id).map((e) => e.gl).join(' ') || '—';
    const outs = edges.filter((e) => e.a === n.id).map((e) => e.gl).join(' ') || '—';
    detail.innerHTML = '<span style="width:16px;height:16px;flex:0 0 auto;border-radius:5px;background:' + reg.fill + ';display:inline-block;"></span>' +
      '<span style="color:var(--ink,#15181e);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:32%;">' + esc(n.label) + '</span>' +
      '<span style="color:var(--ink3,#999);">' + reg.name + ' · ' + reg.phys + '</span>' +
      '<span style="color:var(--ink2,#555);white-space:nowrap;">in <span style="font-size:14px;font-family:var(--mono,monospace);">' + esc(ins) + '</span></span>' +
      '<span style="color:var(--ink2,#555);white-space:nowrap;">out <span style="font-size:14px;font-family:var(--mono,monospace);">' + esc(outs) + '</span></span>';
    // an entity that is not already the sun can BECOME the POV — that is the pivot
    if (onPivot && n.kind === 'entity' && n.ref && n.id !== sun.id) {
      const b = el('button', { class: 'ss-btn', text: '☉ pivot POV →' }); b.style.marginLeft = 'auto'; b.style.flex = '0 0 auto';
      b.addEventListener('click', () => onPivot(n)); detail.appendChild(b);
    } else if (onOpen && n.ref) {
      const b = el('button', { class: 'ss-btn', text: 'open →' }); b.style.marginLeft = 'auto'; b.style.flex = '0 0 auto';
      b.addEventListener('click', () => onOpen(n)); detail.appendChild(b);
    }
    if (onSelect) { try { onSelect(n); } catch { /* the host mirror must never break selection */ } }
  }
  function deselect() {
    state.sel = null; paint();
    detail.innerHTML = '<span style="color:var(--ink3,#999);">click a body to pivot its POV · drag to pan · scroll to zoom</span>';
    countsEl.style.display = '';
  }

  // ── regime toggles ──────────────────────────────────────────────────────────
  wrap.querySelectorAll('[data-reg]').forEach((ch) => ch.addEventListener('click', () => {
    const t = ch.dataset.reg; state.regimes[t] = !state.regimes[t]; ch.classList.toggle('off', !state.regimes[t]);
    if (state.sel) deselect(); else paint();
  }));

  // ── the calm drift: one rigid rotation of the whole system ──────────────────
  let raf = null, last = 0;
  const OMEGA = 0.045;   // rad/s — a slow, readable turn
  function tick(t) {
    if (!last) last = t; const dt = Math.min(0.05, (t - last) / 1000); last = t;
    if (state.playing) { state.spin = (state.spin + OMEGA * dt) % (Math.PI * 2); place(); }
    raf = requestAnimationFrame(tick);
  }
  function setPlay(on) { state.playing = on; playBtn.firstChild.textContent = on ? '❚❚ ' : '▶ '; playLbl.textContent = on ? 'drift' : 'parked'; }
  playBtn.addEventListener('click', () => setPlay(!state.playing));

  // ── pan / zoom ──────────────────────────────────────────────────────────────
  function apply() { vp.setAttribute('transform', 'translate(' + view.x.toFixed(1) + ',' + view.y.toFixed(1) + ') scale(' + view.k.toFixed(3) + ')'); }
  function fit() {
    const rMax = Math.max(...bodies.map((b) => b.band), 60) + 60;
    const k = Math.min(W / (2 * rMax), H / (2 * rMax), 1.4); view.k = k;
    view.x = W / 2 - cx * k; view.y = H / 2 - cy * k; apply(); labels();
  }
  let drag = null, justDragged = false;
  const onDown = (e) => { drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }; svg.style.cursor = 'grabbing'; svg.setPointerCapture(e.pointerId); };
  const onMove = (e) => { if (!drag) return; const r = svg.getBoundingClientRect(), sc = W / r.width, dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; view.x = drag.vx + dx * sc; view.y = drag.vy + dy * sc; apply(); };
  const onUp = () => { if (drag && drag.moved) justDragged = true; else if (drag && !drag.moved) deselect(); drag = null; svg.style.cursor = 'grab'; };
  const onWheel = (e) => { e.preventDefault(); const r = svg.getBoundingClientRect(), sc = W / r.width;
    const mx = (e.clientX - r.left) * sc, my = (e.clientY - r.top) * sc, f = e.deltaY < 0 ? 1.12 : 1 / 1.12, nk = Math.max(0.4, Math.min(3, view.k * f));
    view.x = mx - (mx - view.x) * (nk / view.k); view.y = my - (my - view.y) * (nk / view.k); view.k = nk; apply(); labels(); };
  svg.addEventListener('pointerdown', onDown); svg.addEventListener('pointermove', onMove); svg.addEventListener('pointerup', onUp);
  svg.addEventListener('wheel', onWheel, { passive: false });
  wrap.querySelector('[data-zin]').addEventListener('click', () => { view.k = Math.min(3, view.k * 1.2); apply(); labels(); });
  wrap.querySelector('[data-zout]').addEventListener('click', () => { view.k = Math.max(0.4, view.k / 1.2); apply(); labels(); });
  wrap.querySelector('[data-fit]').addEventListener('click', fit);

  place(); paint(); fit(); setPlay(true); raf = requestAnimationFrame(tick);
  // the sun opens the details panel so the surface is never a picture without its facts
  if (onSelect) { try { onSelect(sun); } catch { /* mirror is best-effort */ } }

  return { destroy() { if (raf) cancelAnimationFrame(raf); wrap.remove(); } };
}
