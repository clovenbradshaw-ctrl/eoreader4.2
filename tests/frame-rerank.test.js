// The steer as a re-rank (docs/referents-recursed-up-the-domain-axis.md, prompting point 2).
// Point at the frame by arranging the material, never by naming it: spans that orbit the
// frame's barycenter sort to the front; a scattered frame is recovered from the material.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameRerank, frameDirection } from '../src/surfer/frame-rerank.js';

test('spans that overlap the frame lens sort to the front; the rest fall back', () => {
  const items = [
    { id: 'off1', vec: [0, 1, 0] },
    { id: 'on1', vec: [1, 0, 0] },
    { id: 'off2', vec: [0, 0, 1] },
    { id: 'on2', vec: [0.9, 0.1, 0] },
  ];
  const { ranked, direction } = frameRerank(items, { lens: [1, 0, 0] });
  assert.deepEqual(direction, [1, 0, 0]);
  assert.deepEqual(ranked.slice(0, 2).map((r) => r.id), ['on1', 'on2'], 'the on-frame spans lead');
  assert.ok(ranked[0].frameScore >= ranked[3].frameScore, 'scores are monotone down the ranking');
});

test('keep caps the survivors — selection, not just order', () => {
  const items = [
    { id: 'a', vec: [1, 0] }, { id: 'b', vec: [0.8, 0.2] }, { id: 'c', vec: [0, 1] },
  ];
  const { ranked } = frameRerank(items, { lens: [1, 0], keep: 2 });
  assert.equal(ranked.length, 2);
  assert.deepEqual(ranked.map((r) => r.id), ['a', 'b']);
});

test('ties keep original order — a re-rank cultivates, it does not shuffle', () => {
  const items = [{ id: 'x', vec: [1, 0] }, { id: 'y', vec: [1, 0] }, { id: 'z', vec: [1, 0] }];
  const { ranked } = frameRerank(items, { lens: [1, 0] });
  assert.deepEqual(ranked.map((r) => r.id), ['x', 'y', 'z']);
});

test('fold-before-gate: a scattered frame is recovered from the material (no lens given)', () => {
  // Five spans cluster near axis 0 (the real, scattered frame) and two are off on axis 2.
  const items = [
    { id: 's1', vec: [1, 0.1, 0] }, { id: 's2', vec: [0.9, 0, 0.1] }, { id: 's3', vec: [1, 0.2, 0] },
    { id: 'o1', vec: [0, 0, 1] }, { id: 's4', vec: [0.95, 0.05, 0] }, { id: 'o2', vec: [0, 0.1, 1] },
    { id: 's5', vec: [0.85, 0, 0] },
  ];
  const dir = frameDirection(items, { seed: 3 });
  assert.ok(dir[0] > dir[2], 'the recovered barycenter points at the cluster axis, not the outliers');
  const { ranked } = frameRerank(items, { seed: 3, keep: 3 });
  for (const r of ranked) assert.ok(r.id.startsWith('s'), 'the pooled orbit leads, the outliers drop');
});

test('nothing to point at → order held (no frame invented)', () => {
  const items = [{ id: 'a' }, { id: 'b' }];   // no vecs, no lens
  const { direction, ranked } = frameRerank(items, {});
  assert.equal(direction, null);
  assert.deepEqual(ranked.map((r) => r.id), ['a', 'b']);
});
