// Assembly 4 (Logic Gaps v0.1) — the two-column ledger.
//
// classifyProvenance already distinguishes a proposition a span WITNESSES from one
// merely not contradicted; model/grade.js names the three-grade ledger and the
// publish-time rule: WITNESSED may ground a published claim, CONSISTENT may only
// corroborate one, UNREAD grounds nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { classifyProvenance } from '../src/enactor/ground/provenance.js';
import { GRADE, gradeOf, gradeProvenance, ledgerAllows } from '../src/model/grade.js';
import { POLARITY } from '../src/model/polarity.js';
import { runVetoes } from '../src/enactor/ground/veto.js';

const PASSAGE = 'Armstrong joined the faculty at Cincinnati in 1962.';

test('gradeOf: exafference (a span witnesses it) grades WITNESSED', () => {
  assert.equal(gradeOf({ witness: 'exafference' }), GRADE.WITNESSED);
});

test('gradeOf: reafference (the engine\'s own unwitnessed notes) and void (grounded to training) both grade CONSISTENT', () => {
  assert.equal(gradeOf({ witness: 'reafference' }), GRADE.CONSISTENT);
  assert.equal(gradeOf({ witness: 'void' }), GRADE.CONSISTENT);
});

test('gradeOf: POLARITY.NULL (Assembly 1 declared closure — no reading either way) grades UNREAD', () => {
  assert.equal(gradeOf({ pol: POLARITY.NULL }), GRADE.UNREAD);
});

test('gradeOf: a proposition carrying no witness/pol signal at all grades UNREAD, never invented as WITNESSED or CONSISTENT', () => {
  assert.equal(gradeOf({}), GRADE.UNREAD);
  assert.equal(gradeOf(null), GRADE.UNREAD);
});

// ── existing WITNESSED claims still grade WITNESSED — no golden drift ────────────────

test('gradeProvenance: a verbatim (span-witnessed) claim still grades WITNESSED — classifyProvenance shape is untouched', () => {
  const doc = parseText(PASSAGE, { docId: 'd' });
  const raw = classifyProvenance('Armstrong joined the faculty at Cincinnati.', { doc });
  const graded = gradeProvenance('Armstrong joined the faculty at Cincinnati.', { doc });

  // additive: every field classifyProvenance already produced is byte-identical
  assert.equal(graded.propositions.length, raw.propositions.length);
  for (let i = 0; i < raw.propositions.length; i++) {
    assert.equal(graded.propositions[i].grounding, raw.propositions[i].grounding);
    assert.equal(graded.propositions[i].ground, raw.propositions[i].ground);
    assert.equal(graded.propositions[i].witness, raw.propositions[i].witness);
  }
  assert.equal(graded.propositions[0].grade, GRADE.WITNESSED);
  assert.equal(graded.grade[GRADE.WITNESSED], 1);
  assert.equal(graded.onlyConsistent, false);
});

test('gradeProvenance: a fabricated (void-grounded) claim grades CONSISTENT, and onlyConsistent is true', () => {
  const doc = parseText(PASSAGE, { docId: 'd' });
  const graded = gradeProvenance('Armstrong joined the faculty at Purdue.', { doc });
  assert.equal(graded.propositions[0].grade, GRADE.CONSISTENT);
  assert.equal(graded.onlyConsistent, true);
});

// ── the ledger rule ────────────────────────────────────────────────────────────────

test('ledgerAllows: WITNESSED clears a claim, alone or alongside CONSISTENT corroboration', () => {
  assert.equal(ledgerAllows([GRADE.WITNESSED]), true);
  assert.equal(ledgerAllows([GRADE.WITNESSED, GRADE.CONSISTENT]), true);
});

test('ledgerAllows: CONSISTENT alone — however much of it — may never be the sole support', () => {
  assert.equal(ledgerAllows([GRADE.CONSISTENT]), false);
  assert.equal(ledgerAllows([GRADE.CONSISTENT, GRADE.CONSISTENT, GRADE.CONSISTENT]), false);
});

test('ledgerAllows: UNREAD grounds nothing', () => {
  assert.equal(ledgerAllows([GRADE.UNREAD]), false);
  assert.equal(ledgerAllows([]), false);
});

// ── the publish gate — a synthetic CONSISTENT-only claim is refused ─────────────────

test('publish gate: a synthetic CONSISTENT-only claim is refused when handed to runVetoes as gradedPropositions', () => {
  const ctx = {
    draft: 'This synthetic claim rests on nothing read.', question: 'q', bound: [],
    edgeVerdicts: [],
    gradedPropositions: [{ grade: GRADE.CONSISTENT }],
  };
  const { fired, refuse } = runVetoes(ctx);
  assert.ok(fired.some((f) => f.id === 'consistent-only-publish' && f.refuses));
  assert.equal(refuse, true);
});

test('publish gate: WITNESSED support alongside CONSISTENT corroboration does not refuse on the ledger rule', () => {
  const ctx = {
    draft: 'A witnessed claim, corroborated.', question: 'q', bound: [],
    edgeVerdicts: [],
    gradedPropositions: [{ grade: GRADE.WITNESSED }, { grade: GRADE.CONSISTENT }],
  };
  const { fired } = runVetoes(ctx);
  assert.ok(!fired.some((f) => f.id === 'consistent-only-publish'));
});

test('publish gate: absent gradedPropositions (every existing call site), the new veto stays inert', () => {
  const ctx = { draft: 'An ordinary answer.', question: 'q', bound: [], edgeVerdicts: [] };
  const { fired } = runVetoes(ctx);
  assert.ok(!fired.some((f) => f.id === 'consistent-only-publish'));
});
