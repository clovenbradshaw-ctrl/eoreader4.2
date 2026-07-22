import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createScrubber, isScrubber } from '../src/rooms/scrubber/poincare.js';
import { buildFoldTrace, nearestFoldIndex } from '../src/core/fold-trace.js';
import { buildWaveform } from '../src/weave/waveform/build.js';
import { cosineMetric } from '../src/weave/waveform/metric.js';

// ── The assembly-2 checkpoint (docs/coil-surfaces.md §2): dragging `pos` in a
// throwaway harness returns the correct nearest order_index for at least ten
// hand-checked positions across one document.

const wobble = (base, i, amp = 0.05) => base.map((x, d) => x + amp * Math.sin(i * 0.7 + d));
const N = 40;
const makeReading = () => {
  const units = [];
  for (let i = 0; i < N; i++) {
    const base = i < 20 ? [1, 0, 0] : [0, 1, 0];
    units.push({ id: `u${i}`, ordinal: i, span: { at: i }, field: wobble(base, i) });
  }
  return {
    units, metric: cosineMetric, segments: [], referents: [], sightings: [],
    vocab: { FOREGROUND: 'narrating', PRESENT: 'present', LATENT: 'orbited' },
    resolve: (span) => ({ at: span.at }),
    meta: { modality: 'toy', perceiverVersion: '1.0.0' },
  };
};

test('createScrubber: dragging pos returns the correct nearest order_index for ten hand-checked positions', () => {
  const model = buildWaveform(makeReading());
  const trace = buildFoldTrace(model, { readingId: 'doc-1' });
  const scrubber = createScrubber({ readingId: 'doc-1', foldTrace: trace });

  const hand = [0, 3, 7, 12, 19, 20, 21, 28, 35, 39];
  for (const p of hand) {
    const snap = scrubber.setPos(p);
    assert.equal(snap.fold_index, p, `pos ${p} should resolve to order_index ${p}`);
    assert.equal(trace[snap.fold_index].order_index, p);
    assert.equal(scrubber.foldIndex, p);
    assert.equal(scrubber.pos, p);
  }
});

test('createScrubber: pos clamps to the trace\'s own range', () => {
  const model = buildWaveform(makeReading());
  const trace = buildFoldTrace(model, { readingId: 'doc-1' });
  const scrubber = createScrubber({ readingId: 'doc-1', foldTrace: trace });

  scrubber.setPos(-5);
  assert.equal(scrubber.pos, 0);
  scrubber.setPos(9999);
  assert.equal(scrubber.pos, N - 1);
});

test('nearestFoldIndex: exact, boundary, and out-of-range positions on a synthetic contiguous trace', () => {
  const trace = Array.from({ length: 10 }, (_, i) => ({ pos_start: i, pos_end: i + 1, order_index: i }));
  assert.equal(nearestFoldIndex(trace, 0), 0);
  assert.equal(nearestFoldIndex(trace, 5), 5);
  assert.equal(nearestFoldIndex(trace, 9), 9);
  assert.equal(nearestFoldIndex(trace, -3), 0);
  assert.equal(nearestFoldIndex(trace, 50), 9);
  assert.equal(nearestFoldIndex([], 5), -1);
});

test('createScrubber: every subscriber sees the same pos in lock-step, and unsubscribe stops delivery', () => {
  const trace = Array.from({ length: 5 }, (_, i) => ({ pos_start: i, pos_end: i + 1, order_index: i }));
  const scrubber = createScrubber({ readingId: 'doc-2', foldTrace: trace });

  const seenA = [], seenB = [];
  const unsubA = scrubber.subscribe((snap) => seenA.push(snap.pos));
  scrubber.subscribe((snap) => seenB.push(snap.pos));

  scrubber.setPos(2);
  unsubA();
  scrubber.setPos(4);

  assert.deepEqual(seenA, [2], 'unsubscribed listener stops receiving updates');
  assert.deepEqual(seenB, [2, 4], 'still-subscribed listener sees every move');
});

test('createScrubber: setFoldTrace swaps the trace without dropping subscribers', () => {
  const traceA = Array.from({ length: 3 }, (_, i) => ({ pos_start: i, pos_end: i + 1, order_index: i }));
  const traceB = Array.from({ length: 3 }, (_, i) => ({ pos_start: i, pos_end: i + 1, order_index: i, tag: 'B' }));
  const scrubber = createScrubber({ readingId: 'doc-3', foldTrace: traceA });

  const seen = [];
  scrubber.subscribe((snap) => seen.push(snap));
  scrubber.setPos(2);
  scrubber.setFoldTrace(traceB);

  assert.equal(scrubber.foldTrace[0].tag, 'B');
  assert.equal(seen.length, 2, 'the swap itself notifies subscribers too');
});

test('isScrubber: identifies a real scrubber and rejects everything else', () => {
  assert.equal(isScrubber(createScrubber({})), true);
  assert.equal(isScrubber(null), false);
  assert.equal(isScrubber({}), false);
  assert.equal(isScrubber({ setPos: () => {} }), false);
});
