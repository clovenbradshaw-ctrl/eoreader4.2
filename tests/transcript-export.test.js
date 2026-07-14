import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toSrt, toVtt, toElegantText, toWordsJson, toFullJson, buildFormat, FORMATS, hasTranscript } from '../src/rooms/reader/transcript-export.js';

// The transcript exports (transcript-export.js) — the files a listener keeps: subtitles usable right
// away (SRT/VTT), JSON of every way it was processed, and an elegant by-speaker read. These pin the
// speaker threading and the new formats on a hand-built doc (the shape the audio organ emits).

// A two-speaker doc: tokens carry a `speaker` index; a roster names the voices; utterances group them.
const doc = () => ({
  docId: 'clip', modality: 'audio', duration: 6.0, witness: 'whisper-base · wasm',
  speakers: [
    { id: 0, label: 'Speaker 1', utterances: 1, seconds: 2.0, f0: 118, f1: 500, f2: 1500, centroid: 1800 },
    { id: 1, label: 'Speaker 2', utterances: 1, seconds: 2.0, f0: 210, f1: 650, f2: 2200, centroid: 2600 },
  ],
  diarizeWitnesses: [{ a: [0], b: [1], jsd: 0.42, dbic: 31.5, verdict: 'different' }],
  analysis: { duration: 6, peakDb: -3, rmsDb: -20 },
  coverage: { complete: true, seconds: 6 },
  utterances: [
    { start: 0.0, end: 2.0, speaker: 0, words: [
      { text: 'Hello', start: 0.0, end: 0.5, speaker: 0, conf: 0.9, acous: 0.8, snr: 12 },
      { text: 'there', start: 0.6, end: 1.0, speaker: 0, conf: 0.88 },
    ] },
    { start: 3.0, end: 5.0, speaker: 1, words: [
      { text: 'Hi', start: 3.0, end: 3.4, speaker: 1 },
      { text: 'back', start: 3.5, end: 3.9, speaker: 1 },
    ] },
  ],
  tokens: [
    { text: 'Hello', start: 0.0, end: 0.5, speaker: 0, conf: 0.9, acous: 0.8, snr: 12, unitIdx: 0 },
    { text: 'there', start: 0.6, end: 1.0, speaker: 0, conf: 0.88, unitIdx: 0 },
    { text: 'Hi',    start: 3.0, end: 3.4, speaker: 1, unitIdx: 1 },
    { text: 'back',  start: 3.5, end: 3.9, speaker: 1, unitIdx: 1 },
  ],
});

test('hasTranscript recognizes a heard doc', () => {
  assert.ok(hasTranscript(doc()));
  assert.ok(!hasTranscript({ docId: 'x' }));
});

test('SRT prefixes each cue with its speaker when diarized', () => {
  const srt = toSrt(doc());
  assert.match(srt, /Speaker 1: Hello there/);
  assert.match(srt, /Speaker 2: Hi back/);
  assert.match(srt, /00:00:00,000 --> /, 'millisecond, comma-separated stamps');
});

test('VTT uses proper <v Speaker N> voice tags', () => {
  const vtt = toVtt(doc());
  assert.match(vtt, /^WEBVTT/);
  assert.match(vtt, /<v Speaker 1>Hello/);
  assert.match(vtt, /<v Speaker 2>Hi/);
});

test('a single-speaker clip stays clean — no speaker prefix', () => {
  const d = doc();
  d.speakers = [{ id: 0, label: 'Speaker 1' }];
  d.tokens.forEach(t => { t.speaker = 0; }); d.utterances.forEach(u => { u.speaker = 0; u.words.forEach(w => { w.speaker = 0; }); });
  assert.ok(!/Speaker 1:/.test(toSrt(d)), 'one voice ⇒ no label noise');
});

test('the elegant transcript reads by speaker turns', () => {
  const txt = toElegantText(doc());
  assert.match(txt, /Speaker 1  ·  0:00\nHello there/);
  assert.match(txt, /Speaker 2  ·  0:03\nHi back/);
});

test('word JSON carries speaker + waveform witnesses', () => {
  const w = JSON.parse(toWordsJson(doc())).words;
  assert.equal(w[0].speaker, 0);
  assert.equal(w[0].conf, 0.9);
  assert.equal(w[0].acous, 0.8);
  assert.equal(w[0].snr, 12);
  assert.equal(w[2].speaker, 1);
});

test('the full-processing JSON carries roster, diarization trail, sentences and words', () => {
  const full = JSON.parse(toFullJson(doc()));
  assert.equal(full.speakers.length, 2, 'the speaker roster');
  assert.equal(full.speakers[0].f0, 118, 'each voice keeps its measured pitch');
  assert.equal(full.diarization.method, 'ib-ordered · dbic-gated');
  assert.equal(full.diarization.decisions[0].dbic, 31.5, 'the ΔBIC margin is on the record');
  assert.ok(full.words.length === 4 && full.sentences.length === 2 && full.paragraphs.length >= 1);
});

test('buildFormat returns the download descriptor for every registered format', () => {
  for (const f of FORMATS) {
    const out = buildFormat(doc(), f.id, 'my talk');
    assert.ok(out && out.text && out.filename.endsWith('.' + f.ext), `${f.id} builds a ${f.ext}`);
    assert.equal(out.filename, `my_talk.${f.ext}`, 'the base name is sanitized');
  }
  assert.equal(buildFormat(doc(), 'nope'), null, 'an unknown id is null');
});
