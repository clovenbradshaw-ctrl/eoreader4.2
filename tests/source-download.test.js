import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';

// Any source must be downloadable — in its ORIGINAL form (the bytes/text as ingested) and in the
// various edited/read/interpreted forms as JSON or JSONL (source-export.js). PDF/audio/video keep
// their real original bytes off in OPFS (paper.js/audio.js); every other kind's admitted text IS
// its original, since EO records edits as append-only log events rather than rewriting it in place.

const BOOK = 'Gregor Samsa was a travelling salesman. Gregor woke to find himself changed into an insect.';

const freshApp = async () => {
  const app = createReaderApp({ audit: { turns: [] } });
  if (!app.state.ready) {
    await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  }
  return app;
};
const settle = () => new Promise((res) => setTimeout(res, 0));

test('sourceOriginalExport: a plain-text source downloads its admitted text as the original', async () => {
  const app = await freshApp();
  const src = app.ingestText(BOOK, 'Metamorphosis');
  await settle();

  const out = await app.sourceOriginalExport(src.sn);
  assert.equal(out.ext, 'txt');
  assert.equal(out.mime, 'text/plain');
  assert.equal(out.text, src.text);
  assert.match(out.filename, /Metamorphosis.*\.original\.txt$/);
});

test('sourceOriginalExport: an unknown source returns null, never throws', async () => {
  const app = await freshApp();
  assert.equal(await app.sourceOriginalExport('no-such-sn'), null);
});

test('sourceExport: jsonl is the default, json is the full current snapshot', async () => {
  const app = await freshApp();
  const src = app.ingestText(BOOK, 'Metamorphosis');
  await settle();

  const jsonl = app.sourceExport(src.sn);
  assert.equal(jsonl.ext, 'jsonl');
  const lines = jsonl.text.trim().split('\n').map(JSON.parse);
  assert.equal(lines[0].type, 'source');
  assert.equal(lines[0].source.sn, src.sn);

  const snapshot = app.sourceExport(src.sn, { format: 'json' });
  assert.equal(snapshot.ext, 'json');
  const body = JSON.parse(snapshot.text);
  assert.equal(body.type, 'source-snapshot');
  assert.ok(body.document.sentences.length > 0);
});

test('sourceCursorJson still folds a point-in-time projection when a cursor is given', async () => {
  const app = await freshApp();
  const src = app.ingestText(BOOK, 'Metamorphosis');
  await settle();

  const out = app.sourceCursorJson(src.sn, { quote: 'Gregor woke' });
  const body = JSON.parse(out.text);
  assert.equal(body.type, 'source-cursor');
  assert.match(body.projection.text, /travelling salesman/);
});
