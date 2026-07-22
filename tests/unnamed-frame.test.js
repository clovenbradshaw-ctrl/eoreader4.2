// Fold-before-gate for the Lens (docs/referents-recursed-up-the-domain-axis.md, D3).
// The referent recovery, one Domain up: a frame whose Born mass is SCATTERED across several
// weak eigen-directions — each below the per-eigenvector null (the star-scale gate) — is
// recovered by pooling the directions that share a BARYCENTER and gating the POOLED mass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldUnnamedFrames, significancePass } from '../src/surfer/surf.js';

// A unit basis vector e_i in `dim` dimensions.
const e = (i, dim = 9) => Array.from({ length: dim }, (_, j) => (j === i ? 1 : 0));

test('pooled sub-null directions that share support are admitted as one unnamed frame', () => {
  // Dominant real Lens on e0; two scattered members on e1/e2 (they will share support); six
  // background directions on e3..e8 with NO support (no unit loads on them). All small weights
  // are equal to the bulk, so each is individually sub-null (not strictly above the null) —
  // exactly the split-mass case the per-direction gate drops.
  const fullSpectrum = [
    { weight: 0.6,  lens: e(0) },
    { weight: 0.05, lens: e(1) },   // scattered member A
    { weight: 0.05, lens: e(2) },   // scattered member B
    { weight: 0.05, lens: e(3) },
    { weight: 0.05, lens: e(4) },
    { weight: 0.05, lens: e(5) },
    { weight: 0.05, lens: e(6) },
    { weight: 0.05, lens: e(7) },
    { weight: 0.05, lens: e(8) },
  ];
  const spectrum = fullSpectrum.map((l) => l.weight);
  // Units that load on e1 AND e2 jointly give the two members the SAME support profile
  // (their barycenter), while nothing loads on e3..e8. A couple of e0 units for the dominant.
  const shared = [0, 1, 1, 0, 0, 0, 0, 0, 0];
  const activations = [shared, shared, shared, shared, e(0), e(0)];

  const frames = foldUnnamedFrames(fullSpectrum, activations, spectrum, { alpha: 0.05 });

  assert.equal(frames.length, 1, 'exactly one unnamed frame recovered');
  const f = frames[0];
  assert.equal(f.real, true, 'the pooled body clears the null');
  assert.equal(f.rank, 2, 'it pooled two eigen-directions');
  assert.equal(f.members.length, 2);
  assert.ok(Math.abs(f.pooledWeight - 0.1) < 1e-6, 'pooled weight is the sum of the members');
});

test('a lone weak direction is not a frame (needs ≥2 sharing a barycenter)', () => {
  const fullSpectrum = [
    { weight: 0.6,  lens: e(0) },
    { weight: 0.05, lens: e(1) },
    { weight: 0.05, lens: e(2) },
    { weight: 0.05, lens: e(3) },
    { weight: 0.05, lens: e(4) },
  ];
  const spectrum = fullSpectrum.map((l) => l.weight);
  // Only e1 has support; e2..e4 load on nothing, so nothing shares e1's barycenter.
  const activations = [e(1), e(1), e(1), e(0), e(0)];
  const frames = foldUnnamedFrames(fullSpectrum, activations, spectrum, { alpha: 0.05 });
  assert.equal(frames.length, 0, 'no barycenter is shared, so no frame is pooled');
});

test('directions with disjoint support are held apart (two distinct nameless bodies)', () => {
  const fullSpectrum = [
    { weight: 0.6,  lens: e(0) },
    { weight: 0.05, lens: e(1) },
    { weight: 0.05, lens: e(2) },
    { weight: 0.05, lens: e(3) },
    { weight: 0.05, lens: e(4) },
    { weight: 0.05, lens: e(5) },
    { weight: 0.05, lens: e(6) },
  ];
  const spectrum = fullSpectrum.map((l) => l.weight);
  // e1/e2 share one barycenter; e3/e4 share a DIFFERENT one. They must not bridge.
  const barA = [0, 1, 1, 0, 0, 0, 0];
  const barB = [0, 0, 0, 1, 1, 0, 0];
  const activations = [barA, barA, barB, barB, e(0)];
  const frames = foldUnnamedFrames(fullSpectrum, activations, spectrum, { alpha: 0.05 });
  assert.equal(frames.length, 2, 'two distinct frames, never one bridged blob');
  for (const f of frames) assert.equal(f.rank, 2);
});

test('significancePass surfaces unnamedFrames only under the opt (byte-identical off)', () => {
  const activations = [
    [0, 1, 1, 0], [0, 1, 1, 0], [0, 1, 1, 0], [1, 0, 0, 0], [1, 0, 0, 0], [0, 0, 0, 1],
  ];
  const off = significancePass(activations, {}, {});
  assert.equal('unnamedFrames' in off, false, 'no significance opt → no field');
  const lensOnly = significancePass(activations, { lensReport: true }, {});
  assert.equal('unnamedFrames' in lensOnly, false, 'lens report alone → no field');
  const on = significancePass(activations, { unnamedFrames: true }, {});
  assert.equal(Array.isArray(on.unnamedFrames), true, 'the opt surfaces an array');
});
