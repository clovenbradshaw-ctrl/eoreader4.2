import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  renderStructured, TASK_SCHEMA, isKnownTask, isWitnessed, everySlotWitnessed, citeOf,
} from '../src/organs/out/speech/schema.js';
import { VOID_TOKEN } from '../src/enactor/index.js';

// STRUCTURE — the answer's typed frame (docs/response-structure.md). The property the
// free-prose path could never offer: every content slot of a rendered answer carries a
// witness, or the answer is a typed absence. These pin the two laws the frame inherits —
// witnessed-or-absent (from the gate) and unfillable-is-void (from answerability).

test('the cite renders in the house format, deduped and sorted', () => {
  assert.equal(citeOf([3]), ' [s3]');
  assert.equal(citeOf([7, 3, 3]), ' [s3, s7]');
  assert.equal(citeOf([]), '');
  assert.equal(citeOf([-1, null, undefined]), '');   // no real witness ⇒ no cite
});

test('a witnessed claim is one with at least one real sentence index', () => {
  assert.ok(isWitnessed({ text: 'x', sources: [0] }));
  assert.ok(!isWitnessed({ text: 'x', sources: [] }));
  assert.ok(!isWitnessed({ text: 'x', sources: [-1] }));
  assert.ok(!isWitnessed({ text: 'x' }));
});

test('answer: one grounded fact fills the frame and carries its cite', () => {
  const r = renderStructured({ task: 'answer', claims: [{ text: 'Balzac wrote it', sources: [3] }] });
  assert.equal(r.route, 'structured');
  assert.equal(r.text, 'Balzac wrote it [s3].');
  assert.deepEqual(r.sources, [3]);
  assert.equal(r.structure.void, false);
  assert.equal(r.structure.task, 'answer');
  assert.ok(everySlotWitnessed(r.structure));
});

test('answer: a reorient slot appends after the fact', () => {
  const r = renderStructured({ task: 'answer', claims: [
    { text: 'Father Goriot, by Balzac', sources: [0], role: 'fact' },
    { text: "We're still in the boarding house", sources: [2], role: 'reorient' },
  ] });
  assert.equal(r.text, "Father Goriot, by Balzac [s0]. We're still in the boarding house [s2]");
  assert.deepEqual(r.sources, [0, 2]);
});

test('list: several witnessed members render as a real list, each cited', () => {
  const r = renderStructured({ task: 'list', claims: [
    { text: 'Grete', sources: [4] },
    { text: 'the mother', sources: [4, 9] },
    { text: 'the father', sources: [11] },
  ] });
  assert.equal(r.structure.slots[0].role, 'member');
  assert.equal(r.structure.slots[0].claims.length, 3);
  assert.match(r.text, /- Grete \[s4\]/);
  assert.match(r.text, /- the mother \[s4, s9\]/);
  assert.deepEqual(r.sources, [4, 9, 11]);
  assert.ok(everySlotWitnessed(r.structure));
});

test('summary: framing claim, supports, and an optional tension slot', () => {
  const r = renderStructured({ task: 'summary', claims: [
    { text: 'It is a novel of thwarted paternal devotion', sources: [1], role: 'frame' },
    { text: 'Goriot ruins himself for his daughters', sources: [12], role: 'support' },
    { text: 'they abandon him', sources: [40], role: 'support' },
    { text: 'the narrator both pities and indicts him', sources: [55], role: 'tension' },
  ] });
  assert.match(r.text, /^It is a novel of thwarted paternal devotion \[s1\]\./);
  assert.match(r.text, /But the narrator both pities and indicts him \[s55\]$/);
  assert.deepEqual(r.sources, [1, 12, 40, 55]);
  assert.equal(r.structure.slots.find((s) => s.role === 'tension').claims.length, 1);
});

test('explain: figure then reasoning steps', () => {
  const r = renderStructured({ task: 'explain', claims: [
    { text: 'Gregor stays in his room because he cannot face the family', sources: [8], role: 'figure' },
    { text: 'his body shames him', sources: [9], role: 'step' },
    { text: 'and his voice is no longer understood', sources: [10], role: 'step' },
  ] });
  assert.match(r.text, /^Gregor stays in his room because he cannot face the family \[s8\]\./);
  assert.match(r.text, /his voice is no longer understood \[s10\]/);
  assert.ok(everySlotWitnessed(r.structure));
});

// ── witnessed-or-absent: the gate's law, made structural ──────────────────────────

test('an unwitnessed claim is DROPPED, never seated', () => {
  const r = renderStructured({ task: 'list', claims: [
    { text: 'Grete', sources: [4] },
    { text: 'a character the model invented', sources: [] },   // no witness ⇒ dropped
    { text: 'the father', sources: [11] },
  ] });
  assert.equal(r.structure.dropped, 1);
  assert.equal(r.structure.slots[0].claims.length, 2);
  assert.ok(!/invented/.test(r.text));                          // never reaches the surface
  assert.deepEqual(r.sources, [4, 11]);
  assert.ok(everySlotWitnessed(r.structure));                   // the invariant still holds
});

test('no unwitnessed source ever appears in a rendered structure', () => {
  const r = renderStructured({ task: 'summary', claims: [
    { text: 'a framing claim', sources: [2], role: 'frame' },
    { text: 'an ungrounded flourish', sources: [], role: 'support' },
  ] });
  for (const slot of r.structure.slots)
    for (const c of slot.claims)
      assert.ok(c.sources.length > 0, `slot ${slot.role} seated an unwitnessed claim`);
});

// ── unfillable-is-void: answerability's law ───────────────────────────────────────

test('a required slot with no witnessed claim renders the typed absence', () => {
  const verdict = { text: '"quokkas" is not in this document.', void: { kind: 'elsewhere', term: 'quokkas' } };
  const r = renderStructured({ task: 'answer', claims: [{ text: 'a hallucinated fact', sources: [] }], voidVerdict: verdict });
  assert.equal(r.route, 'void');
  assert.equal(r.text, '"quokkas" is not in this document.');   // the measured receipt, not a near-miss
  assert.deepEqual(r.sources, []);
  assert.equal(r.structure.void, true);
});

test('unfillable with no measured verdict falls back to the fixed conscience token', () => {
  const r = renderStructured({ task: 'summary', claims: [{ text: 'ungrounded', sources: [] }] });
  assert.equal(r.route, 'void');
  assert.equal(r.text, VOID_TOKEN);
  assert.equal(r.text, 'The text does not say.');               // never reworded
});

// ── inert: nothing to seat, nothing measured → the caller keeps its path ──────────

test('inert when there is neither a witnessed claim nor a void verdict', () => {
  assert.equal(renderStructured({ task: 'answer', claims: [] }), null);
  assert.equal(renderStructured({ task: 'answer' }), null);
});

test('inert on an unknown task', () => {
  assert.equal(renderStructured({ task: 'banter', claims: [{ text: 'hi', sources: [0] }] }), null);
  assert.ok(!isKnownTask('banter'));
  assert.ok(isKnownTask('summary'));
});

// ── the frame is total and cube-placed ────────────────────────────────────────────

test('every cube task has a schema, each slot typed and cube-placed', () => {
  for (const task of ['answer', 'list', 'explain', 'summary']) {
    const s = TASK_SCHEMA[task];
    assert.ok(s.cube && s.level, `${task} missing cube placement`);
    assert.ok(s.slots.length >= 1);
    assert.ok(s.slots.some((slot) => slot.required), `${task} has no required slot`);
    for (const slot of s.slots) assert.ok(['one', 'many', 'opt'].includes(slot.card));
  }
});

test('the rendered structure is JSON-serializable (audit/UI payload)', () => {
  const r = renderStructured({ task: 'answer', claims: [{ text: 'x', sources: [1] }] });
  assert.doesNotThrow(() => JSON.stringify(r.structure));
  assert.deepEqual(JSON.parse(JSON.stringify(r.structure)).slots[0].claims[0].sources, [1]);
});
