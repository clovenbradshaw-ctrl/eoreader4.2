import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp, recordReflections, REFLECTION_CAP } from '../src/rooms/reader/app.js';

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

// ── the "200 notes" fix ──────────────────────────────────────────────────────
// The at-rest record is a ring buffer capped at REFLECTION_CAP, but the count we surface must be
// the running total, or "N notes so far" freezes at the cap the moment a session crosses it. Below
// the cap the bug is invisible (total == buffer size), so the regression is proved past REFLECTION_CAP.

test('recordReflections: below the cap, the total equals the retained count', () => {
  const record = []; let seen = 0;
  seen = recordReflections(record, seen, [{ body: 'a' }, { body: 'b' }, { body: 'c' }], (r) => ({ note: r.body }));
  assert.equal(seen, 3, 'the running total counts each note');
  assert.equal(record.length, 3, 'under the cap nothing is trimmed');
  assert.deepEqual(record.map((r) => r.id), ['R1', 'R2', 'R3'], 'ids are monotonic from one');
});

test('recordReflections: the record caps but the running total keeps climbing (no frozen "200 notes")', () => {
  const record = []; let seen = 0;
  const overflow = REFLECTION_CAP + 50;   // cross the cap so the two counts must diverge
  // Voice the notes in uneven batches, as the at-rest loop does across passes.
  for (const b of [80, 80, 80, overflow - 240]) {
    const fresh = Array.from({ length: b }, (_, i) => ({ peak: i, body: `note ${i}` }));
    seen = recordReflections(record, seen, fresh, (r) => ({ peak: r.peak, note: r.body }));
  }
  assert.equal(seen, overflow, 'the running total counts every note ever voiced — it does NOT plateau at the cap');
  assert.equal(record.length, REFLECTION_CAP, 'the record itself stays a ring buffer capped at REFLECTION_CAP');
  const ids = record.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, 'every retained id is unique — no repeated R201 after the cap');
  assert.equal(record[record.length - 1].id, `R${overflow}`, 'the newest note is retained, id from the running total');
  assert.equal(record[0].id, `R${overflow - REFLECTION_CAP + 1}`, 'the oldest beyond the cap fell off the front');
});

test('the count surfaced at rest is the running total (state.reflectionsSeen), not the buffer length', async () => {
  const app = await freshApp();
  app.ingestText(BOOK, 'Metamorphosis');
  app.deepTick(true);
  const produced = app.reflections().length;
  assert.ok(produced > 0, 'the pass voiced at least one reflection');
  assert.equal(app.state.reflectionsSeen, produced, 'under the cap, the running total equals the buffer');
  const last = app.state.log.filter((l) => l.kind === 'reflection').pop();
  assert.ok(last && last.text.includes(`${produced} note`), 'the log line reports the running total, not a frozen 200');
});
