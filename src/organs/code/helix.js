// EO: SEG·SYN(Network → Network, Unraveling,Composing) — the dependency order
// The dependency order — the helix, read at corpus grain.
//
// The nine operators compose into ONE strict dependency chain (core/contract.js
// HELIX, docs/eo-for-coders.md Layer 1): Existence before Structure before
// Significance. At corpus grain the same law reads: a module's EXISTENCE (its
// declarations) must fold before the STRUCTURE that bonds to it (its importers),
// which must fold before the SIGNIFICANCE read over the whole (the judgments).
// This module derives that order from the medium itself — the `mod -> mod : imports`
// CON edges the lowering emitted — with no reference back to the source text.
//
// Tarjan's algorithm gives both halves at once: the strongly-connected components
// ARE the places where no order exists (the cycles — the helix cannot linearize
// them, the first finding), and Tarjan emits components dependencies-first, which
// IS the fold order (when a module is judged, everything it stands on is already
// judged). Pure functions over parsed tuples; no imports beyond the genome.

import { HELIX } from '../../core/index.js';
export { HELIX };

// the helix rank of an operator — the position in the one surviving order of 1,296.
export const helixRank = (op) => HELIX.indexOf(op);

// ── the module graph, read off the tuples ───────────────────────────────────────
// moduleGraphOf(events) → { nodes, edgesOf } — nodes are `mod:…` (corpus) and
// `ext:…` (threads out of the corpus); edges point AT dependencies.
export const moduleGraphOf = (events) => {
  const nodes = new Set();
  const edges = new Map();                       // sign → Set of dependency signs
  const addNode = (n) => { if (!nodes.has(n)) { nodes.add(n); edges.set(n, new Set()); } };
  for (const e of events) {
    if (e.op === 'INS' && e.operand?.type === 'Module') addNode(e.target);
    if (e.op === 'CON' && (e.operand?.relation === 'imports' || e.operand?.relation === 'reexports')) {
      addNode(e.target); addNode(e.operand.to);
      edges.get(e.target).add(e.operand.to);
    }
  }
  return { nodes: [...nodes], edgesOf: (n) => edges.get(n) ?? new Set() };
};

// ── Tarjan — components dependencies-first ──────────────────────────────────────
export const tarjanSCC = (nodes, edgesOf) => {
  const index = new Map(), low = new Map(), onStack = new Set();
  const stack = [];
  const sccs = [];
  let counter = 0;

  // iterative (a corpus can be deep); each frame is [node, iterator-position]
  const strongconnect = (v0) => {
    const work = [[v0, 0]];
    while (work.length) {
      const frame = work[work.length - 1];
      const [v] = frame;
      if (frame[1] === 0) {
        index.set(v, counter); low.set(v, counter); counter++;
        stack.push(v); onStack.add(v);
      }
      let advanced = false;
      const targets = [...edgesOf(v)];
      while (frame[1] < targets.length) {
        const w = targets[frame[1]++];
        if (!index.has(w)) { work.push([w, 0]); advanced = true; break; }
        if (onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
      }
      if (advanced) continue;
      if (low.get(v) === index.get(v)) {
        const comp = [];
        for (;;) {
          const w = stack.pop(); onStack.delete(w);
          comp.push(w);
          if (w === v) break;
        }
        sccs.push(comp);
      }
      work.pop();
      if (work.length) {
        const [p] = work[work.length - 1];
        low.set(p, Math.min(low.get(p), low.get(v)));
      }
    }
  };
  for (const n of nodes) if (!index.has(n)) strongconnect(n);
  return sccs;                                   // emitted dependencies-first
};

// ── the order ───────────────────────────────────────────────────────────────────
// dependencyOrder(events) → {
//   order    every module sign, dependencies first — the fold's walk
//   sccs     the components, same order
//   cycles   the components where NO order exists (size > 1, or a self-loop)
//   inCycle  sign → its cycle (for the cross-cycle hazard checks)
// }
export const dependencyOrder = (events) => {
  const { nodes, edgesOf } = moduleGraphOf(events);
  const sccs = tarjanSCC(nodes, edgesOf);
  const cycles = sccs.filter((c) => c.length > 1 || (c.length === 1 && edgesOf(c[0]).has(c[0])));
  const inCycle = new Map();
  for (const c of cycles) for (const m of c) inCycle.set(m, c);
  const order = sccs.flat();
  return Object.freeze({ order, sccs, cycles, inCycle, edgesOf });
};
