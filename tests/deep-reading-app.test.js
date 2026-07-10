import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';

// THE AMBIENT WIRING (rooms/reader/app.js) — the inner monologue at rest is wired into the
// reader session, not just the fold engine. When the record has content and the reader is not
// engaged in a turn, deepTick() surfs to the place of most interest and voices a reflection
// into state.reflections. This proves the wiring the 4.2 re-cut had dropped: the engine was
// carried but never driven by the room. The idle governor itself is browser-only (no window
// in node); deepTick(manual=true) is the same governed pass it fires, invoked directly here.

const BOOK =
  'Gregor woke to find himself changed. His body was hard and armored. ' +
  'The family gathered at the door and would not enter. Grete brought him food but looked away. ' +
  'The chief clerk arrived and demanded an explanation. Gregor could not make himself understood. ' +
  'His father drove him back with a cane. The wound festered through the following weeks. ' +
  'Grete grew tired of the burden and turned cold. The family resolved that the creature must go. ' +
  'Gregor died quietly before dawn. The family felt only relief, and went walking in the sun.';

// restore() creates the first topic on a microtask; wait for `ready` before recording.
const freshApp = async () => {
  const app = createReaderApp({ audit: { turns: [] } });
  if (!app.state.ready) {
    await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  }
  return app;
};

test('at rest, the reader reflects on the record — reflections accumulate', async () => {
  const app = await freshApp();
  app.ingestText(BOOK, 'Metamorphosis');
  assert.ok(app.topicSources().length >= 1, 'the paste is recorded');

  assert.equal(app.reflections().length, 0, 'nothing reflected before the first pass');
  app.deepTick(true);                       // the governed at-rest pass, fired manually
  const refl = app.reflections();
  assert.ok(refl.length > 0, 'the reading voiced at least one reflection at rest');
  const r = refl[0];
  assert.ok(typeof r.note === 'string' && r.note.length > 0, 'a reflection carries an inner note');
  assert.ok(Number.isInteger(r.peak), 'a reflection names the place of most interest');
});

test('the firewall: every at-rest reflection is reafference — canWitness is false', async () => {
  const app = await freshApp();
  app.ingestText(BOOK, 'Metamorphosis');
  app.deepTick(true);
  const refl = app.reflections();
  assert.ok(refl.length > 0);
  for (const r of refl) {
    assert.equal(r.canWitness, false, 'a reflection can never be witnessed as a fact');
  }
});

test('reflections stream into state.log and emit a "reflections" change', async () => {
  const app = await freshApp();
  let sawReflections = false;
  app.subscribe((kind) => { if (kind === 'reflections') sawReflections = true; });
  app.ingestText(BOOK, 'Metamorphosis');
  app.deepTick(true);
  assert.ok(sawReflections, 'a fresh reflection fans out to the surface');
  assert.ok(app.state.log.some((l) => l.kind === 'reflection'), 'the ledger records the reflection beat');
});

test('an empty record produces no reflections and no throw', async () => {
  const app = await freshApp();
  assert.doesNotThrow(() => app.deepTick(true));
  assert.equal(app.reflections().length, 0, 'nothing on the record → nothing to reflect on');
});
