// The code-holon perceiver (src/perceiver/code/, docs/code-holons.md) — code as
// one more omnimodal source. The fixture battery pinned here is the proposal's
// own (docs/code-holons.md §11): each proves the exact expectation stated, not
// a loosened version of it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readCodeChange, admitFacts } from '../src/perceiver/code/index.js';
import { extractFacts } from '../src/organs/code/facts.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const change = (oldText, newText, filePath = 'src/a.js') =>
  readCodeChange([{ path: filePath, text: oldText }], [{ path: filePath, text: newText }]);

const entryFor = (result, filePath, name) =>
  result.changes[filePath]?.find(({ entry }) => (entry.new ?? entry.old)?.anchor?.declaredName === name);

const readingFor = (result, filePath, name) => entryFor(result, filePath, name)?.reading;

// ── fixture 1 — whitespace-only edit ────────────────────────────────────────

test('fixture 1 — whitespace-only edit: equivalent at the mechanical tier', () => {
  const before = 'export function greet(name) {\n  return "hi " + name;\n}\n';
  const after = 'export function greet(name) {\n\n  return "hi " + name;\n\n}\n';
  const r = change(before, after);
  const reading = readingFor(r, 'src/a.js', 'greet');
  assert.equal(reading.structuralChange, 'modified');
  assert.equal(reading.semanticVerdict, 'equivalent');
  assert.equal(reading.equivalenceTier, 'mechanical');
  assert.equal(entryFor(r, 'src/a.js', 'greet').entry.old.witness.textHash === entryFor(r, 'src/a.js', 'greet').entry.new.witness.textHash, false);
});

// ── fixture 2 — comment-only edit ───────────────────────────────────────────

test('fixture 2 — comment-only edit: equivalent at the mechanical tier', () => {
  const before = 'export function greet(name) {\n  return "hi " + name;\n}\n';
  const after = 'export function greet(name) {\n  // say hi\n  return "hi " + name;\n}\n';
  const reading = readingFor(change(before, after), 'src/a.js', 'greet');
  assert.equal(reading.semanticVerdict, 'equivalent');
  assert.equal(reading.equivalenceTier, 'mechanical');
});

// ── fixture 3 — local variable rename ───────────────────────────────────────

test('fixture 3 — local variable rename: anchor preserved, equivalent at the local tier', () => {
  const before = 'export function total(arr) {\n  let sum = 0;\n  for (const x of arr) { sum += x; }\n  return sum;\n}\n';
  const after = before.replace(/\bsum\b/g, 'accum');
  const r = change(before, after);
  const entry = entryFor(r, 'src/a.js', 'total').entry;
  const reading = readingFor(r, 'src/a.js', 'total');
  assert.equal(entry.category, 'modified');                 // the function's OWN anchor is untouched
  assert.equal(entry.old.anchor.declaredName, entry.new.anchor.declaredName);
  assert.equal(reading.semanticVerdict, 'equivalent');
  assert.equal(reading.equivalenceTier, 'local');
});

// ── fixture 4 — public function rename ──────────────────────────────────────

test('fixture 4 — public function rename: contract changed, no alias', () => {
  const before = 'export function loopCheck(arr) {\n  return arr.length;\n}\n';
  const after = before.replace(/\bloopCheck\b/g, 'loopCount');
  const r = change(before, after);
  const entries = r.changes['src/a.js'].filter(({ entry }) => (entry.new ?? entry.old).kind === 'function');
  assert.equal(entries.length, 1);
  const { entry, reading } = entries[0];
  assert.equal(entry.category, 'renamed');
  assert.equal(entry.exported, true);
  assert.equal(reading.semanticVerdict, 'changed');
});

// ── fixture 5 — literal change ──────────────────────────────────────────────

test('fixture 5 — literal change: a real semantic change', () => {
  const before = 'export function timeoutMs() {\n  return 1000;\n}\n';
  const after = 'export function timeoutMs() {\n  return 2000;\n}\n';
  const r = change(before, after);
  const entry = entryFor(r, 'src/a.js', 'timeoutMs').entry;
  const reading = readingFor(r, 'src/a.js', 'timeoutMs');
  assert.notEqual(entry.old.fingerprint.literalProfileHash, entry.new.fingerprint.literalProfileHash);
  assert.equal(reading.semanticVerdict, 'changed');
});

// ── fixture 6 — <= to < ─────────────────────────────────────────────────────

test('fixture 6 — a one-character operator edit is changed despite a tiny syntactic delta', () => {
  const before = 'export function loopCheck(arr) {\n  let t = 0;\n  for (let i = 0; i <= arr.length; i++) { t += arr[i]; }\n  return t;\n}\n';
  const after = before.replace('i <= arr.length', 'i < arr.length');
  const r = change(before, after);
  const entry = entryFor(r, 'src/a.js', 'loopCheck').entry;
  const reading = readingFor(r, 'src/a.js', 'loopCheck');
  assert.notEqual(entry.old.fingerprint.literalProfileHash, entry.new.fingerprint.literalProfileHash);
  assert.equal(entry.old.fingerprint.controlFlowHash, entry.new.fingerprint.controlFlowHash);
  assert.equal(entry.old.fingerprint.referenceShapeHash, entry.new.fingerprint.referenceShapeHash);
  assert.equal(reading.semanticVerdict, 'changed');
});

// ── fixture 7 — function moved to another file ──────────────────────────────

test('fixture 7 — a function moved to another file keeps its identity across files', () => {
  const helperSrc = 'export function helper(x) {\n  return x * 2;\n}\n';
  const useSrc = 'export function useIt(x) {\n  return helper(x) + 1;\n}\n';
  const oldFiles = [
    { path: 'src/a.js', text: `${helperSrc}\n${useSrc}` },
    { path: 'src/b.js', text: '' },
  ];
  const newFiles = [
    { path: 'src/a.js', text: `import { helper } from './b.js';\n\n${useSrc}` },
    { path: 'src/b.js', text: helperSrc },
  ];
  const r = readCodeChange(oldFiles, newFiles);
  const aEntry = entryFor(r, 'src/a.js', 'helper')?.entry;
  const bEntry = entryFor(r, 'src/b.js', 'helper')?.entry;
  assert.equal(aEntry.category, 'moved-file');
  assert.equal(bEntry.category, 'moved-file');
  assert.equal(aEntry.movedToPath, 'src/b.js');
  assert.equal(bEntry.movedFromPath, 'src/a.js');
});

// ── fixture 8 — extract-function refactor ───────────────────────────────────

test('fixture 8 — extract-function refactor: structural change, never asserted equivalent', () => {
  const before = 'export function total(arr) {\n  let sum = 0;\n  for (const x of arr) {\n    if (x > 0) { sum += x; }\n  }\n  return sum;\n}\n';
  const after = 'function isPositive(x) {\n  return x > 0;\n}\n\nexport function total(arr) {\n  let sum = 0;\n  for (const x of arr) {\n    if (isPositive(x)) { sum += x; }\n  }\n  return sum;\n}\n';
  const r = change(before, after);
  const totalReading = readingFor(r, 'src/a.js', 'total');
  assert.notEqual(totalReading.semanticVerdict, 'equivalent');
  const added = entryFor(r, 'src/a.js', 'isPositive');
  assert.equal(added.entry.category, 'added');
});

// ── fixture 9 — removed export ──────────────────────────────────────────────

test('fixture 9 — a removed export severs the contract; importers go stale unconditionally', () => {
  const aBefore = 'export function widget() {\n  return 1;\n}\n';
  const aAfter = '// widget removed\n';
  const bSrc = "import { widget } from './a.js';\nexport function run() {\n  return widget();\n}\n";
  const r = readCodeChange(
    [{ path: 'src/a.js', text: aBefore }, { path: 'src/b.js', text: bSrc }],
    [{ path: 'src/a.js', text: aAfter }, { path: 'src/b.js', text: bSrc }],
  );
  const removed = entryFor(r, 'src/a.js', 'widget').entry;
  assert.equal(removed.category, 'removed');
  const prop = r.propagation.find((p) => p.holonId === removed.old.id);
  assert.ok(prop, 'propagation entry for the removed export');
  assert.equal(prop.contractChanged, true);
  assert.equal(prop.typeConsumers.length, 1);
  assert.equal(prop.typeConsumers[0].path, 'src/b.js');
});

// ── fixture 10 — syntax error mid-edit ──────────────────────────────────────

test('fixture 10 — a syntax error retains the prior holons as stale, with a typed parse-gap NUL', () => {
  const before = 'export function safe(x) {\n  if (x) {\n    return 1;\n  }\n  return 0;\n}\n';
  const after = 'export function safe(x) {\n  if (x) {\n    return 1;\n  return 0;\n}\n';   // missing closing brace for `if`
  const r = change(before, after);
  const nulls = r.nulls['src/a.js'];
  assert.ok(nulls.some((n) => n.reason === 'parse-gap'));
  const { entry, reading } = entryFor(r, 'src/a.js', 'safe');
  assert.equal(entry.category, 'same');            // retained verbatim from the last successful read
  assert.equal(reading.evaluationState, 'stale');
});

// ── fixture 11 — dynamic property lookup ────────────────────────────────────

test('fixture 11 — a dynamic property lookup is a typed NUL; an otherwise-equivalent reading becomes unknown', () => {
  const before = 'export function lookup(obj, key) {\n  return obj[getKey(key)];\n}\nfunction getKey(k) {\n  return k;\n}\n';
  const after = 'export function lookup(obj, key) {\n\n  return obj[getKey(key)];\n}\nfunction getKey(k) {\n  return k;\n}\n';
  const r = change(before, after);
  const nulls = r.nulls['src/a.js'];
  assert.ok(nulls.some((n) => n.reason === 'dynamic-binding'));
  const reading = readingFor(r, 'src/a.js', 'lookup');
  assert.equal(reading.semanticVerdict, 'unknown');
});

// ── fixture 12 — missing dependency ─────────────────────────────────────────

test('fixture 12 — an unresolved import is a typed missing-dependency NUL', () => {
  const before = 'export function run() {\n  return 1;\n}\n';
  const after = "import { helper } from './missing.js';\nexport function run() {\n  return helper();\n}\n";
  const r = change(before, after);
  const nulls = r.nulls['src/a.js'];
  const gap = nulls.find((n) => n.reason === 'missing-dependency');
  assert.ok(gap);
  assert.equal(gap.spec, './missing.js');
});

// ── fixture 13 — analyzer witness overrides an apparent-tier equivalence ───

test('fixture 13 — an analyzer witness disagreeing with an apparent-tier equivalence contests it', () => {
  const before = 'export function calc(a, b) {\n  return a + b;\n}\n';
  const after = 'export function calc(a, b) {\n  return (a + b);\n}\n';   // redundant parens — no op/literal/reference/control change
  const r0 = change(before, after);
  const reading0 = readingFor(r0, 'src/a.js', 'calc');
  assert.equal(reading0.semanticVerdict, 'equivalent');
  assert.equal(reading0.equivalenceTier, 'apparent');

  const holon = entryFor(r0, 'src/a.js', 'calc').entry.new;
  const witnesses = [{ analyzer: 'golden-test', version: '1', holonId: holon.id, verdict: 'contested', diagnostic: 'golden output differs' }];
  const r1 = readCodeChange([{ path: 'src/a.js', text: before }], [{ path: 'src/a.js', text: after }], { analysisWitnesses: witnesses });
  const reading1 = readingFor(r1, 'src/a.js', 'calc');
  assert.equal(reading1.semanticVerdict, 'contested');
  assert.match(reading1.grounds, /golden-test/);
});

// ── fixture 14 — reverted edit ──────────────────────────────────────────────

test('fixture 14 — a reverted edit recovers identity; both edits\' events accumulate independently', () => {
  const A = 'export function calc(a, b) {\n  return a + b;\n}\n';
  const B = 'export function calc(a, b) {\n  return a - b;\n}\n';
  const r1 = change(A, B);     // A -> B
  const r2 = change(B, A);     // B -> A, the revert

  assert.equal(readingFor(r1, 'src/a.js', 'calc').semanticVerdict, 'changed');
  assert.equal(readingFor(r2, 'src/a.js', 'calc').semanticVerdict, 'changed');

  const factsA = extractFacts(A, { path: 'src/a.js' });
  const originalFingerprint = admitFacts(factsA, A, { path: 'src/a.js' }).find((h) => h.anchor.declaredName === 'calc').fingerprint;
  const revertedFingerprint = entryFor(r2, 'src/a.js', 'calc').entry.new.fingerprint;
  assert.deepEqual(revertedFingerprint, originalFingerprint);

  assert.ok(r1.events.some((e) => e.op === 'EVA'));
  assert.ok(r2.events.some((e) => e.op === 'EVA'));
  const combined = [...r1.events, ...r2.events];
  assert.equal(combined.length, r1.events.length + r2.events.length);
});

// ── self-read: the perceiver reads its own body without throwing ───────────

test('self-read: comparing a real source file to itself yields zero changes', () => {
  const filePath = 'src/perceiver/code/fingerprint.js';
  const text = readFileSync(path.join(ROOT, filePath), 'utf8');
  const r = readCodeChange([{ path: filePath, text }], [{ path: filePath, text }]);
  assert.equal(r.report, '');
  assert.ok(r.newHolons[filePath].length > 1, 'admits more than just the module holon');
  for (const { entry } of r.changes[filePath]) assert.equal(entry.category, 'same');
});
