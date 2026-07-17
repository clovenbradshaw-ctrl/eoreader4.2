import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createFoldPlanJudge, buildFoldRequest, buildPlanRequest } from '../src/metabolism/index.js';

// fold-plan-judge.js grades the two stages BEFORE the final answer — the fold (did it carry what
// the ideal answer needed) and the plan (did it decompose/cover/order correctly) — against a
// frontier IDEAL answer, so the breeder (proposer.js) can tell which stage to fix. Same posture as
// judge.js: pure request builders, a budgeted/dry-run-safe grader, no key or network in this module.

const stub = ({ fold = null, plan = null } = {}) => async (request) => {
  const sys = request.system || '';
  const body = /PLAN/.test(sys) ? plan : fold;
  return { content: [{ type: 'text', text: JSON.stringify(body) }] };
};

test('fold-plan-judge: DRY-RUN — unarmed or no transport returns null for both axes', async () => {
  const off = createFoldPlanJudge({ call: stub({ fold: { sufficient: true, salience: 1, rationale: 'ok' } }), enabled: false });
  assert.equal(await off.gradeFold({ task: 'x', fold: 'y', idealAnswer: 'z' }), null, 'disarmed -> null');
  const noCall = createFoldPlanJudge({ enabled: true });
  assert.equal(await noCall.gradePlan({ task: 'x', plan: [], idealAnswer: 'z' }), null, 'no transport -> null');
});

test('fold-plan-judge: gradeFold reports sufficiency, salience, and what is missing', async () => {
  const j = createFoldPlanJudge({
    call: stub({ fold: { sufficient: false, salience: 0.4, missing: 'the Q3 revenue figure', rationale: 'the fold never carried the number the ideal cited' } }),
    enabled: true,
  });
  const v = await j.gradeFold({ task: { question: 'summarize the filing' }, fold: ['revenue grew'], idealAnswer: 'Revenue grew to $4.2M in Q3.' });
  assert.equal(v.sufficient, false);
  assert.equal(v.salience, 0.4);
  assert.match(v.missing, /revenue/i);
  assert.ok(v.rationale);
});

test('fold-plan-judge: gradePlan reports decomposition, coverage, and step ordering', async () => {
  const j = createFoldPlanJudge({
    call: stub({ plan: { decomposition: 0.9, coverage: 0.6, ordered: true, rationale: 'good steps but stops before the conclusion' } }),
    enabled: true,
  });
  const v = await j.gradePlan({ task: { question: 'write the essay' }, plan: ['intro', 'body'], idealAnswer: 'Intro. Body. Conclusion.' });
  assert.equal(v.decomposition, 0.9);
  assert.equal(v.coverage, 0.6);
  assert.equal(v.ordered, true);
  assert.ok(v.rationale);
});

test('fold-plan-judge: a call budget caps spend across BOTH axes combined', async () => {
  let calls = 0;
  const j = createFoldPlanJudge({
    call: async (r) => { calls += 1; return stub({ fold: { sufficient: true, salience: 1, rationale: 'ok' } })(r); },
    enabled: true, budget: { calls: 1 },
  });
  const first = await j.gradeFold({ task: 'x', fold: 'y', idealAnswer: 'z' });
  assert.ok(first, 'the first call is served');
  assert.equal(await j.gradePlan({ task: 'x', plan: [], idealAnswer: 'z' }), null, 'the second call is refused — budget exhausted');
  assert.equal(calls, 1, 'the transport is invoked exactly once — the cap is real');
  assert.equal(j.budget().exhausted, true);
});

test('buildFoldRequest / buildPlanRequest: pure request shapes, pinned without a network', () => {
  const fr = buildFoldRequest({ task: { question: 'q' }, fold: ['a fact'], idealAnswer: 'the ideal' });
  assert.match(fr.messages[0].content, /a fact/);
  assert.match(fr.system, /FOLD/);
  const pr = buildPlanRequest({ task: { question: 'q' }, plan: ['step one'], idealAnswer: 'the ideal' });
  assert.match(pr.messages[0].content, /step one/);
  assert.match(pr.system, /PLAN/);
});
