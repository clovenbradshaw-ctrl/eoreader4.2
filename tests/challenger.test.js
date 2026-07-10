import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createChallenger, runChallengeCycle, buildChallengeMessages } from '../src/metabolism/index.js';

// Claude as the simulated USER (metabolism/challenger.js). It challenges the system the way a normal
// user would and scores whether the output SATISFIED that user — a model put in charge of output-
// satisfaction evaluation, and the fitness anchor the population evolves against. These tests pin the
// contract with a stub transport (no network): the roles, the budget cap, the dry-run fallback, and
// the full challenge→answer→satisfy cycle whose satisfaction becomes the un-authored `validated`.

// a stub `generate` that answers a challenge request with a user question and a satisfaction request
// with a score — keyed on the system prompt so one stub plays both roles.
const stub = (satisfied = 0.8) => async (messages) => {
  const sys = messages.find((m) => m.role === 'system')?.content || '';
  if (/pose one question|REAL USER/i.test(sys)) return JSON.stringify({ question: 'What does the reactor log say happened at noon?', intent: 'understand the incident', difficulty: 'medium' });
  return '```json\n' + JSON.stringify({ satisfied, resolved: satisfied >= 0.5, critique: 'more specifics would help' }) + '\n```';   // fenced, to test extraction
};

test('challenger: poses a realistic user question and behaves like a user, not the author', async () => {
  const c = createChallenger({ generate: stub(), enabled: true });
  const ch = await c.challenge({ material: { title: 'Reactor log', text: 'The core reached criticality at noon.' } });
  assert.ok(ch && ch.question && /reactor|noon/i.test(ch.question), 'it asks a real question about the material');
  assert.ok(ch.intent && ['easy', 'medium', 'hard'].includes(ch.difficulty), 'it carries the user\'s intent and a difficulty');
  // the prompt genuinely frames a user, not a grader-of-source.
  const msgs = buildChallengeMessages({ material: 'x' });
  assert.match(msgs[0].content, /REAL USER/, 'the challenge system prompt casts Claude as the user');
});

test('challenger: scores SATISFACTION (not mere grounding), parsing JSON even when fenced', async () => {
  const c = createChallenger({ generate: stub(0.9), enabled: true });
  const s = await c.evaluate({ question: 'q', answer: 'a grounded, useful answer', intent: 'resolve it' });
  assert.equal(s.satisfied, 0.9, 'a satisfaction score in [0,1] comes back');
  assert.equal(s.resolved, true);
  assert.ok(s.critique, 'a one-line critique is kept as signal');
});

test('challenger: dry-run (no transport / not armed) returns null — the loop falls back offline', async () => {
  assert.equal(await createChallenger({ generate: null, enabled: true }).challenge({}), null, 'no transport → null');
  assert.equal(await createChallenger({ generate: stub(), enabled: false }).challenge({}), null, 'not armed → null');
});

test('challenger: a call budget caps spend — Claude can never run away with the API', async () => {
  let calls = 0;
  const c = createChallenger({ generate: async (m) => { calls += 1; return stub()(m); }, enabled: true, budget: { calls: 2 } });
  await c.challenge({}); await c.evaluate({ question: 'q', answer: 'a' });   // 2 calls — the cap
  assert.equal(await c.challenge({}), null, 'the third call is refused — budget exhausted');
  assert.equal(calls, 2, 'the transport is invoked exactly twice — the cap is real');
  assert.equal(c.budget().exhausted, true);
});

test('challenger: the full cycle — Claude challenges, the system answers, Claude scores satisfaction', async () => {
  const c = createChallenger({ generate: stub(0.7), enabled: true });
  // the system under evolution answers (a local model configured by the genome — Claude does NOT
  // answer its own exam; it poses and it judges).
  const answerer = async (challenge) => `Regarding "${challenge.question}": the core reached criticality at noon.`;
  const r = await runChallengeCycle({ challenger: c, answerer, material: { text: 'The core reached criticality at noon.' } });
  assert.ok(r && r.question && r.answer && r.satisfaction, 'the cycle returns the question, the answer, and the satisfaction verdict');
  // satisfaction IS the un-authored anchor: it becomes fitness.observe's `validated`.
  assert.equal(r.outcome.validated, 0.7, 'the satisfaction score feeds fitness as the validated anchor');
  assert.equal(r.outcome.delivered, true);
});
