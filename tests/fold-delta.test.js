import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compareDelta, traceDelta, foldDelta } from '../src/perceiver/fold-delta.js';

// A FOLD AGAINST ITS PAST — a standing comparison or trace, re-run against a grown corpus, says
// what moved since you last looked. Pure (prev, curr) → delta, keyed on the stable text the
// surface-safe projections already carry.

test('compareDelta: new + resolved conflicts, new + lost agreements, new divergence', () => {
  const prev = {
    conflict: [{ subject: 'Fusus', a: 'Fusus records faces', b: 'Fusus does not records faces' }],
    shared: [{ text: 'Fusus is a tool' }],
    divergent: [{ subject: 'City' }],
  };
  const curr = {
    conflict: [
      { subject: 'Fusus', a: 'Fusus records faces', b: 'Fusus does not records faces' },  // unchanged
      { subject: 'Vendor', a: 'Vendor is trusted', b: 'Vendor is not trusted' },           // NEW
    ],
    shared: [{ text: 'Fusus watches the city' }],   // the old agreement is gone, a new one appeared
    divergent: [{ subject: 'City' }, { subject: 'Budget' }],  // Budget newly divergent
  };
  const d = compareDelta(prev, curr);
  assert.equal(d.kind, 'compare');
  assert.equal(d.changed, true);
  assert.equal(d.newConflicts.length, 1);
  assert.equal(d.newConflicts[0].subject, 'Vendor');
  assert.equal(d.resolved.length, 0);
  assert.equal(d.newAgreements.length, 1);
  assert.match(d.newAgreements[0].text, /watches the city/);
  assert.equal(d.lostAgreements.length, 1);
  assert.match(d.lostAgreements[0].text, /is a tool/);
  assert.equal(d.newDivergent.length, 1);
  assert.equal(d.newDivergent[0].subject, 'Budget');
  assert.match(d.summary, /new conflict/);
});

test('compareDelta: a conflict that resolved is reported as resolved', () => {
  const prev = { conflict: [{ subject: 'X', a: 'X is p', b: 'X is not p' }], shared: [], divergent: [] };
  const curr = { conflict: [], shared: [{ text: 'X is p' }], divergent: [] };
  const d = compareDelta(prev, curr);
  assert.equal(d.resolved.length, 1);
  assert.equal(d.newAgreements.length, 1);
  assert.match(d.summary, /resolved/);
});

test('compareDelta: identical runs → no change', () => {
  const r = { conflict: [{ subject: 'X', a: 'a', b: 'b' }], shared: [{ text: 't' }], divergent: [{ subject: 'S' }] };
  const d = compareDelta(r, r);
  assert.equal(d.changed, false);
  assert.match(d.summary, /no change/);
});

test('traceDelta: new idea, an idea that spread further, an idea newly mutated', () => {
  const prev = { ideas: [
    { text: 'Fusus watches the city', hops: [{ label: 'Ford', relation: 'echoed' }] },
  ] };
  const curr = { ideas: [
    { text: 'Fusus watches the city', hops: [{ label: 'Ford', relation: 'echoed' }, { label: 'Vega', relation: 'flipped' }] }, // spread + mutated
    { text: 'the vendor was hidden', hops: [{ label: 'Ito', relation: 'echoed' }] },  // NEW idea changed hands
  ] };
  const d = traceDelta(prev, curr);
  assert.equal(d.kind, 'trace');
  assert.equal(d.newIdeas.length, 1);
  assert.match(d.newIdeas[0].text, /vendor/);
  assert.equal(d.spread.length, 1);            // Fusus idea reached Vega
  assert.equal(d.newlyMutated.length, 1);      // and that new voice inverted it
  assert.match(d.summary, /new idea|spread|mutated/);
});

test('foldDelta dispatches by result shape', () => {
  assert.equal(foldDelta({ ideas: [] }, { ideas: [] }).kind, 'trace');
  assert.equal(foldDelta({ conflict: [], shared: [], divergent: [] }, { conflict: [], shared: [], divergent: [] }).kind, 'compare');
});
