import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createHorizon, knownHorizon,
  population, simulate, classifyRoom, isWrongRoom, reputationOf, createAgent,
} from '../src/metabolism/index.js';

// The reputation substrate (metabolism/horizon.js + reputation.js). The many-turn analysis says
// this layer IS the system: identity, memory, recognition and a hidden horizon are what decide
// whether a population holds a commons or slides into collusion or predation. The folk theorem
// says cooperation is REACHABLE but not selected, so nothing here is good by construction — it is
// measured. Each test is a named falsifier: it fails if its mechanism is decorative.

test('the horizon is structurally HIDDEN — no genome can compute its own last round', () => {
  const h = createHorizon({ delta: 0.9 });
  assert.equal(h.canComputeLastRound(), false, 'there is no last round to compute');
  assert.equal(typeof h.lastRound, 'undefined', 'the fatal affordance is absent — the endgame is engineered away');
  // yet the hazard is REAL: the continuation rate over many draws matches the shadow of the future.
  let cont = 0; const N = 3000;
  for (let i = 0; i < N; i++) if (h.continues(`org${i}`, i % 60)) cont += 1;
  assert.ok(Math.abs(cont / N - 0.9) < 0.06, 'the continuation hazard matches delta — a genuine, if unpredictable, future');
  // the CONTROL to avoid: a known horizon hands the player exactly the affordance we withhold.
  const k = knownHorizon(20);
  assert.equal(k.canComputeLastRound(), true);
  assert.equal(k.lastRound(), 20);
});

test('FALSIFIER — a hidden horizon sustains the cooperation a known (computable) horizon unravels', () => {
  const hidden = simulate({ agents: population({ endgamer: 8 }), horizon: createHorizon({ delta: 0.95 }), rounds: 30, recognize: true, forgive: true });
  const known  = simulate({ agents: population({ endgamer: 8 }), horizon: knownHorizon(30), rounds: 30, recognize: true, forgive: true });
  assert.ok(hidden.cooperationRate >= 0.9, 'under a hidden horizon the backward-inductor never reaches an endgame — cooperation holds');
  assert.ok(known.cooperationRate <= 0.2, 'a computable last round collapses the whole game to defection (backward induction)');
  assert.ok(hidden.cooperationRate > known.cooperationRate, 'the endgame must be engineered away, not hoped away');
});

test('FALSIFIER — forgiveness recovers from a single error; grim reciprocity locks the population', () => {
  const oneSlip = (round, id) => round === 5 && id === 't0';   // t0 makes one stochastic mistake at round 5
  const forgiving = simulate({ agents: population({ tft: 2 }), rounds: 20, recognize: false, forgive: true, flip: oneSlip });
  const grim      = simulate({ agents: population({ tft: 2 }), rounds: 20, recognize: false, forgive: false, flip: oneSlip });
  assert.ok(forgiving.lateCooperationRate >= 0.9, 'the forgiving pair returns to mutual cooperation after the mistake');
  assert.ok(grim.lateCooperationRate <= 0.2, 'under grim reciprocity one error cascades into permanent mutual punishment');
  assert.ok(forgiving.lateCooperationRate > grim.lateCooperationRate, 'forgiveness is the load-bearing clause, not softness');
});

test('FALSIFIER — SIG recognition lets cooperators resist invasion; blind, defectors feed', () => {
  const withRec = simulate({ agents: population({ tft: 8, defector: 4 }), rounds: 40, recognize: true, forgive: true });
  const blind   = simulate({ agents: population({ tft: 8, defector: 4 }), rounds: 40, recognize: false, forgive: true });
  assert.ok(withRec.meanScore.tft > withRec.meanScore.defector, 'with recognition, cooperators assort and out-earn the invaders');
  const advWith = withRec.meanScore.tft - withRec.meanScore.defector;
  const advBlind = blind.meanScore.tft - blind.meanScore.defector;
  assert.ok(advWith > advBlind, 'recognition is what raises the cooperators\' standing — assortment decides whether they can resist at all');
});

test('the ROOM MONITOR names which equilibrium the population walked into (the sharp falsifier)', () => {
  assert.equal(classifyRoom({ cooperationRate: 0.1, commonsLevel: 0.2 }), 'predation', 'a starved commons is predation');
  assert.equal(classifyRoom({ cooperationRate: 0.9, commonsLevel: 0.8, externalValidation: 0.2 }), 'collusion', 'internal cooperation that games the judge is collusion');
  assert.equal(classifyRoom({ cooperationRate: 0.9, commonsLevel: 0.8, externalValidation: 0.9 }), 'cooperation', 'held the commons AND survived the outside');
  assert.equal(isWrongRoom('predation'), true);
  assert.equal(isWrongRoom('collusion'), true);
  assert.equal(isWrongRoom('cooperation'), false);
  // the simulator's own runs land where the theory says: all-defectors → predation (measured, not assumed).
  const pred = simulate({ agents: population({ defector: 8 }), rounds: 30, recognize: false });
  assert.ok(isWrongRoom(classifyRoom({ cooperationRate: pred.cooperationRate, commonsLevel: pred.commonsLevel })), 'an all-defector population converges on the wrong room — and the instrument says so');
  const coop = simulate({ agents: population({ tft: 8 }), horizon: createHorizon({ delta: 0.95 }), rounds: 40, recognize: true, forgive: true });
  assert.equal(classifyRoom({ cooperationRate: coop.cooperationRate, commonsLevel: coop.commonsLevel, externalValidation: 0.9 }), 'cooperation',
    'a forgiving, recognizing population on a hidden horizon HOLDS the commons without a sovereign');
});

test('reputation is earned, not declared — an all-defector agent has zero standing once it has played', () => {
  const d = createAgent('d0', 'defector');
  assert.equal(reputationOf(d), 1, 'optimistic prior: the unknown is trusted');
  d.plays = 10; d.coops = 0;
  assert.equal(reputationOf(d), 0, 'a pure defector reveals itself — recognition is grounded in observed behavior');
});
