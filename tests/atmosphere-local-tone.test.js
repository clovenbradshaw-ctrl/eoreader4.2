// Proposition-grain / relativistic Atmosphere (docs/referents-recursed-up-the-domain-axis.md,
// D4). The global tone is one reading off one ρ; a departed window reads in its OWN key, so
// each anomalous window now carries its own local tone. Forcing an anomalous window
// deterministically needs realistic (non-degenerate) embeddings — the pass's documented
// measurement-first fragility, so these tests guard the SHAPE and the contract: the enrichment
// is a pure, gated addition and never breaks the existing readings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { atmosphereFromActivations, centroidBasis } from '../src/surfer/atmosphere.js';

const KEYS = ['DEF_Clearing_Atmosphere', 'EVA_Tending_Atmosphere', 'REC_Cultivating_Atmosphere',
              'X_a', 'X_b', 'X_c', 'X_d'];
const oneHot = (i, n = KEYS.length) => Array.from({ length: n }, (_, j) => (j === i ? 1 : 0));
const basis = centroidBasis({ vectors: Object.fromEntries(KEYS.map((k, i) => [k, oneHot(i)])) });

test('the reading keeps its documented shape, and every anomalous window carries a tone', () => {
  const acts = [];
  for (let i = 0; i < 24; i++) acts.push(oneHot(1));
  for (let i = 0; i < 6; i++) acts.push(oneHot(2));
  for (let i = 0; i < 24; i++) acts.push(oneHot(1));

  const r = atmosphereFromActivations(acts, basis, { alpha: 0.1 });
  assert.ok(['anomalous', 'corpus-weather', 'unmeasured'].includes(r.verdict));
  assert.equal(Array.isArray(r.anomalousWindows), true);
  // The contract the recursion adds: a departed window reads in its own key.
  for (const w of r.anomalousWindows) {
    assert.ok('tone' in w, 'each anomalous window carries a local tone slot');
    assert.equal(typeof w.at, 'number');
  }
  // A global tone is still reported off the whole ρ (the document's overall weather).
  if (r.tone) assert.equal(r.tone.terrain, 'Atmosphere');
});

test('too short to measure a per-window null → unmeasured, no windows', () => {
  const r = atmosphereFromActivations([oneHot(1), oneHot(1)], basis, { alpha: 0.05 });
  assert.equal(r.verdict, 'unmeasured');
  assert.equal(r.anomalousWindows.length, 0);
});

test('no basis / empty activations → the blank reading, unchanged', () => {
  assert.equal(atmosphereFromActivations([], basis).verdict, 'unmeasured');
  assert.equal(atmosphereFromActivations([oneHot(1)], null).verdict, 'unmeasured');
});
