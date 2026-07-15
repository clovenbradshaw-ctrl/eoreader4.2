import { test } from 'node:test';
import assert from 'node:assert/strict';

import { induceInflections } from '../src/perceiver/parse/inflection.js';
import { parseText } from '../src/perceiver/parse/pipeline.js';

// MORPHOLOGICAL FOLDING — induce the case-suffix set from the forms themselves, then fold a
// name's declensions onto one referent. No table, no "genitive"; just which tails the stems of
// this text alternate through.

test('induces the case suffixes and folds declensions of one name', () => {
  // three declining stems so a tail attests across ≥3 stems and is judged an inflection.
  const forms = new Map([
    ['Наташа', 50], ['Наташу', 20], ['Наташе', 10],
    ['Ростов', 40], ['Ростова', 15], ['Ростову', 9], ['Ростове', 5],
    ['Борис', 18], ['Бориса', 12], ['Борису', 6], ['Борисе', 4],
    ['Кутузов', 30],                       // a name with no declined twin — stands alone
    ['Ростопчин', 7],                      // shares "Росто" but a long tail — NOT a Rostov case
  ]);
  const { suffixes, fold } = induceInflections(forms);
  assert.ok(suffixes.has('а') && suffixes.has('у'), 'the case endings are induced from the forms');
  // declensions fold to one canonical (the most frequent form)
  assert.equal(fold.get('Наташу'), 'Наташа');
  assert.equal(fold.get('Наташе'), 'Наташа');
  assert.equal(fold.get('Ростова'), 'Ростов');
  assert.equal(fold.get('Борису'), 'Борис');
  // distinct people are NOT merged
  assert.notEqual(fold.get('Ростопчин'), fold.get('Ростов'), 'a long tail is a different name, not a case');
  assert.equal(fold.get('Кутузов'), 'Кутузов', 'a name with no declined twin stands alone');
});

test('English barely inflects, so almost nothing folds (safe)', () => {
  // Distinct English names share no case paradigm; only a stray plural/possessive tail, which
  // does not attest across enough stems to become an "inflection".
  const forms = new Map([['Pierre', 10], ['Andrew', 8], ['Elizabeth', 12], ['Darcy', 6], ['Bingley', 5]]);
  const { fold } = induceInflections(forms);
  for (const f of forms.keys()) assert.equal(fold.get(f), f, `${f} is its own referent`);
});

test('a shared prefix alone does not fold — the tails must be inflectional', () => {
  // "Mark" and "Market" share a prefix but "et" is not an induced case ending here.
  const { fold } = induceInflections(new Map([['Mark', 5], ['Market', 3], ['Marks', 2]]));
  assert.notEqual(fold.get('Market'), fold.get('Mark'), 'Market is not a case of Mark');
});

test('accepts a bare array of forms too', () => {
  // three HARD-stem names sharing the а/у/е paradigm, so each ending attests across 3 stems.
  const { fold } = induceInflections(
    ['Анна', 'Анну', 'Анне', 'Маша', 'Машу', 'Маше', 'Даша', 'Дашу', 'Даше'],
    { minStem: 3 });
  assert.equal(fold.get('Анну'), fold.get('Анна'));
  assert.equal(fold.get('Машу'), fold.get('Маша'));
  assert.notEqual(fold.get('Анна'), fold.get('Маша'), 'different names stay apart');
});

test('anchored on nominatives: two names sharing a stem stay apart, obliques route by longest stem', () => {
  // Franz (Франц) and France (Франция) share the stem "франц" but are two nominatives.
  const forms = new Map([
    ['Франц', 15], ['Франца', 9], ['Францу', 4],
    ['Франция', 12], ['Францию', 9], ['Францией', 7], ['Франции', 44],
    ['Ростов', 40], ['Ростова', 15], ['Ростову', 9],
  ]);
  const nominatives = new Set(['Франц', 'Франция', 'Ростов']);
  const { fold } = induceInflections(forms, { nominatives, minStems: 1 });
  assert.notEqual(fold.get('Франц'), fold.get('Франция'), 'Franz and France are two referents, not one');
  assert.equal(fold.get('Франца'), 'Франц', 'Franz genitive routes to Franz (freq breaks the stem-5 tie)');
  assert.equal(fold.get('Францию'), 'Франция', 'France accusative routes to France (longer stem "франци")');
  assert.equal(fold.get('Франции'), 'Франция', 'France genitive routes to France');
  assert.equal(fold.get('Ростова'), 'Ростов', 'and ordinary declensions still fold');
});

// THROUGH THE PIPELINE (opt-in). Wired into parseText behind `foldInflections`, the fold reads the
// admitted names, induces the case set, and commits each oblique→nominative as a SYN merge the
// projection unions — so an inflected cast stops fracturing across cases. Default off is a no-op.
test('parseText folds a Russian cast\'s declensions only when foldInflections is on', () => {
  // Three clean hard-stem names, each a frequent subject (nominative) with a mid-sentence oblique
  // in -а, so -а attests on three stems and is judged inflectional.
  const ru = `Иван пришёл. Иван сел. Иван встал. Иван молчал.
Борис пришёл. Борис сел. Борис встал. Борис читал.
Антон пришёл. Антон сел. Антон встал. Антон думал.
Все ждали Ивана. Мы видели Бориса. Она позвала Антона.
Никто не видел Ивана. Гости ждали Бориса. Дети звали Антона.`;

  const merges = (doc) => new Set(doc.log.events
    .filter((e) => e.op === 'SYN' && e.match === 'inflection')
    .map((e) => `${e.from}→${e.to}`));

  // Off (default): no oblique is folded — each surface form is its own referent.
  assert.equal(merges(parseText(ru, { docId: 'ru' })).size, 0, 'default off is a no-op');

  // On: every oblique folds onto its nominative, and no nominative is folded onto another.
  const on = merges(parseText(ru, { docId: 'ru', foldInflections: true }));
  assert.ok(on.has('ивана→иван'),   'Ивана folds onto Иван');
  assert.ok(on.has('бориса→борис'), 'Бориса folds onto Борис');
  assert.ok(on.has('антона→антон'), 'Антона folds onto Антон');
  for (const m of on) assert.ok(!/^(иван|борис|антон)→/.test(m), `a nominative is never folded away (${m})`);
});

// English is (nearly) uninflected, so the same opt-in pass folds nothing — the read is unchanged.
test('parseText with foldInflections leaves an English cast intact (nothing to fold)', () => {
  const en = `Pierre arrived. Pierre spoke. Pierre left.
Andrew waited. Andrew watched. Andrew rose.
Elizabeth smiled. Elizabeth read. Elizabeth walked.
They all saw Pierre. Nobody saw Andrew. Someone called Elizabeth.`;
  const inflMerges = parseText(en, { docId: 'en', foldInflections: true }).log.events
    .filter((e) => e.op === 'SYN' && e.match === 'inflection');
  assert.equal(inflMerges.length, 0, 'English induces ~no case set, so nothing folds');
});
