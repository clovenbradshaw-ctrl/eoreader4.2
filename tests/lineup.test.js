import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createLineup, createSurfer, separate, reward,
  needsWeb, createSourceCommons, admitSources, siteKey,
  OPERATORS, temperamentOf, pureTemperament, archetype, makeTemperament, knobsFromWeights, defaultCast,
} from '../src/surfer/lineup/index.js';
import { seedCorpus } from '../src/surfer/reason/index.js';
import { createLog } from '../src/core/log.js';

// The chorus of surfers (docs/cooperative-graph-surfers.md): a cast on the nine-operator basis
// traverses the graph, the chorus separates signal from noise, foraging fires only on a measured
// void, only meaningful sources are kept and borrowed, and the voices are rewarded evolutionarily
// without any of the nine going extinct. Deterministic: the walk is pure and the web is stubbed.

const CORPUS = [
  { op: 'INS', id: 'a', label: 'rain' }, { op: 'INS', id: 'b', label: 'flood' },
  { op: 'INS', id: 'c', label: 'crop loss' }, { op: 'INS', id: 'd', label: 'famine' },
  { op: 'INS', id: 'e', label: 'migration' },
  { op: 'CON', src: 'a', tgt: 'b', via: 'causes' }, { op: 'CON', src: 'b', tgt: 'c', via: 'causes' },
  { op: 'CON', src: 'c', tgt: 'd', via: 'causes' }, { op: 'CON', src: 'd', tgt: 'e', via: 'causes' },
];
const freshLog = () => seedCorpus(createLog(), CORPUS, { enactment: 'ingest' });

// ── the generator: the nine operators, and the folk archetypes as mixtures ────
test('the cast is the nine-operator basis (Domain × Mode), not a bag of archetypes', () => {
  assert.equal(OPERATORS.length, 9, 'nine operators span the taste space');
  const cast = defaultCast();
  assert.equal(cast.size, 9, 'the default cast is one voice per pure operator');
  for (const op of OPERATORS) assert.ok(cast.has(op), `${op} is in the basis`);
});

test('knobs are DERIVED from the operator semantics — the two given anchors hold', () => {
  // Type A ≈ pure DEF (records within a stable frame): high gamma, low epsilon, selfReach 1.
  const def = pureTemperament('DEF').knobs;
  assert.ok(def.gamma >= 0.8 && def.epsilon <= 0.02 && def.selfReachBudget === 1, 'DEF is the frame-internal recorder');
  // daydreamer ≈ pure REC (reframes on its own prior ops): the deep-reach peak.
  const rec = pureTemperament('REC').knobs;
  assert.ok(rec.selfReachBudget >= 5, 'REC alone demands the deepest reach — the spiral jump');
  assert.ok(pureTemperament('EVA').knobs.selfReachBudget === 0, 'EVA is frame-internal — no reach');
  // a folk archetype is a convex mixture, so its knobs sit between its constituents'.
  const typeA = archetype('typeA').knobs;   // {DEF .7, EVA .2, CON .1}
  assert.ok(typeA.gamma > 0.8 && typeA.epsilon < 0.02, 'Type A lands near its dominant DEF anchor');
  const mix = knobsFromWeights({ DEF: 1, REC: 1 }).selfReachBudget;   // halfway between 1 and 6
  assert.ok(mix > 1 && mix < 6, 'a DEF+REC mixture reaches between the recorder and the reframer');
});

test('temperaments diverge on the identical graph — openers are short, closers exhaust it', async () => {
  const short = await createSurfer({ temperament: pureTemperament('SIG') }).surf(freshLog());
  const long = await createSurfer({ temperament: pureTemperament('DEF') }).surf(freshLog());
  assert.ok(short.steps < long.steps, 'the Existence opener (SIG) commits fewer steps than the Significance closer (DEF)');
  assert.ok(long.walk.lastReason === 'ground-covered', 'the exhaustive closer runs the corpus dry');
});

// ── separate signal from noise: the null, lifted by consensus and ground ──────
test('separate: consensus across independent voices lifts a finding the null alone would drop', () => {
  const W = { 'idle-ungrounded': 0.2, 'warranted-ungrounded': 0.7, 'grounded': 1 };
  const f = (temperament, key, bits, grade = 'idle-ungrounded') =>
    ({ key, temperament, op: 'CON', sites: key.split(':')[1].split('+'), said: key, grade, weight: W[grade], bits });
  const findings = [
    f('adhd', 'CON:a+b', 0.05), f('typeA', 'CON:a+b', 0.05),   // two voices agree → corroborated
    f('adhd', 'CON:x+y', 0.05),                                  // a lone quiet reach → noise
    f('weaver', 'REC:z', 0.9, 'grounded'),                       // an exafferent witness → signal by provenance
  ];
  const sep = separate(findings, { alpha: 0.05, consensus: 2 });
  const keys = new Set(sep.signal.map((s) => s.key));
  assert.ok(keys.has('CON:a+b'), 'a move two voices independently reached is kept, though neither was loud');
  assert.ok(keys.has('REC:z'), 'a corpus-warranted finding is signal by provenance');
  assert.ok(sep.noise.some((n) => n.key === 'CON:x+y'), 'a lone quiet idle reach is held as noise, not dropped');
  assert.ok(sep.noise.every((n) => n.key), 'the noise tail keeps its keys — recoverable, never a silence');
});

// ── the gate: search only on a measured void ──────────────────────────────────
test('needsWeb: a reading that closed on ground asks the world nothing; a spent graph with a lead does', () => {
  const closed = needsWeb({ steps: 8, walk: { lastReason: 'saturated', groundedFraction: 0.9 }, openLeads: [] });
  assert.equal(closed.search, false, 'a sound reading never reaches for the net');
  const spent = needsWeb({ steps: 8, walk: { lastReason: 'ground-covered', groundedFraction: 0.1 }, openLeads: [{ said: 'what of X?', bits: 0.4 }] });
  assert.equal(spent.search, true, 'the graph is spent and a lead is still open — the measured void earns a forage');
  const noLead = needsWeb({ steps: 0, walk: { lastReason: 'no-admissible-move', groundedFraction: 0 }, openLeads: [] });
  assert.equal(noLead.search, false, 'no open lead → nothing to ask');
});

// ── meaningful-only retention: keep what a signal used, evict the rest ─────────
test('the source commons keeps meaningful sources, decays them, and evicts the stale — no hoarding', () => {
  const sc = createSourceCommons({ decay: 0.1, cap: 4, saturation: 2 });
  sc.contribute({ id: 'web:keep', title: 'kept', text: 'x' }, 1);
  assert.equal(sc.size(), 1, 'a source that grounded a signal is kept');
  assert.ok(sc.borrowable({ max: 5 }).some((r) => r.id === 'web:keep'), 'and is borrowable by the chorus next round');
  // never re-proven useful → it decays out. Not stored forever.
  for (let i = 0; i < 5; i++) sc.step();
  assert.equal(sc.size(), 0, 'a source that stops proving meaningful is evicted, record and all');
  assert.deepEqual(sc.borrowable({ max: 5 }), [], 'nothing stale lingers as borrowable');
});

test('admitSources bonds a source only to the corpus figures it actually names (relevance filter)', () => {
  const log = freshLog();
  const idMap = admitSources(log, [
    { title: 'On rain and flood', text: 'rain drives flood', source: 's', url: 'u1' },   // names corpus figures
    { title: 'Quantum chromodynamics', text: 'gluons and quarks', source: 's', url: 'u2' }, // names nothing here
  ]);
  assert.equal(idMap.size, 2, 'both sources are admitted as figures');
});

// ── evolutionary reward: no voice goes extinct (the diversity floor) ──────────
test('reward: the diversity floor lifts a sinking voice — the nine pure shares never go extinct', () => {
  const prev = new Map([['A', 0.98], ['B', 0.02]]);
  const separation = { signal: [{ key: 'k1', weight: 1, consensus: 1, voices: ['A'], sites: ['x'] }], signalKeys: new Set(['k1']), groundedFraction: 1 };
  const surfers = [
    { id: 'A', temperament: 'A', findings: [{ key: 'k1', weight: 1 }], spend: 1 },
    { id: 'B', temperament: 'B', findings: [{ key: 'noise', weight: 0.2 }], spend: 6 },   // committed only noise
  ];
  const floored = reward({ surfers, separation, prevShares: prev, floor: 0.1, eta: 3 });
  assert.ok(floored.shares.get('B') >= 0.1 - 1e-9, 'the floor keeps the weak voice alive');
  const unfloored = reward({ surfers, separation, prevShares: prev, floor: 0, eta: 3 });
  assert.ok(unfloored.shares.get('B') < 0.1, 'without the floor the same voice sinks below it — the named falsifier');
  assert.ok(floored.shares.get('A') > floored.shares.get('B'), 'the signal-producer is still rewarded above the noise-maker');
});

test('reward: the room monitor names collusion when corroborated signal is not externally validated', () => {
  const surfers = [{ id: 'A', temperament: 'A', findings: [{ key: 'k', weight: 0.2 }], spend: 1 },
    { id: 'B', temperament: 'B', findings: [{ key: 'k', weight: 0.2 }], spend: 1 }];
  const separation = { signal: [{ key: 'k', weight: 0.2, consensus: 2, voices: ['A', 'B'], sites: ['x'] }], signalKeys: new Set(['k']), groundedFraction: 0 };
  const colluding = reward({ surfers, separation, prevShares: new Map([['A', 0.5], ['B', 0.5]]), commonsLevel: 0.9, externalValidation: 0.1 });
  assert.equal(colluding.room, 'collusion', 'high internal cooperation with low external validation is the wrong room');
  const honest = reward({ surfers, separation, prevShares: new Map([['A', 0.5], ['B', 0.5]]), commonsLevel: 0.9, externalValidation: 0.9 });
  assert.equal(honest.room, 'cooperation', 'held the commons AND held up outside → cooperation');
});

// ── the whole loop, cooperative and evolutionary ──────────────────────────────
test('the lineup: voices borrow each other\'s meaningful sources and no operator goes extinct', async () => {
  // a deterministic web: a relevant page on demand, plus one off-topic page that will never
  // ground a signal (and so must never be kept).
  const search = async ({ query }) => [
    { title: 'Drought, famine, migration', source: 'stub', url: 'https://ex.org/famine', text: `rain crop loss famine migration ${query}` },
    { title: 'Unrelated ceramics history', source: 'stub', url: 'https://ex.org/pots', text: 'kilns glaze porcelain' },
  ];
  const lineup = createLineup({ corpus: CORPUS, search, floor: 0.05 });
  const rounds = await lineup.run(3);

  assert.equal(rounds.length, 3);
  for (const r of rounds) {
    assert.ok(r.signal.length > 0, `round ${r.round} produced signal`);
    assert.ok(['cooperation', 'contested', 'collusion', 'predation'].includes(r.room), 'a room is named every round');
    // the diversity floor: every one of the nine pure operator shares stays alive.
    for (const op of OPERATORS) assert.ok(r.shares[op] >= 0.05 - 1e-9, `${op} never goes extinct in round ${r.round}`);
  }
  // cooperative building: the source commons appreciates and its records become borrowable.
  assert.ok(rounds[2].sources.level >= rounds[0].sources.level, 'the shared source habitat appreciates across rounds');
  assert.ok(rounds[2].sources.borrowable.length > 0, 'meaningful sources are borrowable by the next surf');
  // meaningful-only: fewer sources are KEPT than were FORAGED (the off-topic page is dropped).
  const foraged = rounds.reduce((a, r) => a + r.sources.foraged, 0);
  assert.ok(rounds[2].sources.kept <= foraged, 'the chorus keeps only what proved meaningful, not everything it fetched');
});
