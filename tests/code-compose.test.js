// The generative direction — natural language → EOT → code that WORKS
// (src/organs/code/compose.js, docs/code-organ.md §the generative direction).
//
// Each case below is the whole loop, run for real:
//   1. an NL spec (the comment) is translated to an EOT blueprint (hand-authored here,
//      standing in for the model — LLMs do exactly this structured translation);
//   2. composeProgram emits an ES module, EMIT ORDER INFERRED from the leaf code the
//      composer places (through the reader's own scrubber — the mirror of how the
//      analyzer derives a call graph);
//   3. the organ READS THE OUTPUT BACK and gates it — no error-grade finding, or it is
//      not run (the `!EVA` checkpoint, in the generative direction);
//   4. the emitted module is imported and CALLED — proof it executes to the right answer.
//
// The honest boundary: EOT carries the STRUCTURE (which functions/consts exist, their
// signatures, the call graph, the emit order, the body's step order, the exports); the
// leaf expressions are the NL's content the composer places but does not invent. What
// this suite proves is that the structure is sufficient to emit correct, ordered, wired,
// self-validated, executable code — and that a structurally broken blueprint is caught
// by the organ before it ever runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { composeProgram, composeAndVerify } from '../src/organs/code/compose.js';
import { readCodebase } from '../src/organs/code/index.js';

const DIR = mkdtempSync(path.join(tmpdir(), 'eo-compose-test-'));
let seq = 0;

// emit → gate → execute. Returns the imported module (only reached if the organ passed it).
const build = async (label, blueprint) => {
  const v = composeAndVerify(blueprint, { path: `${label}.js` });
  assert.equal(v.blueprintDiagnostics.length, 0, `${label}: the blueprint is valid EOT`);
  assert.ok(v.ok, `${label}: the organ must pass its own generation, findings:\n${v.report}`);
  const file = path.join(DIR, `${label}-${seq++}.mjs`);
  writeFileSync(file, v.code);
  return { mod: await import(pathToFileURL(file).href), v };
};

// ── each NL spec → EOT → validated → executed → correct ─────────────────────────

test('NL "factorial of n" → recursive factorial that computes 120', async () => {
  const { mod } = await build('factorial', `
factorial : Function
factorial.params = "n"
factorial.expr = "n <= 1 ? 1 : n * factorial(n - 1)"
!sig factorial : exported`);
  assert.equal(mod.factorial(0), 1);
  assert.equal(mod.factorial(5), 120);
  assert.equal(mod.factorial(10), 3628800);
});

test('NL "fizzbuzz 1..n via a classify helper" → correct sequence, helper emitted first', async () => {
  const { mod, v } = await build('fizzbuzz', `
fizzbuzz : Function
fizzbuzz.params = "n"
fizzbuzz.body = "const out = []; for (let i = 1; i <= n; i++) out.push(classify(i)); return out;"
!sig fizzbuzz : exported
classify : Function
classify.params = "i"
classify.body = "if (i % 15 === 0) return 'FizzBuzz'; if (i % 3 === 0) return 'Fizz'; if (i % 5 === 0) return 'Buzz'; return String(i);"`);
  assert.deepEqual(v.order, ['classify', 'fizzbuzz'], 'the callee is emitted before its caller (inferred)');
  const r = mod.fizzbuzz(15);
  assert.equal(r[0], '1');
  assert.equal(r[2], 'Fizz');
  assert.equal(r[4], 'Buzz');
  assert.equal(r[14], 'FizzBuzz');
  assert.equal(r.length, 15);
});

test('NL "sum of the squares of the evens" → a dataflow body, steps ordered by reference', async () => {
  const { mod } = await build('sumEvenSquares', `
sumEvenSquares : Function
sumEvenSquares.params = "xs"
!sig sumEvenSquares : exported
evens : Step
evens.expr = "xs.filter(x => x % 2 === 0)"
evens -> sumEvenSquares : stepOf
squares : Step
squares.expr = "evens.map(x => x * x)"
squares -> sumEvenSquares : stepOf
total : Step
total.expr = "squares.reduce((a, b) => a + b, 0)"
total -> sumEvenSquares : stepOf
sumEvenSquares.returns = "total"`);
  assert.equal(mod.sumEvenSquares([1, 2, 3, 4, 5, 6]), 56);   // 4 + 16 + 36
  assert.equal(mod.sumEvenSquares([]), 0);
  assert.equal(mod.sumEvenSquares([1, 3, 5]), 0);
});

test('NL "a greeting computed at load" → module-const call, function ordered before it', async () => {
  const { mod, v } = await build('greeting', `
message : Def
message.expr = "greet('world')"
!sig message : exported
greet : Function
greet.params = "name"
greet.expr = "'Hello, ' + name + '!'"`);
  assert.deepEqual(v.order, ['greet', 'message'], 'the function a top-level const calls is emitted first');
  assert.equal(mod.message, 'Hello, world!');
});

test('NL "mutually recursive even/odd" → Tarjan keeps the pair, both execute', async () => {
  const { mod } = await build('parity', `
isEven : Function
isEven.params = "n"
isEven.expr = "n === 0 ? true : isOdd(n - 1)"
!sig isEven : exported
isOdd : Function
isOdd.params = "n"
isOdd.expr = "n === 0 ? false : isEven(n - 1)"
!sig isOdd : exported`);
  assert.equal(mod.isEven(10), true);
  assert.equal(mod.isEven(7), false);
  assert.equal(mod.isOdd(3), true);
});

test('NL "average = sum over count" → two functions composed, both branches run', async () => {
  const { mod, v } = await build('average', `
average : Function
average.params = "xs"
average.body = "return xs.length === 0 ? 0 : sum(xs) / xs.length;"
!sig average : exported
sum : Function
sum.params = "xs"
sum.expr = "xs.reduce((a, b) => a + b, 0)"`);
  assert.deepEqual(v.order, ['sum', 'average']);
  assert.equal(mod.average([2, 4, 6]), 4);
  assert.equal(mod.average([]), 0);
  assert.equal(mod.average([10]), 10);
});

// ── the checkpoint gates broken generation before it runs ───────────────────────

test('a blueprint that calls an undefined helper is REJECTED by the organ, not run', () => {
  const v = composeAndVerify(`
double : Function
double.params = "x"
double.body = "return triple(x);"
!sig double : exported`, { path: 'broken.js' });
  assert.equal(v.ok, false, 'the generated code must not pass its own reading');
  const unbound = v.findings.find((f) => f.law === 'unbound' && f.name === 'triple');
  assert.ok(unbound, 'the organ names the undefined helper in the generated code');
});

// ── the structure survives NL → EOT → code → read-back ──────────────────────────

test('round-trip: the emitted call graph matches the blueprint\'s intent', () => {
  const { code } = composeProgram(`
a : Function
a.params = "x"
a.body = "return b(x) + c(x);"
!sig a : exported
b : Function
b.params = "x"
b.expr = "x + 1"
c : Function
c.params = "x"
c.expr = "x * 2"`);
  // read the GENERATED code back through the analyzer — the reverse organ — and confirm
  // its structure is what the blueprint described: three functions, a depending on b and c.
  const r = readCodebase([{ path: 'g.js', text: code }], { doc: false });
  assert.equal(r.issues.filter((f) => f.severity === 'error').length, 0);
  const facts = r.factsList[0];
  assert.deepEqual(facts.decls.filter((d) => d.declKind === 'const').map((d) => d.name).sort(), ['a', 'b', 'c']);
  const callNames = new Set(facts.calls.map((e) => e.toName));
  assert.ok(callNames.has('b') && callNames.has('c'), 'a\'s calls to b and c survive the round trip');
});

test('determinism: the same blueprint composes byte-identical code', () => {
  const bp = `
inc : Function
inc.params = "n"
inc.expr = "n + 1"
!sig inc : exported`;
  assert.equal(composeProgram(bp).code, composeProgram(bp).code);
});
