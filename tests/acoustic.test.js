// The pre-transcription cochlea (organs/in/acoustic.js) — the reading a waveform gets the
// instant it is decoded: a drawable envelope, the basic acoustic facts, and — the load-bearing
// claim — SIGNAL SEPARATED FROM NOISE as NESTED HOLONS, raised onto the spine before a word is
// transcribed. Everything here is pure Float32-in, objects-out, so it is pinned browserless.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  waveformPeaks, analyzeAudio, separateHolons, ingestAcoustic, acousticSummary, toDb,
} from '../src/organs/in/acoustic.js';
import { emitEot } from '../src/organs/ingest/eot-emit.js';

const SR = 16000;

// A clip built from named tone bursts against a whisper-quiet noise floor — so a test can
// assert exactly where the signal is and where the silence is.
const clip = (durSec, bursts, { floor = 0.0006 } = {}) => {
  const n = Math.round(durSec * SR);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = Math.sin(i * 0.31) * floor;   // steady sub-audible hiss
  for (const [a, b, f, amp] of bursts) {
    for (let i = Math.round(a * SR); i < Math.round(b * SR) && i < n; i++) x[i] += amp * Math.sin(2 * Math.PI * f * i / SR);
  }
  return x;
};

// ── the drawable envelope ────────────────────────────────────────────────────────────────

test('waveformPeaks: returns the requested column count, each a min/max/amp/rms bucket', () => {
  const x = clip(2, [[0.5, 1.5, 220, 0.5]]);
  const peaks = waveformPeaks(x, 100);
  assert.equal(peaks.length, 100);
  for (const p of peaks) {
    assert.ok(p.max >= 0 && p.min <= 0, 'a real waveform bucket straddles zero');
    assert.ok(p.amp >= 0 && p.rms >= 0);
    assert.ok(p.amp >= p.rms - 1e-9, 'peak amplitude is at least the RMS');
  }
  // The loud middle column reads louder than the quiet edge columns.
  assert.ok(peaks[50].amp > peaks[2].amp, 'the burst column is louder than the silence column');
});

test('waveformPeaks: never returns more columns than samples, and is empty for empty input', () => {
  assert.deepEqual(waveformPeaks(new Float32Array(0), 100), []);
  assert.equal(waveformPeaks(new Float32Array(5), 100).length, 5);
});

// ── the basic analysis ──────────────────────────────────────────────────────────────────

test('analyzeAudio: reports duration, peak, loudness, dynamic range and a silence fraction', () => {
  const x = clip(4, [[1, 3, 300, 0.5]]);   // half the clip is a loud tone, half is floor
  const a = analyzeAudio(x, SR);
  assert.ok(Math.abs(a.duration - 4) < 0.01, 'duration is samples / rate');
  assert.equal(a.sampleRate, SR);
  assert.ok(a.peak > 0.4 && a.peak <= 1, 'peak tracks the 0.5-amplitude tone');
  assert.ok(a.peakDb > a.rmsDb, 'peak sits above the RMS');
  assert.ok(a.dynamicRangeDb > 20, 'a loud tone over a quiet floor is a wide dynamic range');
  assert.ok(a.silencePct > 20 && a.silencePct < 80, 'about half the clip sits at the floor');
});

test('toDb: 0 is the finite floor, 1 is 0 dBFS', () => {
  assert.ok(toDb(0) <= -120);
  assert.ok(Math.abs(toDb(1)) < 1e-9);
  assert.ok(Math.abs(toDb(0.5) - (-6.02)) < 0.1, 'half amplitude ≈ −6 dB');
});

// ── the nested holons — the separation proper ───────────────────────────────────────────

test('separateHolons: cuts a clip into the right signal spans, with silence between', () => {
  // silence · tone · silence · tone · silence
  const x = clip(5, [[0.8, 2.0, 220, 0.5], [3.0, 4.2, 440, 0.4]]);
  const h = separateHolons(x, SR);
  assert.equal(h.signalSpans.length, 2, 'two bursts → two top-level signal holons');
  // The spans sit where the tones are (within a frame's tolerance).
  assert.ok(Math.abs(h.signalSpans[0].start - 0.8) < 0.15 && Math.abs(h.signalSpans[0].end - 2.0) < 0.15);
  assert.ok(Math.abs(h.signalSpans[1].start - 3.0) < 0.15 && Math.abs(h.signalSpans[1].end - 4.2) < 0.15);
  assert.ok(h.signalSeconds > 2.0 && h.signalSeconds < 3.0, 'signal totals ≈ the two 1.2s / 1.0s bursts');
  assert.ok(h.noiseSpans.length >= 2, 'silences separate and bracket the signal');
  // The root is the whole clip; its children alternate signal and noise and tile it exactly.
  const kids = h.root.children;
  assert.ok(kids.length >= 3);
  assert.ok(Math.abs(kids[0].start - 0) < 1e-6 && Math.abs(kids[kids.length - 1].end - 5) < 0.05, 'children tile the clip end to end');
  for (let i = 1; i < kids.length; i++) assert.ok(kids[i].kind !== kids[i - 1].kind, 'signal and noise strictly alternate');
});

test('separateHolons: a clip with no signal above the floor reads as pure noise (nothing to transcribe)', () => {
  const x = clip(3, [], { floor: 0.0005 });   // just hiss, no burst
  const h = separateHolons(x, SR);
  assert.equal(h.signalSpans.length, 0, 'no burst → no signal holon');
  assert.equal(h.signalSeconds, 0);
});

test('separateHolons: a louder burst inside a phrase nests as a sub-holon (whole at its own scale)', () => {
  // One long "phrase" that is quiet-ish throughout but has a much louder swell in its middle:
  // the phrase is one signal holon, and the swell rises as a signal sub-holon inside it.
  const n = Math.round(4 * SR);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = Math.sin(i * 0.29) * 0.0006;   // floor
  for (let i = Math.round(0.5 * SR); i < Math.round(3.5 * SR); i++) x[i] += 0.06 * Math.sin(2 * Math.PI * 200 * i / SR);   // the phrase
  for (let i = Math.round(1.6 * SR); i < Math.round(2.4 * SR); i++) x[i] += 0.5 * Math.sin(2 * Math.PI * 200 * i / SR);    // the swell
  const h = separateHolons(x, SR);
  assert.ok(h.signalSpans.length >= 1, 'the phrase is a signal holon');
  assert.ok(h.depth >= 2, 'the louder swell nests one level deeper');
  const phrase = h.root.children.find((c) => c.kind === 'signal');
  assert.ok(phrase && (phrase.children || []).some((k) => k.kind === 'signal'), 'the phrase holon contains a louder signal sub-holon');
});

test('separateHolons: a hairline dropout inside a phrase does not shatter it into noise', () => {
  // A tone (bracketed by silence, so there IS a noise floor to measure against) with a
  // two-sample dropout in its middle should still read as ONE signal holon, not two.
  const x = clip(2.4, [[0.4, 2.0, 300, 0.4]]);
  x[Math.round(1.2 * SR)] = 0; x[Math.round(1.2 * SR) + 1] = 0;   // a 2-sample dropout
  const h = separateHolons(x, SR);
  assert.equal(h.signalSpans.length, 1, 'a hairline dropout is coalesced, not split');
});

// ── raising the reading onto the spine ───────────────────────────────────────────────────

test('ingestAcoustic: the holons land as a readable doc that encodes into EoT', () => {
  const x = clip(4, [[0.6, 1.8, 220, 0.5], [2.6, 3.6, 440, 0.4]]);
  const analysis = analyzeAudio(x, SR);
  const holons = separateHolons(x, SR);
  const peaks = waveformPeaks(x, 200);
  const doc = ingestAcoustic({ name: 'clip-1', title: 'Test clip', duration: 4, sampleRate: SR, analysis, holons, peaks, media: 'blob:xyz' });

  assert.equal(doc.modality, 'audio');
  assert.equal(doc.media, 'blob:xyz');
  assert.ok(doc.units.length >= 3, 'one display line per top-level holon');
  assert.ok(doc.text.includes('Signal separated from noise'), 'the readable text carries the separation');

  // Every holon is an entity on the spine; the signal/noise verdict is an EVA event.
  const log = doc.log.snapshot();
  assert.ok(log.some((e) => e.op === 'INS'), 'holons are INS entities');
  assert.ok(log.some((e) => e.op === 'EVA' && e.reason === 'signal-above-floor'), 'signal spans are evaluated on the record');
  assert.ok(log.some((e) => e.op === 'EVA' && e.reason === 'noise-below-floor'), 'noise spans are evaluated on the record');
  assert.ok(log.some((e) => e.op === 'CON'), 'the reading line of time bonds the holons (containment appears when they nest)');

  // The universal contract: the doc reads into canonical EoT, uncapped.
  const eot = emitEot(doc.log);
  assert.ok(eot.lines.length > 0, 'the acoustic reading encodes into EoT');
  const reading = doc.reading();
  assert.ok(reading.text.length > 0 && reading.structure.lines.length > 0);
});

test('ingestAcoustic: a signal-free clip still lands as a source (silence, not an error)', () => {
  const x = clip(2, [], { floor: 0.0005 });
  const holons = separateHolons(x, SR);
  const analysis = analyzeAudio(x, SR);
  const doc = ingestAcoustic({ name: 'hush', title: 'Hush', duration: 2, sampleRate: SR, analysis, holons });
  assert.ok(doc.units.length >= 1, 'even silence gets a display line');
  assert.ok(/no signal/i.test(doc.text), 'the reading says there is nothing to transcribe');
});

test('acousticSummary: names the signal holons and the totals', () => {
  const x = clip(3, [[0.5, 1.5, 220, 0.5]]);
  const holons = separateHolons(x, SR);
  const analysis = analyzeAudio(x, SR);
  const md = acousticSummary({ title: 'One burst', analysis, holons, mediaKind: 'audio' });
  assert.ok(md.startsWith('# One burst'));
  assert.ok(md.includes('signal holon'));
  assert.ok(/An audio clip/.test(md));
});
