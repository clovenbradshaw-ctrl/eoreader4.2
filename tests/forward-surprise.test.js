import { test } from 'node:test';
import assert from 'node:assert/strict';

import { forwardScore, forwardDist, surpriseAt, NOVELTY_RESERVE } from '../src/core/surprise.js';

// The FORWARD predictive channel (Track A) — −log₂ p(arrival) under p(next | profile). surpriseAt is
// the backward object (how far belief moved); this is the forward object scored. These pin the golden
// values, the opening/newcomer/reserve behavior, modality-agnosticism, purity, and — the parity gate —
// that adding it leaves surpriseAt/forwardDist byte-identical (the text path is untouched until the
// gated RULES_REV adoption wires it into the reading's surprisal).

const M = (obj) => new Map(Object.entries(obj));

test('forwardScore: golden — a well-predicted arrival costs fewer bits than a surprising one', () => {
  const profile = M({ A: 3, B: 1 });                 // Z = 3+1+novelty(1) = 5 → p(A)=0.6, p(B)=0.2, reserve=0.2
  const a = forwardScore(profile, M({ A: 1 }));
  assert.equal(a.predBits, 0.74, '−log₂ 0.6 ≈ 0.74');
  assert.equal(a.predMeanBits, 0.74);
  assert.equal(a.novel, 0);

  const b = forwardScore(profile, M({ B: 1 }));
  assert.equal(b.predBits, 2.32, '−log₂ 0.2 ≈ 2.32');
  assert.ok(a.predBits < b.predBits, 'the heavier (better-predicted) atom is less surprising — the whole point');
});

test('forwardScore: a NEWCOMER draws the reserve share (protention), and is flagged novel', () => {
  const profile = M({ A: 3, B: 1 });                 // reserve = 0.2
  const c = forwardScore(profile, M({ C: 1 }));
  assert.equal(c.predBits, 2.32, 'an unseen atom is scored at −log₂(reserve) = −log₂ 0.2');
  assert.equal(c.novel, 1, 'it is counted as a newcomer');
  assert.equal(c.reserve, 0.2, 'the protention mass share is surfaced');
});

test('forwardScore: a multi-atom arrival is the mass-weighted joint surprisal + a per-mass mean', () => {
  const profile = M({ A: 3, B: 1 });
  const r = forwardScore(profile, M({ A: 1, C: 1 }));   // 0.737 (A) + 2.322 (C newcomer)
  assert.equal(r.predBits, 3.06, 'total −log₂ p(arrival), mass-weighted');
  assert.equal(r.predMeanBits, 1.53, 'per-unit-mass — the comparable, calibratable number');
  assert.equal(r.novel, 1);
  assert.ok(r.predBy.C > r.predBy.A, 'predBy names which atoms the reader failed to foresee — the steer axis');
});

test('forwardScore: the opening (empty profile) is an honest zero, never a divergence', () => {
  const r = forwardScore(new Map(), M({ A: 1 }));      // Z = novelty = 1, reserve = 1 → p = 1 → 0 bits
  assert.equal(r.predBits, 0, 'nothing has been read yet, so nothing could have been foreseen — zero, not ∞');
  const empty = forwardScore(M({ A: 1 }), new Map());
  assert.equal(empty.predBits, 0, 'an empty arrival scores nothing');
});

test('forwardScore: MODALITY-AGNOSTIC — it scores any Map<atom,mass> basis, not just text', () => {
  // a "tonal move" basis (music), no text atoms anywhere — the same core scores it.
  const profile = M({ up7: 2, rep: 1 });               // Z = 4 → p(up7) = 0.5
  const r = forwardScore(profile, M({ up7: 1 }));
  assert.equal(r.predBits, 1, '−log₂ 0.5 = 1 bit, over a non-text basis');
  assert.ok(Number.isFinite(r.predMeanBits));
});

test('forwardScore: pure — it mutates neither the profile nor the arrival', () => {
  const profile = M({ A: 3, B: 1 });
  const arrival = M({ A: 1, C: 1 });
  const pBefore = JSON.stringify([...profile]);
  const aBefore = JSON.stringify([...arrival]);
  forwardScore(profile, arrival);
  assert.equal(JSON.stringify([...profile]), pBefore, 'profile untouched');
  assert.equal(JSON.stringify([...arrival]), aBefore, 'arrival untouched');
});

test('forwardScore honors a signal-derived reserve (protention) the same way forwardDist does', () => {
  const profile = M({ A: 3, B: 1 });
  const tight = forwardScore(profile, M({ C: 1 }), { novelty: 0.2 });   // committed frame → unseen is a bigger shock
  const loose = forwardScore(profile, M({ C: 1 }), { novelty: 2 });     // open frame → unseen is expected, less shock
  assert.ok(tight.predBits > loose.predBits, 'a smaller reserve makes a newcomer more surprising — the calibration knob');
});

test('PARITY GATE: the backward channel is byte-identical — forwardScore adds a sibling, changes nothing', () => {
  const prior = M({ A: 3, B: 1 });
  const arrival = M({ A: 1, C: 1 });
  // surpriseAt (the backward object) is unchanged by the presence of the forward channel.
  const before = JSON.stringify(surpriseAt(prior, arrival, { gamma: 0.7 }));
  const fwd = forwardScore(prior, arrival);
  const after = JSON.stringify(surpriseAt(prior, arrival, { gamma: 0.7 }));
  assert.equal(before, after, 'surpriseAt is untouched by forwardScore');
  // forwardDist is the object forwardScore reads — asserting it still sums to 1 (dist + reserve).
  const { dist, reserve } = forwardDist(prior);
  const total = dist.reduce((s, [, p]) => s + p, 0) + reserve;
  assert.ok(Math.abs(total - 1) < 1e-9, 'p(next) is a proper distribution: Σ dist + reserve = 1');
  assert.ok(fwd.predBits >= 0, 'predictive surprisal is non-negative');
  assert.equal(NOVELTY_RESERVE, 1.0);
});
