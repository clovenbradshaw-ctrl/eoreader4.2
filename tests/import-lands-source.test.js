import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';

// The moment a file is imported the reader must SHOW it in the sources — the way an audio import
// lands from its acoustic reading before a word is transcribed. A prose import (a .txt here) used
// to parse its whole entity/relation reading FIRST and only then record the source, so a large
// document left the sources empty until the sweep finished. Now the source lands AT ONCE from its
// text and the reading folds in afterward (app.js ingestFile → addSource `defer` → finishReading).
//
// The plain-text branch of importAnyFile needs no browser and no CDN, so the whole import path runs
// here under node — the same seam the browser drives.

const enc = new TextEncoder();
class FakeFile {
  constructor(text, name, type) {
    this._bytes = enc.encode(text);
    this.name = name; this.type = type; this.size = this._bytes.length;
  }
  async text() { return new TextDecoder().decode(this._bytes); }
  async arrayBuffer() { return this._bytes.buffer.slice(0); }
}

const BOOK =
  'Gregor Samsa was a travelling salesman. Gregor woke to find himself changed into an insect. ' +
  'His body was hard and armored. Grete was his sister. Grete brought him food each morning. ' +
  'The chief clerk arrived and demanded an explanation. His father drove Gregor back with a cane.';

const freshApp = async () => {
  const app = createReaderApp({ audit: { turns: [] } });
  if (!app.state.ready) {
    await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  }
  return app;
};

// Snapshot the topic's sources on every 'sources' emit, so we can see WHEN the source first showed.
const watchSources = (app) => {
  const snaps = [];
  app.subscribe((k) => {
    if (k === 'sources') snaps.push(app.topicSources().map((s) => ({ sn: s.sn, title: s.title, kind: s.kind, ent: s.entCount, text: s.text })));
  });
  return snaps;
};

test('a prose file lands in the sources IMMEDIATELY, then its reading folds in', async () => {
  const app = await freshApp();
  const snaps = watchSources(app);

  const src = await app.ingestFile(new FakeFile(BOOK, 'notes.txt', 'text/plain'));
  assert.ok(src && src.sn, 'the import resolved with a recorded source');

  // The FIRST sources emit that carries the new source landed it BEFORE the reading: its entity
  // count is still null, which is exactly what the register renders as "…" (a reading in flight).
  const firstWithSrc = snaps.find((snap) => snap.some((s) => s.sn === src.sn));
  assert.ok(firstWithSrc, 'the source appeared in a sources emit');
  const landed = firstWithSrc.find((s) => s.sn === src.sn);
  assert.equal(landed.title, 'notes', 'titled from the file name');
  assert.equal(landed.ent, null, 'it landed AHEAD of its reading — entity count still null (register shows "…")');

  // By the time the import resolves, finishReading has folded the entity/relation doc in.
  const now = app.sourceBySn(src.sn);
  assert.ok(now._doc, 'the reading was folded in (finishReading ran)');
  assert.ok(typeof now.entCount === 'number' && now.entCount > 0, 'the entity count is now a real number');
  assert.ok((now.text || '').includes('Gregor Samsa'), 'the full text is on the record and readable');

  // A later emit reflects the populated count — the register transitions "…" → the real number.
  const lastForSrc = [...snaps].reverse().find((snap) => snap.some((s) => s.sn === src.sn));
  const finalRow = lastForSrc.find((s) => s.sn === src.sn);
  assert.ok(typeof finalRow.ent === 'number' && finalRow.ent > 0, 'a later sources emit shows the entity count');
});

test('a markdown file lands with kind:markdown, read verbatim, and its reading folds in', async () => {
  const app = await freshApp();
  const md = '# Gregor Samsa\n\nGregor woke to find himself changed into an insect. Grete brought him food.';
  const src = await app.ingestFile(new FakeFile(md, 'notes.md', 'text/markdown'));
  assert.ok(src && src.sn);
  assert.equal(src.kind, 'markdown');
  assert.equal(src.text, md, 'the raw markdown, not a reflowed/stripped version');
  const now = app.sourceBySn(src.sn);
  await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'sources' && now._doc) { un(); res(); } }); if (now._doc) res(); });
  assert.ok(app.sourceBySn(src.sn)._doc, 'the reading folded in the same way a plain-text import does');
});

test('a code file lands with kind:code and its language, read verbatim', async () => {
  const app = await freshApp();
  // addSource trims the body (registry.js), same as every other import — so the source's own
  // leading/trailing whitespace, not this test, decides the exact stored string.
  const code = 'def add(a, b):\n    return a + b';
  const src = await app.ingestFile(new FakeFile(code, 'add.py', 'text/x-python'));
  assert.ok(src && src.sn);
  assert.equal(src.kind, 'code');
  assert.equal(src.language, 'python');
  assert.equal(src.text, code);
});

test('a structured file (json) still lands with its reading in one step', async () => {
  const app = await freshApp();
  const snaps = watchSources(app);

  const json = JSON.stringify({ people: [{ name: 'Ada Lovelace' }, { name: 'Alan Turing' }], place: 'London' });
  const src = await app.ingestFile(new FakeFile(json, 'data.json', 'application/json'));
  assert.ok(src && src.sn, 'the json import resolved with a source');

  // The organ already produced the reading (a JSON tree's leaves ARE its propositions), so a
  // structured source lands WITH its doc — no deferred read, entity count numeric from the start.
  const firstWithSrc = snaps.find((snap) => snap.some((s) => s.sn === src.sn));
  const landed = firstWithSrc.find((s) => s.sn === src.sn);
  assert.equal(landed.kind, 'json', 'recorded under its structured modality');
  assert.ok(typeof landed.ent === 'number', 'landed fully-read (entity count already numeric)');
});

// "The first experience of uploading anything should be seeing it in its native form" — an image
// must land in the sources the instant its file facts are known, the same promise a prose/audio
// import already keeps, BEFORE the (browser-only) eyes/scene reading ever gets a chance to run.
test('an image lands as a source immediately, on its file-facts text, before any reading of it', async () => {
  const app = await freshApp();
  const snaps = watchSources(app);

  const src = await app.ingestFile(new FakeFile('not really pixels, just bytes', 'my-photo.png', 'image/png'));
  assert.ok(src && src.sn, 'the import resolved with a recorded source');
  assert.equal(src.kind, 'image', 'kind stays "image" regardless of what a later OCR/scene read turns out to be');

  const firstWithSrc = snaps.find((snap) => snap.some((s) => s.sn === src.sn));
  assert.ok(firstWithSrc, 'the source appeared in a sources emit');
  const landed = firstWithSrc.find((s) => s.sn === src.sn);
  assert.equal(landed.title, 'my-photo', 'titled from the file name');
  assert.ok((landed.text || '').includes('my-photo'), 'lands on the file-facts placeholder, not blank, not stalled on the eyes/scene');

  // No browser in this test harness, so the deferred eyes/scene read can only fail — but that must
  // never unwind the already-landed picture: the source and its placeholder text still stand.
  const now = app.sourceBySn(src.sn);
  assert.ok(now.imageRead && ['error', 'done', 'skipped'].includes(now.imageRead.state), 'the background read reached a terminal state');
  assert.ok((now.text || '').includes('my-photo'), 'the source is never unwound by a failed/absent read');
});
