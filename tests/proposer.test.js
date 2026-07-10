import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createProposer, buildProposeMessages, mutationSurface, validateProposal, realize, clampGene,
  createGenome, createOrganism, createSoma, GENES,
} from '../src/metabolism/index.js';

// Claude as the BREEDER (metabolism/proposer.js) — the THIRD Claude channel. challenger.js poses the
// question and grades it; this reads the grader's critiques and PROPOSES the heritable change most
// likely to answer them. The invariants these tests pin: it only ever PROPOSES a challenger (never
// writes the champion — the firewall), every proposal is legalized before it leaves the module (dial
// clamped, organ run through the soma checkpoints), organ moves open the STRUCTURAL dimension the
// mechanical mutator leaves dark, and disarmed it is a pure no-op so wiring it in changes nothing.

// a stub `generate` that plays the breeder, returning whatever proposal JSON the test wants, keyed
// on the BREEDER system prompt so it never fires on some other channel's request.
const stub = (proposal, { fence = false } = {}) => async (messages) => {
  const sys = messages.find((m) => m.role === 'system')?.content || '';
  if (!/BREEDER/i.test(sys)) return null;
  const json = JSON.stringify(proposal);
  return fence ? '```json\n' + json + '\n```' : json;
};

const organism = () => createOrganism({ genome: createGenome(), soma: createSoma() });

test('proposer: DRY-RUN — unarmed or no transport returns null (byte-identical fallback to the mutator)', async () => {
  const off = createProposer({ generate: stub({ kind: 'weight', gene: 'maxTokens', to: 512 }), enabled: false });
  assert.equal(await off.propose({ unit: createGenome(), critiques: ['x'] }), null, 'disarmed → null');
  const noGen = createProposer({ enabled: true });
  assert.equal(await noGen.propose({ unit: createGenome(), critiques: ['x'] }), null, 'no transport → null');
});

test('proposer: a WEIGHT proposal becomes a ratifiable challenger, clamped, tagged origin:claude', async () => {
  const p = createProposer({ generate: stub({ kind: 'weight', gene: 'maxTokens', to: 512, rationale: 'answers were cut off mid-sentence' }), enabled: true });
  const unit = createGenome({ maxTokens: 384 });
  const out = await p.propose({ unit, critiques: [{ critique: 'the answer was cut off mid-sentence', satisfied: 0.1 }] });
  assert.ok(out && out.challenger, 'it proposes a challenger');
  assert.equal(out.origin, 'claude');
  assert.equal(out.challenger.mutation.gene, 'maxTokens');
  assert.equal(out.challenger.mutation.origin, 'claude', 'the mutation carries provenance back to Claude');
  assert.equal(out.challenger.mutation.target, 'weights');
  assert.equal(out.challenger.unit.get('maxTokens'), 512, 'the mutant genome carries the new value');
  // THE FIREWALL: the champion the proposer was handed is UNCHANGED — it proposed, it did not write.
  assert.equal(unit.get('maxTokens'), 384, 'the input champion is never mutated');
});

test('proposer: an out-of-range dial is CLAMPED, an off-menu gene is REFUSED', async () => {
  const g = GENES.maxTokens;
  assert.equal(clampGene('maxTokens', 99999), g.max, 'clamped to max');
  assert.equal(clampGene('maxTokens', -5), g.min, 'clamped to min');
  assert.equal(clampGene('bogus', 5), null, 'unknown gene → null');
  const over = createProposer({ generate: stub({ kind: 'weight', gene: 'maxTokens', to: 99999 }), enabled: true });
  const out = await over.propose({ unit: createGenome(), critiques: ['x'] });
  assert.equal(out.challenger.unit.get('maxTokens'), g.max, 'an over-range proposal lands at the ceiling, never illegal');
  const bad = createProposer({ generate: stub({ kind: 'weight', gene: 'notAGene', to: 1 }), enabled: true });
  assert.equal(await bad.propose({ unit: createGenome(), critiques: ['x'] }), null, 'an off-menu gene proposes nothing (falls back to the mutator)');
});

test('proposer: an ORGAN proposal grows the STRUCTURAL dimension the scalar mutator never touches', async () => {
  // serves:"time" is UNSERVED by the founding body (SEG→time, and no founder fires SEG), so the
  // proposal grows the MISSING SENSE — exactly the leap weight-tuning cannot make.
  const p = createProposer({ generate: stub({ kind: 'organ', route: 'SYN', serves: 'time', rationale: 'it never resplits — no structure found in prose' }), enabled: true });
  const unit = organism();
  const before = unit.body().count();
  const out = await p.propose({ unit, critiques: [{ critique: 'it finds no structure in the document', satisfied: 0 }] });
  assert.ok(out && out.challenger, 'it proposes a structural challenger');
  assert.equal(out.challenger.mutation.target, 'organs');
  assert.equal(out.challenger.mutation.level, 'organ');
  assert.equal(out.challenger.mutation.origin, 'claude');
  assert.equal(out.challenger.unit.body().count(), before + 1, 'the mutant body has one more organ');
  // the grown body still CLOSES its developmental envelope — the growth is legal, not a tumor.
  assert.equal(out.challenger.unit.body().close().ok, true, 'the proposed body passes its own checkpoint');
  assert.equal(unit.body().count(), before, 'the champion body is unchanged (the firewall, at the structural level)');
});

test('proposer: an organ proposal on a body WITHOUT a soma proposes nothing (no body to grow)', async () => {
  const p = createProposer({ generate: stub({ kind: 'organ', route: 'SYN' }), enabled: true });
  assert.equal(await p.propose({ unit: createGenome(), critiques: ['x'] }), null, 'a plain weight-genome has no organs; the organ move is refused → null');
});

test('proposer: a growth the body REFUSES is caught here, never applied downstream', async () => {
  // a soma already at carrying capacity cannot grow — the proposal legalizes but the soma refuses it,
  // and the proposer returns a refusal with no challenger rather than an illegal mutant.
  const full = createOrganism({ genome: createGenome(), soma: createSoma({ maxOrgans: 5 }) }); // 5 founders == cap
  const p = createProposer({ generate: stub({ kind: 'organ', route: 'SYN', serves: 'time' }), enabled: true });
  const out = await p.propose({ unit: full, critiques: ['x'] });
  assert.ok(out && out.refused && out.challenger == null, 'the refusal is surfaced, no challenger is built');
  assert.match(out.reason, /capacity/i, 'the reason names the carrying-capacity checkpoint');
});

test('proposer: the BUDGET caps spend so the channel can never run away', async () => {
  const p = createProposer({ generate: stub({ kind: 'weight', gene: 'gamma', to: 0.8 }), enabled: true, budget: { calls: 1 } });
  const a = await p.propose({ unit: createGenome(), critiques: ['x'] });
  assert.ok(a && a.challenger, 'first proposal spends the one call');
  const b = await p.propose({ unit: createGenome(), critiques: ['x'] });
  assert.equal(b, null, 'the second is out of budget → null (falls back to the mutator)');
  assert.equal(p.budget().exhausted, true);
});

test('proposer: the prompt casts Claude as a PROPOSER, not a promoter, and carries the critiques + legal menu', () => {
  const unit = organism();
  const msgs = buildProposeMessages({ unit, critiques: ['retrieval pulled irrelevant pages'], season: { name: 'lean' } });
  assert.match(msgs[0].content, /BREEDER/, 'system prompt casts Claude as the breeder');
  assert.match(msgs[0].content, /PROPOSE; you do not decide/i, 'the firewall is stated in the prompt');
  assert.match(msgs[1].content, /retrieval pulled irrelevant pages/, 'the critiques are the signal handed in');
  assert.match(msgs[1].content, /CURRENT DIALS/, 'the legal dial menu is shown');
  assert.match(msgs[1].content, /DESERT/, 'the desert (growable cells) is shown for an organism');
  // the menu reflects the real gene ranges, so the model proposes within bounds.
  const surface = mutationSurface(unit);
  assert.equal(surface.genes.find((g) => g.gene === 'maxTokens').max, GENES.maxTokens.max);
  assert.ok(surface.desert.length > 0, 'an organism exposes a desert to grow into');
});

test('proposer: fenced/ wrapped JSON is still parsed (same extraction as the challenger)', async () => {
  const p = createProposer({ generate: stub({ kind: 'weight', gene: 'retrieveK', to: 8 }, { fence: true }), enabled: true });
  const out = await p.propose({ unit: createGenome(), critiques: ['thin retrieval'] });
  assert.ok(out && out.challenger && out.challenger.unit.get('retrieveK') === 8, 'a fenced proposal is extracted and realized');
});

test('proposer: validateProposal / realize are pure and independently legal', () => {
  // validateProposal legalizes; realize builds — both usable without a transport (for the wiring layer).
  const unit = createGenome({ bindFloor: 0.25 });
  const v = validateProposal(unit, { kind: 'weight', gene: 'bindFloor', to: 0.5, rationale: 'irrelevant citations' });
  assert.deepEqual({ kind: v.kind, gene: v.gene, to: v.to }, { kind: 'weight', gene: 'bindFloor', to: 0.5 });
  const r = realize(unit, v);
  assert.equal(r.mutation.origin, 'claude');
  assert.equal(r.unit.get('bindFloor'), 0.5);
  assert.equal(validateProposal(unit, { kind: 'nonsense' }), null, 'an unknown kind legalizes to nothing');
});
