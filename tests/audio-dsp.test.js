import { test } from 'node:test';
import assert from 'node:assert/strict';

import { encodeWav, applyRedactions, writeBeep, secToSample } from '../src/rooms/reader/audio-dsp.js';

// The WAV encoder and the redaction transform are the correctness-sensitive core of the Listen
// surface. Node has no AudioContext, so we drive the sample math directly and parse the emitted
// WAV bytes with a DataView — exactly what a browser/player does when it reads the file back.

const readAscii = (dv, off, len) => {
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(dv.getUint8(off + i));
  return s;
};

test('encodeWav writes a canonical 16-bit PCM mono header', () => {
  const samples = new Float32Array([0, 0.25, -0.25, 0.5]);
  const buf = encodeWav(samples, 16000);
  const dv = new DataView(buf);
  assert.equal(buf.byteLength, 44 + samples.length * 2);
  assert.equal(readAscii(dv, 0, 4), 'RIFF');
  assert.equal(dv.getUint32(4, true), 36 + samples.length * 2);
  assert.equal(readAscii(dv, 8, 4), 'WAVE');
  assert.equal(readAscii(dv, 12, 4), 'fmt ');
  assert.equal(dv.getUint32(16, true), 16);      // fmt chunk size
  assert.equal(dv.getUint16(20, true), 1);       // PCM
  assert.equal(dv.getUint16(22, true), 1);       // mono
  assert.equal(dv.getUint32(24, true), 16000);   // sample rate
  assert.equal(dv.getUint32(28, true), 16000 * 2); // byte rate
  assert.equal(dv.getUint16(32, true), 2);       // block align
  assert.equal(dv.getUint16(34, true), 16);      // bits per sample
  assert.equal(readAscii(dv, 36, 4), 'data');
  assert.equal(dv.getUint32(40, true), samples.length * 2);
});

test('encodeWav round-trips samples within 16-bit quantization', () => {
  const samples = new Float32Array([0, 0.5, -0.5, 1, -1, 0.123]);
  const dv = new DataView(encodeWav(samples, 16000));
  for (let i = 0; i < samples.length; i++) {
    const back = dv.getInt16(44 + i * 2, true) / (samples[i] < 0 ? 0x8000 : 0x7fff);
    assert.ok(Math.abs(back - samples[i]) < 1 / 32000, `sample ${i}: ${back} vs ${samples[i]}`);
  }
  // Clamps out-of-range without wrapping.
  const clamped = new DataView(encodeWav(new Float32Array([2, -2]), 8000));
  assert.equal(clamped.getInt16(44, true), 0x7fff);
  assert.equal(clamped.getInt16(46, true), -0x8000);
});

test('secToSample rounds and clamps to the buffer', () => {
  assert.equal(secToSample(1, 16000), 16000);
  assert.equal(secToSample(0.5, 16000), 8000);
  assert.equal(secToSample(-3, 16000, 1000), 0);      // clamp low
  assert.equal(secToSample(999, 16000, 1000), 1000);  // clamp to len
});

test('applyRedactions silences a span and leaves the rest untouched, non-destructively', () => {
  const sr = 1000;
  const samples = new Float32Array(sr).fill(0.5);   // 1 second of steady tone (0.5 is exact in float32)
  const out = applyRedactions(samples, sr, [{ start: 0.25, end: 0.5, mode: 'silence' }]);
  // Input buffer is not mutated (the original waveform is the truth, kept intact).
  assert.equal(samples[300], 0.5);
  // Inside [250, 500) is zeroed; outside is preserved.
  assert.equal(out[249], 0.5);
  assert.equal(out[250], 0);
  assert.equal(out[499], 0);
  assert.equal(out[500], 0.5);
});

test('applyRedactions beep fills a span with a bounded, faded, ~DC-free tone', () => {
  const sr = 16000;
  const samples = new Float32Array(sr).fill(0);   // 1 s of silence
  const out = applyRedactions(samples, sr, [{ start: 0.2, end: 0.8, mode: 'beep' }], { beep: { amp: 0.06 } });
  const i0 = 3200, i1 = 12800;
  let energy = 0, dc = 0, peak = 0;
  for (let i = i0; i < i1; i++) { energy += out[i] * out[i]; dc += out[i]; peak = Math.max(peak, Math.abs(out[i])); }
  assert.ok(energy > 0, 'beep has energy in the span');
  assert.ok(peak <= 0.06 + 1e-6, 'beep stays within amplitude');
  assert.ok(Math.abs(dc / (i1 - i0)) < 0.01, 'beep is ~DC-free (a symmetric tone)');
  // Edges are faded: the first sample is quieter than a sample in the middle.
  assert.ok(Math.abs(out[i0]) < Math.abs(out[Math.floor((i0 + i1) / 2)]));
  // Outside the span stays silent.
  assert.equal(out[i0 - 1], 0);
  assert.equal(out[i1 + 1], 0);
});

test('writeBeep ramps in and out (no click at the edges)', () => {
  const sr = 16000;
  const out = new Float32Array(sr);
  writeBeep(out, 0, sr, sr, { freq: 660, amp: 0.06, fadeMs: 8 });
  assert.equal(out[0], 0);                         // starts at zero
  assert.ok(Math.abs(out[sr - 1]) < 0.02);         // ends near zero (faded out)
  // Full amplitude in the middle — measured over a window, since any single sample can land on a
  // sine zero-crossing.
  let mid = 0;
  for (let i = sr / 2 - 50; i < sr / 2 + 50; i++) mid = Math.max(mid, Math.abs(out[i]));
  assert.ok(mid > 0.05, `mid amplitude ${mid}`);
});
