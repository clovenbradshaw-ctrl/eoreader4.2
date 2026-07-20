// lens-naming.js — naming a Lens/Paradigm direction in the cube's own operator vocabulary.
// Basis-agnostic: bare operator-code dims (structural basis) and cube-cell-key dims
// (embedding basis) must name off the same leading operator.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { topDims, labelPattern, nameLens, nameDivergence } from '../src/surfer/lens-naming.js';
import { OPS, structuralHorizon, structuralCommutator, structuralParadigmDivergence } from '../src/surfer/structure-basis.js';

test('topDims picks the heaviest-loaded dimensions, weak ones dropped', () => {
  const vec = [0.9, 0.05, -0.4, 0, 0.1, 0, 0, 0, 0];
  const top = topDims(vec, OPS, { n: 3 });
  assert.equal(top.length, 2, 'only 2 dims clear tau=0.15');
  assert.equal(top[0].d, 'NUL');
  assert.equal(top[1].d, 'DEF');
  assert.equal(top[1].w, -0.4);
});

test('topDims respects n and returns nothing when everything is weak', () => {
  assert.equal(topDims([0.05, 0.02, 0, 0, 0, 0, 0, 0, 0], OPS).length, 0);
});

test('labelPattern reads the operator\'s own verb, bare op-code dims', () => {
  const pattern = [{ d: 'CON', w: 0.6 }, { d: 'EVA', w: 0.3 }];
  assert.equal(labelPattern(pattern), 'bond + evaluate');
});

test('labelPattern reads a negative loading as running away from that operator', () => {
  const pattern = [{ d: 'DEF', w: -0.5 }];
  assert.equal(labelPattern(pattern), 'away from assert/define');
});

test('labelPattern names off the LEADING operator of a cube-cell key (embedding basis)', () => {
  const pattern = [{ d: 'EVA_Tending_Atmosphere', w: 0.4 }, { d: 'REC_Composing_Paradigm', w: 0.2 }];
  assert.equal(labelPattern(pattern), 'evaluate + learn rule');
});

test('labelPattern is null (not a guess) when nothing recognisable clears tau', () => {
  assert.equal(labelPattern([{ d: 'not-an-operator', w: 0.9 }]), null);
  assert.equal(labelPattern([]), null);
});

test('nameLens composes topDims + labelPattern in one call', () => {
  const vec = [0, 0, 0, 0, 0, 0, 0.8, 0, 0];   // INS
  const named = nameLens(vec, OPS);
  assert.equal(named.pattern[0].d, 'INS');
  assert.equal(named.label, 'instantiate');
});

test('nameDivergence names which dimensions separate two directions, signed by direction', () => {
  const a = [0.8, 0.1, 0.1, 0, 0, 0, 0, 0, 0];
  const b = [0.1, 0.1, 0.1, 0, 0, 0, 0.7, 0, 0];
  const named = nameDivergence(a, b, OPS);
  assert.ok(named.label.includes('reads more into hold (non-transformation)'), named.label);
  assert.ok(named.label.includes('reads less into instantiate'), named.label);
});

test('structuralHorizon lenses carry a label built off the operator vocabulary', () => {
  const spike = (i) => { const v = new Array(9).fill(0); v[i] = 3; return v; };
  const profiles = Array(60).fill(0).map(() => spike(4));   // CON-dominant throughout
  const h = structuralHorizon(profiles);
  assert.ok(h.lenses.length > 0);
  const dominant = h.lenses[0];
  assert.ok(Array.isArray(dominant.pattern));
  assert.ok(dominant.label === null || typeof dominant.label === 'string');
  // a document that reads purely as CON must name a lens off CON's own verb, "bond".
  assert.ok(h.lenses.some(l => l.label && l.label.includes('bond')), JSON.stringify(h.lenses.map(l => l.label)));
});

test('structuralParadigmDivergence agrees with structuralCommutator on the same scalar', () => {
  const mix = (i, j, s) => { const v = new Array(9).fill(0); v[i] = 3; v[j] = 3 * s; return v; };
  const a = Array(40).fill(0).map(() => mix(0, 1, 1));
  const b = Array(40).fill(0).map(() => mix(0, 1, -1));
  const scalar = structuralCommutator(a, b);
  const named = structuralParadigmDivergence(a, b, OPS);
  assert.equal(named.incommensurability, scalar, 'same commutator either function reads it off — a new function, not a changed return shape');
});

test('structuralParadigmDivergence names which dimensions separate two documents (regardless of commuting)', () => {
  const mkProfiles = (i, n) => { const v = new Array(9).fill(0); v[i] = 3; return Array(n).fill(0).map(() => v.slice()); };
  const a = mkProfiles(0, 40);   // NUL-dominant
  const b = mkProfiles(6, 40);   // INS-dominant
  const named = structuralParadigmDivergence(a, b, OPS);
  assert.ok(Array.isArray(named.pattern) && named.pattern.length > 0);
  assert.ok(typeof named.label === 'string' && named.label.length > 0, named.label);
  assert.ok(named.label.includes('hold (non-transformation)') || named.label.includes('instantiate'), named.label);
});

test('structuralParadigmDivergence is null-safe on empty input', () => {
  const named = structuralParadigmDivergence([], [], OPS);
  assert.equal(named.pattern.length, 0);
  assert.equal(named.label, null);
});
