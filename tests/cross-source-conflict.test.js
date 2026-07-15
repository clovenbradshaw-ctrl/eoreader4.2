import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import {
  crossSourceConflicts, extractQuantities, readQuantities,
} from '../src/enactor/factcheck/index.js';
import { quantitiesConflict, attributesConflict } from '../src/core/index.js';

// The cross-source veto (P3). The two answer-vetoes (edge / DEF) are answer-vs-graph,
// so a record whose SOURCES put a different magnitude on the same measure read as green
// until an answer happened to repeat the clash — and even then only if the clash was a
// typed relation, never a number. This is the pass that asks whether the sources agree
// with EACH OTHER. The scenario is the reported failure verbatim: an original briefing
// and an opposition sheet that disagree on every figure of one project.

const P = (text, id) => parseText(text, { docId: id });

const BRIEFING = `The Riverside Solar Project is an 80MW installation.
It will power 18,000 homes and reduce 95,000 tons of CO2 annually.
The project will create 220 jobs.`;

const OPPOSITION = `The Riverside Solar Project is only a 45MW array.
It will power just 9,000 homes and cut 40,000 tons of CO2.
The project creates only 150 jobs.`;

// ── the oracle (core/relation-types.js) ──────────────────────────────────────

test('quantitiesConflict: far-apart magnitudes clash, near ones defer', () => {
  assert.equal(quantitiesConflict(9000, 18000).conflict, 1);
  assert.equal(quantitiesConflict(40000, 95000).conflict, 1);
  assert.equal(quantitiesConflict(45, 80).conflict, 1);
  assert.equal(quantitiesConflict(45, 45.2).conflict, 0);   // within the 5% band → rounding, not a clash
  assert.equal(quantitiesConflict(100, 103).conflict, 0);
  assert.equal(quantitiesConflict(100, 140).conflict, 1);
});

test('quantitiesConflict: a custom tolerance band widens/narrows the clash', () => {
  assert.equal(quantitiesConflict(100, 140, { relTol: 0.5 }).conflict, 0);   // 40% < 50% → defer
  assert.equal(quantitiesConflict(100, 103, { relTol: 0, absTol: 0 }).conflict, 1);   // exact → any gap clashes
});

test('attributesConflict: the numeric arm fires only under opts.numeric', () => {
  // The measured arm compares magnitudes.
  assert.equal(attributesConflict('homes', '9000', '18000', { numeric: true }).conflict, 1);
  assert.equal(attributesConflict('homes', '9000', '9100', { numeric: true }).conflict, 0);
  // Without the opt, the string algebra is byte-for-byte unchanged: two unequal numeric
  // strings are an untyped attribute → soft/defer, exactly as before.
  assert.equal(attributesConflict('homes', '9000', '18000').reason, 'soft');
  // And the existing role/office semantics are untouched.
  assert.equal(attributesConflict('office', 'mayor', 'mayor').reason, 'match');
  assert.equal(attributesConflict('kin', 'mother', 'father').reason, 'role-disjoint');
});

// ── the extractor (factcheck/crosscheck.js) ──────────────────────────────────

test('readQuantities: reads magnitude + measure + unit out of prose', () => {
  const byMeasure = (t) => Object.fromEntries(readQuantities(t).map((q) => [q.measure, q]));

  let q = byMeasure('It will power 18,000 homes and reduce 95,000 tons of CO2 annually.');
  assert.equal(q.homes.value, 18000);
  assert.equal(q.co2.value, 95000);
  assert.equal(q.co2.unit, 'tons');

  q = byMeasure('an 80MW installation');
  assert.equal(q.capacity.value, 80);
  assert.equal(q.capacity.unit, 'MW');

  assert.equal(byMeasure('create 220 jobs').jobs.value, 220);
  assert.equal(byMeasure('a $2.5 billion budget').cost.value, 2_500_000_000);
  assert.equal(byMeasure('40,000 tonnes of carbon').co2.value, 40000);
  // GW normalizes to MW so it compares in one unit with an MW capacity.
  assert.equal(byMeasure('a 0.08 GW plant').capacity.value, 80);
});

test('readQuantities: a bare, ungoverned number is dropped (no invented measure)', () => {
  assert.equal(readQuantities('In 2021 the board met.').length, 0);
  assert.equal(readQuantities('See footnote 3 for detail.').length, 0);
});

test('extractQuantities: binds each magnitude to the source subject (pronoun and all)', () => {
  const recs = extractQuantities(P(BRIEFING, 'briefing'), { source: 'S-0002', label: 'Briefing' });
  // Every figure — even the ones under "It" / "The project" — binds to the one subject.
  assert.ok(recs.length >= 4);
  for (const r of recs) assert.equal(r.subjLabel, 'Riverside Solar Project');
  assert.deepEqual(new Set(recs.map((r) => r.measure)), new Set(['capacity', 'homes', 'co2', 'jobs']));
});

// ── the pass (the reported failure) ──────────────────────────────────────────

test('crossSourceConflicts: catches the briefing-vs-opposition disagreement on every figure', () => {
  const { conflicts, counts } = crossSourceConflicts([
    { doc: P(BRIEFING, 'briefing'), source: 'S-0002', label: 'Riverside Briefing' },
    { doc: P(OPPOSITION, 'opposition'), source: 'S-0007', label: 'Opposition Fact Sheet' },
  ]);
  assert.equal(counts.conflicts, 4);
  const byMeasure = new Map(conflicts.map((c) => [c.measure, c]));
  assert.deepEqual(new Set(byMeasure.keys()), new Set(['capacity', 'homes', 'co2', 'jobs']));

  // Homes: 18,000 (S-0002) vs 9,000 (S-0007), both cited, on the one subject.
  const homes = byMeasure.get('homes');
  assert.equal(homes.subject, 'Riverside Solar Project');
  const vals = new Map(homes.values.map((v) => [v.source, v.value]));
  assert.equal(vals.get('S-0002'), 18000);
  assert.equal(vals.get('S-0007'), 9000);
  assert.equal(homes.sources.length, 2);
  // Each witness carries the verbatim sentence for the citation.
  for (const v of homes.values) assert.ok(/homes/.test(v.text));
});

// ── it does not false-fire ───────────────────────────────────────────────────

test('crossSourceConflicts: agreeing sources report zero conflicts', () => {
  const r = crossSourceConflicts([
    { doc: P('The Riverside Solar Project will power 18,000 homes.', 'a'), source: 'S1' },
    { doc: P('The Riverside Solar Project powers 18,000 homes.', 'b'), source: 'S2' },
  ]);
  assert.equal(r.counts.conflicts, 0);
});

test('crossSourceConflicts: within-tolerance rounding is not a conflict', () => {
  const r = crossSourceConflicts([
    { doc: P('The plant is a 45MW array.', 'a'), source: 'S1' },
    { doc: P('The plant is a 45.2MW array.', 'b'), source: 'S2' },
  ]);
  assert.equal(r.counts.conflicts, 0);
});

test('crossSourceConflicts: two DIFFERENT named subjects do not false-conflict', () => {
  const r = crossSourceConflicts([
    { doc: P('The Riverside Solar Project will power 18,000 homes.', 'a'), source: 'S1' },
    { doc: P('The Oakdale Wind Farm will power 9,000 homes.', 'b'), source: 'S2' },
  ]);
  assert.equal(r.counts.conflicts, 0);
});

test('crossSourceConflicts: a single source disagreeing with itself is not cross-source', () => {
  const r = crossSourceConflicts([
    { doc: P('The project was 45MW, later upgraded to 80MW.', 'a'), source: 'S1' },
  ]);
  assert.equal(r.counts.conflicts, 0);
});
