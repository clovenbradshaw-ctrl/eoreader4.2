// The display filter behind the causal DAG surface's entity on/off toggles and its per-entity
// focus (scopeAssertedDag). It hides what the viewer turned off and, given a focus node, keeps that
// node's whole connected neighbourhood — never re-reading the corpus, never inventing an edge.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createParser } from '../src/perceiver/parse/index.js';
import { assertedDag, scopeAssertedDag } from '../src/surfer/dag/index.js';

// Two disconnected causal stories: {education → poverty → crime → tourism} and {rain → flooding}.
const TEXT = 'Poverty causes crime. Crime reduces tourism. Education reduces poverty. Rain increases flooding.';
const parsed = () => createParser().parse(TEXT);
const keyOf = (a, needle) => {
  const n = a.nodes.find((x) => x.key === needle || x.labels.some((l) => l.toLowerCase().includes(needle)));
  return n ? n.key : null;
};

test('scopeAssertedDag: nothing scoped hands back the whole graph', () => {
  const a = assertedDag(parsed());
  assert.ok(a.nodes.length >= 5 && a.edges.length >= 4, 'the corpus yields a multi-node causal graph');
  assert.equal(scopeAssertedDag(a, {}), a, 'identity when nothing is hidden or focused');
});

test('scopeAssertedDag: hiding a node drops it and every incident edge', () => {
  const a = assertedDag(parsed());
  const crime = keyOf(a, 'crime');
  assert.ok(crime, 'crime is a node');
  const s = scopeAssertedDag(a, { hidden: new Set([crime]) });
  assert.ok(!s.nodes.some((n) => n.key === crime), 'the hidden node is gone');
  assert.ok(!s.edges.some((e) => e.from === crime || e.to === crime), 'no edge touches a hidden node');
  assert.equal(s.nodes.length, a.nodes.length - 1, 'exactly one node removed');
});

test('scopeAssertedDag: focus keeps only the focus node\'s connected component', () => {
  const a = assertedDag(parsed());
  const poverty = keyOf(a, 'poverty');
  const rain = keyOf(a, 'rain');
  assert.ok(poverty && rain, 'both components are present in the full graph');
  const s = scopeAssertedDag(a, { focus: poverty });
  assert.ok(s.nodes.some((n) => n.key === poverty), 'the focus node is kept');
  assert.ok(!s.nodes.some((n) => n.key === rain), 'the disconnected rain→flooding story is dropped');
  assert.ok(s.edges.every((e) => s.nodes.some((n) => n.key === e.from) && s.nodes.some((n) => n.key === e.to)),
    'every surviving edge has both endpoints in scope');
});

test('scopeAssertedDag: the scoped graph stays frozen with recomputed complexities', () => {
  const a = assertedDag(parsed());
  const s = scopeAssertedDag(a, { focus: keyOf(a, 'poverty') });
  assert.ok(Object.isFrozen(s) && Object.isFrozen(s.nodes) && Object.isFrozen(s.edges));
  assert.ok(s.complexities && Array.isArray(s.complexities.confounding) && Array.isArray(s.complexities.mechanism));
  assert.equal(s.focus, keyOf(a, 'poverty'));
  assert.equal(s.scoped, true);
});
