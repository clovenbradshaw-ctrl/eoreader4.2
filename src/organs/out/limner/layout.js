// EO: SYN(Lens → Field, Composing) — deterministic layout engine
// organs/out/limner/layout.js — the deterministic layout engine.
//
// The whole point of LIMNER (docs/limner.md §1, §8): the model never sees a
// coordinate. Geometry is a property of THIS code, computed as a pure function
// of (spec, config). Same spec + same config ⇒ byte-identical geometry ⇒
// byte-identical SVG ⇒ a stable content address (render_hash). That determinism
// is the contract every engine here must honour:
//
//   - no Date.now / Math.random — randomness, where a force layout needs it to
//     break symmetry, comes from a seeded PRNG keyed on the spec's node ids;
//   - a fixed iteration count (no convergence test that could vary);
//   - coordinates QUANTIZED to a fixed precision, so float-format drift across
//     engines cannot change the bytes.
//
// One engine per kind (docs/limner.md §8). The output is a GeometricView the
// renderer stamps:
//   { width, height, kind, nodes:[{id,ref,label,role,x,y,r,salience}],
//     edges:[{...,x1,y1,x2,y2}], regions:[{id,kind,label,hull:[[x,y]]}],
//     annotations:[{target,text,x,y}] }

const W = 720, H = 520, PAD = 48;
const R_MIN = 7, R_MAX = 26;        // node radius range, driven by salience
const QUANT = 100;                  // 2-decimal quantization

const quant = (x) => Math.round(x * QUANT) / QUANT;
const lerp = (a, b, t) => a + (b - a) * t;
const radiusOf = (salience) => lerp(R_MIN, R_MAX, Math.max(0, Math.min(1, salience || 0)));

// mulberry32 — a tiny deterministic PRNG. Seeded from the node ids so the same
// spec always jitters the same way; this is what keeps a "force" layout (which
// needs a symmetry-breaking nudge) reproducible.
const seededRng = (seed) => {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const seedFrom = (spec) => {
  let h = 0x811c9dc5;
  for (const n of spec.nodes || []) {
    const s = String(n.ref);
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h >>> 0;
};

// layout(spec, config) → GeometricView. Dispatches on kind, honouring the
// layout_hint where a kind supports more than one engine (graph: force|layered).
export const layout = (spec, config = {}) => {
  const kind = spec?.kind || 'graph';
  switch (kind) {
    case 'timeline': return layoutTimeline(spec);
    case 'void_map': return layoutVoidMap(spec);
    case 'path':     return layoutPath(spec);
    case 'graph':
    default:
      return spec.layout_hint === 'layered' ? layoutLayered(spec) : layoutForce(spec);
  }
};

// Shared: resolve edge endpoints to node centres and finalize the view. A
// layout may pass `dims` to size the canvas to the figure (layered DAGs grow
// with their column/row counts instead of smudging into a fixed frame).
const finalize = (kind, nodes, spec, regions = [], annotations = [], dims = null) => {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const edges = (spec.edges || [])
    .map(e => {
      const a = byId.get(e.source), b = byId.get(e.target);
      if (!a || !b) return null;
      return { source: e.source, target: e.target, operator: e.operator, weight: e.weight,
        label: e.label, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    })
    .filter(Boolean);
  return Object.freeze({
    width: dims ? dims.width : W, height: dims ? dims.height : H, kind,
    nodes: Object.freeze(nodes),
    edges: Object.freeze(edges),
    regions: Object.freeze(regions),
    annotations: Object.freeze(annotations.map(a => {
      const n = byId.get(a.target);
      return Object.freeze({ target: a.target, text: a.text, x: n ? n.x : W / 2, y: n ? n.y - (n.r + 6) : H / 2 });
    })),
  });
};

const baseNode = (n) => ({
  id: n.id, ref: n.ref, label: n.label, role: n.role,
  salience: n.salience, r: quant(radiusOf(n.salience)),
});

// ── graph · force (seeded spring/charge relaxation) ───────────────────────────
const layoutForce = (spec) => {
  const rng = seededRng(seedFrom(spec));
  const cx = W / 2, cy = H / 2;
  const N = spec.nodes.length;
  const nodes = spec.nodes.map((n, i) => {
    const a = (i / Math.max(1, N)) * Math.PI * 2;
    const jr = 1 + rng() * 0.001;   // tiny seeded jitter breaks exact symmetry
    return { ...baseNode(n),
      x: cx + Math.cos(a) * 170 * jr, y: cy + Math.sin(a) * 150 * jr, vx: 0, vy: 0 };
  });
  const byId = new Map(nodes.map(n => [n.id, n]));
  const links = (spec.edges || [])
    .map(e => ({ a: byId.get(e.source), b: byId.get(e.target), w: e.weight || 0 }))
    .filter(l => l.a && l.b && l.a !== l.b);

  const ITER = 320, CHARGE = 2600, SPRING = 0.012, REST = 90, GRAVITY = 0.012;
  for (let it = 0; it < ITER; it++) {
    const cool = 1 - it / ITER;
    // repulsion (charge)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let d2 = dx * dx + dy * dy; if (d2 < 1) d2 = 1;
        const f = CHARGE / d2;
        const d = Math.sqrt(d2);
        const fx = (dx / d) * f, fy = (dy / d) * f;
        a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
      }
    }
    // attraction (springs), stiffer for heavier edges
    for (const l of links) {
      const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = SPRING * (1 + l.w) * (d - REST);
      const fx = (dx / d) * f, fy = (dy / d) * f;
      l.a.vx += fx; l.a.vy += fy; l.b.vx -= fx; l.b.vy -= fy;
    }
    // gravity to centre + integrate with cooling
    for (const n of nodes) {
      n.vx += (cx - n.x) * GRAVITY; n.vy += (cy - n.y) * GRAVITY;
      n.x += n.vx * cool * 0.5; n.y += n.vy * cool * 0.5;
      n.vx *= 0.85; n.vy *= 0.85;
      n.x = Math.max(PAD, Math.min(W - PAD, n.x));
      n.y = Math.max(PAD, Math.min(H - PAD, n.y));
    }
  }
  for (const n of nodes) { n.x = quant(n.x); n.y = quant(n.y); delete n.vx; delete n.vy; }
  return finalize('graph', nodes.map(Object.freeze), spec, [], spec.annotations);
};

// ── graph · layered (a proper DAG read: columns = longest distance from a
// root, rows ordered by neighbour barycentre so edges cross as little as
// possible, canvas sized to the figure) ───────────────────────────────────────
const layoutLayered = (spec) => {
  const ids = spec.nodes.map(n => n.id);
  const adj = new Map(ids.map(id => [id, []]));
  const radj = new Map(ids.map(id => [id, []]));
  for (const e of spec.edges || []) {
    if (adj.has(e.source) && adj.has(e.target) && e.source !== e.target) {
      adj.get(e.source).push(e.target); radj.get(e.target).push(e.source);
    }
  }

  // A figure with no bonds is not a root of anything — piling it into column 0
  // fakes structure. The DAG holds the linked figures; the unlinked ones sit in
  // their own strip underneath, present but not pretending to be upstream.
  const isolated = spec.nodes.filter(n => !adj.get(n.id).length && !radj.get(n.id).length);
  const isoSet = new Set(isolated.map(n => n.id));
  const linked = spec.nodes.filter(n => !isoSet.has(n.id));

  // Layer = longest distance from a root (in-degree-0). BFS over the DAG; cycles
  // fall back to source-order so a non-DAG still lays out deterministically.
  const layerOf = new Map();
  const roots = linked.map(n => n.id).filter(id => radj.get(id).length === 0);
  const queue = (roots.length ? roots : linked.map(n => n.id)).map(id => [id, 0]);
  let guard = 0, MAX = ids.length * ids.length + 1;
  while (queue.length && guard++ < MAX) {
    const [id, L] = queue.shift();
    if ((layerOf.get(id) ?? -1) >= L) continue;
    layerOf.set(id, L);
    for (const t of adj.get(id) || []) queue.push([t, L + 1]);
  }
  for (const n of linked) if (!layerOf.has(n.id)) layerOf.set(n.id, 0);

  const layers = new Map();
  for (const n of linked) {
    const L = layerOf.get(n.id);
    if (!layers.has(L)) layers.set(L, []);
    layers.get(L).push(n);
  }
  const cols = [...layers.keys()].sort((a, b) => a - b);

  // Crossing reduction: two barycentre sweeps (left→right pulling each node
  // toward its in-neighbours' rows, then right→left toward its out-neighbours').
  // Pure array work — deterministic, ties broken by prior order.
  const rowOf = new Map();
  cols.forEach(L => layers.get(L).forEach((n, i) => rowOf.set(n.id, i)));
  const bary = (n, nbrs) => {
    const ys = (nbrs.get(n.id) || []).map(m => rowOf.get(m)).filter(y => y != null);
    return ys.length ? ys.reduce((s, y) => s + y, 0) / ys.length : rowOf.get(n.id);
  };
  const sweep = (order, nbrs) => {
    for (const L of order) {
      const scored = layers.get(L).map((n, i) => [n, bary(n, nbrs), i]);
      scored.sort((a, b) => (a[1] - b[1]) || (a[2] - b[2]));
      const sorted = scored.map(s => s[0]);
      layers.set(L, sorted);
      sorted.forEach((n, i) => rowOf.set(n.id, i));
    }
  };
  sweep(cols, radj);
  sweep([...cols].reverse(), adj);

  // Size the canvas to the DAG, not the DAG to the canvas: a wide or deep
  // figure gets room instead of a smudge (the host scales it responsively).
  const maxRows = cols.reduce((m, L) => Math.max(m, layers.get(L).length), 1);
  const width = Math.max(W, PAD * 2 + (cols.length - 1) * 150);
  const dagH = linked.length ? Math.max(300, PAD * 2 + maxRows * 54) : 0;
  const colW = (width - 2 * PAD) / Math.max(1, cols.length - 1 || 1);
  const nodes = [];
  cols.forEach((L, ci) => {
    const members = layers.get(L);
    const rowH = (dagH - 2 * PAD) / Math.max(1, members.length);
    members.forEach((n, ri) => {
      nodes.push(Object.freeze({ ...baseNode(n),
        x: quant(cols.length === 1 ? width / 2 : PAD + ci * colW),
        y: quant(PAD + rowH * (ri + 0.5)) }));
    });
  });
  // The unlinked strip: a plain grid under the DAG, annotated so the break in
  // the figure is named, not implied.
  let height = dagH;
  const annotations = [...(spec.annotations || [])];
  if (isolated.length) {
    const perRow = Math.max(1, Math.floor((width - 2 * PAD) / 92));
    const y0 = (linked.length ? dagH : PAD) + 34;
    isolated.forEach((n, k) => {
      nodes.push(Object.freeze({ ...baseNode(n),
        x: quant(PAD + (k % perRow) * 92 + 20),
        y: quant(y0 + Math.floor(k / perRow) * 58) }));
    });
    const anchor = isolated[Math.min(2, isolated.length - 1)];
    annotations.push({ target: anchor.id, text: isolated.length + ' unlinked — no bonds yet', ref: anchor.ref });
    height = y0 + Math.ceil(isolated.length / perRow) * 58;
  }
  height = Math.max(height, 220);
  return finalize('graph', nodes, spec, [], annotations, { width, height });
};

// ── timeline · temporal (time on x, lane on y) ────────────────────────────────
const layoutTimeline = (spec) => {
  const N = spec.nodes.length;
  const colW = (W - 2 * PAD) / Math.max(1, N - 1 || 1);
  const lanes = 4;
  const nodes = spec.nodes.map((n, i) => Object.freeze({ ...baseNode(n),
    x: quant(N === 1 ? W / 2 : PAD + i * colW),
    y: quant(PAD + ((i % lanes) + 0.5) * ((H - 2 * PAD) / lanes)) }));
  return finalize('timeline', nodes, spec, [], spec.annotations);
};

// ── void_map · radial (anchors inner ring, voids outer, frontier hull) ────────
const layoutVoidMap = (spec) => {
  const cx = W / 2, cy = H / 2;
  const anchors = spec.nodes.filter(n => n.role !== 'void');
  const voids   = spec.nodes.filter(n => n.role === 'void');
  const place = (arr, radiusX, radiusY, phase) => arr.map((n, i) => {
    const a = phase + (i / Math.max(1, arr.length)) * Math.PI * 2;
    return Object.freeze({ ...baseNode(n), x: quant(cx + Math.cos(a) * radiusX), y: quant(cy + Math.sin(a) * radiusY) });
  });
  const innerNodes = place(anchors, 120, 90, 0);
  const outerNodes = place(voids, 240, 170, Math.PI / 7);
  const nodes = [...innerNodes, ...outerNodes];
  const byId = new Map(nodes.map(n => [n.id, n]));
  // Frontier outline: the convex-ish ring through the void nodes, drawn as a
  // closed hull so absence reads as bounded, shaped negative space (§8).
  const regions = (spec.regions || []).map(r => Object.freeze({
    id: r.id, kind: r.kind, label: r.label,
    hull: Object.freeze(hullOf(r.members.map(m => byId.get(m)).filter(Boolean))),
  })).filter(r => r.hull.length >= 3);
  return finalize('void_map', nodes, spec, regions, spec.annotations);
};

// ── path · polyline (serpentine rows) ─────────────────────────────────────────
const layoutPath = (spec) => {
  const perRow = Math.max(1, Math.ceil(Math.sqrt(spec.nodes.length)));
  const colW = (W - 2 * PAD) / Math.max(1, perRow - 1 || 1);
  const rows = Math.max(1, Math.ceil(spec.nodes.length / perRow));
  const rowH = (H - 2 * PAD) / Math.max(1, rows);
  const nodes = spec.nodes.map((n, i) => {
    const row = Math.floor(i / perRow);
    let col = i % perRow;
    if (row % 2 === 1) col = perRow - 1 - col;   // serpentine so the line never jumps back
    return Object.freeze({ ...baseNode(n),
      x: quant(perRow === 1 ? W / 2 : PAD + col * colW),
      y: quant(PAD + rowH * (row + 0.5)) });
  });
  return finalize('path', nodes, spec, [], spec.annotations);
};

// A deterministic convex hull (monotone chain) for the void frontier. Points are
// node centres; the hull is padded outward a little so it bounds the markers.
const hullOf = (pts) => {
  if (pts.length < 3) return pts.map(p => [p.x, p.y]);
  const P = pts.map(p => [p.x, p.y]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of P) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  const upper = [];
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  const ring = lower.slice(0, -1).concat(upper.slice(0, -1));
  // Pad outward from the centroid so markers sit inside the frontier.
  const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  return ring.map(([x, y]) => {
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1;
    return [quant(x + (dx / d) * 22), quant(y + (dy / d) * 22)];
  });
};

export const LAYOUT_DIMS = Object.freeze({ width: W, height: H });
