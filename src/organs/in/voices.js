// EO: SEG·CON·DEF(Field → Kind,Link,Entity, Dissecting,Binding,Tracing) — speaker separation from the waveform
// voices.js — WHO is speaking, read from the sound itself, with PRE-NEURAL math only.
//
// The mainstream diarizer (learned voiceprint → cosine → PLDA → cluster) needs a speaker-embedding
// network pretrained on thousands of speakers and a background corpus to calibrate against — the
// data-centre dependency this whole system rejects. So this module uses the deterministic,
// information-theoretic family instead: no training corpus, no model, hand-rolled on the frames the
// transcriber already extracts, and — the load-bearing property — every decision is a TYPED VERDICT
// with a regenerable witness, not a thresholded scalar.
//
// Three stages, each swappable:
//
//   1. FEATURES — classical DSP, not a learned encoder. MFCCs (mel filterbank → log → DCT) are the
//      clustering substrate; the fundamental frequency (F0, by autocorrelation) and the LPC formants
//      (vocal-tract resonances, by the Levinson–Durbin recursion) are the human-readable evidence —
//      the "filter that identifies you," computed directly rather than learned.
//
//   2. COMPARISON, DERIVED not chosen (Information Bottleneck). Each utterance becomes a distribution
//      over the components of ONE background GMM — a fold of the acoustic space. Merges are ORDERED by
//      the Jensen–Shannon divergence the IB objective itself forces (minimize I(X;C), preserve I(C;Y)),
//      never an imposed cosine. That is the antidote to about≠says: the metric is what the objective
//      makes it, not a number we picked.
//
//   3. STOPPING, by model selection (ΔBIC). A merge is ACCEPTED only when a full-covariance Gaussian
//      over the pooled frames beats two separate ones — ΔBIC with its Occam penalty λ·½(d+½d(d+1))·logN.
//      No distance threshold anywhere; the speaker count falls out. The dead-band around ΔBIC=0 is where
//      INDETERMINATE lives NATIVELY — the cut is suspended, not forced.
//
// Honest cost (real): BIC+IB were state-of-the-art ~2007–2012, then beaten by neural embeddings on
// noisy, many-speaker, short-turn audio. They give RELATIVE labels (Speaker 1/2/3, not names) and one
// speaker per segment (no overlap). We take that accuracy-for-auditability trade on purpose.
//
// Pure, DOM-free, framework-free, DETERMINISTIC (no Math.random) — Float32 PCM in, plain objects out —
// so the whole reading is pinned by a browserless test the way every organ is, and re-runs to the number.

const isNum = (x) => typeof x === 'number' && isFinite(x);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const median = (xs) => { const a = xs.filter(isNum).slice().sort((p, q) => p - q); if (!a.length) return null; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const mean = (xs) => { const a = xs.filter(isNum); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; };

// ── the Fourier transform ───────────────────────────────────────────────────────────────────
// A compact iterative radix-2 Cooley–Tukey FFT (`re`/`im` power-of-two, transformed in place). The
// one primitive the spectrum stands on — kept tiny and dependency-free so the reading is pure.
export const fft = (re, im) => {
  const n = re.length;
  if (n <= 1) return;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const tr = re[i]; re[i] = re[j]; re[j] = tr; const ti = im[i]; im[i] = im[j]; im[j] = ti; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
};

const pow2Floor = (n) => { let p = 1; while (p * 2 <= n) p *= 2; return p; };
const hann = (N) => { const w = new Float64Array(N); for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)); return w; };

// ── MFCC — the classical timbral feature ────────────────────────────────────────────────────
const hzToMel = (f) => 2595 * Math.log10(1 + f / 700);
const melToHz = (m) => 700 * (Math.pow(10, m / 2595) - 1);

// A triangular mel filterbank over the FFT power-spectrum bins — `nMels` filters spaced evenly on
// the mel scale from 0 to Nyquist. Cached per (N, SR, nMels) so a whole clip builds it once.
const _melCache = new Map();
const melFilterbank = (N, SR, nMels = 26) => {
  const key = `${N}:${SR}:${nMels}`;
  if (_melCache.has(key)) return _melCache.get(key);
  const half = N >> 1;
  const melMax = hzToMel(SR / 2);
  const pts = [];
  for (let i = 0; i < nMels + 2; i++) pts.push(melToHz((i * melMax) / (nMels + 1)));
  const bin = pts.map((f) => Math.floor(((N + 1) * f) / SR));
  const filters = [];
  for (let m = 1; m <= nMels; m++) {
    const w = new Float64Array(half);
    for (let k = bin[m - 1]; k < bin[m]; k++) if (k >= 0 && k < half && bin[m] > bin[m - 1]) w[k] = (k - bin[m - 1]) / (bin[m] - bin[m - 1]);
    for (let k = bin[m]; k < bin[m + 1]; k++) if (k >= 0 && k < half && bin[m + 1] > bin[m]) w[k] = (bin[m + 1] - k) / (bin[m + 1] - bin[m]);
    filters.push(w);
  }
  _melCache.set(key, filters);
  return filters;
};

// DCT-II matrix (nCep × nMels) — the decorrelating cosine transform that turns the log-mel energies
// into cepstral coefficients. Cached per shape.
const _dctCache = new Map();
const dctMatrix = (nCep, nMels) => {
  const key = `${nCep}:${nMels}`;
  if (_dctCache.has(key)) return _dctCache.get(key);
  const M = [];
  for (let i = 0; i < nCep; i++) { const row = new Float64Array(nMels); for (let j = 0; j < nMels; j++) row[j] = Math.cos((Math.PI * i * (j + 0.5)) / nMels); M.push(row); }
  _dctCache.set(key, M);
  return M;
};

// One frame → its MFCC vector. Power spectrum → mel filterbank → log → DCT, keeping cepstra 1..nCep
// (c0, the overall log-energy, is dropped so loudness/distance doesn't stand in for identity).
export const frameMfcc = (frame, SR, window, { nMels = 26, nCep = 13 } = {}) => {
  const N = frame.length;
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = frame[i] * (window ? window[i] : 1);
  fft(re, im);
  const half = N >> 1;
  const power = new Float64Array(half);
  for (let k = 0; k < half; k++) power[k] = (re[k] * re[k] + im[k] * im[k]) / N;
  const fb = melFilterbank(N, SR, nMels);
  const logMel = new Float64Array(nMels);
  for (let m = 0; m < nMels; m++) { let e = 0; const w = fb[m]; for (let k = 0; k < half; k++) e += w[k] * power[k]; logMel[m] = Math.log(e + 1e-10); }
  const dct = dctMatrix(nCep + 1, nMels);
  const cep = new Float64Array(nCep);
  for (let i = 1; i <= nCep; i++) { let s = 0; const row = dct[i]; for (let j = 0; j < nMels; j++) s += row[j] * logMel[j]; cep[i - 1] = s; }
  return cep;
};

// ── pitch (F0) by autocorrelation — the evidence, not the substrate ─────────────────────────
export const framePitch = (frame, SR, { minF0 = 75, maxF0 = 400 } = {}) => {
  const N = frame.length;
  const minLag = Math.max(2, Math.floor(SR / maxF0));
  const maxLag = Math.min(N - 1, Math.ceil(SR / minF0));
  if (maxLag <= minLag) return { f0: null, voicing: 0 };
  let energy = 0; for (let i = 0; i < N; i++) energy += frame[i] * frame[i];
  if (energy <= 1e-9) return { f0: null, voicing: 0 };
  let bestLag = -1, bestR = 0;
  for (let lag = minLag; lag <= maxLag; lag++) { let r = 0; for (let i = 0; i + lag < N; i++) r += frame[i] * frame[i + lag]; const nr = r / energy; if (nr > bestR) { bestR = nr; bestLag = lag; } }
  if (bestLag < 0 || bestR < 0.3) return { f0: null, voicing: clamp01(bestR) };
  const rAt = (lag) => { let r = 0; for (let i = 0; i + lag < N; i++) r += frame[i] * frame[i + lag]; return r; };
  const y0 = rAt(bestLag - 1), y1 = rAt(bestLag), y2 = rAt(bestLag + 1);
  const denom = (y0 - 2 * y1 + y2);
  const shift = denom !== 0 ? (0.5 * (y0 - y2)) / denom : 0;
  const lag = bestLag + (isNum(shift) && Math.abs(shift) < 1 ? shift : 0);
  return { f0: SR / lag, voicing: clamp01(bestR) };
};

// Spectral centroid of a frame (energy-weighted mean frequency) — a cheap brightness for the roster.
const frameCentroid = (frame, SR, window) => {
  const N = frame.length;
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = frame[i] * (window ? window[i] : 1);
  fft(re, im);
  const half = N >> 1;
  let sm = 0, sfm = 0;
  for (let k = 1; k < half; k++) { const mag = Math.hypot(re[k], im[k]); sm += mag; sfm += ((k * SR) / N) * mag; }
  return sm > 1e-9 ? sfm / sm : null;
};

const frameZcr = (frame, SR) => { let c = 0; for (let i = 1; i < frame.length; i++) if ((frame[i - 1] < 0) !== (frame[i] < 0)) c++; return (c * SR) / frame.length; };

// ── LPC formants — the vocal-tract resonances, by Levinson–Durbin ────────────────────────────
// Fit an all-pole model to the frame's autocorrelation (the recursion), then read the resonance
// peaks off the LPC spectral envelope. The pole positions ARE the formants — F1/F2 are the strongest
// speaker cue after pitch. Best-effort evidence for the roster; not part of the clustering substrate.
export const lpcCoeffs = (frame, order) => {
  const N = frame.length;
  const r = new Float64Array(order + 1);
  for (let k = 0; k <= order; k++) { let s = 0; for (let i = 0; i + k < N; i++) s += frame[i] * frame[i + k]; r[k] = s; }
  if (r[0] <= 1e-9) return null;
  const a = new Float64Array(order + 1); a[0] = 1;
  let err = r[0];
  for (let i = 1; i <= order; i++) {
    let acc = r[i];
    for (let j = 1; j < i; j++) acc += a[j] * r[i - j];
    const k = -acc / err;
    if (!isFinite(k) || Math.abs(k) >= 1) return { a, err };   // unstable — stop, keep what we have
    const prev = a.slice();
    for (let j = 1; j < i; j++) a[j] = prev[j] + k * prev[i - j];
    a[i] = k;
    err *= (1 - k * k);
    if (err <= 0) break;
  }
  return { a, err };
};

const lpcFormants = (frame, SR) => {
  const order = Math.min(2 + Math.round(SR / 1000), frame.length - 1);
  if (order < 4) return [];
  const lp = lpcCoeffs(frame, order);
  if (!lp) return [];
  const a = lp.a;
  // Envelope |1/A(e^jw)| over a frequency grid; peaks are the formants.
  const G = 256, half = SR / 2;
  const mag = new Float64Array(G);
  for (let g = 0; g < G; g++) {
    const w = (Math.PI * g) / (G - 1);
    let re = 0, im = 0;
    for (let k = 0; k <= order; k++) { re += a[k] * Math.cos(k * w); im -= a[k] * Math.sin(k * w); }
    const d = re * re + im * im;
    mag[g] = d > 1e-12 ? 1 / Math.sqrt(d) : 0;
  }
  const peaks = [];
  for (let g = 1; g < G - 1; g++) { const f = (g / (G - 1)) * half; if (f < 90) continue; if (mag[g] > mag[g - 1] && mag[g] >= mag[g + 1]) peaks.push(f); }
  return peaks.slice(0, 3);
};

// ── the per-utterance analysis ──────────────────────────────────────────────────────────────
// One time span [start,end] → its MFCC frames (the clustering substrate) plus F0/formants/centroid
// (the roster evidence). Frames are ~46 ms (power-of-two near it), hopped ~23 ms, capped at
// `maxFrames`. Returns null when there's too little audio to measure.
export const analyzeUtterance = (mono, SR, start, end, { winMs = 46, hopMs = 23, maxFrames = 300, nMels = 26, nCep = 13 } = {}) => {
  if (!mono || !mono.length || !isNum(SR) || SR <= 0) return null;
  const a = Math.max(0, Math.floor((isNum(start) ? start : 0) * SR));
  const b = Math.min(mono.length, Math.ceil((isNum(end) ? end : 0) * SR));
  if (b - a < SR * 0.05) return null;
  const win = pow2Floor(Math.min(b - a, Math.max(256, Math.round((winMs / 1000) * SR))));
  if (win < 128) return null;
  const hop = Math.max(1, Math.round((hopMs / 1000) * SR));
  const window = hann(win);
  const mfcc = [];
  const f0s = [], cents = [], zcrs = [], f1s = [], f2s = [];
  let voiced = 0, total = 0, sq = 0, sqn = 0, idx = 0;
  for (let i = a; i + win <= b; i += hop) {
    if (maxFrames && idx >= maxFrames) break; idx++; total++;
    const frame = mono.subarray(i, i + win);
    for (let j = 0; j < win; j++) { sq += frame[j] * frame[j]; sqn++; }
    mfcc.push(frameMfcc(frame, SR, window, { nMels, nCep }));
    const p = framePitch(frame, SR); if (p.f0 != null) { f0s.push(p.f0); voiced++; }
    const c = frameCentroid(frame, SR, window); if (c != null) cents.push(c);
    zcrs.push(frameZcr(frame, SR));
    const fm = lpcFormants(frame, SR); if (fm[0]) f1s.push(fm[0]); if (fm[1]) f2s.push(fm[1]);
  }
  if (!total || !mfcc.length) return null;
  const f0sorted = f0s.slice().sort((p, q) => p - q);
  return {
    mfcc,                                   // Float64Array[] — the clustering substrate
    f0: f0s.length ? +median(f0s).toFixed(1) : null,
    f0lo: f0sorted.length ? +f0sorted[Math.floor(f0sorted.length * 0.1)].toFixed(1) : null,
    f0hi: f0sorted.length ? +f0sorted[Math.floor(f0sorted.length * 0.9)].toFixed(1) : null,
    f1: f1s.length ? +median(f1s).toFixed(0) : null,
    f2: f2s.length ? +median(f2s).toFixed(0) : null,
    centroid: cents.length ? +mean(cents).toFixed(1) : null,
    zcr: zcrs.length ? +mean(zcrs).toFixed(1) : null,
    voicedRatio: +(voiced / total).toFixed(3),
    rms: sqn ? +Math.sqrt(sq / sqn).toFixed(5) : 0,
    frames: total,
  };
};

// ── full-covariance Gaussian over a set of frames ────────────────────────────────────────────
// The segment model BIC selects between. Regularized so a short or near-stationary segment (few
// frames, rank-deficient covariance) still has a finite, positive-definite covariance to score.
export const gaussianModel = (frames, { shrink = 0.15, floor = 1e-3 } = {}) => {
  const n = frames.length;
  const d = n ? frames[0].length : 0;
  if (!n || !d) return null;
  const mean = new Float64Array(d);
  for (const f of frames) for (let i = 0; i < d; i++) mean[i] += f[i];
  for (let i = 0; i < d; i++) mean[i] /= n;
  const cov = Array.from({ length: d }, () => new Float64Array(d));
  for (const f of frames) for (let i = 0; i < d; i++) { const di = f[i] - mean[i]; for (let j = i; j < d; j++) cov[i][j] += di * (f[j] - mean[j]); }
  for (let i = 0; i < d; i++) for (let j = i; j < d; j++) { const v = cov[i][j] / Math.max(1, n); cov[i][j] = v; cov[j][i] = v; }
  // Shrink toward the diagonal + a floor on the diagonal, so Cholesky finds it positive-definite.
  for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) { if (i !== j) cov[i][j] *= (1 - shrink); }
  for (let i = 0; i < d; i++) cov[i][i] += floor;
  return { n, d, mean, cov, logDet: logDetCholesky(cov, d) };
};

// log|Σ| via Cholesky (Σ = L Lᵀ, log|Σ| = 2·Σ log Lᵢᵢ). Adds jitter and retries if not PD.
const logDetCholesky = (cov, d) => {
  let jitter = 0;
  for (let attempt = 0; attempt < 6; attempt++) {
    const L = Array.from({ length: d }, () => new Float64Array(d));
    let ok = true, logDet = 0;
    for (let i = 0; i < d && ok; i++) {
      for (let j = 0; j <= i; j++) {
        let s = cov[i][j] + (i === j ? jitter : 0);
        for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
        if (i === j) { if (s <= 0) { ok = false; break; } L[i][j] = Math.sqrt(s); logDet += Math.log(s); }
        else L[i][j] = s / L[j][j];
      }
    }
    if (ok) return logDet;   // Σ log(Lᵢᵢ²) = Σ log(diagonal pivots)
    jitter = jitter === 0 ? 1e-6 : jitter * 10;
  }
  return d * Math.log(1e-3);   // give up gracefully — a floor-covariance det
};

// ── ΔBIC — the model-selection comparison (Chen–Gopalakrishnan) ──────────────────────────────
// Is the pooled span better modeled as ONE full-covariance Gaussian or TWO? Returns { dbic, verdict,
// margin }. dbic > +dead ⇒ 'different' (two models win — keep apart); dbic < −dead ⇒ 'same' (one wins
// — merge); |dbic| ≤ dead ⇒ 'indeterminate' (suspend the cut). The penalty is DERIVED (Occam), so
// there is no arbitrary distance threshold — only λ (theoretically 1) and the dead-band width.
export const deltaBIC = (framesA, framesB, { lambda = 1.3, dead = 0, gaussOpts = {} } = {}) => {
  const A = gaussianModel(framesA, gaussOpts);
  const B = gaussianModel(framesB, gaussOpts);
  const AB = gaussianModel(framesA.concat(framesB), gaussOpts);
  if (!A || !B || !AB) return { dbic: 0, verdict: 'indeterminate', margin: 0 };
  const N = AB.n, d = AB.d;
  const penalty = 0.5 * (d + 0.5 * d * (d + 1)) * Math.log(Math.max(2, N));
  const dbic = 0.5 * N * AB.logDet - 0.5 * A.n * A.logDet - 0.5 * B.n * B.logDet - lambda * penalty;
  const band = dead || 0;
  const verdict = dbic > band ? 'different' : (dbic < -band ? 'same' : 'indeterminate');
  return { dbic: +dbic.toFixed(2), verdict, margin: +Math.abs(dbic).toFixed(2) };
};

// ── the background relevance model (a GMM fold of the acoustic space), deterministically ──────
// Farthest-first traversal seeds K centres (no RNG), then a few Lloyd iterations. Diagonal-Gaussian
// components. This is the IB relevance variable Y — "a fold of the acoustic space" the clustering
// preserves information about.
const kmeansDet = (frames, K, iters = 6) => {
  const n = frames.length, d = frames[0].length;
  const dist2 = (a, b) => { let s = 0; for (let i = 0; i < d; i++) { const x = a[i] - b[i]; s += x * x; } return s; };
  // Seed: the global mean, then repeatedly the point farthest from the chosen set.
  const centres = [frames[0]];
  const nearest = new Float64Array(n).fill(Infinity);
  while (centres.length < Math.min(K, n)) {
    const c = centres[centres.length - 1];
    let far = 0, fi = 0;
    for (let i = 0; i < n; i++) { const dd = dist2(frames[i], c); if (dd < nearest[i]) nearest[i] = dd; if (nearest[i] > far) { far = nearest[i]; fi = i; } }
    centres.push(frames[fi].slice());
  }
  let cent = centres.map((c) => Float64Array.from(c));
  const assign = new Int32Array(n);
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < n; i++) { let bd = Infinity, bj = 0; for (let j = 0; j < cent.length; j++) { const dd = dist2(frames[i], cent[j]); if (dd < bd) { bd = dd; bj = j; } } assign[i] = bj; }
    const sum = cent.map(() => new Float64Array(d)); const cnt = new Int32Array(cent.length);
    for (let i = 0; i < n; i++) { const c = assign[i]; cnt[c]++; const f = frames[i]; for (let k = 0; k < d; k++) sum[c][k] += f[k]; }
    for (let j = 0; j < cent.length; j++) if (cnt[j]) for (let k = 0; k < d; k++) cent[j][k] = sum[j][k] / cnt[j];
  }
  // Diagonal variances per component (with a floor).
  const varr = cent.map(() => new Float64Array(d).fill(0)); const cnt = new Int32Array(cent.length);
  for (let i = 0; i < n; i++) { const c = assign[i]; cnt[c]++; const f = frames[i]; for (let k = 0; k < d; k++) { const dx = f[k] - cent[c][k]; varr[c][k] += dx * dx; } }
  for (let j = 0; j < cent.length; j++) for (let k = 0; k < d; k++) varr[j][k] = varr[j][k] / Math.max(1, cnt[j]) + 1e-2;
  const weight = Array.from(cnt, (c) => Math.max(c, 1) / n);
  return { cent, varr, weight, K: cent.length };
};

// Responsibility of frame x over the GMM components (softmax of the diagonal-Gaussian log-likelihood).
const responsibility = (x, gmm) => {
  const { cent, varr, weight, K } = gmm; const d = x.length;
  const logp = new Float64Array(K);
  for (let j = 0; j < K; j++) { let s = Math.log(weight[j]); for (let k = 0; k < d; k++) { const dx = x[k] - cent[j][k]; s += -0.5 * (Math.log(2 * Math.PI * varr[j][k]) + (dx * dx) / varr[j][k]); } logp[j] = s; }
  let mx = -Infinity; for (let j = 0; j < K; j++) if (logp[j] > mx) mx = logp[j];
  let z = 0; const r = new Float64Array(K); for (let j = 0; j < K; j++) { r[j] = Math.exp(logp[j] - mx); z += r[j]; }
  for (let j = 0; j < K; j++) r[j] /= (z || 1);
  return r;
};

// Weighted Jensen–Shannon divergence between two relevance profiles — the comparison the IB objective
// FORCES (not an imposed cosine). JS(p,q; π) = π₁·KL(p‖m) + π₂·KL(q‖m), m = π₁p + π₂q.
export const jsDivergence = (p, q, w1 = 0.5, w2 = 0.5) => {
  const K = p.length; let js = 0;
  for (let j = 0; j < K; j++) {
    const m = w1 * p[j] + w2 * q[j]; if (m <= 0) continue;
    if (p[j] > 0) js += w1 * p[j] * Math.log(p[j] / m);
    if (q[j] > 0) js += w2 * q[j] * Math.log(q[j] / m);
  }
  return js > 0 ? js : 0;
};

// ── the clustering — IB ordering, ΔBIC-gated, INDETERMINATE-aware ─────────────────────────────
// segments: [{ frames: Float64Array[] }]. Greedy agglomeration: at each step take the pair the IB
// objective says is CLOSEST (smallest weighted JS over the relevance profiles), and ACCEPT the merge
// only if ΔBIC over the pooled frames says one Gaussian beats two ('same'); a 'different' pair is
// blocked; an 'indeterminate' pair is left apart and logged. Stop when no pair is acceptable. The
// speaker count falls out. Every decision is a witness { a, b, jsd, dbic, verdict }.
export const clusterSegments = (segments, { lambda = 1.3, dead = 8, maxSpeakers = 8, gmm = null } = {}) => {
  const n = segments.length;
  const witnesses = [];
  if (n <= 1) return { assign: new Array(n).fill(0), count: n, witnesses };

  // Relevance profiles p(y|segment) over the background GMM (if provided) — the IB space.
  const profileOf = (frames) => {
    if (!gmm) return null;
    const acc = new Float64Array(gmm.K);
    for (const f of frames) { const r = responsibility(f, gmm); for (let j = 0; j < gmm.K; j++) acc[j] += r[j]; }
    for (let j = 0; j < gmm.K; j++) acc[j] /= Math.max(1, frames.length);
    return acc;
  };

  let clusters = segments.map((s, i) => ({ frames: s.frames.slice(), members: [i], profile: profileOf(s.frames), weight: s.frames.length }));
  const blocked = new Set();   // pair keys the ΔBIC gate refused this round
  const pkey = (i, j) => (i < j ? `${i}:${j}` : `${j}:${i}`);

  while (clusters.length > 1) {
    // Rank candidate pairs by the IB comparison (weighted JS); fall back to raw Gaussian distance
    // of the means when there is no relevance model. Skip pairs already blocked by the gate.
    let bi = -1, bj = -1, bcost = Infinity;
    for (let i = 0; i < clusters.length; i++) for (let j = i + 1; j < clusters.length; j++) {
      if (blocked.has(pkey(clusters[i].members[0], clusters[j].members[0]))) continue;
      const wi = clusters[i].weight, wj = clusters[j].weight, tot = wi + wj;
      const cost = (clusters[i].profile && clusters[j].profile)
        ? tot * jsDivergence(clusters[i].profile, clusters[j].profile, wi / tot, wj / tot)
        : meanDist(clusters[i].frames, clusters[j].frames);
      if (cost < bcost) { bcost = cost; bi = i; bj = j; }
    }
    if (bi < 0) break;   // every remaining pair is blocked — the partition has settled

    const forced = clusters.length > maxSpeakers;   // over the cap → must keep merging regardless
    const gate = deltaBIC(clusters[bi].frames, clusters[bj].frames, { lambda, dead });
    const wit = { a: clusters[bi].members.slice(), b: clusters[bj].members.slice(), jsd: +bcost.toFixed(4), dbic: gate.dbic, verdict: forced && gate.verdict !== 'same' ? 'forced' : gate.verdict };

    if (gate.verdict === 'same' || forced) {
      witnesses.push(wit);
      const merged = { frames: clusters[bi].frames.concat(clusters[bj].frames), members: clusters[bi].members.concat(clusters[bj].members), weight: clusters[bi].weight + clusters[bj].weight };
      merged.profile = profileOf(merged.frames);
      clusters.splice(bj, 1); clusters[bi] = merged;
      blocked.clear();   // the landscape changed — re-open every pair
    } else {
      // 'different' or 'indeterminate' — do not merge this closest pair; block it and try the next.
      witnesses.push(wit);
      blocked.add(pkey(clusters[bi].members[0], clusters[bj].members[0]));
    }
  }

  const assign = new Array(n).fill(0);
  clusters.forEach((c, k) => c.members.forEach((m) => { assign[m] = k; }));
  return { assign, count: clusters.length, witnesses };
};

const meanDist = (fa, fb) => {
  const d = fa[0].length; const ma = new Float64Array(d), mb = new Float64Array(d);
  for (const f of fa) for (let i = 0; i < d; i++) ma[i] += f[i]; for (let i = 0; i < d; i++) ma[i] /= fa.length;
  for (const f of fb) for (let i = 0; i < d; i++) mb[i] += f[i]; for (let i = 0; i < d; i++) mb[i] /= fb.length;
  let s = 0; for (let i = 0; i < d; i++) { const x = ma[i] - mb[i]; s += x * x; } return Math.sqrt(s);
};

// ── diarize — the whole pass ─────────────────────────────────────────────────────────────────
// Reads each utterance's MFCC frames + F0/formant evidence, builds the background GMM, clusters by
// IB-ordering under a ΔBIC gate, and returns { count, assign, features, speakers, witnesses }.
// Speakers are renumbered by first appearance. Safe on anything: <2 measurable utterances ⇒ one
// speaker; nothing measurable ⇒ count 0. Deterministic and re-runnable to the number.
export const diarize = (mono, SR, utterances = [], opts = {}) => {
  const feats = utterances.map((u) => analyzeUtterance(mono, SR, u.start, u.end, opts));
  const usable = feats.map((f, i) => (f && f.mfcc && f.mfcc.length ? i : -1)).filter((i) => i >= 0);
  const rosterFeat = (i) => feats[i];
  const base = { count: 0, assign: utterances.map(() => 0), features: feats.map(stripFrames), speakers: [], witnesses: [] };
  if (!usable.length) return base;
  if (usable.length === 1) {
    const assign = utterances.map(() => 0);
    return { count: 1, assign, features: feats.map(stripFrames), speakers: [rosterEntry(0, [usable[0]], feats, utterances)], witnesses: [] };
  }

  // The background relevance model — one GMM over all voiced MFCC frames (subsampled for the fit so a
  // long clip stays cheap). K scales with the data but stays modest — a coarse fold is enough for IB.
  const allFrames = [];
  for (const i of usable) for (const f of feats[i].mfcc) allFrames.push(f);
  const trainFrames = subsample(allFrames, 6000);
  const K = Math.max(8, Math.min(48, Math.round(Math.sqrt(trainFrames.length))));
  let gmm = null;
  try { gmm = kmeansDet(trainFrames, K); } catch { gmm = null; }

  const segments = usable.map((i) => ({ frames: feats[i].mfcc }));
  const { assign: subAssign, count, witnesses } = clusterSegments(segments, { ...opts, gmm });

  // Map sub-assignments back to all utterances; attach an unmeasurable utterance to its nearest
  // measurable neighbour in time so every utterance still gets a speaker.
  const raw = new Array(utterances.length).fill(-1);
  usable.forEach((i, k) => { raw[i] = subAssign[k]; });
  for (let i = 0; i < utterances.length; i++) {
    if (raw[i] >= 0) continue;
    let best = -1, bd = Infinity;
    for (const m of usable) { const d = Math.abs((utterances[m].start ?? 0) - (utterances[i].start ?? 0)); if (d < bd) { bd = d; best = m; } }
    raw[i] = best >= 0 ? raw[best] : 0;
  }
  // Renumber by first appearance.
  const order = new Map();
  for (let i = 0; i < utterances.length; i++) if (!order.has(raw[i])) order.set(raw[i], order.size);
  const assign = raw.map((r) => order.get(r));

  const speakers = [];
  for (let s = 0; s < order.size; s++) { const mine = []; for (let i = 0; i < utterances.length; i++) if (assign[i] === s) mine.push(i); speakers.push(rosterEntry(s, mine, feats, utterances)); }

  return { count: order.size, assign, features: feats.map(stripFrames), speakers, witnesses };
};

// Drop the heavy per-frame MFCC arrays before the features leave the module — the caller keeps the
// roster + per-word speaker, not the raw frames.
const stripFrames = (f) => { if (!f) return null; const { mfcc, ...rest } = f; return rest; };

const rosterEntry = (id, memberUtterances, feats, utterances) => {
  const fs = memberUtterances.map((i) => feats[i]).filter(Boolean);
  const seconds = memberUtterances.reduce((t, i) => t + Math.max(0, (utterances[i].end ?? 0) - (utterances[i].start ?? 0)), 0);
  const agg = (key, dp = 1) => { const v = mean(fs.map((f) => f[key])); return v != null ? +v.toFixed(dp) : null; };
  return {
    id, label: `Speaker ${id + 1}`, utterances: memberUtterances.length, seconds: +seconds.toFixed(1),
    f0: agg('f0'), f0lo: agg('f0lo'), f0hi: agg('f0hi'),
    f1: agg('f1', 0), f2: agg('f2', 0), centroid: agg('centroid'), zcr: agg('zcr'),
  };
};

const subsample = (arr, max) => { if (arr.length <= max) return arr; const stride = arr.length / max; const out = []; for (let i = 0; i < max; i++) out.push(arr[Math.floor(i * stride)]); return out; };
