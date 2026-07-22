// EO: EVA·DEF(Network,Link → Lens, Tracing,Binding) — Research Review: connections, identity, and
// the typed source network (docs/research-review.md §7.2, §7.3, §7.4). The connections/identity
// half of research-review.js's read (split for the god-module ratchet, ~250 lines/file): given the
// clusters/areas/links computed there, this names WHY two candidates are connected (never one
// generic "related" edge), lists the cross-source referent matches a reader must confirm or reject
// before admission, and lets a reader override a computed duplicate-cluster judgment.
//
// Pure and model-free, same discipline as research-review.js.

import { witnessDescriptor } from '../../enactor/ground/index.js';
import { clusterOf, referentCoreGroups } from './research-review.js';

// matchReason(a, b) → WHICH identity fact fused two witness descriptors, or null. sameWitness
// (research-review.js's clusterDuplicates) only answers yes/no; sourceNetwork needs the reason to
// label an edge 'mirrors' (a byte-identical reprint) versus 'derives from' (same publisher or
// byline, reworded). Checked in the same priority order sameWitness itself checks.
export const matchReason = (a, b) => {
  if (!a || !b) return null;
  if (a.id != null && a.id === b.id) return 'id';
  if (a.hash && b.hash && a.hash === b.hash) return 'hash';
  if (a.host && b.host && a.host === b.host) return 'host';
  if (a.author && b.author && a.author === b.author) return 'author';
  return null;
};

// applyIndependentOverrides(clusters, overrideSns) → clusters with each overridden sn pulled out of
// its cluster into its own singleton — the "Mark as independent" action (§7.4). sameWitness matched
// a real identity fact; overriding it is a reader's judgment call, not a correction to the fact
// itself, so clusterDuplicates' own output is untouched — this only reshapes what the reader
// currently sees, the same discipline excludedSns already holds for admission.
export const applyIndependentOverrides = (clusters, overrideSns) => {
  const overrides = new Set(overrideSns || []);
  if (!overrides.size) return clusters;
  const out = [];
  for (const c of clusters) {
    const kept = c.members.filter((m) => !overrides.has(m.sn));
    const pulled = c.members.filter((m) => overrides.has(m.sn));
    if (kept.length) {
      const sorted = kept.slice().sort((a, b) => (a.retrieved || '').localeCompare(b.retrieved || ''));
      out.push({ members: sorted, origin: sorted[0], derivative: sorted.slice(1) });
    }
    for (const m of pulled) out.push({ members: [m], origin: m, derivative: [] });
  }
  return out;
};

// identityCandidates(rows, entityRows) → the reviewable cross-source referent-identity list (§7.3):
// one row per referent core that TWO OR MORE reviewed candidates share, always starting 'candidate'
// — refCore is a shared-vocabulary heuristic, never proof that "MTA" in one source and "MTA" in
// another name the same entity, so the engine never asserts 'aligned' on its own. A caller layers
// persisted user decisions (reviewSetIdentity) on top.
export const identityCandidates = (rows, entityRows) => referentCoreGroups(rows, entityRows)
  .filter((g) => g.sns.length >= 2)
  .map((g) => ({ key: g.core, label: g.chip.label, docId: g.chip.docId, entId: g.chip.entId, sns: g.sns, state: 'candidate' }))
  .sort((a, b) => b.sns.length - a.sns.length);

// connectionNarrative(rows, clusters, links) → a handful of readable sentences naming the shape of
// the graph, BEFORE any interactive view — "readable, not graph-first" (docs/research-review.md).
export const connectionNarrative = (rows, clusters, links) => {
  const bySn = new Map((rows || []).map((r) => [r.sn, r]));
  const lines = [];
  for (const c of clusters || []) {
    if (c.derivative.length === 0) continue;
    const originTitle = c.origin.title || c.origin.domain || c.origin.sn;
    const names = c.derivative.map((d) => d.title || d.domain || d.sn);
    lines.push(`${originTitle} appears to be the origin ${c.derivative.length === 1 ? 'source' : 'for ' + c.derivative.length + ' others'}${names.length ? ' — ' + names.join(', ') : ''}.`);
  }
  for (const l of (links || []).slice(0, 5)) {
    const a = bySn.get(l.a), b = bySn.get(l.b);
    if (!a || !b) continue;
    const names = [...new Set(l.shared.map((s) => s.label))].slice(0, 3).join(', ');
    lines.push(`${a.title || a.sn} and ${b.title || b.sn} share ${l.sharedCount} referent${l.sharedCount === 1 ? '' : 's'}${names ? ' — ' + names : ''}.`);
  }
  return lines;
};

// sourceNetwork(rows, { clusters, links, matrix, areas }) → { edges:[{a,b,type,label,why}], total,
// truncated } — the typed connections of §7.2. Every edge type is grounded in something already
// computed in research-review.js or comparisonMatrix/evidenceAreas; import/citation, semantic
// agreement, and origin dependence are never collapsed into one generic "related" edge.
const EDGE_CAP = 60;
export const sourceNetwork = (rows, { clusters = [], links = [], matrix = null, areas = [] } = {}) => {
  const bySn = new Map((rows || []).map((r) => [r.sn, r]));
  const edges = [];
  const seen = new Set();
  const push = (a, b, type, label, why) => {
    const k = `${[String(a), String(b)].sort().join('|')}::${type}`;
    if (seen.has(k)) return;
    seen.add(k);
    edges.push({ a, b, type, label, why });
  };

  // mirrors / derives from — the duplicate clusters, reasoned by WHICH identity fact matched.
  for (const c of clusters) {
    if (!c.derivative.length) continue;
    const originDesc = witnessDescriptor(c.origin);
    for (const d of c.derivative) {
      const reason = matchReason(originDesc, witnessDescriptor(d));
      const type = reason === 'hash' ? 'mirrors' : 'derives from';
      const label = type === 'mirrors' ? 'byte-identical content' : reason === 'host' ? 'same publisher' : reason === 'author' ? 'same byline' : 'same source-of-record';
      push(c.origin.sn, d.sn, type, label, `${d.title || d.sn} ${type} ${c.origin.title || c.origin.sn}`);
    }
  }

  // shares a referent / corroborates independently — every pair sharedReferentLinks found.
  const clusterOfSn = (sn) => clusterOf(sn, clusters);
  for (const l of links) {
    push(l.a, l.b, 'shares a referent', [...new Set(l.shared.map((s) => s.label))].slice(0, 3).join(', '),
      `${l.sharedCount} shared referent${l.sharedCount === 1 ? '' : 's'}`);
    const ca = clusterOfSn(l.a), cb = clusterOfSn(l.b);
    if (!ca || !cb || ca !== cb) {
      push(l.a, l.b, 'corroborates independently', 'independent origins, same referent', 'different clusters, same referent');
    }
  }

  // shares a measure / contests — every pair present in the same comparisonMatrix row.
  if (matrix && matrix.rows) {
    for (const row of matrix.rows) {
      const present = row.cells.filter((c) => c && bySn.has(c.source)).map((c) => c.source);
      for (let i = 0; i < present.length; i++) for (let j = i + 1; j < present.length; j++) {
        push(present[i], present[j], row.conflict ? 'contests' : 'shares a measure', row.measureLabel, row.reading);
      }
    }
  }

  // covers the same event — same evidence area, when no referent link was already drawn between
  // them (a weaker, topic-level co-membership signal, kept distinct from the entity-grounded one).
  const hasReferentEdge = (a, b) => edges.some((e) => e.type === 'shares a referent'
    && ((e.a === a && e.b === b) || (e.a === b && e.b === a)));
  for (const area of areas) {
    const list = area.sns;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      if (hasReferentEdge(list[i], list[j])) continue;
      push(list[i], list[j], 'covers the same event', area.label, `both reviewed in the "${area.label}" evidence area`);
    }
  }

  edges.sort((a, b) => (b.type === 'contests') - (a.type === 'contests'));
  return { edges: edges.slice(0, EDGE_CAP), total: edges.length, truncated: edges.length > EDGE_CAP };
};
