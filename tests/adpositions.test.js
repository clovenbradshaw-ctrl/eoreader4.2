import { test } from 'node:test';
import assert from 'node:assert/strict';

import { induceAdpositions } from '../src/perceiver/parse/adpositions.js';
import { parseText } from '../src/perceiver/parse/pipeline.js';

// ADPOSITION INDUCTION — the setting register, learned, not tabled. An adposition (1) precedes
// names often, (2) asymmetrically (a conjunction has names on both sides), and (3) governs
// OBLIQUES — the declension machinery corroborating: в МосквЕ, never в МосквА, while "но Пьер"
// precedes nominative subjects and dies on the case test.

test('induces the Russian adposition and rejects the conjunction and the clause-opener', () => {
  const sentences = [
    'Пьер жил в Москве', 'Пьер служил в Москве', 'Он бывал в Москве',
    'Пьер и Наташа гуляли', 'Наташа и Пьер пели', 'Соня и Наташа шили',
    'но Пьер молчал', 'но Наташа пела', 'но Пьер ушёл',
  ];
  const names = new Set(['Пьер', 'Наташа', 'Соня', 'Москве']);
  const nominatives = new Set(['Пьер', 'Наташа', 'Соня']);   // the subjects; Москве is oblique
  const out = induceAdpositions(sentences, { names, nominatives });
  const tokens = out.map((p) => p.token);
  assert.ok(tokens.includes('в'), 'в precedes an oblique name, asymmetrically — an adposition');
  assert.ok(!tokens.includes('и'), 'и has names on both sides — a conjunction, not a governor');
  assert.ok(!tokens.includes('но'), 'но precedes nominative subjects — a clause opener, not a governor');
});

test('a multi-word name is matched by its head token', () => {
  const sentences = ['Пьер жил в Старой Руссе', 'Пьер служил в Старой Руссе', 'Он бывал в Старой Руссе'];
  const out = induceAdpositions(sentences, {
    names: new Set(['Пьер', 'Старой Руссе']), nominatives: new Set(['Пьер']),
  });
  assert.ok(out.some((p) => p.token === 'в'), 'в governs the head of the multi-word name');
});

test('empty inputs are safe and produce nothing', () => {
  assert.deepEqual(induceAdpositions([], { names: new Set(['X']) }), []);
  assert.deepEqual(induceAdpositions(['a b c'], { names: new Set() }), []);
  assert.deepEqual(induceAdpositions(['a b c'], {}), []);
});

// ── through the pipeline: the Russian setting desert lights up ───────────────

test('parseText learns the document’s own adposition and grades the Russian setting', () => {
  const ru = `Пьер жил в Старой Руссе. Пьер служил в Старой Руссе. Пьер бывал в Старой Руссе.
Пьер и Наташа гуляли. Наташа и Пьер пели. Наташа читала книгу. Наташа шила платье.`;
  const doc = parseText(ru, { docId: 'ru' });
  const grains = new Map(doc.log.events.filter((e) => e.key === 'grain').map((e) => [e.id, e]));
  assert.equal(grains.get('старой-руссе')?.value, 'setting',
    'в Старой Руссе ×3, never acting — a setting, exactly as "in London" reads in English');
  assert.equal(grains.get('пьер')?.value, 'figure', 'the agent is still a figure');
  // the learned convention is on the ledger, defeasible like every other
  assert.ok(doc.conventions.isPreposition('в'), 'в joined the preposition register (seed ∪ learned)');
  assert.ok(!doc.conventions.isPreposition('и'), 'и did not');
});

test('English is unchanged: the seeded register already carries "in", and "and" is never learned', () => {
  const en = 'Pierre lived in London. Pierre worked in London. Pierre stayed in London. '
    + 'Pierre and Andrew talked. Andrew and Pierre sang. Andrew read. Andrew wrote.';
  const doc = parseText(en, { docId: 'en' });
  const grains = new Map(doc.log.events.filter((e) => e.key === 'grain').map((e) => [e.id, e]));
  assert.equal(grains.get('london')?.value, 'setting');
  assert.ok(!doc.conventions.rules.some((r) => r.kind === 'preposition' && r.token === 'and'),
    '"and" fails the symmetry test in English exactly as и fails it in Russian');
});
