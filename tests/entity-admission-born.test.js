import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createEntityAdmission } from '../src/perceiver/parse/entities.js';

const observeAll = (text) => {
  const a = createEntityAdmission({ text });
  text.split(/(?<=[.!?])\s+/).filter(Boolean).forEach((s, i) => a.observe(s, i));
  return a;
};

test('entity admission refuses random capital spans below the document Born floor', () => {
  const text = 'Amber Beacon. Cobalt Door. Velvet Orbit. Marble Signal. Quiet Lantern. Silver Window.';
  const a = observeAll(text);
  assert.equal(a.admitted.size, 0, 'one-off capital fragments do not mint entities');
  assert.ok(a.admissionFloor >= 1, 'the document derives a non-zero admission floor');
});

test('entity admission still mints holonic content that beats the random floor', () => {
  const text = [
    'Alice built a bridge for Bob.',
    'Alice repaired the bridge.',
    'Bob thanked Alice.',
    'Alice guided Bob home.',
    'Cobalt Lantern. Marble Signal. Velvet Orbit.',
  ].join(' ');
  const a = observeAll(text);
  assert.equal(a.isAdmitted('Alice'), true, 'recurring acting subject clears the floor');
  assert.equal(a.isAdmitted('Bob'), true, 'strong object/recipient clears the floor');
  assert.equal(a.isAdmitted('Cobalt Lantern'), false, 'random decorative capital span stays unminted');
});
