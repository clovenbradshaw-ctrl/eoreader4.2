import { test } from 'node:test';
import assert from 'node:assert/strict';

import { surpriseAt } from '../src/core/surprise.js';

// Regression: found running eoPriors' fold-bridge over the COMPLETE text of
// Frankenstein (tests/fixtures/frankenstein.txt, 3364 spans) — 43 spans past
// sentence ~2153 produced bayesBits === Infinity, poisoning any aggregate mean
// that summed over them. Root cause: a prior atom's mass is γ^(at−1−firstSeen),
// which underflows to exactly 0.0 in double precision once `at` is far enough
// past a stale atom that hasn't been refreshed. If that same atom then recurs
// in `arrival`, priorW(k)/sumW is exactly 0 and the KL term divides by zero.
test('surpriseAt: a prior atom underflowed to exactly 0 mass, recurring in arrival, yields a finite KL term (not Infinity)', () => {
  const prior = new Map([
    ['stale-atom', 0],       // simulates γ^n having underflowed to exactly 0.0
    ['warm-atom', 5],
  ]);
  const arrival = new Map([['stale-atom', 1]]);   // the stale atom recurs
  const { bayesBits } = surpriseAt(prior, arrival, { gamma: 0.7, novelty: 1.0 });
  assert.ok(Number.isFinite(bayesBits), `expected a finite bayesBits, got ${bayesBits}`);
  assert.ok(bayesBits > 0, 'a genuine zero-prior recurrence should still register as a real, large surprise');
});

test('surpriseAt: the same recurrence against a NONZERO stale prior stays finite and smaller than the zero-mass case', () => {
  const priorZero = new Map([['stale-atom', 0], ['warm-atom', 5]]);
  const priorSmall = new Map([['stale-atom', 1e-3], ['warm-atom', 5]]);
  const arrival = new Map([['stale-atom', 1]]);
  const { bayesBits: bitsZero } = surpriseAt(priorZero, arrival, { gamma: 0.7, novelty: 1.0 });
  const { bayesBits: bitsSmall } = surpriseAt(priorSmall, arrival, { gamma: 0.7, novelty: 1.0 });
  assert.ok(Number.isFinite(bitsZero) && Number.isFinite(bitsSmall));
  assert.ok(bitsZero >= bitsSmall, 'less prior mass (down to the underflow floor) should never score as LESS surprising');
});

test('surpriseAt: ordinary readings (no zero-mass prior atoms) are unaffected by the floor', () => {
  const prior = new Map([['a', 2], ['b', 3]]);
  const arrival = new Map([['a', 1]]);
  const { bayesBits } = surpriseAt(prior, arrival, { gamma: 0.7, novelty: 1.0 });
  assert.ok(Number.isFinite(bayesBits));
  assert.ok(bayesBits >= 0);
});
