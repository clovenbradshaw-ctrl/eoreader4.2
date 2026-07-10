import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildJudgeRequest, buildInterpretationRequest, parseInterp, createJudge, createPanel, createJudgePool,
  createPopulation, createScarcity, createGenome,
} from '../src/metabolism/index.js';

// The judge's access is split along the EO line (metabolism/judge.js): the SOURCE is the
// phenomenon (finite, held, decidable → hard oracle, full document); the TRUTH is the noumenon
// (held by no finite process → a defeasible, cite-or-veto panel). And the judge, wherever it
// stands, never touches a weight — it disposes by selection; the surfer proposes by REC.
// Each test here is a named falsifier: it fails if its mechanism is decorative.

const DOC = 'Mitochondria are organelles. They produce ATP. The text says nothing about the moon.';

test('faithfulness is a HARD ORACLE — the judge holds the full document, not just cited spans', () => {
  const req = buildJudgeRequest({ question: 'q', answer: 'a', spans: ['one cited passage'], document: DOC });
  const content = req.messages[0].content;
  assert.ok(content.includes(DOC), 'the judge is handed the COMPLETE source — blinding the anchor adds error, not humility');
  assert.ok(content.includes('one cited passage'), 'and still sees what the answer chose to cite');
  assert.match(req.system, /hard oracle|whole source|full/i, 'the rubric rules over the whole source');
  assert.match(req.system, /refusal|withheld|abstain/i, 'and can certify a correct refusal — an absence over the full document');
  // without a document the request still forms, but the full-source claim is not made (degraded mode, explicit).
  const blind = buildJudgeRequest({ question: 'q', answer: 'a' });
  assert.ok(!blind.messages[0].content.includes('SOURCE (complete'), 'no document → no full-source claim');
});

test('meaning is DEFEASIBLE — cite-or-veto: an uncited reading is withdrawn, not asserted', () => {
  const req = buildInterpretationRequest({ question: 'q', answer: 'a', document: DOC, persona: 'a literal reader' });
  assert.ok(req.messages[0].content.includes(DOC), 'the panelist also holds the full source');
  assert.match(req.system, /not an oracle|defeasible|cite|withdraw/i, 'meaning is a glass box, not an oracle');
  const cited = parseInterp({ content: [{ type: 'text', text: JSON.stringify({ reading: 0.8, citation: 'They produce ATP.', veto: false, rationale: 'r' }) }] });
  assert.equal(cited.asserted, true, 'a reading grounded in a cited span stands');
  const uncited = parseInterp({ content: [{ type: 'text', text: JSON.stringify({ reading: 0.9, citation: '', veto: false, rationale: 'r' }) }] });
  assert.equal(uncited.asserted, false, 'a reading it cannot cite is NOT asserted — cite-or-veto');
  assert.equal(uncited.veto, true, 'an uncitable reading is a veto');
});

test('the interpretation PANEL keeps disagreement as signal — it does not smooth to one number', async () => {
  const voice = (v) => ({ interpret: async () => parseInterp({ content: [{ type: 'text', text: JSON.stringify(v) }] }) });
  const panel = createPanel({ judges: [
    voice({ reading: 0.9, citation: 'They produce ATP.', veto: false, rationale: 'generous' }),
    voice({ reading: 0.2, citation: 'organelles', veto: false, rationale: 'strict' }),
    voice({ reading: 0.5, citation: '', veto: true, rationale: 'cannot ground' }),
  ] });
  const r = await panel.assess({ question: 'q', answer: 'a', document: DOC });
  assert.equal(r.verdicts.length, 3, 'every voice is kept');
  assert.ok(r.spread >= 0.6, 'the strict/generous disagreement is surfaced, not averaged away');
  assert.ok(r.dissent.length >= 1, 'dissent is reported as signal');
  assert.equal(r.vetoes, 1, 'the ungrounded reading is a veto, not a low score dragging a hidden mean');
  assert.equal(r.unanimous, false);
});

test('rotation moves the target while every position stays TRUE (each judge holds the source)', () => {
  const mk = (id) => ({ id, interpret: async () => null });
  const pool = createJudgePool({ pool: [mk('a'), mk('b'), mk('c'), mk('d')], size: 2 });
  assert.notDeepEqual(pool.rotate(0).map((j) => j.id), pool.rotate(1).map((j) => j.id),
    'the panel changes period to period — the surfer cannot overfit a fixed evaluator');
  const seen = new Set();
  for (let p = 0; p < 4; p++) for (const j of pool.rotate(p)) seen.add(j.id);
  assert.equal(seen.size, 4, 'rotation sweeps the whole anchored pool — moving, but every position true');
});

test('FIREWALL — the judge scores but never authors a weight; every genome edit is REC', () => {
  const j = createJudge({});
  assert.equal(typeof j.grade, 'function');
  assert.equal(typeof j.interpret, 'function');
  for (const forbidden of ['vary', 'mutate', 'setGenome', 'promote', 'edit', 'writeGenome']) {
    assert.ok(!(forbidden in j), `the judge exposes no weight-writing surface (${forbidden}) — proposer ≠ disposer`);
  }
  // the ONLY genome edits the ecology produces are REC promotions — surfer-proposed, strain-directed,
  // gated by a selection the surfer does not control. The judge's hand stays off the steering wheel.
  const pop = createPopulation({ scarcity: createScarcity({ regime: 'seasonal', ration: 1400 }), founder: createGenome(), size: 12 });
  for (let p = 0; p < 80; p++) pop.compete(p);
  for (const e of pop.promotions()) assert.equal(e.op, 'REC', 'every genome edit is REC — proposed by the surfer, never written by the judge');
});

test('the neutral reservoir preserves standing variation the greedy cull would burn', () => {
  const run = (reservoir) => {
    const pop = createPopulation({ scarcity: createScarcity({ regime: 'seasonal', ration: 1200 }), founder: createGenome(), size: 20, capacity: 14, reservoir });
    for (let p = 0; p < 100; p++) pop.compete(p);
    return pop.diversity();
  };
  assert.ok(run(6) >= run(0), 'protecting neutral variants holds at least as much diversity as pruning to the optimum');
});
