// Probe for "video ingest — EO entity detection by the Born rule" (docs/video-ingest.md).
// A ball crosses a field of TV static; the reading recovers it BY COUNTING ALONE — no vision model,
// no labels. Cheap, read-only, a runnable narrative. Run: node probes/video-born-entities.mjs
//
// It executes the REAL code paths (organs/in/video.js ingestFrames, motion.js bornEntities +
// readVideo). It prints a report; it asserts nothing — the regression guards are
// tests/video-born-entities.test.js and tests/video-structure.test.js. The point is to SEE, on the
// actual spine, the request made literal: "computer vision, EO entity detection using the born rule".
//
//   • CONTIGUITY  — lit pixels that touch are one blob (the ball is coherent; snow is dust).
//   • PERSISTENCE — a blob bound frame-to-frame; the ball is sighted every frame, each grain once.
//   • THE BORN RULE — square each track's persistence and normalize (weave/chorus/born.js): the
//     squaring suppresses the flickers QUADRATICALLY, so the ball takes almost all the one unit of
//     probability. Report the distribution; never the decision.

import { ingestFrames } from '../src/organs/in/video.js';
import { bornEntities, ingestMotion, analyzeMotion, separateShots } from '../src/organs/in/motion.js';

const h  = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`);
const kv = (k, v) => console.log(`  ${String(k).padEnd(30)} ${v}`);

// A deterministic PRNG — no Math.random, so the narrative is the same every run.
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

// Build the clip: a 3×3 ball marching right, one pixel per frame, through 4 sparse one-frame snow
// grains scattered fresh every frame. Lit-or-not frames — the retina's native input.
const W = 56, H = 30, N = 18;
const frames = [];
for (let i = 0; i < N; i++) {
  const f = Array.from({ length: H }, () => Array.from({ length: W }, () => 0));
  for (let k = 0; k < 4; k++) { const x = (rnd() * W) | 0, y = (rnd() * H) | 0; f[y][x] = 0.9; }
  for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
    const yy = 14 + dy, xx = 4 + i + dx;
    if (yy < H && xx < W) f[yy][xx] = 1;
  }
  frames.push(f);
}

// ───────────────────────────────────────────────────────────────────────────────
h(`THE CLIP — a ${W}×${H} field, ${N} frames: one ball crossing sparse static`);
// ───────────────────────────────────────────────────────────────────────────────
// A couple of frames as ASCII, so the eye sees what the retina sees: a coherent disk adrift in dust.
const draw = (f) => f.filter((_, y) => y % 2 === 0).map((row) =>
  '  ' + row.filter((_, x) => x % 2 === 0).map((v) => (v > 0.5 ? '█' : '·')).join('')).join('\n');
console.log('\n  frame 1:'); console.log(draw(frames[0]));
console.log('\n  frame 9:'); console.log(draw(frames[8]));

// ───────────────────────────────────────────────────────────────────────────────
h('THE RETINA — contiguity + persistence (organs/in/video.js), no model');
// ───────────────────────────────────────────────────────────────────────────────
const clip = ingestFrames({ name: 'ball-on-static', frames });
const raw = (clip.tracks || []).map((tr) => ({ id: tr.id, frames: tr.points.length, mass: tr.points.reduce((s, p) => s + (p.size || 1), 0) }));
kv('candidate tracks followed', `${raw.length}  (the ball + every flicker of snow)`);
const persist = raw.slice().sort((a, b) => b.mass - a.mass);
console.log('\n  γ-mass — pixels each candidate was sighted at (top 6):');
persist.slice(0, 6).forEach((t) => kv(`  · ${t.id}`, `${t.mass} px  across ${t.frames} frame${t.frames === 1 ? '' : 's'}`));

// ───────────────────────────────────────────────────────────────────────────────
h('THE BORN RULE — square-and-normalize the γ-masses into a distribution');
// ───────────────────────────────────────────────────────────────────────────────
const b = bornEntities(raw, { minFrames: 3 });
kv('noise floor (even share, 1/n)', (b.floor * 100).toFixed(2) + '%');
console.log('\n  the distribution over "which moving thing is REAL" (top 6):');
b.distribution.slice(0, 6).forEach((t) => {
  const bar = '█'.repeat(Math.round(t.p * 40));
  console.log(`  ${String(t.id).padEnd(6)} ${String(t.mass).padStart(4)}px  ${(t.p * 100).toFixed(1).padStart(5)}%  ${bar}${t.entity ? '  ← ENTITY' : ''}`);
});
const ball = b.distribution[0];
console.log('');
kv('linear share would be', (ball.mass / raw.reduce((s, t) => s + t.mass, 0) * 100).toFixed(1) + '%  (rank-by-mass)');
kv('BORN share is', (ball.p * 100).toFixed(1) + '%  (squared — the signal-from-noise step)');
kv('entities recovered', `${b.entities.length}  (of ${b.measured} candidates measured)`);

// ───────────────────────────────────────────────────────────────────────────────
h('ON THE SPINE — the born reading lands as auditable EO events');
// ───────────────────────────────────────────────────────────────────────────────
// The same born entities, raised by the retina's organ (ingestMotion) alongside the clip's shots.
const analysis = analyzeMotion(frames, 4);
const shots = separateShots(frames, 4);
const tracks = b.entities.map((e) => ({ id: e.id, label: e.label, frames: e.frames, p: e.p, amp: e.amp }));
const doc = ingestMotion({ name: 'ball-on-static', title: 'Ball on static', duration: analysis.duration, fps: 4, analysis, shots, tracks, entities: b });
const ins = doc.log.events.filter((e) => e.op === 'INS' && e.label === 'moving thing');
const bornDefs = doc.log.events.filter((e) => e.op === 'DEF' && e.key === 'born');
const bornEvas = doc.log.events.filter((e) => e.op === 'EVA' && e.reason === 'born-entity');
kv('INS  moving-thing entities', ins.length);
kv('DEF  born  (probability)', bornDefs.length);
kv('EVA  born-entity  (verdict)', `${bornEvas.length}  — WHY each was kept, revertible on the log`);
console.log('\n  the reading (organs/in/motion.js motionSummary), tail:');
console.log(doc.text.split('\n').slice(-6).map((l) => '  ' + l).join('\n'));

console.log('\n\x1b[2m  The ball was never labelled — it was COUNTED. The corpus (the pixels) was ambiguous;');
console.log('  the arithmetic was not. Report the distribution, never the decision.\x1b[0m\n');
