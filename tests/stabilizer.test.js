// Assembly 5 (Logic Gaps v0.1) — symmetry on the lens axis.
//
// stabilizerOf(doc, lenses) reads what survives EVERY lens in a family — the dual of
// the disagreement-only reads the rest of the codebase already runs (frame-channel.js,
// roles.js). The lenses here are the real `propositionsOf` reading
// (model/blind-structure.js — the SAME base-keyed Map shape frame-channel and the
// blind-structure gate already compare propositions through), used two ways: as-is,
// and negated (a deliberately opposed reading, built from the same real POLARITY
// values Assembly 1 introduced) — not an invented lens shape, a real reading run
// through a real transform.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { eotDoc } from '../src/organs/ingest/eot.js';
import { propositionsOf } from '../src/model/blind-structure.js';
import { POLARITY } from '../src/model/polarity.js';
import { stabilizerOf } from '../src/surfer/stabilizer.js';

const CODE = [
  'chargeCard : Function',
  'ledger : Module',
  'refund : Function',
  'chargeCard -> ledger : imports',
  'chargeCard -> refund : calls',
].join('\n');
const codeDoc = () => eotDoc(CODE, { docId: 'code', door: 'perceiver' });

// the identity lens: propositionsOf as it reads, unmodified.
const identityLens = { name: 'identity', read: (doc) => propositionsOf(doc) };

// a second, real (differently-parameterized) lens: Assembly 1's declared closure with
// an empty universe — a genuinely different call, and a no-op on this fixture (nothing
// declared, nothing NULL-materializes), so it should agree with identityLens everywhere.
const declaredEmptyLens = { name: 'declared-empty', read: (doc) => propositionsOf(doc, { closure: 'declared', universe: [] }) };

// a deliberately OPPOSED lens: the same real propositionsOf reading, every polarity
// flipped (+/- swapped). This disagrees with identityLens on every base it shares.
const flipPolarity = (pol) => (pol === POLARITY.POS ? POLARITY.NEG : pol === POLARITY.NEG ? POLARITY.POS : pol);
const negatedLens = {
  name: 'negated',
  read: (doc) => new Map([...propositionsOf(doc)].map(([base, p]) => [base, { ...p, pol: flipPolarity(p.pol) }])),
};

test('stabilizerOf: a single-lens family has fixedRatio === 1 by definition (a lens agrees with itself)', () => {
  const s = stabilizerOf(codeDoc(), [identityLens]);
  assert.equal(s.fixedRatio, 1);
  assert.ok(s.invariant.length > 0);
  assert.deepEqual(s.invariant, [...identityLens.read(codeDoc()).keys()].sort());
});

test('stabilizerOf: two lenses that genuinely agree everywhere produce fixedRatio === 1, non-empty orbit', () => {
  const s = stabilizerOf(codeDoc(), [identityLens, declaredEmptyLens]);
  assert.equal(s.fixedRatio, 1);
  assert.ok(s.orbit.size > 0);
  for (const [, readings] of s.orbit) assert.equal(readings.size, 1);
});

test('stabilizerOf: two deliberately-opposed lenses produce fixedRatio < 1 with a non-empty orbit', () => {
  const s = stabilizerOf(codeDoc(), [identityLens, negatedLens]);
  assert.ok(s.orbit.size > 0);
  assert.ok(s.fixedRatio < 1);
  // nothing survives — every shared base's polarity was flipped by construction
  assert.equal(s.invariant.length, 0);
  for (const [, readings] of s.orbit) assert.equal(readings.size, 2, 'each base takes two distinct readings across the opposed pair');
});

test('stabilizerOf: an empty lens family has an empty orbit and fixedRatio === 1 (vacuous agreement)', () => {
  const s = stabilizerOf(codeDoc(), []);
  assert.equal(s.orbit.size, 0);
  assert.equal(s.invariant.length, 0);
  assert.equal(s.fixedRatio, 1);
});

// ── the composability / containment law ──────────────────────────────────────────

test('stabilizerOf: containment law — stabilizerOf(doc, L1∪L2).invariant ⊆ stabilizerOf(doc,L1).invariant ∩ stabilizerOf(doc,L2).invariant', () => {
  const doc = codeDoc();
  const L1 = [identityLens];
  const L2 = [identityLens, negatedLens];
  const L1L2 = [identityLens, negatedLens, declaredEmptyLens];

  const s1 = stabilizerOf(doc, L1);
  const s2 = stabilizerOf(doc, L2);
  const sUnion = stabilizerOf(doc, L1L2);

  const inv1 = new Set(s1.invariant);
  const inv2 = new Set(s2.invariant);
  const invUnion = new Set(sUnion.invariant);

  for (const base of invUnion) {
    assert.ok(inv1.has(base), `${base} must survive L1 alone for the containment law to hold`);
    assert.ok(inv2.has(base), `${base} must survive L2 alone for the containment law to hold`);
  }
});

test('stabilizerOf: containment law holds across several random lens-family combinations on the fixture', () => {
  const doc = codeDoc();
  const pool = [identityLens, declaredEmptyLens, negatedLens];
  // every combination of >=1 lenses drawn from the pool, checked pairwise against their union
  const combos = [];
  for (let mask = 1; mask < (1 << pool.length); mask++) {
    combos.push(pool.filter((_, i) => mask & (1 << i)));
  }
  for (const a of combos) {
    for (const b of combos) {
      const union = [...new Set([...a, ...b])];
      const invA = new Set(stabilizerOf(doc, a).invariant);
      const invB = new Set(stabilizerOf(doc, b).invariant);
      const invUnion = stabilizerOf(doc, union).invariant;
      for (const base of invUnion) {
        assert.ok(invA.has(base) && invB.has(base), 'containment law violated for a combo pair');
      }
    }
  }
});
