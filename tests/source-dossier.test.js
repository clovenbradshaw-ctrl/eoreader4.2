import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';

// The source page's DOSSIER (docs/topline.md): a single-subject source — a bio, an article about one
// subject — surfaces its dominant figure's reading in place of a machine telegram. This proves the
// seam the surface reads: app.sourceDominantEntity(sn) names the figure the source centres on, keyed
// exactly as the entity surfaces are (docId + entId), so its contextual summary, provenance DAG and
// Wikipedia referent all resolve. No model — the wiring, not the phrasing, is under test.

// A bio-shaped document: one figure named again and again, a couple of others in passing.
const BIO =
  'Neil Armstrong was an American astronaut. Armstrong was born in Ohio. ' +
  'Armstrong flew combat missions in Korea. Armstrong joined NASA as a test pilot. ' +
  'Armstrong commanded Apollo 11. Armstrong was the first person to walk on the Moon. ' +
  'Armstrong later taught engineering. Buzz Aldrin followed Armstrong onto the surface. ' +
  'Michael Collins stayed in orbit.';

const freshApp = async () => {
  const app = createReaderApp({ audit: { turns: [] } });
  if (!app.state.ready) {
    await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  }
  return app;
};
const settle = () => new Promise((res) => setTimeout(res, 0));

test('sourceDominantEntity names the figure a single-subject source centres on', async () => {
  const app = await freshApp();
  const src = app.ingestText(BIO, 'Neil Armstrong');
  await settle();
  const dom = app.sourceDominantEntity(src.sn);
  assert.ok(dom, 'a dominant figure was found for a bio-shaped source');
  assert.match(dom.label, /armstrong/i, 'the most-named figure leads, not a passing mention');
  assert.equal(dom.docId, src.docId, 'the figure is keyed to the source doc');
  // the returned id resolves the same profile the entity surfaces read — so the dossier's contextual
  // summary + DAG + wiki referent all have something to render
  const profile = app.entityProfile(dom.docId, dom.entId);
  assert.ok(profile && profile.label, 'the dominant figure resolves to an entity profile');
  assert.match(profile.label, /armstrong/i);
});

test('sourceDominantEntity returns null for a figure-less source (it keeps its plain summary)', async () => {
  const app = await freshApp();
  const src = app.ingestText('The tide moved in slowly. The water rose. Then it fell again.', 'Tides');
  await settle();
  const dom = app.sourceDominantEntity(src.sn);
  assert.equal(dom, null, 'no repeatedly-named figure — no dossier, the plain source summary stands');
});

test('a passing one-off mention never becomes the whole source', async () => {
  const app = await freshApp();
  // "Zephyr" is named once; no figure clears the dominance floor
  const src = app.ingestText('The wind was strong that day. Zephyr watched the clouds. The rain came later.', 'Weather');
  await settle();
  const dom = app.sourceDominantEntity(src.sn);
  assert.equal(dom, null, 'a single sighting does not carry a dossier');
});
