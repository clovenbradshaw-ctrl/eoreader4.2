import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  liftOf, gapClosed, liftFitness, transfers, keptFitness, transferReading, createProxy,
  liftWorld, createPopulation, createScarcity, createGenome,
} from '../src/metabolism/index.js';

// The objective (metabolism/lift.js): fitness is a LIFT, not a LEVEL, and the one hard
// falsifier — transfer across frozen models — separates "the surfer got better" from "the
// prompt got tuned". These tests are named falsifiers: each fails if its mechanism is decorative.

test('lift subtracts the model out — a task the model would nail earns ~no credit', () => {
  // Same scaffolded quality (0.9) on two turns. On the first the bare model already scores
  // 0.85 (it would nearly nail it); on the second the bare model scores 0.30 (it needs help).
  const easyForModel = liftFitness({ withSurfer: 0.9, bare: 0.85, resource: 0 });
  const hardForModel = liftFitness({ withSurfer: 0.9, bare: 0.30, resource: 0 });
  assert.equal(easyForModel, 0.05, 'lift on a turn the model nearly nails is tiny');
  assert.equal(hardForModel, 0.60, 'lift is large exactly where the surfer carried the model');
  // A LEVEL objective would score both 0.9 and be fooled; lift is not. This is the whole point.
  assert.ok(hardForModel > easyForModel, 'lift, unlike level, credits only what the surfer added');
  // gap-fraction: a model already at its ceiling leaves nothing to close — no credit for the model.
  assert.equal(gapClosed(0.95, 0.95, 0.95), 0, 'no gap → no credit, however high the absolute score');
  assert.equal(gapClosed(0.7, 0.3, 0.9), 0.667, 'the surfer closed two-thirds of the achievable gap');
});

test('FALSIFIER — transfer across frozen models: a prompt hack is filtered, a real gain survives', () => {
  // A genuine surfer gain lifts BOTH frozen models (a second, held-out leaf too).
  const genuine = transferReading({
    modelA: { withSurfer: 0.80, bare: 0.40, resource: 0 },   // lift 0.40
    modelB: { withSurfer: 0.75, bare: 0.40, resource: 0 },   // lift 0.35 on a DIFFERENT frozen model
  });
  // A prompt hack scores HIGHER on the model it was shaped against, and nothing on the other.
  const promptHack = transferReading({
    modelA: { withSurfer: 0.90, bare: 0.40, resource: 0 },   // lift 0.50 — beats the genuine gain here!
    modelB: { withSurfer: 0.40, bare: 0.40, resource: 0 },   // lift 0.00 — nothing transfers
  });
  assert.equal(genuine.transfers, true, 'a real gain lifts a second frozen model');
  assert.equal(promptHack.transfers, false, 'a prompt hack does not transfer');
  // The hack wins on its own model (0.50 > 0.40) — a single-model tournament would promote it.
  assert.ok(promptHack.liftA > genuine.liftA, 'the hack looks fitter on the model it overfit');
  // But KEPT fitness is what survives the leaf swap, and there the genuine gain wins decisively.
  assert.ok(genuine.kept > promptHack.kept, 'selection on transfer keeps the surfer, not the prompt');
  assert.equal(promptHack.kept, 0, 'the hack is capped at ~0 — the prompt cannot inflate what does not transfer');
  assert.equal(promptHack.overfit, 0.5, 'the untransferred gain is surfaced as the prompt tax');
});

test('lift per resource — the cheaper path to the same lift is fitter', () => {
  const cheap = liftFitness({ withSurfer: 0.9, bare: 0.3, resource: 0 });
  const dear = liftFitness({ withSurfer: 0.9, bare: 0.3, resource: 100 });
  assert.ok(cheap > dear, 'same lift, less resource → fitter');
  // a surfer that HURTS keeps its full negative score — spending little cannot flatter it.
  assert.ok(liftFitness({ withSurfer: 0.2, bare: 0.5, resource: 0 }) < 0, 'a hurtful surfer is scored negative, not near-zero');
});

test('dual economy — the cheap proxy re-anchors toward the expensive judge', () => {
  const p = createProxy({ scale: 1, alpha: 0.5 });
  const proxyLift = p.estimate({ withSurfer: 0.5, bare: 0, resource: 0 });   // 0.5 at scale 1
  assert.equal(proxyLift, 0.5);
  p.reanchor(proxyLift, 0.8);                     // the judge says the true lift was higher
  assert.ok(p.scale() > 1, 'the proxy scale climbs toward the judge when it under-read the truth');
  assert.ok(p.estimate({ withSurfer: 0.5, bare: 0, resource: 0 }) > 0.5, 'the re-anchored proxy tracks the judge');
});

test('liftWorld — the ecology optimizes lift-not-level with no change to population.js', () => {
  // A richer scaffold lifts a weak model more than a lean one — when the model needs help.
  const w = liftWorld({ bare: () => 0.5 });
  const rich = w.evaluate({ modelGate: 0.3, maxTokens: 512, retrieveK: 12 }, { mult: 1 });
  const lean = w.evaluate({ modelGate: 0.9, maxTokens: 96, retrieveK: 2 }, { mult: 1 });
  assert.ok(rich.quality > lean.quality, 'the world scores lift: more scaffolding lifts a weak model more');
  assert.ok(lean.quality >= 0, 'lift is floored at zero — a surfer never scored below the bare model here');

  // Dropped into the competitive ecology as its world-model, lift sustains a population and
  // promotes a fitter (higher lift-per-resource) genome — the objective, made the fitness function.
  const scarcity = createScarcity({ regime: 'seasonal', ration: 1400 });
  const pop = createPopulation({ scarcity, world: liftWorld({ bare: () => 0.5 }), founder: createGenome(), size: 14, capacity: 28, valuePerQuality: 40 });
  let promoted = 0;
  for (let period = 0; period < 120; period++) { const d = pop.compete(period); if (d.promoted) promoted += 1; }
  assert.ok(pop.size() > 1 && pop.size() <= 28, 'the lift-driven ecology sustains a bounded population');
  assert.ok(promoted >= 1, 'a fitter (higher-lift) genome is promoted — evolution on the lift objective');
});
