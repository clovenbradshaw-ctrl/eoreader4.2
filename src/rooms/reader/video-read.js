// EO: SEG·INS·EVA(Field → Entity,Network,Lens, Dissecting,Making,Tracing) — the reader's video thread
// The reader's video read — decode a clip into the picture's structure, then spend the model only on
// what the structure says is worth naming. index.html is at its size cap and this thread has grown
// enough to live on its own; the surface holds a pointer, the work lives here.
//
// The pipeline is four tiers, cheapest first, and almost nothing reaches the expensive one:
//   0/1  extract — <video>+canvas, sampled at a low fps to a SMALL luminance grid, DOWNSAMPLED AND
//        DISCARDED frame by frame (full-res pixels never accumulate: an hour of 1080p RGB held whole
//        is ~650 GB — an OOM that has nothing to do with compute; we keep only the tiny grids and the
//        KB-per-segment log, so a four-hour file costs what a four-minute one does);
//   2    read — organs/in/motion.js over the grids: the cut/shot structure, the surprise/dwell
//        decomposition, the motion tracks — model-free, the vision GATE;
//   3    name — CV (Florence-2 via eo/vision.js) on ONE keyframe per shot, not per frame. That
//        gating is the whole no-data-center thesis: captioning every frame of an hour is ~60 h;
//        captioning a few hundred keyframes is minutes, and the content-addressed cache makes a
//        re-run free.
// The seen concepts land as span-anchored annotations (surfer/moment.js) beside the heard words, and
// coref folds a concept seen across cuts into one tracked figure, so the search is figure-level.
//
// The orchestration (analyzeFrames) takes its frames, its keyframe grabber and its vision organ as
// inputs, so the gating, the coref and the annotation assembly are pinned by a browserless test with
// fakes; only extractVideoFrames touches the DOM, and it is the thin, decode-only shell (the audio
// decode in import-file.js is unpinnable the same way).

import { readVideo } from '../../organs/in/motion.js';
import { composeScene } from '../../organs/in/scene.js';
import { seenAnnotations, dwellAnnotations, buildMomentIndex, normTerm } from '../../surfer/moment.js';

// ── PURE — the pixel reduction ───────────────────────────────────────────────────────────────────
// RGBA bytes (canvas getImageData) → a luminance grid f[y][x] ∈ [0,1] at the SAME dimensions (the
// spatial downsample is done by drawImage at draw time; this is only the colour→luma reduction, the
// one every retina does first). Rec.601 luma; alpha ignored (opaque video frames).
export const lumaGrid = (data, w, h) => {
  const H = Math.max(0, h | 0), W = Math.max(0, w | 0);
  const out = new Array(H);
  for (let y = 0; y < H; y++) {
    const row = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      row[x] = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
    }
    out[y] = row;
  }
  return out;
};

// The draw dimensions that fit `maxDim` on the long side, keeping aspect, never upscaling.
export const fitDims = (w, h, maxDim) => {
  const scale = Math.min(1, maxDim / Math.max(1, w, h));
  return { w: Math.max(2, Math.round(w * scale)), h: Math.max(2, Math.round(h * scale)) };
};

// ── PURE — coref across cuts (label-level, the honest v1) ────────────────────────────────────────
// A concept seen in more than one shot under the SAME normalized label is taken to be one tracked
// figure, so the search pulls all its appearances (figure-level, not frame-level). This is the cheap
// coref; the turned-away / different-label case ("person" in one shot, "man in blue jacket" in
// another) needs an appearance embedding (CLIP) clustered across shots — the seam is `entityId`, which
// an embedding pass can overwrite without changing anything downstream.
export const corefByLabel = (visionByShot = []) => {
  const seenLabels = new Map();   // normalized label → entityId
  let n = 0;
  for (const s of visionByShot) for (const r of (s.regions || [])) {
    const key = normTerm(r.label);
    if (!key) continue;
    if (!seenLabels.has(key)) seenLabels.set(key, `fig:${key}-${n++}`);
    r.entityId = seenLabels.get(key);
  }
  return visionByShot;
};

// ── PURE — the snapshot-friendly reading ─────────────────────────────────────────────────────────
// The full frames/grids are session-only (large); this is the compact reading that rides the JSON
// snapshot so the surface redraws the activity strip, the shots and the keyframe thumbnails, and the
// dwell timeline, after a reload — the video twin of app.js's audioMetaOf.
export const compactVisual = (visual = {}, { maxBars = 200, maxThumbs = 60 } = {}) => {
  const shots = (visual.shots && visual.shots.shots) || [];
  const peaks = Array.isArray(visual.peaks) ? visual.peaks.slice(0, maxBars).map((p) => ({ amp: +(+p.amp || 0).toFixed(4) })) : null;
  const kf = visual.keyframeThumbs || {};
  return {
    duration: visual.analysis ? visual.analysis.duration : (visual.duration || 0),
    fps: visual.analysis ? visual.analysis.fps : (visual.fps || 0),
    width: visual.analysis ? visual.analysis.width : null,
    height: visual.analysis ? visual.analysis.height : null,
    peaks,
    cutCount: visual.shots ? visual.shots.cutCount : 0,
    shotCount: shots.length,
    motionPct: visual.analysis ? +(+visual.analysis.motionPct || 0).toFixed(1) : null,
    trackCount: Array.isArray(visual.tracks) ? visual.tracks.length : 0,
    shots: shots.slice(0, maxThumbs).map((sh) => ({
      start: +sh.start.toFixed(2), end: +sh.end.toFixed(2), keyframe: sh.keyframe,
      t: +((sh.keyframe || sh.frame0 || 0) / Math.max(visual.fps || (visual.analysis && visual.analysis.fps) || 2, 1e-6)).toFixed(2),
      thumb: kf[sh.keyframe] || null,
    })),
    dwells: (visual.persistence && visual.persistence.dwells ? visual.persistence.dwells : []).map((dw) => ({
      start: +dw.start.toFixed(2), end: +dw.end.toFixed(2), dur: +dw.dur.toFixed(1), verdict: dw.verdict,
    })),
    cameraCompensated: !!(visual.persistence && visual.persistence.cameraCompensated),
  };
};

// ── TESTABLE ORCHESTRATION — read the frames, gate the model, assemble the annotations ────────────
// analyzeFrames({ frames, fps, name, title, media, grabKeyframe, vision, ocr, onProgress, signal })
//   frames        the sampled luminance grids (from extractVideoFrames, or a test)
//   grabKeyframe  async (frameIndex) → a Blob of that frame at CV resolution (DOM in the app; a fake
//                 in a test). Absent ⇒ the CV tier is skipped and only the structure is read.
//   vision        an organ with async describe(blob) → { caption, regions:[{label,bbox}], width,
//                 height, bboxFormat, witness } (eo/vision.js). Absent ⇒ CV skipped.
//   ocr           optional async (blob) → [string] of on-screen text lines. Absent ⇒ no OCR.
// → { visual, visionByShot, annotations, index, doc, coverage }
export const analyzeFrames = async ({ frames = [], fps = 2, name = `video-${'x'}`, title = name, media = null, grabKeyframe = null, vision = null, ocr = null, onProgress = null, signal = null } = {}) => {
  const say = (m) => { try { onProgress && onProgress(m); } catch { /* progress is best-effort */ } };
  const aborted = () => signal && signal.aborted;

  // Tier 2 — the model-free read: structure, dwell, tracks, and the landed motion doc.
  say({ phase: 'read', label: 'Reading the picture…' });
  const r = readVideo({ name, title, frames, fps, media, mediaKind: 'video' });
  const shots = (r.shots && r.shots.shots) || [];

  // Tier 3 — CV on ONE keyframe per shot, gated. Best-effort per shot: a decode/describe fault on one
  // keyframe leaves that shot un-named, never fails the whole read. The content-addressed cache in the
  // vision organ makes a re-run of an unchanged clip free.
  const visionByShot = [];
  if (grabKeyframe && vision && typeof vision.describe === 'function') {
    for (let i = 0; i < shots.length; i++) {
      if (aborted()) throw new DOMException('aborted', 'AbortError');
      const sh = shots[i];
      say({ phase: 'cv', label: `Naming shot ${i + 1} of ${shots.length}…`, pct: Math.round(((i + 1) / Math.max(shots.length, 1)) * 100) });
      try {
        const blob = await grabKeyframe(sh.keyframe);
        if (!blob) continue;
        const seen = await vision.describe(blob);
        const composed = composeScene({ ...seen, name: `${name}-shot-${i}` });
        const lines = ocr ? (await ocr(blob).catch(() => [])) : [];
        visionByShot.push({
          span: [sh.start, sh.end], keyframe: sh.keyframe,
          caption: composed.text || seen.caption || '',
          regions: (composed.regions || []).map((rg) => ({ label: rg.label, bbox: rg.bbox, score: rg.score })),
          ocr: lines, witness: seen.witness || (vision.model ? `${vision.model}` : 'vision'),
        });
      } catch (e) { if (aborted()) throw e; /* this shot stays un-named; the rest proceed */ }
    }
    corefByLabel(visionByShot);
  }

  // The span-anchored annotations — what the record witnesses, on one timeline. The heard words are
  // added by the caller from the transcript doc (saidAnnotations) once it lands; here we lay the seen
  // concepts and the dwells so the index is useful even before (or without) transcription.
  const annotations = [...seenAnnotations(visionByShot), ...dwellAnnotations(r.persistence)];
  const index = buildMomentIndex(annotations);

  const namedShots = visionByShot.length;
  const coverage = {
    complete: true,
    frames: frames.length, fps,
    shots: shots.length, cuts: r.shots ? r.shots.cutCount : 0,
    dwells: r.persistence ? r.persistence.dwells.length : 0,
    tracks: r.tracks ? r.tracks.length : 0,
    namedShots,
    dropped: (grabKeyframe && vision) ? (namedShots < shots.length ? [`${shots.length - namedShots} shot(s) could not be named`] : [])
      : ['the picture was read but not named — no vision model was run'],
  };

  const visual = { ...r, keyframeThumbs: {}, fps };
  return { visual, visionByShot, annotations, index, doc: r.doc, coverage };
};

// ── BROWSER — the decode-only shell (untestable here, like the audio decode) ─────────────────────
// extractVideoFrames(file, opts) → { frames, width, height, fps, duration, grabKeyframe, keyframeThumbs,
//   release }. Streams the clip through a <video>+canvas at `fps`, drawing each sampled frame small and
// keeping only its luminance grid; the full frame is overwritten on the next draw (never accumulated).
// `grabKeyframe(frameIndex)` re-seeks and draws that frame at CV resolution as a JPEG Blob, and stashes
// a small thumbnail data URL in `keyframeThumbs` for the surface. `release()` revokes and tears down.
export const extractVideoFrames = async (file, opts = {}) => {
  const { fps = 2, maxDim = 96, cvDim = 640, thumbDim = 160, maxFrames = 5400, signal, onProgress } = opts;
  if (typeof document === 'undefined' || !document.createElement) throw new Error('video frame extraction needs a browser (canvas)');
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous'; v.src = url;
  const ready = new Promise((res, rej) => {
    v.onloadedmetadata = () => res();
    v.onerror = () => rej(new Error('this browser could not decode the video'));
  });
  await ready;
  const duration = v.duration || 0;
  const W0 = v.videoWidth || 0, H0 = v.videoHeight || 0;
  if (!W0 || !H0) { try { URL.revokeObjectURL(url); } catch {} throw new Error('the video has no picture to read'); }

  const { w, h } = fitDims(W0, H0, maxDim);
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const seekTo = (t) => new Promise((res) => {
    const done = () => { v.removeEventListener('seeked', done); res(); };
    v.addEventListener('seeked', done);
    try { v.currentTime = Math.min(t, Math.max(0, duration - 1e-3)); } catch { res(); }
  });

  const step = 1 / Math.max(fps, 1e-6);
  const frames = [];
  const denom = Math.max(duration, step);
  for (let t = 0; (frames.length === 0 || t < duration) && frames.length < maxFrames; t += step) {
    if (signal && signal.aborted) { try { URL.revokeObjectURL(url); } catch {} throw new DOMException('aborted', 'AbortError'); }
    await seekTo(t);
    ctx.drawImage(v, 0, 0, w, h);                        // downsample happens here; the full frame is never held
    frames.push(lumaGrid(ctx.getImageData(0, 0, w, h).data, w, h));
    try { onProgress && onProgress({ phase: 'extract', label: `Sampling the picture… ${Math.round((t / denom) * 100)}%`, pct: Math.round((t / denom) * 100) }); } catch {}
  }

  const keyframeThumbs = {};
  // Grab a full-ish-res JPEG of one frame for the CV model, and keep a small thumbnail for the surface.
  const grabKeyframe = async (frameIndex) => {
    const t = frameIndex * step;
    await seekTo(t);
    const big = document.createElement('canvas');
    const bd = fitDims(W0, H0, cvDim); big.width = bd.w; big.height = bd.h;
    big.getContext('2d').drawImage(v, 0, 0, bd.w, bd.h);
    // A small thumbnail (data URL) for the keyframe strip — tiny enough to ride the snapshot.
    try {
      const th = document.createElement('canvas'); const td = fitDims(W0, H0, thumbDim); th.width = td.w; th.height = td.h;
      th.getContext('2d').drawImage(v, 0, 0, td.w, td.h);
      keyframeThumbs[frameIndex] = th.toDataURL('image/jpeg', 0.6);
    } catch { /* the thumbnail is best-effort */ }
    return await new Promise((res) => big.toBlob((b) => res(b), 'image/jpeg', 0.85));
  };

  const release = () => { try { URL.revokeObjectURL(url); } catch {} try { v.removeAttribute('src'); v.load(); } catch {} };
  return { frames, width: w, height: h, sourceWidth: W0, sourceHeight: H0, fps, duration, grabKeyframe, keyframeThumbs, release };
};

// The deferred visual pass the reader runs after a video source lands (the video twin of the
// transcribe thunk). Extract → read → (optionally) name → annotations, then release the decoder.
// `vision`/`ocr` are injected by the caller (the app wires eo/vision.js); absent ⇒ structure-only.
export const readVideoFile = async (file, { fps = 2, maxDim = 96, name, title, media = null, vision = null, ocr = null, onProgress = null, signal = null } = {}) => {
  const ex = await extractVideoFrames(file, { fps, maxDim, signal, onProgress });
  try {
    const res = await analyzeFrames({
      frames: ex.frames, fps: ex.fps, name: name || file.name, title: title || file.name, media,
      grabKeyframe: (vision ? ex.grabKeyframe : null), vision, ocr, onProgress, signal,
    });
    // Fold the thumbnails the keyframe grabs produced into the visual reading for the surface.
    res.visual.keyframeThumbs = ex.keyframeThumbs;
    res.visual.sourceWidth = ex.sourceWidth; res.visual.sourceHeight = ex.sourceHeight;
    return res;
  } finally {
    ex.release();
  }
};
