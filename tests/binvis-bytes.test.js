import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bytesOfSource } from '../src/rooms/reader/binvis-surface.js';

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
