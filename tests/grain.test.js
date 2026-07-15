import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readGrain } from '../src/perceiver/parse/grain.js';
import { parseText } from '../src/perceiver/parse/pipeline.js';
import { coherence } from '../src/core/cube.js';

// THE GRAIN READER. The cube's Site face says a thing in the Existence domain is one of three
// terrains by its grain: an ENTITY (Figure — a particular), a KIND (Pattern — true-of-many), or a
// SETTING (Ground — the where/when the figures move through). The reader used to force every
// admitted span toward Entity; grain.js reads the grain off the span's own company instead, and
// ABSTAINS (null — held, not guessed) wherever the signal is not clean.

test('readGrain: the three signatures, and abstention between them', () => {
  // acts repeatedly → a figure
  assert.equal(readGrain({ count: 3, subj: 3 })?.value, 'figure');
  // moved through, never acting → a setting
  assert.equal(readGrain({ count: 3, obl: 3, subj: 0 })?.value, 'setting');
  // ranges over many in the document's own vocabulary → a kind
  assert.equal(readGrain({ count: 3, lowerTwin: 2 })?.value, 'kind');
  // a common-noun admission is a category on its face
  assert.equal(readGrain({ lowercaseForm: true })?.value, 'kind');
  // one thin sighting → HELD, not guessed
  assert.equal(readGrain({ count: 1, subj: 1 }), null);
  assert.equal(readGrain({}), null);
});

test('readGrain: the verdict names its cube terrain, and the judgment sits on the diagonal', () => {
  const fig = readGrain({ count: 3, subj: 3 });
  const kin = readGrain({ count: 3, lowerTwin: 2 });
  const set = readGrain({ count: 3, obl: 3 });
  assert.equal(fig.terrain, 'Entity');
  assert.equal(kin.terrain, 'Kind');
  assert.equal(set.terrain, 'Void');
  // calling a span a Kind IS a Pattern-grain DEF; a figure a Figure-grain DEF; a setting a
  // Ground-grain DEF — each judgment's own coordinates lie on the cube diagonal.
  for (const g of [fig, kin, set])
    assert.equal(coherence({ op: 'DEF', grain: g.grain }).ok, true, `${g.value} judgment is diagonal`);
});

// ── Wired into the pipeline (gated) ──────────────────────────────────────────

const EN = `Pierre arrived early. Pierre spoke about the plan. Pierre left quietly.
They met in London. He worked in London. She lived in London. Natasha waited outside once.`;

test('parseText grades the cast: an agent is a figure, a place lived-in is a setting', () => {
  const doc = parseText(EN, { docId: 'en', grainRead: true });
  const grains = new Map(doc.log.events.filter((e) => e.op === 'DEF' && e.key === 'grain')
    .map((e) => [e.id, e]));
  assert.equal(grains.get('pierre')?.value, 'figure', 'Pierre acts → a figure');
  assert.equal(grains.get('london')?.value, 'setting', 'London is only ever in/at → a setting');
  // every emitted judgment is coherent on the cube
  for (const e of grains.values()) assert.equal(coherence(e).ok, true);
  // ...and each carries its defeasibility on its face
  for (const e of grains.values()) assert.equal(e.defeasible, true);
});

test('the reader HOLDS what it cannot read — a one-sighting name gets no grain', () => {
  const doc = parseText(EN, { docId: 'en', grainRead: true });
  const graded = new Set(doc.log.events.filter((e) => e.key === 'grain').map((e) => e.id));
  assert.ok(doc.admission.isAdmitted('Natasha'), 'Natasha is admitted (strong enough to exist)');
  assert.ok(!graded.has('natasha'), 'but her single sighting is too thin to grade — held');
});

test('grainRead:false restores the ungraded log — zero grain events', () => {
  const doc = parseText(EN, { docId: 'en', grainRead: false });
  assert.equal(doc.log.events.filter((e) => e.key === 'grain').length, 0);
});

test('the pass is additive-only: on or off, admission and the edge record are identical', () => {
  const on  = parseText(EN, { docId: 'en' });                       // grainRead defaults ON
  const off = parseText(EN, { docId: 'en', grainRead: false });
  assert.deepEqual([...on.admission.admitted.entries()], [...off.admission.admitted.entries()]);
  // Compare the bonds minus the wall-clock stamp (`t` differs between ANY two runs) — every
  // structural coordinate (seq, argspan, endpoints, via, weight) must match exactly.
  const edges = (d) => d.log.events.filter((e) => e.op === 'CON' || e.op === 'SIG')
    .map(({ t, ...e }) => e);
  assert.deepEqual(edges(on), edges(off), 'not one bond differs — the grain only annotates');
});

test('a common-noun admission is graded a kind', () => {
  const doc = parseText('The ship sailed north. The ship struck ice. The ship sank slowly.',
    { docId: 's', commonNouns: true, grainRead: true });
  const ship = doc.log.events.find((e) => e.key === 'grain' && e.id === 'ship');
  assert.equal(ship?.value, 'kind');
  assert.equal(ship?.cue, 'common-noun');
});

test('a capitalised word the document also ranges lowercase is a kind, not a person', () => {
  const doc = parseText(
    'Dolphins raced the boat. He loves dolphins deeply. Some dolphins leapt. Dolphins vanished south.',
    { docId: 'd', grainRead: true });
  const dol = doc.log.events.find((e) => e.key === 'grain' && e.id === 'dolphins');
  assert.equal(dol?.value, 'kind', 'the lowercase twin says: a category, not a particular');
});

test('the subject rule is script-agnostic — a Russian agent grades figure', () => {
  const doc = parseText('Иван пришёл домой. Иван увидел сад. Иван улыбнулся тихо.',
    { docId: 'ru', grainRead: true });
  const ivan = doc.log.events.find((e) => e.key === 'grain' && e.id === 'иван');
  assert.equal(ivan?.value, 'figure');
});

test('an uncased document abstains entirely in v1 (no counters, no guesses, no crash)', () => {
  const jp = ['清盛が館を建てる。', '清盛は兵を集める。', '重盛が父を諫める。', '重盛は都に上る。',
              '清盛が重盛を呼ぶ。', '重盛は清盛に従う。', '清盛が政を執る。', '重盛が寺を建てる。',
              '清盛は敵を討つ。', '重盛は民を助ける。', '庭に花が咲く。'].join('');
  const doc = parseText(jp, { docId: 'jp', grainRead: true });
  assert.ok(doc.admission.admitted.size >= 2, 'the uncased figures are still read');
  assert.equal(doc.log.events.filter((e) => e.key === 'grain').length, 0,
    'but none is graded — the uncased company profile is the follow-on, not a guess');
});
