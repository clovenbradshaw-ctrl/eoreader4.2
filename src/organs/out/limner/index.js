// EO: SEG·SIG·INS(Network → Lens, Dissecting,Tending,Making) — barrel + LIMNER pipeline (limn)
// organs/out/limner — LIMNER, the SVG output organ.
//
// A read-and-project faculty (docs/limner.md). It renders graph and reading
// state as DETERMINISTIC SVG without ever letting the model emit geometry: the
// model's job is selection and labeling (an easy task a small model does
// reliably under constrained decoding), and the hard part — spatial composition
// — lives in code. This relocation is the whole design, and it is why the organ
// can run in-browser at small model sizes without quality collapse.
//
// The pipeline, each stage an operator (docs/limner.md §2) and independently
// testable:
//
//   graph snapshot ─▶ SEG selectScope    ─▶ subgraph
//                  ─▶ SIG synthesizeSpec  ─▶ ViewSpec (grounded by construction)
//                  ─▶     host stamps provenance (view_id, source)
//                  ─▶     checkGrounding   ─▶ veto on a ref that does not resolve
//                  ─▶     layout           ─▶ geometry (pure, deterministic)
//                  ─▶     render           ─▶ <svg>
//                  ─▶ INS emitRender       ─▶ one view event in the log
//
// Same spec + same layout config ⇒ byte-identical SVG, so a render is
// content-addressable and archivable. REC (dreaming) can call this same
// pipeline offline with no UI in the loop.

import { selectScope } from './scope.js';
import { synthesizeSpec } from './synthesize.js';
import { checkGrounding, stripUnsupported } from './ground.js';
import { layout } from './layout.js';
import { render } from './render.js';
import { emitRender } from './emit.js';
import { makeSpec, specHash, fnvHash } from './spec.js';

export { selectScope } from './scope.js';
export { synthesizeSpec } from './synthesize.js';
export { checkGrounding, stripUnsupported } from './ground.js';
export { layout, LAYOUT_DIMS } from './layout.js';
export { render } from './render.js';
export { emitRender } from './emit.js';
export {
  makeSpec, makeNode, makeEdge, makeRegion, makeAnnotation,
  validateSpec, viewSpecSchema, specHash, fnvHash,
  VIEW_KINDS, NODE_ROLES, LAYOUT_HINTS, EDGE_OPERATORS, REGION_KINDS,
} from './spec.js';

// A view_id assigned by the HOST, not the model (docs/limner.md §4) — the model
// cannot forge provenance. Deterministic from the spec content + cursor, so a
// re-render of the same view at the same cursor reuses the same id.
const mintViewId = (specHashStr, cursor) => 'view:' + fnvHash(specHashStr + '@' + cursor).slice(4);

// A stable hash of the subgraph actually fed to synthesis — `source.snapshot_hash`
// (docs/limner.md §4). The grounding check rejects a spec built against a
// different snapshot.
const snapshotHash = (sub) => fnvHash(JSON.stringify({
  nodes: sub.nodes.map(n => [n.id, n.sightings, n.firstSeen]),
  edges: sub.edges.map(e => [e.from, e.to, e.kind, e.seq]),
  voids: sub.voids.map(v => [v.node, v.rel, v.seq]),
}));

// limn(opts) — the public organ entry point. Renders internal EO state to SVG.
//
//   opts.doc        a doc (provides projectGraph + log); OR
//   opts.graph      a projected graph directly (for headless use); AND
//   opts.log        the log to emit the INS into (defaults to doc.log)
//   opts.scope      ScopeSelector for SEG (cap / focus / minWeight / frame)
//   opts.kind       ViewKind: graph | path | timeline | void_map  (default graph)
//   opts.layoutHint force | layered | radial | temporal
//   opts.theme      CSS-var overrides for the render
//   opts.mode       "grounded" (default) — the only mode wired; figurative is §10
//   opts.checkLabel (label, ref) → boolean — the label-support hook (§6.2)
//
// → { svg, spec, eventId, vetoed }
export const limn = async (opts = {}) => {
  const { doc = null, scope = {}, kind = 'graph', layoutHint, theme, mode = 'grounded' } = opts;
  if (mode !== 'grounded') {
    // Mode B (figurative illustration, docs/limner.md §10) is deliberately not
    // built — it lives outside the grounded pipeline so figurative requests
    // can't leak in and corrupt the grounding guarantee.
    throw new Error('limner: only the grounded mode is implemented (Mode B is out of scope)');
  }
  const graph = opts.graph || (doc && typeof doc.projectGraph === 'function' ? doc.projectGraph(scope.frame || {}) : null);
  if (!graph) throw new Error('limner: no graph — pass opts.graph or a doc with projectGraph');
  const log = opts.log || doc?.log || null;

  // SEG — cut the renderable subgraph.
  const subgraph = selectScope(graph, scope);

  // SIG — read the subgraph into a ViewSpec body (grounded by construction).
  const body = await synthesizeSpec(subgraph, { kind, layoutHint, model: opts.model, order: opts.order });

  // The HOST stamps provenance — view_id and source — onto a fresh frozen spec.
  // The model never touches these fields (docs/limner.md §4).
  const cursor = graph.rev ?? subgraph.rev ?? 0;
  const snapHash = snapshotHash(subgraph);
  const bodyHash = specHash(body);
  let spec = makeSpec({
    ...body,
    view_id: mintViewId(bodyHash, cursor),
    source: { log_cursor: String(cursor), snapshot_hash: snapHash },
  });

  // Grounding — every ref must resolve; a flagged label is stripped so the organ
  // degrades to sparse-but-correct, never confidently-wrong (docs/limner.md §6).
  const report = checkGrounding(spec, subgraph, { checkLabel: opts.checkLabel });
  if (!report.ok) {
    spec = makeSpec({ ...stripUnsupported(spec, report), view_id: spec.view_id, source: spec.source });
  }

  // LAYOUT (deterministic) → RENDER → INS.
  const geometry = layout(spec, { theme });
  const svg = render(geometry, theme);
  const { eventId } = emitRender(log, spec, svg, { site: opts.site });

  return Object.freeze({
    svg,
    spec,
    eventId,
    vetoed: report.ok ? null : report,
  });
};
