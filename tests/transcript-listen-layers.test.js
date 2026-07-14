import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';

// The Listen surface's layered reading (app.transcriptView / spanLayers) and the fix for the bug the
// user hit: a clip that is STILL being transcribed showed 0 referents, because the referent reading was
// gated on the finished transcript. These drive the app browser-free — a hand-built audio source stands
// in for one mid-transcription — and pin that figures light up live, and that a clicked word reports its
// stacked layers (read-state, speaker, confidence, segment, referent).

const freshApp = async () => {
  const app = createReaderApp({ audit: { turns: [] } });
  if (!app.state.ready) await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  return app;
};

// Timed words naming a couple of figures, with a breath (>0.9s) so the first group settles and the
// trailing group stays open — the mid-transcription shape.
const WORDS = [
  { text: 'Justice', start: 0.0, end: 0.4, speaker: 0, conf: 0.9, acous: 0.82, snr: 14 },
  { text: 'Kennedy', start: 0.45, end: 0.9, speaker: 0, conf: 0.88, acous: 0.8, snr: 13 },
  { text: 'asked', start: 0.95, end: 1.3, speaker: 0, conf: 0.7 },
  { text: 'Mr', start: 1.35, end: 1.6, speaker: 0 },
  { text: 'Dupree', start: 1.65, end: 2.1, speaker: 0, conf: 0.6 },
  { text: 'about', start: 2.15, end: 2.5, speaker: 0 },
  { text: 'stock', start: 2.55, end: 2.9, speaker: 0 },
  // >0.9s breath → the group above is a CLOSED (settled) breath group.
  { text: 'Kennedy', start: 4.0, end: 4.4, speaker: 0 },
  { text: 'pressed', start: 4.45, end: 4.8, speaker: 0 },
  { text: 'again', start: 4.85, end: 5.2, speaker: 0 },
];

// A source mid-transcription: the acoustic base doc has landed (modality audio, not transcribed) and the
// live ASR tail is streaming on `_asr.words`; `src.words` is not the baseline yet.
const midTranscription = () => ({
  sn: 'S1', reg: 'S-0001', kind: 'audio', title: 'Oral argument', docId: 'doc-oa',
  text: '## Signal separated from noise\n\nDynamic range 27 dB.', sha: 'placeholder', bytes: 40,
  // the acoustic base reading — modality audio, transcribed:false (so referentDocFor reads the partial)
  _doc: { docId: 'doc-oa', modality: 'audio', transcribed: false, log: { snapshot: () => [] } },
  _asr: { state: 'running', pct: 30, words: WORDS },
  audioEvents: [],
  audioMeta: { duration: 6 },
});

test('referents populate LIVE from a partial transcript (the bug fix)', async () => {
  const app = await freshApp();
  app.state.sources.push(midTranscription());
  // The per-source pivot at the referent level — what the right panel reads.
  const refs = app.sourceEntities('S1', { level: 'referent' });
  const labels = refs.map((r) => String(r.label).toLowerCase());
  assert.ok(refs.length > 0, 'a mid-transcription clip must show referents, not 0');
  assert.ok(labels.some((l) => l.includes('kennedy')), `expected Kennedy among live referents, got ${labels.join(', ')}`);
  // And they must NOT be the acoustic placeholder's own capitalised words (the old bug).
  assert.ok(!labels.some((l) => l === 'signal' || l === 'noise' || l === 'dynamic'),
    'the acoustic summary words must never leak in as referents');
});

test('transcriptView: grey→black read-state, formatting toggle, referents lit', async () => {
  const app = await freshApp();
  app.state.sources.push(midTranscription());

  const v = app.transcriptView('S1', { format: true });
  assert.equal(v.streaming, true);
  assert.equal(v.complete, false);
  // The first breath group (words 0..6) is CLOSED → read (black); the open tail (7..9) is heard (grey).
  assert.equal(v.readThrough, 6);
  assert.equal(v.words[0].read, true);
  assert.equal(v.words[9].read, false);
  // Formatting capitalised the first word and the model's raw surface survives underneath.
  assert.equal(v.words[0].text[0], 'J');
  assert.equal(v.words[0].raw, 'Justice');
  // A figure is lit: "Kennedy" is a referent word with an entId + head flag.
  const kennedy = v.words[1];
  assert.equal(kennedy.ref, true);
  assert.ok(kennedy.entId, 'a referent word carries the entity id for click-through');
  assert.ok(v.hasReferents && v.referentCount >= 1);

  // Toggle formatting OFF → the raw stream, byte-for-byte, indices intact.
  const raw = app.transcriptView('S1', { format: false });
  assert.equal(raw.words[0].text, 'Justice');
  assert.equal(raw.words.length, WORDS.length);
});

test('spanLayers: a clicked word reports its stacked layers', async () => {
  const app = await freshApp();
  app.state.sources.push(midTranscription());
  // Word 1 = "Kennedy" — a settled, named, spoken word.
  const L = app.spanLayers('S1', 1);
  assert.ok(L, 'span layers resolve for a valid word index');
  assert.equal(L.word, 'Kennedy');
  assert.equal(L.read, true);                       // in the settled group
  assert.equal(L.speaker.label, 'Speaker 1');       // speaker 0 → "Speaker 1"
  assert.equal(L.acous, 0.8);                        // the acoustic witness surfaces
  assert.ok(L.segmentText.includes('Justice Kennedy'), 'its breath group is reported');
  // A short group fits whole — the brief-span window trims nothing, so no ellipses.
  assert.equal(L.segment.word, 'Kennedy');
  assert.equal(L.segment.lead, false);
  assert.equal(L.segment.trail, false);
  assert.ok(L.referent && String(L.referent.label).toLowerCase().includes('kennedy'), 'its figure is reported');
  // A word in the still-open tail reads as heard-not-yet-read.
  assert.equal(app.spanLayers('S1', 9).read, false);
  // Out-of-range is null, never a throw.
  assert.equal(app.spanLayers('S1', 999), null);
});

// A breath group collapses into one long run whenever the stream carries no gap-silences (very common
// mid-transcription: the words arrive with continuous timing). The span inspector must NOT dump that
// whole run — it must show a BRIEF span centered on the clicked word, ellipsed where trimmed.
const LONG_WORDS = Array.from({ length: 30 }, (_, k) => ({
  text: `w${k}`, start: k * 0.3, end: k * 0.3 + 0.2, speaker: 0,   // gaps of 0.1s < PARA_GAP → one group
}));
const oneLongGroup = () => ({
  sn: 'S2', reg: 'S-0002', kind: 'audio', title: 'One long breath', docId: 'doc-long',
  text: '## Signal', sha: 'placeholder', bytes: 20,
  _doc: { docId: 'doc-long', modality: 'audio', transcribed: false, log: { snapshot: () => [] } },
  _asr: { state: 'running', pct: 30, words: LONG_WORDS },
  audioEvents: [],
  audioMeta: { duration: 12 },
});

test('spanLayers: a long breath group is windowed to a BRIEF span, not dumped whole', async () => {
  const app = await freshApp();
  app.state.sources.push(oneLongGroup());

  // All 30 words are ONE breath group (no gap ≥ 0.9s, one speaker). Click word 15, deep inside it.
  const L = app.spanLayers('S2', 15);
  assert.ok(L, 'span layers resolve');
  assert.equal(L.segment.word, 'w15', 'the clicked word is the pivot of the span');
  assert.equal(L.segment.lead, true, 'trimmed on the left → a lead ellipsis');
  assert.equal(L.segment.trail, true, 'trimmed on the right → a trail ellipsis');

  // The excerpt is a handful of words, not the whole 30-word run.
  const shown = L.segmentText.replace(/…/g, '').split(/\s+/).filter(Boolean);
  assert.ok(shown.length <= 15, `a brief span, got ${shown.length} words: "${L.segmentText}"`);
  assert.ok(L.segmentText.startsWith('…') && L.segmentText.endsWith('…'), 'ellipsed both ends');
  assert.ok(L.segmentText.includes('w15'), 'the clicked word is in the span');

  // The far ends of the run are NOT shown — the wall of text is gone.
  assert.ok(!L.segmentText.includes('w0 ') && !shown.includes('w0'), 'the start of the run is trimmed away');
  assert.ok(!shown.includes('w29'), 'the end of the run is trimmed away');
  // The seek time follows the window, not the group start.
  assert.ok(L.segmentT0 > 0, 'segSeek lands at the start of the shown span, not 0:00');
});
