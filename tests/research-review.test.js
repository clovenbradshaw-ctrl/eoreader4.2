import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  topTerms, clusterDuplicates, independentOriginCount, clusterOf, evidenceAreas, coverageDots,
  sharedReferentLinks, researchReading, isPrimary, candidateRole,
} from '../src/rooms/reader/research-review.js';
import {
  connectionNarrative, identityCandidates, sourceNetwork, applyIndependentOverrides,
} from '../src/rooms/reader/research-review-network.js';
import { evidenceMatrix } from '../src/rooms/reader/research-review-matrix.js';
import { corpusStats, corpusRecipes, researchReview, evidenceGaps, gapSearchQueries } from '../src/rooms/reader/research-review-corpus.js';

// Research Review (docs/research-review.md): a search result becomes a provisional, inspectable
// corpus — evidence areas, duplicate/derivative clusters, connections, agreements/disagreements,
// corpus recipes, all computed off reviewed candidates. Pure — fixtures stand in for the app.

const MTA_TEXT = 'The Metropolitan Transportation Authority congestion pricing program reduced vehicle entries into the zone. '
  + 'Traffic volume declined by 11 percent in the first ninety days. Revenue collected reached $48.6 million.';
const NEWS_TEXT = 'Congestion pricing traffic volume dropped after the MTA program launched, officials said. '
  + 'The agency reported vehicle entries fell by 11 percent, citing the same first quarterly release.';
const COMPTROLLER_TEXT = 'An independent comptroller analysis of the congestion pricing program found revenue of $51 million, '
  + 'higher than the agency projection. The audit reviewed toll collection records directly.';
const LEGAL_TEXT = 'A state court filing challenges the congestion pricing program on environmental grounds. '
  + 'The lawsuit names the transportation authority and seeks an injunction against the toll zone.';

const ROWS = [
  { sn: 'S1', title: 'MTA Congestion Relief Zone: First 90 Days', domain: 'mta.gov', url: 'https://mta.gov/report', kind: 'pdf', retrieved: '2026-04-01T00:00:00Z', text: MTA_TEXT, hash: 'mta-report-hash-1' },
  { sn: 'S2', title: 'Traffic drops after congestion pricing launch', domain: 'newswire1.test', url: 'https://newswire1.test/a', kind: 'web', retrieved: '2026-04-02T00:00:00Z', text: NEWS_TEXT },
  { sn: 'S3', title: 'Comptroller audits congestion pricing revenue', domain: 'comptroller.ny.gov', url: 'https://comptroller.ny.gov/audit', kind: 'web', retrieved: '2026-04-03T00:00:00Z', text: COMPTROLLER_TEXT },
  { sn: 'S4', title: 'Court filing challenges congestion pricing', domain: 'courtwire2.test', url: 'https://courtwire2.test/x', kind: 'web', retrieved: '2026-04-04T00:00:00Z', text: LEGAL_TEXT },
];

// A byte-identical reprint of S1 on a DIFFERENT, non-.gov host — clusters with S1 by content hash
// (sameWitness), not by domain, so the domain heuristic alone would never flag it primary.
const ROWS_WITH_MIRROR = [
  ...ROWS,
  { sn: 'S5', title: 'MTA Congestion Relief Zone (syndicated copy)', domain: 'mirror-syndicate.test', url: 'https://mirror-syndicate.test/copy', kind: 'web', retrieved: '2026-04-05T00:00:00Z', text: MTA_TEXT, hash: 'mta-report-hash-1' },
];

const ENTITIES = [
  { label: 'MTA', docId: 'd1', entId: 'e1', instances: [{ sn: 'S1' }, { sn: 'S2' }, { sn: 'S3' }] },
  { label: 'congestion pricing', docId: 'd1', entId: 'e2', instances: [{ sn: 'S1' }, { sn: 'S2' }, { sn: 'S3' }, { sn: 'S4' }] },
];

test('topTerms — salient tokens, stopwords and short words dropped', () => {
  const terms = topTerms('The traffic volume declined and the traffic volume was measured again', 5).map((t) => t.term);
  assert.ok(terms.includes('traffic'));
  assert.ok(terms.includes('volume'));
  assert.ok(!terms.includes('the'), 'stopword excluded');
  assert.ok(!terms.includes('was'), 'stopword excluded');
});

test('clusterDuplicates — distinct hosts stay independent, no content-similarity fusion', () => {
  const clusters = clusterDuplicates(ROWS);
  assert.equal(clusters.length, 4, 'four distinct hosts, four independent origins — even though S1/S2 share facts');
  assert.equal(independentOriginCount(ROWS), 4);
});

test('clusterDuplicates — same registrable host collapses to one origin with a derivative', () => {
  const clusters = clusterDuplicates(ROWS_WITH_MIRROR);
  assert.equal(independentOriginCount(ROWS_WITH_MIRROR), 4, 'S1 and S5 (both mta.gov) collapse to one voice');
  const mtaCluster = clusterOf('S1', clusters);
  assert.ok(mtaCluster);
  assert.equal(mtaCluster.members.length, 2);
  assert.equal(mtaCluster.origin.sn, 'S1', 'earliest retrieved is the apparent origin');
  assert.equal(mtaCluster.derivative[0].sn, 'S5');
});

test('evidenceAreas — clusters by shared vocabulary, labels are the shared terms', () => {
  const areas = evidenceAreas(ROWS);
  assert.ok(areas.length >= 1);
  const traffic = areas.find((a) => a.terms.includes('traffic') || a.terms.includes('congestion'));
  assert.ok(traffic, 'a traffic/congestion area was found');
  assert.ok(traffic.sns.length >= 2);
  for (const a of areas) assert.equal(a.independentOrigins, independentOriginCount(a.sns.map((sn) => ROWS.find((r) => r.sn === sn))));
});

test('coverageDots — scales to the largest area, never exceeds 5, never zero for a real area', () => {
  assert.equal(coverageDots(4, 4), 5);
  assert.equal(coverageDots(1, 4), 1);
  assert.equal(coverageDots(0, 4), 0);
});

test('sharedReferentLinks — two sources link when they share a referent core', () => {
  const links = sharedReferentLinks(ROWS, ENTITIES);
  assert.ok(links.length > 0);
  const s1s2 = links.find((l) => (l.a === 'S1' && l.b === 'S2') || (l.a === 'S2' && l.b === 'S1'));
  assert.ok(s1s2);
  assert.ok(s1s2.sharedCount >= 1);
});

test('connectionNarrative — names the apparent origin and shared-referent pairs in readable sentences', () => {
  const clusters = clusterDuplicates(ROWS_WITH_MIRROR);
  const links = sharedReferentLinks(ROWS_WITH_MIRROR, ENTITIES);
  const lines = connectionNarrative(ROWS_WITH_MIRROR, clusters, links);
  assert.ok(lines.some((l) => l.includes('origin')), 'names the derivative relationship');
});

test('researchReading — templated sentences over real numbers, never fabricated prose', () => {
  const areas = evidenceAreas(ROWS);
  const clusters = clusterDuplicates(ROWS);
  const lines = researchReading({ rows: ROWS, areas, clusters, matrix: null, query: 'congestion pricing' });
  assert.ok(lines.length > 0);
  assert.ok(lines[0].includes(String(ROWS.length)), 'the count in the reading is the real row count');
});

test('researchReading — empty candidate set says so plainly, never invents coverage', () => {
  const lines = researchReading({ rows: [], areas: [], clusters: [], matrix: null, query: 'nothing yet' });
  assert.equal(lines.length, 1);
  assert.ok(lines[0].includes('nothing yet'));
});

test('isPrimary — .gov domain, PDF kind, or a cluster origin with derivatives reads as primary', () => {
  const clusters = clusterDuplicates(ROWS_WITH_MIRROR);
  assert.equal(isPrimary(ROWS[0], clusterOf('S1', clusters)), true, '.gov + pdf');
  assert.equal(isPrimary(ROWS[1], clusterOf('S2', clusters)), false, 'plain news domain, no signal');
  assert.equal(isPrimary(ROWS_WITH_MIRROR[4], clusterOf('S5', clusters)), false, 'the derivative, not the origin');
});

test('candidateRole — structural facts, not a bare percentage', () => {
  const areas = evidenceAreas(ROWS);
  const clusters = clusterDuplicates(ROWS);
  const role = candidateRole(ROWS[0], { cluster: clusterOf('S1', clusters), areas, matrix: null });
  assert.ok(Array.isArray(role.contributes));
  assert.equal(typeof role.primary, 'boolean');
  assert.equal(typeof role.independent, 'boolean');
});

test('corpusStats — source count, independent origins, shared referents, all consistent with clusterDuplicates', () => {
  const stats = corpusStats(ROWS_WITH_MIRROR, { matrix: null, entities: ENTITIES });
  assert.equal(stats.sourceCount, 5);
  assert.equal(stats.independentOrigins, 4);
  assert.ok(stats.sharedReferents >= 1);
});

test('corpusRecipes — balanced keeps at least one member per evidence area', () => {
  const areas = evidenceAreas(ROWS);
  const clusters = clusterDuplicates(ROWS);
  const recipes = corpusRecipes(ROWS, { areas, clusters, matrix: null });
  assert.ok(recipes.balanced.sns.length >= 1);
  for (const a of areas) assert.ok(a.sns.some((sn) => recipes.balanced.sns.includes(sn)), `area "${a.label}" has at least one kept source`);
  assert.ok(recipes.balanced.why);
});

test('corpusRecipes — primary favors .gov/pdf sources and cluster origins', () => {
  const areas = evidenceAreas(ROWS);
  const clusters = clusterDuplicates(ROWS);
  const recipes = corpusRecipes(ROWS, { areas, clusters, matrix: null });
  assert.ok(recipes.primary.sns.includes('S1'), 'the MTA PDF is primary');
});

test('corpusRecipes — perspectives keeps one source per independent origin, mirrors excluded', () => {
  const clusters = clusterDuplicates(ROWS_WITH_MIRROR);
  const areas = evidenceAreas(ROWS_WITH_MIRROR);
  const recipes = corpusRecipes(ROWS_WITH_MIRROR, { areas, clusters, matrix: null });
  assert.equal(recipes.perspectives.sns.length, independentOriginCount(ROWS_WITH_MIRROR));
  assert.ok(!(recipes.perspectives.sns.includes('S1') && recipes.perspectives.sns.includes('S5')), 'the syndicated copy is not double-counted — S1 is the cluster origin');
  assert.ok(recipes.perspectives.sns.includes('S1'));
});

test('researchReview — the one entrance composes everything and stays internally consistent', () => {
  const out = researchReview({ rows: ROWS_WITH_MIRROR, entities: ENTITIES, matrix: null, query: 'congestion pricing' });
  assert.equal(out.cards.length, ROWS_WITH_MIRROR.length);
  assert.equal(out.stats.independentOrigins, out.clusters.length);
  assert.ok(out.recipes.balanced && out.recipes.primary && out.recipes.smallest && out.recipes.perspectives && out.recipes.contradiction);
  assert.ok(out.reading.length > 0);
});

// ── §7.2/§7.3/§7.4 — typed source network, identity candidates, cluster overrides ─────────────

const MATRIX = {
  sources: ROWS.map((r) => ({ source: r.sn, label: r.title })),
  rows: [{
    measure: 'revenue', measureLabel: 'Revenue', subject: 'toll', conflict: true, changed: false,
    reading: 'Sources disagree', sourceCount: 2,
    cells: [
      { source: 'S1', sourceLabel: 'MTA', value: 48.6, unit: 'M', raw: '$48.6M', bound: 'exact', transition: null, sentIdx: 2, text: 'Revenue collected reached $48.6 million.', display: '$48.6M' },
      null,
      { source: 'S3', sourceLabel: 'Comptroller', value: 51, unit: 'M', raw: '$51M', bound: 'exact', transition: null, sentIdx: 0, text: 'revenue of $51 million', display: '$51M' },
      null,
    ],
  }],
  counts: { rows: 1, measures: 1, conflicts: 1, sources: 4 },
};

test('sourceNetwork — mirrors (hash match) vs derives-from (host/author match), shares-a-referent, contests', () => {
  const clusters = clusterDuplicates(ROWS_WITH_MIRROR);
  const areas = evidenceAreas(ROWS_WITH_MIRROR);
  const links = sharedReferentLinks(ROWS_WITH_MIRROR, ENTITIES);
  const net = sourceNetwork(ROWS_WITH_MIRROR, { clusters, links, matrix: MATRIX, areas });
  const mirror = net.edges.find((e) => e.type === 'mirrors' && [e.a, e.b].includes('S5'));
  assert.ok(mirror, 'the byte-identical S5 reprint reads as a mirror, not a generic derives-from');
  const referent = net.edges.find((e) => e.type === 'shares a referent' && [e.a, e.b].sort().join() === ['S1', 'S2'].sort().join());
  assert.ok(referent, 'S1/S2 share the MTA referent');
  const contest = net.edges.find((e) => e.type === 'contests' && [e.a, e.b].sort().join() === ['S1', 'S3'].sort().join());
  assert.ok(contest, 'S1/S3 disagree on revenue in the matrix');
  const corroborate = net.edges.find((e) => e.type === 'corroborates independently' && [e.a, e.b].sort().join() === ['S1', 'S3'].sort().join());
  assert.ok(corroborate, 'S1 and S3 share a referent and sit in different clusters — independent corroboration');
});

test('sourceNetwork — never emits duplicate (a,b,type) edges even when multiple signals agree', () => {
  const clusters = clusterDuplicates(ROWS);
  const areas = evidenceAreas(ROWS);
  const links = sharedReferentLinks(ROWS, ENTITIES);
  const net = sourceNetwork(ROWS, { clusters, links, matrix: MATRIX, areas });
  const seen = new Set();
  for (const e of net.edges) {
    const k = `${[e.a, e.b].sort().join('|')}::${e.type}`;
    assert.equal(seen.has(k), false, `duplicate edge ${k}`);
    seen.add(k);
  }
});

test('identityCandidates — only referents shared by ≥2 candidates, always starting "candidate"', () => {
  const ids = identityCandidates(ROWS, ENTITIES);
  assert.ok(ids.length > 0);
  for (const c of ids) {
    assert.ok(c.sns.length >= 2);
    assert.equal(c.state, 'candidate');
  }
});

test('applyIndependentOverrides — pulls the overridden sn into its own singleton cluster', () => {
  const clusters = clusterDuplicates(ROWS_WITH_MIRROR);
  const before = clusterOf('S5', clusters);
  assert.equal(before.members.length, 2, 'S5 starts fused with S1');
  const after = applyIndependentOverrides(clusters, ['S5']);
  const s5 = clusterOf('S5', after);
  const s1 = clusterOf('S1', after);
  assert.equal(s5.members.length, 1, 'S5 is now its own cluster');
  assert.equal(s1.members.length, 1, 'S1 loses its derivative');
  assert.equal(applyIndependentOverrides(clusters, []), clusters, 'no overrides → the same array, untouched');
});

// ── §7.1 — the evidence matrix ──────────────────────────────────────────────────────────────

test('evidenceMatrix — measure rows map conflict/revision/absence to the spec cell-state vocabulary', () => {
  const areas = evidenceAreas(ROWS);
  const clusters = clusterDuplicates(ROWS);
  const m = evidenceMatrix(ROWS, { matrix: MATRIX, areas, clusters });
  const revenueRow = m.rows.find((r) => r.family === 'measure' && r.label === 'Revenue');
  assert.ok(revenueRow);
  assert.equal(revenueRow.cells.S1.state, 'contests');
  assert.equal(revenueRow.cells.S3.state, 'contests');
  assert.equal(revenueRow.cells.S2.state, 'silent', 'no cell for this source in the row');
  assert.equal(m.sources.length, ROWS.length);
});

test('evidenceMatrix — proposition rows: a derivative reads "candidate correspondence", not "supports"', () => {
  const clusters = clusterDuplicates(ROWS_WITH_MIRROR);
  const areas = evidenceAreas(ROWS_WITH_MIRROR);
  const m = evidenceMatrix(ROWS_WITH_MIRROR, { matrix: null, areas, clusters });
  const area = areas.find((a) => a.sns.includes('S5'));
  const row = m.rows.find((r) => r.family === 'proposition' && r.label === area.label);
  assert.equal(row.cells.S5.state, 'candidate correspondence', 'S5 is a derivative of the S1 cluster');
  assert.equal(row.cells.S1.state, 'supports');
});

// ── §9 — gap-directed research ──────────────────────────────────────────────────────────────

test('evidenceGaps — tiers by independentOrigins: Strong ≥3, Partial =2, Missing ≤1', () => {
  const areas = [
    { label: 'a', independentOrigins: 3 }, { label: 'b', independentOrigins: 2 }, { label: 'c', independentOrigins: 1 },
  ];
  const gaps = evidenceGaps(areas);
  assert.deepEqual(gaps.strong.map((a) => a.label), ['a']);
  assert.deepEqual(gaps.partial.map((a) => a.label), ['b']);
  assert.deepEqual(gaps.missing.map((a) => a.label), ['c']);
});

test('gapSearchQueries — deterministic templates over the review query and the area\'s own terms', () => {
  const qs = gapSearchQueries('congestion pricing', { terms: ['equity', 'impacts'] });
  assert.equal(qs.dataset, 'congestion pricing equity impacts dataset');
  assert.equal(qs.government, 'congestion pricing equity impacts site:.gov');
  assert.ok(qs.opposing.includes('criticism'));
});

// ── §8 — the Historical recipe ──────────────────────────────────────────────────────────────

test('corpusRecipes — historical keeps the earliest and latest of every area, plus revisions and primary sources', () => {
  const areas = evidenceAreas(ROWS);
  const clusters = clusterDuplicates(ROWS);
  const recipes = corpusRecipes(ROWS, { areas, clusters, matrix: MATRIX });
  assert.ok(recipes.historical.sns.length >= 1);
  assert.ok(recipes.historical.sns.includes('S1'), 'S1 is primary (.gov + pdf)');
  assert.ok(recipes.historical.why);
});

// ── scope rule (§3.4) — the evidence matrix and selected-corpus stats scope to excludedSns ────

test('researchReview — evidenceMatrix and selectedStats are scoped to the CURRENT selection, not the whole reviewed set', () => {
  const full = researchReview({ rows: ROWS_WITH_MIRROR, entities: ENTITIES, matrix: MATRIX, query: 'q', excludedSns: [] });
  const scoped = researchReview({ rows: ROWS_WITH_MIRROR, entities: ENTITIES, matrix: MATRIX, query: 'q', excludedSns: ['S3', 'S4', 'S5'] });
  assert.equal(full.evidenceMatrix.sources.length, 5);
  assert.equal(scoped.evidenceMatrix.sources.length, 2, 'only S1/S2 remain selected');
  assert.equal(scoped.selectedStats.sourceCount, 2);
  // the whole-reviewed-set read (areas/clusters/network) stays stable across the toggle
  assert.equal(full.areas.length, scoped.areas.length);
});
