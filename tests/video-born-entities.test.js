import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  bornEntities, readVideo, ingestMotion, analyzeMotion, separateShots,
} from '../src/organs/in/motion.js';
import { ingestFrames } from '../src/organs/in/video.js';
import { ingestAudio, createCompositeDoc } from '../src/organs/in/index.js';
import { senseOfModality } from '../src/enactor/ground/index.js';
import { projectGraph } from '../src/core/index.js';

// EO entity detection over a video, by the BORN rule (docs/video-ingest.md, weave/chorus/born.js).
// A moving thing is recovered from the pixels the same way the ear recovers a word from a waveform
// and the replay page recovers a transcript from a corpus: not a hard threshold, but square-and-
// normalize the amplitudes and read the distribution. A track's persistence — the frames it survived
// — is its amplitude; the squaring is the signal-from-noise step. The circle that crosses the whole
// clip takes almost all the probability; the one-frame flickers of static split a vanishing remainder.
// motion.js is PURE (luminance grids in), so — like the acoustic reading — the whole thing is pinned
// browserlessly here; the canvas extraction that feeds it (video-frames.js) is browser-only.

// A W×H dark frame with a bright r×r block at (x,y) — a thing the retina can follow (as the shared
// test helper in video-structure.test.js).
const solid = (W, H, v) => Array.from({ length: H }, () => Array.from({ length: W }, () => v));
const block = (W, H, x, y, r = 3, fg = 1, bg = 0) => {
  const f = solid(W, H, bg);
  for (let dy = 0; dy < r; dy++) for (let dx = 0; dx < r; dx++) {
    const yy = y + dy, xx = x + dx;
    if (yy >= 0 && yy < H && xx >= 0 && xx < W) f[yy][xx] = fg;
  }
  return f;
};

test('bornEntities: squares persistence into a distribution that sums to one', () => {
  const b = bornEntities([
    { id: 'a', frames: 10 },
    { id: 'b', frames: 4 },
    { id: 'c', frames: 1 },
  ], { minFrames: 3 });
  const sum = b.distribution.reduce((s, t) => s + t.p, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, 'the born weights are a normalized distribution');
  // 10² : 4² : 1² = 100 : 16 : 1 over 117.
  const a = b.distribution.find((t) => t.id === 'a');
  assert.ok(Math.abs(a.p - 100 / 117) < 1e-9, 'the amplitude is squared, not linear');
  assert.ok(a.p > 0.85, 'the most-persistent track carries the lion’s share');
});

test('bornEntities: the squaring suppresses noise quadratically — the persistent thing dominates', () => {
  // One thing sighted across 12 frames, against ten one-frame flickers (a field of static).
  const tracks = [{ id: 'ball', frames: 12 }, ...Array.from({ length: 10 }, (_, i) => ({ id: `snow${i}`, frames: 1 }))];
  const b = bornEntities(tracks, { minFrames: 3 });
  const ball = b.distribution.find((t) => t.id === 'ball');
  // Linear share would be 12/22 ≈ 0.55; squared it is 144/154 ≈ 0.935 — that gap IS the born gate.
  assert.ok(ball.p > 0.9, 'squared, the persistent thing towers over the flickers');
  assert.equal(b.entities.length, 1, 'exactly the ball clears the floor; every grain is noise');
  assert.equal(b.entities[0].id, 'ball');
  for (const s of b.distribution.filter((t) => t.id !== 'ball')) assert.equal(s.entity, false);
});

test('bornEntities: mass, not just persistence — a big coherent blob beats many small specks', () => {
  // The hard case a real clip throws off: codec/static specks that flicker in place a few frames each,
  // so a frame COUNT ties them with the thing. Their MASS (pixels sighted) does not: a 60-px blob over
  // 6 frames carries 360, a 2-px speck over 6 frames carries 12. Squared, the blob dominates. The
  // caller passes tracks with `points:[{size}]` (video.js's shape) and mass is summed from them.
  const big = { id: 'ball', points: Array.from({ length: 6 }, () => ({ size: 60 })) };
  const specks = Array.from({ length: 20 }, (_, i) => ({ id: `speck${i}`, points: Array.from({ length: 6 }, () => ({ size: 2 })) }));
  const b = bornEntities([big, ...specks], { minFrames: 3 });
  assert.equal(b.distribution[0].id, 'ball', 'the mass, not the frame count, decides the winner');
  assert.ok(b.distribution[0].p > 0.8, 'the big blob takes the lion’s share once mass is squared');
  assert.equal(b.entities.length, 1, 'the specks fall below the floor despite persisting as long as the ball');
  assert.equal(b.distribution[0].amp, 360, 'the amplitude is the γ-mass (Σ blob size), not the frame count');
});

test('bornEntities: a one-frame sighting is never an entity (below the minimum), and empties are safe', () => {
  const b = bornEntities([{ id: 'x', frames: 2 }], { minFrames: 3 });
  assert.equal(b.entities.length, 0, 'two frames is under the floor — not yet a thing');
  assert.equal(b.distribution[0].p, 1, 'it still carries all the (tiny) mass — the reading is honest');
  const empty = bornEntities([], { minFrames: 3 });
  assert.equal(empty.measured, 0);
  assert.equal(empty.entities.length, 0);
  assert.deepEqual(empty.distribution, []);
});

test('the ball on static: readVideo recovers ONE moving thing, and it dominates the mass', () => {
  // A 3×3 disk marching right through sparse, ever-moving snow — the thesis of organs/in/video.js:
  // the disk is sighted every frame (persists), each grain flickers once (noise). Fed to the retina
  // directly as a lit-or-not field, which is the regime contiguity+persistence is built for.
  const W = 48, H = 28, N = 16;
  let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const frames = [];
  for (let i = 0; i < N; i++) {
    const f = solid(W, H, 0);
    for (let k = 0; k < 4; k++) { const x = (rnd() * W) | 0, y = (rnd() * H) | 0; f[y][x] = 0.9; }  // sparse snow
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) { const yy = 13 + dy, xx = 3 + i + dx; if (yy < H && xx < W) f[yy][xx] = 1; }
    frames.push(f);
  }
  const clip = ingestFrames({ name: 'ball', frames });
  const raw = (clip.tracks || []).map((tr) => ({ id: tr.id, frames: tr.points.length }));
  const b = bornEntities(raw, { minFrames: 3 });
  assert.ok(b.measured > 1, 'the retina followed many candidate blobs (the ball + the snow flickers)');
  const top = b.distribution[0];
  assert.ok(top.frames >= N - 2, 'the winner was sighted across almost the whole clip — the ball');
  assert.ok(top.p > 0.5, 'and it carries the majority of the moving mass, the snow suppressed below it');
});

test('ingestMotion: born entities land on the spine with an auditable verdict (DEF born + EVA)', () => {
  const A = Array.from({ length: 4 }, () => solid(8, 8, 0.1));
  const B = Array.from({ length: 4 }, () => solid(8, 8, 0.9));
  const frames = [...A, ...B];
  const analysis = analyzeMotion(frames, 2);
  const shots = separateShots(frames, 2);
  const tracks = [{ id: 'm0', label: 'moving thing', frames: 7, p: 0.82, amp: 7 }];
  const entities = { distribution: tracks, entities: tracks, measured: 9, floor: 1 / 9, minFrames: 3 };
  const doc = ingestMotion({ name: 'clip', title: 'Clip', duration: analysis.duration, fps: 2, analysis, shots, tracks, entities });

  // The moving thing is an INS entity; its born probability is a DEF; the verdict that KEPT it is an
  // EVA — so WHY it is an entity and not noise is on the record, exactly as the OCR quorum's election.
  assert.ok(doc.log.events.some((e) => e.op === 'INS' && e.id === 'm0'));
  const bornDef = doc.log.events.find((e) => e.op === 'DEF' && e.id === 'm0' && e.key === 'born');
  assert.ok(bornDef && bornDef.value === '0.820', 'the born probability is recorded as a DEF');
  assert.ok(doc.log.events.some((e) => e.op === 'EVA' && e.id === 'm0' && e.reason === 'born-entity'),
    'the entity verdict is an auditable EVA the reader can revert');
  assert.ok(/Born rule/.test(doc.text), 'the reading names the measure that found the things');
  assert.equal(doc.entities.measured, 9, 'the doc carries the full distribution, not just the survivors');
  assert.equal(doc.watched, true, 'a motion doc is a complete reading, not a clip awaiting its words');
});

test('a video composes with its transcript as ONE cross-modal reading (sight + hearing)', () => {
  // The picture (motion.js, modality video → SIGHT) and the words (audio.js, modality audio → HEARING)
  // of one clip fold into a single composite doc — the cross-modal reading docs/multimodal-eot-foundation.md
  // describes: two senses on one record, one entity graph, provenance retained per source.
  const frames = [...Array.from({ length: 4 }, () => solid(10, 10, 0.1)),
                  ...Array.from({ length: 4 }, () => solid(10, 10, 0.85))];
  const { doc: motion } = readVideo({ name: 'clip-video', title: 'Clip', frames, fps: 2 });
  assert.equal(motion.modality, 'video');
  assert.equal(senseOfModality(motion.modality), 'sight', 'the picture is read through the eye');

  const utterances = [{ start: 0, end: 1, words: [{ text: 'a', norm: 'a', start: 0, end: 0.3 }, { text: 'ball', norm: 'ball', start: 0.3, end: 1 }] }];
  const transcript = ingestAudio({ name: 'clip', duration: 4, device: 'wasm', witness: 'test', utterances });
  assert.equal(senseOfModality(transcript.modality), 'hearing', 'the words are read through the ear');

  const composite = createCompositeDoc([motion, transcript]);
  assert.ok(composite.isComposite, 'two senses of one clip fold into one doc');
  assert.deepEqual(Object.values(composite.modalityByDoc).sort(), ['audio', 'video'], 'both senses are recorded, held apart');
  // The union graph carries entities from BOTH senses — the shots the eye cut and the words the ear heard.
  const g = projectGraph(composite.log);
  assert.ok((g.entities?.size || 0) >= 3, 'the one record holds what moved AND what was said');
});
