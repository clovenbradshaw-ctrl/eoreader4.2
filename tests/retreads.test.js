import { test } from 'node:test';
import assert from 'node:assert/strict';

import { retreads } from '../src/surfer/salience.js';

// retreads() is the measured self-repetition read: does a continuation move belief mostly back
// onto already-said ground (onBits > offBits, the self-normalized surprise crossing) rather than
// out to something new? It replaces the reverted hard-coded sampling penalty.

const SAID =
  'Woodpeckers belong to the family Picidae. They range widely in size. They drum on trees to '
  + 'communicate and excavate insects and sap from trunks with strong chisel-like beaks.';

test('a paragraph that re-covers already-said ground retreads', () => {
  const repeat = 'Woodpeckers excavate insects and sap from trees with their strong chisel-like beaks.';
  assert.equal(retreads(SAID, repeat), true);
});

test('a paragraph that adds a genuinely new point does not retread', () => {
  const novel = 'Some woodpecker species face serious conservation threats from habitat loss.';
  assert.equal(retreads(SAID, novel), false);
});

test('reusing the topic word does not by itself count as retreading', () => {
  // "woodpeckers"/"trees" are already said, but the point (nesting in carved cavities) is new —
  // the KL split must not let the ever-present subject word dominate into a false stop.
  const novelButOnTopic = 'Woodpeckers also nest in tree cavities they carve themselves.';
  assert.equal(retreads(SAID, novelButOnTopic), false);
});

test('an empty candidate or empty prior never retreads', () => {
  assert.equal(retreads(SAID, ''), false);
  assert.equal(retreads('', 'anything at all here'), false);
  assert.equal(retreads('', ''), false);
});

test('a near-verbatim restatement retreads', () => {
  const restate = 'They range widely in size and drum on trees to communicate.';
  assert.equal(retreads(SAID, restate), true);
});
