import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createCorefField } from '../src/perceiver/parse/coref.js';
import { createDeixisFrame } from '../src/perceiver/parse/deixis.js';
import { parseRelations } from '../src/perceiver/parse/relations.js';
import { createParser } from '../src/perceiver/parse/index.js';

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

test('the teller couples by its grounding confidence — a distribution, never a flat-1 verdict', () => {
  // Uncontested: the teller is the only grounded candidate, so it couples at 1.
  const solo = createCorefField();
  solo.note('walton', 0);
  const dSolo = createDeixisFrame({ field: (idx) => solo.field(idx), minRun: 1 });
  dSolo.noteFirstPerson(1); dSolo.groundTeller(1);
  assert.equal(dSolo.tellerAt(1).id, 'walton');
  assert.equal(dSolo.tellerAt(1).w, 1);

  // Contested but margin-clearing: a hotter narrator wins, and the residual mass of the
  // rival rides through as a sub-1 coupling — the field is reported, not a verdict.
  const rival = createCorefField();
  rival.note('walton', 0); rival.note('walton', 0); rival.note('walton', 0);
  rival.note('margaret', 0);
  const dRival = createDeixisFrame({ field: (idx) => rival.field(idx), minRun: 1 });
  dRival.noteFirstPerson(0); dRival.groundTeller(0);
  const t = dRival.tellerAt(0);
  assert.equal(t.id, 'walton');
  assert.ok(t.w > 0 && t.w < 1, `expected a graded coupling, got ${t.w}`);
});

test('through the real parser, a first-person clause binds the established narrator, not the addressee', () => {
  // Regression for the pipeline ordering: grounding must read the field BEFORE this
  // sentence's own entities fold in, or "I" borrows the salience of the object it names.
  const doc = createParser().parse(
    'Victor Frankenstein studied hard. I taught De Lacey to read. I loved Felix.');
  const edges = doc.log.snapshot().filter((e) => e.op === 'CON' || e.op === 'SIG');
  const loved = edges.find((e) => e.via === 'loved');
  assert.ok(loved, 'the "I loved Felix" clause produced an edge');
  assert.equal(loved.src, 'victor-frankenstein');   // the teller — not de-lacey, the earlier object
  assert.ok(!edges.some((e) => e.src === 'de-lacey'),
    'the addressee is never mistaken for the teller');
});
