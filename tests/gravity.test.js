// write/gravity.js — the weight of the turn (docs/weight-of-the-turn.md). No prior coverage
// existed for turnWeights/arcGravity; this establishes the baseline behaviour AND the new
// terrain-aware coupling (docs/referents-recursed-up-the-domain-axis.md D4 — terrain typing
// and the weight-of-the-turn were two parallel systems until now).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { turnWeights, arcGravity, TERRAIN_GRAVITY } from '../src/weave/write/gravity.js';

// A fake doc: events carry {op, sentIdx}. cursor 3 is REC-only (no INS/CON/SIG) → Ground
// grain (Atmosphere); cursor 7 is REC+INS → Figure grain (Lens).
const makeDoc = () => ({
  log: {
    events: [
      { op: 'REC', sentIdx: 3 },
      { op: 'REC', sentIdx: 7 }, { op: 'INS', sentIdx: 7 },
    ],
  },
});

// field entries land equal Bayesian surprise (bayes=2) at both cursors, over a median of 1
// (from [0, 2, 2, 0]) — so WITHOUT terrain the two turns are exactly equally weighted, and
// any divergence terrainAware introduces is attributable to the terrain coupling alone.
const makeSurf = () => ({
  recCursors: [3, 7],
  field: [{ idx: 0, bayes: 0 }, { idx: 3, bayes: 2 }, { idx: 7, bayes: 2 }, { idx: 10, bayes: 0 }],
});

test('turnWeights: no recCursors → empty', () => {
  assert.deepEqual(turnWeights({ recCursors: [], field: [] }), []);
  assert.deepEqual(turnWeights(null), []);
});

test('turnWeights: normalises the strongest turn to 1, sorted by cursor', () => {
  const w = turnWeights(makeSurf());
  assert.equal(w.length, 2);
  assert.equal(w[0].cursor, 3);
  assert.equal(w[1].cursor, 7);
  assert.equal(w[0].weight, 1);
  assert.equal(w[1].weight, 1, 'equal raw surprise → equal weight, terrain-blind by default');
});

test('turnWeights: terrainAware without a doc is a no-op (byte-identical)', () => {
  const withoutDoc = turnWeights(makeSurf(), { terrainAware: true });
  const plain = turnWeights(makeSurf());
  assert.deepEqual(withoutDoc, plain, 'terrainAware alone (no doc) cannot resolve terrain — stays identical');
});

test('turnWeights: terrainAware + doc scales a Ground-grain REC down relative to a Figure-grain one', () => {
  const w = turnWeights(makeSurf(), { doc: makeDoc(), terrainAware: true });
  const at3 = w.find(t => t.cursor === 3), at7 = w.find(t => t.cursor === 7);
  assert.ok(at3.weight < at7.weight, `Ground-grain turn (${at3.weight}) should weigh less than Figure-grain (${at7.weight})`);
  assert.equal(at7.weight, 1, 'the heavier (Figure-grain) turn still normalises to 1');
  assert.equal(at3.weight, 0.75, 'Ground scales the raw margin by the documented 0.75 factor before renormalising');
});

test('TERRAIN_GRAVITY defaults off unless the env var is set', () => {
  assert.equal(TERRAIN_GRAVITY, /^(1|true|on)$/i.test(process.env.TERRAIN_GRAVITY || ''));
});

// ── arcGravity: the same coupling, one level up (the trajectory's turns) ─────────────────
const makeTraj = () => ({
  focus: 'Alice',
  gained: [], lost: [],
  turns: [3, 7],
  phases: [
    { phase: 0, span: [0, 3], relations: [{ role: 'subj', via: 'meet', other: 'Bob', at: 1 }] },
    { phase: 1, span: [4, 7], relations: [{ role: 'subj', via: 'leave', other: 'Bob', at: 5 }] },
    { phase: 2, span: [8, 10], relations: [{ role: 'subj', via: 'return', other: 'Bob', at: 9 }] },
  ],
});

test('arcGravity: null without a trajectory or with no phases', () => {
  assert.equal(arcGravity(null), null);
  assert.equal(arcGravity({ phases: [] }), null);
});

test('arcGravity: terrainAware + doc changes which turn is heaviest when raw surprise ties', () => {
  const traj = makeTraj();
  const surf = makeSurf();
  const plain = arcGravity(traj, { surf });
  // tied raw weights → the first turn scanned wins ties (>), so cursor 3 is "heaviest" by default.
  assert.equal(plain.heaviest, 3);

  const terrainScaled = arcGravity(traj, { surf, doc: makeDoc(), terrainAware: true });
  assert.equal(terrainScaled.heaviest, 7, 'the Figure-grain turn outweighs the Ground-grain one once terrain breaks the tie');
});

test('arcGravity: terrainAware without doc reproduces the plain (untied) result', () => {
  const traj = makeTraj();
  const surf = makeSurf();
  const plain = arcGravity(traj, { surf });
  const withoutDoc = arcGravity(traj, { surf, terrainAware: true });
  assert.deepEqual(withoutDoc, plain);
});
