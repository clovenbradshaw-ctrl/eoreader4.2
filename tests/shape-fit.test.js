// The shape-fit guarantee tests — the !EVA the watchmaker order calls for.
//
// The load-bearing claim of the join (docs/model-as-contracted-part.md) is that a fitted shape
// is CONTENT-FREE BY CONSTRUCTION: it carries zero mass on the judgment moves DEF/EVA/REC, so no
// corpus content can leak into a Ground-Truth story through the form prior. These tests fail if
// that guarantee is decorative — if masking is skipped, if smoothing leaks a floor onto a masked
// symbol, or if a grammar stops summing to one over the kept alphabet. They validate BOTH the
// committed artifact (data/shapes.json) and the fit code (tools/shape-fit.mjs) on synthetic input.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MASKED, KEPT, abstractResponse, fitShapes } from '../tools/shape-fit.mjs';
import { MOVE_ALPHABET } from '../src/perceiver/predict/index.js';
import { parseExemplars } from '../src/turn/shape.js';

const SHAPES = fileURLToPath(new URL('../data/shapes.json', import.meta.url));
const CORPUS = fileURLToPath(new URL('../data/exemplars.jsonl', import.meta.url));
// Grammars are rounded to 1e-6 per cell, so a row/marginal of ~7 kept cells sums to 1 only within
// a few × 1e-6. The guarantee that must be EXACT is zero mass on masked ops (asserted with equal);
// normalisation is "sums to ~1" under that rounding.
const APPROX = 1e-4;

// Every grammar in a shapes object — the background and each intent — as { name, grammar }.
const grammarsOf = (shapes) => [
  { name: 'background', grammar: shapes.background },
  ...Object.entries(shapes.intents).map(([name, g]) => ({ name, grammar: g })),
];

const assertZeroMassOnMasked = (name, g) => {
  for (const op of MASKED) {
    assert.equal(g.marginal[op], 0, `${name}: marginal mass on masked ${op} must be exactly 0`);
    for (const prev of MOVE_ALPHABET)
      assert.equal(g.trans[prev][op], 0, `${name}: trans ${prev}→${op} (masked) must be exactly 0`);
  }
};

const assertNormalised = (name, g) => {
  const m = MOVE_ALPHABET.reduce((s, op) => s + g.marginal[op], 0);
  assert.ok(Math.abs(m - 1) < APPROX, `${name}: marginal must sum to 1 (got ${m})`);
  for (const prev of KEPT) {
    // A kept row may be all-floor if that context never appeared; either way it sums to 1.
    const row = MOVE_ALPHABET.reduce((s, op) => s + g.trans[prev][op], 0);
    assert.ok(Math.abs(row - 1) < APPROX, `${name}: row ${prev}→· must sum to 1 (got ${row})`);
  }
};

test('MASKED and KEPT partition the alphabet', () => {
  assert.deepEqual([...MASKED].sort(), ['DEF', 'EVA', 'REC']);
  assert.deepEqual([...KEPT, ...MASKED].sort(), [...MOVE_ALPHABET].sort());
  assert.equal(new Set([...KEPT, ...MASKED]).size, MOVE_ALPHABET.length);
});

test('abstractResponse drops the judgment moves and never throws', () => {
  for (const bad of [null, undefined, '', 42, {}, '???', '   ']) {
    assert.doesNotThrow(() => abstractResponse(bad));
    assert.ok(Array.isArray(abstractResponse(bad)));
  }
  const seq = abstractResponse('Balzac wrote this in 1835. The boarding-house sets the scene.');
  for (const m of seq) assert.ok(!MASKED.includes(m.op), `masked op ${m.op} survived abstraction`);
});

test('fitShapes: a synthetic corpus yields zero-mass, normalised grammars', () => {
  const records = [
    { intent: 'a', response: 'A short fact. It sits in the header.' },
    { intent: 'a', response: 'Another crisp lookup, one line.' },
    { intent: 'b', response: 'A longer synthesis that develops a claim, connects two passages, and lands somewhere considered.' },
    { intent: 'b', response: 'It weaves the strands together and holds the tension between them.' },
  ];
  const shapes = fitShapes(records, { source: 'synthetic' });
  assert.equal(shapes.kind, 'eo-move-shapes');
  assert.deepEqual(Object.keys(shapes.intents).sort(), ['a', 'b']);
  for (const { name, grammar } of grammarsOf(shapes)) {
    assertZeroMassOnMasked(name, grammar);
    assertNormalised(name, grammar);
  }
});

test('the committed data/shapes.json carries the guarantee', () => {
  const shapes = JSON.parse(readFileSync(SHAPES, 'utf8'));
  assert.equal(shapes.kind, 'eo-move-shapes');
  assert.deepEqual(shapes.masked, ['DEF', 'EVA', 'REC']);
  assert.ok(shapes.provenance.intents >= 1);
  for (const { name, grammar } of grammarsOf(shapes)) {
    assertZeroMassOnMasked(name, grammar);
    assertNormalised(name, grammar);
  }
});

test('the committed artifact is in sync with the fit tool', () => {
  const shapes = JSON.parse(readFileSync(SHAPES, 'utf8'));
  const refit = fitShapes(parseExemplars(readFileSync(CORPUS, 'utf8')), { source: shapes.provenance.source });
  assert.equal(refit.provenance.intents, shapes.provenance.intents,
    'intent count drifted — regenerate with `node tools/shape-fit.mjs`');
  assert.equal(refit.background.n, shapes.background.n,
    'background sequence count drifted — regenerate with `node tools/shape-fit.mjs`');
  // Spot-check one grammar cell round-trips, so a stale artifact is caught, not just a resized one.
  const anyIntent = Object.keys(shapes.intents)[0];
  assert.deepEqual(refit.intents[anyIntent].marginal, shapes.intents[anyIntent].marginal,
    `${anyIntent} marginal drifted — regenerate with \`node tools/shape-fit.mjs\``);
});
