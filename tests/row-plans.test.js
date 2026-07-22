import { test } from 'node:test';
import assert from 'node:assert/strict';

import { tokenize, tokenCount } from '../src/weave/generate-row/tokenize.js';
import { bidirectionallyEntails, runRowVetoes } from '../src/enactor/ground/row-veto.js';
import {
  planTemplate, PLANS,
  definitionPlan, castProfilePlan, timelinePlan, relationshipExplainerPlan,
  comparisonPlan, disputeDigestPlan, gapReport, caption,
  dominantProposition,
} from '../src/weave/generate-row/plan.js';
import { isLensLegalShape } from '../src/weave/generate-row/slots.js';

const prop = (id, fields) => ({ id, verdict: 'corroborated', originIds: ['s-' + id], ...fields });

const traceIsBijective = (row) => {
  assert.equal(row.trace.length, tokenCount(row.renderedText));
  const tokens = tokenize(row.renderedText);
  row.trace.forEach((t, i) => { assert.equal(t.tokenStart, tokens[i].start); assert.equal(t.tokenEnd, tokens[i].end); });
};

// ═══════════════════════════════════════════════════════════════════════════
// §11.1 Definition
// ═══════════════════════════════════════════════════════════════════════════

test('definitionPlan: a dominant sense resolves to a readout', () => {
  const senses = [
    prop('d1', { subject: 'python', predicate: 'is', value: 'a programming language', originIds: ['s1', 's2', 's3'], displayText: 'Python is a programming language' }),
    prop('d2', { subject: 'python', predicate: 'is', value: 'a snake', originIds: ['s4'], displayText: 'Python is a snake' }),
  ];
  const r = definitionPlan(senses, 'python');
  assert.equal(r.shape, 'readout');
  assert.equal(r.fallback, null);
  traceIsBijective(r.row);
  assert.ok(bidirectionallyEntails(r.row, r.propositions));
});

test('definitionPlan: overloaded senses across explicit domains fall back to cultivating, no contest-side', () => {
  const senses = [
    prop('d1', { domain: 'computing', subject: 'python', predicate: 'is', value: 'a programming language', originIds: ['s1', 's2'], displayText: 'Python is a programming language' }),
    prop('d2', { domain: 'biology', subject: 'python', predicate: 'is', value: 'a snake genus', originIds: ['s3', 's4'], displayText: 'Python is a snake genus' }),
  ];
  const r = definitionPlan(senses, 'python');
  assert.equal(r.shape, 'cultivating');
  assert.equal(r.fallback, 'cultivating');
  assert.equal(r.relations.length, 0, 'different domains must not produce a contest-side');
  traceIsBijective(r.row);
  assert.ok(bidirectionallyEntails(r.row, r.propositions));
});

test('definitionPlan: senses that genuinely contradict within the same domain DO get a contest-side', () => {
  const senses = [
    prop('e1', { domain: 'sports', subject: 'winner', predicate: 'is', value: 'team a', verdict: 'contradicted', originIds: ['s1', 's2'], displayText: 'The winner is Team A' }),
    prop('e2', { domain: 'sports', subject: 'winner', predicate: 'is', value: 'team b', verdict: 'contradicted', originIds: ['s3', 's4'], displayText: 'The winner is Team B' }),
  ];
  const r = definitionPlan(senses, 'winner');
  assert.equal(r.shape, 'cultivating');
  assert.equal(r.relations.length, 1);
  assert.equal(r.relations[0].kind, 'oppose');
});

test('definitionPlan: never surfaces making or composing, even when candidates could measure that way', () => {
  // Two candidates joined by a causal connective would normally clear Making — Definition
  // caps at readout/cultivating regardless (§11.1).
  const senses = [
    prop('d1', { subject: 'x', predicate: 'is', value: 'reading one', originIds: ['s1'], displayText: 'X is reading one' }),
    prop('d2', { subject: 'x', predicate: 'is', value: 'reading two', originIds: ['s2'], displayText: 'X is reading two' }),
  ];
  const r = definitionPlan(senses, 'x');
  assert.ok(['readout', 'cultivating'].includes(r.shape));
});

test('definitionPlan: no candidates for the anchor falls back to the fixed void template', () => {
  const r = definitionPlan([prop('d1', { subject: 'other', predicate: 'is', value: 'x' })], 'nonexistent');
  assert.equal(r.fallback, 'readout-void');
  assert.equal(r.shape, null);
  assert.equal(r.propositions.length, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// §11.2 Entity / cast profile
// ═══════════════════════════════════════════════════════════════════════════

test('castProfilePlan: one lens per significant aspect, each independently shaped', () => {
  const cast = [
    prop('e1', { subject: 'anderson', predicate: 'is', value: 'american actress', originIds: ['s1', 's2', 's3'], displayText: 'Gillian Anderson is an American actress' }),
    prop('e2', { subject: 'anderson', predicate: 'portrayed', value: 'dana scully', originIds: ['s1', 's4'], displayText: 'Gillian Anderson portrayed Dana Scully' }),
  ];
  const r = castProfilePlan(cast, 'anderson');
  assert.equal(r.fallback, null);
  assert.equal(r.lenses.length, 2);
  for (const lens of r.lenses) {
    traceIsBijective(lens.row);
    assert.ok(bidirectionallyEntails(lens.row, lens.propositions));
  }
});

test('castProfilePlan: a lens that would resolve to cultivating/composing splits into sibling readouts instead of nesting (§4.2)', () => {
  // Three "won" propositions with comparable weight and no groundable relation between
  // them — bare stanceLegality would call this cultivating (or composing, never — no
  // order). A lens may not itself be a survey, so it must split.
  const cast = [
    prop('a1', { subject: 'x', predicate: 'won', value: 'award-a', originIds: ['s1'], displayText: 'X won Award A' }),
    prop('a2', { subject: 'x', predicate: 'won', value: 'award-b', originIds: ['s2'], displayText: 'X won Award B' }),
    prop('a3', { subject: 'x', predicate: 'won', value: 'award-c', originIds: ['s3'], displayText: 'X won Award C' }),
  ];
  const r = castProfilePlan(cast, 'x');
  assert.equal(r.lenses.length, 3, 'one sibling lens per proposition, not one nested survey');
  for (const lens of r.lenses) {
    assert.ok(isLensLegalShape(lens.shape), `lens shape "${lens.shape}" must be readout or making`);
  }
});

test('castProfilePlan: no propositions for the anchor falls back to the fixed void template', () => {
  const r = castProfilePlan([prop('e1', { subject: 'other', predicate: 'is', value: 'x' })], 'nonexistent');
  assert.equal(r.fallback, 'readout-void');
});

// ═══════════════════════════════════════════════════════════════════════════
// §11.3 Timeline
// ═══════════════════════════════════════════════════════════════════════════

test('timelinePlan: a dated, ordered scope resolves to composing with a grounded order', () => {
  const dated = [
    prop('t1', { subject: 'mou', predicate: 'draft', value: '15m', date: '2024-03-02', originIds: ['s1'], displayText: 'MOU drafted at $15M' }),
    prop('t2', { subject: 'mou', predicate: 'executed', value: '18m', date: '2024-03-19', originIds: ['s2'], displayText: 'MOU executed at $18M' }),
    prop('t3', { subject: 'payment', predicate: 'set', value: 'schedule', date: '2024-03-20', originIds: ['s3'], displayText: 'Payment schedule set' }),
  ];
  const r = timelinePlan(dated);
  assert.equal(r.shape, 'composing');
  assert.deepEqual(r.order.memberIds, ['t1', 't2', 't3']);
  assert.ok(r.row.renderedText.startsWith('First'));
  traceIsBijective(r.row);
  assert.ok(bidirectionallyEntails(r.row, dated));
});

test('timelinePlan: no dated propositions falls back to the fixed void template', () => {
  const r = timelinePlan([prop('u1', { subject: 'x', predicate: 'is', value: 'y' })]);
  assert.equal(r.fallback, 'readout-void');
});

// ═══════════════════════════════════════════════════════════════════════════
// §11.4 Relationship explainer
// ═══════════════════════════════════════════════════════════════════════════

test('relationshipExplainerPlan: a witnessed path fixes orientation to the named anchors', () => {
  const path = [prop('p1', { subject: 'axon', predicate: 'acquired', value: 'fusus', originIds: ['s1'], displayText: 'Axon acquired Fusus' })];
  const r = relationshipExplainerPlan(path, 'axon', 'fusus');
  assert.deepEqual(r.orientation, { from: 'axon', to: 'fusus' });
  assert.notEqual(r.shape, null);
});

test('relationshipExplainerPlan: zero witnessed path falls back to readout-void, NOT cultivating', () => {
  const r = relationshipExplainerPlan([prop('x', { subject: 'unrelated', predicate: 'is', value: 'y' })], 'alpha', 'omega');
  assert.equal(r.fallback, 'readout-void');
  assert.notEqual(r.fallback, 'cultivating');
  assert.equal(r.row.renderedText, 'Not established by these sources.');
});

// ═══════════════════════════════════════════════════════════════════════════
// §11.5 Comparison
// ═══════════════════════════════════════════════════════════════════════════

test('comparisonPlan: matched attributes with incompatible values cluster as a contrasted lens', () => {
  const props = [
    prop('x1', { subject: 'x', predicate: 'height', value: '10m', originIds: ['s1'], displayText: 'X is 10m tall' }),
    prop('y1', { subject: 'y', predicate: 'height', value: '20m', originIds: ['s2'], displayText: 'Y is 20m tall' }),
  ];
  const r = comparisonPlan(props, 'x', 'y');
  assert.equal(r.lenses.length, 1);
  assert.equal(r.lenses[0].attribute, 'height');
  assert.equal(r.lenses[0].shape, 'cultivating');
  traceIsBijective(r.lenses[0].row);
});

test('comparisonPlan: an attribute present for one side only is voided, not silently dropped', () => {
  const props = [
    prop('x1', { subject: 'x', predicate: 'height', value: '10m', originIds: ['s1'], displayText: 'X is 10m tall' }),
    prop('x2', { subject: 'x', predicate: 'founded', value: '1990', originIds: ['s2'], displayText: 'X was founded in 1990' }),
    prop('y1', { subject: 'y', predicate: 'height', value: '20m', originIds: ['s3'], displayText: 'Y is 20m tall' }),
  ];
  const r = comparisonPlan(props, 'x', 'y');
  assert.equal(r.lenses.length, 1);
  assert.equal(r.voids.length, 1);
  assert.equal(r.voids[0].predicate, 'founded');
});

test('comparisonPlan: no propositions for one side falls back to the fixed void template', () => {
  const r = comparisonPlan([prop('x1', { subject: 'x', predicate: 'height', value: '10m' })], 'x', 'nonexistent');
  assert.equal(r.fallback, 'readout-void');
});

// ═══════════════════════════════════════════════════════════════════════════
// §11.6 Dispute digest
// ═══════════════════════════════════════════════════════════════════════════

test('disputeDigestPlan: unconditionally suppresses lede and lens', () => {
  const contested = [
    prop('c1', { subject: 'mou-value', predicate: 'is', value: '15m', verdict: 'contradicted', originIds: ['s1', 's2'], displayText: 'MOU value is $15M' }),
    prop('c2', { subject: 'mou-value', predicate: 'is', value: '18m', verdict: 'contradicted', originIds: ['s3'], displayText: 'MOU value is $18M' }),
  ];
  const r = disputeDigestPlan(contested);
  assert.deepEqual(r.suppressed, ['lede', 'lens']);
  assert.equal(r.shape, 'cultivating');
  traceIsBijective(r.row);
});

test('disputeDigestPlan: a scope with no contested propositions falls back to the fixed void template', () => {
  const r = disputeDigestPlan([prop('s1', { subject: 'x', predicate: 'is', value: 'y', verdict: 'corroborated' })]);
  assert.equal(r.fallback, 'readout-void');
});

// ═══════════════════════════════════════════════════════════════════════════
// §11.7 Gap report — bypasses stanceLegality/planTemplate entirely
// ═══════════════════════════════════════════════════════════════════════════

test('gapReport: reads typed-absence propositions directly, without going through PLANS', () => {
  assert.ok(!('gapReport' in PLANS), 'gapReport must not be registered in the plan orchestrator');
  const scope = [prop('g1', { verdict: 'silent' }), prop('g2', { verdict: 'corroborated' }), prop('g3', { typed: 'void' })];
  const r = gapReport(scope);
  assert.deepEqual(r.voids.map((v) => v.id), ['g1', 'g3']);
});

test('planTemplate: "gapReport" is not a valid plan name', () => {
  assert.throws(() => planTemplate('gapReport', { propositions: [] }));
});

// ═══════════════════════════════════════════════════════════════════════════
// §11.8 Caption — below the template layer
// ═══════════════════════════════════════════════════════════════════════════

test('caption: renders exactly one sentence, no cluster grain', () => {
  const p = prop('cap1', { displayText: 'A brief note', subject: 'x', predicate: 'is', value: 'y' });
  const r = caption(p);
  assert.equal(r.shape, 'readout');
  traceIsBijective(r.row);
  assert.equal(r.row.renderedText, 'A brief note.');
});

test('caption: rejects any sentenceLimit other than 1', () => {
  assert.throws(() => caption(prop('cap1', {}), { sentenceLimit: 2 }));
});

test('planTemplate: "caption" is not a valid plan name (it bypasses planTemplate, §11.8)', () => {
  assert.throws(() => planTemplate('caption', { propositions: [] }));
});

// ═══════════════════════════════════════════════════════════════════════════
// planTemplate dispatch + general schema
// ═══════════════════════════════════════════════════════════════════════════

test('planTemplate: dispatches every registered plan name and matches calling the plan function directly', () => {
  const scope = {
    propositions: [prop('p1', { subject: 'axon', predicate: 'acquired', value: 'fusus', originIds: ['s1', 's2'], displayText: 'Axon acquired Fusus' })],
    anchor: 'axon', from: 'axon', to: 'fusus', x: 'axon', y: 'axon',
  };
  for (const name of Object.keys(PLANS)) {
    assert.doesNotThrow(() => planTemplate(name, scope), `planTemplate("${name}") must not throw on a minimal valid scope`);
  }
});

test('planTemplate: an unknown plan name throws rather than silently returning nothing', () => {
  assert.throws(() => planTemplate('doesNotExist', { propositions: [] }));
});

test('dominantProposition: returns null when no candidate clears the margin', () => {
  const a = prop('a', { originIds: ['s1'] });
  const b = prop('b', { originIds: ['s2'] });
  assert.equal(dominantProposition([a, b]), null);
});

test('dominantProposition: returns the top candidate when it clears the margin', () => {
  const a = prop('a', { originIds: ['s1', 's2', 's3'] });
  const b = prop('b', { originIds: ['s4'] });
  assert.equal(dominantProposition([a, b]).id, 'a');
});
