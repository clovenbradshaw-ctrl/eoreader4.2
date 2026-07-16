import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createCorefField } from '../src/perceiver/parse/coref.js';
import { createDeixisFrame } from '../src/perceiver/parse/deixis.js';
import { parseRelations } from '../src/perceiver/parse/relations.js';

const admission = {
  isAdmitted: (label) => ['Creature', 'De Lacey', 'family'].includes(label) || ['creature', 'de-lacey', 'family'].includes(label),
  idOf: (label) => ({ Creature: 'creature', 'De Lacey': 'de-lacey', family: 'family' }[label] || label),
};

test('first-person subject uses the grounded deixis teller, not the hottest addressee', () => {
  const field = createCorefField();
  field.note('creature', 0);
  field.note('de-lacey', 1);
  const deixis = createDeixisFrame({ field: (idx) => field.field(idx), minRun: 1 });
  deixis.noteFirstPerson(0);
  deixis.groundTeller(0);

  const rels = parseRelations('I educated De Lacey.', admission, { field: () => field.field(2), deixis }, { referents: true, sentIdx: 2 });
  assert.equal(rels[0].src, 'creature');
  assert.notEqual(rels[0].src, 'de-lacey');
});

test('ungrounded first-person deixis holds instead of falling through to salience', () => {
  const field = createCorefField();
  field.note('de-lacey', 0);
  const deixis = createDeixisFrame({ field: (idx) => field.field(idx), minRun: 1 });
  deixis.noteFirstPerson(1);

  const rels = parseRelations('I educated De Lacey.', admission, { field: () => field.field(1), deixis }, { referents: true, sentIdx: 1 });
  assert.equal(rels.length, 0);
});
