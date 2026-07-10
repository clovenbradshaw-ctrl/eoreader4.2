import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReferentHorizon } from '../src/surfer/referent-horizon.js';

// The referent Horizon (Layer 3): the owned, γ-folded forward prior that makes surprise a SUBJECT's —
// ρ-relative, "against MY accumulated state," the me-ness. It composes feltSurprise, so the efference
// self/world split rides through it. These pin: habituation (a self learns its world), subjectivity
// (same arrival, different surprise by history), the efference split through the prior, expect() as
// the forward draw, reground (forgetting), read-only feel/score, and modality-agnosticism.

test('referent-horizon: HABITUATION — a repeated arrival grows less surprising as the self learns it', () => {
  const h = createReferentHorizon({ gamma: 0.8 });
  const t1 = h.observe({ A: 1 });        // opening — nothing to have foreseen
  const t2 = h.observe({ A: 1 });        // A now expected somewhat
  const t3 = h.observe({ A: 1 });        // more so
  assert.equal(t1.turnSurprise, 0, 'the first sight of A is the opening — an honest zero');
  assert.ok(t2.turnSurprise > t3.turnSurprise, 'each repeat of A surprises this self less — it is learning its world');
  assert.ok(h.reading().cumulativeSurprise > 0, 'the departure this self has felt accumulates');
});

test('referent-horizon: SUBJECTIVITY — two selves feel different surprise for the SAME arrival', () => {
  const hA = createReferentHorizon(); for (let i = 0; i < 3; i++) hA.observe({ A: 1 });   // a self that has read A's
  const hB = createReferentHorizon(); for (let i = 0; i < 3; i++) hB.observe({ B: 1 });   // a self that has read B's
  const aFeelsA = hA.feel({ A: 1 }).worldBits;   // familiar
  const bFeelsA = hB.feel({ A: 1 }).worldBits;   // a newcomer to this self
  assert.ok(bFeelsA > aFeelsA, 'A is unsurprising to the A-history self and surprising to the B-history self — the me-ness');
  assert.ok(aFeelsA < 1 && bFeelsA > 1, 'and the magnitudes reflect it (≈0.5 vs ≈1.8 bits)');
});

test('referent-horizon: the EFFERENCE split rides through the owned prior', () => {
  const h = createReferentHorizon();
  for (let i = 0; i < 3; i++) h.observe({ A: 1 });                 // A is now in this self's world
  const felt = h.feel({ A: 1, C: 1 }, { predicted: ['A'], attenuation: 1 });
  assert.equal(felt.tags.A, 'self', 'A matched my outstanding copy — me-ness, against my own prior');
  assert.equal(felt.tags.C, 'world');
  assert.equal(felt.feltBits, felt.worldBits, 'the self-caused A is attenuated out of what this self feels');
  assert.ok(felt.worldBits > 0, 'the unbidden C is the real surprise');
});

test('referent-horizon: expect() is the forward draw — what this self predicts arrives next', () => {
  const h = createReferentHorizon();
  for (let i = 0; i < 3; i++) h.observe({ A: 1 });
  h.observe({ B: 1 });
  const dist = h.expect().dist;
  assert.equal(dist[0][0], 'A', 'the heaviest incumbent leads the prediction');
  assert.ok(dist.find(([a]) => a === 'B'), 'the lighter one is still predicted, lower');
});

test('referent-horizon: reground FORGETS — the helix turning pulls the prior back to the opening', () => {
  const h = createReferentHorizon();
  h.observe({ A: 1 }); h.observe({ A: 1 });
  assert.ok(h.reading().mass > 0);
  h.reground(1);
  assert.equal(h.reading().mass, 0, 'a full reground empties the memory');
  assert.equal(h.feel({ A: 1 }).worldBits, 0, 'and the next arrival is felt as the opening again');
});

test('referent-horizon: feel / score / expect are READ-ONLY — only observe advances the memory', () => {
  const h = createReferentHorizon();
  h.observe({ A: 1 });
  const before = h.reading();
  h.feel({ A: 1 }); h.score({ A: 1 }); h.expect();
  const after = h.reading();
  assert.equal(after.turns, before.turns, 'reading the surprise does not commit it');
  assert.equal(after.mass, before.mass);
});

test('referent-horizon: MODALITY-BLIND — one owned Horizon accumulates over any basis', () => {
  const h = createReferentHorizon();                 // a melody: tonal-move atoms, no text
  h.observe({ up7: 1 }); h.observe({ up7: 1 });
  const s2 = h.feel({ up7: 1 }).worldBits;
  const sNew = h.feel({ down2: 1 }).worldBits;
  assert.ok(sNew > s2, 'a familiar move is less surprising than a new one — same self, non-text basis');
});
