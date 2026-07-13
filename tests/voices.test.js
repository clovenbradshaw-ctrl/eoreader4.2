import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  fft, framePitch, frameMfcc, lpcCoeffs, analyzeUtterance,
  gaussianModel, deltaBIC, jsDivergence, clusterSegments, diarize,
} from '../src/organs/in/voices.js';

// Speaker separation from the waveform (organs/in/voices.js) — the PRE-NEURAL, information-theoretic
// diarizer: MFCC/LPC features, full-covariance Gaussians, IB-ordered merges (Jensen–Shannon) gated by
// ΔBIC model selection, INDETERMINATE living in the ΔBIC dead-band. No training corpus, deterministic,
// every decision a witness. These tests drive the math on synthetic voiced signals (a known formant
// structure is a known voice), the way every organ is pinned browserless.

const SR = 16000;

// A deterministic pseudo-noise (no Math.random in the harness) — a linear congruential sequence in
// [-amp,amp]. Used to dither the synthetic voices so their covariances aren't singular.
const noise = (n, amp, seed = 1) => {
  const out = new Float32Array(n); let s = seed >>> 0;
  for (let i = 0; i < n; i++) { s = (1103515245 * s + 12345) >>> 0; out[i] = ((s / 0xffffffff) * 2 - 1) * amp; }
  return out;
};

// A voiced signal: a fundamental + two formant-shaped harmonics, plus dither. `bright` shifts the
// upper harmonic (a different vocal-tract timbre → a different voice at the same pitch).
const voice = (f0, seconds, { amp = 0.3, bright = 3, seed = 7 } = {}) => {
  const n = Math.round(seconds * SR), out = noise(n, amp * 0.08, seed);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    out[i] += amp * (Math.sin(2 * Math.PI * f0 * t) + 0.5 * Math.sin(2 * Math.PI * 2 * f0 * t) + 0.3 * Math.sin(2 * Math.PI * bright * f0 * t));
  }
  return out;
};

test('fft transforms a pure tone to a single dominant bin', () => {
  const N = 1024, f = 500;
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = Math.sin((2 * Math.PI * f * i) / SR);
  fft(re, im);
  let peakK = 0, peak = 0;
  for (let k = 1; k < N / 2; k++) { const m = Math.hypot(re[k], im[k]); if (m > peak) { peak = m; peakK = k; } }
  assert.ok(Math.abs((peakK * SR) / N - f) < SR / N, 'dominant bin ≈ the tone frequency');
});

test('framePitch recovers the fundamental of a voiced frame', () => {
  const { f0, voicing } = framePitch(voice(150, 0.1).subarray(0, 1024), SR);
  assert.ok(f0 != null && Math.abs(f0 - 150) < 8, `pitch ${f0?.toFixed(1)}Hz ≈ 150Hz`);
  assert.ok(voicing > 0.4, 'strong self-correlation ⇒ voiced');
});

test('frameMfcc returns a fixed-length cepstral vector; different timbres differ', () => {
  const win = 512;
  const a = frameMfcc(voice(150, 0.1, { bright: 3 }).subarray(0, win), SR);
  const b = frameMfcc(voice(150, 0.1, { bright: 9 }).subarray(0, win), SR);
  assert.equal(a.length, 13, '13 cepstra');
  let diff = 0; for (let i = 0; i < 13; i++) diff += Math.abs(a[i] - b[i]);
  assert.ok(diff > 0.5, 'a brighter timbre yields a different MFCC');
});

test('lpcCoeffs fits a stable all-pole model (Levinson–Durbin)', () => {
  const lp = lpcCoeffs(voice(120, 0.1).subarray(0, 512), 18);
  assert.ok(lp && lp.a[0] === 1 && isFinite(lp.err), 'coefficients returned, a[0]=1');
});

test('gaussianModel + deltaBIC: same voice ⇒ "same", different voices ⇒ "different"', () => {
  const fA = analyzeUtterance(voice(115, 0.9, { seed: 3 }), SR, 0, 0.9).mfcc;
  const fA2 = analyzeUtterance(voice(117, 0.9, { seed: 4 }), SR, 0, 0.9).mfcc;
  const fB = analyzeUtterance(voice(220, 0.9, { bright: 6, seed: 5 }), SR, 0, 0.9).mfcc;
  assert.ok(gaussianModel(fA) && isFinite(gaussianModel(fA).logDet), 'a finite log-determinant');
  const same = deltaBIC(fA, fA2, { dead: 0 });
  const diff = deltaBIC(fA, fB, { dead: 0 });
  assert.equal(same.verdict, 'same', `two takes of one voice read as same (ΔBIC ${same.dbic})`);
  assert.equal(diff.verdict, 'different', `two distinct voices read as different (ΔBIC ${diff.dbic})`);
});

test('jsDivergence is zero for identical distributions and positive for disjoint ones', () => {
  assert.equal(jsDivergence([0.5, 0.5], [0.5, 0.5]), 0);
  assert.ok(jsDivergence([1, 0], [0, 1]) > 0.6, 'disjoint mass ⇒ high JS');
});

test('clusterSegments keeps one voice as one and splits two — with a witness per decision', () => {
  const seg = (f0, seed, bright = 3) => ({ frames: analyzeUtterance(voice(f0, 0.9, { seed, bright }), SR, 0, 0.9).mfcc });
  const one = clusterSegments([seg(120, 1), seg(122, 2), seg(119, 3)], { dead: 8 });
  assert.equal(one.count, 1, 'a homogeneous set is one speaker');
  assert.ok(one.witnesses.length >= 1 && one.witnesses.every((w) => 'dbic' in w && 'jsd' in w), 'every decision carries a ΔBIC margin and a JS cost');
  const two = clusterSegments([seg(115, 1), seg(117, 2), seg(235, 3, 7), seg(232, 4, 7)], { dead: 8 });
  assert.equal(two.count, 2, 'two distinct voices are two speakers');
});

test('diarize separates two voices, merges a repeat, and reports each voice\'s measured pitch', () => {
  const lo1 = voice(112, 0.9, { seed: 1 }), hi = voice(232, 0.9, { bright: 7, seed: 2 }), lo2 = voice(114, 0.9, { seed: 3 });
  const total = new Float32Array(SR * 3);
  total.set(lo1, 0); total.set(hi, SR); total.set(lo2, SR * 2);
  const utterances = [{ start: 0, end: 0.9 }, { start: 1, end: 1.9 }, { start: 2, end: 2.9 }];
  const res = diarize(total, SR, utterances);
  assert.equal(res.count, 2, 'two voices found');
  assert.equal(res.assign[0], res.assign[2], 'the two low utterances share a speaker');
  assert.notEqual(res.assign[0], res.assign[1], 'the high utterance is a different speaker');
  const s0 = res.speakers[res.assign[0]];
  assert.ok(Math.abs(s0.f0 - 113) < 14, `first speaker's measured pitch ~112Hz, got ${s0.f0}`);
  assert.ok(res.witnesses.length >= 1, 'the merge/keep trail is recorded');
  assert.ok(res.features.every((f) => !f || !('mfcc' in f)), 'raw frames are stripped from the returned features');
});

test('diarize is safe on a single utterance and on silence', () => {
  assert.equal(diarize(voice(150, 0.6), SR, [{ start: 0, end: 0.6 }]).count, 1);
  const res = diarize(new Float32Array(SR), SR, [{ start: 0, end: 1 }]);
  assert.ok(res.count <= 1 && res.assign.length === 1, 'silence ⇒ ≤1 speaker, still an assignment');
});
