import { test } from 'node:test';
import assert from 'node:assert/strict';

import { scanEntities, createEntityAdmission } from '../src/perceiver/parse/entities.js';
import { createSlotField, BOUNDARY } from '../src/core/conventions/slots.js';
import { parseText } from '../src/perceiver/parse/pipeline.js';
import { isDegenerate } from '../src/perceiver/parse/chrome.js';

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

// The DEGENERATE-LINE guard is script-agnostic. `\W` is ASCII-only, so the old separator rule
// `/^[\W_]+$/` counted every Cyrillic/Greek letter as a non-word char and held a whole sentence
// of non-Latin prose as a "separator" — chrome — so the FULL pipeline read nothing from it. A
// separator is now "no letter and no number, in any script".
test('a non-Latin sentence is NOT a separator rule (the degenerate guard is Unicode)', () => {
  assert.equal(isDegenerate('Иван пришёл домой.'), false, 'Russian prose is content, not a separator');
  assert.equal(isDegenerate('Ἀγαμέμνων εἶδε τὸν Ἀχιλλέα.'), false, 'Greek prose is content');
  assert.equal(isDegenerate('———'), true, 'a real separator rule still reads as degenerate');
  assert.equal(isDegenerate('* * *'), true, 'a scene break still reads as degenerate');
  assert.equal(isDegenerate('___'), true, 'an underscore rule still reads as degenerate');
});

test('the FULL pipeline reads Cyrillic prose (it is not censored as chrome)', () => {
  // The bug: parseText held every Russian sentence as chrome and admitted zero figures, though
  // direct admission worked. This pins the whole read path — sentences → chrome → admission.
  const ru = 'Иван пришёл домой. Иван увидел Семёна. Семён поздоровался с Иваном. Иван улыбнулся.';
  const doc = parseText(ru, { docId: 'ru' });
  const admitted = [...doc.admission.admitted.keys()];
  assert.ok(admitted.includes('Иван'), 'Иван is read through the full pipeline');
  assert.ok(admitted.includes('Семён') || admitted.includes('Семёна'), 'Семён is read too');
  const heldChrome = doc.log.events.filter((e) => e.op === 'NUL' && e.kind === 'chrome').length;
  assert.equal(heldChrome, 0, 'no Cyrillic sentence is held as chrome');
});

test('the scanner is fully Unicode — Greek (another cased script) reads too', () => {
  // Greek capitals carry diacritics (Ἀ, Γ); \p{Lu} sees them, per-script lists would not.
  assert.deepEqual(scanEntities('κατέβην μετὰ Γλαύκωνος τοῦ Ἀρίστωνος.').map((e) => e.label),
    ['Γλαύκωνος', 'Ἀρίστωνος']);
  const a = createEntityAdmission({});
  ['Σωκράτης ἔφη ταῦτα', 'Γλαύκων ἀπεκρίνατο αὐτῷ', 'Σωκράτης ἤκουσε πάλιν'].forEach((s, i) => a.observe(s, i));
  assert.ok(a.isAdmitted('Σωκράτης') && a.isAdmitted('Γλαύκων'), 'Greek names admit as figures');
});

// THE INDUCTION IS SCRIPT-AGNOSTIC EVEN WHERE CASE DOES NOT EXIST. Japanese has no capitals and
// no spaces, so the capital-anchored NAME scanner is blind to it (its figures are kanji with no
// case signal — found only by gravity, not by a capitalised span). But the slot induction needs
// neither case nor spaces: fed one character per unit, it clusters the recurring hiragana PARTICLES
// (は/が/を — the closed grammatical class) into one slot and the content kanji into another, by
// company alone. This is the creature's method reaching a language whose writing carries no case.
test('slot induction finds the Japanese particle class with no dictionary (uncased, spaceless)', () => {
  const jp = ['武士が城を守る', '武士は弓を持つ', '敵が門を破る', '敵は火を放つ',
              '将軍が兵を送る', '将軍は馬に乗る', '兵が川を渡る', '兵は道を進む'];
  const stream = [];
  for (const s of jp) { for (const ch of [...s]) stream.push(ch); stream.push(BOUNDARY); }
  const { slotOf } = createSlotField({ frameSize: 8, clusterTop: 40, minFreq: 2, k: 6, simFloor: 0.2 })
    .observe(stream).cluster();
  // The three case particles share one induced slot — the closed class, read off distribution.
  assert.equal(slotOf.get('は'), slotOf.get('を'), 'は and を share a slot (both particles)');
  assert.equal(slotOf.get('が'), slotOf.get('を'), 'が joins them — the particle class');
  // A content kanji is not in the particle class.
  assert.notEqual(slotOf.get('城'), slotOf.get('を'), 'a content kanji is not a particle');
});
