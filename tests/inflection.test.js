import { test } from 'node:test';
import assert from 'node:assert/strict';

import { induceInflections } from '../src/perceiver/parse/inflection.js';

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
