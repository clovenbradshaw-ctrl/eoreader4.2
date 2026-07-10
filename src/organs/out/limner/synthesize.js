// EO: SIG(Network → Lens, Tending) — SIG — subgraph → ViewSpec
// organs/out/limner/synthesize.js — SIG: read the subgraph into a ViewSpec.
//
// The model's only job in LIMNER is SELECTION and LABELING (docs/limner.md §1).
// Everything hard — the geometry — lives downstream in the deterministic layout.
// This stage produces the ViewSpec the rest of the pipeline consumes.
//
// TWO PATHS, one contract:
//
//   - DETERMINISTIC PROJECTION (default, and the only one wired today). The
//     subgraph IS the selection; every node's `ref` is a real entity id that
//     traces to its INS event, every edge carries the operator the projection
//     read off the CON/SIG event. The spec is therefore GROUNDED BY
//     CONSTRUCTION — there is no surface for a hallucinated reference, because
//     no reference is invented. This is the Phase-0 "pixels first" path of
//     docs/limner.md §12, and the honest floor the organ degrades to.
//
//   - MODEL-EMITTED SPEC (the seam, not yet active). When a backend exposes
//     grammar-constrained decoding, synthesizeSpec would prompt the model with
//     the subgraph read and decode a ViewSpec under viewSpecSchema({ refEnum })
//     (spec.js §5), then fall through to the same validation and layout. The
//     model interface exposes no schema hook today (model/interface.js has only
//     phrase/propose), so this path stays dark behind `opts.model` until one
//     does; the deterministic projection covers every call in the meantime.
//
// Either way the output is a ViewSpec body (no provenance) that the host stamps
// with view_id/source and the grounding check re-validates.

import { makeSpec } from './spec.js';

// Operators ride through from the projection verbatim — LIMNER reports them, it
// does not author them (docs/limner.md §2). The projection lowercases the
// emitting operator onto the edge (`kind: 'con' | 'sig'`); we restore the
// canonical upper-case label the ViewSpec carries.
const OP_OF_KIND = Object.freeze({ con: 'CON', sig: 'SIG', syn: 'SYN', def: 'DEF', seg: 'SEG', rec: 'REC' });

// synthesizeSpec(subgraph, opts) → ViewSpec body
//   opts.kind        view kind (graph | path | timeline | void_map)
//   opts.layoutHint  layout hint; defaults per kind
//   opts.model       reserved — the grammar-constrained model path (dark today)
export const synthesizeSpec = async (subgraph, opts = {}) => {
  const kind = opts.kind || 'graph';
  // The model path is the documented seam; it stays inert until a backend can
  // decode under a JSON-schema grammar. Until then every kind projects.
  switch (kind) {
    case 'timeline': return projectTimeline(subgraph, opts);
    case 'void_map': return projectVoidMap(subgraph, opts);
    case 'path':     return projectPath(subgraph, opts);
    case 'graph':
    default:         return projectGraphView(subgraph, opts);
  }
};

// Local node ids (n0, n1, …) keep the spec self-contained; `ref` carries the
// real graph id, which is the thing that must resolve in the event log.
const localIds = (nodes) => {
  const map = new Map();
  nodes.forEach((n, i) => map.set(String(n.id), 'n' + i));
  return map;
};

// Normalize a positive measure to 0..1 by its max, so salience/weight are
// drawing-ready and scale-free. Empty or flat input maps everything to a mid
// value rather than dividing by zero.
const normBy = (xs) => {
  const max = xs.reduce((m, x) => Math.max(m, x || 0), 0);
  return (x) => (max > 0 ? (x || 0) / max : 0.5);
};

// ── graph — the EO figure graph ───────────────────────────────────────────────
const projectGraphView = (sub, opts) => {
  const id = localIds(sub.nodes);
  const sal = normBy(sub.nodes.map(n => n.sightings));
  const nodes = sub.nodes.map(n => ({
    id:       id.get(String(n.id)),
    ref:      String(n.id),
    label:    n.label ?? String(n.id),
    salience: sal(n.sightings),
    role:     'concept',
  }));
  const wMax = sub.edges.reduce((m, e) => Math.max(m, e.weight || 0), 0);
  const edges = sub.edges.map(e => ({
    source:   id.get(String(e.from)),
    target:   id.get(String(e.to)),
    operator: OP_OF_KIND[e.kind] || null,
    weight:   wMax > 0 ? (e.weight || 0) / wMax : 0.5,
    label:    e.via ?? null,
  }));
  return makeSpec({ kind: 'graph', nodes, edges, layout_hint: opts.layoutHint || 'force' });
};

// ── timeline — the event log over reading order ───────────────────────────────
// Nodes are placed by first appearance (firstSeen), the modality-blind reading
// position; the layout lays time on x and lane on y (layout.js). Edges ride
// through so a relation drawn between two moments stays legible.
const projectTimeline = (sub, opts) => {
  const id = localIds(sub.nodes);
  const sal = normBy(sub.nodes.map(n => n.sightings));
  const nodes = sub.nodes
    .slice()
    .sort((a, b) => (a.firstSeen ?? 0) - (b.firstSeen ?? 0))
    .map(n => ({
      id: id.get(String(n.id)), ref: String(n.id),
      label: n.label ?? String(n.id), salience: sal(n.sightings), role: 'event',
    }));
  const edges = sub.edges.map(e => ({
    source: id.get(String(e.from)), target: id.get(String(e.to)),
    operator: OP_OF_KIND[e.kind] || null, weight: 0.5, label: e.via ?? null,
  }));
  return makeSpec({ kind: 'timeline', nodes, edges, layout_hint: 'temporal' });
};

// ── void_map — determinate absence as shaped negative space ───────────────────
// The antimatter/void system's native visual (docs/limner.md §8). Carved
// absences become `void`-role nodes grouped into a frontier region; the present
// figures the voids hang off of stay as anchors so the absence reads against
// something. A void's `ref` is the seq of the event that witnessed it.
const projectVoidMap = (sub, opts) => {
  const id = localIds(sub.nodes);
  const sal = normBy(sub.nodes.map(n => n.sightings));
  const nodes = sub.nodes.map(n => ({
    id: id.get(String(n.id)), ref: String(n.id),
    label: n.label ?? String(n.id), salience: sal(n.sightings), role: 'anchor',
  }));
  const voidNodes = [];
  const members = [];
  sub.voids.forEach((v, i) => {
    const vid = 'v' + i;
    voidNodes.push({
      id: vid,
      ref: 'seq:' + v.seq,
      label: v.rel ? `∅ ${v.rel}` : '∅',
      salience: 0.5,
      role: 'void',
    });
    members.push(vid);
  });
  const edges = sub.voids.map((v, i) => ({
    source: id.get(String(v.node)),
    target: 'v' + i,
    operator: null,
    weight: 0.3,
    label: v.rel ?? null,
  })).filter(e => e.source);   // a void on a node not in scope draws no tether
  const regions = members.length
    ? [{ id: 'frontier', members, label: 'void', kind: 'frontier' }]
    : [];
  return makeSpec({
    kind: 'void_map',
    nodes: [...nodes, ...voidNodes],
    edges, regions,
    layout_hint: 'radial',
  });
};

// ── path — a route drawn along node order ─────────────────────────────────────
// A SURFER traversal (or any ordered walk) rendered as a polyline. Without a
// live traversal handed in, the deterministic order is first-appearance — a
// reading route through the figures as they entered the discourse.
const projectPath = (sub, opts) => {
  const order = (opts.order && opts.order.length)
    ? opts.order.map(String)
    : sub.nodes.slice().sort((a, b) => (a.firstSeen ?? 0) - (b.firstSeen ?? 0)).map(n => String(n.id));
  const byId = new Map(sub.nodes.map(n => [String(n.id), n]));
  const seq = order.filter(rid => byId.has(rid));
  const sal = normBy(sub.nodes.map(n => n.sightings));
  const nodes = seq.map((rid, i) => {
    const n = byId.get(rid);
    return { id: 'n' + i, ref: rid, label: n.label ?? rid, salience: sal(n.sightings), role: 'span' };
  });
  const edges = [];
  for (let i = 1; i < nodes.length; i++) {
    edges.push({ source: nodes[i - 1].id, target: nodes[i].id, operator: 'SEG', weight: 0.6, label: null });
  }
  return makeSpec({ kind: 'path', nodes, edges, layout_hint: 'layered' });
};
