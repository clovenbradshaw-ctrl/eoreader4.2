import { test } from 'node:test';
import assert from 'node:assert/strict';

import { predictiveCompetency, competencyAnchor } from '../src/surfer/predictive-competency.js';
import { score } from '../src/metabolism/fitness.js';

// Predictive competency in the BORN measure (the fitness numerator that needs no judge). Units are
// vectors (the significance/structure activations); competency = how much better the reader's
// accumulated ρ predicts held-out units than the maximally-mixed ground σ — S(u‖ρ) vs S(u‖σ). These
// pin: structure earns competency, unstructured noise earns ~0 (the noisy-TV / parrot guard), the
// principled σ baseline, determinism, and the hand-off into fitness as the un-authored `predicted` anchor.

// a repeated direction with light variation — a source with real structure ρ can depart σ to capture.
const STRUCTURED = [
  [1, 0, 0], [1, 0, 0], [0.9, 0.1, 0], [1, 0, 0], [0.95, 0, 0.05], [1, 0, 0], [0.9, 0.1, 0], [1, 0, 0],
];
// equal mass on three orthogonal directions, cycled — ρ folds toward maximally-mixed, so ρ ≈ σ.
const UNSTRUCTURED = [
  [1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0], [0, 0, 1],
];

test('predictiveCompetency: STRUCTURE earns competency — ρ departs σ and foresees held-out units', () => {
  const r = predictiveCompetency(STRUCTURED);
  assert.ok(r.competency > 0.05, `a structured source is predicted better than the ground (got ${r.competency})`);
  assert.ok(r.achieved < r.baseline, 'the reader\'s ρ carries less surprise on held-out units than σ does');
  assert.equal(r.steps, STRUCTURED.length);
});

test('predictiveCompetency: NOISE earns ~nothing — ρ collapses toward σ, no bits to save (noisy-TV guard)', () => {
  const r = predictiveCompetency(UNSTRUCTURED);
  assert.ok(r.competency < 0.05, `an unstructured source is not predicted better than the ground (got ${r.competency})`);
});

test('predictiveCompetency: structure scores strictly higher than noise — the discriminator', () => {
  const s = predictiveCompetency(STRUCTURED).competency;
  const n = predictiveCompetency(UNSTRUCTURED).competency;
  assert.ok(s > n, `structured (${s}) must beat unstructured (${n}) — the whole point of the moat`);
});

test('predictiveCompetency: the baseline is the BORN ground σ, not a hand-flattened bag', () => {
  // an explicit maximally-mixed σ gives the same result as the default (the default IS σ) — the null
  // is principled and independent of any per-call flattening.
  const r1 = predictiveCompetency(STRUCTURED);
  const dim = 3;
  const sigma = { dim, rho: [[1 / 3, 0, 0], [0, 1 / 3, 0], [0, 0, 1 / 3]] };
  const r2 = predictiveCompetency(STRUCTURED, { sigma });
  assert.equal(r1.competency, r2.competency, 'the default ground already IS the maximally-mixed Born σ');
});

test('predictiveCompetency: deterministic and degrades on a too-short sequence', () => {
  assert.equal(JSON.stringify(predictiveCompetency(STRUCTURED)), JSON.stringify(predictiveCompetency(STRUCTURED)), 'no RNG — replays identically');
  assert.deepEqual(predictiveCompetency([[1, 0, 0]]), { competency: 0, bitsSaved: 0, achieved: 0, baseline: 0, steps: 1 });
  assert.equal(predictiveCompetency([]).competency, 0);
});

test('predictiveCompetency → fitness: competency becomes the un-authored `predicted` anchor', () => {
  const r = predictiveCompetency(STRUCTURED);
  const outcome = { ...competencyAnchor(r), grounded: 2, claimed: 2, delivered: true, spend: { model: 0, tokens: 100, time: 1, fetch: 0 } };
  const fit = score(outcome, { energyOf: null });
  assert.equal(fit.anchoredBy, 'prediction', 'fitness is anchored by reality-graded prediction, not a judge');
  assert.equal(fit.provisional, false, 'a prediction-anchored reading is not provisional');
  assert.ok(fit.anchor > 0, 'the anchor carries the competency');
});

test('predictiveCompetency → fitness: `predicted` OUTRANKS the judge\'s `validated` (fluency exits selection)', () => {
  // with both present, the reality-graded prediction wins the anchor — the swap the whole change is for.
  const outcome = { predicted: 0.6, validated: 0.99, grounded: 1, claimed: 1, delivered: true, spend: {} };
  const fit = score(outcome, { energyOf: null });
  assert.equal(fit.anchoredBy, 'prediction', 'prediction is the anchor even when a fluent judge verdict is also present');
  assert.equal(fit.anchor, 0.6, 'the anchor value is the prediction competency, not the judge score');
});
