import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lumaGridFromImageData, targetDims, sampleTimes } from '../src/rooms/reader/video-frames.js';

// The video front-end — the browser half of the retina (rooms/reader/video-frames.js). The DECODE
// (a <video> + canvas) is browser-only and untestable here, exactly as whisper's decode is; but the
// pure reductions it hangs on — RGBA → luminance grid, the downsample framing, the sampling clock —
// are plain arithmetic, pinned here so the frames motion.js reads are the frames we think they are.

test('lumaGridFromImageData: Rec.601 luma, row-major, normalized to [0,1]', () => {
  // 2×2 RGBA: white, black / mid-gray, red.
  const data = new Uint8ClampedArray([
    255, 255, 255, 255,   0, 0, 0, 255,
    128, 128, 128, 255,   255, 0, 0, 255,
  ]);
  const grid = lumaGridFromImageData({ data, width: 2, height: 2 });
  assert.equal(grid.length, 2);              // rows = height
  assert.equal(grid[0].length, 2);           // cols = width
  assert.ok(Math.abs(grid[0][0] - 1) < 1e-9, 'white → 1');
  assert.equal(grid[0][1], 0, 'black → 0');
  assert.ok(Math.abs(grid[1][0] - 128 / 255) < 1e-9, 'mid-gray → ~0.5');
  assert.ok(Math.abs(grid[1][1] - 0.299) < 1e-3, 'pure red → the 0.299 luma coefficient');
});

test('lumaGridFromImageData: index order is (y·width + x)·4 — a column of the buffer maps to a column of the grid', () => {
  // A 3-wide, 2-tall image where only the middle-top pixel is lit.
  const data = new Uint8ClampedArray(3 * 2 * 4);
  const set = (x, y, v) => { const i = (y * 3 + x) * 4; data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255; };
  set(1, 0, 255);
  const grid = lumaGridFromImageData({ data, width: 3, height: 2 });
  assert.ok(Math.abs(grid[0][1] - 1) < 1e-9, 'the lit pixel lands at grid[y=0][x=1]');
  assert.equal(grid[0][0], 0); assert.equal(grid[1][1], 0);
});

test('targetDims: shrink the longer side to maxDim, keep aspect, never upscale', () => {
  assert.deepEqual(targetDims(1280, 720, 96), [96, 54], 'a 16:9 frame → 96×54');
  assert.deepEqual(targetDims(720, 1280, 96), [54, 96], 'portrait keeps its aspect');
  assert.deepEqual(targetDims(40, 40, 96), [40, 40], 'a small clip is not blown up');
  const [w, h] = targetDims(0, 0, 96);
  assert.ok(w >= 1 && h >= 1, 'a degenerate size still yields a drawable 1×1');
});

test('sampleTimes: samples at fps, caps the total, and drops fps rather than decode thousands of frames', () => {
  const s = sampleTimes(10, 3, 480);
  assert.equal(s.times.length, 30, '10s × 3fps = 30 frames');
  assert.ok(Math.abs(s.fps - 3) < 1e-9);
  assert.ok(s.times[0] > 0 && s.times[0] < 0.34, 'the first sample is a frame CENTRE, not t=0');
  assert.ok(s.times[s.times.length - 1] <= 10, 'no sample runs past the clip');

  const long = sampleTimes(1000, 3, 480);
  assert.equal(long.times.length, 480, 'a long clip is capped at maxFrames');
  assert.ok(long.fps < 3, 'so the effective fps drops instead');

  const zero = sampleTimes(0, 3, 480);
  assert.deepEqual(zero.times, [0], 'a zero-length clip still yields one frame to read');
});
