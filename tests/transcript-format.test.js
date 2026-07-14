import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  segmentsOf, readThroughIndex, settledText, formatTranscript,
  detectTranscriptChapters, chapterAt, referentRuns, PARA_GAP,
  SENT_GAP as SENT_GAP_SECS,
} from '../src/rooms/reader/transcript-format.js';

// The formatting + structure the Listen surface lays over a raw heard word stream (transcript-format.js).
// The word stream is the truth; case, punctuation, paragraphs and chapters are a defeasible reading of
// the SILENCES on top — so these pin that the reading is faithful (raw is recoverable, indices align)
// and that it toggles cleanly off.

// A stream of timed words. `text` and gaps only — the shape organs/in/audio.js / _asr.words emit.
const stream = (specs) => {
  // specs: [text, gapBefore] — gapBefore is the silence before this word (0 for the first).
  let t = 0; const ws = [];
  for (const [text, gap = 0.1, speaker] of specs) {
    t += gap;
    const w = { text, start: +t.toFixed(3), end: +(t + 0.3).toFixed(3) };
    if (Number.isInteger(speaker)) w.speaker = speaker;
    ws.push(w); t += 0.3;
  }
  return ws;
};

test('segmentsOf: breath groups cut on a PARA_GAP silence and on a change of voice', () => {
  const ws = stream([
    ['hello', 0], ['there', 0.1],
    ['how', PARA_GAP + 0.2], ['are', 0.1], ['you', 0.1],
  ]);
  const segs = segmentsOf(ws);
  assert.equal(segs.length, 2);
  assert.deepEqual([segs[0].startIdx, segs[0].endIdx], [0, 1]);
  assert.deepEqual([segs[1].startIdx, segs[1].endIdx], [2, 4]);

  // A voice change splits even without a long pause.
  const two = stream([['a', 0, 0], ['b', 0.1, 0], ['c', 0.1, 1], ['d', 0.1, 1]]);
  const segs2 = segmentsOf(two);
  assert.equal(segs2.length, 2);
  assert.equal(segs2[0].speaker, 0);
  assert.equal(segs2[1].speaker, 1);
});

test('readThroughIndex: only closed groups are settled; the open tail stays unread until complete', () => {
  const ws = stream([
    ['we', 0], ['begin', 0.1],
    ['second', PARA_GAP + 0.1], ['thought', 0.1],
    ['still', PARA_GAP + 0.1], ['talking', 0.1],   // the open trailing group
  ]);
  // The last CLOSED group ends at word index 3 ("thought"); 4–5 are the open tail.
  assert.equal(readThroughIndex(ws), 3);
  // When transcription completes, the whole stream is settled.
  assert.equal(readThroughIndex(ws, { complete: true }), ws.length - 1);
  // Nothing closed yet → nothing settled.
  const openOnly = stream([['just', 0], ['starting', 0.1]]);
  assert.equal(readThroughIndex(openOnly), -1);
});

test('settledText: the EO-read slice is the closed groups only, blank-line separated', () => {
  const ws = stream([
    ['one', 0], ['two', 0.1],
    ['three', PARA_GAP + 0.1], ['four', 0.1],
    ['open', PARA_GAP + 0.1], ['tail', 0.1],
  ]);
  const txt = settledText(ws);
  assert.ok(txt.includes('one two'));
  assert.ok(txt.includes('three four'));
  assert.ok(!txt.includes('open'), 'the still-open trailing group is not settled text');
  assert.ok(txt.includes('\n\n'), 'breath groups are blank-line separated');
});

test('formatTranscript off: the raw stream, byte-for-byte, indices aligned', () => {
  const ws = stream([['hello', 0], ['world', 0.1], ['again', SENT_GAP()]]);
  const { tokens, format } = formatTranscript(ws, { format: false });
  assert.equal(format, false);
  assert.equal(tokens.length, 3);
  // No case or punctuation touched; text === raw; the word index is preserved.
  tokens.forEach((t, i) => { assert.equal(t.text, ws[i].text); assert.equal(t.raw, ws[i].text); assert.equal(t.i, i); assert.equal(t.punct, ''); });
});
function SENT_GAP() { return 0.6; }

test('formatTranscript on: pauses become punctuation, sentences capitalise, raw survives', () => {
  const ws = stream([
    ['we', 0], ['believe', 0.12], ['it', 0.12],            // running speech
    ['stock', 0.6], ['is', 0.12], ['not', 0.12], ['money', 0.12],  // 0.6s pause before "stock" → sentence end after "it"
  ]);
  const { tokens } = formatTranscript(ws, { format: true });
  // First word of the transcript is capitalised.
  assert.equal(tokens[0].text[0], 'W');
  // The 0.6s pause ended a sentence after "it" (a period), and "stock" opens a new one capitalised.
  const it = tokens[2], stock = tokens[3];
  assert.ok(it.text.endsWith('.'), `expected a full stop after "it", got "${it.text}"`);
  assert.equal(stock.text, 'Stock');
  assert.ok(stock.sentenceStart);
  // The raw surface is always recoverable, whatever the display shows.
  assert.equal(it.raw, 'it');
  assert.equal(stock.raw, 'stock');
  // A comma-length pause (0.26–0.5s) adds a comma, not a period. The 0.3s silence sits BEFORE
  // "clause" — i.e. after "first" — so "first" takes the comma.
  const ws2 = stream([['first', 0], ['clause', 0.3], ['second', 0.12]]);
  const t2 = formatTranscript(ws2, { format: true }).tokens;
  assert.ok(t2[0].text.endsWith(','), `expected a comma after the clause pause, got "${t2[0].text}"`);
  assert.equal(t2[0].punct, ',');
});

test('formatTranscript: a model that already punctuated is not double-punctuated', () => {
  const ws = stream([['Money.', 0], ['Stock', 0.7], ['is', 0.12]]);
  const { tokens } = formatTranscript(ws, { format: true });
  assert.equal(tokens[0].text, 'Money.');   // not "Money.."
});

test('formatTranscript: paragraphs break on a breath, and align to word indices', () => {
  const ws = stream([
    ['a', 0], ['b', 0.1],
    ['c', PARA_GAP + 0.3], ['d', 0.1],
  ]);
  const { tokens, paras } = formatTranscript(ws, { format: true });
  assert.equal(paras.length, 2);
  assert.deepEqual(paras[0].tokenIdxs, [0, 1]);
  assert.deepEqual(paras[1].tokenIdxs, [2, 3]);
  assert.ok(tokens[2].paraStart);
});

// A synthetic two-topic transcript: a long run about railroads/tax, a clear silence, then a long run
// about weather/rain — the content words stop overlapping, so a chapter seam belongs at the switch.
const twoTopic = () => {
  const railroad = 'railroad employees tax remuneration stock money payroll wages compensation shares'.split(' ');
  const weather = 'weather rain clouds storm forecast wind temperature sunshine humidity pressure'.split(' ');
  const specs = [];
  const push = (arr, n, gap0) => { for (let k = 0; k < n; k++) specs.push([arr[k % arr.length], k === 0 ? gap0 : 0.12]); };
  push(railroad, 40, 0);
  // A 2.5s silence at the topic switch.
  push(weather, 40, 2.5);
  return stream(specs);
};

test('detectTranscriptChapters: a two-topic transcript splits at the lexical-cohesion valley', () => {
  const ws = twoTopic();
  const chapters = detectTranscriptChapters(ws, { minGapSecs: 3 });
  assert.ok(chapters.length >= 2, `expected at least two chapters, got ${chapters.length}`);
  assert.equal(chapters[0].startIdx, 0);
  // The seam should land near the 40-word switch, not in the middle of a topic.
  const seam = chapters[1].startIdx;
  assert.ok(seam >= 34 && seam <= 46, `seam at ${seam} should be near the topic switch (40)`);
  // Each chapter names itself from distinctive keywords.
  assert.ok(chapters[0].keywords.some((k) => /rail|tax|remun|stock|payroll|wage|compens|share|money/.test(k)));
  assert.ok(chapters[1].keywords.some((k) => /weath|rain|cloud|storm|forecast|wind|temp|sun|humid|pressure/.test(k)));
  assert.ok(chapters[0].title && chapters[0].title.length > 0);
});

// A transcript whose topic shifts smoothly — a continuous monologue with sentence-length pauses but NO
// paragraph-length breath, so the whole run is ONE breath group. The fixed-size cohesion blocks don't
// line up with the sentence pauses, so a raw block seam lands mid-sentence; the detector must snap it
// back onto a sentence boundary rather than opening a chapter mid-clause.
const smoothTopicShift = () => {
  const railroad = 'railroad employees tax remuneration stock money payroll wages compensation shares'.split(' ');
  const weather = 'weather rain clouds storm forecast wind temperature sunshine humidity pressure'.split(' ');
  const specs = [];
  for (let k = 0; k < 90; k++) {
    const word = k < 45 ? railroad[k % railroad.length] : weather[k % weather.length];
    // A full-stop's worth of silence every fifth word (a sentence end), but never a full breath (< PARA_GAP),
    // so no breath-group boundary ever falls for the snap to land on.
    const gap = k === 0 ? 0 : (k % 5 === 0 ? SENT_GAP_SECS + 0.1 : 0.12);
    specs.push([word, gap]);
  }
  return stream(specs);
};

test('detectTranscriptChapters: a seam in an unbroken run snaps to a sentence boundary, never mid-sentence', () => {
  const ws = smoothTopicShift();
  // The whole monologue is a single breath group — a breath-only snap has nowhere near to land, so the
  // seam must fall back to the nearest sentence boundary.
  assert.equal(segmentsOf(ws).length, 1, 'fixture should be one unbroken breath group');
  const chapters = detectTranscriptChapters(ws, { minGapSecs: 3 });
  assert.ok(chapters.length >= 2, `expected the topic shift to open a new chapter, got ${chapters.length}`);
  // Every chapter after the first opens where a sentence opens — the word before it is followed by a
  // full-stop's worth of silence (this fixture marks sentence ends only with that pause). Before the
  // fix, a chapter opened at a fixed block boundary in the middle of a sentence (a 0.12s gap).
  for (const c of chapters.slice(1)) {
    const gapBefore = ws[c.startIdx].start - ws[c.startIdx - 1].end;
    assert.ok(gapBefore >= SENT_GAP_SECS, `chapter "${c.title}" opens mid-sentence at word ${c.startIdx} (only a ${gapBefore.toFixed(2)}s gap before it)`);
  }
});

test('detectTranscriptChapters: one continuous subject yields no chapters (the honest empty)', () => {
  // 60 words, all the same small vocabulary, evenly paced — no topic turn to find.
  const vocab = 'court case law argument statute ruling opinion counsel justice bench'.split(' ');
  const specs = []; for (let k = 0; k < 60; k++) specs.push([vocab[k % vocab.length], 0.12]);
  const ws = stream(specs);
  assert.deepEqual(detectTranscriptChapters(ws), []);
  // Too short to chapter at all.
  assert.deepEqual(detectTranscriptChapters(stream([['a', 0], ['b', 0.1], ['c', 0.1]])), []);
});

test('chapterAt: resolves a word index and a clock time to its chapter', () => {
  const ws = twoTopic();
  const chapters = detectTranscriptChapters(ws, { minGapSecs: 3 });
  assert.ok(chapters.length >= 2);
  const c0 = chapterAt(chapters, 0);
  assert.equal(c0.index, 0);
  const lastIdx = ws.length - 1;
  const cl = chapterAt(chapters, lastIdx);
  assert.equal(cl.index, chapters.length - 1);
  // By time: a time inside the second chapter resolves to it.
  const t2 = ws[chapters[1].startIdx].start + 0.01;
  assert.equal(chapterAt(chapters, null, { time: t2 }).index, 1);
});

test('referentRuns: multi-word figures align to the exact words, longest match wins', () => {
  const ws = stream([
    ['the', 0], ['Railroad', 0.1], ['Retirement', 0.1], ['Tax', 0.1], ['Act', 0.1],
    ['taxes', 0.1], ['Darcy', 0.1],
  ]);
  const lex = [
    { label: 'Railroad Retirement Tax Act', docId: 'd~live', entId: 'e1' },
    { label: 'Darcy', docId: 'd~live', entId: 'e2' },
    { label: 'Tax', docId: 'd~live', entId: 'e3' },   // a shorter label that the longer one should win over
  ];
  const map = referentRuns(ws, lex);
  // Words 1..4 are the four-word Act; the head (word 1) carries it, and "Tax" is NOT the short 'Tax' entity.
  assert.equal(map.get(1).entId, 'e1');
  assert.equal(map.get(1).head, true);
  assert.equal(map.get(3).entId, 'e1');   // "Tax" inside the run → the Act, not the short 'Tax'
  assert.equal(map.get(3).head, false);
  assert.equal(map.get(4).entId, 'e1');   // "Act"
  // "Darcy" is its own one-word figure.
  assert.equal(map.get(6).entId, 'e2');
  assert.equal(map.get(6).head, true);
  // "the" and "taxes" name nothing.
  assert.equal(map.get(0), undefined);
  assert.equal(map.get(5), undefined);
});

test('degrades safely on empty / malformed input', () => {
  assert.deepEqual([...referentRuns([], [{ label: 'x', entId: 'e' }]).keys()], []);
  assert.deepEqual([...referentRuns(stream([['a', 0]]), []).keys()], []);
  assert.deepEqual(segmentsOf([]), []);
  assert.deepEqual(segmentsOf(null), []);
  assert.equal(readThroughIndex([]), -1);
  assert.equal(settledText([]), '');
  assert.deepEqual(formatTranscript([]).tokens, []);
  assert.deepEqual(detectTranscriptChapters([]), []);
  assert.equal(chapterAt([], 0), null);
});
