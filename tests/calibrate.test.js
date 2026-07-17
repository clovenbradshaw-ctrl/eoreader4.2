import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  runCalibrationCycle, calibrationRunner,
  createChallenger, createFoldPlanJudge, createProposer, createGenome, createTransferProbe,
} from '../src/metabolism/index.js';

// calibrate.js — the loop that calibrates the FOLD -> PLAN -> CHUNK-PROMPT pipeline against a
// frontier IDEAL answer (docs/calibration-mode.md), reusing challenger/proposer (existing Claude
// channels), the new fold-plan-judge.js reads, and the existing transfer falsifier (transfer.js)
// completely unchanged.

const userStub = async (messages) => {
  const sys = messages.find((m) => m.role === 'system')?.content || '';
  if (/REAL USER/i.test(sys)) return JSON.stringify({ question: 'What happened at noon?', intent: 'understand the incident', difficulty: 'medium' });
  return JSON.stringify({ grounded: 0.8, flowing: 0.8, satisfied: 0.8, resolved: true, critique: 'a bit thin on detail' });
};

const gradeStub = async (request) => {
  const sys = request.system || '';
  const body = /PLAN/.test(sys)
    ? { decomposition: 0.9, coverage: 0.7, ordered: true, rationale: 'plan stops short of the resolution' }
    : { sufficient: true, salience: 0.8, missing: '', rationale: 'the fold carried the key fact' };
  return { content: [{ type: 'text', text: JSON.stringify(body) }] };
};

const ideal = async (task) => `The reactor at the center of "${task.question}" reached criticality at noon and was scrammed by 12:04.`;
const local = async (task, allocation) => ({
  answer: `Something happened around noon (foldWidth=${allocation.foldWidth}).`,
  fold: ['the reactor reached criticality at noon'],
  plan: ['state the time', 'state the outcome'],
});

test('runCalibrationCycle: dry-run — no challenger task means no cycle', async () => {
  const challenger = createChallenger({ generate: null, enabled: true });
  const r = await runCalibrationCycle({ challenger, ideal, local, genome: createGenome() });
  assert.equal(r, null);
});

test('runCalibrationCycle: composes the four reads and tags each critique by stage', async () => {
  const challenger = createChallenger({ generate: userStub, enabled: true });
  const foldPlanJudge = createFoldPlanJudge({ call: gradeStub, enabled: true });
  const genome = createGenome();
  const r = await runCalibrationCycle({ challenger, foldPlanJudge, ideal, local, genome });
  assert.ok(r.task.question, 'the challenger posed a task');
  assert.match(r.idealAnswer, /criticality/, 'the ideal is the frontier\'s own direct answer');
  assert.match(r.answer, /foldWidth/, 'the local pipeline ran at the genome\'s live allocation');
  assert.equal(r.satisfaction.satisfied, 0.8);
  assert.equal(r.foldVerdict.sufficient, true);
  assert.equal(r.planVerdict.coverage, 0.7);
  assert.ok(r.critiques.some((c) => c.critique.startsWith('[plan]')), 'the plan critique is tagged by stage');
  assert.ok(r.critiques.some((c) => c.critique.startsWith('[fold]')), 'the fold critique is tagged by stage');
  assert.ok(r.critiques.some((c) => c.critique.startsWith('[answer]')), 'the answer critique is tagged by stage');
});

test('runCalibrationCycle: the breeder reads the tagged critiques and proposes a dial move on the SAME genome', async () => {
  const challenger = createChallenger({ generate: userStub, enabled: true });
  const foldPlanJudge = createFoldPlanJudge({ call: gradeStub, enabled: true });
  const proposer = createProposer({
    generate: async (messages) => {
      const usr = messages.find((m) => m.role === 'user')?.content || '';
      assert.match(usr, /\[plan\]/, 'the breeder sees the stage-tagged critiques');
      return JSON.stringify({ kind: 'weight', gene: 'foldWidth', to: 5, rationale: 'the fold was thin on detail' });
    },
    enabled: true,
  });
  const genome = createGenome({ foldWidth: 3 });
  const r = await runCalibrationCycle({ challenger, foldPlanJudge, proposer, ideal, local, genome });
  assert.ok(r.proposal && r.proposal.challenger, 'the breeder proposes a ratifiable challenger genome');
  assert.equal(r.proposal.challenger.unit.get('foldWidth'), 5);
  assert.equal(genome.get('foldWidth'), 3, 'the firewall holds — the running genome is never mutated directly');
});

test('calibrationRunner: adapts a frozen backend into the transfer probe\'s runner shape', async () => {
  const backend = { id: 'frozen-a' };
  const runner = calibrationRunner({
    id: 'A',
    backend,
    local: async (task, allocation, be) => `scaffolded:${be.id}:${allocation.maxTokens}`,
    bare: async (task, be) => `bare:${be.id}`,
  });
  assert.equal(await runner.run({ task: {}, surfer: { maxTokens: 384 }, scaffolded: true }), 'scaffolded:frozen-a:384');
  assert.equal(await runner.run({ task: {}, surfer: {}, scaffolded: false }), 'bare:frozen-a');
});

test('calibrationRunner composes with the existing transfer falsifier unchanged — a fold gain that overfits ONE frozen leaf does not transfer', async () => {
  const scores = { 'answer-bare-A': 0.3, 'answer-with-fold-A': 0.3, 'answer-bare-B': 0.3, 'answer-with-fold-B': 0.9 };
  const makeRunner = (id) => calibrationRunner({
    id, backend: { id },
    local: async () => `answer-with-fold-${id}`,
    bare: async () => `answer-bare-${id}`,
  });
  const probe = createTransferProbe({
    runners: [makeRunner('A'), makeRunner('B')],
    score: async (task, answer) => scores[answer] ?? 0,
    ceiling: 1,
  });
  const reading = await probe.measure({ task: {}, surfer: {}, resource: 0 });
  assert.equal(reading.transfers, false, 'a gain that only shows up on leaf B is prompt overfit, not a better fold/plan');
  assert.ok(reading.kept <= reading.liftB, 'kept fitness is capped by the weaker leaf');
});
