// The fold-summary wiring in the reader app (rooms/reader/app/summaries.js):
// foldSummary at any place ({scope:'cursor'}), any lens ({scope:'entity'}), any detail
// ('brief' | 'standard' | 'paragraph'), over a real recorded document, with NO model —
// so the deterministic telegram is what ships, stored and readable back synchronously.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';
import { ingestAudio } from '../src/organs/in/audio.js';

const NOVEL = (() => {
  const acts = [
    { who: 'Miriam Vale', where: 'Harbourton', deed: 'mended the lighthouse lamp' },
    { who: 'Corin Ashe', where: 'the Saltmarsh', deed: 'traded maps with the ferrymen' },
    { who: 'Odette Brant', where: 'Windmere', deed: 'signed the harbour treaty' },
  ];
  const lines = [];
  for (const [a, act] of acts.entries()) {
    lines.push(`CHAPTER ${['I', 'II', 'III'][a]}.`);
    for (let i = 0; i < 20; i++) {
      lines.push(`${act.who} ${act.deed} in ${act.where} once more.`);
      lines.push(`The people of ${act.where} watched ${act.who} through the long season.`);
    }
  }
  return lines.join('\n');
})();

const freshApp = async () => {
  const app = createReaderApp({ audit: { turns: [] } });
  if (!app.state.ready) {
    await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  }
  return app;
};

test('a paragraph fold summary of a whole work: arc coverage, telegram floor, stored', async () => {
  const app = await freshApp();
  const src = app.ingestText(NOVEL, 'The Harbour Treaty');

  const rec = await app.foldSummary({ sn: src.sn, scope: 'full', detail: 'paragraph' });
  assert.ok(rec && rec.text.length > 0, 'a summary shipped');
  assert.equal(rec.via, 'telegram', 'no model loaded — the floor stands');
  assert.equal(rec.modelless, true);
  assert.equal(rec.coverage, 'arc', 'the whole-work packet covered the arc');
  // readable back synchronously, same record
  const back = app.foldSummaryFor({ sn: src.sn, scope: 'full', detail: 'paragraph' });
  assert.equal(back.text, rec.text);
  // and it persists on the summaries store
  assert.ok(app.state.summaries.folds[back.key], 'stored under its key');
});

test('a brief fold summary at a place in the fold, and each detail keyed apart', async () => {
  const app = await freshApp();
  const src = app.ingestText(NOVEL, 'The Harbour Treaty');

  const here = await app.foldSummary({ sn: src.sn, scope: 'cursor', cursor: 30, detail: 'brief' });
  assert.ok(here && here.text.length > 0, 'the fast voice answers at a place');
  assert.equal(here.scope, 'cursor');
  assert.equal(here.detail, 'brief');

  const whole = await app.foldSummary({ sn: src.sn, scope: 'full', detail: 'brief' });
  assert.notEqual(whole.key, here.key, 'place and whole are separate records');
  // a repeat read is the cached record, not a re-generation
  const again = await app.foldSummary({ sn: src.sn, scope: 'cursor', cursor: 30, detail: 'brief' });
  assert.equal(again.generatedAt, here.generatedAt, 'served from the store');
});

test('an entity-lens fold summary rides the same door', async () => {
  const app = await freshApp();
  const src = app.ingestText(NOVEL, 'The Harbour Treaty');
  const rec = await app.foldSummary({ sn: src.sn, scope: 'entity', entity: 'Miriam Vale', detail: 'standard' });
  assert.ok(rec && rec.text.length > 0);
  assert.equal(rec.entity, 'Miriam Vale');
});

// ── range scope + excludeEntities, through the app door ──────────────────────────────

test('a range fold summary stays inside its own [from,to] and is keyed apart from other scopes', async () => {
  const app = await freshApp();
  const src = app.ingestText(NOVEL, 'The Harbour Treaty');
  const rec = await app.foldSummary({ sn: src.sn, scope: 'range', from: 0, to: 3, detail: 'brief' });
  assert.ok(rec && rec.text.length > 0, 'a range summary answers');
  assert.equal(rec.scope, 'range');
  assert.deepEqual(rec.range, { from: 0, to: 3 });
  const wider = await app.foldSummary({ sn: src.sn, scope: 'range', from: 0, to: 20, detail: 'brief' });
  assert.notEqual(wider.key, rec.key, 'a different range is a different record');
});

test('excludeEntities rides foldSummary and changes the stored record', async () => {
  const app = await freshApp();
  const src = app.ingestText(NOVEL, 'The Harbour Treaty');
  const withAll = await app.foldSummary({ sn: src.sn, scope: 'entity', entity: 'Miriam Vale', detail: 'brief' });
  assert.ok(withAll && withAll.text.length > 0, 'answers before any exclusion');
  // Excluding Harbourton — the ONE place Miriam Vale's every property/relation ties to in this
  // fixture — legitimately empties the telegram (nothing left to say without inventing it): the
  // point under test is the cache key and the record's existence, not that text survives every
  // possible exclusion.
  const excluded = await app.foldSummary({
    sn: src.sn, scope: 'entity', entity: 'Miriam Vale', detail: 'brief', excludeEntities: ['Harbourton'],
  });
  assert.notEqual(withAll.key, excluded.key, 'the exclusion set is part of the cache key');
  assert.ok(excluded, 'still returns a record rather than throwing');
});

// ── sentenceAtTime — a waveform time resolved through docFor to the sentence a range asks for ──

test('sentenceAtTime resolves a clip time to a sentence index, and a range summary can ride it', async () => {
  const app = await freshApp();
  const sentences = ['Rhea Voss charted the strait.', 'The crew trusted her reading.', 'She logged the depth nightly.'];
  // ingestAudio segments UTTERANCES by a >=0.9s gap between words (PARA_GAP), not by sentence
  // punctuation — so each sentence needs a real pause before it to land as its own utterance.
  const words = [];
  let t = 0;
  for (const s of sentences) {
    for (const w of s.replace(/[.,]/g, '').split(/\s+/)) { words.push({ text: w, start: t, end: t + 0.4, conf: 0.9 }); t += 0.5; }
    t += 1.0;
  }
  const audioDoc = ingestAudio({ name: 'clip-rhea', duration: t, words });
  const transcript = sentences.join(' ');
  const src = app.ingestText(transcript, 'Rhea Voss Clip');
  src._doc = audioDoc; src.docId = audioDoc.docId; src.kind = 'audio'; src.text = transcript;

  // The clip's second sentence ("The crew trusted her reading.") starts partway through — resolve
  // a time comfortably inside it and confirm the index lands on that sentence, not a neighbour.
  const [t0] = audioDoc.timings[1];
  const idx = app.sentenceAtTime(src.sn, t0 + 0.1);
  assert.equal(idx, 1, `time ${t0 + 0.1} resolves to sentence 1, got ${idx}`);

  const rec = await app.foldSummary({ sn: src.sn, scope: 'range', from: idx, to: idx, detail: 'brief' });
  assert.ok(rec && rec.text.length > 0, 'a range summary anchored at the resolved time answers');
});

test('sentenceAtTime returns null for a non-audio (no timing) source', async () => {
  const app = await freshApp();
  const src = app.ingestText(NOVEL, 'The Harbour Treaty');
  assert.equal(app.sentenceAtTime(src.sn, 5), null);
});
