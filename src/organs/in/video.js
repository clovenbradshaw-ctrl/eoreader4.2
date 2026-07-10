// EO: SEG·CON·INS(Void → Entity,Link, Dissecting,Binding,Making) — video adapter — contiguity + persistence
// The video adapter — meaning from raw pixels across frames, no model.
//
// This is the honest answer to "detect a moving shape in the pixels". There is
// no vision model and no labels: the input is frames of LIT-OR-NOT pixels (a
// retina's spike map). A field of static — TV snow — has lit pixels scattered at
// random every frame; a circle moving through it is a lit disk that shifts a
// little each frame. Pixel-for-pixel the snow and the circle are identical: both
// just "lit". Nothing here thresholds them apart by brightness.
//
// They are separated by two things only, both generic and both the engine's own:
//
//   • CONTIGUITY — lit pixels that touch are one blob (Gestalt proximity). The
//     circle is a coherent blob; snow is dust. This is the front-end, the only
//     hand-written vision, analogous to the cochlea turning a tone into overtones.
//   • PERSISTENCE — a blob in one frame is bound to the nearest blob in the next
//     (proximity coreference, a field), and the engine's mass fold accumulates a
//     sighting (INS) per frame a track survives. The circle is sighted every
//     frame — it travels through time as ONE thing — so its γ-mass towers over
//     the snow, every grain of which is a one-frame flicker. The reading does not
//     chase the snow (max surprisal, inert); it rides what persists. That is the
//     circle, recovered by counting alone.

import { createLog }         from '../../core/index.js';
import { projectGraph }      from '../../core/index.js';
import { createConventions } from '../../core/conventions/index.js';

// 8-connected components of a set of "x,y" lit-pixel keys → blobs with centroid.
const components = (on) => {
  const seen = new Set();
  const out = [];
  for (const start of on) {
    if (seen.has(start)) continue;
    seen.add(start);
    const stack = [start];
    const px = [];
    while (stack.length) {
      const k = stack.pop();
      const [x, y] = k.split(',').map(Number);
      px.push([x, y]);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const nk = `${x + dx},${y + dy}`;
        if (on.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(nk); }
      }
    }
    out.push({
      size: px.length,
      cx: px.reduce((s, p) => s + p[0], 0) / px.length,
      cy: px.reduce((s, p) => s + p[1], 0) / px.length,
    });
  }
  return out;
};

export const ingestFrames = (spec = {}) => {
  const { name = `clip-${Date.now()}`, frames = [], lit = (v) => v > 0 } = spec;
  const H = frames[0]?.length || 0;
  const W = frames[0]?.[0]?.length || 0;

  // Front-end: per frame, group lit pixels into contiguous blobs.
  const blobsByFrame = frames.map((f) => {
    const on = new Set();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (lit(f[y][x] || 0)) on.add(`${x},${y}`);
    return components(on);
  });

  // Identity over time: bind each blob to the nearest blob in the previous frame
  // (within a gate). The largest blob claims its track first, so the circle keeps
  // its thread while snow grains spawn and die as one-frame tracks.
  const GATE = Math.max(3, Math.hypot(W, H) * 0.12);
  const tracks = [];
  blobsByFrame.forEach((blobs, fi) => {
    const active = tracks.filter(tr => tr.last === fi - 1);
    const used = new Set();
    for (const b of [...blobs].sort((a, b) => b.size - a.size)) {
      let best = null, bestD = GATE;
      for (const tr of active) {
        if (used.has(tr.id)) continue;
        const d = Math.hypot(tr.cx - b.cx, tr.cy - b.cy);
        if (d < bestD) { bestD = d; best = tr; }
      }
      if (best) {
        used.add(best.id);
        best.cx = b.cx; best.cy = b.cy; best.last = fi;
        best.points.push({ fi, x: b.cx, y: b.cy, size: b.size });
      } else {
        tracks.push({ id: `m${tracks.length}`, cx: b.cx, cy: b.cy, last: fi, points: [{ fi, x: b.cx, y: b.cy, size: b.size }] });
      }
    }
  });

  // Emit onto the spine: one sighting (INS) per blob per frame it survives. Mass
  // = persistence; the projection's γ-fold ranks the tracks with no further help.
  const log = createLog({ docId: name });
  const mentions = new Map();
  for (const tr of tracks) for (const p of tr.points) {
    log.append({ op: 'INS', id: tr.id, label: 'blob', sentIdx: p.fi });
    mentions.set(tr.id, [...(mentions.get(tr.id) || []), p.fi]);
  }

  return {
    docId: name, modality: 'video', width: W, height: H, frameCount: frames.length,
    units: frames.map((_, i) => `frame ${i}`),
    frames, tracks, blobsByFrame,
    log, mentions, conventions: createConventions(),
    // The universal contract's metadata slot (organs/in: every doc carries one). A
    // clip's equivalent of front matter is its container metadata (title, creator,
    // date, duration), passed in by the caller; the raw pixel frames carry none.
    metadata: spec.metadata || {},
    projectGraph: (frame = {}) => projectGraph(log, frame),
  };
};
