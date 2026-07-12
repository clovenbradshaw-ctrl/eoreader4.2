import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createWorkingFeel, decayed } from '../src/murmur/valence/index.js';
import { bornCollapse, commitProbability, amplitude } from '../src/murmur/steer/index.js';

// Anti-rumination (spec §8). A cheap continuous loop, unguarded, spirals like inner monologue —
// the same worry looping and amplifying. The guards: decay, no-compounding, refractory, ttl.

const ref = { turnId: 't1', stepName: 'fold' };

test('no compounding — a repeated identical signal does NOT climb (spec §8)', () => {
  let now = 1000;
  const feel = createWorkingFeel({ lambdaDecay: 0, now: () => now });   // λ=0 to isolate compounding
  const first = feel.raise({ register: 'unease', intensity: 0.5, ref });
  assert.equal(first.intensity, 0.5);
  // the same alarm ringing ten more times …
  for (let i = 0; i < 10; i++) { now += 100; feel.raise({ register: 'unease', intensity: 0.5, ref }); }
  const f = feel.feel();
  assert.equal(f.length, 1, 'ten repeats collapse to ONE live impression');
  assert.equal(f[0].intensity, 0.5, 'intensity does not sum — the tenth "something\'s off" is the same alarm');

  // a STRONGER later reading of the same worry must not raise it either (spec §8, not Math.max).
  feel.raise({ register: 'unease', intensity: 0.95, ref });
  assert.equal(feel.feel()[0].intensity, 0.5, 'a stronger duplicate does not amplify the live impression');
});

test('a repeat refreshes the timestamp (decay resets) but never raises intensity', () => {
  let now = 1000;
  const feel = createWorkingFeel({ lambdaDecay: 0.15, now: () => now });
  feel.raise({ register: 'drift', intensity: 0.8, ref });
  now += 5000;                                   // 5s later it has decayed
  const beforeRefresh = feel.feel()[0].decayedIntensity;
  assert.ok(beforeRefresh < 0.8, 'it decayed');
  feel.raise({ register: 'drift', intensity: 0.8, ref });   // same alarm again
  const afterRefresh = feel.feel()[0].decayedIntensity;
  assert.ok(afterRefresh > beforeRefresh, 'the refresh resets decay (still ringing)');
  assert.ok(afterRefresh <= 0.8 + 1e-9, 'but never exceeds the original intensity');
});

test('decay — old impressions fade: decayedIntensity = intensity·e^(−λ·age)', () => {
  const imp = { intensity: 1.0, ts: 0 };
  assert.ok(Math.abs(decayed(imp, 0, 0.15) - 1.0) < 1e-9, 'age 0 → full');
  const at10s = decayed(imp, 10000, 0.15);
  assert.ok(Math.abs(at10s - Math.exp(-1.5)) < 1e-6, '10s at λ=0.15 → e^(−1.5)');
});

test('perishability — ttl expiry drops an impression regardless of intensity', () => {
  let now = 1000;
  const feel = createWorkingFeel({ ttlMs: 2000, lambdaDecay: 0, now: () => now });
  feel.raise({ register: 'surprise', intensity: 1.0, ref });
  assert.equal(feel.feel().length, 1);
  now += 2500;                                   // past ttl
  assert.equal(feel.feel().length, 0, 'a perished impression is gone even at intensity 1.0');
});

test('refractory — after the narrator fires on a ref it is muted for the cooldown', () => {
  let now = 1000;
  const feel = createWorkingFeel({ refractoryMs: 8000, now: () => now });
  assert.equal(feel.narratorMuted(ref), false, 'not muted before firing');
  feel.noteNarratorFired('drift', ref);
  assert.equal(feel.narratorMuted(ref), true, 'muted immediately after firing');
  now += 9000;
  assert.equal(feel.narratorMuted(ref), false, 'un-muted after the cooldown window');
});

test('sampling is a rumination guard — the Born rule does not fire deterministically', () => {
  // A borderline hunch (p≈0.09) fires rarely; a strong one (p≈0.81) fires often. Squaring is the
  // noise gate (spec §4a). Deterministic rng sweep, no Math.random.
  assert.ok(Math.abs(commitProbability(0.3, 0.3) - 0.09) < 1e-9, 'faint tremor p=0.09');
  assert.ok(Math.abs(commitProbability(0.9, 0.9) - 0.81) < 1e-9, 'strong signal p=0.81');
  assert.ok(Math.abs(amplitude(0.5, 0.5) - 0.5) < 1e-9, 'ψ=√(s·d)');

  let faint = 0, strong = 0;
  const N = 1000;
  for (let i = 0; i < N; i++) {
    const u = (i + 0.5) / N;                      // deterministic uniform sweep in (0,1)
    if (bornCollapse({ surprise: 0.3, drift: 0.3 }, () => u).commit) faint++;
    if (bornCollapse({ surprise: 0.9, drift: 0.9 }, () => u).commit) strong++;
  }
  assert.ok(Math.abs(faint / N - 0.09) < 0.02, `faint commits ~9% of the time (got ${(faint / N * 100).toFixed(1)}%)`);
  assert.ok(Math.abs(strong / N - 0.81) < 0.02, `strong commits ~81% (got ${(strong / N * 100).toFixed(1)}%)`);
});

test('the conjunction falls out of the product — surprise OR drift alone barely commits', () => {
  // "surprising AND drifted" is the only condition that pushes p→1; either alone is gated.
  assert.ok(commitProbability(0.9, 0.1) <= 0.1, 'high surprise, low drift → gated');
  assert.ok(commitProbability(0.1, 0.9) <= 0.1, 'high drift, low surprise → gated');
  assert.ok(commitProbability(0.9, 0.9) >= 0.8, 'both high → near-certain commit');
});
