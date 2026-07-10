import { test } from 'node:test';
import assert from 'node:assert/strict';

import { feltSurprise } from '../src/core/surprise.js';

// docs/response-demand.md — "Prediction is the demand meter." A bare "no" is a simple turn or one
// that requires attention depending ONLY on whether the fold predicted it. When the assistant's
// last turn opened a fork ("shall I also cover the treaty?", a yes/no, an offered choice), it holds
// an outstanding efference copy of the answer-space {yes, no, …} — so an arriving "no" is
// REAFFERENT (the system sensing the consequence of its OWN question), carrying no news: zero felt
// surprise → the reflex/continuation tier resolves it, no big model. With no such copy in the fold,
// the same "no" is EXAFFERENT — unbidden world — and its surprise clears the floor → the attentive
// tier. This is the efference copy the codebase already carries (core/surprise.feltSurprise), so the
// FORK case needs NO trained corpus. It is model-free measurement: it decides whether to spend a
// model without spending one.

// The fold's backward summary — the conversation's γ-decayed content atoms.
const fold = new Map([['essay', 3], ['dolphins', 2], ['habitat', 2], ['behavior', 1], ['conservation', 1]]);
const NO = new Map([['no', 1]]);   // the user's bare "no", as a polarity atom in the same basis

test('a "no" the fold predicted (a fork) is simple — reafferent, zero felt surprise', () => {
  // the assistant asked a yes/no last turn → its efference copy predicts the answer-space
  const r = feltSurprise(fold, NO, { predicted: new Set(['yes', 'no', 'maybe']) });
  assert.equal(r.worldBits, 0, 'a predicted "no" carries no exafferent (world) surprise');
  assert.equal(r.feltBits, 0);
  assert.equal(r.selfCount, 1, '"no" was recognised as the self-caused answer');
});

test('a "no" out of nowhere requires attention — exafferent, surprise clears the floor', () => {
  const r = feltSurprise(fold, NO, { predicted: null });   // no outstanding question in the fold
  assert.ok(r.worldBits > 0, '"no" is unbidden → real surprise');
  assert.equal(r.worldNovel, 1);
});

test('the demand meter separates them: a predicted "no" is far less surprising than an unpredicted one', () => {
  const predicted   = feltSurprise(fold, NO, { predicted: new Set(['yes', 'no']) });
  const unpredicted = feltSurprise(fold, NO, { predicted: null });
  assert.ok(
    predicted.feltBits < unpredicted.feltBits,
    `predicted "no" (${predicted.feltBits} bits) must be less surprising than unpredicted (${unpredicted.feltBits} bits)`,
  );
});

test('fail safe: with nothing predicted, the turn defaults to attention (assume attention until simplicity is measured)', () => {
  // the conservative direction — when the fold framed no fork, the arrival is treated as world and
  // escalates, never wrongly reflexed. The cost of an uncertain read is one unnecessary attentive
  // turn, the safe direction.
  const r = feltSurprise(fold, NO, {});
  assert.ok(r.worldBits > 0);
});
