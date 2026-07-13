// EO: SIG·INS(Void → Entity,Field, Making,Tending) — the microphone cochlea — live speech → transcript (organs)
// Live recording of someone talking, transcribed WHILE they talk — the reader's own ear.
//
// The file-import path (import-file.js) hears a finished clip: decode, then whisper
// window by window. This module is the same ear turned toward the room. It taps the
// microphone into a growing 16 kHz mono buffer and runs the SAME windowed decode over
// it as it grows — a window is committed the moment 30s of audio exist to fill it
// (identical WIN/HOP/dedup to _transcribeWindows, so a live take and an uploaded file
// of the same waveform transcribe identically), and between commits the uncommitted
// tail is decoded as a PREVIEW so words appear moments after they are said. At stop,
// only the final partial window remains to hear — no re-transcription of the take.
//
// Everything heavy is injected, nothing bundled: whisper arrives over the same CDN
// seam the import router uses, and loads only when a recording actually starts. The
// transcript hands off as utterances of timed words — the exact shape the audio organ
// (organs/in/audio.js) and the app's ingestRecording eat.
//
// The pure parts — the resampler, the chunk-span slicer, the window-commit feed — are
// exported for tests; the microphone/AudioContext plumbing lives only in createRecorder.

import { _whisperUtterances, _loadWhisper } from './import-file.js';

const SR = 16000;                          // the rate whisper wants
const WIN = 30, HOP = 25, DEDUP = 0.2;     // seconds — MUST match _transcribeWindows
const PREVIEW_EVERY = 3;                   // seconds of new audio between tail previews

const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');

// ── the resampler — native mic rate → 16 kHz, stateful across chunks ───────────
// Linear interpolation with the read position carried between pushes, so a chunk
// boundary never skips or repeats a sample. fromRate === toRate passes through.
export const createResampler = (fromRate, toRate = SR) => {
  const ratio = fromRate / toRate;
  let tail = 0, hasTail = false;   // the last input sample, bridged into the next chunk
  let pos = 0;                     // fractional read position into the (virtual) stream, minus consumed samples
  return {
    push(input) {
      if (ratio === 1) return Float32Array.from(input);
      // The virtual input for this pass: [tail?, ...input] so interpolation can cross the seam.
      const n = input.length + (hasTail ? 1 : 0);
      const at = (i) => (hasTail ? (i === 0 ? tail : input[i - 1]) : input[i]);
      const out = [];
      // pos is relative to the start of this virtual input.
      while (pos + 1 < n) {
        const i = Math.floor(pos), f = pos - i;
        out.push(at(i) * (1 - f) + at(i + 1) * f);
        pos += ratio;
      }
      // Keep the final sample as the bridge, and rebase pos onto the next virtual input,
      // where that kept sample will sit at index 0.
      if (n > 0) { tail = at(n - 1); hasTail = true; pos -= (n - 1); }
      return Float32Array.from(out);
    },
  };
};

// ── the span slicer — seconds [a,b) out of a chunk list, one allocation ────────
// The take accumulates as many small Float32Arrays; a decode wants one contiguous
// window. At least one sample is always returned (the same floor+1 guard the offline
// windower uses), so whisper never sees an empty segment.
export const _sliceSpan = (chunks, a, b, sr = SR) => {
  const from = Math.max(0, Math.floor(a * sr));
  const to = Math.max(from + 1, Math.ceil(b * sr));
  const out = new Float32Array(to - from);
  let base = 0;
  for (const c of chunks) {
    const end = base + c.length;
    if (end > from && base < to) {
      const s = Math.max(from, base), e = Math.min(to, end);
      out.set(c.subarray(s - base, e - base), s - from);
    }
    base = end;
    if (base >= to) break;
  }
  return out;
};

// ── the window-commit feed — _transcribeWindows, unrolled over a growing take ──
// The offline windower walks a=0,HOP,2·HOP… over a finished waveform. This is the same
// walk as a state machine: next(duration) names the next window ONLY when the take can
// fill it whole (so its words are final the moment they land); next(duration, {final})
// names the remaining windows at stop, partial tail included. commit() offsets a
// window's words to the absolute clock and drops the duplicates the overlap re-heard —
// byte-for-byte the offline merge, so live and offline agree on the same audio.
export const createTranscriptFeed = ({ win = WIN, hop = HOP, dedup = DEDUP } = {}) => {
  const utterances = [];
  let lastEnd = -Infinity;
  let nextA = 0;
  let opened = false;   // has ANY window been committed? (a sub-window take still gets one)
  let lastB = 0;        // the last committed window's end — the offline walk breaks on b ≥ duration
  return {
    next(duration, { final = false } = {}) {
      const a = nextA;
      if (!final) return a + win <= duration ? [a, a + win] : null;
      if (a === 0 && !opened) return [0, Math.max(duration, 0.001)];
      // A committed window already reached the take's end — the offline walk would have
      // broken there; offering the overlap again would hear words offline never does.
      if (lastB >= duration) return null;
      return a < duration ? [a, Math.min(a + win, Math.max(duration, a + 0.001))] : null;
    },
    commit([a, b], windowUtts) {
      opened = true;
      lastB = b;
      for (const u of windowUtts) {
        const words = [];
        for (const w of u.words) {
          const ws = w.start + a, we = Math.max(w.end + a, w.start + a);
          if (ws < lastEnd - dedup) continue;   // already heard in the prior window's overlap
          words.push({ ...w, start: ws, end: we });
          lastEnd = Math.max(lastEnd, we);
        }
        if (words.length) utterances.push({ start: words[0].start, end: words[words.length - 1].end, words });
      }
      nextA = a + hop;
    },
    heardTo: () => (lastEnd === -Infinity ? 0 : lastEnd),
    committedFrom: () => nextA,
    text: () => utterances.map(u => u.words.map(w => w.text).join(' ')).join(' ').trim(),
    utterances: () => utterances,
  };
};

// ── the recorder — microphone → live transcript (browser only) ─────────────────
// createRecorder({ onState, onPartial }) → { start, stop, cancel }.
//   onState(label)                 the human-readable phase, for a status line
//   onPartial({ text, committed, preview, seconds, pct? })   the growing transcript
// start() asks for the microphone and begins the take; stop() finishes the remaining
// tail window(s) and resolves { utterances, text, duration, device, witness } — the
// shape app.ingestRecording lands on the spine; cancel() discards everything.
export const createRecorder = ({ onState, onPartial } = {}) => {
  const say = (s) => { try { if (onState) onState(s); } catch { /* the surface's problem */ } };
  const feed = createTranscriptFeed();
  const chunks = [];
  let total = 0;                 // 16 kHz samples captured so far
  let stream = null, ac = null, srcNode = null, proc = null, sink = null, resampler = null;
  let asr = null, asrLoading = null, dev = 'wasm';
  let timer = null;
  let chain = Promise.resolve(), queued = 0;   // decodes run one at a time, in order
  let preview = '', lastPreviewAt = 0;
  let stopping = false, cancelled = false;

  const emitPartial = (extra = {}) => {
    if (cancelled) return;
    const committed = feed.text();
    try {
      if (onPartial) onPartial({
        text: (committed + (preview ? ' ' + preview : '')).trim(),
        committed, preview, seconds: total / SR, ...extra,
      });
    } catch { /* the surface's problem */ }
  };

  // The session-shared whisper pipeline — the import router's one load, reused here,
  // so a recording after a file import (or a second take) never stacks another model.
  const loadAsr = async () => {
    const got = await _loadWhisper();
    dev = got.dev;
    return got.asr;
  };

  const enqueue = (fn) => {
    queued++;
    chain = chain.then(fn, fn).finally(() => { queued--; });
    return chain;
  };

  // One heartbeat: commit the next full window if the take can fill it; otherwise,
  // every few seconds, preview the uncommitted tail so the words keep arriving.
  const tick = () => {
    if (!asr || stopping || cancelled || queued) return;
    const duration = total / SR;
    const w = feed.next(duration);
    if (w) {
      enqueue(async () => {
        if (stopping || cancelled) return;
        const out = await asr(_sliceSpan(chunks, w[0], w[1]), { return_timestamps: true });
        if (cancelled) return;
        feed.commit(w, _whisperUtterances(out, norm));
        preview = '';
        emitPartial();
      }).catch(() => { /* a failed window re-tries as part of the final drain */ });
    } else if (duration - lastPreviewAt >= PREVIEW_EVERY && duration > feed.heardTo() + 0.6) {
      lastPreviewAt = duration;
      const a = Math.max(feed.heardTo(), feed.committedFrom() > 0 ? feed.committedFrom() : 0);
      enqueue(async () => {
        if (stopping || cancelled) return;
        const out = await asr(_sliceSpan(chunks, a, duration), { return_timestamps: true });
        if (stopping || cancelled) return;
        preview = _whisperUtterances(out, norm).map(u => u.words.map(x => x.text).join(' ')).join(' ').trim();
        emitPartial();
      }).catch(() => { /* previews are best-effort */ });
    }
  };

  const teardownMic = () => {
    try { if (proc) proc.onaudioprocess = null; } catch { /* torn */ }
    try { if (srcNode) srcNode.disconnect(); } catch { /* torn */ }
    try { if (proc) proc.disconnect(); } catch { /* torn */ }
    try { if (sink) sink.disconnect(); } catch { /* torn */ }
    try { if (stream) stream.getTracks().forEach(t => t.stop()); } catch { /* torn */ }
    // close() settles asynchronously — a second teardown (stop, then a late Discard)
    // must not surface "Cannot close a closed AudioContext" as an unhandled rejection.
    try { if (ac && ac.state !== 'closed') ac.close().catch(() => { /* torn */ }); } catch { /* torn */ }
    srcNode = proc = sink = stream = ac = null;
    if (timer) { clearInterval(timer); timer = null; }
  };

  const start = async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
      throw new Error('this browser cannot record audio');
    say('Asking for the microphone…');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      throw new Error(/denied|dismissed|NotAllowed/i.test(String(e && (e.name + e.message))) ? 'microphone permission was denied' : `microphone unavailable — ${String(e && e.message || e).slice(0, 80)}`);
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { teardownMic(); throw new Error('this browser cannot process audio'); }
    ac = new AC();
    try { await ac.resume(); } catch { /* some browsers resume on their own */ }
    resampler = createResampler(ac.sampleRate, SR);
    srcNode = ac.createMediaStreamSource(stream);
    // ScriptProcessor is deprecated but universal, and this tap is trivial; the zero-gain
    // sink keeps Chrome firing audioprocess without feeding the mic back to the speakers.
    proc = ac.createScriptProcessor(4096, 1, 1);
    sink = ac.createGain(); sink.gain.value = 0;
    proc.onaudioprocess = (e) => {
      if (stopping || cancelled) return;
      const out = resampler.push(e.inputBuffer.getChannelData(0));
      if (out.length) { chunks.push(out); total += out.length; }
    };
    srcNode.connect(proc); proc.connect(sink); sink.connect(ac.destination);
    say('Listening — loading the speech model…');
    // The model loads WHILE the take runs; whatever is said in the meantime is already
    // in the buffer and gets heard the moment whisper is ready.
    asrLoading = loadAsr().then((a) => { asr = a; if (!stopping && !cancelled) say('Listening…'); return a; });
    asrLoading.catch(() => { /* surfaced by stop(); recording itself keeps running */ });
    timer = setInterval(tick, 750);
  };

  const stop = async () => {
    if (stopping || cancelled) throw new Error('the recording is already finished');
    stopping = true;
    teardownMic();
    const duration = total / SR;
    say('Finishing the transcript…');
    try {
      if (!asr) {
        try { asr = await asrLoading; }
        catch (e) { throw new Error(`the speech model failed to load — ${String(e && e.message || e).slice(0, 90)}`); }
      }
      await chain.catch(() => { /* an in-flight preview's failure doesn't block the drain */ });
      // The remaining windows — usually just the sub-30s tail. Same loop, same break as
      // the offline windower, so the whole take is heard end to end exactly once.
      let w;
      while (!cancelled && (w = feed.next(duration, { final: true }))) {
        try {
          const out = await asr(_sliceSpan(chunks, w[0], w[1]), { return_timestamps: true });
          feed.commit(w, _whisperUtterances(out, norm));
        } catch (e) {
          if (!feed.text()) throw new Error(`transcription failed — ${String(e && e.message || e).slice(0, 90)}`);
          break;   // the committed take still stands; the tail is what was lost
        }
        preview = '';
        emitPartial({ pct: Math.min(100, Math.round(w[1] / Math.max(duration, 0.001) * 100)) });
        if (w[1] >= duration) break;
      }
      return {
        duration, utterances: feed.utterances(), text: feed.text(),
        device: dev, witness: `whisper-base · ${dev} · live`,
      };
    } finally {
      chunks.length = 0;   // the raw take (~230 MB/hour of Float32 at 16 kHz) has been heard — release it
    }
  };

  const cancel = () => { cancelled = true; teardownMic(); chunks.length = 0; };

  return { start, stop, cancel };
};
