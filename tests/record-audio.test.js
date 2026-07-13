// The microphone cochlea (src/rooms/reader/record-audio.js) — the pure parts.
//
// The load-bearing promise is EQUIVALENCE: a live take, transcribed window by window
// while it grows, must land the SAME transcript the offline windower
// (import-file.js _transcribeWindows) produces over the finished waveform — same
// windows, same overlap dedup, same break at the take's end. These tests pin that
// promise with a fake whisper both paths share, plus the resampler's continuity
// across chunk seams and the span slicer's addressing.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createResampler, createTranscriptFeed, _sliceSpan } from '../src/rooms/reader/record-audio.js';
import { _transcribeWindows, _whisperUtterances } from '../src/rooms/reader/import-file.js';

const norm = (s) => String(s || '').toLowerCase();

// ── the resampler ───────────────────────────────────────────────────────────────

test('resampler: 2:1 downsample is every other sample, continuous across pushes', () => {
  const r = createResampler(32000, 16000);
  const a = r.push(Float32Array.from({ length: 8 }, (_, i) => i));        // 0..7
  const b = r.push(Float32Array.from({ length: 8 }, (_, i) => 8 + i));    // 8..15
  assert.deepEqual([...a, ...b], [0, 2, 4, 6, 8, 10, 12, 14]);
});

test('resampler: chunk seams neither skip nor repeat — prime-sized pushes equal one big push', () => {
  const input = Float32Array.from({ length: 480 }, (_, i) => Math.sin(i / 7));
  const whole = createResampler(48000, 16000).push(input);
  const pieces = createResampler(48000, 16000);
  const out = [];
  for (let at = 0; at < input.length; at += 7) out.push(...pieces.push(input.subarray(at, Math.min(at + 7, input.length))));
  assert.deepEqual(out, [...whole]);
});

test('resampler: equal rates pass through untouched', () => {
  const r = createResampler(16000, 16000);
  assert.deepEqual([...r.push(Float32Array.from([1, 2, 3]))], [1, 2, 3]);
});

// ── the span slicer ─────────────────────────────────────────────────────────────

test('_sliceSpan: a span across chunk boundaries reads the right samples', () => {
  const chunks = [0, 1, 2].map(k => Float32Array.from({ length: 10 }, (_, i) => k * 10 + i));
  assert.deepEqual([..._sliceSpan(chunks, 0.5, 1.5, 10)], [5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
});

test('_sliceSpan: never returns an empty segment (the floor+1 guard)', () => {
  assert.equal(_sliceSpan([Float32Array.from([7, 8])], 0, 0, 10).length, 1);
});

// ── live feed ≡ offline windower ────────────────────────────────────────────────
// The shared fake whisper: the mono ramp mono[i] = i lets the fake recover a window's
// absolute start from its first sample, and it "hears" one word every 2 seconds —
// deterministic, so any divergence between the two walks is a real divergence.
const SR = 100;
const fakeAsr = async (seg) => {
  const a = seg[0] / SR, b = a + seg.length / SR;
  const chunks = [];
  for (let t = Math.ceil(a / 2) * 2; t + 1 <= b; t += 2)
    chunks.push({ text: `w${t}`, timestamp: [t - a, t - a + 1] });
  return { chunks };
};

// The live walk: the take grows one second at a time (windows commit the moment they
// fill), then stop() drains the remaining tail with the same break the offline walk uses.
const liveTranscribe = async (mono, D) => {
  const feed = createTranscriptFeed();
  const chunks = [mono];
  let w;
  for (let d = 1; d <= D; d++)
    while ((w = feed.next(d)))
      feed.commit(w, _whisperUtterances(await fakeAsr(_sliceSpan(chunks, w[0], w[1], SR)), norm));
  while ((w = feed.next(D, { final: true }))) {
    feed.commit(w, _whisperUtterances(await fakeAsr(_sliceSpan(chunks, w[0], w[1], SR)), norm));
    if (w[1] >= D) break;
  }
  return feed;
};

for (const D of [8, 30, 32, 67]) {
  test(`feed: a live ${D}s take transcribes identically to the offline windower`, async () => {
    const mono = Float32Array.from({ length: SR * D }, (_, i) => i);
    const offline = await _transcribeWindows(fakeAsr, mono, SR, D, norm, {});
    const live = await liveTranscribe(mono, D);
    assert.equal(live.text(), offline.text);
    assert.deepEqual(live.utterances(), offline.utterances);
    assert.ok(live.text().length > 0, 'the take was heard at all');
  });
}

// ── the feed's own mechanics ────────────────────────────────────────────────────

test('feed: no window is offered until the take can fill one whole', () => {
  const feed = createTranscriptFeed();
  assert.equal(feed.next(29.9), null);
  assert.deepEqual(feed.next(30), [0, 30]);
});

test('feed: a sub-window take still gets exactly one final window', () => {
  const feed = createTranscriptFeed();
  assert.equal(feed.next(8), null, 'nothing to commit while recording');
  const w = feed.next(8, { final: true });
  assert.deepEqual(w, [0, 8]);
  feed.commit(w, [{ start: 1, end: 2, words: [{ text: 'hello', norm: 'hello', start: 1, end: 2 }] }]);
  assert.equal(feed.next(8, { final: true }), null, 'the take is finished');
  assert.equal(feed.text(), 'hello');
});

test('feed: the overlap re-hearing is dropped, a genuinely new word lands', () => {
  const feed = createTranscriptFeed();
  feed.commit([0, 30], [{ start: 27, end: 29, words: [{ text: 'kept', start: 27, end: 29 }] }]);
  // Window [25,55] re-hears second 27 (already on record) and hears second 31 (new).
  feed.commit([25, 55], [{ start: 2, end: 7, words: [
    { text: 'kept-again', start: 2, end: 4 },      // abs 27 — inside the prior window
    { text: 'new', start: 6, end: 7 },             // abs 31 — past it
  ] }]);
  assert.equal(feed.text(), 'kept new');
  assert.equal(feed.heardTo(), 32);
});
