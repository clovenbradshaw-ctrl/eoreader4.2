import { test } from 'node:test';
import assert from 'node:assert/strict';

import { feltSurprise, forwardScore } from '../src/core/surprise.js';
import { SELF, WORLD } from '../src/core/self/index.js';

// The efference self/world split (Layer 2): forwardScore, partitioned along the line the monitor draws.
// An arriving atom matching an outstanding efference copy is REAFFERENT (me-ness) → attenuated ("you
// cannot tickle yourself"); an atom matching no copy is EXAFFERENT (the world) → the real surprise, the
// learning signal. These pin: the disarmed degradation to forwardScore, the tickle law, the exafferent
// invariant (worldBits is never damped), modality-agnosticism, and reuse of the core self/world tags.

const M = (obj) => new Map(Object.entries(obj));
const P = M({ A: 3, B: 1 });   // profile: Z=5 → p(A)=0.6 (0.74 bits), reserve 0.2 (newcomer = 2.32 bits)

test('feltSurprise: NO efference copies → forwardScore exactly (disarmed-safe degradation)', () => {
  const arrival = M({ A: 1, C: 1 });
  const felt = feltSurprise(P, arrival);
  const fwd = forwardScore(P, arrival);
  assert.equal(felt.feltBits, fwd.predBits, 'with nothing predicted, felt surprise IS the forward score');
  assert.equal(felt.worldBits, fwd.predBits, 'all of it is exafferent');
  assert.equal(felt.selfBits, 0);
  assert.equal(felt.selfCount, 0);
  assert.ok(Object.values(felt.tags).every((t) => t === WORLD), 'every atom tags WORLD — nothing was self-caused');
});

test('feltSurprise: the TICKLE LAW — a self-predicted atom is attenuated out of the felt surprise', () => {
  // I committed A (so I predicted I would sense A); C arrives unbidden from the world.
  const felt = feltSurprise(P, M({ A: 1, C: 1 }), { predicted: ['A'], attenuation: 1 });
  assert.equal(felt.tags.A, SELF, 'A is me-ness (matched my outstanding copy)');
  assert.equal(felt.tags.C, WORLD, 'C is the world (no copy predicted it)');
  assert.equal(felt.worldBits, 2.32, 'the exafferent surprise is C alone (−log₂ 0.2)');
  assert.equal(felt.feltBits, 2.32, 'at full attenuation the self-caused A adds nothing — you cannot tickle yourself');
  assert.equal(felt.selfBits, 0.74, 'A would have carried 0.74 bits had it been world');
  assert.equal(felt.selfCount, 1);
});

test('feltSurprise: attenuation is a dial — 0 feels the self in full, 0.5 damps it, 1 zeroes it', () => {
  const args = { predicted: ['A'] };
  const full  = feltSurprise(P, M({ A: 1, C: 1 }), { ...args, attenuation: 0 });
  const half  = feltSurprise(P, M({ A: 1, C: 1 }), { ...args, attenuation: 0.5 });
  const none  = feltSurprise(P, M({ A: 1, C: 1 }), { ...args, attenuation: 1 });
  assert.equal(full.feltBits, 3.06, 'attenuation 0: felt = world(2.32) + self(0.74)');
  assert.equal(half.feltBits, 2.69, 'attenuation 0.5: felt = 2.32 + 0.37');
  assert.equal(none.feltBits, 2.32, 'attenuation 1: self zeroed');
});

test('feltSurprise: the EXAFFERENT signal is invariant to attenuation — the world is the world', () => {
  // worldBits is the truth/learning/fitness signal; damping me-ness must never change it.
  const w0 = feltSurprise(P, M({ A: 1, C: 1 }), { predicted: ['A'], attenuation: 0 }).worldBits;
  const w1 = feltSurprise(P, M({ A: 1, C: 1 }), { predicted: ['A'], attenuation: 1 }).worldBits;
  assert.equal(w0, w1, 'worldBits does not depend on how hard the self is attenuated');
  assert.equal(w0, 2.32);
});

test('feltSurprise: an ALL-self arrival is fully attenuated — nothing felt, nothing to learn', () => {
  const felt = feltSurprise(P, M({ A: 1, B: 1 }), { predicted: ['A', 'B'], attenuation: 1 });
  assert.equal(felt.worldBits, 0, 'no exafferent content — the whole arrival was self-produced');
  assert.equal(felt.feltBits, 0, 'the system is not surprised by sensing exactly what it emitted');
  assert.equal(felt.worldNovel, 0);
});

test('feltSurprise: MODALITY-BLIND — the split works on any basis, and a Set of copies is accepted', () => {
  const profile = M({ up7: 2, rep: 1 });                     // tonal-move basis, no text
  const felt = feltSurprise(profile, M({ up7: 1, down2: 1 }), { predicted: new Set(['up7']), attenuation: 1 });
  assert.equal(felt.tags.up7, SELF, 'the move I just played is me-ness');
  assert.equal(felt.tags.down2, WORLD, 'the move that arrived unbidden is the world');
  assert.ok(felt.worldBits > 0 && felt.selfBits >= 0, 'the same core scores a non-text modality');
});

test('feltSurprise: worldBy names the UNBIDDEN atoms only — the steer axis excludes me-ness', () => {
  const felt = feltSurprise(P, M({ A: 1, C: 1 }), { predicted: ['A'], attenuation: 1 });
  assert.ok('C' in felt.worldBy, 'the exafferent surprise is attributed to C');
  assert.ok(!('A' in felt.worldBy), 'the self-caused A is not on the world steer axis');
});
