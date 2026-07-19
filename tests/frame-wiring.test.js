// Wiring the measurement-endorsed primitives (docs/referents-recursed-up-the-domain-axis.md,
// "Measured"): M2 — structuralHorizon.localKeys (the relativistic read); M3 —
// crossSourceFrameVerdicts (the frame channel across sources, where the probe measured its
// conflict actually fires).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { structuralHorizon, crossSourceFrameVerdicts, OPS } from '../src/surfer/structure-basis.js';

const spike = (i) => { const v = new Array(9).fill(0); v[i] = 3; return v; };

// A fake doc: n units, each carrying the given operators (by name) — enough for structuralActivations.
const makeDoc = (ops, n) => {
  const events = [];
  for (let i = 0; i < n; i++) for (const op of ops) events.push({ op, sentIdx: i, id: `e${i}` });
  return { units: Array.from({ length: n }, (_, i) => ({ text: `u${i}` })), log: { snapshot: () => events } };
};

test('M2 — structuralHorizon reports several local keys when the reading shifts', () => {
  const profiles = [...Array(70).fill(0).map(() => spike(1)), ...Array(70).fill(0).map(() => spike(6))];
  const h = structuralHorizon(profiles);
  assert.ok(h.localKeys.distinct >= 2, 'a document that shifts reads in ≥2 local keys');
  assert.ok(h.localKeys.windows >= 2);
  assert.ok(h.localKeys.spread.length >= 2);
});

test('M2 — a uniform reading is one local key (no false relativity)', () => {
  const profiles = Array(80).fill(0).map(() => spike(3));
  const h = structuralHorizon(profiles);
  assert.equal(h.localKeys.distinct, 1);
  assert.equal(h.localKeys.diverged, 0);
});

test('M3 — crossSourceFrameVerdicts yields one verdict per source pair, shaped', () => {
  const A = makeDoc(['SIG', 'CON'], 90);
  const B = makeDoc(['DEF', 'EVA'], 90);
  const C = makeDoc(['INS', 'SYN'], 90);
  const v = crossSourceFrameVerdicts([{ id: 'A', doc: A }, { id: 'B', doc: B }, { id: 'C', doc: C }]);
  assert.equal(v.length, 3, 'C(3,2) pairs');
  for (const r of v) {
    assert.ok(['converge', 'conflict', 'held'].includes(r.verdict));
    assert.ok(typeof r.a === 'string' && typeof r.b === 'string');
  }
});

test('M3 — two identical sources are never a conflict (incommensurability ≈ 0)', () => {
  const A = makeDoc(['SIG', 'CON', 'DEF'], 90);
  const A2 = makeDoc(['SIG', 'CON', 'DEF'], 90);
  const [r] = crossSourceFrameVerdicts([{ id: 'A', doc: A }, { id: 'A2', doc: A2 }]);
  assert.notEqual(r.verdict, 'conflict', 'identical readings are not held apart');
});

test('M3 — a source too thin to eigen-decompose is dropped, not crashed', () => {
  const A = makeDoc(['SIG', 'CON'], 90);
  const tiny = makeDoc(['DEF'], 1);
  const v = crossSourceFrameVerdicts([{ id: 'A', doc: A }, { id: 'tiny', doc: tiny }]);
  assert.equal(v.length, 0, 'a sub-rank source yields no pair');
});
