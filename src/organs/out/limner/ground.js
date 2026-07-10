// EO: EVA·SEG(Lens,Network → Lens, Binding,Dissecting) — grounding guard — cite-or-veto
// organs/out/limner/ground.js — the grounding guard, cite-or-veto for a view.
//
// LIMNER's invariant is the system's invariant: every drawn mark traces to an
// archived span (docs/limner.md §6). Grounding lives in the `ref` fields — a
// node with no resolving ref is illegal. Two checks run here, mirroring the two
// the talker's answer runs through:
//
//   1. REF RESOLUTION (structural). Every node/annotation ref resolves against
//      the subgraph SEG admitted. Under the deterministic projector this can
//      never fail (refs are lifted straight from the graph); under a future
//      grammar-bound model path it is guaranteed at decode time and re-checked
//      here defensively. A void ref (`seq:N`) resolves against the witnessed
//      void/edge seqs rather than the node set.
//
//   2. LABEL SUPPORT (semantic, the hook). A valid ref with an unsupported
//      label is the one thing the grammar cannot police (docs/limner.md §6.2).
//      The projector draws labels from the referenced span verbatim, so they
//      are supported by construction and this check passes; a model-emitted
//      label would be veto-checked against its span with the existing
//      hallucination guard. The seam is `opts.checkLabel(label, ref) → boolean`.
//
// Returns a VetoReport. `ok` means nothing fired; a fired check names the
// offending field so the caller can strip the label or regenerate it — the
// organ degrades to "structurally correct but sparse", never to "confidently
// wrong" (docs/limner.md §6).

// resolvableRef — does this ref point at something real in the subgraph?
//   r#…, plain entity ids, and `seq:N` void/edge witnesses all resolve.
const resolvableRef = (ref, sub) => {
  if (!ref) return false;
  if (sub.refSet.has(String(ref))) return true;
  const m = /^seq:(\d+)$/.exec(String(ref));
  if (m) {
    const seq = Number(m[1]);
    return sub.voids.some(v => v.seq === seq) || sub.edges.some(e => e.seq === seq);
  }
  return false;
};

export const checkGrounding = (spec, subgraph, opts = {}) => {
  const fired = [];     // { id, field, ref, message }
  const stripped = [];  // node/annotation ids whose label failed support

  // Build the ref lookup the nodes carry, so annotations (which target a node)
  // can find the span their text must be supported by.
  const refByNode = new Map((spec.nodes || []).map(n => [n.id, n.ref]));

  for (const n of spec.nodes || []) {
    if (!resolvableRef(n.ref, subgraph)) {
      fired.push({ id: n.id, field: 'node.ref', ref: n.ref,
        message: `node ${n.id} references ${n.ref}, which is not in the rendered subgraph` });
      continue;
    }
    if (typeof opts.checkLabel === 'function' && n.label && !opts.checkLabel(n.label, n.ref)) {
      stripped.push(n.id);
      fired.push({ id: n.id, field: 'node.label', ref: n.ref,
        message: `node ${n.id} label "${n.label}" is not supported by its span` });
    }
  }

  for (const a of spec.annotations || []) {
    const ref = a.ref || refByNode.get(a.target);
    if (!resolvableRef(ref, subgraph)) {
      fired.push({ id: a.target, field: 'annotation.ref', ref,
        message: `annotation on ${a.target} references ${ref}, which is not in the rendered subgraph` });
      continue;
    }
    if (typeof opts.checkLabel === 'function' && a.text && !opts.checkLabel(a.text, ref)) {
      stripped.push(a.target);
      fired.push({ id: a.target, field: 'annotation.text', ref,
        message: `annotation on ${a.target} is not supported by its span` });
    }
  }

  return Object.freeze({
    ok: fired.length === 0,
    fired: Object.freeze(fired),
    stripped: Object.freeze([...new Set(stripped)]),
  });
};

// stripUnsupported — the degrade path: drop the labels the veto flagged (and
// any node whose ref does not resolve), returning a spec that is sparse but
// honest. Pure; builds a new frozen body, leaving provenance to the host.
export const stripUnsupported = (spec, report) => {
  if (!report || report.ok) return spec;
  const strip = new Set(report.stripped);
  const badRefNodes = new Set(
    report.fired.filter(f => f.field === 'node.ref').map(f => f.id));
  const keptNodes = (spec.nodes || []).filter(n => !badRefNodes.has(n.id));
  const keptIds = new Set(keptNodes.map(n => n.id));
  return Object.freeze({
    ...spec,
    nodes: Object.freeze(keptNodes.map(n => strip.has(n.id) ? Object.freeze({ ...n, label: '' }) : n)),
    edges: Object.freeze((spec.edges || []).filter(e => keptIds.has(e.source) && keptIds.has(e.target))),
    regions: Object.freeze((spec.regions || [])
      .map(r => Object.freeze({ ...r, members: Object.freeze(r.members.filter(m => keptIds.has(m))) }))
      .filter(r => r.members.length)),
    annotations: Object.freeze((spec.annotations || []).filter(a => keptIds.has(a.target) && !strip.has(a.target))),
  });
};
