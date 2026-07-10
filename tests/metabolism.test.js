import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createMetabolism, createScarcity, createGenome, createFitness, createSelection,
  createPopulation, createProvenance, memoryStore, createJudge,
  buildJudgeRequest, parseVerdict, score, GENES, GENE_NAMES, defaultGenotype, energyOf,
} from '../src/metabolism/index.js';

// The metabolism is an evolutionary self-maintenance loop under scarcity (docs: the essay
// "Something to Lose"). These tests pin the four evolutionary components and the four
// failure-mode guards, plus the DNA-only / gated invariants on the outward-facing organs.

test('scarcity: plenty is inert; a lean regime periodically starves (the lean season)', () => {
  const plenty = createScarcity({ regime: 'plenty', ration: 1000 });
  // plenty is a flat, generous ration — nothing is forced.
  assert.equal(plenty.season(0).name, 'plenty');
  assert.equal(plenty.season(50).budget, 1000);
  // a seasonal regime dips into famine on its cadence — the pressure the essay requires.
  const seasonal = createScarcity({ regime: 'seasonal', ration: 1000 });
  const names = Array.from({ length: 24 }, (_, p) => seasonal.season(p).name);
  assert.ok(names.includes('famine'), 'seasonal regime must reach famine');
  assert.ok(names.includes('plenty') || names.includes('turning'), 'seasonal regime must also reach plenty to leave exploration slack');
  // energy is the single currency the five resources convert into; the model call dominates.
  assert.ok(energyOf({ model: 1 }) > energyOf({ tokens: 100, fetch: 5, time: 10 }), 'the model call must be the costliest act');
});

test('genome: defaults equal today, mutation is bounded + directed, and stays REC-reachable', () => {
  const g = createGenome();
  assert.deepEqual(g.genotype(), defaultGenotype(), 'a fresh genome is today\'s constants (inert)');
  // a strain on a resource moves the gene that governs it toward spending less.
  const { genome: leaner, mutation } = g.vary({ strain: { resource: 'fetch', magnitude: 1 } });
  assert.equal(mutation.gene, 'retrieveK', 'a fetch strain relieves the forage gene');
  assert.ok(leaner.get('retrieveK') < g.get('retrieveK'), 'directed mutation spends less of the strained resource');
  // bounds hold: no mutation escapes a gene's [min,max].
  let extreme = createGenome({ retrieveK: GENES.retrieveK.max });
  for (let i = 0; i < 20; i++) extreme = extreme.vary({ strain: { resource: 'fetch' } }).genome;
  assert.ok(extreme.get('retrieveK') >= GENES.retrieveK.min && extreme.get('retrieveK') <= GENES.retrieveK.max);
  // path-dependence guard: any gene can be reverted toward its default.
  const drifted = createGenome({ gamma: 0.5 });
  const back = drifted.vary({ revert: 'gamma' }).genome;
  assert.ok(back.get('gamma') > 0.5, 'a gene can always be pulled back toward its default');
});

test('fitness: quality per resource, coverage guards Goodhart, external anchor tethers it', () => {
  const eo = (s) => energyOf(s);
  // claiming LESS cannot win: a non-delivering "safe" turn has zero coverage → zero quality.
  const dodge = score({ delivered: false, spend: { model: 0 } }, { energyOf: eo });
  const answer = score({ grounded: 3, claimed: 3, coherence: 0.9, covered: 1, delivered: true, spend: { model: 1, tokens: 200 } }, { energyOf: eo });
  assert.ok(answer.fitness > dodge.fitness, 'a real grounded answer must out-score a thrifty non-answer');
  // an un-authored anchor flips provisional off; without it, fitness is honestly provisional.
  assert.equal(score({ grounded: 1, claimed: 1, delivered: true, spend: {} }, { energyOf: eo }).provisional, true);
  assert.equal(score({ grounded: 1, claimed: 1, delivered: true, validated: 0.9, spend: {} }, { energyOf: eo }).provisional, false);
  // efficiency: same quality, less spend → higher fitness (only meaningful because spend is scarce).
  const cheap = score({ grounded: 2, claimed: 2, covered: 1, delivered: true, validated: 0.8, spend: { model: 0, tokens: 0 } }, { energyOf: eo });
  const dear = score({ grounded: 2, claimed: 2, covered: 1, delivered: true, validated: 0.8, spend: { model: 1, tokens: 400 } }, { energyOf: eo });
  assert.ok(cheap.fitness > dear.fitness, 'cheaper path to the same quality is fitter');
});

test('selection: a challenger inherits only by beating the champion (hysteresis)', () => {
  const sel = createSelection({ genome: createGenome(), margin: 0.05 });
  // champion establishes a baseline; a strictly-better challenger is carried forward.
  sel.record({ ran: 'champion', fitness: 1.0, season: { budget: 100, name: 'plenty' }, bill: { model: 0, tokens: 0, time: 1, fetch: 6 }, period: 0 });
  const probe = sel.maybeExplore(1, { name: 'plenty', budget: 100 }, { resource: 'fetch', magnitude: 1 }, 0);
  assert.ok(probe, 'with slack, a challenger is spawned');
  const worse = sel.record({ ran: 'challenger', fitness: 0.5, period: 1 });
  assert.equal(worse.event.kind, 'cull', 'a worse challenger is culled, not inherited');
});

test('selection: the slack guard forbids exploration under famine', () => {
  const sel = createSelection({ genome: createGenome() });
  sel.record({ ran: 'champion', fitness: 1, season: { name: 'famine', budget: 5 }, bill: { model: 0, tokens: 0, time: 1, fetch: 6 }, period: 12 });
  assert.equal(sel.maybeExplore(0.5, { name: 'famine', budget: 5 }, null, 12), null, 'no exploring in famine — the starved organism conserves');
});

test('population: a competitive ecology sustains life and promotes a fitter genome', () => {
  const scarcity = createScarcity({ regime: 'seasonal', ration: 1400 });
  const pop = createPopulation({ scarcity, founder: createGenome(), size: 14, capacity: 28 });
  let promoted = 0;
  for (let p = 0; p < 120; p++) { const d = pop.compete(p); if (d.promoted) promoted += 1; }
  assert.ok(pop.size() > 1, 'the ecology does not collapse — competition sustains a population');
  assert.ok(pop.size() <= 28, 'carrying capacity bounds the population');
  assert.ok(promoted >= 1, 'the champion genome evolves — at least one promotion (a genome edit)');
});

test('persist: only genome edits, DNA only, hash-chained, gated (no autonomous writes)', () => {
  const p = createProvenance({ geneNames: GENE_NAMES, identity: { mxid: '@eo:m.org', token: 'SECRET' } });
  assert.equal(p.armed(), false, 'gated: dry-run by default, nothing is sent');
  // a genome edit carrying a stray content field — the block must strip it to DNA only.
  const { block, request, fired } = p.record({
    op: 'REC', kind: 'promote', changes: [{ gene: 'gamma', before: 0.7, after: 0.65 }], period: 3,
    answerText: 'the powerhouse of the cell', sourceUrl: 'https://secret/doc',   // content — must NOT persist
  });
  assert.equal(fired, false, 'dry-run: the request is formed, not fired');
  const blob = JSON.stringify(block);
  assert.ok(!blob.includes('answerText') && !blob.includes('powerhouse') && !blob.includes('secret/doc'), 'DNA only — no content in a block');
  assert.ok(!blob.includes('SECRET'), 'an access token never enters a block');
  assert.equal(request.headers.Authorization, 'Bearer SECRET', 'the token rides only in transient request headers');
  // the chain links and verifies (tamper-evidence).
  p.record({ op: 'REC', kind: 'promote', changes: [{ gene: 'maxTokens', before: 384, after: 352 }], period: 5 });
  const chain = p.chain();
  assert.equal(chain.length, 2);
  assert.equal(chain[1].prevHash, chain[0].hash, 'each block carries the prior block\'s hash (the chain)');
  assert.equal(p.verify().ok, true, 'the intact chain verifies');
});

test('persist: chain head survives across sessions via an injected store (heritability)', () => {
  const store = memoryStore();
  const a = createProvenance({ geneNames: GENE_NAMES, store });
  a.record({ op: 'REC', kind: 'inherit', gene: 'gamma', before: 0.7, after: 0.65, period: 1 });
  // a fresh provenance over the same store resumes the chain — evolution accumulates.
  const b = createProvenance({ geneNames: GENE_NAMES, store });
  assert.equal(b.length(), 1, 'the chain persists across sessions');
  assert.equal(b.head(), a.head());
});

test('judge: builds a correct request, parses a scalar verdict, and gating stays honest', () => {
  const req = buildJudgeRequest({ question: 'q', answer: 'a', spans: ['s'] });
  assert.equal(req.model, 'claude-opus-4-8');
  assert.deepEqual(req.thinking, { type: 'adaptive' });
  assert.equal(req.output_config.format.type, 'json_schema');
  const v = parseVerdict({ content: [{ type: 'text', text: JSON.stringify({ validated: 0.8, covered: 1, grounded: true }) }] });
  assert.equal(v.validated, 0.8);
  assert.equal(v.grounded, true);
});

test('judge: its own API budget caps spend — it dry-runs when exhausted (don\'t burn the API)', async () => {
  let calls = 0;
  const j = createJudge({ enabled: true, budget: { calls: 2 }, call: async () => { calls += 1; return { content: [{ type: 'text', text: JSON.stringify({ validated: 0.7, covered: 1, grounded: true }) }], usage: { input_tokens: 10, output_tokens: 5 } }; } });
  assert.ok(await j.grade({ question: 'q', answer: 'a' }));       // call 1 — within budget
  assert.ok(await j.grade({ question: 'q', answer: 'a' }));       // call 2 — within budget
  assert.equal(await j.grade({ question: 'q', answer: 'a' }), null, 'budget exhausted → the judge stops calling the API');
  assert.equal(calls, 2, 'the transport is invoked exactly twice — the cap is real');
  assert.equal(j.budget().exhausted, true);
  // the judge also AUTHORS tests (Claude sets the exam), and authoring spends the same budget.
  const j2 = createJudge({ enabled: true, budget: { calls: 1 }, call: async () => ({ content: [{ type: 'text', text: JSON.stringify({ tests: [{ question: 'q1', rubric: 'must cite passage 1', difficulty: 'easy' }] }) }] }) });
  const tests = await j2.authorTests({ passages: ['a passage'], n: 1 });
  assert.equal(Array.isArray(tests) && tests.length, 1, 'the judge authors an evaluation battery');
  assert.equal(j2.budget().exhausted, true, 'authoring debits the same API budget as grading');
});

test('metabolizeJudged: a wired judge anchors fitness; a dry-run judge leaves it provisional', async () => {
  const turn = { question: 'q', answer: 'grounded', spans: ['e'], grounded: 3, claimed: 4, coherence: 0.8, delivered: true, warmedModel: true, tokens: 200, timeMs: 600 };
  const armed = createMetabolism({ scarcity: createScarcity({ regime: 'harsh' }), judge: createJudge({ enabled: true, call: async () => ({ content: [{ type: 'text', text: JSON.stringify({ validated: 0.9, covered: 1, grounded: true }) }] }) }) });
  await armed.metabolizeJudged(turn);
  assert.equal(armed.vitals().provisional, false, 'a wired judge tethers fitness to an un-authored verdict');

  const dry = createMetabolism({ scarcity: createScarcity({ regime: 'harsh' }), judge: createJudge({}) });
  await dry.metabolizeJudged(turn);
  assert.equal(dry.vitals().provisional, true, 'without a live judge, fitness stays honestly provisional');
});

test('determinism: a replayed run reproduces the same evolutionary lineage', () => {
  const run = () => {
    const s = createScarcity({ regime: 'harsh', ration: 1000 });
    const m = createMetabolism({ scarcity: s, population: createPopulation({ scarcity: s, founder: createGenome(), size: 10 }) });
    const alloc = () => ({ warmedModel: m.allocation().modelGate < 0.55 });
    for (let i = 0; i < 60; i++) m.metabolize({ ...alloc(), grounded: 3, claimed: 4, coherence: 0.8, covered: 1, delivered: true, validated: 0.8 });
    return m.lineage();
  };
  assert.deepEqual(run(), run(), 'no RNG — the same log reproduces the same lineage');
});
