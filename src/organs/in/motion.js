// EO: SEG·INS·CON·DEF·EVA(Field → Entity,Link,Kind,Field, Dissecting,Making,Binding,Tracing) — the pre-transcription retina
// The visual reading — what the eye sees BEFORE it names a thing in the picture.
//
// The audio side has two organs: acoustic.js (the cochlea — the pre-transcription reading of
// the waveform: envelope, basic facts, signal/noise nested holons) and audio.js (the transcript
// adapter — a speech model's words on the spine). Video had only the second half: video.js is
// the retina's deep layer (contiguity + persistence → motion tracks, no model), but nothing read
// the picture as a WHOLE the instant it was decoded. This module is that reading — the retina's
// first pass — the video analogue of the cochlea, and it lands AT ONCE, long before a word of the
// clip's audio is transcribed:
//
//   • the ACTIVITY ENVELOPE — one number per frame, how much the picture CHANGED from the frame
//     before it (mean absolute luminance difference). This is the video's waveform: a still shot
//     reads flat, a pan or a busy scene reads loud. Everything below reads this track, never the
//     pixels again, so the reading is cheap and deterministic (acoustic.js reads frame energies
//     the same way);
//   • the CUTS — a change so large it is not motion within a shot but a jump to a DIFFERENT shot.
//     A cut is a spike in the activity track, far above its own local level. The cuts segment the
//     clock into SHOTS — the video's paragraphs;
//   • the SHOTS as NESTED HOLONS — each shot is whole at its own scale (Koestler, docs/holons.md):
//     the whole clip is a holon; the runs between cuts are shot holons; inside a shot, the frames
//     that MOVE (above the shot's own local stillness floor) nest as motion holons, and the frames
//     that sit still are its rests. The same recursive separation the cochlea runs on loudness,
//     run here on visual change — and written onto the append-only log as EVA events (this span is
//     a cut / this run moves / this run is still), so the reading is AUDITABLE, not a silent gate;
//   • the KEYFRAME of each shot — the single most SETTLED frame in it (least local change), the one
//     that stands for the shot in a strip of thumbnails.
//
// Everything here is PURE — luminance grids in, plain objects out, no browser API — so the retina's
// reading is pinned by a browserless test exactly as the cochlea's is. A frame is a grid f[y][x] of
// luminance in [0,1] (the same shape video.js's tracker reads), so the two layers share one input:
// decode once, read the whole picture here, track what persists there.

import { createLog }         from '../../core/index.js';
import { projectGraph }      from '../../core/index.js';
import { createConventions } from '../../core/conventions/index.js';
import { tok }               from '../../perceiver/parse/index.js';
import { attachReading }     from '../ingest/index.js';
import { ingestFrames }      from './video.js';
import { createEmbeddingMemo } from '../../model/embed-store.js';

// mm:ss(.d) for a time in seconds — the reader's clock on the activity strip (as acoustic.js).
const clock = (sec) => {
  const s = Math.max(0, sec || 0);
  const m = Math.floor(s / 60);
  const rem = s - m * 60;
  return `${m}:${(rem < 10 ? '0' : '') + rem.toFixed(1)}`;
};

// The value at fraction q of a sorted-ascending copy — nearest-rank percentile, enough to place a
// motion floor robustly against the odd loud frame (acoustic.js uses the same for the noise floor).
const percentile = (sortedAsc, q) => {
  if (!sortedAsc.length) return 0;
  const i = Math.min(sortedAsc.length - 1, Math.max(0, Math.round(q * (sortedAsc.length - 1))));
  return sortedAsc[i];
};

const dims = (frames) => {
  const H = frames?.[0]?.length || 0;
  const W = frames?.[0]?.[0]?.length || 0;
  return { W, H };
};

// ── the change track (the raw material of everything below) ──────────────────────────────────
// One number per frame: the mean absolute luminance difference from the previous frame, in [0,1].
// d[0] = 0 — nothing came before the first frame. This is to the picture what frameEnergies is to
// the waveform: the single track the segmentation reads, computed once.
export const frameDeltas = (frames) => {
  const n = frames?.length || 0;
  const d = new Float64Array(n);
  if (n < 2) return d;
  const { W, H } = dims(frames);
  const cells = Math.max(1, W * H);
  for (let i = 1; i < n; i++) {
    const a = frames[i], b = frames[i - 1];
    let sum = 0;
    for (let y = 0; y < H; y++) {
      const ar = a[y] || [], br = b[y] || [];
      for (let x = 0; x < W; x++) sum += Math.abs((ar[x] || 0) - (br[x] || 0));
    }
    d[i] = sum / cells;
  }
  return d;
};

// The mean luminance of a frame, in [0,1] — how bright the picture is (for the basic analysis).
const frameLuma = (frame) => {
  const H = frame?.length || 0;
  const W = frame?.[0]?.length || 0;
  if (!H || !W) return 0;
  let sum = 0;
  for (let y = 0; y < H; y++) { const r = frame[y] || []; for (let x = 0; x < W; x++) sum += (r[x] || 0); }
  return sum / (W * H);
};

// ── the drawable activity envelope ─────────────────────────────────────────────────────────────
// Downsample the change track to `buckets` columns, each carrying the max and mean change over the
// frames it spans (a UI draws bars from `amp`, and can tint each by the shot it falls in). The
// video analogue of waveformPeaks — same shape { amp, mean, t } so the same strip renderer draws it.
export const motionPeaks = (frames, fps = 2, buckets = 200) => {
  const d = frameDeltas(frames);
  const n = d.length;
  if (!n) return [];
  const cols = Math.max(1, Math.min(buckets, n));
  const per = n / cols;
  const out = new Array(cols);
  for (let c = 0; c < cols; c++) {
    const a = Math.floor(c * per);
    const b = Math.min(n, Math.max(a + 1, Math.floor((c + 1) * per)));
    let mx = 0, sum = 0, cnt = 0;
    for (let i = a; i < b; i++) { const v = d[i]; if (v > mx) mx = v; sum += v; cnt++; }
    out[c] = { amp: mx, mean: cnt ? sum / cnt : 0, t: ((a + b) / 2) / Math.max(fps, 1e-6) };
  }
  return out;
};

// ── the cuts ─────────────────────────────────────────────────────────────────────────────────
// A cut is a frame whose change is not motion within a shot but a jump to a different picture: a
// spike far above the track's own typical level. Robustly: the change clears `factor`× the median
// change AND an absolute floor (so a clip that never cuts does not invent one out of sensor noise),
// with a refractory gap so one hard cut across two sampled frames is read as a single boundary.
// Returns the frame indices at which a new shot BEGINS.
export const detectCuts = (deltas, opts = {}) => {
  const { factor = 3.5, absFloor = 0.12, refractory = 1 } = opts;
  const n = deltas.length;
  if (n < 2) return [];
  const sorted = Array.from(deltas.slice(1)).sort((x, y) => x - y);   // drop d[0]=0 from the stats
  const median = percentile(sorted, 0.5);
  const thr = Math.max(median * factor, absFloor);
  const cuts = [];
  let last = -Infinity;
  for (let i = 1; i < n; i++) {
    if (deltas[i] >= thr && (i - last) > refractory) { cuts.push(i); last = i; }
  }
  return cuts;
};

// Merge a per-frame moving/still flag array into contiguous [start,end] runs (in seconds), each with
// its mean and peak change. The motion analogue of acoustic.js's runsFromFlags — same shape.
const runsFromFlags = (flags, deltas, idxs, fps) => {
  const runs = [];
  const dur = 1 / Math.max(fps, 1e-6);
  let i = 0;
  while (i < flags.length) {
    let j = i, sum = 0, mx = 0, cnt = 0;
    while (j < flags.length && flags[j] === flags[i]) { const v = deltas[idxs[j]]; sum += v; if (v > mx) mx = v; cnt++; j++; }
    const start = idxs[i] * dur;
    const end = (idxs[Math.min(j, idxs.length - 1)] + (j >= idxs.length ? 1 : 0)) * dur;
    runs.push({ kind: flags[i] ? 'motion' : 'still', start, end: Math.max(end, start + dur), dur: Math.max(end - start, dur), mean: cnt ? sum / cnt : 0, peak: mx });
    i = j;
  }
  return runs;
};

// Fold runs shorter than `minDur` into the neighbour they most resemble, so the reading is shots,
// not frame flicker (a single busy frame in a static shot should not shatter it). Iterated to a
// fixed point — the same coalesce the cochlea uses, on time spans.
const coalesce = (runs, minDur) => {
  if (runs.length <= 1) return runs;
  let cur = runs.map((r) => ({ ...r }));
  let changed = true;
  while (changed && cur.length > 1) {
    changed = false;
    let idx = -1;
    for (let i = 0; i < cur.length; i++) if (cur[i].dur < minDur) { idx = i; break; }
    if (idx < 0) break;
    const left = cur[idx - 1], right = cur[idx + 1];
    const into = (!right || (left && left.dur >= right.dur)) ? left : right;
    if (!into) break;
    const a = into, b = cur[idx];
    const start = Math.min(a.start, b.start), end = Math.max(a.end, b.end), dur = end - start;
    const mean = dur > 0 ? (a.mean * a.dur + b.mean * b.dur) / dur : Math.max(a.mean, b.mean);
    const merged = { kind: a.dur >= b.dur ? a.kind : b.kind, start, end, dur, mean, peak: Math.max(a.peak || 0, b.peak || 0) };
    if (into === left) cur.splice(idx - 1, 2, merged);
    else cur.splice(idx, 2, merged);
    changed = true;
  }
  return cur;
};

// ── the basic analysis (what a viewer asks first) ───────────────────────────────────────────────
export const analyzeMotion = (frames, fps = 2) => {
  const n = frames?.length || 0;
  const { W, H } = dims(frames);
  const duration = n / Math.max(fps, 1e-6);
  const d = frameDeltas(frames);
  const moving = Array.from(d.slice(1));                 // d[0]=0 is not a real change
  let peak = 0, sum = 0;
  for (const v of moving) { if (v > peak) peak = v; sum += v; }
  const meanActivity = moving.length ? sum / moving.length : 0;
  const sorted = moving.slice().sort((x, y) => x - y);
  const floor = percentile(sorted, 0.2);                 // the settled-frame level ≈ the stillness floor
  const stillCut = Math.max(floor * 1.5, 0.006);
  let still = 0;
  for (const v of moving) if (v <= stillCut) still++;
  let lumaSum = 0;
  for (let i = 0; i < n; i++) lumaSum += frameLuma(frames[i]);
  const cuts = detectCuts(d).length;
  return {
    frameCount: n, width: W, height: H, fps, duration,
    meanActivity, peakActivity: peak,
    stillPct: moving.length ? (still / moving.length) * 100 : 0,
    motionPct: moving.length ? (1 - still / moving.length) * 100 : 0,
    luminance: n ? lumaSum / n : 0,
    cuts,
  };
};

// ── the nested shots ─────────────────────────────────────────────────────────────────────────
// separateShots(frames, fps, opts) → the whole clip as ONE holon whose top-level children are the
// SHOTS (the runs between cuts), each shot holding its own motion/still runs as sub-holons. Every
// shot carries its keyframe — the settled frame that stands for it.
//
// opts: { minShotDur, marginFactor, absFloor, cut:{factor,absFloor,refractory} }
export const separateShots = (frames, fps = 2, opts = {}) => {
  const {
    minShotDur = 0.4,       // a run shorter than this folds into its neighbour (no shot-flicker)
    marginFactor = 1.8,     // how far above a shot's own stillness floor a frame must move to count
    absFloor = 0.01,        // nothing below this absolute change is ever called motion
    cut = {},
  } = opts;

  const n = frames?.length || 0;
  const d = frameDeltas(frames);
  const dur = 1 / Math.max(fps, 1e-6);
  const duration = n * dur;

  let idCounter = 0;
  const nextId = () => `v${idCounter++}`;

  // The settled frame of [i0,i1): the one whose OWN change (and its successor's) is smallest — the
  // picture at rest, the frame that stands for the shot. Falls back to the first frame.
  const keyframeOf = (i0, i1) => {
    let best = i0, bestScore = Infinity;
    for (let i = i0; i < i1; i++) {
      const score = (d[i] || 0) + (i + 1 < n ? d[i + 1] || 0 : 0);
      if (score < bestScore) { bestScore = score; best = i; }
    }
    return best;
  };

  // Within a shot's frame window, separate moving frames from still ones against the shot's OWN
  // floor (this is what makes the holons nest — each shot re-reads its own stillness). One level.
  const motionChildren = (i0, i1) => {
    if (i1 - i0 < 3) return [];
    const idxs = [], vals = [];
    for (let i = i0; i < i1; i++) { idxs.push(i); vals.push(d[i] || 0); }
    const sorted = vals.slice().sort((x, y) => x - y);
    const floor = percentile(sorted, 0.4);
    const thr = Math.max(floor * marginFactor, absFloor);
    const flags = vals.map((v) => (v > thr ? 1 : 0));
    let runs = runsFromFlags(flags, d, idxs, fps);
    runs = coalesce(runs, minShotDur);
    if (runs.length <= 1) return [];   // a shot that is uniformly moving or still has no sub-structure
    return runs.map((r) => holon(r.kind, r.start, r.end, r.mean, r.peak, [], null));
  };

  const holon = (kind, start, end, mean, peak, children, keyframe) => ({
    id: nextId(), kind, start, end, dur: end - start,
    activity: mean, peak,
    keyframe,
    children,
  });

  // The cuts split the clock into shots. With no cuts the whole clip is one shot.
  const cutIdx = detectCuts(d, cut);
  const bounds = [0, ...cutIdx, n];
  const shots = [];
  let prevId = null;
  for (let s = 0; s < bounds.length - 1; s++) {
    const i0 = bounds[s], i1 = bounds[s + 1];
    if (i1 <= i0) continue;
    let sum = 0, mx = 0, cnt = 0;
    for (let i = Math.max(i0, 1); i < i1; i++) { const v = d[i] || 0; sum += v; if (v > mx) mx = v; cnt++; }
    const kf = keyframeOf(i0, i1);
    const node = holon('shot', i0 * dur, i1 * dur, cnt ? sum / cnt : 0, mx, motionChildren(i0, i1), kf);
    node.frame0 = i0; node.frame1 = i1; node.cutIn = s > 0;
    shots.push(node);
    prevId = node.id;
  }

  const root = {
    id: nextId(), kind: 'root', start: 0, end: duration, dur: duration,
    activity: shots.length ? shots.reduce((a, sh) => a + sh.activity * sh.dur, 0) / Math.max(duration, 1e-6) : 0,
    children: shots,
  };

  let count = 0, deepest = 0;
  const walk = (h, dp) => { count++; deepest = Math.max(deepest, dp); (h.children || []).forEach((k) => walk(k, dp + 1)); };
  shots.forEach((sh) => walk(sh, 1));

  return {
    root, shots,
    cuts: cutIdx.map((i) => ({ frame: i, t: i * dur })),
    shotCount: shots.length,
    cutCount: cutIdx.length,
    count, depth: deepest,
    fps, duration, frameCount: n,
    minShotDur, marginFactor,
  };
};

// ── the empty-scene estimate + the presence track (fixed-camera) ────────────────────────────────
// Low motion has more than one cause (the witnessed-absence law, read for video): a quiet stretch is
// the thing PRESENT and still, or the scene EMPTY, or the camera holding a moved frame, or codec
// flicker below the floor. To tell present-still from empty you need to know what "empty" looks
// like. On a FIXED camera that is cheap: the per-pixel median across the clip is the background plate
// — the pixels a moving foreground passes over resolve to the scene behind it. Then a frame's mean
// deviation from that plate is how much is PRESENT beyond the empty scene. (On a moving camera the
// plate is meaningless and this must be replaced by residual-after-global-compensation — the seam is
// the `motion`/`presence` inputs to persistence(); this pair is the fixed-camera reading.)
export const backgroundPlate = (frames) => {
  const n = frames?.length || 0;
  const { W, H } = dims(frames);
  if (!n || !W || !H) return null;
  const plate = Array.from({ length: H }, () => new Float64Array(W));
  const col = new Float64Array(n);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    for (let i = 0; i < n; i++) { const r = frames[i][y]; col[i] = (r && r[x]) || 0; }
    const s = Array.from(col).sort((a, b) => a - b);
    plate[y][x] = s[Math.floor(n / 2)];   // the median — robust to a foreground that comes and goes
  }
  return plate;
};

// Per-frame mean |frame − background| — how much is present beyond the empty scene, in [0,1].
export const presenceTrack = (frames, bg) => {
  const n = frames?.length || 0;
  const { W, H } = dims(frames);
  const cells = Math.max(1, W * H);
  const out = new Float64Array(n);
  if (!bg) return out;
  for (let i = 0; i < n; i++) {
    let s = 0; const f = frames[i];
    for (let y = 0; y < H; y++) { const fr = f[y] || [], br = bg[y] || []; for (let x = 0; x < W; x++) s += Math.abs((fr[x] || 0) - (br[x] || 0)); }
    out[i] = s / cells;
  }
  return out;
};

// ── the surprise / dwell decomposition ──────────────────────────────────────────────────────────
// persistence(frames, fps, opts) → the clip read as [event, dwell, event, dwell, …] BEFORE any model
// runs. Two reads of one cheap signal (Koestler's watchmaker, applied to time): SURPRISE is where the
// motion SPIKES — a bounded event, an onset or a cut; DWELL is where it stays low while something keeps
// occupying its spot — the stretch between two surprises. A downstream CV model is then spent only on
// the events (name what changed) and, when a dwell is ambiguous, on confirming the thing is still there
// — never per frame. That is the no-data-center thesis made literal for video.
//
// A dwell is NOT a threshold on a motion number; it is a TYPED, LOCATED verdict about which cause the
// quiet has (get it wrong and you report a parked car that drove off two minutes ago):
//   • present-still — quiet AND the picture deviates from the empty plate: a thing is there, holding.
//   • void          — quiet AND the picture ≈ the empty plate: nothing is there. The honest absence.
//   • indeterminate — the presence sits in the ambiguous band, or the motion call was near the floor.
// And it is a REVISABLE claim, not a hard cut: a brief surprise inside a dwell (someone crosses in
// front — occlusion) does not END it; the interval SPANS the gap (recorded, marked indeterminate) when
// the thing is present again on the far side. The interval extends as more frames are read — the same
// revise-don't-mutate shape as the rest of the system.
//
// The 'meaningful' floors (`quietFloor`, `presenceFloor`) are the authored kernel — scene- and
// thing-dependent (a person shifting weight vs walking away; a flag rippling vs being taken down) —
// not constants to trust blindly. Where they are ambiguous the verdict is indeterminate, not a guess.
//
// `opts.motion` overrides the inter-frame motion signal (default: frame deltas — correct only for a
// fixed camera); `opts.presence` overrides the presence signal. Supplying compensated residuals here
// is exactly how the moving-camera case plugs in without changing the decomposition.
export const persistence = (frames, fps = 2, opts = {}) => {
  const {
    quietFloor = 0.012,     // inter-frame motion below this reads as holding still
    ambientBand = 0.5,      // ± fraction of the floor that reads indeterminate rather than a hard call
    presenceFloor = 0.03,   // deviation-from-background above this reads as something PRESENT
    minDwell = 0.6,         // a persistence shorter than this (seconds) is not reported as a dwell
    bridgeGap = 1.2,        // seconds of surprise a present-still dwell may span (occlusion) and hold
    motion = null,
    presence: presenceIn = null,
  } = opts;

  const n = frames?.length || 0;
  const step = 1 / Math.max(fps, 1e-6);
  const d = motion || frameDeltas(frames);
  const bg = presenceIn ? null : backgroundPlate(frames);
  const presence = presenceIn || presenceTrack(frames, bg);
  const cutSet = new Set(detectCuts(d, opts.cut || {}));

  const lo = quietFloor * (1 - ambientBand);
  const hi = quietFloor * (1 + ambientBand);
  // Classify every inter-frame step. Frame 0 has no predecessor — it takes the class of frame 1 so a
  // dwell that opens the clip is not clipped by one frame.
  const cls = new Array(n);
  for (let i = 1; i < n; i++) cls[i] = d[i] < lo ? 'quiet' : d[i] > hi ? 'active' : 'indet';
  if (n) cls[0] = cls[1] || 'quiet';

  // Walk into maximal runs of same class → raw events (active) and raw dwells (quiet). Indeterminate
  // steps attach to whichever side they touch (they are the fuzzy edge of an event or a dwell).
  const runs = [];
  let i = 0;
  while (i < n) {
    const c = cls[i] === 'indet' ? (runs.length && runs[runs.length - 1].c === 'quiet' ? 'quiet' : 'active') : cls[i];
    let j = i;
    while (j < n && (cls[j] === c || cls[j] === 'indet')) j++;
    runs.push({ c, i0: i, i1: j });
    i = j;
  }

  const verdictOf = (i0, i1) => {
    let s = 0, cnt = 0, mx = 0;
    for (let k = i0; k < i1; k++) { s += presence[k]; if (presence[k] > mx) mx = presence[k]; cnt++; }
    const mean = cnt ? s / cnt : 0;
    const verdict = mean >= presenceFloor ? 'present-still'
      : mean <= presenceFloor * 0.4 ? 'void'
      : 'indeterminate';
    return { verdict, presence: mean, peakPresence: mx };
  };

  const rawDwells = [];
  const events = [];
  for (const r of runs) {
    if (r.c === 'quiet') {
      const v = verdictOf(r.i0, r.i1);
      rawDwells.push({ start: r.i0 * step, end: r.i1 * step, frame0: r.i0, frame1: r.i1 - 1, ...v, gaps: [] });
    } else {
      // A surprise. The frame of peak motion stands for it; a cut is the sharpest kind.
      let peak = r.i0, pv = -1, isCut = false;
      for (let k = r.i0; k < r.i1; k++) { if (d[k] > pv) { pv = d[k]; peak = k; } if (cutSet.has(k)) isCut = true; }
      events.push({ frame: peak, t: peak * step, kind: isCut ? 'cut' : 'onset', activity: pv });
    }
  }

  // Revise, don't mutate: bridge two present-still dwells across a short surprise gap (occlusion) into
  // one interval that SPANS it, recording the bridged span as an indeterminate gap. Same-place is
  // proxied here by both sides reading present-still and the gap being brief; true region identity is
  // a CV/tracking refinement. Iterated so a thing occluded twice is still one persistence.
  const dwells = [];
  for (const dw of rawDwells) {
    const prev = dwells[dwells.length - 1];
    if (prev && prev.verdict === 'present-still' && dw.verdict === 'present-still' && (dw.start - prev.end) <= bridgeGap && dw.start > prev.end) {
      prev.gaps.push({ start: prev.end, end: dw.start, verdict: 'indeterminate' });
      prev.end = dw.end; prev.frame1 = dw.frame1;
      prev.presence = (prev.presence + dw.presence) / 2;
      prev.peakPresence = Math.max(prev.peakPresence, dw.peakPresence);
    } else {
      dwells.push({ ...dw });
    }
  }

  const kept = dwells.map((dw) => ({ ...dw, dur: dw.end - dw.start })).filter((dw) => dw.dur >= minDwell);

  return {
    events,
    dwells: kept,
    fps, frameCount: n, duration: n * step,
    cameraCompensated: !!(motion || presenceIn),   // false ⇒ the fixed-camera reading (deltas + plate)
    quietFloor, presenceFloor,
  };
};

// Duration-as-a-predicate — the accountability query the decomposition hands you for free: every
// stretch where something persisted (default: present-still) longer than `seconds`. "Every vehicle
// parked here longer than ten minutes", "the object left unattended longest", "where someone stood at
// a door more than two minutes" — miserable by hand, a filter on the dwells here.
export const dwellsLongerThan = (dwells, seconds, verdict = 'present-still') =>
  (dwells || []).filter((dw) => (verdict == null || dw.verdict === verdict) && dw.dur >= seconds)
    .sort((a, b) => b.dur - a.dur);

// ── the born-rule entity reading (which moving things are REAL, as a distribution) ───────────────
// The deep retina (video.js) follows every blob that persists frame to frame and hands back a BAG of
// tracks — from the one thing that crossed the whole clip down to the one-frame flickers a field of
// static throws off. Which of those are ENTITIES and which are noise is the same question the ear
// asks of a waveform and the replay page asks of a transcript, and it takes the same answer: not a
// hard threshold, but the BORN measure (weave/chorus/born.js, docs/chorus.md). Report the
// distribution; never the decision.
//
// Each frame a track survives is one MEASUREMENT that it is a real thing, and the AMOUNT it lights up
// in that frame — the size of its blob — is how much signal each measurement carries. Their product,
// summed over the track, is its **γ-mass**: the pixels it was ever sighted at. That mass is the
// amplitude ψ. (This is exactly the mass video.js's fold accumulates: the circle — a big blob sighted
// every frame — towers; each grain of snow — one pixel, sighted once — does not.) Persistence alone
// (frame count) is the fallback when sizes aren't carried, but mass is what separates a coherent thing
// from a speck that merely flickered in the same place a few times.
//
// The Born rule turns amplitudes into a probability the honest way — square, sum, divide (bornWeights)
// — and the squaring IS the signal-from-noise step: it suppresses the small, brief tracks
// QUADRATICALLY, which a linear ranking cannot, and is why we say Born and not "rank by size". The
// circle carries almost all of the one unit of probability; the snow splits a vanishing remainder.
// Masses are already ≥0 with no shared baseline (unlike born.js's correlated cosine cells, they need
// no centering), so a raw square-and-normalize is the whole measure.
//
// A track is an ENTITY when it (a) persisted past a floor of frames (a one-frame flash is not yet a
// thing) AND (b) carries MORE than an even share of the squared mass (1/n) — it stands above the level
// a uniform bag of flickers would sit at. Everything is returned, entities and noise alike, each with
// its probability, so the reading is auditable and the collapse re-runnable.
export const bornEntities = (tracks = [], opts = {}) => {
  const { minFrames = 3 } = opts;
  const list = (tracks || []).map((tr) => {
    const frames = tr.frames != null ? tr.frames : (Array.isArray(tr.points) ? tr.points.length : 0);
    // Mass = pixels-sighted (Σ blob size over the frames). Fall back to persistence when the caller
    // carries no sizes (each sighting worth one), so a bag of {id,frames} still collapses sensibly.
    const mass = tr.mass != null ? tr.mass
      : (Array.isArray(tr.points) ? tr.points.reduce((s, p) => s + (p.size || 1), 0) : frames);
    return { id: tr.id, label: tr.label || 'moving thing', frames, mass };
  });
  const n = list.length;
  // Square-and-normalize the masses into one distribution (weave/chorus/born.js bornWeights): ψ² / Σψ².
  // A degenerate all-zero bag returns all-zero — the honest "no mass", never a fabricated uniform
  // reading from a divide-by-zero.
  const sq = list.map((t) => t.mass * t.mass);
  const total = sq.reduce((s, x) => s + x, 0);
  const floor = n > 0 ? 1 / n : 0;                       // the even share — the noise line
  const distribution = list
    .map((t, i) => {
      const p = total > 0 ? sq[i] / total : 0;
      return { ...t, amp: t.mass, p, entity: t.frames >= minFrames && p >= floor };
    })
    .sort((a, b) => b.p - a.p || b.mass - a.mass);
  return {
    distribution,                                         // every measured track, with its born p
    entities: distribution.filter((t) => t.entity),      // the ones the collapse calls real
    measured: n, floor, minFrames,
  };
};

// ── the moving-pixel mask (the bridge to the deep retina) ───────────────────────────────────────
// video.js's tracker (ingestFrames) reads frames of LIT-OR-NOT pixels and follows what PERSISTS.
// This turns the grayscale grids into exactly that: a pixel is "lit" in frame i when it changed
// from frame i-1 by more than `thresh` — the moving pixels. Feed the result straight to ingestFrames
// (which thresholds with lit = v>0) and its contiguity+persistence fold recovers the moving things.
export const motionMask = (frames, opts = {}) => {
  const { thresh = 0.12 } = opts;
  const n = frames?.length || 0;
  const { W, H } = dims(frames);
  const out = [];
  for (let i = 0; i < n; i++) {
    const row = new Array(H);
    const cur = frames[i], prev = frames[i - 1];
    for (let y = 0; y < H; y++) {
      const r = new Array(W).fill(0);
      if (i > 0) { const cr = cur[y] || [], pr = prev[y] || []; for (let x = 0; x < W; x++) r[x] = Math.abs((cr[x] || 0) - (pr[x] || 0)) > thresh ? 1 : 0; }
      row[y] = r;
    }
    out.push(row);
  }
  return out;
};

// ── the human-readable reading (the source's text before any transcript) ────────────────────────
export const motionSummary = ({ title = 'Video', analysis, shots, tracks = [], entities = null, mediaKind = 'video' }) => {
  const a = analysis || {};
  const sh = (shots && shots.shots) || [];
  const L = [];
  L.push(`# ${title}`);
  L.push('');
  const kindWord = mediaKind === 'video' ? 'A video clip' : 'A frame sequence';
  L.push(`${kindWord} of **${clock(a.duration || 0)}** (${(a.duration || 0).toFixed(1)}s), read at **${a.fps || 0} fps** on a ${a.width || 0}×${a.height || 0} luminance grid — the picture read as motion before a word of its audio is transcribed.`);
  L.push('');
  L.push('## What the picture is doing');
  L.push(`- **Duration:** ${clock(a.duration || 0)} (${(a.duration || 0).toFixed(1)}s), ${a.frameCount || 0} frames sampled`);
  L.push(`- **Motion:** ${Math.round(a.motionPct || 0)}% of frames move; ${Math.round(a.stillPct || 0)}% sit still`);
  L.push(`- **Peak change:** ${((a.peakActivity || 0) * 100).toFixed(1)}% frame-to-frame`);
  L.push(`- **Brightness:** ${Math.round((a.luminance || 0) * 100)}%`);
  L.push('');
  L.push('## Cut into shots');
  if (!sh.length) {
    L.push('The picture never changes wholesale — the clip reads as **one continuous shot**.');
  } else {
    L.push(`The clip cuts into **${sh.length} shot${sh.length === 1 ? '' : 's'}** across **${(shots.cutCount || 0)} cut${(shots.cutCount || 0) === 1 ? '' : 's'}**, nested ${shots.depth || 1} level${(shots.depth || 1) === 1 ? '' : 's'} deep.`);
    L.push('');
    for (let i = 0; i < sh.length; i++) {
      const s = sh[i];
      const level = s.activity > (a.meanActivity || 0) ? 'active' : 'calm';
      L.push(`- **Shot ${i + 1}** — ${clock(s.start)}–${clock(s.end)} (${s.dur.toFixed(1)}s, ${level})`);
    }
  }
  if (tracks && tracks.length) {
    L.push('');
    L.push('## What persists across the frames');
    const measured = entities && entities.measured != null ? entities.measured : tracks.length;
    L.push(`**${tracks.length} moving thing${tracks.length === 1 ? '' : 's'}** read as **entities** by the Born rule — square-and-normalize each track's γ-mass (the pixels it was sighted at), keep what clears the noise floor (contiguity + persistence, video.js + the born measure)${measured > tracks.length ? ` — out of ${measured} tracks the retina followed, the small, brief flickers of noise suppressed quadratically` : ''}.`);
    // Report the distribution, never the decision: each kept thing with the probability the collapse
    // gave it, so a reader sees WHY the circle is the thing and the snow is not.
    const top = tracks.slice(0, 8);
    for (const tr of top) {
      const pct = tr.p != null ? ` — ${(tr.p * 100).toFixed(tr.p >= 0.1 ? 0 : 1)}% of the moving mass` : '';
      L.push(`- **${tr.label || 'moving thing'}** — sighted across ${tr.frames} frame${tr.frames === 1 ? '' : 's'}${pct}`);
    }
  }
  return L.join('\n');
};

// ── raise the reading onto the spine ─────────────────────────────────────────────────────────────
// ingestMotion({...}) → a doc on the universal organs/in contract: the shots AS entities on an
// append-only log, so the video reads and encodes into EoT the instant it is decoded — no transcript
// required. Each shot is an INS; its clock, level and activity are DEFs; the cut that opens it is an
// EVA (the boundary, made auditable); a CON bonds each shot to the next (the reading line of time)
// and each sub-holon to its shot (containment). The motion tracks (video.js), when supplied, ride
// along as their own INS entities — what the eye followed across the frames. A shot is a holon; so
// is a thing that moves.
export const ingestMotion = (spec = {}) => {
  const {
    name = `video-${Date.now()}`,
    title = name,
    duration = 0,
    fps = 2,
    analysis = null,
    shots = null,
    peaks = null,
    tracks = [],
    entities = null,
    media = null,
    mediaKind = 'video',
    metadata = {},
  } = spec;

  const log = createLog({ docId: name });
  const units = [];
  const sentences = [];
  const mentions = new Map();

  const sh = (shots && shots.shots) || [];

  const emitHolon = (node, parentId, level, di) => {
    const id = node.id;
    const label = node.kind === 'shot'
      ? `shot ${clock(node.start)}–${clock(node.end)}`
      : `${node.kind} ${clock(node.start)}–${clock(node.end)}`;
    log.append({ op: 'INS', id, label, sentIdx: di });
    mentions.set(id, [...(mentions.get(id) || []), di]);
    log.append({ op: 'DEF', id, key: 'kind', value: node.kind, sentIdx: di });
    log.append({ op: 'DEF', id, key: 'time', value: `${node.start.toFixed(2)}-${node.end.toFixed(2)}`, sentIdx: di });
    log.append({ op: 'DEF', id, key: 'level', value: String(level), sentIdx: di });
    log.append({ op: 'DEF', id, key: 'activity', value: (node.activity || 0).toFixed(4), sentIdx: di });
    if (node.keyframe != null) log.append({ op: 'DEF', id, key: 'keyframe', value: String(node.keyframe), sentIdx: di });
    // The boundary itself — an EVALUATION of the span against the track, on the record. A shot that
    // opens on a cut is a jump to a new picture; a motion sub-run is the eye moving within one.
    log.append({
      op: 'EVA', id,
      reason: node.kind === 'shot' ? (node.cutIn ? 'shot-after-cut' : 'shot-opening') : (node.kind === 'motion' ? 'moving-above-floor' : 'still-below-floor'),
      value: (node.activity || 0).toFixed(4),
      sentIdx: di,
    });
    if (parentId) log.append({ op: 'CON', src: parentId, tgt: id, via: 'contains', sentIdx: di });
    for (const kid of (node.children || [])) emitHolon(kid, id, level + 1, di);
    return id;
  };

  let unitIdx = 0;
  let prevTopId = null;
  sh.forEach((node) => {
    const di = unitIdx++;
    const id = emitHolon(node, null, 1, di);
    if (prevTopId) log.append({ op: 'CON', src: prevTopId, tgt: id, via: node.cutIn ? 'cut' : 'then', sentIdx: di });
    prevTopId = id;
    const level = analysis && node.activity > (analysis.meanActivity || 0) ? 'active' : 'calm';
    const line = `Shot ${clock(node.start)}–${clock(node.end)} (${node.dur.toFixed(1)}s, ${level})`;
    units.push(line);
    sentences.push(line);
  });

  // The things that persist across the frames — each moving blob (video.js) as its own entity, so
  // "what moved through this clip" is on the spine alongside "how it was cut". Each one arrives with
  // its BORN reading: how many frames it survived (its amplitude), and the probability the collapse
  // assigned it (DEF born) — and the verdict that made it an entity rather than noise rides as an EVA
  // (born-entity), so WHY a moving thing was kept is on the record and revertible, exactly as the OCR
  // quorum's election is (organs/in/ocr-quorum.js).
  for (const tr of (tracks || [])) {
    const id = tr.id || `m${mentions.size}`;
    const di = unitIdx;
    log.append({ op: 'INS', id, label: tr.label || 'moving thing', sentIdx: di });
    mentions.set(id, [...(mentions.get(id) || []), di]);
    if (tr.frames != null) log.append({ op: 'DEF', id, key: 'frames', value: String(tr.frames), sentIdx: di });
    if (tr.p != null) {
      log.append({ op: 'DEF', id, key: 'born', value: tr.p.toFixed(3), sentIdx: di });
      log.append({ op: 'EVA', id, reason: 'born-entity', value: tr.p.toFixed(3), sentIdx: di });
    }
  }

  if (!units.length) { units.push(`One continuous shot — ${clock(duration)} of picture that never cuts`); sentences.push(units[0]); }

  const tokensBySentence = sentences.map((s) => new Set(tok(s)));
  const text = motionSummary({ title, analysis, shots, tracks, entities, mediaKind });

  const doc = {
    docId: name, modality: 'video',
    duration, fps, device: null,
    units, sentences, tokensBySentence,
    log, mentions,
    text,
    media, mediaKind,
    peaks: peaks || null,
    analysis: analysis || null,
    shots: shots || null,
    tracks: tracks || [],
    entities: entities || null,
    transcribed: false,
    // The picture is a COMPLETE reading on its own — it is not a clip still waiting for its words.
    // The reader uses this to tell a watched video (show its motion entities) from an un-transcribed
    // one (show the live partial): a motion doc is `watched`, an acoustic pre-reading is not.
    watched: true,
    conventions: createConventions(),
    metadata: { title, ...metadata },
    projectGraph: (frame = {}) => projectGraph(log, frame),
  };

  attachReading(doc);

  // Which shot (or none) is on screen at time t — the "what is happening here" lookup a click on the
  // activity strip or a keyframe resolves to.
  doc.shotAt = (t) => sh.find((c) => t >= c.start - 0.02 && t <= c.end + 0.02) || null;

  const sentMemo = createEmbeddingMemo();   // globally budgeted (model/embed-store.js)
  doc.sentenceEmbeddings = async (embedder) =>
    sentMemo.get(embedder?.id || 'default', sentences.length, () => Promise.all(sentences.map((s) => embedder.embed(s))));
  doc.releaseEmbeddings = () => sentMemo.release();

  return doc;
};

// Convenience: run the whole retina over a decoded frame sequence in one call — the pure reading a
// caller (the reader's front-end) gets after it has extracted the frames. Returns the artefacts the
// surface draws (peaks, analysis, shots, tracks) and the doc that lands on the spine. The motion
// tracks come from the deep retina (video.js) over the moving-pixel mask, so persistence is counted
// on the same frames the shots were cut from.
export const readVideo = (spec = {}) => {
  const { name = `video-${Date.now()}`, title = name, frames = [], fps = 2, media = null, mediaKind = 'video', metadata = {}, maxPeaks = 200 } = spec;
  const analysis = analyzeMotion(frames, fps);
  const peaks = motionPeaks(frames, fps, maxPeaks);
  const shots = separateShots(frames, fps);
  const persist = persistence(frames, fps);
  let tracks = [], entities = { distribution: [], entities: [], measured: 0, floor: 0, minFrames: 3 };
  try {
    const mask = motionMask(frames);
    const clip = ingestFrames({ name: `${name}-tracks`, frames: mask });
    // Carry each track's γ-mass (Σ blob size over the frames it survived), not just its frame count —
    // a coherent moving thing is a BIG blob, a codec speck is one or two pixels, and mass is what tells
    // them apart when both happen to persist. (video.js's tracker records a per-frame `size`.)
    const raw = (clip.tracks || []).map((tr) => ({
      id: tr.id, label: 'moving thing', frames: tr.points.length,
      mass: tr.points.reduce((s, p) => s + (p.size || 1), 0),
    }));
    // WHICH of the followed blobs are real things is a BORN-rule collapse, not a hard cut-off: square
    // each track's mass, normalize to one, and keep the ones that clear the noise floor (bornEntities).
    // What used to be `filter(frames >= 3)` is now the measure's own verdict — the circle takes almost
    // all the probability, the snow's small flickers split the rest and fall below it.
    entities = bornEntities(raw, { minFrames: 3 });
    tracks = entities.entities
      .map((t) => ({ id: t.id, label: t.label, frames: t.frames, p: t.p, amp: t.amp }))
      .sort((a, b) => b.p - a.p || b.frames - a.frames);
  } catch { /* the tracker is best-effort; the shots still stand */ }
  const doc = ingestMotion({ name, title, duration: analysis.duration, fps, analysis, shots, peaks, tracks, entities, media, mediaKind, metadata });
  return { analysis, peaks, shots, persistence: persist, tracks, entities, doc };
};
