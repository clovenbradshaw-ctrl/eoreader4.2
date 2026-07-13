// EO: CON·EVA(Link → Network,Paradigm, Binding,Tracing) — the typed edge grammar
// The linkage layer the templates emit into (docs/terrain-typed-templates.md §6). Three
// families, distinguished by which STORE they live in — and that is the load-bearing
// distinction, not decoration:
//
//   G  Evidence edges (Given-Log)       — carry provenance; what makes a claim checkable.
//   S  Structural edges (Structure-Lattice) — SEG/CON/SYN made persistent; the lattice.
//   M  Significance edges (Meant-Graph)  — NEVER stored. Projected at read time from
//                                          DEF/EVA/REC events (the Experience Engine
//                                          tuple ⟨G,S,M | π,γ,σ⟩). Storing one IS the
//                                          integrity violation the architecture exists
//                                          to prevent — so cardinalityCheck flags any
//                                          M edge found in an article's STORED set.
//
// `admissible(edge, src, tgt)` is the domain/range gate. `cardinalityCheck(article)`
// runs as an EVA CHECKPOINT, not a write-time guard: an article is allowed to be
// malformed and to KNOW it (a returned violation is a finding, not a rejected write).

import { TERRAIN_NAMES, profileOf } from './terrains.js';

// Range/domain tokens that are NOT terrains: provenance nodes an evidence edge points
// at. `Voice` and `Publication` are Entity SUBKINDS (an Entity playing a role); `Span`
// is a raw source locus. Kept as tokens so admissible() can accept them as targets.
export const NON_TERRAIN_NODES = Object.freeze(['Span', 'Voice', 'Publication']);

const ANY = Object.freeze([...TERRAIN_NAMES]);                 // all nine terrains
const NODES = Object.freeze([...TERRAIN_NAMES, ...NON_TERRAIN_NODES]);

// One edge type. `store` ∈ G|S|M. `domain`/`range` are terrain (or node) name lists, or
// the string 'any'. `sameTerrain` requires src and tgt to be the same terrain (composes,
// supersedes-within). `cardinality` mirrors §6 for documentation and the checkpoint.
const E = (id, store, domain, range, extra = {}) =>
  Object.freeze({ id, store, domain, range, sameTerrain: false, cardinality: null, ...extra });

export const EDGE_TYPES = Object.freeze({
  // ── Evidence (G) — provenance; the strongest edges ──
  attested_by:    E('attested_by',    'G', 'any', ['Span'],        { note: 'direct observation in a source — the strongest edge' }),
  asserted_by:    E('asserted_by',    'G', 'any', ['Voice'],       { note: 'someone claims it; the claim is attested, the content is not' }),
  documented_in:  E('documented_in',  'G', 'any', ['Publication'], { note: 'appears in a record' }),
  characterized_by: E('characterized_by', 'G', 'any', ['Lens'],    { note: "someone's reading applied to it" }),

  // ── Structural (S) — SEG/CON/SYN made persistent ──
  instance_of:  E('instance_of',  'S', ['Entity'], ['Kind'],                 { cardinality: 'Kind requires ≥2 inbound' }),
  endpoint_of:  E('endpoint_of',  'S', ['Entity', 'Kind', 'Field'], ['Link'], { cardinality: 'Link requires ≥2 inbound' }),
  member_of:    E('member_of',    'S', ['Link'], ['Network'],                { cardinality: 'Network requires ≥2 inbound' }),
  situated_in:  E('situated_in',  'S', ['Entity', 'Link', 'Kind', 'Network'], ['Field'], { cardinality: 'Field requires ≥2 inbound' }),
  obtains_over: E('obtains_over', 'S', ['Void', 'Atmosphere'], ['Field', 'Network', 'Entity'], { cardinality: 'Void and Atmosphere require ≥1 outbound' }),
  composes:     E('composes',     'S', 'any', 'any',                         { sameTerrain: true, cardinality: 'elective' }),

  // ── Significance (M) — never stored; projected from DEF/EVA/REC ──
  reads:       E('reads',       'M', ['Lens'], 'any',              { cardinality: 'Lens requires exactly 1' }),
  held_by:     E('held_by',     'M', ['Lens'], ['Voice'],          { cardinality: 'Lens requires exactly 1' }),
  instances:   E('instances',   'M', ['Lens'], ['Paradigm'],       { cardinality: 'Paradigm requires ≥2 inbound' }),
  anomaly_for: E('anomaly_for', 'M', ['Entity', 'Link'], ['Paradigm'], { cardinality: 'elective, diagnostic' }),
  defines:     E('defines',     'M', ['Voice'], 'any',             { cardinality: 'elective, diagnostic — the DEF-capture edge' }),
  supersedes:  E('supersedes',  'M', 'any', 'any',                 { cardinality: 'logged, never a delete' }),
});

export const STORES = Object.freeze({ G: 'Given-Log', S: 'Structure-Lattice', M: 'Meant-Graph' });

// Edges that must never appear in an article's stored edge set — the Meant-Graph.
export const isProjectedEdge = (edge) => EDGE_TYPES[edge]?.store === 'M';
export const edgesInStore = (store) => Object.values(EDGE_TYPES).filter((e) => e.store === store).map((e) => e.id);

const inSet = (set, node) => set === 'any' ? NODES.includes(node) : set.includes(node);

// admissible(edge, src, tgt) → boolean. Is `edge` a legal typed relation from a `src`
// terrain to a `tgt` terrain/node? Unknown edge or off-domain/range → false. `composes`
// and same-terrain `supersedes` additionally require src === tgt.
export const admissible = (edge, src, tgt) => {
  const e = EDGE_TYPES[edge];
  if (!e) return false;
  if (!inSet(e.domain, src)) return false;
  if (!inSet(e.range, tgt)) return false;
  if (e.sameTerrain && src !== tgt) return false;
  return true;
};

// The edges a terrain may legally EMIT (as source) — for the render layer's "what can
// this article link out to" and for authoring guards.
export const emittableFrom = (terrain) =>
  Object.values(EDGE_TYPES).filter((e) => inSet(e.domain, terrain)).map((e) => e.id);

// ── the cardinality checkpoint (§6) ───────────────────────────────────────────────
// article: { terrain, edges: [{ type, dir, to?, from? }] }  where `dir` is 'in' | 'out'
// RELATIVE TO THIS ARTICLE. Also folds edge events out of the log if `edges` is absent
// (log events { op:'CON'|'SYN', kind:'edge', edge, dir, to, from }).
//
// Returns { ok, violations: [{ kind, edge, ... }] }. Violation kinds:
//   missing-required   a requiredEdge whose count is under min / not exactly `exact`
//   inadmissible       an edge whose src→tgt is off the grammar
//   stored-significance an M-family edge present in the stored set (the integrity break)
const foldEdges = (article) => {
  if (Array.isArray(article?.edges)) return article.edges;
  const log = Array.isArray(article?.log) ? article.log : [];
  return log.filter((e) => e && e.kind === 'edge' && e.edge)
    .map((e) => ({ type: e.edge, dir: e.dir || 'out', to: e.to, from: e.from, toTerrain: e.toTerrain, fromTerrain: e.fromTerrain }));
};

// An edge names its endpoints by identity key ("Field:downtown") or terrain ("Field").
// admissible() gates on TERRAIN, so resolve one: an explicit *Terrain field wins; else the
// key's "Terrain:" prefix; else a bare terrain name; else null (unresolved — not checked).
const NAME_SET = new Set([...TERRAIN_NAMES, ...NON_TERRAIN_NODES]);
const terrainOfRef = (ref, explicit) => {
  if (explicit && NAME_SET.has(explicit)) return explicit;
  if (typeof ref !== 'string') return null;
  if (NAME_SET.has(ref)) return ref;
  const prefix = ref.split(':', 1)[0];
  return NAME_SET.has(prefix) ? prefix : null;
};

// The article carries TWO edge pools, and the distinction is the whole integrity rule:
//   stored     G + S edges, persisted (article.edges, or folded from the log).
//   projected  M edges, computed at read time by project.js (article.projected). An M
//              edge required by a terrain (Lens `reads`/`held_by`, Paradigm `instances`)
//              is counted HERE, never against the stored pool — because a stored M edge
//              is itself a violation (stored-significance), so it cannot also be the way
//              a required M edge is satisfied.
export const cardinalityCheck = (article) => {
  const terrain = article?.terrain;
  const p = profileOf(terrain);
  const violations = [];
  if (!p) return Object.freeze({ ok: false, violations: Object.freeze([{ kind: 'unknown-terrain', terrain }]) });

  const stored = foldEdges(article);
  const projected = Array.isArray(article?.projected)
    ? article.projected.map((e) => ({ type: e.type ?? e.edge, dir: e.dir || 'out', to: e.to, from: e.from, toTerrain: e.toTerrain, fromTerrain: e.fromTerrain }))
    : [];
  const poolFor = (edge) => (isProjectedEdge(edge) ? projected : stored);
  const count = (pool, type, dir) => pool.filter((e) => e.type === type && e.dir === dir).length;

  // required-edge cardinality — each required edge counted in its own store's pool
  for (const req of p.requiredEdges) {
    const n = count(poolFor(req.edge), req.edge, req.dir);
    if (req.exact != null && n !== req.exact)
      violations.push({ kind: 'missing-required', edge: req.edge, dir: req.dir, want: `exactly ${req.exact}`, got: n });
    else if (req.min != null && n < req.min)
      violations.push({ kind: 'missing-required', edge: req.edge, dir: req.dir, want: `≥${req.min}`, got: n });
  }

  // the integrity check: any M-family edge in the STORED pool is the violation the whole
  // architecture exists to prevent — the Meant-Graph got written down.
  for (const e of stored)
    if (isProjectedEdge(e.type))
      violations.push({ kind: 'stored-significance', edge: e.type, note: 'Meant-Graph edges are projected, never stored' });

  // admissibility of every edge, stored or projected (a read-time edge is still typed)
  for (const e of [...stored, ...projected]) {
    const src = e.dir === 'out' ? terrain : terrainOfRef(e.from, e.fromTerrain);
    const tgt = e.dir === 'out' ? terrainOfRef(e.to, e.toTerrain) : terrain;
    // Only gate when both ends resolve to a known terrain/node; an unresolved endpoint is
    // an authoring gap, not an inadmissible edge — a different finding, left to the caller.
    if (src != null && tgt != null && !admissible(e.type, src, tgt))
      violations.push({ kind: 'inadmissible', edge: e.type, src, tgt });
  }

  return Object.freeze({ ok: violations.length === 0, violations: Object.freeze(violations) });
};

// ── the characteristic-failure diagnosis (an EVA read over the edge set) ──────────
// §5's per-terrain failure signatures, expressed as edge patterns. Advisory: a hit is a
// FINDING the checkpoint surfaces, not a rejection. Only the patterns cheaply decidable
// from the edge set are checked here; the prose-shaped ones live in the render notes.
export const diagnoseFailure = (article) => {
  const terrain = article?.terrain;
  const edges = foldEdges(article);
  const inbound = edges.filter((e) => e.dir === 'in');
  const findings = [];

  if (terrain === 'Entity' && inbound.length > 0 && inbound.every((e) => e.type === 'characterized_by'))
    findings.push({ kind: 'entity-is-lens', note: "only inbound edges are `characterized_by` — a Lens wearing an Entity's clothes" });

  const p = profileOf(terrain);
  if (p) {
    // a Ground/Figure/Pattern terrain missing its constitutive structural edge entirely
    for (const req of p.requiredEdges) {
      if (edges.filter((e) => e.type === req.edge && e.dir === req.dir).length === 0)
        findings.push({ kind: 'no-constitutive-edge', edge: req.edge, note: p.characteristicFailure });
    }
  }
  return Object.freeze({ terrain, findings: Object.freeze(findings) });
};
