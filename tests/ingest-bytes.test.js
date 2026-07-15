import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ingestBytes, toBytes, periodOf } from '../src/organs/ingest/bytes.js';

// INGEST ANYTHING — EVEN THE BINARY. The same scale-free induction the reader uses on words
// reads structure straight from bytes: value-classes by company, the record period by
// self-similarity — no charset, no format, no language.

test('toBytes coerces bytes, buffers, arrays, and strings', () => {
  assert.equal(toBytes('AB').length, 2);
  assert.deepEqual([...toBytes([1, 2, 3])], [1, 2, 3]);
  assert.equal(toBytes(new Uint8Array([9])).length, 1);
  assert.equal(toBytes(new ArrayBuffer(4)).length, 4);
});

test('a fixed-width binary record structure surfaces as a period', () => {
  // records: [0x01, data, ',', NUL] × 300 — a packed table with a marker, a field, delimiters.
  const rec = [];
  for (let i = 0; i < 300; i++) rec.push(0x01, i % 13, 0x2c, 0x00);
  const r = ingestBytes(rec);
  assert.equal(r.period.lag, 4, 'the record width falls out of the byte stream');
  assert.ok(r.period.score > r.period.baseline + 0.15, 'and it is a real peak, not chance');
  assert.equal(r.textLike, false, 'a packed binary is not mistaken for text');
});

test('byte-classes emerge — a letter class forms out of a text stream, with no charset', () => {
  const txt = ('The quick brown fox jumps over the lazy dog while a gentle rain fell softly on the '
    + 'wide green meadow beyond the river where herons waded through the shallows at dusk. ').repeat(20);
  const r = ingestBytes(txt);
  assert.equal(r.textLike, true, 'a printable stream reads as text-like (then hand to the language reader)');
  const isLower = (v) => v >= 97 && v <= 122;
  const letterClass = r.byteClasses.find((c) => c.values.filter(isLower).length >= 6);
  assert.ok(letterClass, `a class of lowercase letters emerged from the bytes: ${r.byteClasses.map((c) => c.gloss).join(' | ')}`);
});

test('free-form prose shows no fixed record period', () => {
  const prose = 'Whatever structure a novel carries is never a fixed byte stride: its sentences vary in '
    + 'length and rhythm, its paragraphs breathe unevenly, and no lattice of repetition underlies the prose. '
    + 'A reader feels shape without measuring a period, because meaning is not a stamped record but a flow that '
    + 'bends to what came before and anticipates what follows, seldom landing twice on the same beat.';
  const r = ingestBytes(prose);
  assert.equal(r.period.lag, 0, 'no strong fixed period is claimed for free prose');
});

test('periodOf reports the self-similarity baseline so a real period is distinguishable from noise', () => {
  const rec = [];
  for (let i = 0; i < 200; i++) rec.push(0xAA, 0xBB, i % 7);
  const p = periodOf(Uint8Array.from(rec));
  assert.equal(p.lag, 3);
  assert.ok(p.score > p.baseline, 'the period beats chance');
});

test('describe() gives a one-line structural reading without assuming a format', () => {
  const rec = [];
  for (let i = 0; i < 200; i++) rec.push(0x7f, i % 5, 0x00, 0x00);
  const d = ingestBytes(rec).describe();
  assert.match(d, /byte-classes/);
  assert.match(d, /record period ≈ 4|binary/);
});
