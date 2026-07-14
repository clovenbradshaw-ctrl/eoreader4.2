// EO: SEG(Field → Field, Dissecting) — the video front-end (decode → luminance grids)
// The video front-end — the browser half of the retina, the twin of the audio decode.
//
// organs/in/motion.js is the retina's reading (activity, cuts, shots, persistence, the born-rule
// entity collapse) and it is PURE: luminance grids in, a reading out, pinned by a browserless test.
// It has no way to OPEN an .mp4 — exactly as organs/in/acoustic.js reads a waveform it is HANDED and
// import-file.js is the one that decodes the file to PCM. This module is the video equivalent: it
// turns a video File into the frame grids motion.js reads, and it is the ONLY browser-bound piece of
// the visual pipeline (a `<video>` element + a `<canvas>`), so everything downstream stays testable.
//
// The economics are the same as the rest of the engine: read SMALL and read FEW. A luminance grid is
// downsampled hard (a moving thing is a blob of tens of pixels, not millions — the tracker follows
// centroids, not texture), and frames are sampled at a low fps (the reading is the pace a person
// follows a clip, not every decoded frame). The canvas does the downsample for free as it draws the
// full frame into a small buffer; we only read back the grid. Nothing here loads a model, and nothing
// leaves the tab.

// Rec.601 luma of an RGBA ImageData buffer → the grid f[y][x] ∈ [0,1] motion.js reads (rows of H,
// columns of W, row-major just as `data` is: index = (y·width + x)·4). Pure — no DOM — so the pixel
// reduction is unit-testable with a plain { data, width, height } the way the acoustic sample math is,
// while the decode that produces `data` stays browser-only (and, like whisper's, untested here).
export const lumaGridFromImageData = (imageData) => {
  const { data, width = 0, height = 0 } = imageData || {};
  const grid = new Array(height);
  for (let y = 0; y < height; y++) {
    const row = new Array(width);
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // 0.299 R + 0.587 G + 0.114 B, normalized to [0,1]. Alpha is ignored — a decoded video frame
      // is fully opaque, and a transparent letterbox reads as its (black) colour, not as absence.
      row[x] = (0.299 * (data[i] || 0) + 0.587 * (data[i + 1] || 0) + 0.114 * (data[i + 2] || 0)) / 255;
    }
    grid[y] = row;
  }
  return grid;
};

// The target grid size: shrink so the LONGER side is at most `maxDim`, preserving aspect, and never
// upscale a clip that is already small. Pure, so the framing is testable. Returns integer [W,H] ≥ 1.
export const targetDims = (srcW, srcH, maxDim = 96) => {
  const w = Math.max(1, srcW | 0), h = Math.max(1, srcH | 0);
  const scale = Math.min(1, maxDim / Math.max(w, h));
  return [Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale))];
};

// The effective sampling rate + the timestamps to grab: sample at `fps`, but never exceed `maxFrames`
// over the whole clip (a long clip drops its fps rather than decode thousands of frames). Pure.
// Returns { fps, times: number[] } — the wall-clock seconds to seek to.
export const sampleTimes = (duration, fps = 3, maxFrames = 480) => {
  const dur = Math.max(0, duration || 0);
  if (dur <= 0) return { fps, times: [0] };
  const wanted = Math.max(1, Math.round(dur * fps));
  const count = Math.min(wanted, Math.max(1, maxFrames));
  const eff = count / dur;                                   // the fps we can actually afford
  const times = [];
  for (let i = 0; i < count; i++) times.push(Math.min(dur, (i + 0.5) / eff));   // frame centres
  return { fps: eff, times };
};

// Seek a media element to `t` and resolve once the frame is actually ready to draw. `seeked` is the
// contract, but some browsers fire it a touch before the pixels settle, so a `requestVideoFrameCallback`
// (when present) is preferred and the event is the fallback; a timeout guarantees we never hang on a
// codec that refuses a particular timestamp (that frame is simply skipped upstream). Used by the seek
// FALLBACK path, for browsers without requestVideoFrameCallback.
const seekTo = (video, t, timeoutMs = 6000) => new Promise((resolve, reject) => {
  let done = false;
  const finish = (ok) => { if (done) return; done = true; cleanup(); ok ? resolve() : reject(new Error('seek timeout')); };
  const onSeeked = () => finish(true);
  const onError = () => finish(false);
  const cleanup = () => {
    video.removeEventListener('seeked', onSeeked);
    video.removeEventListener('error', onError);
    clearTimeout(timer);
  };
  const timer = setTimeout(() => finish(false), timeoutMs);
  video.addEventListener('seeked', onSeeked, { once: true });
  video.addEventListener('error', onError, { once: true });
  try { video.currentTime = t; } catch { finish(false); }
});

// Wait for a video element to know its own shape/length (metadata), or reject if it cannot decode.
const awaitMetadata = (video, timeoutMs = 15000) => new Promise((resolve, reject) => {
  if (video.readyState >= 1 && video.videoWidth) return resolve();
  const ok = () => { cleanup(); resolve(); };
  const bad = () => { cleanup(); reject(new Error('this browser cannot decode the video track')); };
  const cleanup = () => {
    video.removeEventListener('loadedmetadata', ok);
    video.removeEventListener('error', bad);
    clearTimeout(timer);
  };
  const timer = setTimeout(bad, timeoutMs);
  video.addEventListener('loadedmetadata', ok, { once: true });
  video.addEventListener('error', bad, { once: true });
});

// Capture frames by PLAYING the clip and reading each decoded frame through requestVideoFrameCallback
// (rVFC) — the reliable path. rVFC fires once per frame the compositor presents, carrying that frame's
// own `mediaTime`, so frames arrive IN ORDER with no seeking: none of the "the codec will not yield
// this timestamp" misses that make random-access seeking flaky (especially on inter-frame codecs like
// VP9/H.264, where an arbitrary time sits between keyframes). We keep at most one frame per `gap`
// seconds (the target sampling interval) and long clips play faster than real time so extraction stays
// bounded. Resolves when the clip ends or `maxFrames` is reached.
const capturePlaying = (video, ctx, W, H, frames, gap, maxFrames, { signal, say, duration }) => new Promise((resolve, reject) => {
  let stopped = false, lastT = -Infinity;
  const finish = () => { if (stopped) return; stopped = true; try { video.pause(); } catch {} cleanup(); resolve(); };
  const fail = (e) => { if (stopped) return; stopped = true; try { video.pause(); } catch {} cleanup(); reject(e); };
  const onEnded = () => finish();
  const onError = () => fail(new Error('the video track could not be decoded while playing'));
  const cleanup = () => {
    video.removeEventListener('ended', onEnded);
    video.removeEventListener('error', onError);
    clearTimeout(guard);
  };
  // A hard wall so a clip that neither ends nor errors (a stalled decode) can never hang the import.
  const guard = setTimeout(finish, Math.min(600000, Math.max(15000, (duration || 0) * 1000 + 15000)));

  const onFrame = (_now, meta) => {
    if (stopped) return;
    if (signal && signal.aborted) return fail(new DOMException('aborted', 'AbortError'));
    const t = (meta && typeof meta.mediaTime === 'number') ? meta.mediaTime : video.currentTime;
    if (t - lastT >= gap - 1e-3) {
      lastT = t;
      try { ctx.drawImage(video, 0, 0, W, H); frames.push(lumaGridFromImageData(ctx.getImageData(0, 0, W, H))); } catch { /* a frame that won't draw is skipped */ }
      if (frames.length % 8 === 0 && duration > 0) say(`Reading the picture… ${Math.min(99, Math.round((t / duration) * 100))}%`);
      if (frames.length >= maxFrames) return finish();
    }
    video.requestVideoFrameCallback(onFrame);
  };

  video.addEventListener('ended', onEnded, { once: true });
  video.addEventListener('error', onError, { once: true });
  video.requestVideoFrameCallback(onFrame);
  video.play().catch(() => { /* muted playback is permitted; if it is blocked the guard/ended still settle */ });
});

// extractVideoFrames(file, opts) → { frames, fps, width, height, duration, sampled, requested }.
//   frames: luminance grids f[y][x] ∈ [0,1] at [width,height] — exactly what motion.js's readVideo eats.
// opts: { fps=8, maxDim=96, maxFrames=600, signal, onProgress }.
// Browser-only (a <video> + <canvas>); a caller in Node must not reach here (import-file.js gates it
// behind a real file import). Best-effort per frame: one that will not draw is skipped, never fatal —
// the reading stands on the frames that decoded.
export async function extractVideoFrames(file, opts = {}) {
  const { fps = 8, maxDim = 96, maxFrames = 600, signal, onProgress } = opts;
  if (typeof document === 'undefined') throw new Error('video frame extraction needs a browser (no document)');
  const say = typeof onProgress === 'function' ? onProgress : () => {};
  const throwIfAborted = () => { if (signal && signal.aborted) throw new DOMException('aborted', 'AbortError'); };

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;                 // muted autoplay is permitted; an unmuted programmatic play is blocked
  video.playsInline = true;
  video.crossOrigin = 'anonymous';
  video.src = url;

  try {
    throwIfAborted();
    await awaitMetadata(video);
    const duration = isFinite(video.duration) ? video.duration : 0;
    const [W, H] = targetDims(video.videoWidth, video.videoHeight, maxDim);

    // One small canvas, reused for every frame — the downsample happens in drawImage (full frame in,
    // W×H out), so we only ever read back W×H×4 bytes, never the source resolution.
    const canvas = (typeof OffscreenCanvas !== 'undefined')
      ? new OffscreenCanvas(W, H)
      : Object.assign(document.createElement('canvas'), { width: W, height: H });
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    // Nearest-neighbour downsample — we want REPRESENTATIVE pixels, not interpolated blends that
    // smear a bright thing and its noise into the same gray and inflate the moving-pixel mask.
    try { ctx.imageSmoothingEnabled = false; } catch { /* older engines ignore it */ }

    // The gap between kept frames: the target 1/fps, widened if the clip is long enough that 1/fps
    // would blow past maxFrames — so a long clip drops its effective fps rather than decode thousands.
    const gap = Math.max(1 / Math.max(fps, 1e-6), duration > 0 ? duration / Math.max(1, maxFrames) : 0);
    const frames = [];

    if (typeof video.requestVideoFrameCallback === 'function') {
      // Speed the decode up on longer clips so extraction stays bounded, but stay near 1× on short
      // ones (a high rate makes the compositor skip frames, thinning the sampling we rely on).
      try { video.playbackRate = Math.min(8, Math.max(1, (duration || 0) / 12)); } catch { /* default rate */ }
      await capturePlaying(video, ctx, W, H, frames, gap, maxFrames, { signal, say, duration });
    } else {
      // Fallback for a browser without rVFC: sample by seeking. Less reliable on inter-frame codecs
      // (a timestamp the codec will not yield is skipped), but every browser can seek.
      const { times } = sampleTimes(duration, fps, maxFrames);
      for (let i = 0; i < times.length; i++) {
        throwIfAborted();
        try { await seekTo(video, times[i]); ctx.drawImage(video, 0, 0, W, H); frames.push(lumaGridFromImageData(ctx.getImageData(0, 0, W, H))); }
        catch { /* skip a frame the codec would not yield at this timestamp */ }
        if ((i & 7) === 0 || i === times.length - 1) say(`Reading the picture… ${Math.round(((i + 1) / times.length) * 100)}%`);
      }
    }

    const effFps = frames.length > 1 && duration > 0 ? frames.length / duration : fps;
    const requested = duration > 0 ? Math.max(frames.length, Math.round(duration / gap)) : frames.length;
    return { frames, fps: effFps, width: W, height: H, duration, sampled: frames.length, requested };
  } finally {
    try { video.pause(); video.removeAttribute('src'); video.load(); } catch { /* releasing the decoder is best-effort */ }
    URL.revokeObjectURL(url);
  }
}
