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

// The seed-free FUNCTION-WORD filter (cap-rate): a predominantly-lowercase word is not a figure,
// in any language — what the induced slot cannot decide, since pronouns and names share a slot.
test('a predominantly-lowercase word is filtered, a name is kept (English, no seeds needed)', () => {
  const en = 'Very odd it was. He felt very tired, very calm, very slow, very sure, very near, very far.'
    + ' Pierre arrived. Pierre spoke. Pierre smiled. Pierre left. Pierre returned. Very good.';
  const a = createEntityAdmission({ text: en });
  en.split(/[.!?]+/).forEach((s, i) => a.observe(s, i));
  assert.equal(a.isAdmitted('Very'), false, '"Very" is mostly lowercase → a function/common word, not a figure');
  assert.equal(a.isAdmitted('Pierre'), true, '"Pierre" is always capital → a figure');
});

test('the cap-rate filter is omnilingual — it filters a Russian pronoun, keeps a Russian name', () => {
  const ru = 'Пьер Безухов вошёл. ' + 'он сказал что это так. '.repeat(6)
    + 'Что случилось? Пьер Безухов сел. Пьер Безухов встал.';
  const a = createEntityAdmission({ text: ru });
  ru.split(/[.!?]+/).forEach((s, i) => a.observe(s, i));
  assert.equal(a.isAdmitted('Что'), false, '"Что" (mostly lowercase) is filtered with no Russian seed list');
  assert.equal(a.isAdmitted('Пьер Безухов'), true, 'the Russian name is kept');
});

test('the scanner is fully Unicode — Greek (another cased script) reads too', () => {
  // Greek capitals carry diacritics (Ἀ, Γ); \p{Lu} sees them, per-script lists would not.
  assert.deepEqual(scanEntities('κατέβην μετὰ Γλαύκωνος τοῦ Ἀρίστωνος.').map((e) => e.label),
    ['Γλαύκωνος', 'Ἀρίστωνος']);
  const a = createEntityAdmission({});
  ['Σωκράτης ἔφη ταῦτα', 'Γλαύκων ἀπεκρίνατο αὐτῷ', 'Σωκράτης ἤκουσε πάλιν'].forEach((s, i) => a.observe(s, i));
  assert.ok(a.isAdmitted('Σωκράτης') && a.isAdmitted('Γλαύκων'), 'Greek names admit as figures');
});
