// EO: tiered-graph forces — the adjustable spread/gather layer and the drag-pin
// hit-test for mountTieredGraph (tiered-graph.js). The four layouts there are a
// deterministic STRUCTURAL SEED (rank columns, tier bands, tier rings, time
// buckets); these pure functions relax that seed under two global knobs the user
// turns — repel (ρ, a spacing multiplier) and gather (α, a barycentre pull) —
// without throwing away the tier/ring meaning that keeps the graph from reading as
// a hairball. No DOM: every function mutates n.tx/n.ty in place, so the caller's
// de-overlap + tween pipeline stays the single source of truth.
//
// The contract with the renderer:
//   · geom = { W, H, cx, cy, midY, AX_TOP, AX_BOT, orient, centreId }
//   · a node carries { tx, ty, tier, pinned } (+ pinX/pinY when pinned)
//   · ρ acts on ALL layouts (it only ever enlarges gaps — always safe);
//     α acts on radial + flow ONLY. tiers/time are locked grids with no
//     de-overlap pass, so an α slide there would pile nodes up with nothing to
//     clean it (and on time would fight the time-locked x); their ordering
//     already comes from the seed's barycentre sort, so α is a visible no-op.
//   · pinned nodes are skipped by both forces — the user parked them on purpose.

// Adaptive default ρ: a lone source + a few figures wants the seed as-is (ρ≈1); a
// 40-node topic web wants room to breathe. sqrt keeps the growth gentle so the
// canvas never explodes past what fit()'s 0.4 zoom floor can recover.
export function spreadDefault(N) {
  return Math.max(1, Math.min(1.9, Math.sqrt((N || 1) / 12)));
}

// The de-overlap clamp box, scaled about the canvas centre by ρ. The seed layouts
// clamp to the base canvas (28/22 margins); once ρ spreads them, the FINAL de-overlap
// must clamp to this enlarged box or it would just crush the spread back to the edges.
// fit()/pan then frame the oversized content.
export function clampBox(rho, geom) {
  const { W, H, cx, cy } = geom, r = rho || 1;
  return {
    x0: cx - (cx - 28) * r, y0: cy - (cy - 22) * r,
    x1: cx + (W - 28 - cx) * r, y1: cy + (H - 22 - cy) * r,
  };
}

// Spread: push the seed apart about each layout's own anchor, so a node keeps its
// structural role (its ring, its rank column, its time band) while the gaps grow.
export function applySpread(nodes, layout, rho, geom) {
  const r = rho || 1;
  if (Math.abs(r - 1) < 0.02) return;   // ρ≈1 is the untouched seed
  const { W, H, cx, cy, midY } = geom;
  for (const n of nodes) {
    if (n.pinned) continue;
    if (layout === 'radial') {          // scale radius from the centre root
      n.tx = cx + (n.tx - cx) * r; n.ty = cy + (n.ty - cy) * r;
    } else if (layout === 'flow') {     // cross-axis only — keep the rank flow
      if (geom.orient === 'v') n.tx = W / 2 + (n.tx - W / 2) * r;
      else n.ty = H / 2 + (n.ty - H / 2) * r;
    } else if (layout === 'time') {     // y only — x is time-locked
      n.ty = midY + (n.ty - midY) * r;
    } else {                            // tiers: enlarge band gaps + within-band spread
      n.tx = W / 2 + (n.tx - W / 2) * r; n.ty = H / 2 + (n.ty - H / 2) * r;
    }
  }
}

// Gather: pull each node toward the barycentre of its bonded neighbours, but ONLY
// along the layout's FREE axis so the seed's structure survives — radial slides a
// node AROUND its ring (radius fixed); flow slides it ACROSS (rank fixed). A few
// small iterations settle clusters; the caller's final separate() re-spreads any
// pile-up. Skips pinned nodes and the centred root.
export function applyAttraction(nodes, layout, alpha, ctx) {
  const a = alpha || 0;
  if (a < 0.02 || (layout !== 'radial' && layout !== 'flow')) return;
  const { edges, geom } = ctx, { cx, cy, centreId } = geom;
  const adj = new Map();                // both directions — gather ignores edge orientation
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) { const A = adj.get(e.a), B = adj.get(e.b); if (A) A.push(e.b); if (B) B.push(e.a); }
  const byId = ctx.byId;
  const horiz = geom.orient !== 'v';
  for (let it = 0; it < 3; it++) {
    for (const n of nodes) {
      if (n.pinned || n.id === centreId) continue;
      const nb = adj.get(n.id); if (!nb || !nb.length) continue;
      if (layout === 'radial') {
        let sx = 0, sy = 0, c = 0;
        for (const id of nb) { const m = byId[id]; if (!m || m.id === centreId) continue;
          const am = Math.atan2(m.ty - cy, m.tx - cx); sx += Math.cos(am); sy += Math.sin(am); c++; }
        if (!c) continue;
        const want = Math.atan2(sy, sx), th = Math.atan2(n.ty - cy, n.tx - cx), rad = Math.hypot(n.tx - cx, n.ty - cy);
        // blend on the unit circle so the ±π wrap can't fling a node across the ring
        const bx = (1 - a) * Math.cos(th) + a * Math.cos(want), by = (1 - a) * Math.sin(th) + a * Math.sin(want);
        const t2 = Math.atan2(by, bx);
        n.tx = cx + Math.cos(t2) * rad; n.ty = cy + Math.sin(t2) * rad;
      } else {                          // flow: mean of neighbours on the cross axis only
        let sum = 0, c = 0;
        for (const id of nb) { const m = byId[id]; if (!m) continue; sum += horiz ? m.ty : m.tx; c++; }
        if (!c) continue;
        const want = sum / c;
        if (horiz) n.ty += (want - n.ty) * a; else n.tx += (want - n.tx) * a;
      }
    }
  }
}

// Topmost node whose centre is within (radius + slop) of a world-space point, or
// null. Iterate in reverse: the node group appended last paints on top, so it wins a
// pick where circles overlap. `accept` gates on visibility (tier filter + fold cursor).
export function hitNode(nodes, wx, wy, isRoot, slop, accept) {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (accept && !accept(n)) continue;
    const rr = (isRoot(n) ? 9 : 7) + (slop || 0);
    if ((wx - n.x) * (wx - n.x) + (wy - n.y) * (wy - n.y) <= rr * rr) return n;
  }
  return null;
}
