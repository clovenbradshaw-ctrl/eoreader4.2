// EO: SYN(Link → Network, Composing) — the corpus-level Network article
// network-article.js — builds a genuine Network-terrain article (core/cube.js Site face;
// docs/terrain-typed-templates.md) over a corpus of sources: the architecture of connections
// AMONG DOCUMENTS, not a bag of entity nodes with nowhere for their own terrain to live.
// docs/terrain-typed-templates.md names this exact gap: "a graph node is { id, tier, label,
// kind, ref } … There is no `terrain` field; a Field or Atmosphere has nowhere to live" — and
// names the fix as the open integration step. This module is that step, for Network.
//
// src/wiki/edges.js already types what a Network is MADE OF: `member_of` runs Link → Network,
// never Entity → Network directly. So this is built bottom-up, exactly as the type grammar
// requires: two sources that corroborate a shared referent earn a Link between them
// (facets.endpoints = the two sources, evidence = the shared referents); the Network's members
// are those Links, and its `topology` facet (terrains.js: "Same member set and topology" is
// the Network identity condition) is a canonical, reproducible shape descriptor — never prose.
//
// Nesting is GRAIN, not terrain migration. A composite source — one with children via
// rooms/reader/app/registry.js's `parentSn` (a crawled site's sub-pages, a bundled report's
// sub-documents) — is ONE Entity node at the corpus's own Network. Calling this SAME builder
// again, scoped to just that composite's children, is that composite's OWN Network at a finer
// grain: surfer/reason/cursor.js's `grain` cursor already names this move — "unpacking descends
// a SYN to its members." Nothing here decides where a corpus's sources come from; the host
// (rooms/reader/app/wiki.js) supplies whichever slice — the whole topic, or one composite's
// children — and collapsing to a composite's root (or not) is the `rootOf` hook below.

import { identityKeyOf, profileOf } from './terrains.js';
import { cardinalityCheck } from './edges.js';

// buildSourceLinks(topic, { rootOf }) — from a topicTieredData()-shaped graph (tier-0 source
// nodes, tier-1 merged-entity nodes, tier-0 src→entity edges), find every PAIR of
// (rootOf-collapsed) sources that corroborate at least one shared merged entity, and emit one
// Link facet per pair, evidenced by the shared referents' labels. `rootOf` defaults to the
// identity — every source stands for itself — so a caller with no composite sources pays
// nothing for the collapse.
export const buildSourceLinks = ({ nodes = [], edges = [] } = {}, { rootOf = (id) => id } = {}) => {
  const entityLabel = new Map(nodes.filter((n) => n.tier === 1).map((n) => [n.id, n.label]));
  const sourceIds = new Set(nodes.filter((n) => n.tier === 0).map((n) => n.id));
  const sourcesOfEntity = new Map();   // entityId → Set(rootSourceId)
  for (const e of edges) {
    if (!sourceIds.has(e.a) || !entityLabel.has(e.b)) continue;
    const root = rootOf(e.a);
    let s = sourcesOfEntity.get(e.b);
    if (!s) sourcesOfEntity.set(e.b, s = new Set());
    s.add(root);
  }
  const pairs = new Map();   // "rootA~rootB" (rootA < rootB) → { a, b, shared: Set(label) }
  for (const [entId, roots] of sourcesOfEntity) {
    const rs = [...roots];
    for (let i = 0; i < rs.length; i++) {
      for (let j = i + 1; j < rs.length; j++) {
        const [a, b] = rs[i] < rs[j] ? [rs[i], rs[j]] : [rs[j], rs[i]];
        if (a === b) continue;
        const key = `${a}~${b}`;
        let p = pairs.get(key);
        if (!p) pairs.set(key, p = { a, b, shared: new Set() });
        p.shared.add(entityLabel.get(entId) || entId);
      }
    }
  }
  return [...pairs.values()]
    .sort((x, y) => (x.a < y.a ? -1 : x.a > y.a ? 1 : x.b < y.b ? -1 : x.b > y.b ? 1 : 0))
    .map((p) => Object.freeze({
      id: `link:${p.a}~${p.b}`,
      terrain: 'Link',
      facets: Object.freeze({ endpoints: [p.a, p.b], relationType: 'shares-referent' }),
      evidence: Object.freeze([...p.shared].sort()),
      a: p.a, b: p.b,
    }));
};

// topologyOf(links) → a deterministic, canonical shape descriptor: connected components (a
// disjoint corpus reads as more than one Network in truth, and this says so), each with its
// highest-degree member — the "hub" a reader would point at — and that member's degree. This
// IS the Network's identity-bearing `topology` facet, so it must be exactly reproducible from
// the same link set, never a free-text summary a caller could vary without the links changing.
export const topologyOf = (links) => {
  if (!links.length) return 'empty';
  const parent = new Map();
  const find = (x) => {
    if (!parent.has(x)) parent.set(x, x);
    while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); }
    return x;
  };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  const deg = new Map();
  for (const l of links) {
    const [a, b] = l.facets.endpoints;
    find(a); find(b); union(a, b);
    deg.set(a, (deg.get(a) || 0) + 1);
    deg.set(b, (deg.get(b) || 0) + 1);
  }
  const byRoot = new Map();
  for (const m of parent.keys()) {
    const r = find(m);
    let group = byRoot.get(r);
    if (!group) byRoot.set(r, group = []);
    group.push(m);
  }
  const components = [...byRoot.values()].map((group) => {
    const hub = group.slice().sort((a, b) => (deg.get(b) - deg.get(a)) || (a < b ? -1 : 1))[0];
    return { size: group.length, hub, hubDegree: deg.get(hub) };
  }).sort((a, b) => (b.size - a.size) || (a.hub < b.hub ? -1 : 1));
  const parts = components.map((c) => `${c.hub}(${c.hubDegree})x${c.size}`).join('+');
  return `components:${components.length}|${parts}`;
};

// buildNetworkArticle(topic, { rootOf }) → the Network article, its member Links, and an
// honest self-check (cardinalityCheck, terrains.js §6) run against BOTH the Network's own
// `member_of` cardinality (>=2 inbound — two corroborating Links, the terrain's own required
// edge) and each Link's `endpoint_of` cardinality. An article is allowed to be malformed and
// to KNOW it (docs/terrain-typed-templates.md §6): a corpus with fewer than two cross-source
// links still gets an article, `check.ok === false`, and the terrain's own
// `characteristicFailure` string names why — never a silently fabricated system.
export const buildNetworkArticle = (topic, { rootOf } = {}) => {
  const links = buildSourceLinks(topic, { rootOf });
  const topology = topologyOf(links);
  const facets = Object.freeze({ members: Object.freeze(links.map((l) => l.id)), topology });
  const key = identityKeyOf({ terrain: 'Network', log: [{ facets }] });
  const check = cardinalityCheck({
    terrain: 'Network',
    edges: links.map((l) => ({ type: 'member_of', dir: 'in', from: l.id })),
  });
  const linkChecks = links.map((l) => ({
    id: l.id,
    check: cardinalityCheck({
      terrain: 'Link',
      edges: [{ type: 'endpoint_of', dir: 'in', from: l.a }, { type: 'endpoint_of', dir: 'in', from: l.b }],
    }),
  }));
  return Object.freeze({
    id: `network:${key}`, terrain: 'Network', key, facets, links, check, linkChecks,
    characteristicFailure: check.ok ? null : profileOf('Network').characteristicFailure,
  });
};

// networkGraphData(topic, { rootOf, labelOf }) → { nodes, edges, article } in the exact shape
// rooms/reader/tiered-graph.js already consumes ({ id, tier, label, kind, terrain, ref, t } /
// { a, b, tier, gl, code }), so mountTieredGraph draws this with no renderer changes: the
// (root-collapsed) sources as tier-0 Entity nodes, the derived cross-source Links as tier-1
// Link nodes, and ONE tier-1 Network node every Link is `member_of` — CON (⋈, the Structure×
// Figure operator, Link's own cell) for a source's `endpoint_of` its Link, SYN (△, Structure×
// Pattern, Network's own "Composes into" section) for a Link's `member_of` the Network.
export const networkGraphData = (topic, { rootOf = (id) => id, labelOf = (id) => id } = {}) => {
  const article = buildNetworkArticle(topic, { rootOf });
  const nodes = [];
  const seen = new Set();
  const rootIds = new Set(article.links.flatMap((l) => [l.a, l.b]));
  // `ref` is the tiered-graph renderer's own "this node is a destination, not just a context
  // dot" signal (mountTieredGraph only fires onOpen for a node carrying one — see tiered-
  // graph.js's click handler). It has always been entity-shaped ({ docId, entId }) because only
  // the entity web used it; a source/link node is a destination too, just not an entity one, so
  // it carries its own kind-tagged ref instead of being left un-openable.
  for (const id of rootIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    nodes.push({ id, tier: 0, label: labelOf(id), kind: 'source', terrain: 'Entity', t: 0, ref: { kind: 'source', id } });
  }
  const edges = [];
  for (const link of article.links) {
    nodes.push({
      id: link.id, tier: 1, label: `${labelOf(link.a)} ↔ ${labelOf(link.b)}`,
      kind: 'link', terrain: 'Link', evidence: link.evidence, t: 0,
      ref: { kind: 'link', id: link.id, a: link.a, b: link.b, evidence: link.evidence },
    });
    edges.push({ a: link.a, b: link.id, tier: 1, gl: '⋈', code: 'CON' });   // endpoint_of
    edges.push({ a: link.b, b: link.id, tier: 1, gl: '⋈', code: 'CON' });   // endpoint_of
  }
  nodes.push({
    id: article.id, tier: 1,
    label: article.check.ok ? `Network · ${article.links.length} links` : 'Network (not yet coherent)',
    kind: 'network', terrain: 'Network', t: 0,
    note: article.characteristicFailure || null,
  });
  for (const link of article.links)
    edges.push({ a: link.id, b: article.id, tier: 1, gl: '△', code: 'SYN' });   // member_of
  return { nodes, edges, article };
};
