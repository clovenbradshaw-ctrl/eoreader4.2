// The orientation line the talker is handed is recognition-free (§3) — filename · type ·
// length — but for WEB content the docId is an opaque content-hash, and a COMPOSITE's docId
// is those hashes joined with " + ". Handed straight through they are noise the model tries to
// parse (the "29 sources" reading in the wild came in as a wall of `web-<hash>` ids). These
// pin the readable stand-in: a host for a lone page, a count for a composite, never the hashes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { admitWebSource } from '../src/organs/ingest/websource.js';
import { createCompositeDoc } from '../src/organs/in/composite.js';
import { orientationOf } from '../src/turn/stages.js';

const mkWeb = (url, title, text) => admitWebSource({ url, title, text }).doc;

test('a lone web page orients by host, never its content-hash docId or its title', () => {
  const doc = mkWeb('https://en.wikipedia.org/wiki/Elvis_(2022_film)', 'Elvis (2022 film)',
    'Elvis is a 2022 film. Baz Luhrmann directed it. It received eight nominations.');
  const line = orientationOf(doc);
  assert.equal(line, 'en.wikipedia.org · text · 3 sentences');
  assert.ok(!/^web-/.test(line) && !line.includes('web-'), 'the opaque content-hash never reaches the talker');
  assert.ok(!line.includes('Elvis (2022 film)'), 'the page title is kept out of the content prompt (§3)');
});

test('a composite orients by a source COUNT, never the joined wall of content-hash docIds', () => {
  const a = mkWeb('https://en.wikipedia.org/wiki/A', 'A', 'Alpha one. Alpha two.');
  const b = mkWeb('https://www.npr.org/b', 'B', 'Bravo one. Bravo two.');
  const c = mkWeb('https://example.org/c', 'C', 'Charlie one. Charlie two.');
  const comp = createCompositeDoc([a, b, c]);
  const line = orientationOf(comp);
  assert.equal(line, '3 sources · text · 6 sentences');
  assert.ok(!line.includes(' + ') && !line.includes('web-'),
    'the joined content-hash docId never reaches the talker');
});

test('an uploaded file keeps its filename unchanged', () => {
  const doc = { docId: 'river-survey.txt', modality: 'text', sentences: new Array(120) };
  assert.equal(orientationOf(doc), 'river-survey.txt · text · 120 sentences');
});
