// EO: SEG(Network → Network, Unraveling) — SEG — select renderable subgraph
// organs/out/limner/scope.js — SEG: segment the graph into a renderable subgraph.
//
// The first stage of the pipeline (docs/limner.md §2, §3). A full projected
// graph can carry hundreds of figures; a legible view shows tens. selectScope
// is the SEG operator read as a projection: it cuts the live graph down to the
// nodes and edges a single view will draw, deterministically, with no model in
// the loop. Everything downstream (synthesis, layout, render) sees only this
// subgraph, so the `ref` enum the grammar binds (spec.js §5) is exactly its node
// set — a hallucinated reference is one that points outside what SEG admitted.
//
// A Subgraph is the graph projection narrowed:
//   { nodes: [{ id, label, sightings, firstSeen, props }],
//     edges: [{ from, to, kind, via, weight, seq, sentIdx }],
//     voids: [{ node, rel, kind, seq, sentIdx }],
//     refSet: Set<string>,   // the admitted node ids — the grounding ground truth
//     rev:    number }       // the log length the cut is true as of

const DEFAULT_CAP = 40;   // matches the graph view's draw cap (ui/graph-view.js CAP)

// selectScope(graph, scope) — narrow a projected graph to a renderable subgraph.
//
//   scope.cap       max nodes to keep (most-sighted win); default 40
//   scope.focus     a node id (or label substring) to centre on — keeps that
//                   node and its neighbours by edge adjacency, ahead of the
//                   global most-sighted set
//   scope.minWeight prune edges below this projected weight (default 0)
//
// Pure on (graph, scope). The same graph and scope cut the same subgraph.
export const selectScope = (graph, scope = {}) => {
  const cap      = Math.max(1, scope.cap | 0 || DEFAULT_CAP);
  const minW     = Number.isFinite(scope.minWeight) ? scope.minWeight : 0;
  const entities = [...(graph?.entities?.values?.() || [])];
  const allEdges = (graph?.edges || []).filter(e => (e.weight ?? 0) >= minW && e.from !== e.to);

  // Rank by sightings (the log-mass proxy the projection already trusts), with a
  // stable tiebreak on firstSeen then id so the ordering — and the layout seeded
  // from it — is deterministic.
  const ranked = entities.slice().sort((a, b) =>
    (b.sightings - a.sightings) ||
    ((a.firstSeen ?? 0) - (b.firstSeen ?? 0)) ||
    String(a.id).localeCompare(String(b.id)));

  let keep;
  if (scope.focus) {
    keep = focusKeep(scope.focus, entities, allEdges, ranked, cap);
  } else {
    keep = new Set(ranked.slice(0, cap).map(e => e.id));
  }

  const nodes = ranked
    .filter(e => keep.has(e.id))
    .map(e => ({
      id: e.id, label: e.label ?? String(e.id),
      sightings: e.sightings ?? 1, firstSeen: e.firstSeen ?? 0,
      props: e.props || {},
    }));
  const edges = allEdges.filter(e => keep.has(e.from) && keep.has(e.to));
  const voids = (graph?.voids || []).filter(v => keep.has(v.node));

  return Object.freeze({
    nodes:  Object.freeze(nodes),
    edges:  Object.freeze(edges),
    voids:  Object.freeze(voids),
    refSet: new Set(nodes.map(n => String(n.id))),
    rev:    graph?.rev ?? nodes.length,
  });
};

// Centre on a focus node: keep it plus its edge-neighbours, then fill the rest
// of the budget with the global most-sighted. The focus may be an exact id or a
// case-insensitive label substring (so `/svg gregor` works from the chat box).
const focusKeep = (focus, entities, edges, ranked, cap) => {
  const f = String(focus).toLowerCase();
  const hit = entities.find(e => String(e.id).toLowerCase() === f)
           || entities.find(e => String(e.label ?? '').toLowerCase().includes(f));
  if (!hit) return new Set(ranked.slice(0, cap).map(e => e.id));

  const keep = new Set([hit.id]);
  for (const e of edges) {
    if (e.from === hit.id) keep.add(e.to);
    if (e.to === hit.id) keep.add(e.from);
  }
  // Fill any remaining budget with the most-sighted, so a sparse neighbourhood
  // still draws a useful amount of context.
  for (const e of ranked) {
    if (keep.size >= cap) break;
    keep.add(e.id);
  }
  // If the neighbourhood already overflows, trim to the budget but always keep
  // the focus node itself.
  if (keep.size > cap) {
    const trimmed = new Set([hit.id]);
    for (const e of ranked) {
      if (trimmed.size >= cap) break;
      if (keep.has(e.id)) trimmed.add(e.id);
    }
    return trimmed;
  }
  return keep;
};
