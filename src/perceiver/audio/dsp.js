// EO: NUL(Field → Field, Tracing) — minimal, dependency-free audio DSP
// The one piece of genuinely new signal processing the omnimodal waveform needs
// (docs/omnimodal-waveform.md §4.2, §6 phase 6): nothing in the tree computes a
// spectral feature vector today (organs/in/acoustic.js's `frameEnergies` is RMS
// loudness only — one scalar, not a content descriptor). This is a small,
// self-contained radix-2 FFT and a log-spaced band-energy binning — not true
// chroma/MFCC, but a real, honest v1 spectral descriptor: enough for cosine
// similarity between frames to mean something about TIMBRE, not just loudness.

// Smallest power of 2 that is >= n.
export const nextPow2 = (n) => { let p = 1; while (p < n) p <<= 1; return p; };

// In-place iterative radix-2 Cooley–Tukey FFT. `re`/`im` are equal-length
// Float64Arrays whose length is a power of 2 (the caller pads with zeros —
// zero-padding only refines frequency bins, it never invents energy).
export const fft = (re, im) => {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const ang = -2 * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curWr = 1, curWi = 0;
      for (let k = 0; k < half; k++) {
        const uRe = re[i + k], uIm = im[i + k];
        const vRe0 = re[i + k + half], vIm0 = im[i + k + half];
        const vRe = vRe0 * curWr - vIm0 * curWi;
        const vIm = vRe0 * curWi + vIm0 * curWr;
        re[i + k] = uRe + vRe; im[i + k] = uIm + vIm;
        re[i + k + half] = uRe - vRe; im[i + k + half] = uIm - vIm;
        const nWr = curWr * wr - curWi * wi;
        const nWi = curWr * wi + curWi * wr;
        curWr = nWr; curWi = nWi;
      }
    }
  }
};

// A Hann window — tapers the frame edges to zero so a frame boundary that
// doesn't land on a full cycle doesn't smear energy across every band
// (spectral leakage), the standard reason any short-time spectral read windows
// its frames first.
export const hannWindow = (n) => {
  const w = new Float64Array(n);
  if (n <= 1) { w.fill(1); return w; }
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
};

// magnitudeSpectrum(frame) → the magnitude of the first half of the spectrum
// (the rest mirrors it for a real input). Pads to the next power of 2 — a short
// final frame still gets a real, if coarser-resolution, spectrum rather than
// being dropped.
export const magnitudeSpectrum = (frame) => {
  const fftSize = nextPow2(frame.length);
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  const win = hannWindow(frame.length);
  for (let i = 0; i < frame.length; i++) re[i] = frame[i] * win[i];
  fft(re, im);
  const half = fftSize >> 1;
  const mag = new Float64Array(half);
  for (let i = 0; i < half; i++) mag[i] = Math.hypot(re[i], im[i]);
  return mag;
};

// logBandEnergies — bin a magnitude spectrum into `numBands` log-spaced bands
// from `minHz` to Nyquist (the ear's own scale — equal-width bands would give
// almost the whole vector to frequencies above the range most timbral content
// lives in). Log-compressed (perceptual loudness is roughly logarithmic in
// energy) and L2-normalised, so the `field` is directly comparable by cosine —
// two frames with the same spectral SHAPE but different absolute loudness read
// as identical, which is the right invariance for "is this the same motif",
// not "is this the same volume".
export const logBandEnergies = (mag, sampleRate, fftSize, numBands = 16, minHz = 40) => {
  const nyquist = sampleRate / 2;
  const maxHz = Math.max(minHz * 2, nyquist);
  const logMin = Math.log2(minHz), logMax = Math.log2(maxHz);
  const edges = new Array(numBands + 1);
  for (let b = 0; b <= numBands; b++) edges[b] = Math.pow(2, logMin + (b / numBands) * (logMax - logMin));
  const binHz = sampleRate / fftSize;
  const energy = new Float64Array(numBands);
  for (let i = 0; i < mag.length; i++) {
    const hz = i * binHz;
    if (hz < minHz || hz > maxHz) continue;
    let b = 0;
    while (b < numBands - 1 && hz > edges[b + 1]) b++;
    energy[b] += mag[i] * mag[i];
  }
  const out = new Array(numBands);
  for (let b = 0; b < numBands; b++) out[b] = Math.log(1 + energy[b]);
  let norm = 0; for (const x of out) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  for (let b = 0; b < numBands; b++) out[b] /= norm;
  return out;
};
