// The dispatcher — a surf of the graph parsed into discrete pattern-quests
// (docs/tiny-model-form-surface.md, "the dispatcher decides where to look, not what's true").
// The thesis under test: parsing a surf into quests is graph algebra, not language — the quest
// count falls out of the spectrum, and the local model is reached for ONLY when the geometry can't
// discretize the surf (the DEF→EVA→REC loop).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dispatch, discretize, findable, pullApart } from '../src/surfer/fold/index.js';

// A surf that discretizes on its own: three referents, two recurring bonds, a resolved spectrum.
const richSurf = {
  referents: [
    { id: 'gregor', label: 'Gregor', weight: 5 },
    { id: 'grete', label: 'Grete', weight: 4 },
    { id: 'father', label: 'the father', weight: 3 },
  ],
  bonds: [
    { src: 'gregor', tgt: 'grete', via: 'depends', w: 0.9 },
    { src: 'gregor', tgt: 'grete', via: 'depending', w: 0.8 },   // same pair+stem → one relation quest
    { src: 'father', tgt: 'gregor', via: 'drove', w: 0.7 },
  ],
  spectrum: [0.6, 0.3, 0.08, 0.02],   // too few points to resolve — findability rests on the bonds
};

// ── DEF — discretize off the graph's own geometry, no model ──────────────────────────────────
test('discretize cuts the surf into referent, relation, and reading quests — purely', () => {
  const { quests, readings } = discretize(richSurf);
  const kinds = quests.map((q) => q.kind);
  assert.equal(kinds.filter((k) => k === 'referent').length, 3);
  // the two Gregor→Grete bonds share a pair+stem → a SINGLE relation quest carrying the group
  const rel = quests.filter((q) => q.kind === 'relation');
  assert.equal(rel.length, 2, 'gregor|grete and father|gregor — two distinct relation quests');
  const depend = rel.find((q) => q.members.includes('gregor') && q.members.includes('grete'));
  assert.ok(depend);
  assert.ok(depend.salience > 1.5, 'the recurring bond accumulates its group mass');
  // a four-point toy spectrum is too thin for the conservative resolver → no reading quests
  assert.equal(readings.abstain, true);
  assert.ok(!quests.some((q) => q.kind === 'reading'));
});

test('the reading-quest count falls out of the spectrum — not a constant', () => {
  // a real spectrum with a clear elbow resolves; the number of reading quests IS the resolved k.
  const surf = { referents: [{ id: 'a', label: 'A' }], spectrum: [0.9, 0.85, 0.8, 0.05, 0.04, 0.03, 0.02, 0.02, 0.01, 0.01] };
  const { quests, readings } = discretize(surf);
  assert.equal(readings.abstain, false);
  const reads = quests.filter((q) => q.kind === 'reading');
  assert.equal(reads.length, readings.k);          // the count is the spectrum's, not chosen
  assert.ok(readings.k >= 2);
});

test('discretize is a pure function of the surf — same surf, same quests', () => {
  const a = discretize(richSurf);
  const b = discretize(richSurf);
  assert.deepEqual(a.quests, b.quests);
});

test('an empty surf yields no quests and no reading (nothing to discretize)', () => {
  const { quests, readings } = discretize({});
  assert.equal(quests.length, 0);
  assert.equal(readings.abstain, true);
});

// ── EVA — is the discretization discrete enough to be findable? ──────────────────────────────
test('a rich surf is findable — it resolves and its quests stand apart', () => {
  const eva = findable(discretize(richSurf));
  assert.equal(eva.ok, true);
  assert.ok(eva.distinct >= 2);
  assert.equal(eva.structured, true);   // the bonds give it structure to hunt
});

test('a blob surf — one referent, no bonds, flat spectrum — is NOT findable', () => {
  const blob = { referents: [{ id: 'x', label: 'X' }], bonds: [], spectrum: [0.5, 0.49, 0.5] };
  const eva = findable(discretize(blob));
  assert.equal(eva.ok, false, 'one undifferentiated thing does not discretize');
});

// ── the DEF→EVA→REC loop ─────────────────────────────────────────────────────────────────────
test('dispatch on a rich surf uses the geometry alone — method def, no model touched', async () => {
  let called = false;
  const model = { phrase: async () => { called = true; return ''; } };
  const out = await dispatch(richSurf, { model });
  assert.equal(out.method, 'def');
  assert.equal(called, false, 'a findable surf never reaches for the model');
  assert.ok(out.quests.length >= 2);
});

test('dispatch falls to REC when the geometry cannot discretize, and grounds the model threads', async () => {
  // a surf with content the flat geometry cannot separate: several referents, no bonds, flat spectrum.
  const blur = {
    referents: [{ id: 'gregor', label: 'Gregor' }, { id: 'grete', label: 'Grete' }, { id: 'money', label: 'money' }],
    bonds: [],
    spectrum: [0.34, 0.33, 0.33],
  };
  // the model proposes threads; one names a referent (grounded), one is pure invention (dropped).
  const model = { phrase: async () => 'Gregor and money\nThe stranger from Prague' };
  const out = await dispatch(blur, { model });
  // only the grounded thread(s) survive; "stranger from Prague" attaches to nothing in the surf.
  const labels = out.quests.map((q) => q.label);
  assert.ok(labels.some((l) => /gregor|money/i.test(l)));
  assert.ok(!labels.some((l) => /prague/i.test(l)), 'an ungrounded angle is dropped');
});

test('dispatch abstains to one coarse quest when the geometry fails and there is no model', async () => {
  const blur = { referents: [{ id: 'gregor', label: 'Gregor' }], bonds: [], spectrum: [0.5, 0.5] };
  const out = await dispatch(blur, { model: null });
  assert.equal(out.method, 'abstain');
  assert.equal(out.quests.length, 1);
  assert.equal(out.quests[0].kind, 'coarse');
});

test('pullApart drops every thread that does not ground in the surf vocabulary', async () => {
  const surf = { referents: [{ id: 'gregor', label: 'Gregor' }], bonds: [] };
  const model = { phrase: async () => 'Napoleon at Waterloo\nA ship at sea' };
  const threads = await pullApart(surf, { model });
  assert.equal(threads.length, 0, 'nothing the model named appears in the surf');
});

test('pullApart with no model returns nothing (the model is the exception, not required)', async () => {
  const threads = await pullApart({ referents: [{ id: 'a', label: 'A' }] }, { model: null });
  assert.deepEqual(threads, []);
});
