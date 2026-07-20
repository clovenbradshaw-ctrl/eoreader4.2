import { test } from 'node:test';
import assert from 'node:assert/strict';

import { evalShellComponent } from './helpers/dc-shell.js';

// CLICK-THROUGH FROM THE ENTITY PANEL TO THE SOURCE SPAN.
//
// A mention or a base word/segment is click-through: on a clip it SEEKS the player to the instant
// it was said and flashes the word(s). That wiring lives in the reader surface's Component logic
// (src/rooms/reader/ui/shell.logic.js), not in an importable module — so pull the script out and
// evaluate it against a stubbed base class, and exercise the REAL helpers (not a copy) the way the
// entity panel calls them.

const Component = evalShellComponent();
const proto = Component.prototype;

const stream = (n) => Array.from({ length: n }, (_, i) => ({ text: 'w' + i, start: i * 0.5, end: i * 0.5 + 0.4 }));
// A DOM stand-in whose querySelector reports the exact selector asked for, so a test can see which
// word span got flashed.
const fakeTx = (flashed) => ({
  querySelector: (sel) => ({ classList: { add: () => flashed.push(sel) }, scrollIntoView() {} }),
  querySelectorAll: () => [],
});

test('_matchWordRun finds a mention run in the word stream (case/punctuation tolerant)', () => {
  const words = 'we will hear argument first this morning in case 17530'.split(' ')
    .map((t, i) => ({ text: t, start: i, end: i + 0.9 }));
  assert.deepEqual(proto._matchWordRun(words, 'hear argument first'), [2, 4], 'the consecutive run');
  assert.deepEqual(proto._matchWordRun(words, 'Argument,'), [3, 3], 'a single distinctive token, punctuation dropped');
  assert.equal(proto._matchWordRun(words, 'nothing here at all'), null, 'no match → null');
});

test('_consumeListenSeek seeks the player by time and flashes the span at that instant', () => {
  const flashed = [];
  const audio = { currentTime: 0 };
  const ctx = {
    _listenSeekPending: { sn: 'S1', target: { t0: 2.0, t1: 2.3 } },
    _listenAudio: audio, _listenTx: fakeTx(flashed), _listenWords: stream(10),
    _matchWordRun: proto._matchWordRun, _flashWords: proto._flashWords,
  };
  proto._consumeListenSeek.call(ctx);
  assert.equal(audio.currentTime, 2.0, 'seeks to the mention time');
  assert.equal(ctx._listenSeekPending, null, 'clears the pending seek once it lands');
  assert.ok(flashed.some((s) => s.includes('data-i="4"')), 'flashes the word sounding at t=2.0 (index 4)');
});

test('_consumeListenSeek seeks a referent mention by matching its text when it has no clock', () => {
  const flashed = [];
  const audio = { currentTime: 0 };
  const words = 'the railroad retirement tax act levies a payroll tax'.split(' ')
    .map((t, i) => ({ text: t, start: i * 0.4, end: i * 0.4 + 0.3 }));
  const ctx = {
    _listenSeekPending: { sn: 'S1', target: { text: 'Railroad Retirement Tax Act' } },
    _listenAudio: audio, _listenTx: fakeTx(flashed), _listenWords: words,
    _matchWordRun: proto._matchWordRun, _flashWords: proto._flashWords,
  };
  proto._consumeListenSeek.call(ctx);
  assert.equal(Math.round(audio.currentTime * 10) / 10, 0.4, 'seeks to the first word of the matched run ("railroad")');
  assert.equal(ctx._listenSeekPending, null);
});

test('_consumeListenSeek keeps the seek pending until the Listen surface is mounted', () => {
  const ctx = {
    _listenSeekPending: { sn: 'S1', target: { t0: 1 } },
    _listenAudio: null, _listenTx: null,
    _matchWordRun: proto._matchWordRun, _flashWords: proto._flashWords,
  };
  proto._consumeListenSeek.call(ctx);
  assert.ok(ctx._listenSeekPending, 'not mounted yet — the transcript ref will retry it');
});
