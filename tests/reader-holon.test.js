import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLedger, assembleQuestionResult, verdictForGroup, holonMeaningData, STANDINGS,
} from '../src/rooms/reader/question-result.js';
import { anchorFor, resolveAnchor } from '../src/rooms/reader/anchor.js';

// The holonic reading layer (docs/EO_MVP_Integration_Guide.md §0). Pure, DOM-free — the two
// projections (ledger outline + orbit) are built from ONE walk of the same paradigm⊃atmosphere⊃lens
// tree, standings are DERIVED from independent origins, and every claim drills down to base spans
// that resolve to an exact source jump. These pin the engine behaviour the surfaces render.

const sp = (sn, host, quote, unit) => ({ sn, host, quote, unit });

// A compact worked corpus: filings FELL (agreed by 3 origins), the CAUSE is contested, judgments void.
const frames = () => [
  { id: 'polic', tier: 'paradigm', label: 'Policy-cause frame', color: '#f0a02a', claims: [
      { text: 'Eviction filings fell about 38% during the moratorium period.', rows: [
          sp('S-1', 'nashville-scene.com', 'Filings dropped sharply once the moratorium took effect.', 0),
          sp('S-2', 'tncourts.gov', 'Total eviction filings fell 38% during the order period.', 0),
          sp('S-5', 'contributor.org', 'Total eviction filings fell during the order period.', 3)] }],
    children: [
      { id: 'advoc', tier: 'atmosphere', label: 'Advocacy', color: '#7c74e6', claims: [
          { text: 'Filing volume tracked the order dates closely.', rows: [sp('S-2', 'tncourts.gov', 'Filing volume tracked the order dates closely.', 1)] }] }] },
  { id: 'court', tier: 'paradigm', label: 'Court-backlog frame', color: '#e8842a', claims: [
      { text: 'A court backlog, not the order, drove the decline in cases.', standing: 'contested',
        rival: { text: 'The moratorium caused the decline.', sns: ['S-1', 'S-4'] },
        rows: [sp('S-5', 'contributor.org', 'A court backlog, not the order, drove the decline in cases.', 0)] }] },
  { id: 'uncovered', tier: 'paradigm', label: 'Uncovered', void: true, claims: [
      { text: 'No source covers eviction judgments — only filings appear in scope.', quote: '' }] },
];
const sources = () => [{ sn: 'S-1', active: true }, { sn: 'S-2', active: true }, { sn: 'S-4', active: true }, { sn: 'S-5', active: true }];

test('verdictForGroup — origins, not passages: two passages from one origin is single-source', () => {
  assert.equal(verdictForGroup({ support: [sp('S-1', 'h', 'q', 0), sp('S-1', 'h', 'q2', 1)] }).standing, 'single-source');
  assert.equal(verdictForGroup({ support: [sp('S-1', 'a', 'q', 0), sp('S-2', 'b', 'q', 0)] }).standing, 'corroborated');
  assert.equal(verdictForGroup({ support: [], contest: [] }).standing, 'void');
});

test('buildLedger — preserves the holon nesting and attaches derived standings', () => {
  const l = buildLedger({ query: 'q', frames: frames() });
  const byId = l.byId;
  assert.equal(byId.polic.tier, 'paradigm');
  assert.equal(byId.advoc.tier, 'atmosphere');
  assert.equal(byId.advoc.parentId, 'polic');
  // three independent origins agree → corroborated
  assert.equal(byId.polic.claims[0].standing, 'corroborated');
  assert.equal(byId.polic.claims[0].origins, 3);
  // one origin → single-source
  assert.equal(byId.advoc.claims[0].standing, 'single-source');
  // explicit cross-frame rival → contested (not derived-void)
  assert.equal(byId.court.claims[0].standing, 'contested');
  assert.deepEqual(byId.court.claims[0].rival.sns, ['S-1', 'S-4']);
  // void frame → void standing, asked-not-answerable
  assert.equal(byId.uncovered.claims[0].standing, 'void');
});

test('buildLedger — each claim carries base spans sufficient to resolve a source jump', () => {
  const l = buildLedger({ query: 'q', frames: frames() });
  const spans = l.byId.polic.claims[0].spanRefs;
  assert.equal(spans.length, 3);
  for (const s of spans) { assert.ok(s.sn, 'span has a source id'); assert.ok(s.quote, 'span has verbatim text'); }
  assert.deepEqual(l.byId.polic.claims[0].sourceIds.sort(), ['S-1', 'S-2', 'S-5']);
});

test('buildLedger — no frame tree degrades to one default paradigm, never fabricated', () => {
  const l = buildLedger({ query: 'q', claims: [sp('S-1', 'h', 'A thing was stated.', 0)] });
  assert.equal(l.nodes.length, 1);
  assert.equal(l.nodes[0].tier, 'paradigm');
  assert.equal(l.nodes[0].claims.length, 1);
});

test('assembleQuestionResult — convergence is Σ of the standings in scope', () => {
  const r = assembleQuestionResult({ query: 'q', frames: frames(), sources: sources() });
  const settled = r.ledger.nodes.flatMap((n) => n.claims).filter((c) => STANDINGS[c.standing].bucket === 'settled').length;
  assert.equal(r.convergence.settled, settled);
  assert.equal(r.convergence.settled, 1);   // the one corroborated headline
  assert.equal(r.convergence.contested, 1); // the court-backlog rival
  assert.ok(r.convergence.void >= 2);        // single-source + void both read unsettled
  assert.equal(r.sourceScope.total, 4);
  assert.equal(r.sourceScope.independentOrigins, 3);
});

test('assembleQuestionResult — a source toggle recomputes the verdict in place (spec §33)', () => {
  const full = assembleQuestionResult({ query: 'q', frames: frames(), sources: sources() });
  assert.equal(full.ledger.byId.polic.claims[0].standing, 'corroborated');
  // drop S-2 and S-5 → only S-1 still witnesses the headline → single-source
  const scoped = assembleQuestionResult({ query: 'q', frames: frames(), sources: sources(), activeSourceIds: ['S-1', 'S-4'] });
  assert.equal(scoped.ledger.byId.polic.claims[0].standing, 'single-source');
  assert.equal(scoped.convergence.settled, 0);
  assert.equal(scoped.sourceScope.active, 2);
});

test('holonMeaningData — the SAME tree as the orbit projection, with a base-span floor', () => {
  const r = assembleQuestionResult({ query: 'Did filings fall?', frames: frames(), sources: sources() });
  const m = r.meaning;
  assert.equal(m.centreId, 'q');
  assert.ok(m.nodes.find((n) => n.id === 'q' && n.kind === 'entity'), 'question is the sun');
  // every claim is a tier-2 orbiting body; every frame a tier-1 bonded body
  assert.ok(m.nodes.some((n) => n.tier === 2 && n.kind === 'claim'));
  assert.ok(m.nodes.some((n) => n.tier === 1 && n.kind === 'frame'));
  // the base spans are carried for the existence level (the click-down floor)
  assert.ok(m.spans.length >= 3);
  for (const s of m.spans) assert.ok(s.text && s.sn, 'a span has verbatim text and a source');
});

test('base span → exact source jump: the descent bottoms out in real resolution (anchor.js)', () => {
  const src = { sn: 'S-2', docId: 'd2', sha: 'sha-2', text: 'Total eviction filings fell 38% during the order period. The order ended in July.' };
  const l = buildLedger({ query: 'q', frames: [{ id: 'p', tier: 'paradigm', label: 'P', claims: [
    { text: 'Filings fell 38%.', rows: [sp('S-2', 'tncourts.gov', 'Total eviction filings fell 38% during the order period.', 0)] }] }] });
  const span = l.byId.p.claims[0].spanRefs[0];
  const anchor = anchorFor({ src, quote: span.quote });
  assert.ok(anchor, 'an anchor mints from the base span');
  const res = resolveAnchor(anchor, src);
  assert.equal(res.status, 'exact', 'the span resolves to an exact offset in the source');
  assert.equal(res.jump.sn, 'S-2');
  assert.ok(res.text.includes('38%'));
});
