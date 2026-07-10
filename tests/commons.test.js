import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createCommons, multiLevelSelect, traitFrequency, demeProductivity, partition,
  liftFitness, classifyRoom, isWrongRoom,
} from '../src/metabolism/index.js';

// The commons is the APPRECIATING face of the pool (metabolism/commons.js + demes.js): the
// population enriches a shared habitat, not only depletes a scarcity. Each test is a named
// falsifier — it fails if the mechanism is decorative — and two of them pin the COMPOSITION with
// the merged objective (lift) and the merged instrument (the room monitor).

test('niche construction — an enriched topic subsidizes later turns; an empty commons subsidizes nothing', () => {
  const c = createCommons();
  assert.equal(c.subsidy('mitochondria'), 0, 'an unbuilt habitat subsidizes nothing — the honest baseline every arena has');
  c.contribute('mitochondria', 1.5);
  c.contribute('mitochondria', 1.5);
  assert.ok(c.subsidy('mitochondria') > 0, 'once the population has grounded a topic, a later turn on it costs less');
  assert.equal(c.subsidy('the moon'), 0, 'the subsidy is LOCAL to what was actually built, not a free gift everywhere');
});

test('ecological inheritance + a maintained difference — the commons decays unless rebuilt', () => {
  const c = createCommons({ decay: 0.5 });
  c.contribute('t', 1.5); c.contribute('t', 1.5);
  const before = c.subsidy('t');
  for (let i = 0; i < 15; i++) c.step();          // hand the fading habitat down, cohort after cohort
  assert.ok(c.subsidy('t') < before, 'cached grounding goes stale — the habitat is a standing structure, not a one-time gift');
  c.contribute('t', 1.5);
  assert.ok(c.subsidy('t') > 0, 'contribution rebuilds it — the population holds the commons only by continuing to build it');
});

test('composition — niche construction RAISES lift: the built habitat lowers a later turn\'s cost', () => {
  const c = createCommons();
  const bare = 0.4, withSurfer = 0.9, resource = 100;
  const unbuilt = liftFitness({ withSurfer, bare, resource });                       // first turn on a cold topic
  c.contribute('t', 1.5); c.contribute('t', 1.5);                                    // the population grounds it once
  const subsidized = liftFitness({ withSurfer, bare, resource: resource * (1 - c.subsidy('t')) });
  assert.ok(subsidized > unbuilt, 'the same lift for less resource — enriching the commons improves everyone\'s lift-per-resource');
});

test('composition — the room monitor catches a STARVED commons even under high social cooperation', () => {
  const c = createCommons({ decay: 0.5 });
  c.contribute('t', 1.5); c.contribute('t', 1.5);
  const held = classifyRoom({ cooperationRate: 0.9, commonsLevel: c.level(), externalValidation: 0.9 });
  assert.equal(held, 'cooperation', 'a built commons + honest output + cooperation = the right room');
  for (let i = 0; i < 15; i++) c.step();          // stop contributing — let the habitat starve
  const starved = classifyRoom({ cooperationRate: 0.9, commonsLevel: c.level(), externalValidation: 0.9 });
  assert.equal(starved, 'predation', 'high cooperation cannot hide a depleted habitat — the instrument names the wrong room');
  assert.equal(isWrongRoom(starved), true);
});

test('FALSIFIER — multi-level selection: altruism that loses within every deme wins between them (Simpson)', () => {
  // Within each deme a parasite (individualFitness 1.2, contributes nothing) beats a contributor
  // (1.0, contributes 1). But contributor-heavy demes build more commons → higher productivity.
  const mkDeme = (nC, nP) => ({ members: [
    ...Array.from({ length: nC }, (_, i) => ({ id: `c${i}`, individualFitness: 1.0, contribution: 1, altruist: true })),
    ...Array.from({ length: nP }, (_, i) => ({ id: `p${i}`, individualFitness: 1.2, contribution: 0, altruist: false })),
  ] });
  const demes = [mkDeme(8, 2), mkDeme(2, 8)];      // 10 altruists / 20 total — exactly 0.5 to start
  assert.equal(demeProductivity(demes[0]), 8, 'the contributor-heavy deme built more commons');
  const isAlt = (m) => m.altruist;

  const individual = traitFrequency(multiLevelSelect(demes, { lambda: 0 }), isAlt);   // pure within-group
  const group = traitFrequency(multiLevelSelect(demes, { lambda: 1 }), isAlt);        // between-group counts

  assert.ok(individual < 0.5, 'individual selection erodes contribution — the free-rider rises (the tragedy)');
  assert.ok(group > 0.5, 'multi-level selection lifts it — contributor demes out-reproduce parasite demes');
  assert.ok(group > individual, 'the between-group level reverses the within-group loss — mutualism made adaptive');

  // the local truth that makes it a paradox: WITHIN a deme, the parasite still out-weighs the altruist.
  const w = multiLevelSelect(demes, { lambda: 1 });
  const c0 = w.find((m) => m.id === 'c0' && m.deme === 0);
  const p0 = w.find((m) => m.id === 'p0' && m.deme === 0);
  assert.ok(p0.weight > c0.weight, 'the parasite still wins inside its own deme — altruism genuinely loses locally');
});

test('partition splits a population into demes deterministically (no RNG)', () => {
  const members = Array.from({ length: 6 }, (_, i) => ({ id: i }));
  const d = partition(members, 2);
  assert.equal(d.length, 2);
  assert.deepEqual(d[0].members.map((m) => m.id), [0, 2, 4]);
  assert.deepEqual(d[1].members.map((m) => m.id), [1, 3, 5]);
});
