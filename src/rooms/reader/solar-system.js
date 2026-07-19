// EO: GEO(Gravity → Existence Orbit) — the EOGraph solar surface, semantic-zoom cut.
// mountSolarSystem — an EGOCENTRIC, POV-pivoting view of the record that DOES NOT show
// everything at once. It centres ONE entity — its point of view — and reads the record as
// a Powers-of-Ten descent: you start at the highest level (meaning) and zoom DOWN, one
// holon level at a time, to the raw spans underneath. Each level is a different KIND OF
// MATH, so each gets its own visual grammar:
//
//   level 0 · meaning   — the PHYSICS of orbital attraction: the claims that hold about the
//                         entity, orbiting under the gravity of significance (⊢⊨⊛). Curved
//                         trajectories, a gravity well. Where you land.
//   level 1 · structure — the GEOMETRY of bonds: the entities it bonds to, drawn as an
//                         angular lattice — straight spokes, a connecting polygon, angle ticks
//                         at the centre (｜⋈△).
//   level 2 · existence — the ARITHMETIC of coming-into-being: the source(s) it collapsed out
//                         of, and a TALLY of how many times it was witnessed into existence
//                         (∅ → ○○○ → ●). Discrete, countable quanta.
//   level 3 · spans     — the SUBSTRATE: the literal mention sentences, the raw spans the
//                         reading folded everything above out of.
//
// "Zoom" here is SEMANTIC, not optical — a wheel notch (or the level rail, or +/−) descends
// or ascends one level; only the current level is drawn, cross-fading as you move. Pan slides
// within a level. Click an entity body (meaning/structure) and the POV PIVOTS — that entity
// becomes the new centre and the host reseeds the egocentric web around it (onPivot).
//
// Fed the SAME honest tiered data as the entity web (app.tieredData) — the source at tier 0,
// bonded figures at tier 1, standing claims at tier 2 — plus the focus entity's `spans` (its
// mentions) for the floor. Pure DOM + SVG, no deps; returns { destroy }.
//
//   nodes: [{ id, tier:0|1|2, label, kind, ref }]   edges: [{ a, b, tier, gl, code }]
//   centreId  the id to seat at the centre (the sun / POV)
//   spans:  [{ idx, text }]   the focus entity's raw mention sentences (level 3)
//   count:  number           how many times it was witnessed (the arithmetic tally)
//   onPivot(node) · onSelect(node) · onOpen(node) · onSpan(span)

const NS = 'http://www.w3.org/2000/svg';

// The four descent levels — each a kind of math with its own palette (shared with the tiered
// graph's tiers so the two surfaces read as one system) and its own glyph vocabulary.
const LEVELS = [
  { key: 'meaning',   math: 'physics · orbital',    tier: 2,  fill: '#EF9F27', stroke: '#BA7517', chipBg: '#FAEEDA', chipFg: '#633806', glyphs: '⊢⊨⊛' },
  { key: 'structure', math: 'geometry · lattice',   tier: 1,  fill: '#1D9E75', stroke: '#0F6E56', chipBg: '#E1F5EE', chipFg: '#085041', glyphs: '｜⋈△' },
  { key: 'existence', math: 'arithmetic · quanta',  tier: 0,  fill: '#7F77DD', stroke: '#534AB7', chipBg: '#EEEDFE', chipFg: '#3C3489', glyphs: '∅○●' },
  { key: 'spans',     math: 'the raw sentences',    tier: -1, fill: '#5A5A64', stroke: '#33333B', chipBg: '#EEECEF', chipFg: '#33333B', glyphs: '“ ”' },
];
const SUN = { fill: '#FBF3E6', stroke: '#BA7517' };

const STYLE_ID = 'eo-ss-style';
const CSS = `
.eo-ss{font-family:var(--sans,system-ui,sans-serif);color:var(--ink,#15181e);}
.eo-ss .ss-btn{font-size:12px;padding:5px 10px;border:1px solid var(--line2,#e5e7eb);border-radius:7px;background:var(--card,#fff);color:var(--ink2,#555);cursor:pointer;display:inline-flex;align-items:center;gap:5px;line-height:1.2;}
.eo-ss .ss-btn:hover{background:var(--app,#f4f5f7);}
.eo-ss .ss-lvl{font-size:11px;padding:5px 10px;border-radius:8px;cursor:pointer;border:1px solid transparent;user-select:none;display:inline-flex;align-items:center;gap:6px;line-height:1.15;}
.eo-ss .ss-lvl .gl{font-family:var(--mono,ui-monospace,Menlo,monospace);letter-spacing:1px;}
.eo-ss .ss-lvl small{opacity:.7;font-size:9.5px;letter-spacing:.02em;}
.eo-ss .ss-lvl.off{opacity:.4;background:transparent!important;}
.eo-ss .ss-stage{transition:opacity .18s ease;}
.eo-ss .ss-plabel{paint-order:stroke;stroke:var(--card,#fff);stroke-width:3px;stroke-linejoin:round;fill:var(--ink,#15181e);pointer-events:none;}
.eo-ss .ss-glyph{paint-order:stroke;stroke:var(--card,#fff);stroke-width:3px;stroke-linejoin:round;pointer-events:none;font-family:var(--mono,ui-monospace,Menlo,monospace);}
.eo-ss .ss-body{cursor:pointer;}
.eo-ss .ss-span{cursor:pointer;}
.eo-ss .ss-tick{stroke-dasharray:1 3;}
`;

export function mountSolarSystem(root, { nodes: inNodes = [], edges: inEdges = [], centreId = null, spans = [], count = 0, onPivot = null, onSelect = null, onOpen = null, onSpan = null, countsLabel = '' } = {}) {
  if (!document.getElementById(STYLE_ID)) {
    const st = document.createElement('style'); st.id = STYLE_ID; st.textContent = CSS; document.head.appendChild(st);
  }
  const el = (t, a = {}) => { const e = document.createElement(t); for (const k in a) { if (k === 'text') e.textContent = a[k]; else if (k === 'html') e.innerHTML = a[k]; else e.setAttribute(k, a[k]); } return e; };
  const sv = (t, a = {}) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clip = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

  const nodes = inNodes.map((n) => ({ ...n }));
  const byId = {}; nodes.forEach((n) => byId[n.id] = n);
  const edges = inEdges.filter((e) => byId[e.a] && byId[e.b]);
  const deg = {}; nodes.forEach((n) => deg[n.id] = 0);
  edges.forEach((e) => { deg[e.a]++; deg[e.b]++; });

  const ents = nodes.filter((n) => n.kind === 'entity');
  let sun = (centreId && byId[centreId]) || ents.slice().sort((a, b) => deg[b.id] - deg[a.id])[0] || nodes[0] || null;
  if (!sun) { root.appendChild(el('div', { html: '<div style="padding:22px;color:#8A8A95;font-size:13px">Nothing to place in orbit yet.</div>' })); return { destroy() {} }; }

  // The three regimes' bodies, partitioned off the sun's own tiers.
  const claims = nodes.filter((n) => n.tier === 2 && n !== sun);
  const bonded = nodes.filter((n) => n.tier === 1 && n !== sun);
  const sources = nodes.filter((n) => n.tier === 0 && n !== sun);
  const tally = count || spans.length || 0;
  const bondEdge = (id) => edges.find((e) => (e.a === sun.id && e.b === id) || (e.b === sun.id && e.a === id));

  const W = 700, H = 470, cx = W / 2, cy = H / 2;
  // depth is the continuous descent dial; the integer level is what we draw. Start at meaning (0).
  const state = { depth: 0, level: 0, playing: true, spin: 0, sel: null };
  const pan = { x: 0, y: 0 };

  // ── shell ──────────────────────────────────────────────────────────────────
  const wrap = el('div', { class: 'eo-ss', role: 'region', 'aria-label': 'Solar view: one entity at the centre; zoom descends from meaning to structure to existence to the raw spans' });
  wrap.innerHTML =
    '<div style="border:1px solid var(--line,#e5e7eb);border-radius:12px;overflow:hidden;background:var(--card,#fff);">' +
    '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;border-bottom:1px solid var(--line,#e5e7eb);background:var(--app,#f7f8fb);">' +
      '<span class="ss-btn" style="cursor:default;color:var(--ink2,#555);">☉ EOGraph</span>' +
      '<button class="ss-btn" data-play title="Pause or resume the orbital drift (meaning level)">❚❚ <span data-playlbl>drift</span></button>' +
      '<div style="display:flex;gap:5px;margin-left:auto;">' +
        '<button class="ss-btn" data-up title="Zoom out — ascend a level">−</button>' +
        '<button class="ss-btn" data-down title="Zoom in — descend a level toward the raw spans">+</button>' +
        '<button class="ss-btn" data-reset title="Back to the meaning level">⌖ top</button>' +
      '</div>' +
    '</div>' +
    '<div data-rail style="display:flex;align-items:center;gap:6px;padding:8px 12px;border-bottom:1px solid var(--line,#e5e7eb);flex-wrap:wrap;">' +
      '<span style="font-size:11px;color:var(--ink3,#999);letter-spacing:.04em;margin-right:2px;" title="One level on screen at a time — zoom, or click a level, to descend from meaning to the raw spans">zoom</span>' +
      LEVELS.map((L, i) => '<span class="ss-lvl" data-lvl="' + i + '" title="' + L.math + '" style="background:' + L.chipBg + ';color:' + L.chipFg + ';"><span class="gl">' + L.glyphs + '</span>' + L.key + ' <small>' + L.math + '</small></span>' + (i < 3 ? '<span style="color:var(--ink3,#bbb);font-size:11px;">›</span>' : '')).join('') +
    '</div>' +
    '<div style="position:relative;background:var(--card,#fff);background-image:radial-gradient(var(--line,#e5e7eb) 0.5px,transparent 0.5px);background-size:16px 16px;">' +
      '<svg data-svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block;touch-action:none;cursor:grab;">' +
        '<defs><radialGradient data-well cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#EF9F27" stop-opacity="0.13"/><stop offset="55%" stop-color="#EF9F27" stop-opacity="0.04"/><stop offset="100%" stop-color="#EF9F27" stop-opacity="0"/></radialGradient>' +
          '<marker data-marker markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L5,3 L0,6 Z" fill="#B4B2A9"/></marker></defs>' +
        '<g data-pan><g data-stage class="ss-stage"></g></g>' +
      '</svg>' +
    '</div>' +
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:9px;padding:9px 13px;border-top:1px solid var(--line,#e5e7eb);background:var(--app,#f7f8fb);font-size:12px;color:var(--ink2,#555);min-height:20px;">' +
      '<div data-detail style="display:flex;align-items:center;gap:9px;min-width:0;flex:1;flex-wrap:wrap;"></div>' +
      '<span data-counts style="font-family:var(--mono,ui-monospace,monospace);color:var(--ink3,#999);flex:0 0 auto;">' + esc(countsLabel) + '</span>' +
    '</div>' +
    '</div>';
  root.appendChild(wrap);

  const uid = 'ss-' + Math.floor(Math.random() * 1e9);
  const well = wrap.querySelector('[data-well]'); well.setAttribute('id', uid + '-well');
  const mk = uid + '-mk'; wrap.querySelector('[data-marker]').setAttribute('id', mk);
  const svg = wrap.querySelector('[data-svg]'), stage = wrap.querySelector('[data-stage]'), panG = wrap.querySelector('[data-pan]');
  const detail = wrap.querySelector('[data-detail]'), countsEl = wrap.querySelector('[data-counts]');
  const playBtn = wrap.querySelector('[data-play]'), playLbl = wrap.querySelector('[data-playlbl]');

  // orbiters carry the live meaning-level bodies so the drift can re-place them each frame
  let orbiters = [];

  // ── level 0 · meaning — the physics of orbital attraction ───────────────────
  function renderMeaning(g) {
    g.appendChild(sv('rect', { x: cx - 260, y: cy - 190, width: 520, height: 380, fill: 'url(#' + uid + '-well)' }));
    drawSun(g, '☉');
    orbiters = [];
    if (!claims.length) {
      g.appendChild(text(cx, cy + 70, 'no standing claims yet — its meaning ring is empty', { anchor: 'middle', size: 11.5, fill: '#8A8A95' }));
      return;
    }
    const rings = Math.min(3, Math.ceil(claims.length / 5));
    claims.forEach((n, i) => {
      const ring = i % rings, rx = 96 + ring * 62, ry = rx * 0.62;
      const baseAng = (Math.floor(i / rings) / Math.max(1, Math.ceil(claims.length / rings))) * Math.PI * 2 + ring * 0.7;
      // the elliptical orbit + a leading trajectory arc (the "physics")
      g.appendChild(sv('ellipse', { cx, cy, rx, ry, fill: 'none', stroke: LEVELS[0].fill, 'stroke-opacity': 0.28, 'stroke-dasharray': '2 5' }));
      const grp = sv('g', { class: 'ss-body' });
      const dot = sv('circle', { r: 5.5, fill: LEVELS[0].fill, stroke: LEVELS[0].stroke, 'stroke-width': 1.1 });
      grp.appendChild(dot);
      grp.addEventListener('click', (ev) => { ev.stopPropagation(); select(n); });
      g.appendChild(grp);
      const lab = text(0, 0, clip(n.label, 26), { anchor: 'start', size: 10.5, cls: 'ss-plabel' });
      g.appendChild(lab);
      orbiters.push({ grp, lab, rx, ry, baseAng });
    });
    placeOrbiters();
  }
  function placeOrbiters() {
    orbiters.forEach((o) => {
      const a = o.baseAng + state.spin;
      const x = cx + Math.cos(a) * o.rx, y = cy + Math.sin(a) * o.ry;
      o.grp.setAttribute('transform', 'translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ')');
      o.lab.setAttribute('x', (x + 9).toFixed(1)); o.lab.setAttribute('y', (y + 3.5).toFixed(1));
    });
  }

  // ── level 1 · structure — the geometry of bonds ─────────────────────────────
  function renderStructure(g) {
    drawSun(g, '◈');
    if (!bonded.length) { g.appendChild(text(cx, cy + 70, 'no bonds read yet — nothing to build a structure from', { anchor: 'middle', size: 11.5, fill: '#8A8A95' })); return; }
    const R = 150, n = bonded.length;
    const pts = bonded.map((nd, i) => { const a = -Math.PI / 2 + (i / n) * Math.PI * 2; return { nd, a, x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R }; });
    // the connecting polygon (the lattice) — the geometry the bonds trace
    if (n >= 3) { const d = pts.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ') + ' Z';
      g.appendChild(sv('path', { d, fill: LEVELS[1].fill, 'fill-opacity': 0.05, stroke: LEVELS[1].fill, 'stroke-opacity': 0.3, 'stroke-width': 1 })); }
    // angle ticks at the centre — geometry names its angles
    pts.forEach((p) => g.appendChild(sv('line', { class: 'ss-tick', x1: cx, y1: cy, x2: (cx + Math.cos(p.a) * 30).toFixed(1), y2: (cy + Math.sin(p.a) * 30).toFixed(1), stroke: LEVELS[1].stroke, 'stroke-opacity': 0.45 })));
    pts.forEach((p) => {
      const e = bondEdge(p.nd.id);
      // straight spoke, sun → vertex, wearing the bond glyph
      g.appendChild(sv('line', { x1: cx, y1: cy, x2: p.x.toFixed(1), y2: p.y.toFixed(1), stroke: LEVELS[1].fill, 'stroke-opacity': 0.5, 'stroke-width': 1.2, 'marker-end': 'url(#' + mk + ')' }));
      if (e && e.gl) g.appendChild(text((cx + p.x) / 2, (cy + p.y) / 2, e.gl, { anchor: 'middle', size: 12, cls: 'ss-glyph', fill: LEVELS[1].stroke }));
      // a geometric vertex — a diamond, not a circle
      const s = 7, grp = sv('g', { class: 'ss-body' });
      grp.appendChild(sv('path', { d: 'M0,' + (-s) + ' L' + s + ',0 L0,' + s + ' L' + (-s) + ',0 Z', fill: LEVELS[1].fill, stroke: LEVELS[1].stroke, 'stroke-width': 1.2 }));
      grp.setAttribute('transform', 'translate(' + p.x.toFixed(1) + ',' + p.y.toFixed(1) + ')');
      grp.addEventListener('click', (ev) => { ev.stopPropagation(); select(p.nd); });
      g.appendChild(grp);
      const left = p.x < cx;
      g.appendChild(text(p.x + (left ? -11 : 11), p.y + 3.5, clip(p.nd.label, 22), { anchor: left ? 'end' : 'start', size: 10.5, cls: 'ss-plabel' }));
    });
  }

  // ── level 2 · existence — the arithmetic of coming-into-being ────────────────
  function renderExistence(g) {
    // the void it collapsed from — a dashed ∅ far out
    g.appendChild(sv('circle', { cx, cy, r: 168, fill: 'none', stroke: LEVELS[2].fill, 'stroke-opacity': 0.35, 'stroke-dasharray': '2 6' }));
    g.appendChild(text(cx, cy - 176, '∅ void', { anchor: 'middle', size: 10, cls: 'ss-glyph', fill: LEVELS[2].stroke }));
    // the source(s) it precipitated out of, on the void ring — started at the BOTTOM so they never
    // collide with the "∅ void" caption at the top.
    const n = Math.max(1, sources.length);
    sources.forEach((s, i) => { const a = Math.PI / 2 + (i / n) * Math.PI * 2, x = cx + Math.cos(a) * 168, y = cy + Math.sin(a) * 168;
      const grp = sv('g', { class: 'ss-body' });
      grp.appendChild(sv('circle', { r: 6, fill: 'var(--card,#fff)', stroke: LEVELS[2].stroke, 'stroke-width': 1.4, 'stroke-dasharray': '2 2' }));
      grp.setAttribute('transform', 'translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ')');
      grp.addEventListener('click', (ev) => { ev.stopPropagation(); select(s); });
      g.appendChild(grp);
      g.appendChild(text(x, y + 18, clip(s.label, 20), { anchor: 'middle', size: 10, cls: 'ss-plabel' }));
    });
    // the tally — how many times it was WITNESSED into being (arithmetic, grouped in fives), sitting
    // ABOVE the sun so it never crosses the disc.
    const groups = Math.ceil(tally / 5), gy = cy - 46;
    for (let k = 0; k < tally; k++) {
      const grp = Math.floor(k / 5), within = k % 5;
      const bx = cx - (Math.min(tally, 5) * 5.5) / 2 + (grp * 34) + within * 5.5, by = gy;
      g.appendChild(sv('circle', { cx: bx.toFixed(1), cy: by, r: 2.6, fill: LEVELS[2].fill }));
    }
    drawSun(g, '●');
    // ∅ → count → ● : the collapse spelled as a sum, BELOW the sun so the disc stays clear.
    g.appendChild(text(cx, cy + 52, '∅ → ' + tally + ' × ○ → ●', { anchor: 'middle', size: 15, cls: 'ss-glyph', fill: LEVELS[2].stroke }));
    g.appendChild(text(cx, cy + 72, 'witnessed ' + tally + ' time' + (tally === 1 ? '' : 's') + ' into existence', { anchor: 'middle', size: 10.5, fill: '#8A8A95' }));
  }

  // ── level 3 · spans — the raw substrate ─────────────────────────────────────
  function renderSpans(g) {
    if (!spans.length) { drawSun(g, '“”'); g.appendChild(text(cx, cy + 70, 'no raw spans on record for this entity', { anchor: 'middle', size: 11.5, fill: '#8A8A95' })); return; }
    g.appendChild(text(cx, 34, 'the raw sentences ' + sun.label + ' was read from', { anchor: 'middle', size: 11, fill: '#8A8A95' }));
    const list = spans.slice(0, 7);
    const rowH = 50, top = cy - (list.length * rowH) / 2 + 18;
    list.forEach((sp, i) => {
      const y = top + i * rowH, grp = sv('g', { class: 'ss-span' });
      grp.appendChild(sv('rect', { x: cx - 250, y: y - 16, width: 500, height: rowH - 8, rx: 8, fill: 'var(--app,#f7f8fb)', stroke: 'var(--line,#e5e7eb)' }));
      grp.appendChild(text(cx - 238, y + 2, '¶' + (sp.idx != null ? sp.idx : i), { anchor: 'start', size: 11, cls: 'ss-glyph', fill: LEVELS[3].stroke }));
      grp.appendChild(text(cx - 200, y + 2, clip(sp.text, 82), { anchor: 'start', size: 11.5, fill: 'var(--ink,#15181e)' }));
      if (onSpan) grp.addEventListener('click', (ev) => { ev.stopPropagation(); try { onSpan(sp); } catch {} });
      g.appendChild(grp);
    });
  }

  function drawSun(g, glyph) {
    const grp = sv('g', { class: 'ss-body' });
    grp.appendChild(sv('circle', { r: 22, fill: SUN.fill, opacity: 0.35 }));
    grp.appendChild(sv('circle', { r: 14, fill: SUN.fill, stroke: SUN.stroke, 'stroke-width': 2 }));
    grp.appendChild(text(0, 5, glyph, { anchor: 'middle', size: 14, cls: 'ss-glyph', fill: SUN.stroke }));
    grp.setAttribute('transform', 'translate(' + cx + ',' + cy + ')');
    grp.addEventListener('click', (ev) => { ev.stopPropagation(); select(sun); });
    g.appendChild(grp);
    g.appendChild(text(cx, cy - 26, clip(sun.label, 30), { anchor: 'middle', size: 12, cls: 'ss-plabel' }));
  }
  function text(x, y, s, { anchor = 'start', size = 11, fill = 'var(--ink,#15181e)', cls = '' } = {}) {
    const t = sv('text', { x: x.toFixed ? x.toFixed(1) : x, y: y.toFixed ? y.toFixed(1) : y, 'text-anchor': anchor, 'font-size': size, fill });
    if (cls) t.setAttribute('class', cls); t.textContent = s; return t;
  }

  // ── the descent: swap the level, cross-fading, and light the rail ───────────
  function renderLevel() {
    stage.innerHTML = ''; orbiters = [];
    if (state.level === 0) renderMeaning(stage);
    else if (state.level === 1) renderStructure(stage);
    else if (state.level === 2) renderExistence(stage);
    else renderSpans(stage);
    wrap.querySelectorAll('[data-lvl]').forEach((c) => c.classList.toggle('off', +c.dataset.lvl !== state.level));
    const L = LEVELS[state.level];
    const trail = LEVELS.map((x, i) => i === state.level ? x.key : '·').join(' ');
    detail.innerHTML = state.sel ? detail.innerHTML :
      '<span style="width:14px;height:14px;flex:0 0 auto;border-radius:4px;background:' + L.fill + ';display:inline-block;"></span>' +
      '<span style="color:var(--ink,#15181e);font-weight:600;">' + esc(L.key) + '</span>' +
      '<span style="color:var(--ink3,#999);">' + esc(L.math) + '</span>' +
      '<span style="color:var(--ink3,#bbb);font-family:var(--mono,monospace);font-size:11px;">' + esc(trail) + '</span>' +
      '<span style="color:var(--ink3,#999);margin-left:6px;">— zoom to descend</span>';
    // a quick fade for the swap
    stage.style.opacity = '0.35'; requestAnimationFrame(() => { stage.style.opacity = '1'; });
  }
  function setLevel(l, keepSel) {
    l = Math.max(0, Math.min(3, l | 0));
    if (l === state.level) return;
    state.level = l; state.depth = l;
    if (!keepSel) { state.sel = null; }
    renderLevel();
  }

  // ── selection + POV pivot ───────────────────────────────────────────────────
  function select(n) {
    state.sel = n.id;
    const L = LEVELS[state.level];
    const g0 = edges.filter((e) => e.b === n.id).map((e) => e.gl).join(' ') || '—';
    const g1 = edges.filter((e) => e.a === n.id).map((e) => e.gl).join(' ') || '—';
    detail.innerHTML = '<span style="width:14px;height:14px;flex:0 0 auto;border-radius:4px;background:' + L.fill + ';display:inline-block;"></span>' +
      '<span style="color:var(--ink,#15181e);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:34%;">' + esc(n.label) + '</span>' +
      '<span style="color:var(--ink3,#999);">' + esc(n.kind || '') + '</span>' +
      '<span style="color:var(--ink2,#555);white-space:nowrap;">in <span style="font-size:14px;font-family:var(--mono,monospace);">' + esc(g0) + '</span></span>' +
      '<span style="color:var(--ink2,#555);white-space:nowrap;">out <span style="font-size:14px;font-family:var(--mono,monospace);">' + esc(g1) + '</span></span>';
    if (onPivot && n.kind === 'entity' && n.ref && n.id !== sun.id) {
      const b = el('button', { class: 'ss-btn', text: '☉ pivot POV →' }); b.style.marginLeft = 'auto'; b.style.flex = '0 0 auto';
      b.addEventListener('click', () => onPivot(n)); detail.appendChild(b);
    } else if (onOpen && n.ref) {
      const b = el('button', { class: 'ss-btn', text: 'open →' }); b.style.marginLeft = 'auto'; b.style.flex = '0 0 auto';
      b.addEventListener('click', () => onOpen(n)); detail.appendChild(b);
    }
    if (onSelect) { try { onSelect(n); } catch { /* mirror is best-effort */ } }
  }

  // ── level rail + steppers ────────────────────────────────────────────────────
  wrap.querySelectorAll('[data-lvl]').forEach((c) => c.addEventListener('click', () => setLevel(+c.dataset.lvl)));
  wrap.querySelector('[data-down]').addEventListener('click', () => setLevel(state.level + 1));
  wrap.querySelector('[data-up]').addEventListener('click', () => setLevel(state.level - 1));
  wrap.querySelector('[data-reset]').addEventListener('click', () => { pan.x = pan.y = 0; applyPan(); setLevel(0); if (state.level === 0) renderLevel(); });

  // ── the calm orbital drift (meaning level only) ─────────────────────────────
  let raf = null, last = 0;
  const OMEGA = 0.05;
  function tick(t) {
    if (!last) last = t; const dt = Math.min(0.05, (t - last) / 1000); last = t;
    if (state.playing && state.level === 0 && orbiters.length) { state.spin = (state.spin + OMEGA * dt) % (Math.PI * 2); placeOrbiters(); }
    raf = requestAnimationFrame(tick);
  }
  function setPlay(on) { state.playing = on; playBtn.firstChild.textContent = on ? '❚❚ ' : '▶ '; playLbl.textContent = on ? 'drift' : 'parked'; }
  playBtn.addEventListener('click', () => setPlay(!state.playing));

  // ── pan (translate only) + wheel = semantic descend/ascend ──────────────────
  function applyPan() { panG.setAttribute('transform', 'translate(' + pan.x.toFixed(1) + ',' + pan.y.toFixed(1) + ')'); }
  let drag = null;
  svg.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }; svg.style.cursor = 'grabbing'; svg.setPointerCapture(e.pointerId); });
  svg.addEventListener('pointermove', (e) => { if (!drag) return; const r = svg.getBoundingClientRect(), sc = W / r.width; pan.x = drag.px + (e.clientX - drag.x) * sc; pan.y = drag.py + (e.clientY - drag.y) * sc; applyPan(); });
  svg.addEventListener('pointerup', () => { drag = null; svg.style.cursor = 'grab'; });
  let wheelAcc = 0;
  svg.addEventListener('wheel', (e) => { e.preventDefault(); wheelAcc += e.deltaY; if (Math.abs(wheelAcc) < 60) return;
    const dir = wheelAcc > 0 ? 1 : -1; wheelAcc = 0; setLevel(state.level + dir); }, { passive: false });

  renderLevel(); setPlay(true); raf = requestAnimationFrame(tick);
  if (onSelect) { try { onSelect(sun); } catch { /* best-effort */ } }
  void countsEl;

  return { destroy() { if (raf) cancelAnimationFrame(raf); wrap.remove(); } };
}
