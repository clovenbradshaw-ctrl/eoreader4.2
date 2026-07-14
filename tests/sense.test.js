import { test } from 'node:test';
import assert from 'node:assert/strict';

import { senseCollision, senseBasins, discriminatingAnchor, senseGate, steerQuery, validateQuery, resultBasinCheck, SENSE_FLOOR } from '../src/turn/sense.js';
import { projectFold, clearFoldMemo, answersAwaited } from '../src/frame/index.js';

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

test('senseGate finds the colliding subject inside a whole question (no subject extractor)', () => {
  const ask = senseGate('write me an essay on dolphins', [], { entities: dolphins });
  assert.equal(ask.resolution, 'ask');
  assert.ok(/Miami Dolphins/.test(ask.ask.question));
  // a question whose only recorded subject has one sense → shortcut, no ask
  const clear = senseGate('explain photosynthesis to me', [], { entities: dolphins });
  assert.equal(clear.resolution, 'shortcut');
  // a concrete hint in play steers instead of asking
  const steer = senseGate('essay on dolphins', [], { entities: dolphins, hints: ['nfl'] });
  assert.equal(steer.resolution, 'steer');
  assert.equal(steer.target.label, 'Miami Dolphins');
});

test('the fold reads role:"assistant" (the live app convention), not only "asst"', () => {
  clearFoldMemo();
  const f = projectFold([
    { role: 'user', text: 'write me an essay on dolphins' },
    { role: 'assistant', text: 'Which dolphins do you mean — Miami Dolphins (nfl) or Dolphin (cetacean)?' },
  ]);
  assert.equal(f.awaiting.kind, 'choice');
  assert.equal(answersAwaited(f, 'miami').demand, 'continuation');
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

// ── Stages 2→3 tilt and 4 (query validation) ──────────────────────────────────────────────────────

test('steerQuery folds the anchor in when missing and there is room', () => {
  assert.equal(steerQuery('dolphin behavior', 'cetacean'), 'dolphin behavior cetacean');
  assert.equal(steerQuery('dolphin cetacean', 'cetacean'), 'dolphin cetacean');   // already present → unchanged
  assert.equal(steerQuery('alpha beta gamma delta epsilon zeta', 'cetacean', { budget: 6 }), 'alpha beta gamma delta epsilon zeta');   // budget full → unchanged
  assert.equal(steerQuery('dolphin', ''), 'dolphin');   // no anchor → unchanged
});

test('validateQuery catches the ways a query goes wrong', () => {
  assert.equal(validateQuery('dolphin cetacean behavior', { subject: 'dolphin', anchors: ['cetacean'], ambiguous: true }).ok, true);
  assert.deepEqual(validateQuery('cetacean behavior', { subject: 'dolphin' }).reasons, ['missing-subject']);
  assert.deepEqual(validateQuery('dolphin behavior', { subject: 'dolphin', anchors: ['cetacean'], ambiguous: true }).reasons, ['missing-anchor']);
  assert.ok(validateQuery('dolphin alpha beta gamma delta epsilon zeta', { subject: 'dolphin', budget: 6 }).reasons.includes('over-budget'));
  assert.ok(validateQuery('dolphin -football', { subject: 'dolphin', anchors: ['cetacean'] }).reasons.includes('exclusion-over-anchor'));
  assert.deepEqual(validateQuery('', {}).reasons, ['empty']);
});

// ── Stage 5 (result-basin check) ───────────────────────────────────────────────────────────────────

test('resultBasinCheck escalates when the collision basin dominates the results', () => {
  const target = { neighbors: ['cetacean', 'marine', 'mammal', 'ocean'] };
  const collision = { neighbors: ['nfl', 'quarterback', 'touchdown', 'football'] };

  const wrong = resultBasinCheck([
    { title: 'Miami Dolphins quarterback throws for a touchdown', snippet: 'NFL football recap' },
    { title: 'Dolphins add a kicker', snippet: 'the football roster' },
  ], { target, collision });
  assert.equal(wrong.escalate, true);
  assert.equal(wrong.inBasin, false);

  const right = resultBasinCheck([
    { title: 'Dolphin (marine mammal)', snippet: 'a cetacean of the ocean' },
  ], { target, collision });
  assert.equal(right.escalate, false);
  assert.equal(right.inBasin, true);

  // neither basin witnessed → no verdict, no escalation
  const neither = resultBasinCheck([{ title: 'the weather today', snippet: '' }], { target, collision });
  assert.equal(neither.inBasin, null);
  assert.equal(neither.escalate, false);
});
