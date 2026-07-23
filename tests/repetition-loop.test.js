import { test } from 'node:test';
import assert from 'node:assert/strict';

import { detectRepetitionLoops, ingestAudio } from '../src/organs/in/index.js';
import { hearingBelief } from '../src/organs/in/hear.js';

// hear.js's detectRepetitionLoops — a small ASR model's OTHER failure mode: the decoder
// stuck re-emitting the same phrase instead of advancing, distinct from mishearing a word.
// Repeated TEXT alone cannot tell that apart from a person genuinely repeating themselves,
// so the detector reads a candidate repeat against THIS transcript's OWN other spans —
// never a universal words-per-minute constant — and flags it only when it does not fit
// that prior.

// Four DISTINCT six-word windows (no accidental repeats), at four different natural paces
// (2.0s / 2.3s / 1.9s / 2.2s for six words each — a varied ~2.6-3.2 words/sec) — this
// transcript's own PRIOR for how long six words normally take here.
const naturalPreamble = (start = 0) => {
  const windowDurs = [2.0, 2.3, 1.9, 2.2];
  const words = [];
  let t = start, n = 0;
  for (const total of windowDurs) {
    const perWord = total / 6;
    for (let i = 0; i < 6; i++) {
      n++;
      const text = `p${n}`;
      words.push({ text, norm: text, start: t, end: t + perWord });
      t += perWord;
    }
  }
  return { words, end: t };
};

const PHRASE = ['i', 'am', 'going', 'to', 'the', 'office'];

// `reps` cycles of PHRASE, each EXACTLY `cycleDur` seconds long — a decoder tiling the
// same six tokens back-to-back rather than a person genuinely re-saying them.
const stuckLoop = (reps, cycleDur, start) => {
  const perWord = cycleDur / PHRASE.length;
  const words = [];
  let t = start;
  for (let k = 0; k < reps; k++) {
    for (const text of PHRASE) { words.push({ text, norm: text, start: t, end: t + perWord }); t += perWord; }
  }
  return { words, end: t };
};

// `reps` cycles of PHRASE paced like `cycleDurs` (one entry per cycle) — an honestly
// slower/varied repeat, for the negative case.
const honestRepeat = (cycleDurs, start) => {
  const words = [];
  let t = start;
  for (const cycleDur of cycleDurs) {
    const perWord = cycleDur / PHRASE.length;
    for (const text of PHRASE) { words.push({ text, norm: text, start: t, end: t + perWord }); t += perWord; }
  }
  return { words, end: t };
};

test('detectRepetitionLoops: flags a repeat faster/steadier than this recording ever speaks', () => {
  const pre = naturalPreamble(0);
  const loop = stuckLoop(5, 0.9, pre.end + 1.0);   // 6 words in 0.9s ⇒ 6.67 wps, dead-uniform
  const utterances = [{ start: 0, end: loop.end, words: [...pre.words, ...loop.words] }];

  const runs = detectRepetitionLoops(utterances);

  assert.equal(runs.length, 1, 'exactly one repetition-loop run detected');
  assert.equal(runs[0].phrase, 'i am going to the office');
  assert.equal(runs[0].ngram, 6);
  assert.equal(runs[0].repeats, 5);
  assert.equal(runs[0].words, 30);

  // The FIRST occurrence is left unmarked — it may be the genuine utterance the decoder
  // then seized on and looped; only the four repeats after it are flagged.
  const loopWords = utterances[0].words.slice(24);
  assert.equal(loopWords.slice(0, 6).some((w) => w.repeatLoop), false, 'the first occurrence is not flagged');
  assert.equal(loopWords.slice(6).every((w) => w.repeatLoop), true, 'every repeat after the first is flagged');
  assert.ok(pre.words.every((w) => !w.repeatLoop), 'the natural preamble is never touched');
});

test('detectRepetitionLoops: a genuine repeat paced like the rest of the recording is not flagged', () => {
  const pre = naturalPreamble(0);
  // Three honest repeats, each cycle close to this recording's own prior pace (~2.1s) —
  // nothing here is faster or steadier than the recording otherwise ever is.
  const rep = honestRepeat([2.1, 1.95, 2.15], pre.end + 1.0);
  const utterances = [{ start: 0, end: rep.end, words: [...pre.words, ...rep.words] }];

  const runs = detectRepetitionLoops(utterances);
  assert.equal(runs.length, 0, 'a naturally-paced repeat is not mistaken for a decode loop');
  assert.ok(rep.words.every((w) => !w.repeatLoop));
});

test('detectRepetitionLoops: fewer than three repeats reads as emphasis, never a loop', () => {
  const pre = naturalPreamble(0);
  const loop = stuckLoop(2, 0.9, pre.end + 1.0);   // the same suspicious pace, but only 2 reps
  const utterances = [{ start: 0, end: loop.end, words: [...pre.words, ...loop.words] }];

  const runs = detectRepetitionLoops(utterances);
  assert.equal(runs.length, 0);
  assert.ok(loop.words.every((w) => !w.repeatLoop));
});

test('detectRepetitionLoops: too little of the recording to know its own pace — degrades safely', () => {
  const loop = stuckLoop(5, 0.9, 0);   // the same suspicious pace, but NO other speech to judge it against
  const utterances = [{ start: 0, end: loop.end, words: loop.words }];

  const runs = detectRepetitionLoops(utterances);
  assert.equal(runs.length, 0, 'no prior to judge against ⇒ assume nothing, veto nothing');
});

test('detectRepetitionLoops: no repeats, nothing mutated, empty result', () => {
  const pre = naturalPreamble(0);
  const untouched = JSON.parse(JSON.stringify(pre.words));
  const runs = detectRepetitionLoops([{ start: 0, end: pre.end, words: pre.words }]);
  assert.deepEqual(runs, []);
  assert.deepEqual(pre.words, untouched);
});

test('hearingBelief: a repetition-loop word is capped near-zero, regardless of reported confidence', () => {
  const capped = hearingBelief({ conf: 0.95, acous: 0.9, repeatLoop: true });
  const normal = hearingBelief({ conf: 0.95, acous: 0.9, repeatLoop: false });
  assert.ok(capped <= 0.6 * 0.15 + 1e-9, `expected <= 0.09, got ${capped}`);
  assert.ok(normal > capped, 'an ordinarily-confident word is believed far more than a flagged repeat');
});

test('ingestAudio: a repetition-loop run is EVA-flagged and surfaced on doc.audit — never silently dropped', () => {
  const pre = naturalPreamble(0);
  const loop = stuckLoop(5, 0.9, pre.end + 1.0);
  const allWords = [...pre.words, ...loop.words].map(({ text, start, end }) => ({ text, start, end }));
  const doc = ingestAudio({ name: 'clip', duration: loop.end, utterances: [{ start: 0, end: loop.end, words: allWords }] });

  assert.equal(doc.audit.repetitionLoopCount, 1);
  assert.equal(doc.audit.repetitionLoops[0].phrase, 'i am going to the office');
  assert.equal(doc.audit.repetitionLoopWords, 24, 'four repeats × six words are flagged; the first occurrence is not');

  const flagged = doc.tokens.filter((t) => t.repeatLoop);
  assert.equal(flagged.length, 24);

  // The first "office" is not flagged; the next four (one per repeat) are.
  const officeToks = doc.tokens.filter((t) => t.norm === 'office');
  assert.equal(officeToks.length, 5);
  assert.equal(officeToks[0].repeatLoop, false);
  assert.ok(officeToks.slice(1).every((t) => t.repeatLoop));

  // An EVA landed on the log for every flagged word.
  const evas = doc.log.snapshot().filter((e) => e.op === 'EVA' && e.reason === 'repetition-loop');
  assert.equal(evas.length, 24);

  // The run-level audit trail (for a UI to walk, mirroring `contested`) reports the same run.
  const at = doc.repetitionLoopsAt(doc.audit.repetitionLoops[0].start + 0.1);
  assert.equal(at.length, 1);
  assert.equal(at[0].repeats, 5);
});
