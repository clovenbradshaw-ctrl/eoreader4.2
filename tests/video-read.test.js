import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lumaGrid, fitDims, corefByLabel, compactVisual, analyzeFrames } from '../src/rooms/reader/video-read.js';
import { searchMoments } from '../src/surfer/moment.js';

// The reader's video thread. extractVideoFrames touches the DOM (unpinnable in Node, like the audio
// decode); the ORCHESTRATION — reading the structure, gating the model to one keyframe per shot,
// coref across cuts, and assembling span annotations — takes its frames, its keyframe grabber and its
// vision organ as inputs, so it is driven here with synthetic frames and fakes.

const solid = (W, H, v) => Array.from({ length: H }, () => Array.from({ length: W }, () => v));

test('lumaGrid: RGBA bytes reduce to a luminance grid at the same dimensions', () => {
  // 2×1 image: pure white then pure black.
  const data = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
  const g = lumaGrid(data, 2, 1);
  assert.equal(g.length, 1);
  assert.ok(Math.abs(g[0][0] - 1) < 1e-6);
  assert.ok(Math.abs(g[0][1] - 0) < 1e-6);
});

test('fitDims: fits the long side to maxDim, keeps aspect, never upscales', () => {
  assert.deepEqual(fitDims(1920, 1080, 96), { w: 96, h: 54 });
  assert.deepEqual(fitDims(40, 30, 96), { w: 40, h: 30 });   // already small — not upscaled
});

test('corefByLabel: the same concept across shots folds to one tracked figure id', () => {
  const byShot = [
    { regions: [{ label: 'drone' }, { label: 'car' }] },
    { regions: [{ label: 'Drone' }] },                       // same figure, different casing
    { regions: [{ label: 'tree' }] },
  ];
  corefByLabel(byShot);
  assert.equal(byShot[0].regions[0].entityId, byShot[1].regions[0].entityId);   // both drones → one id
  assert.notEqual(byShot[0].regions[0].entityId, byShot[0].regions[1].entityId); // drone ≠ car
});

test('analyzeFrames without a vision organ reads the structure only, and says so', async () => {
  const A = Array.from({ length: 4 }, () => solid(8, 8, 0.1));
  const B = Array.from({ length: 4 }, () => solid(8, 8, 0.9));
  const res = await analyzeFrames({ frames: [...A, ...B], fps: 2, name: 'clip' });
  assert.equal(res.visionByShot.length, 0);
  assert.equal(res.coverage.shots, 2);
  assert.ok(res.coverage.dropped[0].includes('not named'));
  assert.ok(res.doc && res.doc.modality === 'video');
  // Even without CV the index is useful — the dwells are in it.
  assert.ok(res.annotations.some((a) => a.kind === 'dwell'));
});

test('analyzeFrames gates the vision model to ONE keyframe per shot, and ties concepts to the span', async () => {
  const A = Array.from({ length: 5 }, () => solid(8, 8, 0.1));
  const B = Array.from({ length: 5 }, () => solid(8, 8, 0.9));
  const frames = [...A, ...B];   // one cut → two shots

  const grabbed = [];
  const grabKeyframe = async (frameIndex) => { grabbed.push(frameIndex); return { fake: true, frameIndex }; };
  // A fake vision organ: shot in scene A sees a podium; scene B sees a drone. describe() called per keyframe.
  let calls = 0;
  const vision = {
    model: 'fake-vision',
    describe: async (blob) => {
      calls++;
      const inB = blob.frameIndex >= 5;
      return inB
        ? { caption: 'a drone over a lot', regions: [{ label: 'drone', bbox: [0, 0, 4, 4] }], width: 8, height: 8, bboxFormat: 'xywh', witness: 'fake-vision' }
        : { caption: 'a person at a podium', regions: [{ label: 'podium', bbox: [1, 1, 3, 3] }], width: 8, height: 8, bboxFormat: 'xywh', witness: 'fake-vision' };
    },
  };
  const res = await analyzeFrames({ frames, fps: 2, name: 'clip', grabKeyframe, vision });

  assert.equal(calls, 2, 'exactly one describe() per shot — the gating');
  assert.equal(grabbed.length, 2);
  assert.equal(res.visionByShot.length, 2);
  // The drone concept is anchored to the SECOND shot's span (t ≥ 2.5s at fps 2).
  const droneAnn = res.annotations.find((a) => a.kind === 'seen' && a.terms.includes('drone'));
  assert.ok(droneAnn && droneAnn.span[0] >= 2.5);
  // And it's searchable: "drone" resolves to that span as a witnessed match.
  const hits = searchMoments(res.index, { terms: ['drone'] });
  assert.ok(hits.length >= 1 && hits[0].span[0] >= 2.5);
  assert.equal(res.coverage.namedShots, 2);
});

test('analyzeFrames grabs a keyframe thumbnail per shot even without a vision organ (cheap pass)', async () => {
  const A = Array.from({ length: 5 }, () => solid(8, 8, 0.1));
  const B = Array.from({ length: 5 }, () => solid(8, 8, 0.9));
  const grabbed = [];
  const grabKeyframe = async (i) => { grabbed.push(i); return { i }; };
  const res = await analyzeFrames({ frames: [...A, ...B], fps: 2, name: 'clip', grabKeyframe });   // no vision
  assert.equal(grabbed.length, 2, 'one keyframe grabbed per shot (for the strip thumbnail)');
  assert.equal(res.visionByShot.length, 0, 'but nothing is named without a vision organ');
  assert.ok(res.coverage.dropped[0].includes('not named'));
});

test('analyzeFrames survives a vision fault on one shot without failing the whole read', async () => {
  const A = Array.from({ length: 4 }, () => solid(8, 8, 0.1));
  const B = Array.from({ length: 4 }, () => solid(8, 8, 0.9));
  const grabKeyframe = async (i) => ({ i });
  let n = 0;
  const vision = { describe: async () => { n++; if (n === 1) throw new Error('decode failed'); return { caption: 'a tree', regions: [{ label: 'tree', bbox: [0, 0, 2, 2] }], width: 8, height: 8, bboxFormat: 'xywh' }; } };
  const res = await analyzeFrames({ frames: [...A, ...B], fps: 2, name: 'clip', grabKeyframe, vision });
  assert.equal(res.visionByShot.length, 1);                   // one shot named, one faulted — read still stands
  assert.ok(res.coverage.dropped.some((d) => d.includes('could not be named')));
});

test('compactVisual produces a snapshot-friendly reading with thumbs and dwells', async () => {
  const A = Array.from({ length: 5 }, () => solid(10, 10, 0.15));
  const B = Array.from({ length: 5 }, () => solid(10, 10, 0.85));
  const res = await analyzeFrames({ frames: [...A, ...B], fps: 2, name: 'clip' });
  res.visual.keyframeThumbs = { [res.visual.shots.shots[0].keyframe]: 'data:image/jpeg;base64,AAAA' };
  const c = compactVisual(res.visual);
  assert.equal(c.shotCount, 2);
  assert.equal(c.cutCount, 1);
  assert.ok(Array.isArray(c.peaks) && c.peaks.length > 0);
  assert.ok(c.shots[0].thumb === 'data:image/jpeg;base64,AAAA');
  assert.ok(Array.isArray(c.shots) && typeof c.shots[0].t === 'number');
});
