// core/segment.js — the named segmentation operator (docs/segment-by-significance.md).
// segmentCurve is a pure pass-through to SEG (parity is by construction, not tested
// here — SEG has its own coverage). This file covers the two new arms: segmentGroups
// (DEF-derived k, no caller-hardcoded count) and segmentSwitches (null-gated switch
// acceptance, replacing a fixed run-length floor).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { segmentGroups, segmentSwitches } from '../src/core/segment.js';

// Two well-separated clusters in an 8-dim space — enough eigenvalues (dims) for DEF's
// own gap-null to clear MIN_SAMPLES; a 4-dim space only yields 3 gaps, one short of
// what deriveNull needs even before the leave-one-out drops one more.
const clusterVectors = (nA, nB, jitter = 0.02, rng = mulberry32(1)) => {
  const dim = 8;
  const a = Array.from({ length: dim }, (_, i) => (i === 0 ? 1 : 0));
  const b = Array.from({ length: dim }, (_, i) => (i === 1 ? 1 : 0));
  const vs = [];
  for (let i = 0; i < nA; i++) vs.push(a.map((x) => x + (rng() - 0.5) * jitter));
  for (let i = 0; i < nB; i++) vs.push(b.map((x) => x + (rng() - 0.5) * jitter));
  return vs;
};
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

test('segmentGroups: two well-separated clusters derive k=2, never a caller-supplied count', () => {
  const vs = clusterVectors(30, 30);
  const g = segmentGroups(vs);
  assert.equal(g.abstain, false, 'a real two-cluster elbow should not abstain');
  assert.equal(g.k, 2, 'k is DERIVED from the eigen-gap, not passed in');
});

test('segmentGroups: a single isotropic cluster abstains to k=1', () => {
  const rng = mulberry32(7);
  const vs = Array.from({ length: 40 }, () => [1 + (rng() - 0.5) * 0.05, (rng() - 0.5) * 0.05, (rng() - 0.5) * 0.05]);
  const g = segmentGroups(vs);
  assert.equal(g.k, 1);
  assert.equal(g.abstain, true, 'a flat spectrum is one reading, not an invented split');
});

test('segmentGroups.score: assign and score agree on the winning group', () => {
  const vs = clusterVectors(20, 20);
  const g = segmentGroups(vs);
  for (const v of vs) {
    const { dom, top1, top2 } = g.score(v);
    assert.equal(dom, g.assign(v));
    assert.ok(top1 >= top2, 'the winner never scores below the runner-up');
  }
});

// ---- segmentSwitches ------------------------------------------------------------

const rawOf = (doms, topOf = () => ({ top1: 1, top2: 0 })) =>
  doms.map((dom, i) => (dom === -1 ? { dom: -1, top1: 0, top2: 0 } : { dom, ...topOf(i) }));

test('segmentSwitches: a run with no signal (-1) carries the prior group forward', () => {
  const raw = rawOf([0, 0, -1, -1, 0]);
  const out = segmentSwitches(raw, { minRun: 1 });
  assert.deepEqual(out, [0, 0, 0, 0, 0]);
});

test('segmentSwitches: a genuinely confident switch amid a jittery noisy bulk is accepted', () => {
  // deriveNull fits the null to the BULK and treats a few high outliers as real
  // structure (voidnull.js) — so the realistic case is many low-margin, uncertain
  // flickers (the noise bulk) and one clearly-outlying high-margin switch (the real
  // transition), not the reverse. Five weak alternations (margin ~0.08-0.12), then
  // one confident break to a new group (margin ~0.9).
  const raw = [
    { dom: 0, top1: 1, top2: 0 },       // instantiates
    { dom: 1, top1: 0.54, top2: 0.46 }, // weak flicker, margin .08
    { dom: 0, top1: 0.56, top2: 0.44 }, // weak flicker, margin .12
    { dom: 1, top1: 0.545, top2: 0.455 },
    { dom: 0, top1: 0.555, top2: 0.445 },
    { dom: 1, top1: 0.55, top2: 0.45 },
    { dom: 2, top1: 0.95, top2: 0.05 }, // confident real transition, margin .90
    { dom: 2, top1: 1, top2: 0 },
  ];
  const out = segmentSwitches(raw, { minRun: 100 });   // minRun huge — must NOT be what accepts it
  assert.equal(out[6], 2, 'the confident switch to group 2 is accepted on its own merit, not by minRun');
  assert.equal(out[7], 2);
});

test('segmentSwitches: the weak jittery flickers around it are absorbed, not asserted as boundaries', () => {
  const raw = [
    { dom: 0, top1: 1, top2: 0 },
    { dom: 1, top1: 0.54, top2: 0.46 },
    { dom: 0, top1: 0.56, top2: 0.44 },
    { dom: 1, top1: 0.545, top2: 0.455 },
    { dom: 0, top1: 0.555, top2: 0.445 },
    { dom: 1, top1: 0.55, top2: 0.45 },
    { dom: 2, top1: 0.95, top2: 0.05 },
    { dom: 2, top1: 1, top2: 0 },
  ];
  const out = segmentSwitches(raw, { minRun: 100 });
  // Every weak flicker before the real transition should carry group 0 (the first
  // instantiated group) — none of the low-margin alternations should be asserted.
  for (let i = 1; i <= 5; i++) assert.equal(out[i], 0, `unit ${i}'s weak flicker should carry group 0`);
});

test('segmentSwitches: cold start (too few candidates to derive a null) falls back to minRun', () => {
  // Only one candidate switch total — nowhere near MIN_SAMPLES — so the gate cannot
  // derive a line and must defer to the minRun floor, exactly as boundedNull itself
  // falls back to a caller constant only at the edge the physics cannot reach.
  const raw = rawOf([0, 0, 0, 1, 1, 1, 1, 1]);
  const acceptedByLength = segmentSwitches(raw, { minRun: 2 });
  assert.equal(acceptedByLength[3], 1, 'run of length 5 clears a minRun of 2');
  const rejectedByLength = segmentSwitches(raw, { minRun: 10 });
  assert.equal(rejectedByLength[3], 0, 'run of length 5 does not clear a minRun of 10 — carried');
});
