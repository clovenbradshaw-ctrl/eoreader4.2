import { test } from 'node:test';
import assert from 'node:assert/strict';

import { rankProperties, figureSurface } from '../src/perceiver/index.js';

// rankProperties is the fix for "the #1 property of Elvis is 'still alive'". The raw DEF
// predicates arrive in log-append order; whichever the parser emitted first led, however
// generic. This ranks the DISTINCT properties on the signals the record already carries —
// corroboration (distinct witnessing passages), construction confidence, specificity, and
// modality/polarity — and folds the duplicate witnesses of one property into a trail.

test('a specific, well-witnessed property outranks a generic one that merely came first', () => {
  const ranked = rankProperties([
    // the junk that used to lead: a bare two-word generic, one witness, no digits
    { id: 'e', label: 'Elvis', value: 'still alive', idx: 3, confidence: 0.9 },
    // the real, specific property: a longer phrase with a date, witnessed twice
    { id: 'e', label: 'Elvis', value: 'a 75-minute 2001 documentary film', idx: 10, confidence: 0.9 },
    { id: 'e', label: 'Elvis', value: 'a 75-minute 2001 documentary film', idx: 14, confidence: 0.9 },
  ]);
  assert.equal(ranked[0].value, 'a 75-minute 2001 documentary film');
  assert.equal(ranked[ranked.length - 1].value, 'still alive');
  assert.ok(ranked[0].score > ranked[ranked.length - 1].score);
});

test('duplicate witnesses fold into one row with a provenance trail', () => {
  const ranked = rankProperties([
    { id: 'e', value: 'a documentary film about impersonators', idx: 4, confidence: 0.8 },
    { id: 'e', value: 'A documentary film about impersonators.', idx: 9, confidence: 0.6 }, // same, case/punct differ
    { id: 'e', value: 'a documentary film about impersonators', idx: 4, confidence: 0.8 }, // exact repeat, same passage
  ]);
  assert.equal(ranked.length, 1, 'normalised to a single distinct property');
  assert.deepEqual(ranked[0].witnesses, [4, 9], 'both distinct passages recorded, deduped');
  assert.equal(ranked[0].count, 2);
  assert.equal(ranked[0].confidence, 0.8, 'the highest-confidence surface form leads');
});

test('corroboration lifts a property; a negated/irrealis one is demoted vs. its plain twin', () => {
  const twoWitness = rankProperties([
    { id: 'e', value: 'toured the country', idx: 1, confidence: 0.7 },
    { id: 'e', value: 'toured the country', idx: 2, confidence: 0.7 },
  ])[0];
  const oneWitness = rankProperties([
    { id: 'e', value: 'toured the country', idx: 1, confidence: 0.7 },
  ])[0];
  assert.ok(twoWitness.score > oneWitness.score, 'more witnesses → more standing');

  const [plain, negated] = rankProperties([
    { id: 'e', value: 'confirmed the sighting', idx: 1, confidence: 0.9 },
    { id: 'e', value: 'denied the sighting', idx: 2, confidence: 0.9, polarity: '−' },
  ]);
  assert.equal(plain.value, 'confirmed the sighting');
  assert.ok(plain.score > negated.score, 'a plain realis assertion outstands a negated one');
});

test('nothing is discarded but an empty value; a missing confidence defaults, never throws', () => {
  const ranked = rankProperties([
    { id: 'e', value: '   ', idx: 1 },              // empty → dropped
    { id: 'e', value: 'a violinist', idx: 2 },      // no confidence → default 0.5
    { value: 'stateless', idx: 3, confidence: 0.5 },
  ]);
  assert.equal(ranked.length, 2);
  assert.ok(ranked.every((r) => Number.isFinite(r.score) && Number.isFinite(r.confidence)));
  assert.deepEqual(rankProperties([]), []);
  assert.deepEqual(rankProperties(), []);
});

test('figureSurface carries the provenance signals rankProperties consumes', () => {
  // A minimal doc whose log yields a DEF predicate — the surface must pass confidence/
  // polarity/modality/idx through so the ranker has something to score on.
  const events = [
    { op: 'INS', id: 'x', label: 'Kaufman', sentIdx: 0 },
    { op: 'DEF', id: 'x', key: 'predicate', value: 'an impersonator', sentIdx: 0, confidence: 0.9, polarity: '+', modality: 'realis' },
  ];
  const doc = {
    log: { snapshot: () => events, events },
    admission: { labelOf: (id) => (id === 'x' ? 'Kaufman' : id) },
  };
  const fs = figureSurface(doc, ['x']);
  const d = fs.defs.find((z) => z.value === 'an impersonator');
  assert.ok(d, 'the DEF surfaced');
  assert.equal(d.confidence, 0.9);
  assert.equal(d.polarity, '+');
  assert.equal(d.modality, 'realis');
  assert.equal(d.idx, 0);
});
