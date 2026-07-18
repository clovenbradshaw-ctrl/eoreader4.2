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
  connectionNarrative, researchReading, isPrimary, candidateRole,
} from './research-review.js';

// ── corpus stats (the header count AND the selected-corpus preview share this) ───────────────

// corpusStats(rows, { matrix, entities }) → the reportable numbers for a set of rows — used both
// for "12 candidates reviewed · 7 independent origins" and for "what your selected corpus would
// contain", so the two never drift apart.
export const corpusStats = (rows, { matrix = null, entities = [] } = {}) => {
  const clusters = clusterDuplicates(rows);
  const kinds = new Set(rows.map((r) => r.kind || 'web'));
  const sns = new Set(rows.map((r) => r.sn));
  const sharedReferents = (entities || []).filter((e) => (e.instances || []).filter((i) => sns.has(i.sn)).length > 1).length;
  const measureRows = matrix && matrix.rows ? matrix.rows.filter((r) => r.cells.some((c) => c && sns.has(c.source))) : [];
  return {
    sourceCount: rows.length,
    independentOrigins: clusters.length,
    sourceTypeCount: kinds.size,
    sharedReferents,
    comparableMeasures: measureRows.length,
    disagreements: measureRows.filter((r) => r.conflict).length,
    clusters,
  };
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

  return RECIPES;
};

// ── the one entrance ─────────────────────────────────────────────────────────────────────────

// researchReview({ rows, entities, matrix, query }) → everything a Research Review screen renders,
// computed once. `rows` are REVIEWED candidates: { sn, title, domain, url, kind, retrieved, text }.
// `entities` is app.entities({merge:true}) scoped to the review topic; `matrix` is
// app.comparisonMatrix() scoped to the same topic.
export const researchReview = ({ rows = [], entities = [], matrix = null, query = '' } = {}) => {
  const clusters = clusterDuplicates(rows);
  const areas = evidenceAreas(rows);
  const links = sharedReferentLinks(rows, entities);
  const reading = researchReading({ rows, areas, clusters, matrix, query });
  const narrative = connectionNarrative(rows, clusters, links);
  const recipes = corpusRecipes(rows, { areas, clusters, matrix });
  const stats = corpusStats(rows, { matrix, entities });
  const maxArea = areas.reduce((m, a) => Math.max(m, a.sourceCount), 0);
  const areasWithDots = areas.map((a) => ({ ...a, dots: coverageDots(a.sourceCount, maxArea) }));
  const cards = rows.map((row) => ({
    row, role: candidateRole(row, { cluster: clusterOf(row.sn, clusters), areas, matrix }),
  }));
  return { rows, clusters, areas: areasWithDots, links, narrative, reading, recipes, stats, cards, query };
};
