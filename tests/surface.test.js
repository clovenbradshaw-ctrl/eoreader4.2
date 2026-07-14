// The form surface — the summarizer's contract and its verifier (docs/tiny-model-form-surface.md).
// The thesis under test: "extraordinarily effective" is a property of the VERIFIER, not the model.
// So every summarization failure is a typed cube-region violation, best-of-k selects against a
// deterministic verifier, and the floor is a quotation — never a hallucination.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FORM_SURFACE_CONTRACT, CONTRACT_WIDTH, verifyForm, classifyAdditions,
  composeCoverage, extractiveFloor, formReceipt, realizeForm, hashText,
} from '../src/weave/topline/index.js';
import { isContract } from '../src/core/contract.js';
import { addedBy } from '../src/weave/topline/contain.js';

// ── the contract is the tightest in the catalog, and it is valid on the cube ─────────────────
test('the summarizer contract is DEF / Lens / Making — and valid', () => {
  assert.ok(isContract(FORM_SURFACE_CONTRACT));
  assert.equal(FORM_SURFACE_CONTRACT.valid, true, FORM_SURFACE_CONTRACT.errors.join('; '));
  assert.deepEqual(FORM_SURFACE_CONTRACT.ops, ['DEF']);
  assert.deepEqual(FORM_SURFACE_CONTRACT.terrains, ['Lens']);
  assert.deepEqual(FORM_SURFACE_CONTRACT.stances, ['Making']);
  assert.equal(FORM_SURFACE_CONTRACT.desertCell, false);
  assert.equal(CONTRACT_WIDTH, 1);   // the mask width knob: one operator admitted
});

// ── hallucination is a typed contract violation, not a vibe ───────────────────────────────────
const anchor = 'The council declined to fund the youth program. The vote was 4 to 3.';

test('an invented name is an INS violation (a minted referent)', () => {
  const out = 'The council, led by Mayor Ruiz, declined to fund the youth program.';
  const v = verifyForm(out, { anchor });
  assert.equal(v.ok, false);
  const ins = v.violations.find((x) => x.op === 'INS');
  assert.ok(ins, 'a new proper noun is an INS');
  assert.ok(ins.tokens.includes('ruiz') || ins.tokens.includes('mayor'));
});

test('an invented number is an INS violation', () => {
  const v = verifyForm('The vote was 5 to 3.', { anchor });
  assert.equal(v.ok, false);
  assert.equal(v.checks.numeric.ok, false);
  assert.ok(v.checks.numeric.numbers.includes('5'));
});

test('a mood word is a terrain violation — fired at Atmosphere in an empty room', () => {
  const v = verifyForm('Shockingly, the council declined to fund the youth program.', { anchor });
  assert.equal(v.ok, false);
  const mood = v.violations.find((x) => x.kind === 'mood');
  assert.ok(mood);
  assert.equal(mood.terrain, 'Atmosphere');
  assert.equal(mood.face, 'Site');
});

test('a thesis is a SYN violation — a whole the kernel did not compose', () => {
  const v = verifyForm('Overall the vote suggests a pattern of neglect.', { anchor });
  const syn = v.violations.find((x) => x.op === 'SYN');
  assert.ok(syn, 'overall/suggests/pattern are SYN');
});

test('a flipped polarity is an EVA violation — an originated judgment', () => {
  const v = verifyForm('The council did not decline to fund the youth program.', { anchor });
  assert.equal(v.ok, false);
  const eva = v.violations.find((x) => x.op === 'EVA' && x.kind === 'polarity-flip');
  assert.ok(eva, "'not' originates a judgment the tape never carried");
});

test('a hedge that implies a source is a terrain violation', () => {
  const v = verifyForm('The council reportedly declined to fund the youth program.', { anchor });
  const hedge = v.violations.find((x) => x.kind === 'hedge');
  assert.ok(hedge);
  assert.equal(hedge.terrain, 'Atmosphere');
  assert.equal(v.checks.budget.hedged.includes('reportedly'), true);
});

test('pure re-arrangement over the anchor passes clean, with no violations', () => {
  const v = verifyForm('The council declined to fund the youth program; the vote was 4 to 3.', { anchor });
  assert.equal(v.ok, true);
  assert.equal(v.verdict, 'pass');
  assert.equal(v.violations.length, 0);
});

test('classifyAdditions groups by kind and dedupes tokens', () => {
  const added = addedBy('Mayor Ruiz reportedly, reportedly declined.', 'The council declined.');
  const groups = classifyAdditions(added);
  const hedge = groups.find((g) => g.kind === 'hedge');
  assert.ok(hedge && hedge.tokens.length === 1, 'reportedly appears once after dedupe');
  assert.ok(groups.find((g) => g.op === 'INS'));
});

// ── coverage: every holon represented; composes pessimistically ──────────────────────────────
test('coverage flags a silently dropped holon', () => {
  const holons = [
    { key: 'a', tokens: ['council', 'declined', 'fund'] },
    { key: 'b', tokens: ['vote', '4', '3'] },
  ];
  const dropped = verifyForm('The council declined to fund the program.', { anchor, holons });
  assert.equal(dropped.checks.coverage.ok, false);
  assert.deepEqual(dropped.checks.coverage.missing, ['b']);
  const whole = verifyForm('The council declined to fund it; the vote was 4 to 3.', { anchor, holons });
  assert.equal(whole.checks.coverage.ok, true);
  assert.equal(whole.checks.coverage.ratio, 1);
});

test('composeCoverage is the pessimistic envelope — the min ratio, the union of losses', () => {
  const composed = composeCoverage([
    { ratio: 1, missing: [] },
    { ratio: 0.5, missing: ['b'] },
    { ratio: 0.8, missing: ['c'] },
  ]);
  assert.equal(composed.ratio, 0.5);            // what a section drops, the document cannot recover
  assert.deepEqual([...composed.missing].sort(), ['b', 'c']);
  assert.equal(composeCoverage([]).ratio, 1);   // nothing below → nothing lost
});

// ── the extractive floor: failure is a quotation, never a hallucination ───────────────────────
test('the floor emits the anchored span itself, marked extractive', () => {
  const floor = extractiveFloor({ holons: [{ text: 'The council declined to fund the program.', }], cite: [7] });
  assert.equal(floor.mode, 'extractive');
  assert.equal(floor.extractive, true);
  assert.equal(floor.text, 'The council declined to fund the program.');
  assert.deepEqual(floor.cite, [7]);
});

// ── best-of-k against the verifier, then the floor ────────────────────────────────────────────
test('realizeForm takes the first passing sample and receipts it', async () => {
  // sample 0 fabricates a name (rejected), sample 1 is clean (accepted).
  const candidates = [
    'Mayor Ruiz declined to fund the youth program.',   // INS — rejected
    'The council declined to fund the youth program.',  // clean — accepted
  ];
  const out = await realizeForm({
    phrase: async (_seed, i) => candidates[i] || '',
    anchor, samples: 2, revisions: 0, model: null, oneSentence: true,
  });
  assert.equal(out.mode, 'realized');
  assert.equal(out.sampleIndex, 1);
  assert.equal(out.verdict.ok, true);
  assert.equal(out.receipt.verdict, 'pass');
  assert.equal(out.receipt.contractWidth, 1);
  assert.ok(out.receipt.maskWidth > 0);
});

test('realizeForm falls to the extractive floor when nothing passes', async () => {
  const out = await realizeForm({
    phrase: async () => 'Mayor Ruiz reportedly declined, shockingly.',   // always dirty
    anchor, holons: [{ text: 'The council declined to fund the youth program.' }],
    samples: 3, revisions: 1, model: null,
  });
  assert.equal(out.mode, 'extractive');
  assert.equal(out.extractive, true);
  assert.equal(out.text, 'The council declined to fund the youth program.');
  assert.equal(out.receipt.mode, 'extractive');
  assert.ok(out.rejected, 'it records what the last dirty sample tried');
});

test('realizeForm with no model goes straight to the floor', async () => {
  const out = await realizeForm({ anchor, model: null });
  assert.equal(out.mode, 'extractive');
  assert.ok(out.text.length > 0);
});

// ── the replay receipt is deterministic — replayable to the token ─────────────────────────────
test('formReceipt is pure and stable: same inputs, same hashes', () => {
  const v = verifyForm('The council declined.', { anchor });
  const a = formReceipt({ output: 'The council declined.', anchor, system: 's', seed: 3, sampleIndex: 1, verdict: v });
  const b = formReceipt({ output: 'The council declined.', anchor, system: 's', seed: 3, sampleIndex: 1, verdict: v });
  assert.deepEqual(a, b);
  assert.equal(a.seed, 3);
  assert.equal(a.sampleIndex, 1);
  assert.equal(a.contract, 'DEF(Lens → Lens, Making) — the summarizer as a form surface');
  assert.match(a.promptHash, /^[0-9a-f]{8}$/);
  assert.match(a.outputHash, /^[0-9a-f]{8}$/);
});

test('hashText is deterministic and dependency-free', () => {
  assert.equal(hashText('abc'), hashText('abc'));
  assert.notEqual(hashText('abc'), hashText('abd'));
  assert.match(hashText(''), /^[0-9a-f]{8}$/);
});
