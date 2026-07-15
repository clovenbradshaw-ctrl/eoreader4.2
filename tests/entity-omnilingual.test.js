import { test } from 'node:test';
import assert from 'node:assert/strict';

import { scanEntities, createEntityAdmission } from '../src/perceiver/parse/entities.js';
import { createSlotField, BOUNDARY } from '../src/core/conventions/slots.js';

// THE READER IS NOT LATIN-ONLY. The name scanner reads Cyrillic (and leading-accent) names as
// one span — JS `\b` cannot, being ASCII-only — and the id keeps letters of any script, so a
// Russian cast does not collapse to one node. The induction primitive clusters Cyrillic by the
// same company mechanism. (Validated at scale on Война и мир; these pin it offline.)

test('the scanner reads a Cyrillic name as one span', () => {
  assert.deepEqual(scanEntities('Пьер Безухов вошёл в комнату.').map((e) => e.label), ['Пьер Безухов']);
  const spans = scanEntities('Андрей Болконский посмотрел на Наташа.').map((e) => e.label);
  assert.ok(spans.includes('Андрей Болконский'));
});

test('a leading accent is a name edge too (the ASCII-\\b blind spot)', () => {
  // "Émile" begins with an accented capital; \b never matched at that leading edge.
  assert.deepEqual(scanEntities('Émile Zola wrote a novel.').map((e) => e.label), ['Émile Zola']);
});

test('English name scanning is unchanged', () => {
  assert.deepEqual(scanEntities('Mr. Darcy met Elizabeth.').map((e) => e.label), ['Mr Darcy', 'Elizabeth']);
});

test('distinct Cyrillic names get distinct, script-faithful ids (no collapse)', () => {
  const a = createEntityAdmission({});
  ['Пьер Безухов вошёл', 'Андрей Болконский стоял', 'Пьер Безухов сел']
    .forEach((s, i) => a.observe(s, i));
  const pierre = a.idOf('Пьер Безухов'), andrei = a.idOf('Андрей Болконский');
  assert.ok(pierre && andrei);
  assert.notEqual(pierre, andrei, 'two Russian names are two referents, not one "-" id');
  assert.equal(pierre, 'пьер-безухов', 'the id keeps the Cyrillic, lowercased and hyphenated');
  assert.equal((a.mentions.get(pierre) || []).length, 2, 'both mentions land on the one referent');
});

test('the induction primitive clusters Cyrillic by company, with no language knowledge', () => {
  const DET = ['этот', 'тот'], NOUN = ['дом', 'сад', 'лес'], VERB = ['стоял', 'горел', 'рос'];
  const s = [];
  for (const d of DET) for (const n of NOUN) for (const v of VERB) { s.push(d, n, v, BOUNDARY); s.push(d, n, v, BOUNDARY); }
  const field = createSlotField({ frameSize: 20, clusterTop: 50, minFreq: 2, k: 6, simFloor: 0.2 }).observe(s);
  const { slotOf } = field.cluster();
  assert.equal(slotOf.get('дом'), slotOf.get('сад'), 'the Cyrillic nouns share a slot');
  assert.equal(slotOf.get('стоял'), slotOf.get('горел'), 'the Cyrillic verbs share a slot');
  assert.notEqual(slotOf.get('дом'), slotOf.get('стоял'), 'noun and verb slots are distinct');
});
