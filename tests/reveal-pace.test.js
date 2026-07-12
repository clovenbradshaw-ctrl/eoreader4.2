// The chat typewriter's pace (src/rooms/reader/reveal.js). This is the guard against the freeze
// regression: a fast backend used to leave the reveal crawling ~5 chars/frame behind, keeping the
// whole-app re-render pinned at 60fps for (answerLength/320) seconds after the answer settled —
// ~11.6s for a 3900-char answer. The property that MUST hold is that the catch-up length is
// BOUNDED and INDEPENDENT of answer length; these tests pin exactly that.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { REVEAL, revealStep, advanceReveal, framesToReveal } from '../src/rooms/reader/reveal.js';

const FRAME = 1000 / 60;   // ~16.7ms, a 60fps frame

test('catch-up frame count is BOUNDED and independent of answer length (the freeze property)', () => {
  // Whatever the answer length, revealing from a big backlog must take about the same, small
  // number of frames — never proportional to the length (that proportionality WAS the freeze).
  const short = framesToReveal(0, 400, FRAME);
  const long = framesToReveal(0, 4000, FRAME);
  const huge = framesToReveal(0, 40000, FRAME);
  assert.ok(long <= short + 2, `long (${long}) must not take materially more frames than short (${short})`);
  assert.equal(long, huge, 'a 4k and a 40k answer reveal in the same number of frames — length-independent');
  // Hard ceiling: the clamp (180) drained at the constant catch-up (900/s ≈ 15/frame) plus the
  // sub-threshold floor is well under ~40 frames (~0.6s). The old cap took 40000/320/FRAME ≈ 7500.
  assert.ok(huge < 40, `catch-up must be well under 40 frames; got ${huge}`);
});

test('the reveal always makes progress and lands exactly on full (never overshoots or stalls)', () => {
  for (const full of [1, 5, 23, 24, 25, 180, 181, 1000, 9999]) {
    let s = 0, guard = 0;
    while (s < full) {
      const next = advanceReveal(s, full, FRAME);
      assert.ok(next > s, `must advance: ${s} -> ${next} (full ${full})`);
      s = next;
      assert.ok(++guard < 100000, 'must terminate');
    }
    assert.equal(s, full, 'lands exactly on full, no overshoot');
  }
});

test('a slow live stream types at the gentle FLOOR (the typewriter feel is preserved)', () => {
  // A backlog under the fast threshold reveals at the floor pace, ~1-2 chars/frame — visibly typing.
  const step = revealStep(10, FRAME);
  assert.ok(step >= 1 && step <= 2, `slow-stream step should be a gentle 1-2 chars/frame, got ${step}`);
  assert.equal(revealStep(REVEAL.FAST_THRESHOLD, FRAME), Math.max(1, Math.round(REVEAL.FLOOR * FRAME / 1000)),
    'at/below the threshold the floor rate applies');
});

test('a large backlog uses the brisk CONSTANT catch-up rate (no exponential Zeno tail)', () => {
  // Above the threshold the rate is constant (not proportional to the backlog), so the step does
  // not shrink as the backlog shrinks — that constancy is what avoids the multi-second tail.
  const big = revealStep(5000, FRAME);
  const mid = revealStep(200, FRAME);
  assert.equal(big, mid, 'catch-up rate is constant above the threshold, not proportional to backlog');
  assert.equal(big, Math.max(1, Math.round(REVEAL.CATCHUP * FRAME / 1000)), 'uses the CATCHUP rate');
});

test('advanceReveal clamps a huge backlog so a burst can never queue the whole answer', () => {
  // Revealing the FIRST frame of a 10k-char burst must jump most of the way (clamp to MAX_BACKLOG),
  // not crawl from 0 — otherwise the tail is length-scaling again.
  const afterOneFrame = advanceReveal(0, 10000, FRAME);
  assert.ok(afterOneFrame >= 10000 - REVEAL.MAX_BACKLOG,
    `first frame must clamp to within MAX_BACKLOG of full; got ${afterOneFrame} for full 10000`);
});

test('a settled short answer is not clamped — it types out normally', () => {
  // A 100-char answer (< MAX_BACKLOG) is never snapped; it reveals gently from where it is.
  const next = advanceReveal(0, 100, FRAME);
  assert.ok(next > 0 && next < 100, `a short answer types out, not popped: 0 -> ${next}`);
});
