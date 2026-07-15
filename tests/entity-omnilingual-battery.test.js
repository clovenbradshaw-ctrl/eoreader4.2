import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { createEntityAdmission } from '../src/perceiver/parse/entities.js';

// A ROBUST BATTERY for omnilingual entity admission (the gutenberg branch made admission read by
// referential GRAVITY through the Unicode cased-letter property \p{Lu}, never Latin capitalization
// as such). It pins the scripts that work, and — the valuable part — CHARACTERIZES the real limits:
// caseless scripts admit nothing, spaceless CJK does not tokenize, declensions over-split, a Latin
// name can't earn gravity from uncased neighbours, and the statistical function-word filter needs a
// lowercase population. Marked cases document current behavior so a regression is caught either way.

const admittedOf = (text) => [...parseText(text).admission.admitted.keys()];

// ── Cased scripts admit by gravity, with script-faithful ids ───────────────────────────
test('Cyrillic names admit and keep a script-faithful lowercase id', () => {
  const doc = parseText('Иван пришёл домой. Иван увидел Семёна. Семён поздоровался с Иваном. Иван улыбнулся.');
  const keys = [...doc.admission.admitted.keys()];
  assert.ok(keys.includes('Иван'), `Иван admitted: ${keys}`);
  assert.equal(doc.admission.idOf('Иван'), 'иван');
});

test('Greek names admit through the full pipeline', () => {
  const keys = admittedOf('Σωκράτης ἔφη ταῦτα. Γλαύκων ἀπεκρίνατο αὐτῷ. Σωκράτης ἤκουσε πάλιν.');
  assert.ok(keys.includes('Σωκράτης') && keys.includes('Γλαύκων'), keys.join(','));
});

test('Armenian admits — gravity is the Unicode property, not an enumerated script list', () => {
  const keys = admittedOf('Արամ եկավ տուն։ Արամ տեսավ Անին։ Անին ժպտաց։');
  assert.ok(keys.includes('Արամ') && keys.includes('Անին'), keys.join(','));
});

// ── Caseless scripts: no capital letters, so no name spans — admit NOTHING ──────────────
test('caseless scripts (Arabic, Hebrew, Devanagari) admit nothing — no \\p{Lu} to anchor a name', () => {
  assert.deepEqual(admittedOf('محمد ذهب إلى القاهرة. محمد رأى النيل. القاهرة كبيرة.'), []);
  assert.deepEqual(admittedOf('משה הלך לירושלים. משה ראה את הים. ירושלים גדולה.'), []);
  assert.deepEqual(admittedOf('राम अयोध्या गया। राम ने सीता को देखा। अयोध्या सुंदर है।'), []);
  assert.equal(/\p{Lu}/u.test('رامامومحمد'), false);   // the mechanism: uncased → the anchor is empty
});

test('CJK now segments on 。 into sentences (PR #251); the caseless admitter still finds no name here', () => {
  // The uncased pass (parse/uncased.js) added CJK sentence segmentation — 。(U+3002) is now a
  // boundary. Default admission is still empty for this spaceless line: the uncased-referent
  // discovery, wired into parseText (uncasedReferents on), surfaces no repeated form to admit here.
  const d = parseText('北京很大。李明住在北京。李明喜欢北京。');
  assert.equal(d.sentences.length, 3, '。 is a sentence boundary now — CJK is segmented');
  assert.deepEqual([...d.admission.admitted.keys()], [], 'no capitalized/spaced form → the gravity admitter stays empty');
});

test('Korean has spaces but Hangul is caseless — admits nothing', () => {
  assert.deepEqual(admittedOf('철수는 서울에 갔다. 철수는 한강을 보았다. 서울은 크다.'), []);
});

// ── Gravity mechanics (observe-level) ──────────────────────────────────────────────────
const admit = (text, sentences) => {
  const a = createEntityAdmission({ text });
  sentences.forEach((s, i) => a.observe(s, i));
  return a;
};

test('a multiword non-Latin name is referential on its face — admits on first sighting', () => {
  const a = admit('Пьер Безухов.', ['Пьер Безухов.']);
  assert.equal(a.isAdmitted('Пьер Безухов'), true);
});

test('a single bare token with no context does not admit; a subject with a content-verb does', () => {
  assert.equal(admit('Пьер', ['Пьер']).isAdmitted('Пьер'), false);
  assert.equal(admit('Пьер пришёл домой', ['Пьер пришёл домой']).isAdmitted('Пьер'), true);
});

test('a comma-inset vocative is a strong cue cross-script (no capitalization needed)', () => {
  const a = admit('Здравствуй, Пьер, друг мой.', ['Здравствуй, Пьер, друг мой.']);
  assert.equal(a.isAdmitted('Пьер'), true);
});

// ── The documented limits (characterization; the most valuable to lock down) ────────────
test('CHARACTERIZATION: declensions over-split — nominative and oblique are distinct entities', () => {
  // A human merges Семён/Семёна; admission alone does not (inflection folding is a later, opt-in
  // pass — nominativeForms() is the intended remedy, not applied inside admission).
  const keys = admittedOf('Иван пришёл домой. Иван увидел Семёна. Семён поздоровался с Иваном. Иван улыбнулся.');
  assert.ok(keys.includes('Семён') && keys.includes('Семёна'), `both forms present: ${keys}`);
});

test('CHARACTERIZATION: a Latin name cannot earn gravity from uncased/RTL neighbours', () => {
  // Among Hebrew neighbours the content-word cue (\p{Ll} adjacency + English seed cues) can't fire.
  const rtl = admittedOf('משה פגש את David. David אמר שלום. David הלך.');
  assert.ok(!rtl.includes('David'), `David drops among Hebrew neighbours: ${rtl}`);
  // control: the SAME name with English neighbours admits, proving it's the neighbours, not the name
  const en = admit('David spoke. David left.', ['David spoke.', 'David left.']);
  assert.equal(en.isAdmitted('David'), true);
});

test('CHARACTERIZATION: the function-word filter needs a lowercase population and a sample of ≥5', () => {
  // With no lowercase evidence, a common capitalized word slips through as a false entity.
  assert.ok(admittedOf('Very odd. Very good. Very well. Very nice. Very much. Very true.').includes('Very'));
  // a heavy lowercase load of the same token clears the cap-rate floor and suppresses it
  const suppressed = admittedOf('Pierre Bezukhov arrived. ' + 'it was very odd that day. '.repeat(6) + 'Pierre Bezukhov sat. Pierre Bezukhov stood.');
  assert.ok(!suppressed.includes('Very') && !suppressed.includes('very'));
  assert.ok(suppressed.includes('Pierre Bezukhov'));
});

// ── Non-Latin numerals, mixed script, determinism ─────────────────────────────────────
test('numerals and codes in other scripts do not admit', () => {
  assert.deepEqual(admittedOf('CO2 rose sharply. 80MW was added. Pierre spoke. Pierre left.').filter((k) => /CO|MW|80/.test(k)), []);
  const withArabicDigits = admittedOf('Pierre arrived in ١٩٦١. Pierre left again.');
  assert.ok(withArabicDigits.includes('Pierre') && !withArabicDigits.some((k) => /١٩٦١/.test(k)));
});

test('mixed English+Chinese: only the cased co-referent is visible, and gathers all mentions', () => {
  const doc = parseText('Beijing is large. 李明 lives in Beijing. Beijing grew fast. 李明 likes Beijing.');
  const keys = [...doc.admission.admitted.keys()];
  assert.ok(keys.includes('Beijing'));
  assert.ok(!keys.some((k) => k.includes('李明')), 'the Chinese name is structurally invisible');
  assert.deepEqual(doc.admission.mentions.get('beijing'), [0, 1, 2, 3]);
});

test('admission is deterministic across scripts — same text, same ordered admitted set', () => {
  const t = 'Иван пришёл. Иван ушёл. Пётр остался. Пётр вернулся.';
  assert.deepEqual(admittedOf(t), admittedOf(t));
});
