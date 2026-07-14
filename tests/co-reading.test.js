import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  coReadAt, positionThread, combineThreads, surfFold,
} from '../src/surfer/index.js';
import { createDeepReader } from '../src/surfer/fold/index.js';
import { canWitness } from '../src/core/index.js';
import { parseText } from '../src/perceiver/parse/index.js';

// CO-READING (surfer/co-read.js) — the deep-reading loop tethered to the human's POSITION. Idle,
// the reading surfs to the document's own steepest structure; co-reading points that same
// mechanism at the reader: where the eye sits becomes the salience thread (positionThread), the
// surfer's peak is re-weighted toward it, and — only if the place beats the reach's band — ONE
// reflection fires in the margin of THAT place. Firewalled like every reflection: an enacted EVA,
// reafferent, band void, canWitness false BY TYPE — a margin-thought can never launder into a fact.

const BOOK =
  'Gregor woke to find himself changed. His body was hard and armored. ' +
  'The family gathered at the door and would not enter. Grete brought him food but looked away. ' +
  'The chief clerk arrived and demanded an explanation. Gregor could not make himself understood. ' +
  'His father drove him back with a stick. The apple lodged in his back and festered. ' +
  'Grete decided the creature was no longer her brother. In the morning the charwoman found him dead.';

const bookDoc = () => parseText(BOOK, { docId: 'metamorphosis.txt', genderCoref: true });

// ── positionThread — the reader's place as an activated |T⟩ state ─────────────────────────────

test('positionThread: the passage under the eye becomes the thread — its own terms and figures', () => {
  const doc = bookDoc();
  const t = positionThread(doc, 3, { reach: 1 });          // "Grete brought him food but looked away."
  assert.ok(t.terms.size > 0, 'the passage under the eye carries terms');
  assert.ok(t.terms.has('grete') || t.terms.has('food'), 'the terms are the passage the reader is on');
  // the sentence under the eye pulls hardest; a neighbour is γ-decayed below it.
  const focusW = t.terms.get('grete') || 0;
  assert.ok(focusW >= 0.7, 'the focused line is weighted fullest');
  assert.ok(t.figures instanceof Set, 'figures resolve against the doc');
});

test('positionThread: an empty doc or a non-index conditions nothing (byte-identical to unseeded)', () => {
  const doc = bookDoc();
  assert.equal(positionThread({}, 3).terms.size, 0, 'no sentences → no thread');
  assert.equal(positionThread(doc, null).terms.size, 0, 'a non-index → no thread');
  assert.equal(positionThread(doc, 'x').terms.size, 0, 'a non-integer → no thread');
});

test('positionThread: the window clamps to the document, never throws off the ends', () => {
  const doc = bookDoc();
  assert.doesNotThrow(() => positionThread(doc, -5));
  assert.doesNotThrow(() => positionThread(doc, 9999));
  assert.ok(positionThread(doc, 9999).terms.size > 0, 'a past-the-end position clamps to the tail');
});

// ── combineThreads — position composes with a live chat thread ────────────────────────────────

test('combineThreads: term weights sum and figure sets union; an empty side passes the other through', () => {
  const a = { terms: new Map([['grete', 1], ['food', 0.5]]), figures: new Set(['grete']) };
  const b = { terms: new Map([['grete', 0.4], ['apple', 1]]), figures: new Set(['gregor']) };
  const c = combineThreads(a, b);
  assert.equal(c.terms.get('grete'), 1.4, 'shared terms sum');
  assert.equal(c.terms.get('apple'), 1, 'the other thread\'s terms carry through');
  assert.deepEqual([...c.figures].sort(), ['gregor', 'grete'], 'figure sets union');
  const empty = { terms: new Map(), figures: new Set() };
  assert.equal(combineThreads(a, empty).terms.get('food'), 0.5, 'an empty side passes the other through');
  assert.equal(combineThreads(empty, b).terms.get('apple'), 1, 'either side may be empty');
});

// ── coReadAt — position → salience → deepRead at the peak, firewalled ──────────────────────────

test('coReadAt surfs to a place near the reader and reflects there, firewalled', () => {
  const doc = bookDoc();
  const before = doc.log.length;
  const r = coReadAt(doc, 3, { surf: surfFold });
  assert.ok(r, 'the reading caught on something near where the reader is');
  assert.ok(Number.isInteger(r.peak), 'it reflected at a real cursor — the salience-weighted peak');
  assert.ok(r.body.length > 0, 'the margin-thought has a body');
  assert.equal(r.committed, true, 'it was deposited on the log');
  assert.equal(doc.log.length, before + 1, 'exactly one event appended');
  // THE FIREWALL — reafferent, cannot witness, held at band void.
  assert.equal(r.canWitness, false, 'a margin-thought can never witness anything as world (§8)');
  const appended = doc.log.snapshot().at(-1);
  assert.equal(appended.op, 'EVA', 'it landed as an enacted EVA — projectGraph skips EVA, so it is no depicted fact');
  assert.equal(appended.register, 'enacted');
  assert.equal(appended.band, 'void');
  assert.equal(appended.grounded, false);
});

test('the peak is TETHERED to the reader — different positions re-weight where the reflection lands', () => {
  // Idle deep reading has no thread: the peak is the document's own steepest structure, the same
  // wherever you start. Co-reading conditions the peak on the position, so reading in different
  // places can land the reflection in different places — the salience thread is doing work.
  const seen = new Set();
  const peaks = [];
  for (const pos of [1, 6, 9]) {
    const doc = bookDoc();
    const r = coReadAt(doc, pos, { surf: surfFold });
    if (r) peaks.push(r.peak);
  }
  assert.ok(peaks.length >= 2, 'the reader caught on something at more than one place');
  assert.ok(new Set(peaks).size >= 2, 'the peak moves with the reader — position re-weights salience');
  void seen;
});

test('the governor holds: with the band above every peak, coReadAt stays quiet (no narration of the flat)', () => {
  const doc = bookDoc();
  const before = doc.log.length;
  const r = coReadAt(doc, 3, { surf: surfFold, medianBand: 1e9 });   // an unreachable floor
  assert.ok(!r || r.worth === false, 'nothing beats the floor → the companion stays quiet');
  assert.equal(doc.log.length, before, 'a below-band place leaves the log untouched');
});

test('habituation: a place already co-read is not reflected on again when the eye returns (rumination cure)', () => {
  const doc = bookDoc();
  const visited = new Set();
  const first = coReadAt(doc, 3, { surf: surfFold, visited });
  assert.ok(first, 'the first glance caught something');
  assert.ok(visited.has(first.peak), 'the place is habituated');
  const again = coReadAt(doc, first.peak, { surf: surfFold, visited });
  assert.ok(!again || again.peak !== first.peak, 'dwelling on the same place does not re-fire the same thought');
});

test('a live chat thread composes with the position — coReadAt accepts a thread to steer alongside the eye', () => {
  const doc = bookDoc();
  const chat = { terms: new Map([['grete', 2]]), figures: new Set(['grete']) };
  assert.doesNotThrow(() => coReadAt(doc, 6, { surf: surfFold, thread: chat }));
});

test('coReadAt defaults surf to surfFold, rejects an explicit bad surf, and a logless doc yields null', () => {
  assert.doesNotThrow(() => coReadAt(bookDoc(), 3), 'surf defaults to surfFold — the caller need not inject it');
  assert.throws(() => coReadAt(bookDoc(), 3, { surf: null }), /surf.*must be injected/, 'an explicit non-function surf is rejected');
  assert.equal(coReadAt({}, 3, { surf: surfFold }), null, 'a doc without a log yields null, never a throw');
});

// ── reflectAt — the governed reader reflects at the human's place, sharing at-rest habituation ─

test('reflectAt: one governed pass at the reader\'s place, sharing the at-rest reader\'s habituation', () => {
  const doc = bookDoc();
  const reader = createDeepReader({ doc, surf: surfFold });
  const t = positionThread(doc, 3);
  const out = reader.reflectAt(3, { thread: t });
  assert.ok('reflection' in out, 'reflectAt returns a governed pass result');
  if (out.reflection) {
    assert.equal(out.reflection.canWitness, false, 'the firewall holds — reafferent by type');
    assert.ok(reader.visited.has(out.reflection.peak), 'the place enters the SHARED habituation set');
    // the eye returning to the same place does not re-fire it (shared with arrive()).
    const again = reader.reflectAt(out.reflection.peak, { thread: positionThread(doc, out.reflection.peak) });
    assert.ok(!again.reflection || again.reflection.peak !== out.reflection.peak, 'no re-reflection at a habituated place');
  }
  assert.ok(reader.isResting(), 'reflectAt does not leave the reader spinning — it rests after the one pass');
});
