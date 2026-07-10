// EO: DEF·EVA(Void → Lens,Paradigm, Dissecting,Binding) — ViewSpec IR — constructors, schema, hash
// organs/out/limner — the ViewSpec, LIMNER's intermediate representation.
//
// LIMNER renders graph and reading state as deterministic SVG without ever
// letting the model emit geometry (docs/limner.md). The model's only job is
// SELECTION and LABELING; the spatial composition lives in code. The ViewSpec
// is the contract between the two: a typed view whose every node and edge
// carries a `ref` back into the event log, so every drawn mark traces to an
// archived span — the same cite-or-veto invariant the talker speaks under.
//
// This module owns three things:
//   - the ViewSpec shape and its constructors (a frozen, validated record),
//   - the JSON-schema builder (a hook for grammar-constrained decoding, §5),
//   - a deterministic content hash, so the same spec hashes the same — the
//     property that makes a render content-addressable (docs/limner.md §3).
//
// Nothing here touches a coordinate. Geometry is the layout engine's job
// (layout.js); this is pure structure.

export const VIEW_KINDS    = Object.freeze(['graph', 'path', 'timeline', 'void_map']);
export const NODE_ROLES    = Object.freeze(['concept', 'event', 'span', 'void', 'anchor']);
export const LAYOUT_HINTS  = Object.freeze(['force', 'layered', 'radial', 'temporal']);
// Edge operators are CARRIED OVER from the underlying CON/SYN/DEF/etc. events —
// LIMNER reports them, it never authors them (docs/limner.md §2). `null` is a
// bare structural tie with no operator label.
export const EDGE_OPERATORS = Object.freeze(['CON', 'SYN', 'DEF', 'SIG', 'SEG', 'REC', null]);
export const REGION_KINDS   = Object.freeze(['cluster', 'void', 'frontier']);

const clamp01 = (x) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
// Round to a fixed precision so a spec serializes — and therefore HASHES —
// byte-identically across engines. A salience of 0.3333333 must not give two
// machines two different content addresses.
const q = (x) => Math.round(clamp01(x) * 1e4) / 1e4;

// ── Constructors ─────────────────────────────────────────────────────────────
// Each builds a frozen, normalized fragment. The model (or the deterministic
// projector) hands raw fields; these clean and freeze them. `view_id` and
// `source` are NOT set here — the host fills provenance so the model cannot
// forge it (docs/limner.md §4).

export const makeNode = ({ id, ref, label = '', salience = 0.5, role = 'concept' } = {}) =>
  Object.freeze({
    id:       String(id),
    ref:      String(ref),
    label:    String(label ?? ''),
    salience: q(salience),
    role:     NODE_ROLES.includes(role) ? role : 'concept',
  });

export const makeEdge = ({ source, target, operator = null, weight = 0.5, label = null } = {}) =>
  Object.freeze({
    source:   String(source),
    target:   String(target),
    operator: EDGE_OPERATORS.includes(operator) ? operator : null,
    weight:   q(weight),
    label:    label == null ? null : String(label),
  });

export const makeRegion = ({ id, members = [], label = '', kind = 'cluster' } = {}) =>
  Object.freeze({
    id:      String(id),
    members: Object.freeze(members.map(String)),
    label:   String(label ?? ''),
    kind:    REGION_KINDS.includes(kind) ? kind : 'cluster',
  });

export const makeAnnotation = ({ target, text = '', ref } = {}) =>
  Object.freeze({ target: String(target), text: String(text ?? ''), ref: String(ref) });

// makeSpec — assemble and freeze a ViewSpec. The host passes `source`/`view_id`
// (provenance); the model/projector passes the body (nodes/edges/regions/…).
export const makeSpec = ({
  view_id = null,
  source  = null,
  kind    = 'graph',
  nodes   = [],
  edges   = [],
  regions = [],
  annotations = [],
  layout_hint = 'force',
} = {}) =>
  Object.freeze({
    view_id: view_id == null ? null : String(view_id),
    source:  source == null ? null : Object.freeze({ ...source }),
    kind:    VIEW_KINDS.includes(kind) ? kind : 'graph',
    nodes:       Object.freeze(nodes.map(makeNode)),
    edges:       Object.freeze(edges.map(makeEdge)),
    regions:     Object.freeze(regions.map(makeRegion)),
    annotations: Object.freeze(annotations.map(makeAnnotation)),
    layout_hint: LAYOUT_HINTS.includes(layout_hint) ? layout_hint : 'force',
  });

// ── Validation ───────────────────────────────────────────────────────────────
// The post-hoc structural check (the defensive half of docs/limner.md §6.1):
// every reference resolves to a node id (edge endpoints, region members,
// annotation targets) and every `ref` is in the allowed set when one is given.
// Returns a list of human-readable problems — empty means valid.
export const validateSpec = (spec, { refEnum = null } = {}) => {
  const problems = [];
  if (!spec || typeof spec !== 'object') return ['spec is not an object'];
  if (!VIEW_KINDS.includes(spec.kind)) problems.push(`unknown kind: ${spec.kind}`);

  const nodeIds = new Set();
  const refs = refEnum ? new Set(refEnum.map(String)) : null;
  for (const n of spec.nodes || []) {
    if (nodeIds.has(n.id)) problems.push(`duplicate node id: ${n.id}`);
    nodeIds.add(n.id);
    if (!n.ref) problems.push(`node ${n.id} has no ref`);
    else if (refs && !refs.has(n.ref)) problems.push(`node ${n.id} ref not in subgraph: ${n.ref}`);
  }
  for (const e of spec.edges || []) {
    if (!nodeIds.has(e.source)) problems.push(`edge source missing node: ${e.source}`);
    if (!nodeIds.has(e.target)) problems.push(`edge target missing node: ${e.target}`);
  }
  for (const r of spec.regions || []) {
    for (const m of r.members) if (!nodeIds.has(m)) problems.push(`region ${r.id} member missing node: ${m}`);
  }
  for (const a of spec.annotations || []) {
    if (!nodeIds.has(a.target)) problems.push(`annotation target missing node: ${a.target}`);
    if (refs && a.ref && !refs.has(a.ref)) problems.push(`annotation ref not in subgraph: ${a.ref}`);
  }
  return problems;
};

// ── JSON schema (the grammar hook, docs/limner.md §5) ─────────────────────────
// A backend that exposes grammar-constrained decoding (XGrammar / GBNF) compiles
// this into a grammar so the model can only emit a structurally valid ViewSpec.
// Passing `refEnum` is the elegant Level-2 binding: the `ref` field becomes an
// `enum` of exactly the event/span ids present in the current subgraph, so a
// hallucinated reference becomes structurally IMPOSSIBLE to decode, not merely
// caught afterward. No backend wires this yet (the model interface exposes no
// schema hook today); the projector grounds by construction in the meantime,
// and this schema is the ready seam for when grammar support lands.
export const viewSpecSchema = ({ refEnum = null } = {}) => {
  const refSchema = refEnum && refEnum.length
    ? { type: 'string', enum: [...refEnum].map(String) }
    : { type: 'string' };
  return {
    type: 'object',
    required: ['kind', 'nodes', 'edges'],
    properties: {
      kind: { type: 'string', enum: [...VIEW_KINDS] },
      nodes: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'ref'],
          properties: {
            id:       { type: 'string' },
            ref:      refSchema,
            label:    { type: 'string' },
            salience: { type: 'number', minimum: 0, maximum: 1 },
            role:     { type: 'string', enum: [...NODE_ROLES] },
          },
        },
      },
      edges: {
        type: 'array',
        items: {
          type: 'object',
          required: ['source', 'target'],
          properties: {
            source:   { type: 'string' },
            target:   { type: 'string' },
            operator: { type: ['string', 'null'], enum: [...EDGE_OPERATORS] },
            weight:   { type: 'number', minimum: 0, maximum: 1 },
            label:    { type: ['string', 'null'] },
          },
        },
      },
      regions: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'members', 'kind'],
          properties: {
            id:      { type: 'string' },
            members: { type: 'array', items: { type: 'string' } },
            label:   { type: 'string' },
            kind:    { type: 'string', enum: [...REGION_KINDS] },
          },
        },
      },
      annotations: {
        type: 'array',
        items: {
          type: 'object',
          required: ['target', 'text', 'ref'],
          properties: {
            target: { type: 'string' },
            text:   { type: 'string' },
            ref:    refSchema,
          },
        },
      },
      layout_hint: { type: 'string', enum: [...LAYOUT_HINTS] },
    },
  };
};

// ── Content hash ─────────────────────────────────────────────────────────────
// A pure 64-bit FNV-1a over a canonical serialization — the same hash shape the
// web ingester content-addresses with (ingest/websource.js), kept local so the
// organ has no cross-faculty dependency. STABLE on the bytes: same spec → same
// `spec_hash`; same SVG → same `render_hash`, which is what lets a render be a
// content address (docs/limner.md §3, §7).
export const fnvHash = (text) => {
  let h1 = 0x811c9dc5, h2 = 0x811c9dc5;
  const s = String(text ?? '');
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ((c + i) & 0xff), 0x01000193) >>> 0;
  }
  return 'fnv:' + (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
};

// Canonical serialization: sorted keys, recursive. The spec is frozen with key
// order from the constructors, but a host-built `source` slot or a future model
// emission may not be — so we sort, making the hash insensitive to key order.
// `view_id` and `source` are EXCLUDED: the hash is over the view's CONTENT, not
// its provenance (a render is identical whichever cursor minted it).
const canonical = (v) => {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') {
    const keys = Object.keys(v).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
};

export const specHash = (spec) => {
  const { view_id, source, ...content } = spec || {};
  return fnvHash(canonical(content));
};
