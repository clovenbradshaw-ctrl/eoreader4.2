import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bytesOfSource, readingSignificance } from '../src/rooms/reader/binvis-surface.js';

// bytesOfSource — the seam that gets ANY loaded source's bytes for the byte-structure
// surface. The regression this guards: an empty/evicted media clip must NOT masquerade as a
// loaded (but blank) file and shadow the transcript/text fallback. See the panel that shows
// "0 B" over an audio source that in fact carries a full transcript.

const enc = (s) => new TextEncoder().encode(s);

// A tiny fake `app` — sourceOriginalExport + sourceBySn, exactly what bytesOfSource reaches.
const fakeApp = (source, origResult) => ({
  sourceBySn: () => source,
  sourceOriginalExport: async () => origResult,
});

test('bytesOfSource: real original bytes are used as-is', async () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const r = await bytesOfSource(fakeApp({ kind: 'pdf', pdfRef: {} }, { bytes }), 1);
  assert.equal(r.total, 4);
  assert.equal(r.kind, 'original');
  assert.deepEqual([...r.bytes], [1, 2, 3, 4]);
});

test('bytesOfSource: an EMPTY original byte array falls back to the source text (the bug)', async () => {
  // audioBytes returned a zero-length array (evicted / partial OPFS write). The old code
  // took it as "loaded" and rendered 0 B; the transcript must win instead.
  const source = { kind: 'audio', audioRef: {}, text: 'the sense is quiet' };
  const r = await bytesOfSource(fakeApp(source, { bytes: new Uint8Array(0) }), 1);
  assert.equal(r.kind, 'text');
  assert.equal(r.total, enc('the sense is quiet').length);
  assert.ok(r.media, 'still flagged as media');
});

test('bytesOfSource: audio with no persisted bytes uses its transcript text', async () => {
  const source = { kind: 'audio', audioRef: {}, text: 'hello world' };
  // sourceOriginalExport, with no bytes, returns { text } — the transcript.
  const r = await bytesOfSource(fakeApp(source, { text: 'hello world' }), 1);
  assert.equal(r.kind, 'text');
  assert.equal(r.total, enc('hello world').length);
});

test('bytesOfSource: a truly empty media source reports total 0 AND media:true', async () => {
  const source = { kind: 'audio', audioRef: {}, text: '' };
  const r = await bytesOfSource(fakeApp(source, { text: '' }), 1);
  assert.equal(r.total, 0);
  assert.equal(r.kind, 'none');
  assert.equal(r.media, true, 'so the panel can say the clip is gone, not that the file is empty');
});

test('bytesOfSource: a thrown sourceOriginalExport still recovers the source text', async () => {
  const source = { kind: 'audio', audioRef: {}, text: 'recovered' };
  const app = {
    sourceBySn: () => source,
    sourceOriginalExport: async () => { throw new Error('OPFS blew up'); },
  };
  const r = await bytesOfSource(app, 1);
  assert.equal(r.kind, 'text');
  assert.equal(r.total, enc('recovered').length);
});

test('bytesOfSource: a live session blob is fetched when persisted bytes are gone', async () => {
  const clip = new Uint8Array([9, 8, 7, 6, 5]);
  const source = { kind: 'audio', _media: { url: 'blob:fake-clip' }, text: '' };
  const app = {
    sourceBySn: () => source,
    sourceOriginalExport: async () => ({ text: '' }),   // nothing persisted
  };
  const prevFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ arrayBuffer: async () => clip.buffer });
  try {
    const r = await bytesOfSource(app, 1);
    assert.equal(r.kind, 'original');
    assert.deepEqual([...r.bytes], [9, 8, 7, 6, 5]);
  } finally {
    if (prevFetch) globalThis.fetch = prevFetch; else delete globalThis.fetch;
  }
});

test('bytesOfSource: plain text source (no media flag)', async () => {
  const source = { kind: 'text', text: 'AB' };
  const r = await bytesOfSource(fakeApp(source, { text: 'AB' }), 1);
  assert.equal(r.kind, 'text');
  assert.equal(r.media, false);
  assert.deepEqual([...r.bytes], [0x41, 0x42]);
});

// ---- readingSignificance — the meaning-keyed layer's per-byte signal --------
// The one binvis layer keyed to the reading (not the raw bytes): it visualises the reading's
// OWN text bytes (its units, in order) and weights each by how much the reading turned there.

const eotApp = (eot) => ({ eotFor: () => eot });

test('readingSignificance: null when there is no reading with unit text', () => {
  assert.equal(readingSignificance(eotApp(null), 1), null);
  assert.equal(readingSignificance(eotApp({ unitText: [] }), 1), null);
  assert.equal(readingSignificance({}, 1), null);   // no eotFor at all
});

test('readingSignificance: bytes ARE the units joined, aligned to a same-length signal', () => {
  const eot = { unitText: ['AB', 'CD', 'EF'], turns: [{ idx: 1, bayesBits: 4 }] };
  const r = readingSignificance(eotApp(eot), 1);
  assert.ok(r, 'a reading with units yields a signal');
  // units joined by '\n': "AB\nCD\nEF" — 8 bytes
  assert.deepEqual([...r.bytes], [...new TextEncoder().encode('AB\nCD\nEF')]);
  assert.equal(r.signal.length, r.bytes.length, 'signal is aligned byte-for-byte with bytes');
  assert.equal(r.units, 3);
  assert.equal(r.turns, 1);
});

test('readingSignificance: the turned unit carries the peak; a flat unit stays at zero', () => {
  // three well-separated units so the triangular spread (U/160 → 1) does not bleed the turn across all
  const eot = { unitText: ['unit zero', 'unit one', 'unit two'], turns: [{ idx: 0, bayesBits: 10 }] };
  const r = readingSignificance(eotApp(eot), 1);
  // byte 0 is inside unit 0 (the turn) → normalised to the peak = 1
  assert.equal(r.signal[0], 1);
  // the last unit is far from the turn → flat (0)
  assert.equal(r.signal[r.signal.length - 1], 0);
});

test('readingSignificance: a flat reading (no turns) yields an all-zero signal, still aligned', () => {
  const eot = { unitText: ['one', 'two'], turns: [] };
  const r = readingSignificance(eotApp(eot), 1);
  assert.ok(r);
  assert.equal(r.turns, 0);
  assert.equal(r.signal.length, r.bytes.length);
  assert.ok([...r.signal].every((v) => v === 0), 'no turning points → no significance anywhere');
});

test('readingSignificance: survives a thrown eotFor', () => {
  const app = { eotFor: () => { throw new Error('reading blew up'); } };
  assert.equal(readingSignificance(app, 1), null);
});
