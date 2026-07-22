import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';
import { installSchedule } from '../src/rooms/reader/app/schedule.js';

// Recording a large source used to fire ALL of its heavy after-reads at once, and — worst —
// compute the Bayesian-surprise turning-point spine SYNCHRONOUSLY inside the source-viewer render
// the first frame after it landed. On a whole book that spine is O(budget · events): the tab froze
// for as long as the document took to read (the reported "glitch out" on War and Peace). None of it
// is on the critical path — the source is already recorded and on screen — so it now rides one
// cooperative background queue, ONE read at a time, off the frame. This guards that:
//   1. eotReady never blocks — it returns null and reads in the background, filling in after.
//   2. eotFor still computes synchronously for the explicit callers (download, research review).
//   3. bgSerial runs jobs one at a time, in order, yielding between them (never in parallel).

const freshApp = async () => {
  const app = createReaderApp({ audit: { turns: [] } });
  if (!app.state.ready)
    await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  return app;
};
const settle = (n = 0) => new Promise((res) => setTimeout(res, n));
const drain = async () => { for (let i = 0; i < 60; i++) await settle(2); };

const BOOK = ('Anna Karenina met Count Vronsky at the station. Anna loved Vronsky. '
  + 'Levin farmed the land and loved Kitty. Kitty married Levin. Vronsky pursued Anna. ').repeat(20);

test('eotReady never blocks: it returns null and reads the surprise spine in the background', async () => {
  const app = await freshApp();
  const src = app.ingestText(BOOK, 'a-long-source');

  // The first ask returns null — the spine has NOT been computed on the calling frame.
  assert.equal(app.eotReady(src.sn), null, 'eotReady does not compute the spine synchronously');

  await drain();

  // Once the background queue has drained, the reading is ready — with its turning points.
  const ready = app.eotReady(src.sn);
  assert.ok(ready && Array.isArray(ready.turns), 'the reading landed from the background queue');
  assert.ok(ready.turns.length > 0, 'the surprise spine found turning points');

  // The synchronous accessor the explicit callers use (download / research review) still works.
  const sync = app.eotFor(src.sn);
  assert.ok(sync && sync.structure, 'eotFor still computes synchronously for explicit callers');
  assert.equal(sync, ready, 'both accessors return the one memoised reading');
});

// bgSerial is an internal primitive (not on the public membrane), so exercise it directly on a
// bare ctx — the same object shape installSchedule attaches to inside the app.
const freshScheduler = () => { const ctx = {}; installSchedule(ctx); return ctx; };

test('bgSerial runs jobs one at a time, in order, never overlapping', async () => {
  const app = freshScheduler();
  assert.equal(typeof app.bgSerial, 'function', 'the scheduler is installed');

  const order = [];
  let running = 0, maxConcurrent = 0;
  const job = (n) => async () => {
    running++; maxConcurrent = Math.max(maxConcurrent, running);
    await settle(1);                 // hold the "slot" across a turn of the event loop
    order.push(n);
    running--;
  };
  app.bgSerial(job(1));
  app.bgSerial(job(2));
  app.bgSerial(job(3));

  await drain();

  assert.deepEqual(order, [1, 2, 3], 'jobs ran in enqueue order');
  assert.equal(maxConcurrent, 1, 'only one job ran at a time (never in parallel)');
});

test('bgSerial dedups by key: an identical job already queued is dropped', async () => {
  const app = freshScheduler();
  let runs = 0;
  const bump = () => { runs++; };
  app.bgSerial(bump, { key: 'same' });
  app.bgSerial(bump, { key: 'same' });   // dropped — 'same' already queued
  app.bgSerial(bump, { key: 'same' });   // dropped

  await drain();
  assert.equal(runs, 1, 'the duplicate keyed jobs were dropped, not stacked');

  // Once the first settled, the key is free again — a later genuine re-run is allowed.
  app.bgSerial(bump, { key: 'same' });
  await drain();
  assert.equal(runs, 2, 'a fresh enqueue after the job settled runs again');
});
