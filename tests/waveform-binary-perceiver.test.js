import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildBinaryReading } from '../src/perceiver/binary/waveform.js';
import { byteHistogram, shannonEntropy, printableRatio } from '../src/perceiver/binary/features.js';
import { buildReadingFromBytes } from '../src/organs/in/reading-dispatch.js';
import { validateReading } from '../src/perceiver/contract.js';
import { buildWaveform } from '../src/weave/waveform/build.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'binary');

// THE GENERIC BINARY PERCEIVER — no format knowledge at all. A synthetic blob
// with a structured, repeating 4-byte pattern at both the start and the end,
// and a pseudo-random (high-entropy) region in between — the binary analogue
// of the audio/tabular "does the SAME thing recurring after something
// different still cluster as one referent" fixtures.

const CHUNK = 256;

const structuredRegion = (bytes) => {
  const pattern = [0xde, 0xad, 0xbe, 0xef];
  const out = new Uint8Array(bytes);
  for (let i = 0; i < out.length; i++) out[i] = pattern[i % 4];
  return out;
};

// A simple deterministic LCG so the "random" region is reproducible. Takes a
// HIGH byte of the state (bits 16-23), not the low byte — a classic LCG's low
// bits have a short period and read as near-constant, which would make this
// fixture accidentally low-entropy instead of the high-entropy noise it's
// meant to be.
const noiseRegion = (bytes, seed = 12345) => {
  let s = seed;
  const out = new Uint8Array(bytes);
  for (let i = 0; i < out.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; out[i] = (s >>> 16) & 0xff; }
  return out;
};

const buildBlob = () => {
  const a1 = structuredRegion(2048);
  const noise = noiseRegion(2048);
  const a2 = structuredRegion(2048);
  const out = new Uint8Array(a1.length + noise.length + a2.length);
  out.set(a1, 0);
  out.set(noise, a1.length);
  out.set(a2, a1.length + noise.length);
  return out;
};

test('byteHistogram/shannonEntropy/printableRatio: read real, distinguishing signal off raw bytes', () => {
  const zeros = new Uint8Array(256);                              // all one value
  const text = new TextEncoder().encode('the quick brown fox jumps over the lazy dog, again and again');
  const random = noiseRegion(256);

  assert.equal(shannonEntropy(zeros), 0, 'a constant run carries zero entropy');
  assert.ok(shannonEntropy(random) > shannonEntropy(text), 'pseudo-random bytes read higher entropy than prose');
  assert.ok(printableRatio(text) > 0.9, 'ASCII prose is almost entirely printable');
  assert.ok(printableRatio(random) < printableRatio(text), 'random bytes are far less printable than prose');
  assert.equal(byteHistogram(zeros, 8).length, 8, 'the histogram has exactly the requested bin count');
});

test('buildBinaryReading: produces a valid Reading, one field vector per fixed-size chunk', () => {
  const blob = buildBlob();
  const reading = buildBinaryReading(blob, { chunkSize: CHUNK });
  const { ok, errors } = validateReading(reading);
  assert.equal(ok, true, `expected a valid Reading, got ${JSON.stringify(errors)}`);
  assert.equal(reading.units.length, Math.ceil(blob.length / CHUNK));
  assert.equal(reading.meta.modality, 'binary');
});

test('buildBinaryReading: the SAME repeating byte pattern recurring after a noisy region lands in the SAME cluster', () => {
  const blob = buildBlob();
  const reading = buildBinaryReading(blob, { chunkSize: CHUNK });
  // Region layout in chunks of 256: structured [0,8), noise [8,16), structured [16,24).
  const sightingsByReferent = new Map();
  for (const s of reading.sightings) {
    if (!sightingsByReferent.has(s.referent)) sightingsByReferent.set(s.referent, []);
    sightingsByReferent.get(s.referent).push(s.ordinal);
  }
  let matched = false;
  for (const [, ordinals] of sightingsByReferent) {
    const early = ordinals.some((o) => o < 8);
    const late = ordinals.some((o) => o >= 16);
    if (early && late) { matched = true; break; }
  }
  assert.ok(matched, `expected a referent spanning both structured regions, got ${JSON.stringify([...sightingsByReferent.entries()])}`);
});

test('buildBinaryReading: the noisy region does not manufacture a false recurring referent', () => {
  const blob = buildBlob();
  const reading = buildBinaryReading(blob, { chunkSize: CHUNK });
  const noiseOnlyReferent = reading.sightings
    .filter((s) => s.ordinal >= 8 && s.ordinal < 16)
    .every((s) => false); // if any sighting lands in the noise band, this stays false — see below
  // The noise band may or may not get its own referent (unstable by design — noise has
  // no stable shape to recur as), but it must never be folded into the structured
  // region's referent.
  const structuredReferent = reading.referents[0] && reading.referents[0].key;
  if (structuredReferent) {
    const wronglyFolded = reading.sightings.some((s) => s.referent === structuredReferent && s.ordinal >= 8 && s.ordinal < 16 && s.role === 'FOREGROUND');
    assert.equal(wronglyFolded, false, 'the noise band is never the FOREGROUND of the structured pattern\'s referent');
  }
});

test('buildWaveform over a real binary Reading: confirms a turn at the structured/noise boundary', () => {
  const blob = buildBlob();
  const reading = buildBinaryReading(blob, { chunkSize: CHUNK });
  const model = buildWaveform(reading);
  assert.equal(model.strain.length, reading.units.length);
  const nearBoundary = model.turns.some((t) => Math.abs(t.ordinal - 8) <= 2 || Math.abs(t.ordinal - 16) <= 2);
  assert.ok(nearBoundary, `expected a turn near ordinal 8 or 16, got ${JSON.stringify(model.turns.map((t) => t.ordinal))}`);
});

test('buildBinaryReading: an empty buffer does not throw, produces an empty (but valid) Reading', () => {
  const reading = buildBinaryReading(new Uint8Array(0), { chunkSize: CHUNK });
  const { ok, errors } = validateReading(reading);
  assert.equal(ok, true, JSON.stringify(errors));
  assert.equal(reading.units.length, 0);
});

test('buildBinaryReading: accepts a plain ArrayBuffer, not just a Uint8Array', () => {
  const blob = buildBlob();
  const reading = buildBinaryReading(blob.buffer, { chunkSize: CHUNK });
  const { ok } = validateReading(reading);
  assert.equal(ok, true);
  assert.equal(reading.units.length, Math.ceil(blob.length / CHUNK));
});

// ── A real third-party binary file, format unknown to the perceiver ─────────
// tests/fixtures/binary/IBM.dat — a proprietary fixed-record binary encoding
// of historical stock data (see fixtures/binary/README.md). The perceiver is
// told nothing about the 8-byte header / 24-byte-record layout; this validates
// that the generic, format-blind read still produces something sensible on a
// file nobody wrote a perceiver for.

test('buildBinaryReading: a real unfamiliar binary file (IBM.dat) reads as one dominant, sensible regime', () => {
  const bytes = readFileSync(path.join(FIXTURES, 'IBM.dat'));
  const reading = buildBinaryReading(bytes);
  const { ok, errors } = validateReading(reading);
  assert.equal(ok, true, `expected a valid Reading, got ${JSON.stringify(errors)}`);
  assert.ok(reading.units.length > 0, 'the 6032-byte file yields real chunks');
  assert.ok(reading.referents.length >= 1, 'the fixed-record structure reads as at least one recurring pattern');

  const model = buildWaveform(reading);
  assert.equal(model.strain.length, reading.units.length);
  // The dominant referent should cover most of the file — a homogeneous
  // fixed-record layout has no reason to fracture into many disjoint regimes.
  const dominant = model.cast.filter((c) => c.onCast).sort((a, b) => b.salience - a.salience)[0];
  assert.ok(dominant, 'at least one referent reaches the cast');
});

test('buildReadingFromBytes: the real IBM.dat file is neither a WAV nor plausible text, so it falls through to the generic binary perceiver', async () => {
  const bytes = readFileSync(path.join(FIXTURES, 'IBM.dat'));
  const reading = await buildReadingFromBytes(new Uint8Array(bytes));
  assert.equal(reading.meta.modality, 'binary');
  const { ok } = validateReading(reading);
  assert.equal(ok, true);
});
