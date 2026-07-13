import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  frameDeltas, motionPeaks, analyzeMotion, detectCuts, separateShots,
  backgroundPlate, presenceTrack, persistence, dwellsLongerThan,
  motionMask, ingestMotion, readVideo,
} from '../src/organs/in/motion.js';
import { ingestFrames } from '../src/organs/in/video.js';

// The video "retina" is the pre-transcription reading of the picture — the cochlea's twin
// (organs/in/acoustic.js). Node has no <video> and no canvas, so — exactly as the acoustic tests
// drive the sample math directly — these drive the frame math directly: synthetic luminance grids
// f[y][x] ∈ [0,1] in, the cut/shot/motion structure out. The extraction (canvas) is browser-only
// and unpinnable here, as the audio decode is; the reading it feeds is pinned here.

// A W×H frame filled with one luminance.
const solid = (W, H, v) => Array.from({ length: H }, () => Array.from({ length: W }, () => v));
// A W×H dark frame with a bright r×r block whose top-left is (x,y) — a thing the eye can follow.
const block = (W, H, x, y, r = 3, fg = 1, bg = 0) => {
  const f = solid(W, H, bg);
  for (let dy = 0; dy < r; dy++) for (let dx = 0; dx < r; dx++) {
    const yy = y + dy, xx = x + dx;
    if (yy >= 0 && yy < H && xx >= 0 && xx < W) f[yy][xx] = fg;
  }
  return f;
};

test('frameDeltas: identical frames read as no change; a wholesale flip reads as full change', () => {
  const still = [solid(8, 8, 0.3), solid(8, 8, 0.3), solid(8, 8, 0.3)];
  const d = frameDeltas(still);
  assert.equal(d.length, 3);
  assert.equal(d[0], 0);                       // nothing precedes the first frame
  assert.ok(d[1] < 1e-9 && d[2] < 1e-9);       // a still picture is flat
  const flip = frameDeltas([solid(8, 8, 0), solid(8, 8, 1)]);
  assert.ok(Math.abs(flip[1] - 1) < 1e-9);     // black → white is a change of 1.0 everywhere
});

test('detectCuts / separateShots: a hard cut yields exactly one boundary and two shots', () => {
  // Five frames of a dark scene, then five of a bright scene — one wholesale change at frame 5.
  const A = Array.from({ length: 5 }, () => solid(8, 8, 0.1));
  const B = Array.from({ length: 5 }, () => solid(8, 8, 0.85));
  const frames = [...A, ...B];
  const cuts = detectCuts(frameDeltas(frames));
  assert.deepEqual(cuts, [5]);                 // the cut is the first frame of scene B
  const shots = separateShots(frames, 2);
  assert.equal(shots.shotCount, 2);
  assert.equal(shots.cutCount, 1);
  // The shots tile the clock with no gap, and each keyframe sits inside its own shot.
  assert.equal(shots.shots[0].frame0, 0);
  assert.equal(shots.shots[1].frame0, 5);
  assert.ok(shots.shots[0].keyframe >= 0 && shots.shots[0].keyframe < 5);
  assert.ok(shots.shots[1].keyframe >= 5 && shots.shots[1].keyframe < 10);
  assert.ok(shots.shots[1].cutIn === true);    // the second shot opens on a cut
});

test('separateShots: a picture that never changes reads as one continuous shot, no cuts', () => {
  const frames = Array.from({ length: 12 }, () => solid(10, 10, 0.5));
  const shots = separateShots(frames, 2);
  assert.equal(shots.cutCount, 0);
  assert.equal(shots.shotCount, 1);
  assert.equal(shots.shots[0].start, 0);
});

test('analyzeMotion: a still clip is mostly still with no cuts; brightness is read back', () => {
  const still = Array.from({ length: 10 }, () => solid(8, 8, 0.5));
  const a = analyzeMotion(still, 4);
  assert.equal(a.frameCount, 10);
  assert.equal(a.fps, 4);
  assert.ok(Math.abs(a.duration - 2.5) < 1e-9);
  assert.equal(a.cuts, 0);
  assert.ok(a.stillPct >= 99);
  assert.ok(a.motionPct <= 1);
  assert.ok(Math.abs(a.luminance - 0.5) < 1e-9);
});

test('motionPeaks: a drawable envelope, one spike aligned to the cut', () => {
  const frames = [...Array.from({ length: 4 }, () => solid(8, 8, 0)),
                  ...Array.from({ length: 4 }, () => solid(8, 8, 1))];
  const peaks = motionPeaks(frames, 2, 8);     // one column per frame
  assert.equal(peaks.length, 8);
  const loudest = peaks.reduce((m, p, i) => (p.amp > peaks[m].amp ? i : m), 0);
  assert.equal(loudest, 4);                    // the change lands at frame 4 (dark → bright)
});

test('motionMask: only the pixels that changed light up, and never on the first frame', () => {
  const f0 = solid(6, 6, 0);
  const f1 = block(6, 6, 1, 1, 2, 1, 0);       // a 2×2 bright block appears
  const mask = motionMask([f0, f1], { thresh: 0.5 });
  assert.equal(mask[0].flat().reduce((a, b) => a + b, 0), 0);   // nothing before the first frame
  assert.equal(mask[1][1][1], 1);              // a corner of the block changed
  assert.equal(mask[1][0][0], 0);              // untouched background stays dark
  assert.equal(mask[1].flat().reduce((a, b) => a + b, 0), 4);   // exactly the 2×2 block
});

test('ingestFrames: a block followed across the frames survives as one persistent track', () => {
  // A 3×3 bright block sliding right one pixel per frame — the circle-through-snow thesis of
  // organs/in/video.js: what persists towers over what flickers.
  const frames = Array.from({ length: 6 }, (_, i) => block(20, 12, 2 + i, 4, 3, 1, 0));
  const clip = ingestFrames({ name: 'slide', frames });
  const survivor = (clip.tracks || []).filter((t) => t.points.length >= 4);
  assert.ok(survivor.length >= 1, 'the moving block should be followed across most frames');
  assert.ok(survivor[0].points.length >= 4);
});

test('ingestMotion: shots land on the spine as readable, projectable entities', () => {
  const A = Array.from({ length: 4 }, () => solid(8, 8, 0.1));
  const B = Array.from({ length: 4 }, () => solid(8, 8, 0.9));
  const frames = [...A, ...B];
  const analysis = analyzeMotion(frames, 2);
  const shots = separateShots(frames, 2);
  const doc = ingestMotion({ name: 'clip', title: 'Clip', duration: analysis.duration, fps: 2, analysis, shots });
  assert.equal(doc.modality, 'video');
  assert.equal(doc.units.length, 2);           // one display line per shot
  assert.ok(/Shot/.test(doc.text));
  // The log carries the shots as INS entities the projection can read.
  const ins = doc.log.events.filter((e) => e.op === 'INS');
  assert.ok(ins.length >= 2);
  const g = doc.projectGraph();
  assert.ok(g.entities && g.entities.size >= 2);
  // shotAt resolves a clock time to the shot on screen — what a strip/keyframe click uses.
  const s0 = doc.shotAt(0.1), s1 = doc.shotAt(3.0);
  assert.ok(s0 && s1 && s0.id !== s1.id);
});

test('backgroundPlate / presenceTrack: a foreground that comes and goes resolves to the scene behind it', () => {
  // A thing occupies the middle of only 3 of 9 frames — the median plate is the empty scene, and the
  // presence track spikes exactly on the frames the thing is there.
  const empty = () => solid(6, 6, 0.2);
  const withThing = () => block(6, 6, 2, 2, 2, 0.9, 0.2);
  const frames = [empty(), empty(), empty(), withThing(), withThing(), withThing(), empty(), empty(), empty()];
  const bg = backgroundPlate(frames);
  assert.ok(Math.abs(bg[0][0] - 0.2) < 1e-9);          // background is the empty scene, not the thing
  assert.ok(Math.abs(bg[2][2] - 0.2) < 1e-9);          // even where the thing sometimes sits (median wins)
  const pres = presenceTrack(frames, bg);
  assert.ok(pres[4] > pres[0]);                         // the thing is present mid-clip, absent at the ends
  assert.ok(pres[0] < 1e-6);
});

test('persistence: the clip decomposes into events and typed dwells before any model runs', () => {
  // Empty → a thing appears and holds still → the thing leaves. Two surprises bracketing one dwell.
  const empty = () => solid(8, 8, 0.2);
  const held = () => block(8, 8, 3, 3, 3, 0.95, 0.2);
  const frames = [empty(), empty(), empty(), held(), held(), held(), held(), held(), empty(), empty(), empty()];
  const p = persistence(frames, 2, { minDwell: 0.4 });
  assert.equal(p.cameraCompensated, false);            // the fixed-camera reading (deltas + plate)
  assert.ok(p.events.length >= 2, 'the appearance and the departure are both surprises');
  const still = p.dwells.filter((dw) => dw.verdict === 'present-still');
  const voids = p.dwells.filter((dw) => dw.verdict === 'void');
  assert.ok(still.length >= 1, 'the held stretch reads as present-still');
  assert.ok(voids.length >= 1, 'the empty stretches read as void');
  assert.ok(still[0].presence > (voids[0] ? voids[0].presence : 0));   // present-still carries more than void
  assert.ok(still[0].dur >= 1);                         // ~2s of holding still
});

test('persistence: a brief occlusion does not end a dwell — the interval spans the gap', () => {
  // Mostly the empty scene (so the median plate reads empty): a thing appears and holds, is crossed
  // in front of for one frame, holds again in the same place, then leaves. The hold is one dwell.
  const empty = () => solid(10, 10, 0.15);
  const held = () => block(10, 10, 3, 3, 3, 0.95, 0.15);
  const cross = () => solid(10, 10, 0.7);              // a wholesale change for one frame (someone passes)
  const frames = [empty(), empty(), empty(), held(), held(), cross(), held(), held(), empty(), empty(), empty()];
  const p = persistence(frames, 2, { minDwell: 0.4, bridgeGap: 1.5 });
  const spanning = p.dwells.filter((dw) => dw.verdict === 'present-still' && dw.gaps.length >= 1);
  assert.ok(spanning.length >= 1, 'the dwell should span the occlusion as one revisable interval');
  assert.equal(spanning[0].gaps[0].verdict, 'indeterminate');
});

test('dwellsLongerThan: duration becomes a searchable predicate', () => {
  const dwells = [
    { verdict: 'present-still', dur: 12, start: 0, end: 12 },
    { verdict: 'present-still', dur: 3, start: 20, end: 23 },
    { verdict: 'void', dur: 30, start: 40, end: 70 },
  ];
  const long = dwellsLongerThan(dwells, 10);            // present-still stretches over 10s
  assert.equal(long.length, 1);
  assert.equal(long[0].dur, 12);
  assert.equal(dwellsLongerThan(dwells, 10, null).length, 2);   // any verdict: the 12s and the 30s void
});

test('readVideo: one call reads the whole picture — structure, envelope, and a landed doc', () => {
  const A = Array.from({ length: 5 }, () => solid(12, 12, 0.15));
  const B = Array.from({ length: 5 }, () => solid(12, 12, 0.8));
  const r = readVideo({ name: 'clip', title: 'Clip', frames: [...A, ...B], fps: 2 });
  assert.equal(r.shots.shotCount, 2);
  assert.ok(Array.isArray(r.peaks) && r.peaks.length > 0);
  assert.ok(r.analysis.cuts === 1);
  assert.ok(Array.isArray(r.tracks));          // the tracker ran (best-effort) without throwing
  assert.ok(r.persistence && Array.isArray(r.persistence.events) && Array.isArray(r.persistence.dwells));
  assert.ok(r.doc && r.doc.modality === 'video');
});
