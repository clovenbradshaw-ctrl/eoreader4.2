// Comparative/exclusion grounding — "Armstrong chose Cincinnati's aerospace program over
// Purdue.": the base parser used to read this as TWO unmarked relations, armstrong–chose→
// cincinnati AND armstrong–chose→purdue, with no signal that Purdue was the REJECTED
// alternative. That made the parsed propositions for "chose X over Y" and "chose Y over X"
// identical, and propagated three ways: classifyProvenance's "verbatim" check tested subj/
// via/obj as independent substrings (order-blind), its relKey ignored polarity entirely, and
// groundSpans' lexical-overlap floor let a high bag-of-words score override an explicit
// doc-witness "void" verdict — a comparative's two orderings share the exact same words, so
// bag-of-words overlap can't tell the true claim from its false inversion.
//
// The fix: the parser marks the passed-over entity's relation with NEGATIVE polarity (the
// existing polarity/modality channel `polmod` already carries for verb-level negation, e.g.
// "didn't choose") instead of leaving both sides positive and unmarked. Provenance and
// grounding then read that signal instead of only bag-of-words/substring evidence.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/pipeline.js';
import { classifyProvenance } from '../src/enactor/ground/provenance.js';
import { groundSpans, citationHolds } from '../src/enactor/ground/spans.js';

const conEdges = (doc) => doc.log.snapshot().filter((e) => e.op === 'CON' && e.via);

// ── the base parser — relations.js / objectEntities ───────────────────────────────────────────

test('parser: "chose X over Y" bonds the chosen entity positively and the passed-over one negatively', () => {
  const doc = parseText('Armstrong chose Cincinnati’s aerospace program over Purdue.', { docId: 't1' });
  const edges = conEdges(doc).filter((e) => e.via === 'chose');
  const cincinnati = edges.find((e) => e.tgt === 'cincinnati');
  const purdue = edges.find((e) => e.tgt === 'purdue');
  assert.ok(cincinnati, 'the chosen entity is bonded');
  assert.ok(purdue, 'the passed-over entity is STILL bonded — total capture, never silently dropped');
  assert.notEqual(cincinnati.polarity, '−', 'the chosen entity reads positive');
  assert.equal(purdue.polarity, '−', 'the passed-over entity reads negative — it was NOT chosen');
});

test('parser: reversing the sentence reverses which entity is negative, not just their order', () => {
  const doc = parseText('Armstrong chose Purdue’s aerospace program over Cincinnati.', { docId: 't2' });
  const edges = conEdges(doc).filter((e) => e.via === 'chose');
  assert.notEqual(edges.find((e) => e.tgt === 'purdue').polarity, '−');
  assert.equal(edges.find((e) => e.tgt === 'cincinnati').polarity, '−');
});

test('parser: "preferred X to Y" — bare "to" marks exclusion only gated on a comparison verb', () => {
  const doc = parseText('Armstrong preferred Cincinnati to Purdue.', { docId: 't3' });
  const edges = conEdges(doc).filter((e) => e.via === 'preferred');
  assert.notEqual(edges.find((e) => e.tgt === 'cincinnati').polarity, '−');
  assert.equal(edges.find((e) => e.tgt === 'purdue').polarity, '−');
});

test('parser: "instead of" and "rather than" read the same way as "over"', () => {
  const a = conEdges(parseText('Armstrong picked Cincinnati instead of Purdue.', { docId: 't4a' }))
    .filter((e) => e.via === 'picked');
  assert.equal(a.find((e) => e.tgt === 'purdue').polarity, '−');

  const b = conEdges(parseText('Armstrong chose Cincinnati rather than Purdue.', { docId: 't4b' }))
    .filter((e) => e.via === 'chose');
  assert.equal(b.find((e) => e.tgt === 'purdue').polarity, '−');
});

test('parser: an ordinary dative "gave X to Y" is unaffected — "to" is gated on the verb, not general', () => {
  const doc = parseText('Armstrong gave the letter to Mary.', { docId: 't5' });
  const edges = conEdges(doc).filter((e) => e.via === 'gave');
  assert.equal(edges.length, 1, 'Mary is the ordinary recipient, not a second, wrongly-excluded object');
  assert.notEqual(edges[0].polarity, '−');
});

test('parser: "over B and C" marks both trailing entities excluded, not just the first', () => {
  const doc = parseText('Armstrong chose Cincinnati over Purdue and Ohio State.', { docId: 't6' });
  const edges = conEdges(doc).filter((e) => e.via === 'chose');
  assert.notEqual(edges.find((e) => e.tgt === 'cincinnati').polarity, '−');
  assert.equal(edges.find((e) => e.tgt === 'purdue').polarity, '−');
  assert.equal(edges.find((e) => e.tgt === 'ohio-state').polarity, '−');
});

// ── classifyProvenance — provenance.js ────────────────────────────────────────────────────────

test('classifyProvenance: the false inverted comparative claim is fabricated, the true claim verbatim', () => {
  const source = ['Armstrong chose Cincinnati’s aerospace program over Purdue.'];
  const truth = classifyProvenance('Armstrong chose Cincinnati.', source).propositions[0];
  const lie = classifyProvenance('Armstrong chose Purdue.', source).propositions[0];
  assert.equal(truth.grounding, 'verbatim');
  assert.equal(truth.witness, 'exafference');
  assert.equal(lie.grounding, 'fabricated', '"chose X over Y" and "chose Y over X" must not read identically');
  assert.equal(lie.witness, 'void');
});

test('classifyProvenance: a shortened name reference still reads verbatim (figures match by containment, not exact string)', () => {
  // Regression guard: an early version of this fix required an EXACT subj/obj string match,
  // which broke the pre-existing "Atlas" ⊑ "Project Atlas" containment reading npj-source-gate
  // already depends on (witnessesForProps / archonReview) — a claim's own isolated parse of a
  // shortened name never resolves to the graph's fuller-name entity id, so exact-string matching
  // silently zeroed out every shortened reference. sameFigure (name-variants.js's token-
  // subsequence containment) restores it while still requiring exact via + polarity.
  const c = classifyProvenance('Atlas ships in March.', ['Project Atlas ships in March.']);
  assert.equal(c.propositions[0].grounding, 'verbatim');
});

test('classifyProvenance: a swapped subject/object no longer reads verbatim', () => {
  // "Ben trusted Anna" against a doc that only says "Anna trusted Ben" shares every token, so
  // the OLD substring-only verbatim check (subj/via/obj each present ANYWHERE in the span) read
  // it as verbatim regardless of who did what to whom. It still separately reads "grounded"
  // here (NOT fabricated) — relKey sorts figures order-insensitively by design, to let a passive
  // rewording ("Ben was trusted by Anna") ground against its active form; that pre-existing,
  // intentional order-insensitivity is a separate concern from the verbatim check this fixes.
  const c = classifyProvenance('Ben trusted Anna.', ['Anna trusted Ben.']).propositions[0];
  assert.notEqual(c.grounding, 'verbatim', 'reversing who trusted whom is not a verbatim lift');
});

// ── groundSpans / citationHolds — spans.js ────────────────────────────────────────────────────

test('groundSpans: the false inverted claim is grounded to the void; the true claim is sourced', () => {
  const passages = [{ u: 'bio.txt', idx: 0, text: 'Armstrong chose Cincinnati’s aerospace program over Purdue.' }];
  const spans = [
    'Armstrong chose Cincinnati’s aerospace program.',
    'Armstrong chose Purdue’s aerospace program.',
  ];
  const [truth, lie] = groundSpans(spans, { passages, minOverlap: 0.3, minTerms: 2 });
  assert.equal(truth.kind, 'source');
  assert.equal(truth.witness, 'exafference');
  assert.equal(lie.kind, 'llm', 'a false comparative-exclusion claim must not be badged as sourced');
  assert.equal(lie.witness, 'void');
});

test('groundSpans: holds with a doc supplied too (the doc-witness path), not only bare passages', () => {
  const doc = parseText('Armstrong chose Cincinnati’s aerospace program over Purdue.', { docId: 'bio' });
  const passages = [{ u: 'bio.txt', idx: 0, text: 'Armstrong chose Cincinnati’s aerospace program over Purdue.' }];
  const [lie] = groundSpans(['Armstrong chose Purdue’s aerospace program.'], { passages, doc, minOverlap: 0.3, minTerms: 2 });
  assert.equal(lie.kind, 'llm');
  assert.equal(lie.witness, 'void');
});

test('citationHolds: rejects the false inverted claim even at maximal lexical overlap', () => {
  const passageText = 'Armstrong chose Cincinnati’s aerospace program over Purdue.';
  assert.equal(citationHolds('Armstrong chose Cincinnati.', passageText, 1), true);
  assert.equal(citationHolds('Armstrong chose Purdue.', passageText, 1), false,
    'same words, opposite relation — a near-verbatim SCORE must not stand in for the structural check');
});

test('citationHolds: a near-verbatim fragment with no checkable proposition still holds (unchanged)', () => {
  assert.equal(citationHolds('the aerospace program', 'Armstrong chose the aerospace program.', 1), true);
});
