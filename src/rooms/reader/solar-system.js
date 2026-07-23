// EO: GEO(Gravity → Existence Orbit) — the EOGraph solar surface, semantic-zoom cut.
// mountSolarSystem — an EGOCENTRIC, POV-pivoting view of the record that DOES NOT show
// everything at once. It centres ONE entity — its point of view — and reads the record as
// a Powers-of-Ten descent through three physical regimes, each a different KIND OF MATH:
//
//   level 0 · meaning   — orbital PHYSICS: the claims that hold about the entity, orbiting
//                         under the gravity of significance (⊢⊨⊛), LIVE and continuous —
//                         each on its own period and phase, never resetting. Click any body
//                         (the sun or a claim) and the CAMERA re-anchors to it right there:
//                         the true motion never changes, only which body sits still at the
//                         centre, so the old centre visibly starts orbiting whatever you
//                         clicked. Pausable; the time cursor can be scrubbed by hand too.
//   level 1 · structure — molecular CHEMISTRY: the figures it bonds to, read as a DAG — the
//                         real bond graph ringed out by rank (sun-adjacent, or reached only
//                         through another bond), every edge directed and glyphed (｜⋈△).
//   level 2 · existence — subatomic QUANTUM arithmetic: a metrics dashboard (bonds, claims,
//                         mentions) sitting directly over the raw spans it's a tally OF — a
//                         count with nothing under it is unverifiable, so the two are one
//                         holon, not two (∅○●, “ ”).
//
// "Zoom" here is SEMANTIC, not optical — a wheel notch (or the level rail, or +/−) descends
// or ascends one level; only the current level is drawn, cross-fading as you move. Pan slides
// within a level. Click an entity body and the POV PIVOTS IMMEDIATELY — the click IS the
// pivot, not a button gated behind one — that entity becomes the new centre and the host
// reseeds the egocentric web around it (onPivot).
//
// Fed the SAME honest tiered data as the entity web (app.tieredData) — the source at tier 0,
// bonded figures at tier 1, standing claims at tier 2 — plus the focus entity's `spans` (its
// mentions) for level 2's floor. Pure DOM + SVG, no deps; returns { destroy }.
//
//   nodes: [{ id, tier:0|1|2, label, kind, ref, color? }]   edges: [{ a, b, tier, gl, code, dashed? }]
//   node.color overrides the tier's shared fill (e.g. a verdict color on a claim body or a bonded
//   figure); edge.dashed draws a structure-level bond dashed instead of solid (e.g. a candidate/
//   single-source relation vs. a corroborated one). Both are optional — omit for the tier's default.
//   centreId  the id to seat at the centre (the sun / POV)
//   spans:  [{ idx, text }]   the focus entity's raw mention sentences (level 2's floor)
//   count:  number           how many times it was witnessed (the dashboard's tally)
//   onPivot(node) · onSelect(node) · onOpen(node) · onSpan(span)

import { glyphOf, mannerOf } from '../../core/index.js';

const NS = 'http://www.w3.org/2000/svg';

// The three descent levels — each a kind of math with its own palette (shared with the tiered
// graph's tiers so the two surfaces read as one system) and its own glyph vocabulary.
const LEVELS = [
  { key: 'meaning',   math: 'physics · orbital',    tier: 2,  fill: '#EF9F27', stroke: '#BA7517', chipBg: '#FAEEDA', chipFg: '#633806', glyphs: '⊢⊨⊛' },
  { key: 'structure', math: 'chemistry · geometry', tier: 1,  fill: '#1D9E75', stroke: '#0F6E56', chipBg: '#E1F5EE', chipFg: '#085041', glyphs: '｜⋈△' },
  { key: 'existence', math: 'quantum · arithmetic',  tier: 0,  fill: '#7F77DD', stroke: '#534AB7', chipBg: '#EEEDFE', chipFg: '#3C3489', glyphs: '∅○● “ ”' },
];
const SUN = { fill: '#FBF3E6', stroke: '#BA7517' };
const SCRUB_MAX = 60;   // seconds the meaning-level time cursor's slider spans

// The meaning ring's SPECTRUM: never a claim's position without saying what KIND of act it is.
// Each body is tinted by the manner of the act it records — the Act face's three Modes said the way
// a reader reads them (core/operators.js MODE_MANNER) — reusing the tier palette so a manner and a
// tier never disagree on colour. A claim with no operator falls back to the meaning tier's amber.
const MANNER_COLOR = {
  distinguishes: { fill: '#EF9F27', stroke: '#BA7517' },   // Differentiate — amber (assert/resplit)
  links:         { fill: '#1D9E75', stroke: '#0F6E56' },   // Relate — green (bond/attribute)
  introduces:    { fill: '#7F77DD', stroke: '#534AB7' },   // Generate — indigo (instantiate/synthesize)
};
// Settledness as MOTION: a claim's standing places it in the well. A firming claim (corroboration
// accumulating) hugs the sun — more gravity; a fresh one rides the middle; an unsettled one (hedged
// or denied) drifts to the edge. Confidence shown as position, never a number.
const STANDING_RING = { firming: 0, fresh: 1, unsettled: 2 };
const STANDING_LABEL = { firming: 'firming up', fresh: 'fresh', unsettled: 'unsettled' };

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
.eo-ss .ss-span:hover td{background:var(--app,#f4f5f7);}
.eo-ss input[type=range].ss-scrub{width:110px;accent-color:var(--ink,#15181e);cursor:pointer;height:4px;}
`;

export function mountSolarSystem(root, { nodes: inNodes = [], edges: inEdges = [], centreId = null, spans = [], count = 0, onPivot = null, onSelect = null, onOpen = null, onSpan = null, onFocus = null, focusId = null, countsLabel = '', width = 700, height = 470 } = {}) {
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

  // The regimes' bodies, partitioned off the sun's own tiers.
  const claims = nodes.filter((n) => n.tier === 2 && n !== sun);
  const bonded = nodes.filter((n) => n.tier === 1 && n !== sun);
  const sources = nodes.filter((n) => n.tier === 0 && n !== sun);
  const tally = count || spans.length || 0;

  // Meaning-level orbital mechanics — each claim gets its OWN period and phase (organic,
  // never a shared drift angle), computed once so the simulation never resets on re-render.
  // The sun is the root of this little system: its TRUE position is always (0,0); it's the
  // camera (placeMeaning) that moves when the meaning-level focus changes, never the bodies'
  // real motion — exactly a change of reference frame, not a re-layout.
  // Ring assignment: when a claim carries a STANDING (solarMeaningData's settledness read), the ring
  // IS the standing — firming inner, fresh middle, unsettled outer — so the orbit itself reads as
  // confidence. Absent that (the plain tieredData feed), fall back to the old even round-robin so the
  // component stays byte-identical for any caller not passing standing. Bodies sharing a ring are
  // fanned evenly in phase so a crowded standing band never stacks on one angle.
  // NESTED, not flat: a meaning body orbits its PARENT, not always the sun. When the feed carries a
  // hierarchy (solarMeaningData sets node.parent — the sun's standing claims and bonded figures are
  // planets around the sun; each figure's own claims are moons around it), the system reads as a real
  // sun · planets · moons descent. A feed that sets no parent (the plain tieredData ring) leaves every
  // body a direct child of the sun — a single flat ring, exactly what those callers always drew.
  const parentOf = (n) => { const p = n.parent; return (p && byId[p] && p !== n.id) ? p : sun.id; };
  const depthOf = (id) => { let d = 0, cur = byId[id];
    while (cur && cur.id !== sun.id && d < 8) { const p = parentOf(cur); if (p === cur.id) break; cur = byId[p]; d++; } return d; };
  const nestedMeaning = claims.some((n) => byId[parentOf(n)] && parentOf(n) !== sun.id);   // any moon ⇒ a real hierarchy
  const mOrbit = { [sun.id]: { parent: null, depth: 0, rx: 0, ry: 0, phase: 0, omega: 0 } };
  const hasStanding = claims.some((n) => n.standing != null && STANDING_RING[n.standing] != null);
  // Fan siblings (bodies sharing a parent) evenly in phase so a crowded parent never stacks them on
  // one angle; standing still chooses the ring for planets (firm inner · unsettled outer).
  const kids = {}; claims.forEach((n) => { const p = parentOf(n); (kids[p] || (kids[p] = [])).push(n); });
  Object.keys(kids).forEach((pid) => {
    const arr = kids[pid], pd = byId[pid] ? depthOf(pid) : 0;    // parent depth: 0 = the sun (wide planet rings), ≥1 = a planet (tight moon rings)
    arr.forEach((n, k) => {
      const ring = (hasStanding && STANDING_RING[n.standing] != null) ? STANDING_RING[n.standing] : (k % 3);
      const rx = pd === 0 ? (96 + ring * 62) : (24 + ring * 8);   // planets orbit the sun wide; moons hug their planet
      mOrbit[n.id] = {
        parent: pid, depth: pd + 1, rx, ry: rx * (pd === 0 ? 0.62 : 0.7),
        phase: (k / Math.max(1, arr.length)) * Math.PI * 2 + ring * 0.7,
        // moons run faster than planets (shorter period), like a real system
        omega: (Math.PI * 2) / ((pd === 0 ? 16 : 6) + (k % 5) * (pd === 0 ? 6 : 1.4) + ring * (pd === 0 ? 5 : 2)),
      };
    });
  });
  // A body's TRUE position is its parent's position plus its own orbital offset — recursion is what
  // makes the nesting real (a moon rides its planet, which rides the sun). Memoised per frame; the
  // provisional {0,0} write breaks any accidental cycle in malformed data instead of recursing forever.
  const trueOf = (id, t, cache) => {
    cache = cache || {};
    if (id in cache) return cache[id];
    const o = mOrbit[id];
    if (!o || o.parent == null) { cache[id] = { x: 0, y: 0 }; return cache[id]; }
    cache[id] = { x: 0, y: 0 };
    const par = trueOf(o.parent, t, cache), ang = o.phase + t * o.omega;
    return (cache[id] = { x: par.x + Math.cos(ang) * o.rx, y: par.y + Math.sin(ang) * o.ry });
  };

  const W = width, H = height, cx = W / 2, cy = H / 2;
  // depth is the continuous descent dial; the integer level is what we draw. Start at meaning (0).
  // mFocus is the meaning level's OWN camera anchor — separate from `sun` (the entity POV the
  // structure/existence levels and onPivot use), since re-anchoring onto a claim never fetches
  // new data, it just re-centres the same already-loaded bodies.
  const state = { depth: 0, level: 0, playing: true, simTime: 0, mFocus: (focusId && byId[focusId]) ? focusId : sun.id, sel: null };
  const pan = { x: 0, y: 0 };

  // ── shell ──────────────────────────────────────────────────────────────────
  const wrap = el('div', { class: 'eo-ss', role: 'region', 'aria-label': 'Solar view: one entity at the centre; zoom descends from meaning to structure to existence' });
  wrap.innerHTML =
    '<div style="border:1px solid var(--line,#e5e7eb);border-radius:12px;overflow:hidden;background:var(--card,#fff);">' +
    '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;border-bottom:1px solid var(--line,#e5e7eb);background:var(--app,#f7f8fb);">' +
      '<span class="ss-btn" style="cursor:default;color:var(--ink2,#555);">☉ EOGraph</span>' +
      '<button class="ss-btn" data-play title="Pause or resume the live orbit (meaning level)">❚❚ <span data-playlbl>drift</span></button>' +
      '<input class="ss-scrub" data-scrub type="range" min="0" max="' + SCRUB_MAX + '" step="0.1" value="0" title="Scrub the orbital simulation time by hand" aria-label="orbital time cursor">' +
      '<div style="display:flex;gap:5px;margin-left:auto;">' +
        '<button class="ss-btn" data-up title="Zoom out — ascend a level">−</button>' +
        '<button class="ss-btn" data-down title="Zoom in — descend a level toward the raw spans">+</button>' +
        '<button class="ss-btn" data-reset title="Back to the meaning level">⌖ top</button>' +
      '</div>' +
    '</div>' +
    '<div data-rail style="display:flex;align-items:center;gap:6px;padding:8px 12px;border-bottom:1px solid var(--line,#e5e7eb);flex-wrap:wrap;">' +
      '<span style="font-size:11px;color:var(--ink3,#999);letter-spacing:.04em;margin-right:2px;" title="One level on screen at a time — zoom, or click a level, to descend from meaning to the raw spans">zoom</span>' +
      LEVELS.map((L, i) => '<span class="ss-lvl" data-lvl="' + i + '" title="' + L.math + '" style="background:' + L.chipBg + ';color:' + L.chipFg + ';"><span class="gl">' + L.glyphs + '</span>' + L.key + ' <small>' + L.math + '</small></span>' + (i < LEVELS.length - 1 ? '<span style="color:var(--ink3,#bbb);font-size:11px;">›</span>' : '')).join('') +
    '</div>' +
    '<div style="position:relative;background:var(--card,#fff);background-image:radial-gradient(var(--line,#e5e7eb) 0.5px,transparent 0.5px);background-size:16px 16px;">' +
      '<svg data-svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block;touch-action:none;cursor:grab;">' +
        '<defs><radialGradient data-well cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#EF9F27" stop-opacity="0.13"/><stop offset="55%" stop-color="#EF9F27" stop-opacity="0.04"/><stop offset="100%" stop-color="#EF9F27" stop-opacity="0"/></radialGradient>' +
          '<marker data-marker markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L5,3 L0,6 Z" fill="#B4B2A9"/></marker></defs>' +
        '<g data-pan><g data-stage class="ss-stage"></g></g>' +
      '</svg>' +
      '<div data-tablewrap style="display:none;padding:14px 16px;overflow:auto;"></div>' +
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
  const tableWrap = wrap.querySelector('[data-tablewrap]');
  const detail = wrap.querySelector('[data-detail]'), countsEl = wrap.querySelector('[data-counts]');
  const playBtn = wrap.querySelector('[data-play]'), playLbl = wrap.querySelector('[data-playlbl]');

  // orbiters carry the live meaning-level bodies so the drift can re-place them each frame;
  // mEdges are the parent→child bond lines that must follow the same live motion.
  let orbiters = [], mEdges = [];

  // ── level 0 · meaning — a live orbital simulation, egocentric within itself too ─────────
  function renderMeaning(g) {
    g.appendChild(sv('rect', { x: cx - 260, y: cy - 190, width: 520, height: 380, fill: 'url(#' + uid + '-well)' }));
    g.appendChild(sv('circle', { 'data-focusring': '1', cx, cy, r: 30, fill: 'none', stroke: 'var(--ink3,#999)', 'stroke-opacity': 0.4, 'stroke-dasharray': '2 3' }));
    orbiters = []; mEdges = [];
    if (nestedMeaning) {
      // A real hierarchy: draw the parent→child bonds first (so bodies sit on top) and let them
      // follow the live orbit each frame — the same lines the reference system draws between a
      // planet and its moons. Orbit-guide ellipses are dropped here: with moving parents they'd be
      // stale decoration, and the bond lines already read the structure.
      claims.forEach((n) => {
        const pid = mOrbit[n.id] && mOrbit[n.id].parent; if (!pid || !byId[pid]) return;
        const line = sv('line', { stroke: 'var(--line2,#d3d5dc)', 'stroke-width': pid === sun.id ? 0.9 : 0.7, 'stroke-opacity': 0.75 });
        g.appendChild(line); mEdges.push({ line, parent: pid, child: n.id });
      });
    } else if (state.mFocus === sun.id) {
      // The flat ring (a feed with no hierarchy): the orbit-path guide is only geometrically honest
      // in the SUN's own frame — once the camera re-anchors onto a claim, a static ellipse would be
      // stale — so it draws only while the sun is centred, exactly as before.
      claims.forEach((n) => { const o = mOrbit[n.id];
        g.appendChild(sv('ellipse', { cx, cy, rx: o.rx, ry: o.ry, fill: 'none', stroke: LEVELS[0].fill, 'stroke-opacity': 0.22, 'stroke-dasharray': '2 5' })); });
    }
    orbiters.push({ id: sun.id, r: 14, ...drawSun(g, '☉', () => focusMeaning(sun.id)) });
    if (!claims.length) {
      g.appendChild(text(cx, cy + 70, 'no standing claims yet — its meaning ring is empty', { anchor: 'middle', size: 11.5, fill: '#8A8A95' }));
      placeMeaning(); return;
    }
    claims.forEach((n) => {
      const grp = sv('g', { class: 'ss-body' });
      // The claim's SPECTRUM shows in its very colour: the body is tinted by the MANNER of the act it
      // records (distinguishes/links/introduces), so a linking claim and a distinguishing one never
      // read the same at a glance. A claim carrying no operator falls back to the meaning tier's amber.
      const man = n.manner || (n.op ? mannerOf(n.op) : null);
      const pal = (man && MANNER_COLOR[man]) || LEVELS[0];
      const unsettled = n.standing === 'unsettled';
      const r = (mOrbit[n.id] && mOrbit[n.id].depth >= 2) ? 4 : 5.5;   // a moon reads a touch smaller than a planet
      const body = sv('circle', { r, fill: n.color || pal.fill, stroke: pal.stroke, 'stroke-width': 1.1 });
      // An unsettled claim (the record hedges or denies it) wears a broken outline — it has not
      // firmed. A firming one gets a faint corroboration halo. Both are silent unless the standing
      // read is present, so a plain feed draws the same bare bodies as before.
      if (unsettled) { body.setAttribute('stroke-dasharray', '2 2'); body.setAttribute('fill-opacity', '0.45'); }
      grp.appendChild(body);
      if (n.standing === 'firming') grp.appendChild(sv('circle', { r: r + 3, fill: 'none', stroke: pal.stroke, 'stroke-opacity': 0.28, 'stroke-width': 1 }));
      if (n.op || n.manner || n.standing) {
        const ti = sv('title', {});
        ti.textContent = [man, n.standing && STANDING_LABEL[n.standing]].filter(Boolean).join(' · ');
        grp.appendChild(ti);
      }
      grp.addEventListener('click', (ev) => { ev.stopPropagation(); focusMeaning(n.id); });
      g.appendChild(grp);
      const glyph = n.op ? glyphOf(n.op) + ' ' : '';
      const lab = text(0, 0, clip(glyph + n.label, 26), { anchor: 'start', size: 10.5, cls: 'ss-plabel' });
      g.appendChild(lab);
      orbiters.push({ id: n.id, grp, lab, r });
    });
    placeMeaning();
  }
  // Every body's TRUE position never changes with focus — only the camera offset (target) does, so
  // re-centring on a body makes its parent (and everything else) visibly move relative to it, exactly
  // as their real relative motion always was. One position cache per frame, shared by bodies, labels
  // and bond lines, so the recursion runs once per body.
  function placeMeaning() {
    const t = state.simTime, cache = {}, onSun = state.mFocus === sun.id;
    const target = trueOf(state.mFocus, t, cache);
    const scr = (id) => { const p = trueOf(id, t, cache); return { x: cx + (p.x - target.x), y: cy + (p.y - target.y) }; };
    const ring = stage.querySelector('[data-focusring]'); if (ring) ring.setAttribute('r', onSun ? 30 : 12);
    orbiters.forEach((o) => {
      const s = scr(o.id);
      o.grp.setAttribute('transform', 'translate(' + s.x.toFixed(1) + ',' + s.y.toFixed(1) + ')');
      if (o.id === sun.id) { o.lab.setAttribute('x', s.x.toFixed(1)); o.lab.setAttribute('y', (s.y - 26).toFixed(1)); o.lab.setAttribute('text-anchor', 'middle'); }
      else if (nestedMeaning) {
        // label rides outward from the parent, so a moon's name never lands under its planet
        const pid = mOrbit[o.id] && mOrbit[o.id].parent, ps = pid ? scr(pid) : { x: cx, y: cy };
        let dx = s.x - ps.x, dy = s.y - ps.y; const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
        const gap = (o.r || 6) + 9;
        o.lab.setAttribute('x', (s.x + dx * gap).toFixed(1)); o.lab.setAttribute('y', (s.y + dy * gap + 3.5).toFixed(1));
        o.lab.setAttribute('text-anchor', dx > 0.3 ? 'start' : (dx < -0.3 ? 'end' : 'middle'));
      } else { o.lab.setAttribute('x', (s.x + 9).toFixed(1)); o.lab.setAttribute('y', (s.y + 3.5).toFixed(1)); o.lab.setAttribute('text-anchor', 'start'); }
    });
    mEdges.forEach((e) => {
      const a = scr(e.parent), b = scr(e.child);
      e.line.setAttribute('x1', a.x.toFixed(1)); e.line.setAttribute('y1', a.y.toFixed(1));
      e.line.setAttribute('x2', b.x.toFixed(1)); e.line.setAttribute('y2', b.y.toFixed(1));
    });
  }
  // The meaning-level camera pivot: re-anchor to id, snap the frame immediately (even
  // paused), and mirror the usual selection detail so the footer still names what's focused.
  // onFocus fires BEFORE select()/onSelect() — a host that re-renders (and so remounts this
  // whole component) in response to selection needs the new focus id already in hand so the
  // next mount can seed `focusId` and keep the camera locked instead of snapping back to the sun.
  function focusMeaning(id) {
    state.mFocus = id; placeMeaning();
    if (onFocus) { try { onFocus(id); } catch { /* best-effort */ } }
    const n = byId[id]; if (n) select(n);
  }

  // ── level 1 · structure — the chemistry of bonds, read as a DAG ─────────────
  // rank = BFS hops from the sun over the REAL bond edges among sun+bonded (not just the
  // sun's own direct ties) — a figure reached only THROUGH another bonded figure rings one
  // band further out, so a genuine chain reads as a chain instead of a false single ring.
  // Every real bond draws, sun-adjacent or not, each wearing an arrowhead + its glyph.
  function renderStructure(g) {
    drawSun(g, '◈');
    if (!bonded.length) { g.appendChild(text(cx, cy + 70, 'no bonds read yet — nothing to build a structure from', { anchor: 'middle', size: 11.5, fill: '#8A8A95' })); return; }
    const ids = new Set([sun.id, ...bonded.map((n) => n.id)]);
    const structEdges = edges.filter((e) => e.tier === 1 && ids.has(e.a) && ids.has(e.b));
    const adj = {}; ids.forEach((id) => adj[id] = []);
    structEdges.forEach((e) => { adj[e.a].push(e.b); adj[e.b].push(e.a); });
    const rank = new Map([[sun.id, 0]]), bq = [sun.id];
    while (bq.length) { const id = bq.shift(); for (const nb of adj[id]) if (!rank.has(nb)) { rank.set(nb, rank.get(id) + 1); bq.push(nb); } }
    bonded.forEach((n) => { if (!rank.has(n.id)) rank.set(n.id, 1); });   // unreached (shouldn't happen) still rings at 1
    const byRank = new Map();
    bonded.forEach((n) => { const r = rank.get(n.id); if (!byRank.has(r)) byRank.set(r, []); byRank.get(r).push(n); });
    const rings = [...byRank.keys()].sort((a, b) => a - b);
    const pos = { [sun.id]: { x: cx, y: cy, a: 0 } };
    const meanAng = (id) => { const ns = adj[id].filter((x) => pos[x]);
      if (!ns.length) return 0; let sx = 0, sy = 0; ns.forEach((x) => { sx += Math.cos(pos[x].a); sy += Math.sin(pos[x].a); }); return Math.atan2(sy, sx); };
    rings.forEach((r, ri) => {
      const arr = byRank.get(r), n = arr.length, R = Math.min(cy - 24, 88 + ri * 70);
      arr.sort((a, b) => meanAng(a.id) - meanAng(b.id));
      arr.forEach((nd, k) => { const ang = ri * 0.6 + (k / n) * Math.PI * 2; pos[nd.id] = { x: cx + Math.cos(ang) * R, y: cy + Math.sin(ang) * R * 0.86, a: ang }; });
    });
    structEdges.forEach((e) => {
      const A = pos[e.a], B = pos[e.b]; if (!A || !B) return;
      const line = { x1: A.x.toFixed(1), y1: A.y.toFixed(1), x2: B.x.toFixed(1), y2: B.y.toFixed(1), stroke: LEVELS[1].fill, 'stroke-opacity': 0.42, 'stroke-width': 1.1, 'marker-end': 'url(#' + mk + ')' };
      if (e.dashed) line['stroke-dasharray'] = '3 4';
      g.appendChild(sv('line', line));
      if (e.gl) g.appendChild(text((A.x + B.x) / 2, (A.y + B.y) / 2, e.gl, { anchor: 'middle', size: 11, cls: 'ss-glyph', fill: LEVELS[1].stroke }));
    });
    bonded.forEach((nd) => {
      const p = pos[nd.id]; if (!p) return;
      const s = 7, grp = sv('g', { class: 'ss-body' });
      grp.appendChild(sv('path', { d: 'M0,' + (-s) + ' L' + s + ',0 L0,' + s + ' L' + (-s) + ',0 Z', fill: nd.color || LEVELS[1].fill, stroke: LEVELS[1].stroke, 'stroke-width': 1.2 }));
      grp.setAttribute('transform', 'translate(' + p.x.toFixed(1) + ',' + p.y.toFixed(1) + ')');
      grp.addEventListener('click', (ev) => { ev.stopPropagation(); clickBody(nd); });
      g.appendChild(grp);
      const left = p.x < cx;
      g.appendChild(text(p.x + (left ? -11 : 11), p.y + 3.5, clip(nd.label, 22), { anchor: left ? 'end' : 'start', size: 10.5, cls: 'ss-plabel' }));
    });
  }

  // ── level 2 · existence — a literal table over the raw substrate, not a diagram ─────
  // Existence is what structure's bonds are read from: a tally (how many bonds, claims,
  // mentions) sitting directly above the rows it's a count OF — a number with nothing under
  // it is unverifiable, and spans with no tally is untotalled, so both render together.
  function renderExistence(container) {
    const stats = [['mentions', tally], ['bonds', bonded.length], ['claims', claims.length], ['sources', Math.max(1, sources.length)]];
    const statsHtml = stats.map(([label, v]) =>
      '<span style="display:inline-flex;flex-direction:column;align-items:center;gap:2px;padding:6px 16px;border-radius:8px;background:' + LEVELS[2].chipBg + ';color:' + LEVELS[2].chipFg + ';min-width:60px;">' +
      '<b style="font-family:var(--mono,ui-monospace,monospace);font-size:16px;">' + v + '</b>' +
      '<span style="font-size:9.5px;color:#8A8A95;">' + esc(label) + '</span></span>').join('');
    let rowsHtml;
    if (!spans.length) {
      rowsHtml = '<tr><td colspan="2" style="padding:20px 10px;color:#8A8A95;text-align:center;font-size:11.5px;">no raw spans on record for this entity</td></tr>';
    } else {
      rowsHtml = spans.map((sp, i) =>
        '<tr' + (onSpan ? ' class="ss-span" style="cursor:pointer;"' : '') + ' data-span-idx="' + i + '">' +
        '<td style="font-family:var(--mono,ui-monospace,monospace);color:' + LEVELS[2].stroke + ';padding:7px 10px;white-space:nowrap;vertical-align:top;">¶' + esc(sp.idx != null ? sp.idx : i) + '</td>' +
        '<td style="padding:7px 10px;color:var(--ink,#15181e);">' + esc(sp.text) + '</td>' +
        '</tr>').join('');
    }
    container.innerHTML =
      '<div style="text-align:center;font-weight:500;padding:2px 0 10px;">' + esc(sun.label) + '</div>' +
      '<div style="display:flex;justify-content:center;gap:10px;flex-wrap:wrap;padding-bottom:16px;">' + statsHtml + '</div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:12.5px;">' +
      '<caption style="text-align:left;font-size:11px;color:#8A8A95;padding-bottom:8px;">the raw sentences ' + esc(sun.label) + ' was read from</caption>' +
      '<thead><tr>' +
        '<th scope="col" style="text-align:left;font-size:10.5px;font-weight:600;color:#8A8A95;border-bottom:1px solid var(--line,#e5e7eb);padding:6px 10px;">¶</th>' +
        '<th scope="col" style="text-align:left;font-size:10.5px;font-weight:600;color:#8A8A95;border-bottom:1px solid var(--line,#e5e7eb);padding:6px 10px;">span</th>' +
      '</tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table>';
    if (onSpan) {
      container.querySelectorAll('[data-span-idx]').forEach((tr) => {
        tr.addEventListener('click', () => { try { onSpan(spans[+tr.dataset.spanIdx]); } catch { /* best-effort */ } });
      });
    }
  }

  // onClick defaults to the structure level's plain clickBody (inspect only — the sun can't
  // pivot to itself); renderMeaning passes its own live camera-reframe instead. Returns the
  // body + label refs so a caller that moves its own sun (renderMeaning) can reposition them.
  function drawSun(g, glyph, onClick) {
    const grp = sv('g', { class: 'ss-body' });
    grp.appendChild(sv('circle', { r: 22, fill: SUN.fill, opacity: 0.35 }));
    grp.appendChild(sv('circle', { r: 14, fill: SUN.fill, stroke: SUN.stroke, 'stroke-width': 2 }));
    grp.appendChild(text(0, 5, glyph, { anchor: 'middle', size: 14, cls: 'ss-glyph', fill: SUN.stroke }));
    grp.setAttribute('transform', 'translate(' + cx + ',' + cy + ')');
    grp.addEventListener('click', (ev) => { ev.stopPropagation(); (onClick || (() => clickBody(sun)))(); });
    g.appendChild(grp);
    const lab = text(cx, cy - 26, clip(sun.label, 30), { anchor: 'middle', size: 12, cls: 'ss-plabel' });
    g.appendChild(lab);
    return { grp, lab };
  }
  function text(x, y, s, { anchor = 'start', size = 11, fill = 'var(--ink,#15181e)', cls = '' } = {}) {
    const t = sv('text', { x: x.toFixed ? x.toFixed(1) : x, y: y.toFixed ? y.toFixed(1) : y, 'text-anchor': anchor, 'font-size': size, fill });
    if (cls) t.setAttribute('class', cls); t.textContent = s; return t;
  }

  // ── the descent: swap the level, cross-fading, and light the rail ───────────
  function renderLevel() {
    stage.innerHTML = ''; orbiters = [];
    const isTable = state.level === 2;
    svg.style.display = isTable ? 'none' : '';
    tableWrap.style.display = isTable ? 'block' : 'none';
    if (state.level === 0) renderMeaning(stage);
    else if (state.level === 1) renderStructure(stage);
    else renderExistence(tableWrap);
    wrap.querySelectorAll('[data-lvl]').forEach((c) => c.classList.toggle('off', +c.dataset.lvl !== state.level));
    const L = LEVELS[state.level];
    const trail = LEVELS.map((x, i) => i === state.level ? x.key : '·').join(' ');
    // On the meaning level, the footer's resting state is the SPECTRUM KEY — the manners actually
    // present in this ring (never the ones that aren't, so a one-manner figure reads honestly) plus
    // the orbit's own legend (firm claims inner, unsettled outer). Elsewhere it's the plain descent hint.
    const present = [...new Set(claims.map((n) => n.manner || (n.op ? mannerOf(n.op) : null)).filter((m) => MANNER_COLOR[m]))];
    const anyStanding = claims.some((n) => n.standing != null && STANDING_RING[n.standing] != null);
    const tail = (state.level === 0 && (present.length || anyStanding))
      ? '<span style="display:inline-flex;align-items:center;gap:9px;margin-left:6px;font-size:11px;color:var(--ink3,#999);flex-wrap:wrap;">'
          + present.map((m) => '<span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:8px;height:8px;border-radius:50%;flex:0 0 auto;background:' + MANNER_COLOR[m].fill + ';display:inline-block;"></span>' + esc(m) + '</span>').join('')
          + (anyStanding ? '<span style="color:var(--line2,#ccc);">|</span><span>firm inner · unsettled outer</span>' : '')
        + '</span>'
      : '<span style="color:var(--ink3,#999);margin-left:6px;">— zoom to descend</span>';
    detail.innerHTML = state.sel ? detail.innerHTML :
      '<span style="width:14px;height:14px;flex:0 0 auto;border-radius:4px;background:' + L.fill + ';display:inline-block;"></span>' +
      '<span style="color:var(--ink,#15181e);font-weight:600;">' + esc(L.key) + '</span>' +
      '<span style="color:var(--ink3,#999);">' + esc(L.math) + '</span>' +
      '<span style="color:var(--ink3,#bbb);font-family:var(--mono,monospace);font-size:11px;">' + esc(trail) + '</span>' +
      tail;
    // a quick fade for the swap
    const fading = isTable ? tableWrap : stage;
    fading.style.opacity = '0.35'; requestAnimationFrame(() => { fading.style.opacity = '1'; });
  }
  function setLevel(l, keepSel) {
    l = Math.max(0, Math.min(LEVELS.length - 1, l | 0));
    if (l === state.level) return;
    state.level = l; state.depth = l;
    if (!keepSel) { state.sel = null; }
    renderLevel();
  }

  // ── body click: pivot immediately, or select-in-place when there's nowhere to pivot ────────
  // A click IS the pivot — no button gated behind it: an entity other than the sun becomes
  // the new centre right away; a claim, or the sun clicking itself, has no POV to pivot TO,
  // so it just selects in place.
  function clickBody(n) {
    if (onPivot && n.kind === 'entity' && n.ref && n.id !== sun.id) onPivot(n);
    else select(n);
  }
  function select(n) {
    state.sel = n.id;
    const L = LEVELS[state.level];
    const g0 = edges.filter((e) => e.b === n.id).map((e) => e.gl).join(' ') || '—';
    const g1 = edges.filter((e) => e.a === n.id).map((e) => e.gl).join(' ') || '—';
    // A selected claim names its manner (what KIND of act) and its standing (how firmly the record
    // holds it) in words — the spectrum + drift, said plainly, next to the raw in/out glyph tally.
    const man = n.manner || (n.op ? mannerOf(n.op) : null);
    const pal = (man && MANNER_COLOR[man]) || null;
    const mannerChip = man ? '<span style="display:inline-flex;align-items:center;gap:4px;white-space:nowrap;"><span style="width:8px;height:8px;border-radius:50%;flex:0 0 auto;background:' + (pal ? pal.fill : '#999') + ';display:inline-block;"></span>' + esc(man) + '</span>' : '';
    const standChip = (n.standing && STANDING_LABEL[n.standing])
      ? '<span style="white-space:nowrap;color:' + (n.standing === 'unsettled' ? 'var(--ink3,#999)' : 'var(--ink2,#555)') + ';">' + esc(STANDING_LABEL[n.standing]) + '</span>' : '';
    detail.innerHTML = '<span style="width:14px;height:14px;flex:0 0 auto;border-radius:4px;background:' + L.fill + ';display:inline-block;"></span>' +
      '<span style="color:var(--ink,#15181e);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:30%;">' + esc(n.label) + '</span>' +
      mannerChip + standChip +
      '<span style="color:var(--ink2,#555);white-space:nowrap;">in <span style="font-size:14px;font-family:var(--mono,monospace);">' + esc(g0) + '</span></span>' +
      '<span style="color:var(--ink2,#555);white-space:nowrap;">out <span style="font-size:14px;font-family:var(--mono,monospace);">' + esc(g1) + '</span></span>';
    if (onOpen && n.ref) {
      const b = el('button', { class: 'ss-btn', text: 'open →' }); b.style.marginLeft = 'auto'; b.style.flex = '0 0 auto';
      b.addEventListener('click', () => onOpen(n)); detail.appendChild(b);
    }
    if (onSelect) { try { onSelect(n); } catch { /* mirror is best-effort */ } }
  }

  // ── level rail + steppers ────────────────────────────────────────────────────
  wrap.querySelectorAll('[data-lvl]').forEach((c) => c.addEventListener('click', () => setLevel(+c.dataset.lvl)));
  wrap.querySelector('[data-down]').addEventListener('click', () => setLevel(state.level + 1));
  wrap.querySelector('[data-up]').addEventListener('click', () => setLevel(state.level - 1));
  wrap.querySelector('[data-reset]').addEventListener('click', () => { pan.x = pan.y = 0; applyPan(); state.mFocus = sun.id; if (onFocus) { try { onFocus(sun.id); } catch { /* best-effort */ } } setLevel(0); if (state.level === 0) renderLevel(); });

  // ── the live orbital simulation — always runs while playing, never just while you watch:
  // placeMeaning() is a harmless no-op away from the meaning level (no orbiters mounted), so
  // returning to it later shows time having genuinely passed, not a diorama that only moved
  // while you looked at it. ──────────────────────────────────────────────────────────────
  // A caller embedding this in a framework panel may never get a reliable destroy() call —
  // an inline ref callback's identity can change on every parent re-render, firing a null
  // call that means nothing about the DOM actually going away. So the loop checks its OWN
  // connectedness rather than trusting an external teardown signal: once `root` is genuinely
  // removed from the document, isConnected goes false and the loop lets itself lapse instead
  // of running forever against an orphaned subtree.
  let raf = null, last = 0;
  function tick(t) {
    if (!root.isConnected) { raf = null; return; }
    if (!last) last = t; const dt = Math.min(0.05, (t - last) / 1000); last = t;
    if (state.playing) { state.simTime += dt; placeMeaning(); scrubEl.value = (state.simTime % SCRUB_MAX).toFixed(1); }
    raf = requestAnimationFrame(tick);
  }
  function setPlay(on) { state.playing = on; playBtn.firstChild.textContent = on ? '❚❚ ' : '▶ '; playLbl.textContent = on ? 'drift' : 'parked'; }
  playBtn.addEventListener('click', () => setPlay(!state.playing));
  const scrubEl = wrap.querySelector('[data-scrub]');
  // Dragging the time cursor by hand pauses autoplay — same convention as the tiered graph's
  // own fold cursor — and snaps the meaning level to that instant immediately.
  scrubEl.addEventListener('input', () => {
    if (state.playing) setPlay(false);
    state.simTime = +scrubEl.value;
    if (state.level === 0) placeMeaning();
  });

  // ── pan (translate only) + wheel = semantic descend/ascend ──────────────────
  function applyPan() { panG.setAttribute('transform', 'translate(' + pan.x.toFixed(1) + ',' + pan.y.toFixed(1) + ')'); }
  let drag = null;
  // A pointerdown that lands on a body (the sun, a claim, a bonded figure) must reach THAT
  // body's own click handler untouched — capturing the pointer here regardless of target (the
  // reported "clicking a node doesn't do anything") retargets the resulting click to the svg
  // itself per the pointer-capture spec, so the body's own listener never fires. Only a
  // pointerdown that starts on open canvas begins a pan.
  svg.addEventListener('pointerdown', (e) => {
    if (e.target.closest && e.target.closest('.ss-body')) return;
    drag = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }; svg.style.cursor = 'grabbing'; svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove', (e) => { if (!drag) return; const r = svg.getBoundingClientRect(), sc = W / r.width; pan.x = drag.px + (e.clientX - drag.x) * sc; pan.y = drag.py + (e.clientY - drag.y) * sc; applyPan(); });
  svg.addEventListener('pointerup', () => { drag = null; svg.style.cursor = 'grab'; });
  let wheelAcc = 0;
  svg.addEventListener('wheel', (e) => { e.preventDefault(); wheelAcc += e.deltaY; if (Math.abs(wheelAcc) < 60) return;
    const dir = wheelAcc > 0 ? 1 : -1; wheelAcc = 0; setLevel(state.level + dir); }, { passive: false });

  renderLevel(); setPlay(true); raf = requestAnimationFrame(tick);
  if (onSelect) { try { onSelect(sun); } catch { /* best-effort */ } }
  void countsEl;

  return {
    destroy() { if (raf) cancelAnimationFrame(raf); wrap.remove(); },
    // Lets a host drive the meaning-level camera from OUTSIDE the SVG (e.g. a "pivot to" chip in
    // an external detail panel) using the exact same lock-at-centre pivot a body click does.
    focus(id) { if (byId[id] && state.level === 0) focusMeaning(id); },
  };
}

// ── mountSolarExplorer ─────────────────────────────────────────────────────────────────────
// A full-screen, immersive presentation of the SAME live orbital system mountSolarSystem draws —
// same nodes/edges, same click-to-centre mechanics, same data — for a host whose trigger (a small
// embedded "Explore ›" card, say) wants the meaning map to open into its own dedicated space
// instead of staying cramped inline. It does not reimplement the orbit: it mounts a normal
// mountSolarSystem instance inside a dark full-viewport shell and dark-themes it for free by
// overriding the SAME CSS custom properties mountSolarSystem's own markup already reads
// (var(--card), var(--ink), var(--line), var(--app), …) rather than duplicating any of its rules.
// The one thing it adds beyond the embedded card: a bottom sheet the HOST populates via
// `renderDetail(node, onPivot)` whenever the live selection changes — solar-system.js stays
// domain-ignorant (it only knows nodes/edges/tiers), so a claim's witnessing sources and quoted
// text, which live in the host's own ledger, are the host's to render, not this file's to fake.
// Appended straight to `doc.body`, mirroring this app's one other full-viewport overlay
// (rooms/reader/pipeline-surface.js) — same z-index idiom, same "an explicit button is the only
// way out" convention (no Escape/backdrop-click here either, for consistency with that surface).
const MX_STYLE_ID = 'eo-mx-style';
const MX_CSS = `
.eo-mx-overlay{position:fixed;inset:0;z-index:2147482850;display:flex;flex-direction:column;background:radial-gradient(120% 90% at 50% 38%,#14131f 0%,#0b0b12 62%,#08080e 100%);color:#eceaf5;font-family:var(--sans,system-ui,sans-serif);}
.eo-mx-head{flex:none;display:flex;align-items:center;gap:12px;padding:16px 18px;}
.eo-mx-close{flex:none;width:32px;height:32px;border-radius:9px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:#cfc9ee;cursor:pointer;font-size:15px;line-height:1;}
.eo-mx-close:hover{background:rgba(255,255,255,0.14);}
.eo-mx-titles{flex:1;min-width:0;}
.eo-mx-kicker{font-size:10px;font-weight:700;letter-spacing:1.4px;color:#8b83c9;}
.eo-mx-title{font-size:13.5px;font-weight:600;color:#f6f4fc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;}
.eo-mx-body{flex:1;min-height:0;position:relative;display:flex;align-items:flex-start;justify-content:center;padding:0 18px 18px;overflow:auto;}
.eo-mx-stage{--card:#0d0d15;--app:#14131f;--ink:#eceaf5;--ink2:#b8b3d6;--ink3:#7c779e;--line:#242a35;--line2:#2c2a3d;width:100%;max-width:760px;}
.eo-mx-sheet{flex:none;max-height:44%;overflow-y:auto;background:rgba(18,16,26,0.97);border-top:1px solid rgba(255,255,255,0.09);border-radius:20px 20px 0 0;box-shadow:0 -14px 46px rgba(0,0,0,0.5);}
.eo-mx-sheetBody{padding:16px 20px 24px;}
.eo-mx-sheetHead{display:flex;align-items:center;gap:10px;}
.eo-mx-dot{width:13px;height:13px;border-radius:50%;flex:none;box-shadow:0 0 12px currentColor;}
.eo-mx-sheetLabel{font-size:15.5px;font-weight:600;color:#f6f4fc;flex:1;min-width:0;}
.eo-mx-about{font-size:13px;line-height:1.55;color:#c7c2e0;margin-top:10px;}
.eo-mx-pivotLabel,.eo-mx-srcLabel{display:block;font-size:9.5px;font-weight:700;letter-spacing:0.8px;color:#6f6a90;margin:15px 0 8px;}
.eo-mx-pivotRow{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px;}
.eo-mx-pivotChip{flex:none;display:flex;align-items:center;gap:7px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:7px 12px;cursor:pointer;font-family:inherit;font-size:12px;color:#d8d3ef;}
.eo-mx-pivotChip:hover{background:rgba(255,255,255,0.09);}
.eo-mx-pivotChip::before{content:'';width:8px;height:8px;border-radius:50%;background:var(--pv-color,#D7D2F2);flex:none;}
.eo-mx-srcList{display:flex;flex-direction:column;gap:9px;}
.eo-mx-srcRow{display:block;width:100%;text-align:left;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:10px 12px;cursor:pointer;font-family:inherit;color:inherit;}
.eo-mx-srcRow:hover{background:rgba(255,255,255,0.06);}
.eo-mx-srcId{font-family:var(--mono,ui-monospace,monospace);font-size:10px;font-weight:600;color:#a99bff;background:rgba(124,116,230,0.15);padding:2px 7px;border-radius:5px;margin-right:8px;}
.eo-mx-srcHost{font-family:var(--mono,ui-monospace,monospace);font-size:11px;color:#7e79a0;}
.eo-mx-srcQuote{font-size:12.5px;line-height:1.5;color:#d9d5ec;margin-top:6px;}
`;

export function mountSolarExplorer(doc, { title = 'Meaning', subtitle = '', onClose = null, renderDetail = null, onSelect: userOnSelect = null, ...ssOpts } = {}) {
  if (!doc.getElementById(MX_STYLE_ID)) {
    const st = doc.createElement('style'); st.id = MX_STYLE_ID; st.textContent = MX_CSS; doc.head.appendChild(st);
  }
  const mk = (t, cls) => { const e = doc.createElement(t); if (cls) e.className = cls; return e; };

  const overlay = mk('div', 'eo-mx-overlay');
  overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-label', title);

  const head = mk('div', 'eo-mx-head');
  const closeBtn = mk('button', 'eo-mx-close'); closeBtn.textContent = '←'; closeBtn.setAttribute('aria-label', 'Close ' + title);
  head.appendChild(closeBtn);
  const titles = mk('div', 'eo-mx-titles');
  const kicker = mk('div', 'eo-mx-kicker'); kicker.textContent = title.toUpperCase(); titles.appendChild(kicker);
  if (subtitle) { const tt = mk('div', 'eo-mx-title'); tt.textContent = subtitle; titles.appendChild(tt); }
  head.appendChild(titles);
  overlay.appendChild(head);

  const body = mk('div', 'eo-mx-body');
  const stageHost = mk('div', 'eo-mx-stage');
  body.appendChild(stageHost);
  overlay.appendChild(body);

  const sheet = mk('div', 'eo-mx-sheet'); sheet.style.display = 'none';
  overlay.appendChild(sheet);

  const showDetail = (node) => {
    if (!renderDetail || !node) { sheet.style.display = 'none'; return; }
    sheet.innerHTML = '';
    sheet.appendChild(renderDetail(node, (id) => { if (ssHandle) ssHandle.focus(id); }));
    sheet.style.display = '';
  };

  const ssHandle = mountSolarSystem(stageHost, {
    ...ssOpts, width: 760, height: 560,
    onSelect: (node) => { if (userOnSelect) { try { userOnSelect(node); } catch { /* best-effort */ } } showDetail(node); },
  });

  const close = () => {
    try { ssHandle.destroy(); } catch { /* best-effort */ }
    overlay.remove();
    if (onClose) { try { onClose(); } catch { /* best-effort */ } }
  };
  closeBtn.addEventListener('click', close);

  doc.body.appendChild(overlay);
  return { close, destroy: close };
}
