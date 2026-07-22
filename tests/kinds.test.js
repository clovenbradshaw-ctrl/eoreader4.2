// surfer/kinds.js — detectKinds, the Existence-row sibling of holons.js (Structure row)
// and surf.js's paradigmReading (Interpretation row): recurring classes over entities,
// detected by the Born rule over each entity's operational profile, never a caller flag.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createLog } from '../src/core/log.js';
import { detectKinds, kindRecurrence } from '../src/surfer/kinds.js';
import { OPS } from '../src/surfer/structure-basis.js';

// Three behaviorally distinct entity classes, each a dominant "signature" operator plus a
// dense low-count spread across every operator (the realistic case: no entity is EVER
// touched by only one operator, so the density operator has support in every dimension —
// DEF's own gap-null needs enough non-degenerate background samples to calibrate against,
// the same reason holons.js reads its cast over up to 48 figures rather than a handful).
const buildDoc = () => {
  const log = createLog({ docId: 'toy' });
  const classes = {
    noticed: ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'],
    bonded:  ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'],
    argued:  ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'],
  };
  const signature = { noticed: 'SIG', bonded: 'CON', argued: 'EVA' };
  let u = 0;
  for (const [cls, ids] of Object.entries(classes)) {
    for (const id of ids) {
      for (const op of OPS) {
        const reps = op === signature[cls] ? 10 : 1;
        for (let r = 0; r < reps; r++) { log.append({ op, id, sentIdx: u }); u++; }
      }
    }
  }
  const admission = { labelOf: (id) => id, signals: () => null };
  return { log, admission, units: new Array(u).fill(0), sentences: new Array(u).fill(0) };
};

test('detectKinds: three behaviorally distinct entity classes yield a real, non-abstaining split', () => {
  const doc = buildDoc();
  const r = detectKinds(doc);
  assert.equal(r.abstain, false, 'three distinct behavioral signatures should not abstain to one Kind');
  assert.ok(r.k >= 2, `expected a real multi-class split, got k=${r.k}`);
  assert.equal(r.entities, 18, 'every profiled entity is counted');
});

test('detectKinds: not every entity collapses into one kind', () => {
  const doc = buildDoc();
  const r = detectKinds(doc);
  const allIds = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6'];
  const kindsSeen = new Set(allIds.map((id) => r.kindOf(id)));
  assert.ok(kindsSeen.size >= 2, `expected at least two distinct kinds actually populated, got ${JSON.stringify([...kindsSeen])}`);
});

test('detectKinds: every retained kind is real — it has members and a closure in [0,1]', () => {
  const doc = buildDoc();
  const r = detectKinds(doc);
  assert.ok(r.kinds.length >= 1);
  for (const kd of r.kinds) {
    assert.ok(kd.closure >= 0 && kd.closure <= 1, `closure out of range: ${kd.closure}`);
    assert.ok(kd.members.length > 0, 'a retained kind with zero members would be a phantom, never reported');
  }
  const totalMembers = r.kinds.reduce((n, kd) => n + kd.members.length, 0);
  assert.equal(totalMembers, r.entities, 'every entity lands in exactly one retained kind');
});

test('detectKinds: a flat entity population (one behavior, no distinction) abstains', () => {
  const log = createLog({ docId: 'flat' });
  const ids = ['x1', 'x2', 'x3', 'x4', 'x5'];
  let u = 0;
  for (let r = 0; r < 10; r++) for (const id of ids) { log.append({ op: 'INS', id, sentIdx: u }); u++; }
  const doc = { log, admission: { labelOf: (id) => id, signals: () => null }, units: new Array(u).fill(0) };
  const r = detectKinds(doc);
  assert.equal(r.abstain, true, 'one flat behavior over every entity is not a real Kind distinction');
  assert.equal(kindRecurrence(doc), false);
});

test('detectKinds: too few entities abstains rather than inventing a split', () => {
  const log = createLog({ docId: 'sparse' });
  log.append({ op: 'INS', id: 'only-one', sentIdx: 0 });
  const doc = { log, admission: { labelOf: (id) => id, signals: () => null }, units: [0] };
  const r = detectKinds(doc);
  assert.equal(r.abstain, true);
  assert.equal(r.k, 0);
  assert.equal(r.kindOf('only-one'), null);
});

test('kindRecurrence mirrors detectKinds.abstain', () => {
  const doc = buildDoc();
  assert.equal(kindRecurrence(doc), !detectKinds(doc).abstain);
  assert.equal(kindRecurrence(doc), true);
});
