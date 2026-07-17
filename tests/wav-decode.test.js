import { test } from 'node:test';
import assert from 'node:assert/strict';

import { decodeWav } from '../src/perceiver/audio/wav.js';

// A minimal WAV encoder, test-side only — builds a RIFF/WAVE byte buffer by
// hand so decodeWav can be checked against known samples without depending on
// a real audio file fixture.
const encodeWav = (samples, { sampleRate = 8000, bitDepth = 16, channels = 1 } = {}) => {
  const bytesPerSample = bitDepth / 8;
  const dataSize = samples.length * bytesPerSample * channels;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const writeAscii = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);              // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample * channels, true);
  view.setUint16(32, bytesPerSample * channels, true);
  view.setUint16(34, bitDepth, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    const off = 44 + i * bytesPerSample * channels;
    if (bitDepth === 16) view.setInt16(off, Math.round(v * (v < 0 ? 32768 : 32767)), true);
    else if (bitDepth === 8) view.setUint8(off, Math.round((v + 1) * 127.5));
    else throw new Error('test encoder: unsupported bit depth');
  }
  return buf;
};

test('decodeWav: round-trips 16-bit PCM samples exactly (within quantisation)', () => {
  const samples = [0, 0.5, -0.5, 1, -1, 0.25, -0.75];
  const buf = encodeWav(samples, { sampleRate: 8000 });
  const { sampleRate, channels, bitDepth, mono } = decodeWav(buf);
  assert.equal(sampleRate, 8000);
  assert.equal(channels, 1);
  assert.equal(bitDepth, 16);
  assert.equal(mono.length, samples.length);
  for (let i = 0; i < samples.length; i++) {
    assert.ok(Math.abs(mono[i] - samples[i]) < 0.001, `sample ${i}: expected ~${samples[i]}, got ${mono[i]}`);
  }
});

test('decodeWav: round-trips 8-bit PCM samples (coarser quantisation)', () => {
  const samples = [0, 0.5, -0.5, 1, -1];
  const buf = encodeWav(samples, { sampleRate: 11025, bitDepth: 8 });
  const { sampleRate, bitDepth, mono } = decodeWav(buf);
  assert.equal(sampleRate, 11025);
  assert.equal(bitDepth, 8);
  for (let i = 0; i < samples.length; i++) {
    assert.ok(Math.abs(mono[i] - samples[i]) < 0.02, `sample ${i}: expected ~${samples[i]}, got ${mono[i]}`);
  }
});

test('decodeWav: downmixes stereo to mono by averaging channels', () => {
  const bytesPerSample = 2, channels = 2, sampleRate = 8000;
  const frames = [[1, -1], [0.5, 0.5], [-0.5, -0.5]];
  const dataSize = frames.length * bytesPerSample * channels;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const writeAscii = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeAscii(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, channels, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample * channels, true);
  view.setUint16(32, bytesPerSample * channels, true); view.setUint16(34, 16, true);
  writeAscii(36, 'data'); view.setUint32(40, dataSize, true);
  frames.forEach((frame, f) => {
    frame.forEach((v, c) => {
      const off = 44 + (f * channels + c) * bytesPerSample;
      view.setInt16(off, Math.round(v * (v < 0 ? 32768 : 32767)), true);
    });
  });
  const { channels: gotChannels, mono } = decodeWav(buf);
  assert.equal(gotChannels, 2);
  assert.equal(mono.length, 3);
  assert.ok(Math.abs(mono[0] - 0) < 0.001, 'channel average of [1,-1] is ~0');
  assert.ok(Math.abs(mono[1] - 0.5) < 0.001, 'channel average of [0.5,0.5] is 0.5');
});

test('decodeWav: rejects a non-RIFF buffer', () => {
  const buf = new ArrayBuffer(16);
  assert.throws(() => decodeWav(buf), /not a RIFF\/WAVE file/);
});

test('decodeWav: rejects a RIFF/WAVE buffer with no data chunk', () => {
  const buf = new ArrayBuffer(36);
  const view = new DataView(buf);
  const writeAscii = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeAscii(0, 'RIFF'); view.setUint32(4, 28, true); writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, 8000, true);
  assert.throws(() => decodeWav(buf), /missing fmt or data chunk/);
});
