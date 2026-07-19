// EO: EVA·SYN(Network,Field → Lens, Tracing,Composing) — Research Review: corpus selection.
// The decide/narrate half of research-review.js (split for the god-module ratchet, ~250
// lines/file): given the read computed there (clusters, evidence areas, connections), this picks
// SUBSETS of the reviewed candidates — the corpus recipes — and the reportable numbers a header or
// a "what your selected corpus would contain" preview shares. researchReview() is the one entrance
// a caller needs; everything above it is exported too, for direct testing.
//
// Pure and model-free, same discipline as research-review.js.

import {
  clusterDuplicates, clusterOf, evidenceAreas, coverageDots, sharedReferentLinks,
  researchReading, isPrimary, candidateRole,
} from './research-review.js';
import {
  connectionNarrative, identityCandidates, sourceNetwork, applyIndependentOverrides,
} from './research-review-network.js';
import { evidenceMatrix as buildEvidenceMatrix } from './research-review-matrix.js';

// ── corpus stats (the header count AND the selected-corpus preview share this) ───────────────

// corpusStats(rows, { matrix, entities, clusters, identity, areas }) → the reportable numbers for a
// set of rows — used both for the header ("12 candidates reviewed · 7 independent origins") and for
// the selected-corpus preview (§5.7), so the two never drift apart. `clusters`/`identity`/`areas`
// are optional pre-computed inputs (a caller scoping to a subset passes its own, so this never
// silently recomputes clusters over the full reviewed set when the caller meant only the selection).
export const corpusStats = (rows, { matrix = null, entities = [], clusters = null, identity = null, areas = null } = {}) => {
  const cl = clusters || clusterDuplicates(rows);
  const kinds = new Set(rows.map((r) => r.kind || 'web'));
  const sns = new Set(rows.map((r) => r.sn));
  const sharedReferents = (entities || []).filter((e) => (e.instances || []).filter((i) => sns.has(i.sn)).length > 1).length;
  const measureRows = matrix && matrix.rows ? matrix.rows.filter((r) => r.cells.some((c) => c && sns.has(c.source))) : [];
  const out = {
    sourceCount: rows.length,
    independentOrigins: cl.length,
    sourceTypeCount: kinds.size,
    sharedReferents,
    comparableMeasures: measureRows.length,
    disagreements: measureRows.filter((r) => r.conflict).length,
    clusters: cl,
  };
  if (identity) out.unresolvedIdentityCount = identity.filter((c) => c.state === 'candidate').length;
  // comparablePropositions — evidence areas resting on ≥2 independent origins: the qualitative
  // counterpart to comparableMeasures, read off evidenceAreas' own independentOrigins number.
  if (areas) out.comparablePropositions = areas.filter((a) => a.independentOrigins >= 2).length;
  return out;
};

// ── corpus recipes ────────────────────────────────────────────────────────────────────────────

// A recipe picks a SUBSET of sns and says why. Every recipe keeps at least one member per evidence
// area that has any independent origin at all, so no recipe silently drops a whole area of coverage.
const keepOnePerArea = (rows, areas, rank) => {
  const kept = new Set();
  for (const a of areas) {
    const members = a.sns.map((sn) => rows.find((r) => r.sn === sn)).filter(Boolean);
    if (!members.length) continue;
    const best = members.slice().sort(rank)[0];
    if (best) kept.add(best.sn);
  }
  return kept;
};

export const corpusRecipes = (rows, { areas = [], clusters = [], matrix = null } = {}) => {
  const clusterOfSn = (sn) => clusterOf(sn, clusters);
  const RECIPES = {};

  // Balanced — one independent origin per evidence area, preferring the origin of a cluster (not a
  // derivative copy) and, once that's settled, a primary source over a secondary one.
  const balancedRank = (a, b) => {
    const ca = clusterOfSn(a.sn), cb = clusterOfSn(b.sn);
    const aOrigin = ca ? ca.origin.sn === a.sn : true, bOrigin = cb ? cb.origin.sn === b.sn : true;
    if (aOrigin !== bOrigin) return aOrigin ? -1 : 1;
    const aPrim = isPrimary(a, ca), bPrim = isPrimary(b, cb);
    if (aPrim !== bPrim) return aPrim ? -1 : 1;
    return 0;
  };
  const balanced = keepOnePerArea(rows, areas, balancedRank);
  // A second, distinct interpretation per area where one exists, so Balanced is not "smallest" in
  // disguise — add one non-primary member per area beyond the first when the area has ≥2 origins.
  for (const a of areas) {
    if (a.independentOrigins < 2) continue;
    const members = a.sns.map((sn) => rows.find((r) => r.sn === sn)).filter(Boolean).sort(balancedRank);
    if (members[1]) balanced.add(members[1].sn);
  }
  RECIPES.balanced = { sns: [...balanced], why: 'One independent origin per evidence area, plus a second distinct interpretation where the area has more than one — the fewest sources that still show where the record agrees and where it splits.' };

  // Primary evidence — every source that reads as primary (agency/official/dataset/PDF, or the
  // apparent origin of a derivative cluster), regardless of area.
  const primary = rows.filter((r) => isPrimary(r, clusterOfSn(r.sn))).map((r) => r.sn);
  const fallback = [...keepOnePerArea(rows, areas, balancedRank)];
  RECIPES.primary = { sns: primary.length ? primary : fallback, why: primary.length ? 'Official datasets, filings, and the apparent origin of each derivative cluster — the record’s own account, not reporting on it.' : 'No source reads as primary by domain or file type; falling back to one origin per area.' };

  // Smallest sufficient — the fewest sources covering every evidence area at all (one per area,
  // cheapest tie-break: whichever was retrieved first).
  const smallest = keepOnePerArea(rows, areas, (a, b) => (a.retrieved || '').localeCompare(b.retrieved || ''));
  RECIPES.smallest = { sns: [...smallest], why: 'The fewest sources that still touch every evidence area currently detected — coverage, not corroboration.' };

  // Perspectives — one source per independent origin (a duplicate cluster already fuses mirrors,
  // reprints, and same-byline syndication — see clusterDuplicates), maximizing how many distinct
  // voices the corpus carries even at the cost of redundant coverage.
  RECIPES.perspectives = { sns: clusters.map((c) => c.origin.sn), why: 'One source per independent origin — maximizes how many different voices the corpus carries, even at the cost of redundant coverage.' };

  // Contradiction-seeking — every source behind a disagreeing measure, plus one per area as a floor.
  const disputed = new Set();
  if (matrix && matrix.rows) for (const row of matrix.rows) if (row.conflict) for (const c of row.cells) if (c) disputed.add(c.source);
  const contradiction = new Set([...disputed, ...keepOnePerArea(rows, areas, balancedRank)]);
  RECIPES.contradiction = { sns: [...contradiction], why: disputed.size ? 'Every source behind a measured disagreement, plus one source per area so the contested claims stay in context.' : 'No measured disagreement was detected in this candidate set; showing one source per area instead.' };

  // Historical — maximizes chronology, revisions, and primary records across time: the earliest AND
  // latest member of every area (the record read as a timeline, not a single snapshot), every
  // source behind a stated revision (a matrix row whose value changed), and every primary record.
  const chronoSort = (a, b) => (a.retrieved || '').localeCompare(b.retrieved || '');
  const historical = new Set();
  for (const a of areas) {
    const members = a.sns.map((sn) => rows.find((r) => r.sn === sn)).filter(Boolean).sort(chronoSort);
    if (members[0]) historical.add(members[0].sn);
    if (members.length > 1) historical.add(members[members.length - 1].sn);
  }
  if (matrix && matrix.rows) for (const row of matrix.rows) if (row.changed) for (const c of row.cells) if (c) historical.add(c.source);
  for (const r of rows) if (isPrimary(r, clusterOfSn(r.sn))) historical.add(r.sn);
  RECIPES.historical = { sns: [...historical], why: 'The earliest and latest source in every evidence area, every source behind a stated revision, and every primary record — the corpus read as a timeline, not a single snapshot.' };

  return RECIPES;
};

// ── gap-directed research (§9) ────────────────────────────────────────────────────────────────

// evidenceGaps(areas) → { strong, partial, missing } — tiers the ALREADY-DETECTED areas by how many
// independent origins currently support them. This never claims a topic the corpus hasn't touched
// at all — the engine has no taxonomy of what a topic SHOULD cover, so "missing" here always means
// "thin", never "known to be absent" (a distinction docs/research-review.md's own honesty discipline
// requires: no fabricated coverage judgment).
export const evidenceGaps = (areas) => {
  const strong = [], partial = [], missing = [];
  for (const a of areas || []) {
    if (a.independentOrigins >= 3) strong.push(a);
    else if (a.independentOrigins === 2) partial.push(a);
    else missing.push(a);
  }
  return { strong, partial, missing };
};

// gapSearchQueries(baseQuery, area) → the narrowly-scoped search actions §9 offers for a thin area —
// deterministic query templates over the review's own query and the area's own detected vocabulary,
// never a fabricated guess at what dataset or agency might exist.
export const gapSearchQueries = (baseQuery, area) => {
  const terms = ((area && area.terms) || []).join(' ');
  const base = String(baseQuery || '').trim();
  const q = (suffix) => `${base} ${terms} ${suffix}`.replace(/\s+/g, ' ').trim();
  return {
    dataset: q('dataset'),
    opposing: q('criticism OR opposition OR against'),
    government: q('site:.gov'),
    academic: q('study OR research'),
    measure: q('data figures'),
  };
};

// ── the lead excerpt (an answer-first read, model-free) ──────────────────────────────────────

// leadExcerpt(rows, max) → { sn, title, domain, url, text, truncated } | null — the opening of the
// top-ranked reviewed candidate's own text, verbatim, cut near `max` chars at a sentence boundary.
// For a plain factual question ("who is X", "what is Y") the top source's own lead paragraph
// already IS the answer — quoting it beats composing a fresh sentence that risks saying something
// the source didn't. `rows` arrives in fetch order (the search engine's own rank), so rows[0] is
// the top hit — the same "the first result is the best guess" prior a search box already leans on.
export const leadExcerpt = (rows, max = 600) => {
  const row = (rows || []).find((r) => r && String(r.text || '').trim().length > 40);
  if (!row) return null;
  const text = String(row.text).trim();
  if (text.length <= max) return { sn: row.sn, title: row.title, domain: row.domain, url: row.url, text, truncated: false };
  const win = text.slice(0, max);
  const sentEnd = /[.!?](?=[)\]"'”’]?\s)/g;
  let cut = -1, m;
  while ((m = sentEnd.exec(win))) cut = m.index + 1;
  if (cut < max * 0.4) cut = win.lastIndexOf(' ');
  if (cut <= 0) cut = win.length;
  return { sn: row.sn, title: row.title, domain: row.domain, url: row.url, text: text.slice(0, cut).trim(), truncated: true };
};

// ── the one entrance ─────────────────────────────────────────────────────────────────────────

// researchReview({ rows, entities, matrix, query, independentOverrides, identityDecisions,
// excludedSns }) → everything a Research Review screen renders, computed once. `rows` are REVIEWED
// candidates: { sn, title, domain, url, kind, retrieved, text }. `entities` is
// app.entities({merge:true}) scoped to the review topic; `matrix` is app.comparisonMatrix() scoped
// to the same topic. `independentOverrides`/`identityDecisions` are the persisted user judgments
// from §7.3/§7.4; `excludedSns` is the CURRENT proposed-corpus scope (§3.4) — the evidence matrix
// and the selected-corpus stats are scoped to it (the spec is explicit that those two are "selected
// candidates" / "corpus preview" numbers), while the evidence map, connections, and gaps stay a
// stable read of everything reviewed so the screen does not reshuffle on every checkbox click.
export const researchReview = ({
  rows = [], entities = [], matrix = null, query = '',
  independentOverrides = [], identityDecisions = {}, excludedSns = [],
} = {}) => {
  const rawClusters = clusterDuplicates(rows);
  const clusters = applyIndependentOverrides(rawClusters, independentOverrides);
  const areas = evidenceAreas(rows);
  const links = sharedReferentLinks(rows, entities);
  const identity = identityCandidates(rows, entities).map((c) => ({ ...c, state: identityDecisions[c.key] || 'candidate' }));
  const reading = researchReading({ rows, areas, clusters, matrix, query });
  const narrative = connectionNarrative(rows, clusters, links);
  const recipes = corpusRecipes(rows, { areas, clusters, matrix });
  const stats = corpusStats(rows, { matrix, entities, clusters, identity, areas });
  const network = sourceNetwork(rows, { clusters, links, matrix, areas });
  const gaps = evidenceGaps(areas);
  const maxArea = areas.reduce((m, a) => Math.max(m, a.sourceCount), 0);
  const areasWithDots = areas.map((a) => ({ ...a, dots: coverageDots(a.sourceCount, maxArea) }));
  const cards = rows.map((row) => ({
    row, role: candidateRole(row, { cluster: clusterOf(row.sn, clusters), areas, matrix }),
  }));

  const excluded = excludedSns instanceof Set ? excludedSns : new Set(excludedSns || []);
  const selectedRows = rows.filter((r) => !excluded.has(r.sn));
  const selectedClusters = clusterDuplicates(selectedRows);
  const selectedAreas = evidenceAreas(selectedRows);
  const selectedIdentity = identity.filter((c) => c.sns.filter((sn) => !excluded.has(sn)).length >= 2);
  const evidenceMatrix = buildEvidenceMatrix(selectedRows, { matrix, areas: selectedAreas, clusters: selectedClusters });
  const selectedStats = corpusStats(selectedRows, { matrix, entities, clusters: selectedClusters, identity: selectedIdentity, areas: selectedAreas });

  const answer = leadExcerpt(rows);

  return {
    rows, clusters, areas: areasWithDots, links, narrative, reading, recipes, stats, cards, query,
    network, identity, gaps, evidenceMatrix, selectedStats, answer,
  };
};
