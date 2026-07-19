// The append-only frame channel (docs/referents-recursed-up-the-domain-axis.md, D5) — the
// referent verb-set recursed to the Lens/Paradigm grain. Same discipline, one Domain up:
// conflict defeats convergence, a split dominates a proposed merge, undo is a retraction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFrameChannel, foldFrames, evaluateFrameConvergence, frameIncommensurability } from '../src/surfer/frame-channel.js';

const COMMENSURABLE = { incommensurability: 0.10, baseline: 0.20 };   // 0.10 ≤ 0.20·1.5
const INCOMMENSURABLE = { incommensurability: 0.50, baseline: 0.20 }; // 0.50 > 0.20·1.5

test('a commensurable proposal converges and merges the two readings under one frame', () => {
  const ch = buildFrameChannel();
  const r = ch.proposeFrame(['a', 'b'], COMMENSURABLE);
  assert.equal(r.verdict, 'converge');
  assert.equal(ch.readingOf('a'), ch.readingOf('b'), 'both readings share one frame');
});

test('an incommensurable proposal is a conflict and merges nothing', () => {
  const ch = buildFrameChannel();
  const r = ch.proposeFrame(['a', 'b'], INCOMMENSURABLE);
  assert.equal(r.verdict, 'conflict');
  assert.equal(r.reason, 'incommensurable');
  assert.notEqual(ch.readingOf('a'), ch.readingOf('b'), 'two frames, held apart');
});

test('no measurable evidence stays held — never a silent merge', () => {
  const ch = buildFrameChannel();
  const r = ch.proposeFrame(['a', 'b'], {});
  assert.equal(r.verdict, 'held');
});

test('assertFrame forces the merge; retractFrame undoes it by appending', () => {
  const ch = buildFrameChannel();
  const { seqs } = ch.assertFrame(['a', 'b']);
  assert.equal(ch.readingOf('a'), ch.readingOf('b'));
  ch.retractFrame(seqs[0]);
  assert.notEqual(ch.readingOf('a'), ch.readingOf('b'), 'the retraction supersedes the merge');
});

test('splitFrame blocks a later commensurable re-merge (conflict dominates convergence)', () => {
  const ch = buildFrameChannel();
  ch.splitFrame(['a', 'b']);
  const r = ch.proposeFrame(['a', 'b'], COMMENSURABLE);
  assert.equal(r.verdict, 'conflict');
  assert.equal(r.reason, 'asserted-distinct');
  assert.notEqual(ch.readingOf('a'), ch.readingOf('b'));
});

test('evaluateFrameConvergence: the margin rule (cube.md #8 hysteresis)', () => {
  assert.equal(evaluateFrameConvergence('x', 'y', COMMENSURABLE).verdict, 'converge');
  assert.equal(evaluateFrameConvergence('x', 'y', INCOMMENSURABLE).verdict, 'conflict');
  assert.equal(evaluateFrameConvergence('x', 'y', {}).verdict, 'held');
});

test('foldFrames is a pure quotient over denotes / merge / split / retract', () => {
  const events = [
    { op: 'SYN', kind: 'frame-denotes', from: 's1', to: 'frame-1', seq: 0 },
    { op: 'SYN', kind: 'frame-denotes', from: 's2', to: 'frame-2', seq: 1 },
    { op: 'SYN', kind: 'frame-merge', from: 'frame-1', to: 'frame-2', seq: 2 },
  ];
  let f = foldFrames(events);
  assert.equal(f.readingOf('s1'), f.readingOf('s2'), 'merge unifies');

  // A split of the pair blocks the merge even though the merge event is still present.
  const withSplit = events.concat({ op: 'SYN', kind: 'frame-split', from: 'frame-1', to: 'frame-2', seq: 3 });
  f = foldFrames(withSplit);
  assert.notEqual(f.readingOf('s1'), f.readingOf('s2'), 'split dominates the merge');

  // Retracting the split lets the merge stand again.
  const retractSplit = withSplit.concat({ op: 'SEG', kind: 'retract', refSeq: 3, seq: 4 });
  f = foldFrames(retractSplit);
  assert.equal(f.readingOf('s1'), f.readingOf('s2'), 'retraction of the split restores the merge');
});

test('frameIncommensurability abstains (null) when either side is too thin to eigen-decompose', () => {
  const { incommensurability, baseline } = frameIncommensurability([[1, 0]], [[0, 1]], { rank: 3 });
  assert.equal(incommensurability, null);
  assert.equal(baseline, null);
});
