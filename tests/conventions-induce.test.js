import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createConventions, BOUNDARY } from '../src/core/conventions/index.js';
import { parseText } from '../src/perceiver/parse/index.js';

// THE LEDGER CAN INDUCE ITS SLOTS — the seed-free geometry every organ reads through the one
// seam. It is ADDITIVE: a ledger built without `induce` is byte-identical, and induction never
// changes an `is<Register>` answer; it only ADDS the slot field (slotOf / slotMates / closed
// class) that a consumer may adopt.

const DET = ['a', 'the'], NOUN = ['dog', 'cat', 'man'], VERB = ['ran', 'ate', 'saw'];
const stream = () => {
  const s = [];
  for (const d of DET) for (const n of NOUN) for (const v of VERB) { s.push(d, n, v, BOUNDARY); s.push(d, n, v, BOUNDARY); }
  return s;
};

test('a ledger with no induce carries no slot field (byte-identical to before)', () => {
  const c = createConventions();
  assert.equal(c.slotOf('the'), null);
  assert.equal(c.isClosedClass('the'), false);
  assert.deepEqual(c.inducedSlots, []);
  assert.deepEqual(c.slotMatesOf('the'), []);
  assert.equal(c.slotField, null);
});

test('handed a token stream, the ledger induces slots and the closed class', () => {
  const c = createConventions({ induce: stream() });
  // the classes fall out by shared company…
  assert.equal(c.slotOf('a'), c.slotOf('the'), 'determiners share a slot');
  assert.equal(c.slotOf('dog'), c.slotOf('cat'), 'nouns share a slot');
  assert.notEqual(c.slotOf('a'), c.slotOf('dog'), 'determiner and noun slots are distinct');
  assert.ok(c.slotMatesOf('dog').includes('cat'), 'slot-mates are the other nouns');
  // determiners recur most → they emerge as the closed-class frame, with no list.
  assert.equal(c.isClosedClass('the'), true);
});

test('induction is additive — the seeded registers are unchanged', () => {
  const seeded = createConventions();
  const induced = createConventions({ induce: stream() });
  for (const w of ['the', 'and', 'of', 'said', 'dog', 'ran', 'he', 'unto']) {
    assert.equal(induced.isFunction(w), seeded.isFunction(w), `isFunction(${w}) unchanged`);
    assert.equal(induced.isPreposition(w), seeded.isPreposition(w), `isPreposition(${w}) unchanged`);
    assert.equal(induced.isStarter(w), seeded.isStarter(w), `isStarter(${w}) unchanged`);
  }
});

test('seeds OFF + induce: the ledger still learns kinds from company alone', () => {
  const c = createConventions({ seeds: false, induce: stream() });
  assert.equal(c.isFunction('the'), false, 'no seeds → the seeded predicate is empty');
  assert.equal(c.slotOf('a'), c.slotOf('the'), 'but the slots are still induced from units alone');
  assert.equal(c.isClosedClass('the'), true);
});

const SAMPLE = `Victor walked to the village. He saw the old man by the river.
The man spoke to Victor. Elizabeth waited at the house. She loved Victor dearly.
Victor returned to the house and Elizabeth smiled. The village was quiet that evening.`;

test('parseText threads induction onto the doc conventions, and stays non-invasive', () => {
  const plain = parseText(SAMPLE, { docId: 'x' });
  const induced = parseText(SAMPLE, { docId: 'x', induceSlots: true });
  // default read carries no slot field…
  assert.equal(plain.conventions.slotOf('the'), null);
  // …the induced read does, reachable through the conventions seam every organ reads.
  assert.equal(typeof induced.conventions.slotOf, 'function');
  assert.ok(Array.isArray(induced.conventions.inducedSlots));
  // and admission is UNCHANGED — induction is additive, not a rewrite of the reading.
  assert.equal(induced.admission.admitted.size, plain.admission.admitted.size,
    'the entity reading is identical with induction on');
});
