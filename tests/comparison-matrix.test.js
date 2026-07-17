import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { comparisonMatrix, crossSourceConflicts, readQuantities } from '../src/enactor/factcheck/index.js';

// The reported failure, verbatim: a four-source corpus (a resilience plan, an opposition
// review, a capital-budget PDF, and a CSV of project rows) where the deterministic engine
// finds every figure but the cross-source pass could not ASSEMBLE them into one comparison —
// a revision read as a false agreement ("$120M" from S-0001 vs "$120M" from S-0004", when
// S-0004 actually said "revised from $120M to $145M"), and "2030 vs 2032" found no conflict
// at all because a bare year carries no unit for readQuantities to key on.

const P = (text, id) => parseText(text, { docId: id });

const PLAN = 'The Harbor City seawall will cost $120 million and finish in 2030.';
const REVIEW = 'The Harbor City seawall will cost at least $145 million, and the seawall completion is not before 2032.';
const PDF = 'The Harbor City seawall budget was revised from $120 million to $145 million, and the seawall completion moved from 2030 to 2032.';

const entries = () => [
  { doc: P(PLAN, 'plan'), source: 'S-0001', label: 'Plan' },
  { doc: P(REVIEW, 'review'), source: 'S-0002', label: 'Review' },
  { doc: P(PDF, 'pdf'), source: 'S-0004', label: 'Budget PDF' },
];

// ── readQuantities: change language and comparators ──────────────────────────

test('readQuantities: "from X to Y" tags the pair old/new and shares a changeId', () => {
  const [old_, new_] = readQuantities('The budget was revised from $120 million to $145 million.');
  assert.equal(old_.value, 120_000_000); assert.equal(old_.role, 'old');
  assert.equal(new_.value, 145_000_000); assert.equal(new_.role, 'new');
  assert.equal(old_.changeId, new_.changeId);
  assert.ok(old_.changeId);
});

test('readQuantities: a bound word tags the comparator, not a false point value', () => {
  assert.equal(readQuantities('The array is at least 45MW.')[0].comparator, 'gte');
  assert.equal(readQuantities('No more than 200 jobs will be created.')[0].comparator, 'lte');
  assert.equal(readQuantities('Completion is not before 2032.')[0].comparator, 'gte');
  assert.equal(readQuantities('Completion is no later than 2032.')[0].comparator, 'lte');
  assert.equal(readQuantities('Over 300 homes will be powered.')[0].comparator, 'gt');
  assert.equal(readQuantities('It will power 18,000 homes.')[0].comparator, null);
});

test('readQuantities: a completion year is read only under schedule context', () => {
  assert.equal(readQuantities('Terminal gates target completion in 2030.')[0].measure, 'completion');
  assert.equal(readQuantities('The project will finish in 2030.')[0].value, 2030);
  // the existing "bare, ungoverned number is dropped" guarantee is unchanged
  assert.equal(readQuantities('In 2021 the board met.').length, 0);
});

// ── extractQuantities / crossSourceConflicts: the reported failure ───────────

test('crossSourceConflicts: a revision witnesses at its CURRENT value, not first mention', () => {
  const { conflicts } = crossSourceConflicts(entries());
  const cost = conflicts.find((c) => c.measure === 'cost');
  assert.ok(cost, 'cost should conflict (Plan $120M vs the PDF\'s current $145M)');
  const pdfValue = cost.values.find((v) => v.source === 'S-0004');
  assert.equal(pdfValue.value, 145_000_000, 'the PDF witnesses at $145M, its CURRENT figure — not the stale $120M first mention');
  assert.equal(pdfValue.changedFromRaw, '$120 million');
});

test('crossSourceConflicts: a completion-year disagreement is now caught (was invisible before)', () => {
  const { conflicts } = crossSourceConflicts(entries());
  const completion = conflicts.find((c) => c.measure === 'completion');
  assert.ok(completion, '2030 vs 2032 should read as a conflict once bare years are governed by schedule context');
  assert.equal(new Set(completion.values.map((v) => v.value)).size > 1, true);
});

// ── comparisonMatrix: the surface the report asks for ─────────────────────────

test('comparisonMatrix: one row per measure, one cell per source, corroboration included', () => {
  const { rows, counts } = comparisonMatrix(entries());
  assert.equal(counts.sources, 3);
  const cost = rows.find((r) => r.measure === 'cost');
  const completion = rows.find((r) => r.measure === 'completion');
  assert.ok(cost && completion);
  assert.equal(cost.subject, 'Harbor City');
  assert.equal(cost.cells.length, 3, 'every source stated a cost, not only the two that disagreed');

  const bySource = (r) => Object.fromEntries(r.cells.map((c) => [c.source, c]));
  const cc = bySource(cost);
  assert.equal(cc['S-0001'].raw, '$120 million');
  assert.equal(cc['S-0002'].raw, '$145 million');
  assert.equal(cc['S-0002'].comparator, 'gte');
  assert.equal(cc['S-0004'].raw, '$145 million');
  assert.equal(cc['S-0004'].changedFromRaw, '$120 million');
  assert.equal(cost.reading, 'Revised upward');

  const sc = bySource(completion);
  assert.equal(sc['S-0001'].value, 2030);
  assert.equal(sc['S-0002'].value, 2032);
  assert.equal(sc['S-0004'].changedFromRaw, '2030');
  assert.equal(completion.reading, 'Revised upward');
});

test('comparisonMatrix: a single, uncontested measure still gets a row (corroboration, not only conflict)', () => {
  const { rows } = comparisonMatrix([
    { doc: P('The array is an 80MW installation.', 'a'), source: 'S1' },
  ]);
  const capacity = rows.find((r) => r.measure === 'capacity');
  assert.ok(capacity);
  assert.equal(capacity.cells.length, 1);
  assert.equal(capacity.reading, null);   // nothing to compare yet — never asserted "consistent" on one witness
});

test('comparisonMatrix: agreeing sources read as consistent, not disagreeing', () => {
  const { rows } = comparisonMatrix([
    { doc: P('The Riverside Solar Project will power 18,000 homes.', 'a'), source: 'S1' },
    { doc: P('The Riverside Solar Project powers 18,000 homes.', 'b'), source: 'S2' },
  ]);
  const homes = rows.find((r) => r.measure === 'homes');
  assert.equal(homes.reading, 'Consistent across sources');
});

test('comparisonMatrix: two different named subjects still split into two rows', () => {
  const { rows } = comparisonMatrix([
    { doc: P('The Riverside Solar Project will power 18,000 homes.', 'a'), source: 'S1' },
    { doc: P('The Oakdale Wind Farm will power 9,000 homes.', 'b'), source: 'S2' },
  ]);
  const homesRows = rows.filter((r) => r.measure === 'homes');
  assert.equal(homesRows.length, 2);
});
