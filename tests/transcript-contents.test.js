import { test } from 'node:test';
import assert from 'node:assert/strict';

import { transcriptContents, PARA_GAP } from '../src/rooms/reader/transcript-format.js';

// The CONTENTS LADDER a transcribed clip's source-landing opens on (transcript-format.transcriptContents).
// The principle: the first layer encountered is the HIGHEST level of the reading — the transcript's topic
// chapters — and the raw audio segments sit one rung BENEATH, descended into, never shown first. Only a
// clip too short/single-subject to have chapters falls back to the segment rung. These pin that ordering,
// and that every row carries the word range + clock a surface descends into.

const stream = (specs) => {
  let t = 0; const ws = [];
  for (const [text, gap = 0.1, speaker] of specs) {
    t += gap;
    const w = { text, start: +t.toFixed(3), end: +(t + 0.3).toFixed(3) };
    if (Number.isInteger(speaker)) w.speaker = speaker;
    ws.push(w); t += 0.3;
  }
  return ws;
};

// A two-topic transcript: a long run about railroads/tax, a clear silence, then a long run about
// weather/rain — the content words stop overlapping, so the reading has genuine chapter structure.
const twoTopic = () => {
  const railroad = 'railroad employees tax remuneration stock money payroll wages compensation shares'.split(' ');
  const weather = 'weather rain clouds storm forecast wind temperature sunshine humidity pressure'.split(' ');
  const specs = [];
  const push = (arr, n, gap0) => { for (let k = 0; k < n; k++) specs.push([arr[k % arr.length], k === 0 ? gap0 : 0.12]); };
  push(railroad, 40, 0);
  push(weather, 40, 2.5);   // a 2.5s silence at the topic switch
  return stream(specs);
};

test('transcriptContents: a transcript with topic structure opens on its CHAPTERS, not its segments', () => {
  const { level, rows } = transcriptContents(twoTopic(), { minGapSecs: 3 });
  assert.equal(level, 'chapter', 'the highest structural level leads');
  assert.ok(rows.length >= 2, `expected at least two chapters, got ${rows.length}`);
  // The whole clip is covered, top to bottom, in source order.
  assert.equal(rows[0].startIdx, 0);
  assert.ok(rows.every((r) => r.level === 'chapter'));
  // Every row carries the word range + clock a surface DESCENDS into (Listen seeked to that instant).
  for (const r of rows) {
    assert.ok(Number.isInteger(r.startIdx) && Number.isInteger(r.endIdx) && r.endIdx >= r.startIdx);
    assert.ok(typeof r.startTime === 'number' && isFinite(r.startTime));
    assert.ok(/^\d+:\d{2}$/.test(r.mmss), `expected a m:ss clock, got "${r.mmss}"`);
    assert.ok(typeof r.title === 'string' && r.title.length > 0);
  }
  // The chapters name their own subjects — not "Segment 1".
  assert.ok(rows.some((r) => r.keywords.some((k) => /rail|tax|remun|stock|payroll|wage|compens|share|money/.test(k))));
  assert.ok(rows.some((r) => r.keywords.some((k) => /weath|rain|cloud|storm|forecast|wind|temp|sun|humid|pressure/.test(k))));
});

test('transcriptContents: a short/single-subject clip descends one rung to its breath-group SEGMENTS', () => {
  // Two breath groups, but far too short (and too cohesive) to speak of chapters — the honest lower rung.
  const ws = stream([
    ['we', 0], ['begin', 0.12], ['here', 0.12],
    ['and', PARA_GAP + 0.2], ['then', 0.12], ['continue', 0.12],
  ]);
  const { level, rows } = transcriptContents(ws);
  assert.equal(level, 'segment');
  assert.equal(rows.length, 2, 'one row per breath group');
  assert.ok(rows.every((r) => r.level === 'segment'));
  assert.deepEqual([rows[0].startIdx, rows[0].endIdx], [0, 2]);
  assert.deepEqual([rows[1].startIdx, rows[1].endIdx], [3, 5]);
  // Still a descendable row: a clock and a title, so the fallback rung navigates like the chapter rung.
  assert.ok(/^\d+:\d{2}$/.test(rows[0].mmss));
  assert.ok(typeof rows[1].title === 'string');
});

test('transcriptContents: no words yet → an empty ladder (nothing to draw before the transcript lands)', () => {
  assert.deepEqual(transcriptContents([]), { level: 'segment', rows: [] });
  assert.deepEqual(transcriptContents(), { level: 'segment', rows: [] });
});
