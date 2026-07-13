import { test } from 'node:test';
import assert from 'node:assert/strict';

import { videoStripVM, videoStatusVM, momentResultsVM, VIDEO_LENSES, videoClock } from '../src/rooms/reader/video-panel.js';

// The Listen surface's video leaf, as pure view-models — the strip/keyframes/dwell reading, the
// picture-read status + CTA, and the moment-search result rows. index.html renders these; here they
// are pinned without a DOM.

const META = {
  duration: 100, fps: 2, shotCount: 3, cutCount: 2, motionPct: 42, trackCount: 4,
  peaks: [{ amp: 0.1 }, { amp: 0.9 }, { amp: 0.2 }, { amp: 0.05 }],
  shots: [
    { start: 0, end: 40, keyframe: 10, t: 5, thumb: 'data:image/jpeg;base64,AAAA' },
    { start: 40, end: 70, keyframe: 100, t: 50, thumb: null },
    { start: 70, end: 100, keyframe: 160, t: 80, thumb: 'data:image/jpeg;base64,BBBB' },
  ],
  dwells: [
    { start: 12, end: 84, dur: 72, verdict: 'present-still' },
    { start: 90, end: 96, dur: 6, verdict: 'void' },
  ],
};

test('videoClock formats seconds as m:ss', () => {
  assert.equal(videoClock(0), '0:00');
  assert.equal(videoClock(65), '1:05');
  assert.equal(videoClock(5), '0:05');
});

test('videoStripVM: bars tint active vs calm, cuts mark boundaries, keyframes carry thumbs and times', () => {
  const vm = videoStripVM(META, {});
  assert.equal(vm.bars.length, 4);
  assert.equal(vm.bars[1].bg, '#6D5EF5');          // the loud column is active (accent)
  assert.equal(vm.bars[0].bg, '#D7D3F2');          // a quiet column is calm (faint)
  assert.equal(vm.cuts.length, 2);                 // the two shot starts after t0
  assert.equal(vm.keyframes.length, 3);
  assert.equal(vm.keyframes[0].hasThumb, true);
  assert.equal(vm.keyframes[1].hasThumb, false);
  assert.equal(vm.keyframes[2].label, '1:20');     // t=80 → 1:20
  assert.equal(vm.dwells.length, 2);
  assert.ok(vm.dwells[0].durLabel.startsWith('holds'));
  assert.ok(vm.stats.some((s) => s.label === 'Shots' && s.val === '3'));
});

test('videoStripVM: a lens turned off drops its projection (the suite of processing options)', () => {
  const vm = videoStripVM(META, { activity: false, keyframes: false });
  assert.equal(vm.hasBars, false);
  assert.equal(vm.hasKeyframes, false);
  assert.equal(vm.hasDwells, true);                // the others still project
  assert.ok(VIDEO_LENSES.length === 4);
});

test('videoStatusVM: reads the pass state and offers the right CTA', () => {
  assert.equal(videoStatusVM(null, null).show, false);
  const running = videoStatusVM({ state: 'running', pct: 40, cv: true }, META);
  assert.ok(running.busy && /Naming/.test(running.label));
  const structureOnly = videoStatusVM({ state: 'done', cv: false }, META);
  assert.equal(structureOnly.ctaLabel, 'Name the shots');   // read but not named → offer naming
  const named = videoStatusVM({ state: 'done', cv: true, named: 3 }, META);
  assert.ok(/Named 3 of 3/.test(named.label) && named.ctaLabel === 'Re-name');
  const err = videoStatusVM({ state: 'error', reason: 'no picture' }, META);
  assert.ok(/failed/.test(err.label) && err.ctaLabel === 'Try again');
});

test('momentResultsVM: verdict badges and witnesses, ready to render and seek', () => {
  const rows = momentResultsVM([
    { span: [40, 42.4], dur: 2.4, verdict: 'match', why: 'drone — 2 witnesses', witness: [{ kind: 'said', text: 'drone', witness: 'whisper' }, { kind: 'seen', text: 'a drone over a lot', witness: 'florence-2' }] },
    { span: [120, 130], dur: 10, verdict: 'indeterminate', why: 'partial', witness: [{ kind: 'seen', text: 'car', witness: 'florence-2' }] },
  ]);
  assert.equal(rows[0].isMatch, true);
  assert.equal(rows[0].badge, 'match');
  assert.equal(rows[0].t, 40);
  assert.equal(rows[0].range, '0:40–0:42');
  assert.equal(rows[0].witness.length, 2);
  assert.equal(rows[1].isMatch, false);
  assert.equal(rows[1].badge, 'maybe');
});
