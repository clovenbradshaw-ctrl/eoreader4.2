// The nine canonical edge arcs (stance.js `classifyArc`) and node canonicalization
// (causal.js Workstream A). The arc is the fixed TYPE the renderer/analysis branch on;
// the source's verb rides alongside as a contextual subtype; polarity is orthogonal to
// type. Node canonicalization drops sentence-fragment "nodes" that don't read as variables.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createParser } from '../src/perceiver/parse/index.js';
import { classifyArc, ARCS, ARC_BAND, ARC_MEANING } from '../src/surfer/dag/stance.js';
import { assertedDag } from '../src/surfer/dag/index.js';

const parse = (t) => createParser().parse(t);
const keys = (a) => a.nodes.map((n) => n.key);
const edge = (a, from, to) => a.edges.find((e) => e.from === from && e.to === to);

test('the spine is exactly nine arcs, each in a band with a gloss', () => {
  assert.equal(ARCS.length, 9);
  assert.equal(new Set(ARCS).size, 9, 'no duplicate arc names');
  for (const arc of ARCS) {
    assert.ok(ARC_MEANING[arc], `${arc} has a human gloss`);
    if (arc !== 'common-cause') assert.ok(ARC_BAND[arc], `${arc} groups into a band`);
  }
  assert.deepEqual(new Set(Object.values(ARC_BAND)), new Set(['cause', 'mechanism', 'correlation']),
    'the three coarse bands (spec §5.4)');
});

test('classifyArc: every kind of marker resolves to one arc', () => {
  const arc = (o) => classifyArc(o).arc;
  assert.equal(arc({ verb: 'led', stance: 'essential', warrant: 'causal-verb:led' }), 'produces');
  assert.equal(arc({ verb: 'triggered', stance: 'essential' }), 'produces');
  assert.equal(arc({ verb: 'increases', stance: 'essential' }), 'influences');
  assert.equal(arc({ verb: 'reduced', stance: 'essential' }), 'influences');
  assert.equal(arc({ verb: 'prevented', stance: 'essential' }), 'prevents');
  assert.equal(arc({ verb: 'enables', stance: 'essential' }), 'enables');
  assert.equal(arc({ verb: 'shaped', stance: 'essential' }), 'contributes');
  assert.equal(arc({ verb: 'lowers', stance: 'generative', warrant: 'mechanism+lowers' }), 'mechanism');
  assert.equal(arc({ verb: 'associated', stance: 'accidental' }), 'correlates');
  assert.equal(arc({ verb: 'cause-link', stance: 'essential', warrant: 'cause-link' }), 'because');
});

test('classifyArc: an unknown verb falls back to influences, never dropped', () => {
  const r = classifyArc({ verb: 'frobnicated', stance: 'essential', warrant: 'causal-verb:frobnicated' });
  assert.equal(r.arc, 'influences', 'the generic fallback (spec §5.2)');
});

test('classifyArc: polarity is orthogonal to type — same arc, opposite sign', () => {
  const up = classifyArc({ verb: 'increases', stance: 'essential', effectSign: '+' });
  const down = classifyArc({ verb: 'reduced', stance: 'essential', effectSign: '−' });
  assert.equal(up.arc, down.arc, '"increases" and "decreases" are the SAME arc');
  assert.equal(up.sign, '+');
  assert.equal(down.sign, '−');
  // correlation is symmetric — it carries no direction of effect.
  assert.equal(classifyArc({ verb: 'correlated', stance: 'accidental', effectSign: '+' }).sign, 'none');
});

test('assertedDag: each edge carries its dominant arc, a tally, and the verb as subtype', () => {
  const a = assertedDag(parse('Poverty causes crime. Ice cream sales are associated with drowning.'));
  const pc = edge(a, 'poverty', 'crime');
  assert.equal(pc.dominantArc, 'produces');
  assert.equal(pc.arcSign, '+');
  assert.equal(pc.arcTally.produces, 1);
  assert.equal(pc.claims[0].marker, 'causes', 'the source verb survives verbatim as the subtype');
  const assoc = a.edges.find((e) => e.dominantArc === 'correlates');
  assert.ok(assoc, 'an association clause types as the correlates arc');
});

test('assertedDag: a mechanism cue lifts the arc to mechanism', () => {
  const a = assertedDag(parse('The library reduced crime through informal surveillance.'));
  const e = edge(a, 'library', 'crime');
  assert.ok(e, 'the edge is read');
  assert.equal(e.dominantArc, 'mechanism', '"through …" articulates a pathway (§5.2 arc 6)');
});

test('Workstream A: sentence-fragment heads are dropped, clean concepts survive', () => {
  // A discourse marker / hedge / appearance verb / stray particle is not a variable.
  assert.equal(keys(assertedDag(parse('Probably increases the risk of failure.'))).length, 0,
    'a hedge is not a node');
  assert.equal(keys(assertedDag(parse('Once again reduced the crime rate.'))).length, 0,
    'a discourse marker is not a node');
  assert.equal(keys(assertedDag(parse('The second stage shut down further.'))).length, 0,
    'a truncated clause / bare particle is not a node');
  // "It appears" is skipped but the real variables around it are kept.
  const around = keys(assertedDag(parse('It appears funding shaped the outcome.')));
  assert.ok(around.includes('funding') && around.includes('outcome'), 'the real concepts survive');
  assert.ok(!around.includes('it') && !around.some((k) => k.startsWith('appear')), 'the fragment is gone');
  // A clean causal sentence is untouched.
  assert.deepEqual(keys(assertedDag(parse('Good governance reduces corruption.'))).sort(),
    ['corruption', 'governance']);
});

test('Workstream A: a node label is trimmed to the concept, not the trailing adverb', () => {
  const a = assertedDag(parse('The voyager launch almost caused a failure.'));
  const launch = a.nodes.find((n) => n.key === 'launch');
  if (launch) assert.ok(!launch.labels.some((l) => /almost/i.test(l)), 'the trailing adverb is trimmed from the label');
});

test('assertedDag: cross-source disagreement in KIND is flagged (arcContested)', () => {
  // one source reads a cause, another reads mere correlation, of the same pair.
  const a = assertedDag([
    { docId: 'A', ...parse('Screen time causes anxiety.') },
    { docId: 'B', ...parse('Screen time is associated with anxiety.') },
  ]);
  const e = a.edges.find((x) => Object.keys(x.arcTally).length > 1);
  assert.ok(e, 'an edge read as two different arcs exists');
  assert.equal(e.arcContested, true, 'the disagreement in kind is flagged');
});
