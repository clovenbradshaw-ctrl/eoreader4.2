import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';

// THE CO-READING WIRING (rooms/reader/app.js) — the deep-reading loop tethered to the human's
// position is wired into the reader session, not just the fold engine. The surface reports where
// the reader has settled (a sentence index in the open book); app.coReadAt(src, position) points
// the reader THERE, reflects in the margin of that place, and streams the note into
// state.reflections marked `positioned` so the surface can paint it in place. The idle governor is
// browser-only; coReadAt is the same governed pass, driven by the human instead of a timer.

const BOOK =
  'Gregor woke to find himself changed. His body was hard and armored. ' +
  'The family gathered at the door and would not enter. Grete brought him food but looked away. ' +
  'The chief clerk arrived and demanded an explanation. Gregor could not make himself understood. ' +
  'His father drove him back with a cane. The wound festered through the following weeks. ' +
  'Grete grew tired of the burden and turned cold. The family resolved that the creature must go. ' +
  'Gregor died quietly before dawn. The family felt only relief, and went walking in the sun.';

const freshApp = async () => {
  const app = createReaderApp({ audit: { turns: [] } });
  if (!app.state.ready) {
    await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  }
  return app;
};

test('coReadAt: reading a place drives a reflection in the margin of that place', async () => {
  const app = await freshApp();
  app.ingestText(BOOK, 'Metamorphosis');
  const src = app.topicSources()[0];
  assert.ok(src, 'the paste is recorded');

  assert.equal(app.reflections().length, 0, 'nothing reflected before the reader moves');
  const r = app.coReadAt(src, 3);                 // the reader settles on "Grete brought him food…"
  assert.ok(r, 'the reading caught on something where the reader is');
  assert.ok(Number.isInteger(r.peak), 'the margin-thought names the place it landed');
  assert.ok(typeof r.note === 'string' && r.note.length > 0, 'it carries an inner note');
  assert.equal(r.positioned, true, 'it is marked positioned — render it in the margin of that place');
  assert.equal(app.reflections().length, 1, 'it streamed into state.reflections');
});

test('the firewall: a co-read margin-thought is reafference — canWitness is false', async () => {
  const app = await freshApp();
  app.ingestText(BOOK, 'Metamorphosis');
  const src = app.topicSources()[0];
  const r = app.coReadAt(src, 6);
  assert.ok(r);
  assert.equal(r.canWitness, false, 'a margin-thought can never be witnessed as a fact');
  for (const x of app.reflections()) assert.equal(x.canWitness, false, 'every co-read reflection is firewalled');
});

test('co-reading emits a "reflections" change so the surface repaints the margin', async () => {
  const app = await freshApp();
  let sawReflections = false;
  app.subscribe((kind) => { if (kind === 'reflections') sawReflections = true; });
  app.ingestText(BOOK, 'Metamorphosis');
  const src = app.topicSources()[0];
  app.coReadAt(src, 3);
  assert.ok(sawReflections, 'a fresh margin-thought fans out to the surface');
});

test('a bad position or missing source is a safe no-op — never a throw', async () => {
  const app = await freshApp();
  app.ingestText(BOOK, 'Metamorphosis');
  const src = app.topicSources()[0];
  assert.doesNotThrow(() => app.coReadAt(null, 3));
  assert.equal(app.coReadAt(null, 3), null, 'no source → null');
  assert.equal(app.coReadAt(src, null), null, 'no position → null');
  assert.doesNotThrow(() => app.coReadAt(src, 99999), 'a past-the-end position clamps, never throws');
});

test('habituation is shared with at-rest deep reading — the same place is not re-read as the eye returns', async () => {
  const app = await freshApp();
  app.ingestText(BOOK, 'Metamorphosis');
  const src = app.topicSources()[0];
  const first = app.coReadAt(src, 4);
  assert.ok(first, 'the first glance caught something');
  const again = app.coReadAt(src, first.peak);        // the eye returns to that same place
  assert.ok(!again || again.peak !== first.peak, 'dwelling on a place already read does not re-fire the thought');
});
