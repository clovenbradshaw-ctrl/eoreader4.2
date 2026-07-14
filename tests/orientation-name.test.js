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

test('a source orients by its MEDIUM — a transcribed recording reads "audio", not "text"', () => {
  // organs/in/audio.js keeps modality 'audio' after transcription (its words are laid into
  // sentences, but it is still a recording). Labelling it "text" left the talker unable to
  // connect "this audio file" to what it was reading — the wild answer was "I couldn't find
  // any information about the audio file itself". The medium is the source's own type; it says
  // nothing a reader didn't see setting the file down, so the recognition guard (§3) holds.
  assert.equal(orientationOf({ docId: '17-530.mp3', modality: 'audio', sentences: new Array(568) }),
    '17-530.mp3 · audio · 568 sentences');
  assert.equal(orientationOf({ docId: 'clip.mp4', modality: 'video', sentences: new Array(40) }),
    'clip.mp4 · video · 40 sentences');
  assert.equal(orientationOf({ docId: 'scan.png', modality: 'image', sentences: new Array(3) }),
    'scan.png · image · 3 sentences');
  // everything textual stays 'text', byte-identical to before (webpage included).
  assert.equal(orientationOf({ docId: 'web-abc', modality: 'webpage', sentences: new Array(3) }),
    'web-abc · text · 3 sentences');
});
