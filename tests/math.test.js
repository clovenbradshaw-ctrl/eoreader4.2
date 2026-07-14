import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractExpression, isMathQuery, nlToExpression, evalExpression, evaluateMath,
  answerMathSync, answerMathAsync, traceExpression, formatNumber,
} from '../src/enactor/answer/index.js';

// ── the gate ────────────────────────────────────────────────────────────────
test('extractExpression strips polite/imperative wrappers down to the bare expression', () => {
  assert.equal(extractExpression('what is 2 + 2?'), '2 + 2');
  assert.equal(extractExpression("what's 3*4"), '3*4');
  assert.equal(extractExpression('calculate (1+2)^3'), '(1+2)^3');
  assert.equal(extractExpression('evaluate sqrt(16)'), 'sqrt(16)');
  assert.equal(extractExpression('how much is 10 / 4'), '10 / 4');
  assert.equal(extractExpression('  7 % 3 = '), '7 % 3');
});

test('the gate rejects anything that is not a pure math expression', () => {
  assert.equal(extractExpression('what are the 2 widgets?'), null);   // real words
  assert.equal(extractExpression('when was this written?'), null);    // no number
  assert.equal(extractExpression('42'), null);                        // bare number, no operation
  assert.equal(extractExpression('pi'), null);                        // lone constant, no operation
  assert.equal(extractExpression('log of the chapter'), null);        // unknown words
  assert.equal(extractExpression("2'nd place"), null);                // stray punctuation
  assert.equal(extractExpression(''), null);
  assert.equal(isMathQuery('2 + 2'), true);
  assert.equal(isMathQuery('hello there'), false);
});

// ── the fluent (natural-language) surface ─────────────────────────────────────
// A number-only natural phrasing is reduced to a bare expression the gate accepts, but a
// residual real word still makes the whole thing not-math (nlToExpression never relaxes the gate).
test('nlToExpression reduces magnitudes, percentages, and spelled operators', () => {
  assert.equal(extractExpression(nlToExpression('20% of 410k')), '(20/100)* 410000');
  assert.equal(extractExpression(nlToExpression('half of 500 plus 12')), '0.5* 500 + 12');
  assert.equal(extractExpression(nlToExpression('1.5m divided by 3')), '1500000 / 3');
  assert.equal(evalExpression(nlToExpression('20% of 410k')), 82000);
  assert.equal(evalExpression(nlToExpression('half of 500 plus 12')), 262);
  // a real word survives the rewrite → still not math (the table/grounded path owns it)
  assert.equal(isMathQuery('15% of 3 sisters'), false);
  assert.equal(isMathQuery('how many accounts are green'), false);
});

// ── the offline evaluator ─────────────────────────────────────────────────────
test('evalExpression computes arithmetic with correct precedence and associativity', () => {
  assert.equal(evalExpression('2 + 2'), 4);
  assert.equal(evalExpression('2 + 3 * 4'), 14);
  assert.equal(evalExpression('(2 + 3) * 4'), 20);
  assert.equal(evalExpression('2 ^ 3 ^ 2'), 512);        // right-associative: 2^(3^2)
  assert.equal(evalExpression('-3 ^ 2'), -9);            // unary lower than power: -(3^2)
  assert.equal(evalExpression('2 ^ -3'), 0.125);         // unary exponent
  assert.equal(evalExpression('10 % 3'), 1);
  assert.equal(evalExpression('5!'), 120);
  assert.equal(evalExpression('3 * (4 + 1)!'), 360);
});

test('evalExpression knows functions and constants', () => {
  assert.equal(evalExpression('sqrt(144)'), 12);
  assert.equal(evalExpression('max(3, 7, 2)'), 7);
  assert.equal(evalExpression('min(3, 7, 2)'), 2);
  assert.equal(evalExpression('pow(2, 10)'), 1024);
  assert.equal(evalExpression('abs(-9)'), 9);
  assert.equal(evalExpression('gcd(12, 18)'), 6);
  assert.ok(Math.abs(evalExpression('2 * pi') - 2 * Math.PI) < 1e-9);
});

test('evalExpression returns null on malformed or non-numeric input', () => {
  assert.equal(evalExpression('2 +'), null);
  assert.equal(evalExpression('(2 + 3'), null);
  assert.equal(evalExpression('sqrt(-1)'), null);        // NaN → null
  assert.equal(evalExpression('2 ## 3'), null);
});

// ── formatting ────────────────────────────────────────────────────────────────
test('formatNumber prints integers whole and trims float noise', () => {
  assert.equal(formatNumber(4), '4');
  assert.equal(formatNumber(0.1 + 0.2), '0.3');          // not 0.30000000000000004
  assert.equal(formatNumber(1 / 3), '0.333333333333');
});

// ── the auditable working (traceExpression) ────────────────────────────────────
test('traceExpression folds the expression into ordered, cited steps', () => {
  const tr = traceExpression('sqrt(16)*3');
  assert.equal(tr.result, 12);
  assert.equal(tr.resultText, '12');
  assert.deepEqual(tr.steps.map((s) => s.text), ['sqrt(16) = 4', '4 × 3 = 12']);
  // a single-operation expression records exactly one step
  assert.equal(traceExpression('2 + 2').steps.length, 1);
  // a malformed expression carries no record (the answer still stands)
  assert.equal(traceExpression('2 +'), null);
});

// ── the answer shape (now carrying the working record) ─────────────────────────
test('answerMathSync returns the mechanical math route with its working record, or null', () => {
  const a = answerMathSync('what is 2 + 2?');
  assert.equal(a.route, 'math');
  assert.equal(a.text, '2 + 2 = 4');
  assert.equal(a.answer, '2 + 2 = 4');
  assert.deepEqual(a.sources, []);
  assert.equal(a.record.resultText, '4');            // the auditable working rides along
  assert.equal(answerMathSync('who is Gregor?'), null);
});

test('the answer record never disagrees with the figure it explains', () => {
  const a = answerMathSync('sqrt(16) * 3');
  assert.equal(a.text, 'sqrt(16) * 3 = 12');
  assert.equal(a.record.resultText, a.text.split('=').pop().trim());
});

test('answerMathAsync falls back to the built-in evaluator when mathjs is unavailable (Node)', async () => {
  // No network in the test runner → loadMathjs caches null → the built-in evaluator answers.
  const a = await answerMathAsync('calculate sqrt(16) + 1');
  assert.equal(a.route, 'math');
  assert.equal(a.text, 'sqrt(16) + 1 = 5');
  assert.equal(a.answer, 'sqrt(16) + 1 = 5');
  assert.deepEqual(a.sources, []);
  assert.equal(a.record.resultText, '5');
  // the fluent surface flows through the async answerer too
  const pct = await answerMathAsync('20% of 410k');
  assert.equal(pct.text, '(20/100)* 410000 = 82000');
  assert.equal(await answerMathAsync('tell me a story'), null);
  assert.equal(await evaluateMath('6 * 7'), 42);
});
