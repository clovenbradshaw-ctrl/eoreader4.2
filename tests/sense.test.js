import { test } from 'node:test';
import assert from 'node:assert/strict';

import { senseCollision, senseBasins, discriminatingAnchor, SENSE_FLOOR } from '../src/turn/sense.js';
import { projectFold, clearFoldMemo, answersAwaited } from '../src/core/conversation-fold.js';

// Stage 1 of the disambiguated-query pipeline (docs/response-demand.md): before a query is
// generated, does the SUBJECT collide across senses in the recorded corpus? Model-free over the
// entity graph, three exits — shortcut / steer / ask. The rows are {id, label, weight, neighbors}
// (what senseEntities builds from projectGraph); the core is a pure function of them.

// A football-heavy dolphins corpus: the team dominates salience, but the animal is still a real
// sense — collision is "≥2 real basins", NOT "no clear winner", so this is ambiguous.
const dolphins = [
  { id: 'a', label: 'Dolphin', weight: 51, neighbors: ['cetacean', 'ocean', 'marine', 'mammal'] },
  { id: 'b', label: 'Miami Dolphins', weight: 195, neighbors: ['nfl', 'quarterback', 'touchdown', 'ocean'] },
  { id: 'c', label: 'Brisbane Dolphins', weight: 60, neighbors: ['nrl', 'rugby', 'brisbane'] },
  { id: 'd', label: 'Photosynthesis', weight: 40, neighbors: ['chlorophyll', 'light', 'plant'] },
];

test('senseBasins merges the same sense across docs and normalizes weight', () => {
  const rows = [
    { id: 'x1', label: 'Miami Dolphins', weight: 100, neighbors: ['nfl'] },
    { id: 'x2', label: 'Miami Dolphins', weight: 95, neighbors: ['touchdown'] },   // same sense, another doc
    { id: 'y', label: 'Dolphin', weight: 51, neighbors: ['cetacean'] },
  ];
  const basins = senseBasins('dolphins', rows);
  assert.equal(basins.length, 2, 'the two Miami Dolphins rows merge into one basin');
  assert.ok(Math.abs(basins.reduce((z, b) => z + b.weight, 0) - 1) < 1e-9, 'weights normalize to 1');
  assert.equal(basins[0].label, 'Miami Dolphins');
  assert.ok(basins[0].neighbors.includes('nfl') && basins[0].neighbors.includes('touchdown'));
});

test('an ambiguous subject with no hints ASKS a choice question naming the senses', () => {
  const r = senseCollision('dolphins', dolphins);
  assert.equal(r.resolution, 'ask');
  assert.equal(r.ambiguous, true);
  assert.ok(r.ask.question.includes('Miami Dolphins') && /Dolphin/.test(r.ask.question));
  assert.ok(/\bor\b/.test(r.ask.question), 'a disjunction, so the fold reads it as a choice');
});

test('a concrete hint STEERS to the target sense with a discriminating anchor', () => {
  const marine = senseCollision('dolphins', dolphins, { hints: ['marine'] });
  assert.equal(marine.resolution, 'steer');
  assert.equal(marine.target.label, 'Dolphin');
  assert.equal(marine.anchor, 'cetacean', 'the anchor co-occurs with the animal, never the team');

  const nfl = senseCollision('dolphins', dolphins, { hints: ['nfl'] });
  assert.equal(nfl.resolution, 'steer');
  assert.equal(nfl.target.label, 'Miami Dolphins');
});

test('an abstract hint that matches no corpus term falls through to the ask (fail-safe)', () => {
  const r = senseCollision('dolphins', dolphins, { hints: ['animal'] });
  assert.equal(r.resolution, 'ask');
});

test('an unambiguous subject SHORTCUTS (one real sense), even amid a busy graph', () => {
  const r = senseCollision('photosynthesis', dolphins);
  assert.equal(r.resolution, 'shortcut');
  assert.equal(r.ambiguous, false);
  assert.equal(r.target.label, 'Photosynthesis');
});

test('a subject the corpus never recorded shortcuts with no target (→ downstream ask/fetch)', () => {
  const r = senseCollision('llamas', dolphins);
  assert.equal(r.resolution, 'shortcut');
  assert.equal(r.target, null);
});

test('a dominant sense plus a below-floor alias is NOT ambiguous (the null keeps out noise)', () => {
  const rows = [
    { id: 'big', label: 'Mercury', weight: 200, neighbors: ['planet', 'orbit'] },     // the planet
    { id: 'tiny', label: 'Mercury', weight: 3, neighbors: ['thermometer'] },          // a one-off alias
  ];
  // same label → merges into one basin; use distinct senses instead:
  const rows2 = [
    { id: 'big', label: 'Mercury planet', weight: 200, neighbors: ['orbit', 'sun'] },
    { id: 'tiny', label: 'Mercury element', weight: 3, neighbors: ['thermometer'] },
  ];
  const r = senseCollision('mercury', rows2, { floor: SENSE_FLOOR });
  assert.equal(r.resolution, 'shortcut', 'the 3-weight sense is below the real-sense floor');
});

test('discriminatingAnchor prefers a neighbor present only in the target basin', () => {
  const target = { id: 't', neighbors: ['cetacean', 'ocean'] };
  const other = { id: 'o', neighbors: ['nfl', 'ocean'] };
  assert.equal(discriminatingAnchor(target, [other]), 'cetacean');   // ocean is shared, cetacean is not
});

test('Stage 1 → fold: the ask question feeds answersAwaited, and a choice reply resolves cheaply', () => {
  const gate = senseCollision('dolphins', dolphins);
  clearFoldMemo();
  const fold = projectFold([
    { role: 'user', text: 'write me an essay on dolphins' },
    { role: 'asst', text: gate.ask.question },
  ]);
  assert.equal(fold.awaiting.kind, 'choice');
  assert.equal(answersAwaited(fold, 'the cetacean one').demand, 'continuation');
  assert.equal(answersAwaited(fold, 'miami').demand, 'continuation');
  assert.equal(answersAwaited(fold, 'actually, tell me about whales').demand, 'attention');
});
