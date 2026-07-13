// EO: SEG·NUL(Field → Void, Dissecting,Clearing) — audio DSP: waveform redaction + WAV encode
// audio-dsp.js — the two sound operations the Listen surface needs, as PURE functions the
// browser and Node both run: encode mono PCM to a 16-bit WAV, and replace time spans with
// silence or a gentle beep. No Web Audio, no libraries — DataView / sample math only, so the
// redaction logic is driven directly by `node --test` (a real AudioContext decodes the source;
// these transform the samples it hands back).
//
// The WAVEFORM is the truth (hear.js), and a redaction is a DELIBERATE, reversible edit to it:
// the original bytes stay untouched (OPFS / the vault); this rebuilds a redacted COPY for
// playback and export from the redaction list, so nothing is destroyed and toggling a span off
// restores it. Silence zeroes the span; a beep is a low, faded tone that says "something was
// here" without the click transients a hard cut leaves.

const isNum = (x) => typeof x === 'number' && isFinite(x);
const clampInt = (x, lo, hi) => { const n = Math.round(isNum(x) ? x : 0); return n < lo ? lo : n > hi ? hi : n; };

// Seconds → sample index, clamped to [0, len]. `len` bounds it to the buffer we actually have.
export const secToSample = (t, sampleRate, len = Number.MAX_SAFE_INTEGER) =>
  clampInt((isNum(t) ? t : 0) * (isNum(sampleRate) && sampleRate > 0 ? sampleRate : 0), 0, isNum(len) ? len : Number.MAX_SAFE_INTEGER);

// Write a "non-annoying" beep into out[i0, i1): a low-amplitude sine with a raised-cosine fade
// in and out over ~fadeMs at each edge, so it starts and ends without a click. Mutates `out`.
export const writeBeep = (out, i0, i1, sampleRate, { freq = 660, amp = 0.06, fadeMs = 8 } = {}) => {
  const n = i1 - i0;
  if (n <= 0 || !isNum(sampleRate) || sampleRate <= 0) return;
  const fade = Math.min(Math.floor((fadeMs / 1000) * sampleRate), Math.floor(n / 2));
  const w = (2 * Math.PI * freq) / sampleRate;
  for (let k = 0; k < n; k++) {
    let g = 1;
    if (fade > 0) {
      if (k < fade) g = 0.5 - 0.5 * Math.cos((Math.PI * k) / fade);                 // ramp up
      else if (k >= n - fade) g = 0.5 - 0.5 * Math.cos((Math.PI * (n - 1 - k)) / fade); // ramp down
    }
    out[i0 + k] = amp * g * Math.sin(w * k);
  }
};

// applyRedactions(samples, sampleRate, redactions, opts) → a NEW Float32Array with every
// [start,end]-second span replaced. Pure — the input buffer is never mutated (non-destructive:
// the redaction list is the truth, and this is a recomputed projection of the original waveform).
//   redactions  [{ start, end, mode:'silence'|'beep' }] in seconds (overlaps are fine)
//   opts.beep   { freq, amp, fadeMs } forwarded to writeBeep
export const applyRedactions = (samples, sampleRate, redactions = [], opts = {}) => {
  const src = samples || [];
  const out = Float32Array.from(src);
  if (!isNum(sampleRate) || sampleRate <= 0 || !Array.isArray(redactions)) return out;
  const len = out.length;
  for (const r of redactions) {
    if (!r) continue;
    const i0 = secToSample(r.start, sampleRate, len);
    const i1 = secToSample(r.end, sampleRate, len);
    if (i1 <= i0) continue;
    if (r.mode === 'beep') writeBeep(out, i0, i1, sampleRate, opts.beep || {});
    else for (let i = i0; i < i1; i++) out[i] = 0;   // silence — the default
  }
  return out;
};

// encodeWav(samples, sampleRate) → ArrayBuffer of a canonical 16-bit PCM mono WAV (RIFF/WAVE).
// The 44-byte header then interleaved little-endian int16 samples — the format every browser and
// player reads. Hand-written on purpose: no dependency, and the byte layout is unit-tested.
export const encodeWav = (samples, sampleRate) => {
  const data = samples || new Float32Array(0);
  const n = data.length;
  const sr = isNum(sampleRate) && sampleRate > 0 ? Math.round(sampleRate) : 16000;
  const bytesPerSample = 2;      // 16-bit
  const blockAlign = bytesPerSample;   // one channel
  const byteRate = sr * blockAlign;
  const dataSize = n * bytesPerSample;
  const buf = new ArrayBuffer(44 + dataSize);
  const dv = new DataView(buf);
  const ascii = (off, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };
  ascii(0, 'RIFF'); dv.setUint32(4, 36 + dataSize, true); ascii(8, 'WAVE');
  ascii(12, 'fmt '); dv.setUint32(16, 16, true);   // fmt chunk size
  dv.setUint16(20, 1, true);      // audioFormat: PCM
  dv.setUint16(22, 1, true);      // channels: mono
  dv.setUint32(24, sr, true);
  dv.setUint32(28, byteRate, true);
  dv.setUint16(32, blockAlign, true);
  dv.setUint16(34, 16, true);     // bits per sample
  ascii(36, 'data'); dv.setUint32(40, dataSize, true);
  let off = 44;
  for (let i = 0; i < n; i++) {
    let s = data[i];
    s = s < -1 ? -1 : s > 1 ? 1 : s;   // clamp before quantizing
    dv.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return buf;
};
