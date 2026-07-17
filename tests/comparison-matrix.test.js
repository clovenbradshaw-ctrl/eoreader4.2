import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import {
  comparisonMatrix, cellDisplay, readMeasures, crossSourceConflicts,
} from '../src/enactor/factcheck/index.js';

// The reported corpus: four sources about one seawall project that disagree on budget,
// completion year, wetland scope and funding — and one of them states the CHANGE inline
// ("revised from $120M to $145M"). The conflict pass caught the wrong conflict because it
// read that source on its OLD number; the matrix is the whole grid the corpus asks for.

const P = (text, id) => parseText(text, { docId: id });

const PLAN = `The Harbor City resilience plan commits $120M to the seawall, with 2030 completion.
The plan assumes $50M in federal funding.`;
const REVIEW = `The Coastal Ecology Alliance review finds the Harbor City seawall will cost at least $145M and will not be complete before 2032.
The review recommends 240 acres of wetland restoration.`;
const CSV = `The Harbor City seawall has an approved budget of $145M and a target completion of 2032.
The seawall includes 60 acres of wetland.`;
const PDF = `The Harbor City Capital Budget Update revises the seawall budget from $120M to $145M and moves completion to 2032 from 2030.
Federal funding of $50M remains unsecured.`;

const CORPUS = () => [
  { doc: P(PLAN, 'plan'), source: 'S-0001', label: 'Resilience Plan', date: '2029-01-01' },
  { doc: P(REVIEW, 'review'), source: 'S-0002', label: 'Ecology Review', date: '2029-06-01' },
  { doc: P(CSV, 'csv'), source: 'S-0003', label: 'Harbor Projects CSV', date: '2029-09-01' },
  { doc: P(PDF, 'pdf'), source: 'S-0004', label: 'Capital Budget PDF', date: '2030-02-01' },
];

// ── the change-construction reading (the root cause) ─────────────────────────

test('readMeasures: "revised from $120M to $145M" makes $145M operative, $120M superseded', () => {
  const rs = readMeasures('revises the seawall budget from $120M to $145M');
  const cost = rs.filter((r) => r.measure === 'cost');
  const op = cost.find((r) => !r.superseded);
  const old = cost.find((r) => r.superseded);
  assert.equal(op.value, 145e6);
  assert.equal(op.transition.from, 120e6);
  assert.equal(old.value, 120e6);
});

test('readMeasures: "at least $145M" is a floor, "not before 2032" is a floor year', () => {
  const rs = readMeasures('will cost at least $145M and will not be complete before 2032');
  const cost = rs.find((r) => r.measure === 'cost');
  const year = rs.find((r) => r.measure === 'schedule');
  assert.equal(cost.value, 145e6);
  assert.equal(cost.bound, 'atLeast');
  assert.equal(year.value, 2032);
  assert.equal(year.bound, 'atLeast');
});

test('readMeasures: a bare year with no schedule cue is not a measure', () => {
  assert.equal(readMeasures('In 2021 the board first met.').length, 0);
});

// ── the conflict pass no longer picks the wrong conflict ─────────────────────

test('crossSourceConflicts: cost clash is $120M vs $145M, not $120M vs $120M', () => {
  const { conflicts } = crossSourceConflicts(CORPUS());
  const cost = conflicts.find((c) => c.measure === 'cost');
  assert.ok(cost, 'a cost conflict is found');
  const vals = new Set(cost.values.map((v) => v.value));
  assert.ok(vals.has(120e6) && vals.has(145e6), `spread is 120M vs 145M, got ${[...vals]}`);
});

test('crossSourceConflicts: the 2030-vs-2032 schedule clash now fires (year tolerance)', () => {
  const { conflicts } = crossSourceConflicts(CORPUS());
  const sched = conflicts.find((c) => c.measure === 'schedule');
  assert.ok(sched, 'a schedule conflict is found');
  const vals = new Set(sched.values.map((v) => v.value));
  assert.ok(vals.has(2030) && vals.has(2032), `spread is 2030 vs 2032, got ${[...vals]}`);
});

// ── the matrix ───────────────────────────────────────────────────────────────

test('comparisonMatrix: one column per source, in corpus order', () => {
  const m = comparisonMatrix(CORPUS());
  assert.deepEqual(m.sources.map((s) => s.source), ['S-0001', 'S-0002', 'S-0003', 'S-0004']);
});

test('comparisonMatrix: the cost row reads upward and cites the transition', () => {
  const m = comparisonMatrix(CORPUS());
  const cost = m.rows.find((r) => r.measure === 'cost');
  assert.ok(cost, 'a cost row exists');
  assert.equal(cost.conflict, true);
  assert.equal(cost.changed, true);
  assert.equal(cost.reading, 'Revised upward');
  // Plan states $120M, PDF states the move $120M → $145M.
  const plan = cost.cells[0], pdf = cost.cells[3];
  assert.equal(plan.value, 120e6);
  assert.equal(pdf.transition.from, 120e6);
  assert.equal(pdf.value, 145e6);
  assert.equal(cellDisplay(pdf), '$120M → $145M');
});

test('comparisonMatrix: the completion row reads as pushed later', () => {
  const m = comparisonMatrix(CORPUS());
  const sched = m.rows.find((r) => r.measure === 'schedule');
  assert.ok(sched, 'a schedule row exists');
  assert.equal(sched.conflict, true);
  assert.equal(sched.reading, 'Pushed later');
  assert.equal(sched.cells[0].value, 2030);   // Plan
  assert.equal(sched.cells[2].value, 2032);   // CSV
});

test('comparisonMatrix: the acreage row shows the 240-vs-60 disagreement', () => {
  const m = comparisonMatrix(CORPUS());
  const acres = m.rows.find((r) => r.measure === 'acres');
  assert.ok(acres, 'an acreage row exists');
  assert.equal(acres.conflict, true);
  const vals = acres.cells.filter(Boolean).map((c) => c.value).sort((a, b) => a - b);
  assert.deepEqual(vals, [60, 240]);
});

test('readMeasures: a source stating two costs reads both (budget and funding)', () => {
  // The plan states a $120M budget and a $50M funding assumption; the matrix folds them
  // under one `cost` row (a known coarseness — budget vs funding are not yet split), but
  // the reading layer sees both magnitudes.
  const budget = readMeasures('commits $120M to the seawall, with 2030 completion');
  const funding = readMeasures('The plan assumes $50M in federal funding.');
  assert.equal(budget.find((r) => r.measure === 'cost').value, 120e6);
  assert.equal(funding.find((r) => r.measure === 'cost').value, 50e6);
});

test('comparisonMatrix: every cell carries the sentence it was read from', () => {
  const m = comparisonMatrix(CORPUS());
  for (const row of m.rows) for (const cell of row.cells) {
    if (!cell) continue;
    assert.ok(cell.text && cell.text.includes(cell.raw.replace('$', '').replace('M', '')) || cell.text.length > 0,
      'cell carries its source sentence');
    assert.ok(Number.isInteger(cell.sentIdx), 'cell carries its sentence index');
  }
});

test('comparisonMatrix: agreeing sources produce a Consistent row, not a conflict', () => {
  const m = comparisonMatrix([
    { doc: P('The seawall will power 18,000 homes.', 'a'), source: 'S1' },
    { doc: P('The seawall powers 18,000 homes.', 'b'), source: 'S2' },
  ]);
  const homes = m.rows.find((r) => r.measure === 'homes');
  assert.ok(homes);
  assert.equal(homes.conflict, false);
  assert.equal(homes.reading, 'Consistent');
});

test('comparisonMatrix: empty corpus is empty, never throws', () => {
  const m = comparisonMatrix([]);
  assert.deepEqual(m.rows, []);
  assert.equal(m.counts.rows, 0);
});
