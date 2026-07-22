import { test } from 'node:test';
import assert from 'node:assert/strict';

import { alignSequences } from '../src/core/sync/align.js';
import { reduceWordsToFeatures } from '../src/organs/in/sync-reduce.js';
import { toJsonl, fromJsonl } from '../src/core/sync/anchors.js';
import { parseSrt, parseVtt, cuesToWords } from '../src/organs/in/subtitle.js';
import { srtPlan, renderSrt } from '../src/organs/out/sync/srt.js';

// A ~200-word synthetic "transcript" — a deterministic pool of sentences repeated and
// varied, each word timed 0.28s apart, so alignSequences has a real (if synthetic) content
// stream to work with. No Math.random: the repo prefers deterministic, reproducible fixtures.
const POOL = [
  'the committee reviewed the annual budget before the meeting adjourned',
  'she carried the report across town and filed it with the clerk',
  'workers on the north platform inspected every joint before the storm',
  'the orchestra rehearsed the second movement long after the hall emptied',
  'investigators traced the shipment through three ports and two borders',
];
const words = (n, wordsPerSec = 0.28) => {
  const text = [];
  while (text.length < n) for (const s of POOL) text.push(...s.split(' '));
  const out = [];
  for (let i = 0; i < n; i++) {
    const start = i * wordsPerSec;
    out.push({ text: text[i], start, end: start + wordsPerSec * 0.9 });
  }
  return out;
};

// Deterministic "drift + a few substitutions" — what an ASR transcript vs. a slightly
// mistimed/edited caption file of the SAME content actually looks like.
const drifted = (base, { scale = 1.02, jitter = 0.3, subEvery = 10 } = {}) =>
  base.map((w, i) => {
    const j = Math.sin(i * 0.7) * jitter;
    const start = w.start * scale + j;
    const text = (i % subEvery === 0) ? 'um' : w.text;
    return { text, start, end: start + 0.2 };
  });

// Genuinely unrelated content — different vocabulary, independent clock. The "wrong caption
// file" case: same shape of data, no real correspondence.
const UNRELATED_POOL = [
  'quarterly rainfall exceeded every forecast along the coastal ridge',
  'the recipe calls for two eggs a pinch of salt and warm butter',
  'the satellite lost contact shortly after the second burn completed',
];
const unrelated = (n) => {
  const text = [];
  while (text.length < n) for (const s of UNRELATED_POOL) text.push(...s.split(' '));
  const out = [];
  for (let i = 0; i < n; i++) { const start = i * 0.31; out.push({ text: text[i], start, end: start + 0.25 }); }
  return out;
};

test('a correlated pair (same content, drifted timing + light substitution) aligns with confidence', () => {
  const wordsA = words(200);
  const wordsB = drifted(wordsA);
  const seqA = reduceWordsToFeatures(wordsA);
  const seqB = reduceWordsToFeatures(wordsB);
  const result = alignSequences(seqA, seqB, { snA: 'S1', snB: 'S2', alpha: 0.05 });

  assert.equal(result.header.abstain, false, 'a genuinely corresponding pair should not abstain');
  assert.ok(result.anchors.length > 0, 'should produce anchors');
  assert.ok(result.header.coverage > 0.6, `coverage should be high, got ${result.header.coverage}`);
  const medianConf = result.anchors.map((a) => a.confidence).sort((a, b) => a - b)[Math.floor(result.anchors.length / 2)];
  assert.ok(medianConf > 0.5, `median confidence should be > 0.5, got ${medianConf}`);
});

test('a wrong pairing (unrelated content) abstains rather than force-fitting a path', () => {
  const wordsA = words(200);
  const wordsB = unrelated(200);
  const seqA = reduceWordsToFeatures(wordsA);
  const seqB = reduceWordsToFeatures(wordsB);
  const result = alignSequences(seqA, seqB, { snA: 'S1', snB: 'S3', alpha: 0.05 });

  // A plain DTW would still emit SOME path here (it always can) — the born-rule gate is
  // specifically what must reject it: either the whole run abstains, or almost nothing
  // survives the gate.
  const coverage = result.header.coverage || 0;
  assert.ok(result.header.abstain || coverage < 0.1,
    `a wrong pairing should abstain or cover almost nothing, got abstain=${result.header.abstain} coverage=${coverage}`);
});

test('stricter alpha derives a higher (harder to clear) born-rule line', () => {
  const wordsA = words(200);
  const wordsB = drifted(wordsA);
  const seqA = reduceWordsToFeatures(wordsA);
  const seqB = reduceWordsToFeatures(wordsB);
  const loose = alignSequences(seqA, seqB, { snA: 'S1', snB: 'S2', alpha: 0.2 });
  const strict = alignSequences(seqA, seqB, { snA: 'S1', snB: 'S2', alpha: 0.01 });
  assert.ok(Number.isFinite(loose.header.line) && Number.isFinite(strict.header.line));
  assert.ok(strict.header.line >= loose.header.line, 'a stricter alpha should not derive a lower line');
});

test('JSONL round-trips through toJsonl/fromJsonl', () => {
  const wordsA = words(60), wordsB = drifted(wordsA);
  const result = alignSequences(reduceWordsToFeatures(wordsA), reduceWordsToFeatures(wordsB), { snA: 'S1', snB: 'S2' });
  const text = toJsonl(result.header, result.anchors);
  const { header, anchors } = fromJsonl(text);
  assert.equal(header.snA, 'S1');
  assert.equal(anchors.length, result.anchors.length);
  if (anchors.length) assert.equal(anchors[0].textA, result.anchors[0].textA);
});

test('parseSrt reads cues and cuesToWords interpolates word-level timing', () => {
  const srt = [
    '1', '00:00:01,000 --> 00:00:04,000', 'Hello there friend', '',
    '2', '00:00:05,000 --> 00:00:07,500', 'How are you today', '',
  ].join('\n');
  const cues = parseSrt(srt);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].text, 'Hello there friend');
  assert.ok(Math.abs(cues[0].start - 1) < 1e-6 && Math.abs(cues[0].end - 4) < 1e-6);

  const w = cuesToWords(cues);
  assert.equal(w.length, 7);
  assert.equal(w[0].text, 'Hello');
  assert.ok(w[0].start >= cues[0].start && w[w.length - 1].end <= cues[1].end + 1e-6);
});

test('parseVtt reads WEBVTT cues the same way', () => {
  const vtt = ['WEBVTT', '', '00:00:01.000 --> 00:00:02.000', 'Hi there', ''].join('\n');
  const cues = parseVtt(vtt);
  assert.equal(cues.length, 1);
  assert.equal(cues[0].text, 'Hi there');
});

test('srtPlan + renderSrt turns anchors into a well-formed re-timed subtitle file', () => {
  const anchors = [
    { tA: 1.2, tB: 1.0, textA: 'a', textB: 'alpha', confidence: 0.9 },
    { tA: 3.4, tB: 3.1, textA: 'b', textB: 'beta', confidence: 0.8 },
  ];
  const cues = srtPlan(anchors, { timeSide: 'A', textSide: 'B' });
  assert.equal(cues.length, 2);
  assert.equal(cues[0].text, 'alpha');
  const text = renderSrt(cues);
  assert.match(text, /-->/);
  assert.match(text, /alpha/);
});
