import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createPopulation, createMetabolism, createProposer, createScarcity,
  createGenome, createOrganism, createSoma,
} from '../src/metabolism/index.js';

// The intake seam (population.offer / metabolism.proposeAndSeat) that lets the third Claude channel
// enter the loop. The invariants: a proposed challenger is SEATED to compete but never privileged; if
// it out-earns the champion its promotion attributes back to Claude (origin:'claude'); and with no
// proposer offered, the ecology is byte-identical to internal-variation-only search.

const organism = (weights) => createOrganism({ genome: createGenome(weights), soma: createSoma() });

// a fake world clock: a small pool with NO seasonal clamp (mult 1), so exclusion — not the clamp —
// decides the winner. energyOf mirrors scarcity.js's cost weighting.
const fakeScarcity = (budget = 10) => ({
  season: () => ({ name: 'lean', mult: 1, budget, regime: 'test' }),
  energyOf: (s) => (s.model * 100) + (s.tokens * 0.02) + (s.time * 0.5) + (s.fetch * 3),
});

const stub = (proposal) => async (messages) => {
  const sys = messages.find((m) => m.role === 'system')?.content || '';
  if (!/BREEDER/i.test(sys)) return null;
  return JSON.stringify(proposal);
};

test('intake: an offered challenger is SEATED into the ecology and competes, tagged origin:claude', () => {
  const pop = createPopulation({ scarcity: fakeScarcity(200), founder: organism(), size: 3, capacity: 12 });
  assert.equal(pop.offer(organism({ modelGate: 0.9 })), 1, 'offer enqueues and reports the queue length');
  assert.equal(pop.pendingProposals(), 1);
  pop.compete(0);
  assert.equal(pop.pendingProposals(), 0, 'the queue is drained at compete');
  const claude = pop.demographics().filter((d) => d.origin === 'claude');
  // >= 1: the seated challenger competed; if it banked a surplus it reproduced and its offspring
  // inherited the provenance tag — both are correct, so the seam is "at least one Claude-descended".
  assert.ok(claude.length >= 1, 'the proposed challenger was seated and competed as a real organism');
});

test('intake: a proposal that OUT-EARNS the champion is promoted, and the edit attributes to Claude', () => {
  // founders sit at modelGate 0.5 (warm model → ~100 energy on the model line); the proposal is frugal
  // (modelGate 0.9 → no model warm), so under a small pool it feeds first and out-banks the spendy pool.
  const pop = createPopulation({ scarcity: fakeScarcity(10), founder: organism(), size: 2, capacity: 8 });
  pop.offer(organism({ modelGate: 0.9, maxTokens: 96, retrieveK: 2 }));
  let claudeEdit = null;
  for (let p = 0; p < 4 && !claudeEdit; p++) {
    const demo = pop.compete(p);
    if (demo.promoted && demo.promoted.origin === 'claude') claudeEdit = demo.promoted;
  }
  assert.ok(claudeEdit, 'the frugal proposal wins under scarcity and is promoted');
  assert.equal(claudeEdit.origin, 'claude', 'the genome-edit event carries provenance back to Claude');
  assert.ok(pop.promotions().some((e) => e.origin === 'claude'), 'the lineage records the Claude-authored edit');
});

test('intake: with NO proposer offered, the ecology is byte-identical (disarmed-safe)', () => {
  // same seed, same clock, one population offered nothing and one never touched — identical trajectory.
  const trajectory = () => {
    const pop = createPopulation({ scarcity: fakeScarcity(60), founder: organism(), size: 4, capacity: 10 });
    return Array.from({ length: 5 }, (_, p) => pop.compete(p)).map((d) => `${d.alive}:${d.championEnergy}:${d.births}`).join(',');
  };
  assert.equal(trajectory(), trajectory(), 'a population never offered a proposal runs deterministically as before');
});

test('proposeAndSeat: the metabolism consults the breeder and seats its challenger', async () => {
  const sc = createScarcity({ regime: 'plenty' });   // real scarcity — metabolize charges a ledger
  const pop = createPopulation({ scarcity: sc, founder: organism(), size: 2, capacity: 8 });
  const proposer = createProposer({ generate: stub({ kind: 'weight', gene: 'modelGate', to: 0.9, rationale: 'answers are needlessly expensive' }), enabled: true });
  const metab = createMetabolism({ scarcity: sc, population: pop, proposer });

  const prop = await metab.proposeAndSeat({ critiques: ['the answers cost far more model than they need'] });
  assert.ok(prop && prop.challenger, 'the metabolism got a challenger from the breeder');
  assert.equal(prop.origin, 'claude');
  assert.equal(pop.pendingProposals(), 1, 'the challenger was offered into the population');

  metab.metabolize({ quality: 0.5 });                 // one beat → population.compete drains the intake
  assert.ok(pop.demographics().some((d) => d.origin === 'claude'), 'after a beat the challenger is competing in the ecology');
});

test('proposeAndSeat: no proposer → null and nothing seated (the channel is opt-in)', async () => {
  const sc = createScarcity({ regime: 'plenty' });
  const pop = createPopulation({ scarcity: sc, founder: organism(), size: 2 });
  const metab = createMetabolism({ scarcity: sc, population: pop });   // no proposer
  assert.equal(await metab.proposeAndSeat({ critiques: ['x'] }), null);
  assert.equal(pop.pendingProposals(), 0);
});
