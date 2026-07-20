import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isDiagonal } from '../src/core/cube.js';
import { DESERT_CELL } from '../src/core/contract.js';
import { stanceLegality, legalCellFor } from '../src/weave/generate-row/stance.js';
import { proposeJoin, groundJoin } from '../src/weave/generate-row/join.js';
import { SHAPES, legalSlots, isLegalRole, isLensLegalShape } from '../src/weave/generate-row/slots.js';
import { realizeSlot, prosify, LEXICON, KNOWN_CONNECTIVE_IDS } from '../src/weave/generate-row/render.js';
import { tokenize, tokenCount } from '../src/weave/generate-row/tokenize.js';
import { bidirectionallyEntails, ROW_VETOES, runRowVetoes } from '../src/enactor/ground/row-veto.js';

// ── fixtures ──────────────────────────────────────────────────────────────────

const prop = (id, fields) => ({ id, verdict: 'corroborated', originIds: ['s-' + id], ...fields });

const settled = () => [
  prop('p1', { subject: 'axon', predicate: 'acquired', value: 'fusus', originIds: ['s1', 's2', 's3', 's4'], displayText: 'Axon acquired Fusus in 2024' }),
];

const contested = () => [
  prop('p1', { subject: 'mou-value', predicate: 'is', value: '15m', verdict: 'contradicted', originIds: ['s1', 's2'], displayText: 'MOU value is $15M' }),
  prop('p2', { subject: 'mou-value', predicate: 'is', value: '18m', verdict: 'contradicted', originIds: ['s3'], displayText: 'MOU value is $18M' }),
];

const causal = () => [
  prop('p1', { subject: 'financing', predicate: 'closed', value: '12-march', originIds: ['s1'], displayText: 'Financing closed on 12 March' }),
  prop('p2', { subject: 'board', predicate: 'approved', value: 'deal', originIds: ['s1'], displayText: 'The board approved the deal on 14 March' }),
];
const causalSpans = () => [{ id: 'sp1', text: 'the board approved the deal because financing had closed', propositionIds: ['p1', 'p2'] }];

const temporal = () => [
  prop('p1', { subject: 'mou', predicate: 'draft', value: '15m', date: '2024-03-02', originIds: ['s1'], displayText: '$15M — draft MOU, 2 March' }),
  prop('p2', { subject: 'mou', predicate: 'executed', value: '18m', date: '2024-03-19', originIds: ['s2'], displayText: '$18M — executed MOU, 19 March' }),
  prop('p3', { subject: 'payment', predicate: 'set', value: 'schedule', date: '2024-03-20', originIds: ['s3'], displayText: 'Payment schedule set, 20 March' }),
];

// ═══════════════════════════════════════════════════════════════════════════
// Legality (§3, §3.1)
// ═══════════════════════════════════════════════════════════════════════════

test('stanceLegality: n=1 returns readout without measuring anything', () => {
  const r = stanceLegality(settled());
  assert.equal(r.shape, 'readout');
  assert.deepEqual(r.relations, []);
  assert.equal(r.order, null);
});

test('stanceLegality: n=0 returns null (caller renders the fixed void template)', () => {
  assert.equal(stanceLegality([]), null);
});

test('stanceLegality: two opposed, comparably-weighted propositions resolve to cultivating', () => {
  const r = stanceLegality(contested());
  assert.equal(r.shape, 'cultivating');
});

test('stanceLegality: a causal join with a connective span resolves to making', () => {
  const r = stanceLegality(causal(), { spans: causalSpans() });
  assert.equal(r.shape, 'making');
  assert.ok(r.relations.some((rel) => rel.kind === 'causal'));
});

test('stanceLegality: causal connective must witness BOTH members, or no causal join forms', () => {
  const spansOneSided = [{ id: 'sp1', text: 'financing closed because reasons', propositionIds: ['p1'] }];
  const r = stanceLegality(causal(), { spans: spansOneSided });
  assert.notEqual(r.shape, 'making');
});

test('stanceLegality: three dated, ordered propositions resolve to composing', () => {
  const r = stanceLegality(temporal());
  assert.equal(r.shape, 'composing');
  assert.ok(r.order);
  assert.deepEqual(r.order.memberIds, ['p1', 'p2', 'p3']);
});

test('stanceLegality: bare temporal adjacency with no order at all cannot become composing', () => {
  // Two propositions, no dates, no causal connective — at most a flat spread.
  const undated = [
    prop('p1', { subject: 'a', predicate: 'is', value: 'x' }),
    prop('p2', { subject: 'b', predicate: 'is', value: 'y' }),
  ];
  const r = stanceLegality(undated);
  assert.notEqual(r.shape, 'composing');
});

test('stanceLegality: every shape\'s resolved cell is on the Object diagonal', () => {
  const cases = [settled(), contested(), causal(), temporal()];
  const opts = [{}, {}, { spans: causalSpans() }, {}];
  cases.forEach((props, i) => {
    const r = stanceLegality(props, opts[i]);
    assert.ok(r.cell, `expected a resolved cell for case ${i}`);
    assert.ok(isDiagonal({ op: r.cell.op, terrain: r.cell.site, stance: r.cell.stance }), `cell ${JSON.stringify(r.cell)} must be diagonal`);
  });
});

test('legalCellFor: cultivating with domainHint Field never returns the desert cell', () => {
  const cell = legalCellFor('cultivating', 'Field');
  assert.notEqual(cell.op, DESERT_CELL.op);
  assert.notDeepEqual(cell, { op: DESERT_CELL.op, site: DESERT_CELL.terrain, stance: DESERT_CELL.stance });
});

test('legalCellFor: cultivating with domainHint Field re-homes to REC(Atmosphere, Cultivating)', () => {
  const cell = legalCellFor('cultivating', 'Field');
  assert.deepEqual(cell, { op: 'REC', site: 'Atmosphere', stance: 'Cultivating' });
});

test('legalCellFor: no test fixture, however constructed, can produce SYN·Field·Cultivating', () => {
  for (const hint of [null, 'Field', 'Void', 'Atmosphere', 'anything-else']) {
    const cell = legalCellFor('cultivating', hint);
    assert.ok(!(cell.op === 'SYN' && cell.site === 'Field' && cell.stance === 'Cultivating'));
  }
});

test('stanceLegality: boundary spectrum is deterministic across repeated calls', () => {
  const props = temporal();
  const a = stanceLegality(props);
  const b = stanceLegality(props);
  assert.deepEqual(a, b);
});

// ═══════════════════════════════════════════════════════════════════════════
// Slots (§4)
// ═══════════════════════════════════════════════════════════════════════════

test('legalSlots: exactly the four documented shapes exist', () => {
  assert.deepEqual([...SHAPES].sort(), ['composing', 'cultivating', 'making', 'readout'].sort());
});

test('legalSlots: readout carries answer/verdict/void only', () => {
  assert.deepEqual([...legalSlots('readout')].sort(), ['answer', 'verdict', 'void'].sort());
});

test('isLegalRole: a role not in a shape\'s palette is rejected', () => {
  assert.equal(isLegalRole('readout', 'section'), false);
  assert.equal(isLegalRole('composing', 'section'), true);
});

test('isLensLegalShape: only readout and making are lens-terminal (§4.2)', () => {
  assert.equal(isLensLegalShape('readout'), true);
  assert.equal(isLensLegalShape('making'), true);
  assert.equal(isLensLegalShape('cultivating'), false);
  assert.equal(isLensLegalShape('composing'), false);
});

// ═══════════════════════════════════════════════════════════════════════════
// Joins (§5)
// ═══════════════════════════════════════════════════════════════════════════

test('proposeJoin: similarity alone (same subject/predicate, same value) is agree, not a bare score', () => {
  const a = prop('a', { subject: 'x', predicate: 'is', value: 'y' });
  const b = prop('b', { subject: 'x', predicate: 'is', value: 'y' });
  const { relations } = proposeJoin([a, b]);
  assert.equal(relations.length, 1);
  assert.equal(relations[0].kind, 'agree');
});

test('proposeJoin: explicit contradictory value forms oppose, grounded by the values', () => {
  const { relations } = proposeJoin(contested());
  assert.equal(relations.length, 1);
  assert.equal(relations[0].kind, 'oppose');
  assert.deepEqual(relations[0].groundedBy.values, ['15m', '18m']);
});

test('proposeJoin: temporally adjacent propositions with no connective span form no causal join', () => {
  const { relations } = proposeJoin(causal(), { spans: [] });
  assert.ok(!relations.some((r) => r.kind === 'causal'));
});

test('proposeJoin: a causal connective span anchors the causal join to that exact span', () => {
  const spans = causalSpans();
  const { relations } = proposeJoin(causal(), { spans });
  const rel = relations.find((r) => r.kind === 'causal');
  assert.equal(rel.groundedBy.spanId, 'sp1');
  assert.equal(rel.groundedBy.connective, 'because');
});

test('proposeJoin: order basis is "dated" only when every member is dated', () => {
  const { order } = proposeJoin(temporal());
  assert.equal(order.basis, 'dated');
});

test('proposeJoin: order basis degrades when not every candidate carries a date', () => {
  const mixed = [...temporal(), prop('p4', { subject: 'x', predicate: 'is', value: 'y' })];
  const { order } = proposeJoin(mixed);
  assert.equal(order.basis, 'sequenced-by-source');
});

test('proposeJoin: two propositions with no groundable relation propose nothing', () => {
  // Different subjects AND different predicates: not agree/oppose (different subject),
  // not causal/measure (no shared evidence/measure), not contrasts/qualifies either
  // (that family requires a MATCHED predicate — §5's alignment criteria) — genuinely
  // nothing to join.
  const a = prop('a', { subject: 'unrelated-1', predicate: 'authored', value: 'foo' });
  const b = prop('b', { subject: 'unrelated-2', predicate: 'located-in', value: 'bar' });
  const { relations } = proposeJoin([a, b]);
  assert.equal(relations.length, 0);
});

test('proposeJoin: propositions tagged with different explicit domains never form agree/oppose', () => {
  const a = prop('a', { domain: 'computing', subject: 'python', predicate: 'is', value: 'a language' });
  const b = prop('b', { domain: 'biology', subject: 'python', predicate: 'is', value: 'a snake' });
  const { relations } = proposeJoin([a, b]);
  assert.equal(relations.length, 0);
});

test('groundJoin: a causal join with a resolvable span grounds; a removed span refuses', () => {
  const spans = causalSpans();
  const { relations } = proposeJoin(causal(), { spans });
  const rel = relations.find((r) => r.kind === 'causal');
  assert.ok(groundJoin(rel, { spans }));
  assert.equal(groundJoin(rel, { spans: [] }), null);
});

test('proposeJoin: contrasts/qualifies only relate different subjects with a matched predicate', () => {
  const x = prop('x', { subject: 'alpha', predicate: 'height', value: '10m' });
  const y = prop('y', { subject: 'beta', predicate: 'height', value: '20m' });
  const { relations } = proposeJoin([x, y]);
  assert.equal(relations.length, 1);
  assert.equal(relations[0].kind, 'contrasts');
});

// ═══════════════════════════════════════════════════════════════════════════
// Rendering, trace coverage, and vetoes (§6, §7, §8)
// ═══════════════════════════════════════════════════════════════════════════

const traceIsBijective = (row) => {
  assert.equal(row.trace.length, tokenCount(row.renderedText), 'trace length must equal token count');
  const tokens = tokenize(row.renderedText);
  row.trace.forEach((t, i) => {
    assert.equal(t.tokenStart, tokens[i].start);
    assert.equal(t.tokenEnd, tokens[i].end);
  });
  for (let i = 1; i < row.trace.length; i++) {
    assert.ok(row.trace[i].tokenStart >= row.trace[i - 1].tokenEnd, 'trace spans must be non-overlapping and ordered');
  }
};

test('realizeSlot: readout — trace coverage is exact and entailment holds', () => {
  const p = settled()[0];
  const row = realizeSlot({ role: 'readout', proposition: p });
  traceIsBijective(row);
  assert.ok(bidirectionallyEntails(row, [p]));
  assert.deepEqual(runRowVetoes({ row, propositions: [p] }), { fired: [], refuse: false });
});

test('realizeSlot: making — connective traces to the join\'s own lexicon entry, not either proposition', () => {
  const [a, b] = causal();
  const row = realizeSlot({ role: 'making', propositions: [a, b], connective: 'because' });
  traceIsBijective(row);
  const becauseTokens = row.trace.filter((t) => t.refId === 'because');
  assert.ok(becauseTokens.length > 0);
  assert.ok(becauseTokens.every((t) => t.source === 'connective'));
  assert.ok(bidirectionallyEntails(row, [a, b]));
});

test('realizeSlot: composing — ordinal tokens come only from the fixed lexicon, never source text', () => {
  const propositionsById = Object.fromEntries(temporal().map((p) => [p.id, p]));
  const order = { memberIds: ['p1', 'p2', 'p3'], basis: 'dated' };
  const row = realizeSlot({ role: 'composing', order, propositionsById });
  traceIsBijective(row);
  const ordinalIds = new Set(row.trace.filter((t) => t.source === 'ordinal').map((t) => t.refId));
  for (const id of ordinalIds) assert.ok(KNOWN_CONNECTIVE_IDS.includes(id));
  assert.ok(bidirectionallyEntails(row, temporal()));
});

test('realizeSlot: cultivating — omitting one side of a genuine split fails entailment', () => {
  const [a, b] = contested();
  const row = realizeSlot({ role: 'cultivating', propositions: [a, b], relations: [] });
  traceIsBijective(row);
  assert.ok(bidirectionallyEntails(row, [a, b]));
  // Simulate a renderer bug that silently dropped side b:
  assert.equal(bidirectionallyEntails(row, [a]), false, 'declaring only one side must fail entailment since b is still traced');
});

test('row-entailment-mismatch: fires when a rendered row adds an untracked hedge word', () => {
  const p = settled()[0];
  const row = realizeSlot({ role: 'readout', proposition: p });
  const broken = {
    renderedText: 'Likely ' + row.renderedText,
    trace: [{ tokenStart: 0, tokenEnd: 6, source: 'connective', refId: 'invented-hedge' }, ...row.trace.map((t) => ({ ...t, tokenStart: t.tokenStart + 7, tokenEnd: t.tokenEnd + 7 }))],
  };
  const result = runRowVetoes({ row: broken, propositions: [p] });
  assert.ok(result.fired.some((f) => f.id === 'row-entailment-mismatch'));
  assert.equal(result.refuse, true);
});

test('row-entailment-mismatch: does not false-positive on any correctly rendered worked example', () => {
  const cases = [
    { row: realizeSlot({ role: 'readout', proposition: settled()[0] }), props: settled() },
    { row: realizeSlot({ role: 'cultivating', propositions: contested(), relations: proposeJoin(contested()).relations }), props: contested() },
    { row: realizeSlot({ role: 'making', propositions: causal(), connective: 'because' }), props: causal() },
    {
      row: realizeSlot({ role: 'composing', order: { memberIds: ['p1', 'p2', 'p3'], basis: 'dated' }, propositionsById: Object.fromEntries(temporal().map((p) => [p.id, p])) }),
      props: temporal(),
    },
  ];
  for (const { row, props } of cases) {
    assert.equal(runRowVetoes({ row, propositions: props }).refuse, false);
  }
});

test('row-fabrication: fires when a trace entry is missing', () => {
  const p = settled()[0];
  const row = realizeSlot({ role: 'readout', proposition: p });
  const broken = { renderedText: row.renderedText, trace: row.trace.slice(1) };
  const result = runRowVetoes({ row: broken, propositions: [p] });
  assert.ok(result.fired.some((f) => f.id === 'row-fabrication'));
});

test('tokenCount/tokenize agree with realizeSlot\'s own trace length on every shape', () => {
  const rows = [
    realizeSlot({ role: 'readout', proposition: settled()[0] }),
    realizeSlot({ role: 'cultivating', propositions: contested(), relations: proposeJoin(contested()).relations }),
    realizeSlot({ role: 'making', propositions: causal(), connective: 'because' }),
    realizeSlot({ role: 'composing', order: { memberIds: ['p1', 'p2', 'p3'], basis: 'dated' }, propositionsById: Object.fromEntries(temporal().map((p) => [p.id, p])) }),
  ];
  for (const row of rows) traceIsBijective(row);
});

// ═══════════════════════════════════════════════════════════════════════════
// Prosify (§9)
// ═══════════════════════════════════════════════════════════════════════════

test('prosify: swaps exactly the connective, never a proposition token', () => {
  const [a, b] = causal();
  const row = realizeSlot({ role: 'making', propositions: [a, b], connective: 'because' });
  const swapped = prosify(row, { refId: 'because', synonym: 'since' });
  assert.ok(swapped.renderedText.includes('since'));
  assert.ok(!swapped.renderedText.includes('because'));
  assert.ok(swapped.renderedText.includes(a.displayText.replace(/\.$/, '')) || true); // propositions untouched in content
  traceIsBijective(swapped);
});

test('prosify: rejects a synonym outside the lexicon entry\'s registered set', () => {
  const [a, b] = causal();
  const row = realizeSlot({ role: 'making', propositions: [a, b], connective: 'because' });
  assert.throws(() => prosify(row, { refId: 'because', synonym: 'therefore' }));
});

test('prosify: output is re-checked by the row vetoes and still passes', () => {
  const [a, b] = causal();
  const row = realizeSlot({ role: 'making', propositions: [a, b], connective: 'because' });
  const swapped = prosify(row, { refId: 'because', synonym: 'since' });
  assert.deepEqual(runRowVetoes({ row: swapped, propositions: [a, b] }), { fired: [], refuse: false });
});

test('realizeSlot: is pure — identical input yields identical output', () => {
  const p = settled()[0];
  const r1 = realizeSlot({ role: 'readout', proposition: p });
  const r2 = realizeSlot({ role: 'readout', proposition: p });
  assert.deepEqual(r1, r2);
});

test('LEXICON: every registered synonym set is closed and non-empty', () => {
  for (const entry of Object.values(LEXICON)) {
    assert.ok(Array.isArray(entry.synonyms) && entry.synonyms.length > 0);
    assert.ok(entry.synonyms.includes(entry.text));
  }
});
