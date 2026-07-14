// The plain version's two live redraws, tested as arithmetic — the only two things that move
// under the person's hand. Both are pure folds (reversible, no state), and both reproduce the
// panels in the plain-version doc exactly. Change the basis and "surveillance" becomes a
// different thing (§3); center on a node and the same picture reads differently (§5).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readAs, basesOf, centerOn } from '../src/rooms/plain/select.js';
import { MEANINGS, BASIS_ORDER, GRAPH } from '../src/rooms/plain/scene.js';

const labels = (rows) => rows.map((r) => r.label);
const S = MEANINGS.surveillance;

test('read as everyone: camera > line item > partnership > legal > sensing > thing-done (§3)', () => {
  assert.deepEqual(labels(readAs(S, 'everyone')), [
    'a camera that records',
    'a line item in a contract',
    'a partnership with a business group',
    'a legal exposure',
    'a sensing capability',
    'a thing done to people',
  ]);
});

test('read as the budget hearing: line item > capability > partnership > camera (§3)', () => {
  assert.deepEqual(labels(readAs(S, 'budget')), [
    'a line item in a contract',
    'a sensing capability',
    'a partnership with a business group',
    'a camera that records',
  ]);
});

test('read as the court filing: thing-done > legal exposure > camera > line item (§3)', () => {
  assert.deepEqual(labels(readAs(S, 'court')), [
    'a thing done to people',
    'a legal exposure',
    'a camera that records',
    'a line item in a contract',
  ]);
});

test('the same word, two bases, two completely different things', () => {
  assert.notEqual(labels(readAs(S, 'budget'))[0], labels(readAs(S, 'court'))[0]);
});

test("everyone is the sum of the bases — a source can't be double-counted", () => {
  const total = (label) => readAs(S, 'everyone').find((r) => r.label === label).weight;
  const perBasis = (label) => ['budget', 'court', 'press']
    .reduce((s, b) => s + (readAs(S, b).find((r) => r.label === label)?.weight || 0), 0);
  for (const m of S) assert.equal(total(m.label), perBasis(m.label), m.label);
});

test('bars are sorted and shares are relative to the top bar', () => {
  const rows = readAs(S, 'everyone');
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].weight >= rows[i].weight, 'sorted');
  assert.equal(rows[0].share, 1);
  assert.ok(rows[rows.length - 1].share < 1);
});

test('the dropdown only offers bases the word is actually used under', () => {
  assert.deepEqual(basesOf(S, BASIS_ORDER), ['everyone', 'budget', 'court', 'press']);
});

test('center on a node: it becomes the hub, everything else a spoke that reads from it (§5)', () => {
  const c = centerOn(GRAPH, 'fusus', GRAPH.order);
  assert.equal(c.label, 'Fusus');
  assert.deepEqual(c.spokes.map((s) => s.id), ['partnership', 'budget', 'chief']);
  assert.equal(c.spokes.find((s) => s.id === 'partnership').role, "who it's sold with");
});

test('center on a spoke instead: nothing moved, everything reads differently (§5)', () => {
  const c = centerOn(GRAPH, 'partnership', GRAPH.order);
  assert.equal(c.label, 'Downtown Partnership');
  // the former center is now a spoke, described from where we now stand
  const fusus = c.spokes.find((s) => s.id === 'fusus');
  assert.equal(fusus.role, "the platform they're tied to");
  // the role is asymmetric — the flip is a change of basis, not a relabel
  const back = centerOn(GRAPH, 'fusus', GRAPH.order).spokes.find((s) => s.id === 'partnership').role;
  assert.notEqual(fusus.role, back);
});

test('centering on an unknown node is refused, not faked', () => {
  assert.equal(centerOn(GRAPH, 'nobody'), null);
});
