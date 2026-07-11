import { test } from 'node:test';
import assert from 'node:assert/strict';

import { keepGuardAlive } from '../src/rooms/reader/app.js';

// THE FALSE-STALL FIX (rooms/reader/app.js). A reader web turn arms a 45s no-progress watchdog and
// feeds it on every sign of life — a streamed token, a pipeline step, a fetched page. But two calls
// on the path to an answer stream NOTHING: formulateSearchQuery and the sense disambiguator (a
// 220-token temperature-0 decode, disambiguate.js), both run BEFORE the first hop's beat. On a slow
// local model that single decode outlasts the 45s guard, which aborts the turn and reports "the web
// lookup stalled" before a page is ever fetched. keepGuardAlive feeds the guard while such a call is
// in flight, so a slow-but-alive decode is not mistaken for a hang — without ever masking a real one.

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// A stand-in for makeStallGuard's return: the two methods keepGuardAlive touches, plus a feed log.
const fakeGuard = () => {
  let isTripped = false;
  const feeds = [];
  return {
    feed: () => { feeds.push(1); },
    tripped: () => isTripped,
    trip: () => { isTripped = true; },
    feeds,
  };
};

test('keepGuardAlive feeds the guard while an opaque call is pending, then stops when it settles', async () => {
  const g = fakeGuard();
  let resolve;
  const wrapped = keepGuardAlive(g, new Promise((r) => { resolve = r; }), { every: 15 });
  await delay(75);                                   // ~5 intervals worth of a slow, silent decode
  const midCount = g.feeds.length;
  assert.ok(midCount >= 3, `the guard is kept alive while the call runs (fed ${midCount}×)`);

  resolve('the-query');
  assert.equal(await wrapped, 'the-query', 'the wrapped value passes straight through');
  await delay(60);
  assert.ok(g.feeds.length <= midCount + 1, `no further feeds once the call settled (${g.feeds.length} vs ${midCount})`);
});

test('keepGuardAlive stops feeding the moment the guard has tripped (a Stop / stall from elsewhere)', async () => {
  const g = fakeGuard();
  keepGuardAlive(g, new Promise(() => {}), { every: 15 });   // a call that never settles
  await delay(55);
  const before = g.feeds.length;
  assert.ok(before >= 2, 'fed while the guard was live');

  g.trip();                                          // the user hit Stop, or another phase stalled
  await delay(70);
  assert.ok(g.feeds.length <= before + 1, `a tripped guard is left alone (${g.feeds.length} vs ${before})`);
});

test('keepGuardAlive releases the guard past maxMs, so a genuinely stuck call is not masked forever', async () => {
  const g = fakeGuard();
  let clock = 1_000;
  keepGuardAlive(g, new Promise(() => {}), { every: 15, maxMs: 100, now: () => clock });
  await delay(55);
  const before = g.feeds.length;
  assert.ok(before >= 2, 'fed while under the ceiling');

  clock += 10_000;                                   // jump the injected clock well past maxMs
  await delay(70);
  assert.ok(g.feeds.length <= before + 1, `the feed stops past maxMs so the guard can trip (${g.feeds.length} vs ${before})`);
});

test('keepGuardAlive with no guard just forwards the value (the at-rest path, no turn armed)', async () => {
  assert.equal(await keepGuardAlive(null, Promise.resolve(42)), 42);
  assert.equal(await keepGuardAlive(null, 7), 7);            // a bare (non-promise) value works too
  assert.equal(await keepGuardAlive(fakeGuard(), 9, { every: 0 }), 9);   // every:0 disables the feed
});
