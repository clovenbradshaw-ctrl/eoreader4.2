import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';
import { ingestAudio } from '../src/organs/in/audio.js';

// ENTITIES RENDER AS HYPERLINKS OVER A CLIP'S TRANSCRIPT.
//
// A named figure a clip mentions lives in its TRANSCRIPT (read as prose on top — the referent /
// meaning layer, referentDocFor), not in the raw word-span graph of the base audio doc (which has
// no `admission` and would link nothing). The reading layers therefore build the entity lexicon
// from the referent doc, so the Reader/Native/answer views AND the Listen surface's interactive
// transcript link exactly the same figures the entity explorer lists.
//
// `transcriptEntityRuns` maps that linker onto the clip's TIMED word stream: which runs of words
// spell a figure, so the transcript can underline them and open the entity on click.

const freshApp = async () => {
  const app = createReaderApp({ audit: { turns: [] } });
  if (!app.state.ready) {
    await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  }
  return app;
};

// Recast a source as a transcribed audio clip, the way applyTranscript does: the base `_doc` is the
// word-span (audio) doc; `text` stays the transcript prose the referents lift from.
const asAudioClip = (app, transcript, title) => {
  const words = transcript.replace(/[.,]/g, '').split(/\s+/)
    .map((w, i) => ({ text: w, start: i * 0.4, end: i * 0.4 + 0.35, conf: 0.9 }));
  const doc = ingestAudio({ name: `clip-${title}`, duration: words.length * 0.4, words });
  const src = app.ingestText(transcript, title);
  src._doc = doc; src.docId = doc.docId; src.kind = 'audio'; src.text = transcript;
  src.sha = `sha-${title}`; src._nlDoc = null;
  return src;
};

// The timed word stream the Listen surface renders (each word its own [start,end] holon), spelled
// straight from the transcript so char offsets line up with what the words say.
const timedWords = (transcript) => transcript.split(/\s+/).map((w, i) => ({ text: w, start: i * 0.4, end: i * 0.4 + 0.35 }));

const TRANSCRIPT = 'Darcy met Elizabeth at Pemberley. Elizabeth admired Pemberley. Darcy loved Elizabeth.';

// A COURTROOM opening — the honorific belongs TO the name. "Mr. Dupree" and "Mr. Chief Justice"
// are ONE figure each, not a bare surname with a stray "Mr." beside it. Admission joins the title
// to the name and drops its period (the label it keeps is "Mr Dupree"); the linker has to carry
// that normalisation back onto the surface it reads ("Mr. Dupree") or the title strands as loose
// text and only the surname links — the exact split the entity underlines showed in the reader.
const COURT = 'Mr. Chief Justice, and may it please the Court. Mr. Dupree argued the case. The Chief Justice questioned Mr. Dupree.';

test('the reading layer links a clip’s figures — the referent layer, not the empty word graph', async () => {
  const app = await freshApp();
  const src = asAudioClip(app, TRANSCRIPT, 'PP');

  const link = app.readerLink(src.sn, { entities: true });
  assert.ok(link, 'readerLink returns a linker for the clip');
  const segs = link.linkify(TRANSCRIPT);
  const ents = segs.filter((s) => s.t === 'ent');
  assert.ok(ents.length > 0, 'the transcript links its figures (was 0 when the lexicon read the base word graph)');
  const labels = new Set(ents.map((e) => e.s));
  assert.ok(labels.has('Darcy') && labels.has('Elizabeth') && labels.has('Pemberley'), 'the three named figures all link');
  // Every entity seg carries the referent (~nl) docId, which resolveDoc maps back to the source.
  assert.ok(ents.every((e) => String(e.docId).endsWith('~nl')), 'links point at the meaning layer, not the base doc');
});

test('answerSegments links a clip’s figures in the topic’s answers', async () => {
  const app = await freshApp();
  asAudioClip(app, TRANSCRIPT, 'PP');
  const paras = app.answerSegments({ text: 'Darcy walked to Pemberley.', cites: [] }, { entities: true });
  const ents = paras.flatMap((p) => p.segs).filter((s) => s.t === 'ent');
  assert.ok(ents.some((e) => e.s === 'Darcy') && ents.some((e) => e.s === 'Pemberley'),
    'a clip’s figures link inside an answer, not only in prose sources');
});

test('transcriptEntityRuns maps single-word figures onto the timed word stream', async () => {
  const app = await freshApp();
  const src = asAudioClip(app, TRANSCRIPT, 'PP');
  const words = timedWords(TRANSCRIPT);
  const runs = app.transcriptEntityRuns(src.sn, words);
  assert.ok(runs.length >= 5, 'every mention of a figure is a run');
  // words: 0:Darcy 1:met 2:Elizabeth 3:at 4:Pemberley. 5:Elizabeth 6:admired 7:Pemberley. ...
  const at = (i0) => runs.find((r) => r.i0 === i0);
  assert.deepEqual([at(0).i0, at(0).i1], [0, 0], 'Darcy is word 0');
  assert.deepEqual([at(2).i0, at(2).i1], [2, 2], 'Elizabeth is word 2');
  // A trailing period rides on the word; the run still lands on it exactly.
  assert.deepEqual([at(4).i0, at(4).i1], [4, 4], 'Pemberley. (with its period) is word 4');
});

test('transcriptEntityRuns spans a multi-word figure across its words', async () => {
  const app = await freshApp();
  const T = 'The Railroad Retirement Tax Act was argued by Justice Kennedy in Washington today.';
  const src = asAudioClip(app, T, 'MW');
  const words = timedWords(T);
  const runs = app.transcriptEntityRuns(src.sn, words);
  const cover = (r) => words.slice(r.i0, r.i1 + 1).map((w) => w.text).join(' ');
  const multi = runs.find((r) => r.i1 > r.i0);
  assert.ok(multi, 'a multi-word figure yields a run wider than one word');
  const covered = runs.map(cover);
  assert.ok(covered.includes('Railroad Retirement Tax Act'), 'the four-word act is one run');
  assert.ok(covered.includes('Justice Kennedy'), 'the two-word name is one run');
  // Runs never overlap and never point past the stream.
  const sorted = [...runs].sort((a, b) => a.i0 - b.i0);
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i].i0 > sorted[i - 1].i1, 'runs are non-overlapping');
  assert.ok(runs.every((r) => r.i0 >= 0 && r.i1 < words.length && r.i1 >= r.i0), 'indices stay in range');
});

test('an honorific links as part of the figure in prose, not stranded beside it', async () => {
  const app = await freshApp();
  const src = app.ingestText(COURT, 'COURT');
  const segs = app.readerLink(src.sn, { entities: true }).linkify(COURT);
  const ents = segs.filter((s) => s.t === 'ent').map((s) => s.s);
  assert.ok(ents.includes('Mr. Dupree'), 'the honorific rides with the surname — "Mr. Dupree" is one linked entity');
  assert.ok(ents.includes('Mr. Chief Justice'), '"Mr. Chief Justice" links whole, title and all');
  // The title is never left as a bare "Mr." text fragment sitting just before a linked name.
  for (let i = 1; i < segs.length; i++) {
    if (segs[i].t === 'ent') {
      assert.ok(!/(^|\s)Mr\.?\s*$/.test(segs[i - 1].s || ''), 'no stranded "Mr." immediately precedes a linked name');
    }
  }
});

test('transcriptEntityRuns carries the honorific into the figure’s run', async () => {
  const app = await freshApp();
  const src = asAudioClip(app, COURT, 'COURT');
  const words = timedWords(COURT);
  const runs = app.transcriptEntityRuns(src.sn, words);
  const cover = (r) => words.slice(r.i0, r.i1 + 1).map((w) => w.text).join(' ');
  const covered = runs.map(cover);
  assert.ok(covered.some((c) => /^Mr\.?\s+Dupree\b/.test(c)), 'the "Mr." word heads the Dupree run');
  assert.ok(covered.some((c) => /^Mr\.?\s+Chief\s+Justice\b/.test(c)), 'the "Mr." word heads the Chief Justice run');
  // Every "Mr." title word sits INSIDE a multi-word run — never a run of its own beside the name.
  words.forEach((w, i) => {
    if (/^Mr\.?$/.test(w.text)) {
      const r = runs.find((rr) => rr.i0 <= i && i <= rr.i1);
      assert.ok(r && r.i1 > r.i0, `the title at word ${i} is part of a multi-word run`);
    }
  });
});

test('a run points at an entity the profile can resolve (the click-through target)', async () => {
  const app = await freshApp();
  const src = asAudioClip(app, TRANSCRIPT, 'PP');
  const runs = app.transcriptEntityRuns(src.sn, timedWords(TRANSCRIPT));
  const r = runs[0];
  const prof = app.entityProfile(r.docId, r.entId);
  assert.ok(prof && prof.label, 'openEntity(docId, entId) resolves to a real profile');
  assert.equal(String(prof.label).toLowerCase(), 'darcy', 'the first run resolves to Darcy');
});

test('an un-transcribed clip has no runs (its figures aren’t lifted yet)', async () => {
  const app = await freshApp();
  const src = asAudioClip(app, TRANSCRIPT, 'PP');
  src._doc.transcribed = false;   // as before whisper lands — referentDocFor returns null
  const runs = app.transcriptEntityRuns(src.sn, timedWords(TRANSCRIPT));
  assert.deepEqual(runs, [], 'no transcript, no referents, no runs');
});

test('empty / missing input is safe', async () => {
  const app = await freshApp();
  const src = asAudioClip(app, TRANSCRIPT, 'PP');
  assert.deepEqual(app.transcriptEntityRuns(src.sn, []), [], 'no words → no runs');
  assert.deepEqual(app.transcriptEntityRuns('nope', timedWords(TRANSCRIPT)), [], 'unknown source → no runs');
});
