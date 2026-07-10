import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createTransferProbe, modelRunner, judgeScorer, createFitness, energyOf } from '../src/metabolism/index.js';
import { createModel } from '../src/model/index.js';

// Standing up model B (metabolism/transfer.js). lift.js's transfer falsifier — a real gain survives
// a swap of the leaf, and you keep the WEAKER of the two lifts — is only real if the second frozen
// model actually exists. These tests pin the measurement: a genuine surfer gain lifts BOTH models
// and keeps its worth; a prompt hack lifts one and collapses to ~0. Injected runners + scorer, so
// the discipline is proven without a GPU; one test drives the real `echo` backend through the adapter.

// stub runners: a model's answer is a function of (bare|scaffolded); the scorer reads faithfulness.
const runner = (id, answers) => ({ id, run: async ({ scaffolded }) => answers[scaffolded ? 'surfer' : 'bare'] });
// the scorer scores an answer by how much of the SOURCE it reproduces (faithfulness), stubbed here
// as a lookup so a test fixes exactly what each answer is "worth".
const scorer = (worth) => async (_task, answer) => worth[answer] ?? 0;

test('transfer: a genuine surfer gain lifts BOTH frozen models and keeps its worth', async () => {
  const probe = createTransferProbe({
    runners: [
      runner('A', { bare: 'a-bare', surfer: 'a-surf' }),
      runner('B', { bare: 'b-bare', surfer: 'b-surf' }),
    ],
    score: scorer({ 'a-bare': 0.5, 'a-surf': 0.85, 'b-bare': 0.45, 'b-surf': 0.75 }),   // both lift
  });
  const r = await probe.measure({ task: { question: 'q', source: 's' } });
  assert.ok(r.liftA > 0 && r.liftB > 0, 'the surfer lifted both models');
  assert.equal(r.transfers, true, 'a gain on both frozen models transfers');
  assert.ok(r.kept > 0 && r.kept <= Math.min(r.liftA, r.liftB) + 1e-9, 'you KEEP the weaker of the two lifts — the worst-case value');
});

test('transfer: a prompt hack lifts one model and collapses to ~0 — measured, not decreed', async () => {
  const probe = createTransferProbe({
    runners: [
      runner('A', { bare: 'a-bare', surfer: 'a-surf' }),
      runner('B', { bare: 'b-bare', surfer: 'b-surf' }),
    ],
    // A soars with the surfer; B does not move — the prompt was shaped against A.
    score: scorer({ 'a-bare': 0.4, 'a-surf': 0.9, 'b-bare': 0.6, 'b-surf': 0.6 }),
  });
  const r = await probe.measure({ task: { question: 'q', source: 's' } });
  assert.ok(r.liftA > 0.4, 'the hack looks great on the model it was tuned against');
  assert.equal(r.transfers, false, 'but it does not transfer to the swapped leaf');
  assert.ok(r.kept <= 0.001, 'so the kept worth collapses to ~0 — the overfit is filtered');
  assert.ok(r.overfit > 0.4, 'the prompt tax is surfaced, not hidden');
});

test('transfer: the kept lift feeds the Void-respect exchange rate as REAL, un-authored transfer', async () => {
  const probe = createTransferProbe({
    runners: [runner('A', { bare: 'ab', surfer: 'as' }), runner('B', { bare: 'bb', surfer: 'bs' })],
    score: scorer({ ab: 0.5, as: 0.9, bb: 0.5, bs: 0.8 }),
  });
  const r = await probe.measure({ task: { question: 'q', source: 's' } });
  // fold the probe's outcome into fitness: the void exchange rate calibrates off MEASURED kept lift.
  const f = createFitness({ energyOf });
  for (let i = 0; i < 15; i++) f.observe({ delivered: true, groundedOnDelay: 1, heldForBinding: 1, ...r.outcome, spend: {} });
  const c = f.condition();
  assert.ok(c.voidValue > 0.2 && Math.abs(c.voidValue - r.kept) < 0.15, 'the exchange rate floats to the measured kept lift — the floor is measured, not asserted');
  assert.ok(c.signalRate > 0.8, 'and it reports that the weight is now measured signal');
});

test('transfer: judgeScorer falls back to an un-authored overlap proxy when the judge is dry-run', async () => {
  const score = judgeScorer(null);   // no judge → offline proxy
  const faithful = await score({ source: 'the mitochondria is the powerhouse of the cell' }, 'mitochondria powerhouse cell');
  const invented = await score({ source: 'the mitochondria is the powerhouse of the cell' }, 'zebra quantum bicycle');
  assert.ok(faithful > invented, 'an answer that reproduces the source scores above one that invents — a weak but un-authorable signal');
});

test('transfer: the adapter drives the REAL echo backend as a frozen model', async () => {
  const echo = createModel('echo');
  const A = modelRunner(echo, { id: 'echo-a' });
  const B = modelRunner(echo, { id: 'echo-b' });
  const probe = createTransferProbe({ runners: [A, B], score: judgeScorer(null) });
  const r = await probe.measure({ task: { question: 'What is it?', source: 'The reactor core reached criticality at noon.' }, surfer: null });
  assert.equal(r.models.length, 2, 'two real frozen models were run, bare and scaffolded');
  assert.ok(Number.isFinite(r.kept), 'a real kept lift comes back from actual model runs');
});
