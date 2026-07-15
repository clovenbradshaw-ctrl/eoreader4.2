import { test } from 'node:test';
import assert from 'node:assert/strict';

import { projectFold, clearFoldMemo, outstandingQuestion, answersAwaited } from '../src/frame/index.js';

// docs/response-demand.md — the fold carries the assistant's outstanding question-copy, so the next
// user turn is scored against it: a polar "no"/"yes" or a choice answer ("the animal") is reafferent
// — the answer the question predicted — and resolves as a cheap CONTINUATION; a substantive redirect
// is exafferent → attention. Corpus-free (a fork predicts its own answers), model-free (feltSurprise).
//
// The memo is keyed on (frameSig, settled-turn count), so two distinct fixtures with the same count
// collide; clearFoldMemo() before each projection keeps the replays independent.
const fold = (events) => { clearFoldMemo(); return projectFold(events); };

test('outstandingQuestion classifies polar / choice / open, and nothing on a declarative turn', () => {
  const polar = outstandingQuestion([{ role: 'asst', text: 'Dolphins are social. Shall I also cover their conservation status?' }]);
  assert.equal(polar.kind, 'polar');
  const choice = outstandingQuestion([{ role: 'asst', text: 'Which dolphins do you mean — the animal or the team?' }]);
  assert.equal(choice.kind, 'choice');
  assert.ok(choice.options.includes('animal') && choice.options.includes('team'));
  const open = outstandingQuestion([{ role: 'asst', text: 'What would you like to know?' }]);
  assert.equal(open.kind, 'open');
  assert.equal(outstandingQuestion([{ role: 'asst', text: 'Dolphins are marine mammals.', stance: 'ground' }]), null);
  // a user turn already followed the question → nothing outstanding
  assert.equal(outstandingQuestion([{ role: 'asst', text: 'Shall I go on?' }, { role: 'user', text: 'no' }]), null);
});

test('a polar "no" the fold predicted is a reafferent continuation, polarity recovered', () => {
  const f = fold([
    { role: 'user', text: 'tell me about the dolphins' },
    { role: 'asst', text: 'Dolphins are social. Shall I also cover their conservation status?' },
  ]);
  assert.equal(f.awaiting.kind, 'polar');
  const r = answersAwaited(f, 'no');
  assert.equal(r.answered, true);
  assert.equal(r.demand, 'continuation');
  assert.equal(r.polarity, 'no');
  assert.equal(r.worldBits, 0);
});

test('a polar "yes please" resolves to yes', () => {
  const f = fold([
    { role: 'user', text: 'tell me about the dolphins' },
    { role: 'asst', text: 'Shall I also cover their conservation status?' },
  ]);
  assert.equal(answersAwaited(f, 'yes please').polarity, 'yes');
});

test('a "no" that redirects (adds world content) needs attention, not a reflex', () => {
  const f = fold([
    { role: 'user', text: 'tell me about the dolphins' },
    { role: 'asst', text: 'Shall I also cover their conservation status?' },
  ]);
  const r = answersAwaited(f, 'no, tell me about whales instead');
  assert.equal(r.answered, false);
  assert.equal(r.demand, 'attention');
  assert.ok(r.worldBits > 0, 'the redirect carries exafferent surprise');
});

test('the dolphins case: a choice answer ("the animal") resolves to the chosen option', () => {
  const f = fold([
    { role: 'user', text: 'write me an essay on dolphins' },
    { role: 'asst', text: 'Which dolphins do you mean — the animal or the Miami Dolphins team?' },
  ]);
  assert.equal(f.awaiting.kind, 'choice');
  const animal = answersAwaited(f, 'the animal');
  assert.equal(animal.answered, true);
  assert.equal(animal.demand, 'continuation');
  assert.deepEqual(animal.choice, ['animal']);

  const team = answersAwaited(f, 'the team');
  assert.equal(team.answered, true);
  assert.deepEqual(team.choice, ['team']);

  // a fresh redirect after the choice question is not answering it → attention
  assert.equal(answersAwaited(f, 'actually, tell me about whales').demand, 'attention');
});

test('fail safe: no outstanding question → attention (assume attention until simplicity is measured)', () => {
  const f = fold([
    { role: 'user', text: 'hi' },
    { role: 'asst', text: 'Dolphins are marine mammals found in every ocean.', stance: 'ground' },
  ]);
  assert.equal(f.awaiting, null);
  const r = answersAwaited(f, 'no');
  assert.equal(r.answered, false);
  assert.equal(r.demand, 'attention');
});
