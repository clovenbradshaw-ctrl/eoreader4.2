import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';

// The session controller's transcript-export seam (app.transcriptExport / transcriptFormats). It
// builds the export doc from the LIVE organ doc when present, else REBUILDS it from the persisted
// substrate (src.words + audioEvents + speakers) — so exports work after a reload and reflect edits.
// Driven browser-free: a hand-built persisted audio source stands in for one restored from IndexedDB.

const freshApp = async () => {
  const app = createReaderApp({ audit: { turns: [] } });
  if (!app.state.ready) await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  return app;
};

// A persisted audio source as it rides the snapshot: words with speaker + acoustics, a roster, and
// an (empty) append-only edit log — exactly the shape applyTranscript writes and restore rehydrates.
const persistedAudio = () => ({
  sn: 'S1', reg: 'S-0001', kind: 'audio', title: 'Interview', docId: 'doc-iv',
  text: 'Hello there. Hi back.', sha: 'x', bytes: 20,
  words: [
    { text: 'Hello', start: 0.0, end: 0.5, speaker: 0, conf: 0.9, acous: 0.8, snr: 12 },
    { text: 'there', start: 0.6, end: 1.0, speaker: 0, conf: 0.88 },
    { text: 'Hi', start: 3.0, end: 3.4, speaker: 1 },
    { text: 'back', start: 3.5, end: 3.9, speaker: 1 },
  ],
  audioEvents: [],
  speakers: [
    { id: 0, label: 'Speaker 1', utterances: 1, seconds: 1, f0: 118, f1: 500, f2: 1500 },
    { id: 1, label: 'Speaker 2', utterances: 1, seconds: 0.9, f0: 214, f1: 640, f2: 2100 },
  ],
  audioMeta: { duration: 4, peakDb: -3, rmsDb: -20 },
  coverage: { complete: true, seconds: 4 },
});

test('transcriptFormats reports a transcript + its speaker roster from persisted state', async () => {
  const app = await freshApp();
  app.state.sources.push(persistedAudio());
  const info = app.transcriptFormats('S1');
  assert.ok(info.has, 'a persisted transcript is exportable');
  assert.ok(info.formats.some((f) => f.id === 'srt') && info.formats.some((f) => f.id === 'full'), 'formats include subtitles + full JSON');
  assert.equal(info.speakers.length, 2, 'the two voices are surfaced');
});

test('SRT/VTT export from persisted state carries speaker labels', async () => {
  const app = await freshApp();
  app.state.sources.push(persistedAudio());
  const srt = app.transcriptExport('S1', 'srt');
  assert.equal(srt.filename, 'Interview.srt');
  assert.match(srt.text, /Speaker 1: Hello there/);
  assert.match(srt.text, /Speaker 2: Hi back/);
  const vtt = app.transcriptExport('S1', 'vtt');
  assert.match(vtt.text, /<v Speaker 1>Hello/);
});

test('the full-processing JSON carries every way it was read', async () => {
  const app = await freshApp();
  app.state.sources.push(persistedAudio());
  const full = JSON.parse(app.transcriptExport('S1', 'full').text);
  assert.equal(full.speakers.length, 2);
  assert.equal(full.words[0].speaker, 0);
  assert.equal(full.words[0].acous, 0.8, 'the waveform witness rides along');
  assert.ok(full.words.length === 4);
});

test('an export reflects a redaction landed on the append-only edit log', async () => {
  const app = await freshApp();
  const src = persistedAudio();
  app.state.sources.push(src);
  // Redact the second speaker's span — a non-destructive event on the transcript log.
  app.recordAudioEvent(src, { op: 'REDACT', start: 3.0, end: 3.9, mode: 'silence' });
  const txt = app.transcriptExport('S1', 'txt').text;
  assert.ok(txt.includes('Hello there'), 'the unredacted span stays');
  assert.ok(/[▮]/.test(txt) || !txt.includes('Hi back'), 'the redacted span is masked, not exported verbatim');
});
