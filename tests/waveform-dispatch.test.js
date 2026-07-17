import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildReadingFromBytes } from '../src/organs/in/reading-dispatch.js';
import { validateReading } from '../src/perceiver/contract.js';

// THE GENERALIZED ENTRY POINT — buildReadingFromBytes never fails and never
// needs to be told what it's looking at: a WAV file's own magic header routes
// to the audio perceiver, plausible UTF-8 prose routes to the text perceiver,
// and anything else — an unrecognized format, a corrupt file, deliberately
// opaque bytes — still comes back as a valid Reading via the generic binary
// perceiver. This is the "any form of binary input, generalized" surface.

const encodeWav = (samples, sampleRate = 8000) => {
  const dataSize = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const writeAscii = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeAscii(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  writeAscii(36, 'data'); view.setUint32(40, dataSize, true);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, Math.round(v * (v < 0 ? 32768 : 32767)), true);
  }
  return new Uint8Array(buf);
};

test('buildReadingFromBytes: a WAV file (RIFF/WAVE magic) routes to the audio perceiver', async () => {
  const samples = Array.from({ length: 4096 }, (_, i) => Math.sin(i * 0.3));
  const wavBytes = encodeWav(samples);
  const reading = await buildReadingFromBytes(wavBytes);
  assert.equal(reading.meta.modality, 'audio');
  const { ok, errors } = validateReading(reading);
  assert.equal(ok, true, JSON.stringify(errors));
});

test('buildReadingFromBytes: plausible UTF-8 prose routes to the text perceiver', async () => {
  const prose = 'Victor built a creature in his laboratory. The creature opened its eyes. '
    + 'Victor searched the forest. The creature fled into the trees.';
  const bytes = new TextEncoder().encode(prose);
  const reading = await buildReadingFromBytes(bytes);
  assert.equal(reading.meta.modality, 'text');
  const { ok } = validateReading(reading);
  assert.equal(ok, true);
});

test('buildReadingFromBytes: opaque/random bytes fall through to the generic binary perceiver', async () => {
  let s = 999;
  const bytes = new Uint8Array(4096);
  for (let i = 0; i < bytes.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; bytes[i] = (s >>> 16) & 0xff; }
  const reading = await buildReadingFromBytes(bytes);
  assert.equal(reading.meta.modality, 'binary');
  const { ok } = validateReading(reading);
  assert.equal(ok, true);
});

test('buildReadingFromBytes: invalid UTF-8 (a truncated multi-byte sequence) does not get misread as text', async () => {
  const bytes = new Uint8Array([0xff, 0xfe, 0x00, 0x01, 0x02, 0xc0, 0xc1, 0x80, 0x80]);
  const reading = await buildReadingFromBytes(bytes);
  assert.equal(reading.meta.modality, 'binary');
});

test('buildReadingFromBytes: an empty input still comes back as a valid, empty Reading, never a throw', async () => {
  const reading = await buildReadingFromBytes(new Uint8Array(0));
  const { ok, errors } = validateReading(reading);
  assert.equal(ok, true, JSON.stringify(errors));
  assert.equal(reading.units.length, 0);
});

test('buildReadingFromBytes: options forward to the dispatched perceiver', async () => {
  let s = 1;
  const bytes = new Uint8Array(2048);
  for (let i = 0; i < bytes.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; bytes[i] = (s >>> 16) & 0xff; }
  const reading = await buildReadingFromBytes(bytes, { binary: { chunkSize: 128 } });
  assert.equal(reading.units.length, Math.ceil(bytes.length / 128));
});
