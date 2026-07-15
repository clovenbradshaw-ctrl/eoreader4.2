import { test } from 'node:test';
import assert from 'node:assert/strict';

import { induceInflections } from '../src/perceiver/parse/inflection.js';
import { parseText } from '../src/perceiver/parse/pipeline.js';

// A ROBUST BATTERY for inflection folding (the gutenberg branch: induce a language's case suffixes
// from the surface forms, then fold declensions of one name onto one referent). It exercises the
// two algorithms (plain union vs. nominative-anchored), the thresholds (minStem/maxSuffix/minStems),
// languages beyond Cyrillic, the real FALSE-MERGE failure mode of the plain path and the anchored
// guard that fixes it, and the full pipeline event shape — the parts the existing test leaves open.

// ── Degenerate input + suffix invariants ───────────────────────────────────────────────
test('empty / null / single-form input is safe; suffixes always carry the bare stem, lowercased', () => {
  for (const empty of [induceInflections([]), induceInflections(null), induceInflections(undefined)]) {
    assert.deepEqual([...empty.suffixes], ['']);
    assert.equal(empty.fold.size, 0);
  }
  const one = induceInflections(new Map([['Наташа', 5]]));
  assert.equal(one.fold.get('Наташа'), 'Наташа');
});

// ── Folding is language-agnostic (Latin, Spanish, German) ──────────────────────────────
test('Latin declensions fold every oblique onto the -us base', () => {
  const { suffixes, fold } = induceInflections(new Map([
    ['amicus', 10], ['amici', 8], ['amico', 5], ['amicum', 4],
    ['servus', 9], ['servi', 7], ['servo', 4], ['servum', 3],
    ['dominus', 11], ['domini', 6], ['domino', 5], ['dominum', 4],
  ]));
  assert.ok(suffixes.has('us') && suffixes.has('i'));
  assert.equal(fold.get('amici'), 'amicus');
  assert.equal(fold.get('servum'), 'servus');
  assert.equal(fold.get('domino'), 'dominus');
});

test('Spanish plural folds to singular — but only when -s attests on enough stems', () => {
  const three = induceInflections(new Map([['amigo', 10], ['amigos', 5], ['libro', 8], ['libros', 4], ['gato', 6], ['gatos', 3]]));
  assert.ok(three.suffixes.has('s'));
  assert.equal(three.fold.get('amigos'), 'amigo');
  // only two stems attest -s → below default minStems:3 → nothing folds
  const two = induceInflections(new Map([['amigo', 10], ['amigos', 5], ['libro', 8], ['libros', 4]]));
  assert.equal(two.fold.get('amigos'), 'amigos');
});

test('every induced suffix is lowercase and the bare stem is always present', () => {
  const { suffixes } = induceInflections(new Map([['Наташа', 9], ['Наташу', 4], ['Маша', 8], ['Машу', 3], ['Даша', 7], ['Дашу', 3]]), { minStem: 3 });
  assert.ok(suffixes.has(''));
  assert.ok([...suffixes].every((s) => s === s.toLowerCase()));
});

// ── Thresholds: minStem / maxSuffix / whitespace ───────────────────────────────────────
test('maxSuffix draws the line between an ending and a different word', () => {
  const forms = new Map([['Kari', 10], ['Kariabc', 2], ['Vera', 10], ['Veraabc', 2]]);
  assert.equal(induceInflections(forms, { minStems: 2, maxSuffix: 3 }).fold.get('Kariabc'), 'Kari');   // 'abc' is an ending
  assert.equal(induceInflections(forms, { minStems: 2, maxSuffix: 2 }).fold.get('Kariabc'), 'Kariabc'); // too long → its own word
});

test('forms below minStem, or containing whitespace, are dropped from the fold', () => {
  const { fold } = induceInflections(new Map([['Ivan', 10], ['Ivana', 5], ['Zzz', 9], ['graf Ivan', 3]]), { minStems: 1 });
  assert.equal(fold.has('Zzz'), false);            // length 3 < default minStem 4
  assert.equal(fold.has('graf Ivan'), false);      // whitespace
  assert.equal(fold.get('Ivana'), 'Ivan');
});

// ── The false-merge failure mode, and the anchored guard ───────────────────────────────
test('CHARACTERIZATION: the plain union OVER-MERGES two distinct names that share a stem', () => {
  // Франц (a person) and Франция (a country) share the stem "Франц" — plain union collides them.
  // This is the real failure mode the anchored algorithm exists to prevent; pinned here.
  const { fold } = induceInflections(new Map([['Франц', 15], ['Франца', 9], ['Франция', 12], ['Францию', 9], ['Франции', 44]]), { minStems: 1 });
  assert.equal(fold.get('Франц'), fold.get('Франция'), 'they collide into one cluster');
});

test('the nominative-anchored algorithm keeps distinct subjects apart and routes obliques correctly', () => {
  const opts = { nominatives: new Set(['Франц', 'Франция']), minStems: 1 };
  const { fold } = induceInflections(new Map([['Франц', 15], ['Франца', 9], ['Франция', 12], ['Францию', 9]]), opts);
  assert.notEqual(fold.get('Франц'), fold.get('Франция'), 'the two anchors never merge');
  assert.equal(fold.get('Франца'), 'Франц');
  assert.equal(fold.get('Францию'), 'Франция');
});

// ── Canonical selection differs by algorithm ───────────────────────────────────────────
test('plain-union canonical is the most frequent form (can be an oblique); anchored keeps the nominative', () => {
  const forms = new Map([['Ростова', 40], ['Ростов', 5], ['Ростову', 9]]);
  assert.equal(induceInflections(forms, { minStems: 1 }).fold.get('Ростов'), 'Ростова');   // oblique wins on frequency
  assert.equal(induceInflections(forms, { nominatives: new Set(['Ростов']), minStems: 1 }).fold.get('Ростова'), 'Ростов');
});

// ── Case, mixed scripts, orphans, determinism ──────────────────────────────────────────
test('folding is case-insensitive but the canonical keeps its surface case', () => {
  const { fold } = induceInflections(['наташа', 'Наташа', 'наташу', 'Наташу', 'маша', 'машу', 'даша', 'дашу'], { minStem: 3, minStems: 1 });
  assert.equal(fold.get('наташа'), fold.get('Наташа'));         // one referent across case
  assert.notEqual(fold.get('маша'), fold.get('даша'));          // different names stay apart
});

test('mixed scripts fold independently — no cross-script merge', () => {
  const { fold } = induceInflections(new Map([['Ivan', 10], ['Ivana', 5], ['Иван', 8], ['Ивана', 4]]), { minStems: 1 });
  assert.equal(fold.get('Ivana'), 'Ivan');
  assert.equal(fold.get('Ивана'), 'Иван');
  assert.notEqual(fold.get('Ivan'), fold.get('Иван'));
});

test('anchored: an oblique matching no nominative folds to itself; an empty anchor set folds nothing', () => {
  const orphan = induceInflections(new Map([['Ivan', 10], ['Ivana', 3], ['Olegov', 4]]), { nominatives: new Set(['Ivan']), minStems: 1 });
  assert.equal(orphan.fold.get('Olegov'), 'Olegov');
  const none = induceInflections(new Map([['Ростов', 40], ['Ростова', 15]]), { nominatives: new Set(), minStems: 1 });
  assert.equal(none.fold.get('Ростова'), 'Ростова');
});

test('induction is deterministic — identical input, identical fold', () => {
  const forms = new Map([['Наташа', 9], ['Наташу', 4], ['Наташе', 3], ['Борис', 8], ['Бориса', 3], ['Борису', 2]]);
  assert.equal(JSON.stringify([...induceInflections(forms).fold]), JSON.stringify([...induceInflections(forms).fold]));
});

// ── Through the pipeline (opt-in) — event shape + guards ────────────────────────────────
const RU = `Иван пришёл. Иван сел. Иван встал. Иван молчал.
Борис пришёл. Борис сел. Борис встал. Борис читал.
Антон пришёл. Антон сел. Антон встал. Антон думал.
Все ждали Ивана. Мы видели Бориса. Она позвала Антона.
Никто не видел Ивана. Гости ждали Бориса. Дети звали Антона.`;

test('the pipeline commits a declension fold as a fully-formed SYN + EVA pair', () => {
  const doc = parseText(RU, { docId: 'ru', foldInflections: true });
  const syn = doc.log.events.find((e) => e.op === 'SYN' && e.match === 'inflection');
  assert.ok(syn, 'a SYN inflection merge was committed');
  assert.equal(syn.kind, 'merge');
  assert.equal(syn.warrant, 'declension');
  assert.equal(syn.from, syn.from.toLowerCase(), 'ids are lowercase');
  assert.equal(syn.to, syn.to.toLowerCase());
  const eva = doc.log.events.find((e) => e.op === 'EVA' && e.reason === 'declension-fold');
  assert.ok(eva, 'a paired EVA corroborates the fold');
  assert.equal(eva.verdict, 'corroborated');
});

test('the pipeline never folds one nominative onto another (the anchored guard holds end to end)', () => {
  const doc = parseText(RU, { docId: 'ru', foldInflections: true });
  const merges = doc.log.events.filter((e) => e.op === 'SYN' && e.match === 'inflection').map((e) => `${e.from}→${e.to}`);
  assert.ok(merges.length >= 3, 'the three obliques folded');
  for (const m of merges) assert.ok(!/^(иван|борис|антон)→/.test(m), `a nominative is never folded away (${m})`);
});

test('the pipeline folds nothing when only ONE name declines (default minStems:3 unmet)', () => {
  const one = `Иван пришёл. Иван сел. Иван встал. Все ждали Ивана. Гости звали Ивана.`;
  const doc = parseText(one, { docId: 'one', foldInflections: true });
  const infl = doc.log.events.filter((e) => e.op === 'SYN' && e.match === 'inflection');
  assert.equal(infl.length, 0, 'a single declining stem does not clear the attestation threshold');
});
