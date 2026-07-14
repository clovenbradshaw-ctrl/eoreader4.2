// "People mean different things by this" — tested on real text, across genres. The disagreement
// fold reads the ACTUAL sentences of each source, pulls out how that source characterizes a term,
// buckets the characterizations into distinct meanings, and tallies each per source. These tests
// feed it hand-written corpora — non-fiction (a civic procurement), fiction (two narrators), and
// academic papers (one word, three disciplines) — and pin that the disagreement is surfaced and
// that re-reading under one source as a basis reorders the meanings (docs, plain version §3).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { characterize, disagree, sourcesDisagree } from '../src/rooms/plain/disagreement.js';
import { readAs, basesOf } from '../src/rooms/plain/select.js';

const topSense = (model, basis) => {
  const rows = readAs(model.meanings.map((m) => ({ label: m.sense, by: m.by })), basis);
  return rows[0]?.label ?? null;
};
const senses = (model) => new Set(model.meanings.map((m) => m.sense));

// ── The extractor itself ──────────────────────────────────────────────────────────────────────
test('characterize reads copulas, appositives, dashes, and "described as"', () => {
  const text = 'Surveillance is a line item in the vendor contract. '
    + 'Surveillance was described as a sensing capability. '
    + 'Surveillance, a partnership with business, drew scrutiny. '
    + 'Surveillance — a legal exposure — worried the council.';
  const cs = characterize(text, 'surveillance');
  const bySense = new Set(cs.map((c) => c.sense));
  assert.ok(bySense.has('item'), 'copula → line item');
  assert.ok(bySense.has('capability'), 'described as → capability');
  assert.ok(bySense.has('partnership'), 'apposition → partnership');
  assert.ok(bySense.has('exposure'), 'dash → legal exposure');
});

test('characterize skips negations — "is not a…" is not a meaning', () => {
  const cs = characterize('The chief said surveillance is not a camera. Surveillance is a sensor.', 'surveillance');
  const s = new Set(cs.map((c) => c.sense));
  assert.ok(s.has('sensor'));
  assert.ok(!s.has('camera'), 'the negated "camera" must not become a sense');
});

test('a term never characterized yields nothing (no meaning invented)', () => {
  assert.deepEqual(characterize('The weather was cold and the road was long.', 'surveillance'), []);
});

// ── NON-FICTION · a civic procurement — "surveillance" ──────────────────────────────────────────
test('non-fiction: the four sources disagree on what "surveillance" is, and re-basis reorders', () => {
  const sources = [
    { id: 'budget', label: 'the budget hearing',
      text: 'Surveillance is a line item. In the vendor contract, surveillance is a line item. Officials described surveillance as a capability.' },
    { id: 'court', label: 'the court filing',
      text: 'Surveillance is a thing done to people. In the motion, surveillance is a thing done to residents. The court treated surveillance as a legal exposure.' },
    { id: 'press', label: 'the press release',
      text: 'Surveillance is a partnership. The release framed surveillance as a partnership with business. Surveillance is a public service.' },
  ];
  const model = disagree(sources, 'surveillance');
  assert.ok(sourcesDisagree(model), 'the sources should genuinely disagree');
  // each source leans on its own dominant meaning
  assert.equal(topSense(model, 'budget'), 'item');
  assert.equal(topSense(model, 'court'), 'thing');
  assert.equal(topSense(model, 'press'), 'partnership');
  // the same word, two bases, two different things
  assert.notEqual(topSense(model, 'budget'), topSense(model, 'court'));
  // 'everyone' is the sum — no source double-counted
  const total = (sense) => model.meanings.find((m) => m.sense === sense).by;
  assert.equal(Object.values(total('item')).reduce((a, b) => a + b, 0), 2);
});

// ── FICTION · two narrators — "the monster" ─────────────────────────────────────────────────────
test('fiction: two narrators mean opposite things by "the monster"', () => {
  const sources = [
    { id: 'villagers', label: 'the villagers',
      text: 'The monster is a beast. To them, the monster is a beast that hunts. The monster is a killer.' },
    { id: 'girl', label: 'the girl',
      text: 'The monster is a friend. In her eyes, the monster is a friend who protects. The monster is a companion.' },
  ];
  const model = disagree(sources, 'the monster');
  assert.ok(sourcesDisagree(model));
  assert.equal(topSense(model, 'villagers'), 'beast');
  assert.equal(topSense(model, 'girl'), 'friend');
  assert.ok(senses(model).has('killer') && senses(model).has('companion'), 'the minor readings survive too');
});

// ── ACADEMIC · one word, three disciplines — "power" ────────────────────────────────────────────
test('academic: "power" is a different construct in statistics, physics, and sociology', () => {
  const sources = [
    { id: 'stats', label: 'the statistics paper',
      text: 'In hypothesis testing, power is the probability of rejecting a false null. Power is the probability of detecting an effect. Power is a probability.' },
    { id: 'physics', label: 'the physics paper',
      text: 'In mechanics, power is a rate. Power is the rate of doing work. Power is a rate of energy transfer.' },
    { id: 'sociology', label: 'the sociology paper',
      text: 'In social theory, power is a relation of domination. Power is a relation of control. Power is a form of authority.' },
  ];
  const model = disagree(sources, 'power');
  assert.ok(sourcesDisagree(model));
  assert.equal(topSense(model, 'stats'), 'probability');
  assert.equal(topSense(model, 'physics'), 'rate');
  assert.equal(topSense(model, 'sociology'), 'relation');
  // three disciplines, three incompatible constructs under the one word
  assert.equal(new Set(['stats', 'physics', 'sociology'].map((b) => topSense(model, b))).size, 3);
});

// ── Agreement is not disagreement ───────────────────────────────────────────────────────────────
test('when the sources agree, sourcesDisagree is false (nothing to show)', () => {
  const sources = [
    { id: 'a', label: 'A', text: 'A camera is a device. The camera is a device that records.' },
    { id: 'b', label: 'B', text: 'A camera is a device. Here too, a camera is a device.' },
  ];
  assert.equal(sourcesDisagree(disagree(sources, 'camera')), false);
});

test('the dropdown offers everyone plus only the sources that use the word', () => {
  const sources = [
    { id: 'x', label: 'X', text: 'Trust is a bond.' },
    { id: 'y', label: 'Y', text: 'Nothing relevant here.' },
    { id: 'z', label: 'Z', text: 'Trust is a risk.' },
  ];
  const model = disagree(sources, 'trust');
  const bases = basesOf(model.meanings.map((m) => ({ label: m.label, by: m.by })), model.bases);
  assert.deepEqual(bases, ['everyone', 'x', 'z']); // Y never characterizes "trust", so it is not offered
});
