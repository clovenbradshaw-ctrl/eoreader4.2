import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildAudioReading } from '../src/perceiver/audio/waveform.js';
import { validateReading } from '../src/perceiver/contract.js';
import { buildWaveform } from '../src/weave/waveform/build.js';

// THE AUDIO PERCEIVER — a synthetic clip built from known tones, so the answer
// is known before the perceiver runs (docs/omnimodal-waveform.md §8's own
// validation protocol): a 300Hz motif, silence, a distinct 1200Hz motif,
// silence, then the 300Hz motif AGAIN — a real, non-adjacent recurrence, the
// audio analogue of the text perceiver's Frankenstein fixture.

const SAMPLE_RATE = 8000;
const FRAME_SIZE = 512;
const FRAME_DUR = FRAME_SIZE / SAMPLE_RATE;

const tone = (freq, frames, amp = 0.8) => {
  const samples = new Float64Array(frames * FRAME_SIZE);
  for (let i = 0; i < samples.length; i++) samples[i] = amp * Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE);
  return samples;
};
const silence = (frames) => new Float64Array(frames * FRAME_SIZE);

// Silence needs to occupy a substantial share of the clip — organs/in/acoustic.js's
// signal/noise floor is a 20th-percentile read over 20ms energy frames, so a clip
// that is mostly tone (as a short unit test would default to) pushes the floor
// itself up into signal-level energy. Real recordings are rarely 80%+ continuous
// tone; this fixture's proportions (roughly half silence) are what makes the
// floor read correctly, not a tuning of the perceiver itself.
const buildClip = () => {
  const parts = [tone(300, 10), silence(15), tone(1200, 10), silence(15), tone(300, 10)];
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Float64Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
};

test('buildAudioReading: produces a valid Reading with one field vector per frame', () => {
  const mono = buildClip();
  const reading = buildAudioReading(mono, SAMPLE_RATE, { frameSize: FRAME_SIZE });
  const { ok, errors } = validateReading(reading);
  assert.equal(ok, true, `expected a valid Reading, got ${JSON.stringify(errors)}`);
  assert.equal(reading.units.length, Math.ceil(mono.length / FRAME_SIZE));
  assert.equal(reading.meta.modality, 'audio');
});

test('buildAudioReading: the signal/noise holon separation becomes coarse segments (no new detector)', () => {
  const mono = buildClip();
  const reading = buildAudioReading(mono, SAMPLE_RATE, { frameSize: FRAME_SIZE });
  const signalSegs = reading.segments.filter((s) => s.label === 'signal');
  assert.ok(signalSegs.length >= 2, `expected at least 2 signal stretches, got ${JSON.stringify(reading.segments)}`);
});

test('buildAudioReading: the SAME tone recurring after a different tone lands in the SAME cluster (a real, non-adjacent motif match)', () => {
  const mono = buildClip();
  const reading = buildAudioReading(mono, SAMPLE_RATE, { frameSize: FRAME_SIZE });

  // Frame ordinals: region 1 (300Hz) [0,10), region 3 (1200Hz) [25,35),
  // region 5 (300Hz again) [50,60).
  const sightingsByReferent = new Map();
  for (const s of reading.sightings) {
    if (!sightingsByReferent.has(s.referent)) sightingsByReferent.set(s.referent, []);
    sightingsByReferent.get(s.referent).push(s.ordinal);
  }
  // Some referent's FOREGROUND sightings must cover BOTH the first and the
  // last 300Hz region, not just one — that is the recurrence.
  let matched = false;
  for (const [, ordinals] of sightingsByReferent) {
    const early = ordinals.some((o) => o < 10);
    const late = ordinals.some((o) => o >= 50);
    if (early && late) { matched = true; break; }
  }
  assert.ok(matched, `expected one referent's sightings to span both 300Hz regions, got ${JSON.stringify([...sightingsByReferent.entries()])}`);
});

test('buildAudioReading: a distinctly different tone gets its OWN referent, not folded into the recurring one', () => {
  const mono = buildClip();
  const reading = buildAudioReading(mono, SAMPLE_RATE, { frameSize: FRAME_SIZE });
  assert.ok(reading.referents.length >= 2, `expected at least 2 distinct motifs, got ${JSON.stringify(reading.referents)}`);
});

test('buildWaveform over a real audio Reading: runs end to end without throwing', () => {
  const mono = buildClip();
  const reading = buildAudioReading(mono, SAMPLE_RATE, { frameSize: FRAME_SIZE });
  const model = buildWaveform(reading);
  assert.equal(model.strain.length, reading.units.length);
  assert.ok(Array.isArray(model.cast));
});

test('buildAudioReading: an empty clip does not throw, produces an empty (but valid) Reading', () => {
  const reading = buildAudioReading(new Float64Array(0), SAMPLE_RATE, { frameSize: FRAME_SIZE });
  const { ok, errors } = validateReading(reading);
  assert.equal(ok, true, JSON.stringify(errors));
  assert.equal(reading.units.length, 0);
});
