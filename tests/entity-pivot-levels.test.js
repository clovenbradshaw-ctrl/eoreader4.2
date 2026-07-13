import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';
import { ingestAudio } from '../src/organs/in/audio.js';

// THE ENTITY EXPLORER PIVOTS INTO A SOURCE, AND READS IT AT A HOLONIC LEVEL.
//
// A source recorded from a non-prose modality carries TWO readings on one spine: the organ's
// own base level — for a clip, the stream of timed WORD spans — and the natural-language
// content that the words NAME, read as prose on top of it. `sourceLevels` reports what a
// source offers (referents first, meaning-forward); `sourceEntities` returns one source's
// figures at a chosen level. A referent read at the natural-language level carries a docId
// suffixed `~nl`, and every docId-keyed projection (here, entityProfile) resolves it back to
// the real source. A prose source has the one level — its base doc already IS the reading.

const freshApp = async () => {
  const app = createReaderApp({ audit: { turns: [] } });
  if (!app.state.ready) {
    await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  }
  return app;
};

// Recast a source as a recorded audio clip the way applyTranscript does: the base `_doc`
// becomes the word-span (audio) doc; `text` stays the transcript prose the referents lift from.
const asAudioClip = (app, transcript, title) => {
  const words = transcript.replace(/[.]/g, '').split(/\s+/)
    .map((w, i) => ({ text: w, start: i * 0.4, end: i * 0.4 + 0.35, conf: 0.9 }));
  const doc = ingestAudio({ name: `clip-${title}`, duration: words.length * 0.4, words });
  const src = app.ingestText(transcript, title);
  src._doc = doc; src.docId = doc.docId; src.kind = 'audio'; src.text = transcript;
  src.sha = `sha-${title}`; src._nlDoc = null;
  return src;
};

const TRANSCRIPT = 'Darcy met Elizabeth at Pemberley. Elizabeth admired Pemberley. Darcy loved Elizabeth.';

test('an audio source offers two holonic levels, referents first', async () => {
  const app = await freshApp();
  const src = asAudioClip(app, TRANSCRIPT, 'clip');
  const levels = app.sourceLevels(src.sn);
  assert.equal(levels.length, 2, 'a non-prose source offers base spans AND the referents on top');
  assert.equal(levels[0].level, 'referent', 'referents (the meaning) lead — the default level');
  assert.equal(levels[1].level, 'span');
  assert.equal(levels[1].label, 'Words', "an audio clip's raw spans are its Words");
});

test('the two levels read the SAME source into genuinely different entity sets', async () => {
  const app = await freshApp();
  const src = asAudioClip(app, TRANSCRIPT, 'clip');

  const span = app.sourceEntities(src.sn, { level: 'span' });
  const ref = app.sourceEntities(src.sn, { level: 'referent' });

  assert.ok(span.length > 0 && ref.length > 0, 'both levels admit entities');
  // The base spans include the function words the ear heard (met/at/admired/loved); the
  // natural-language reading on top keeps only the referents the content names.
  assert.ok(span.some((e) => /^(met|at|admired|loved)$/i.test(e.label)), 'the span level keeps the raw words');
  assert.ok(!ref.some((e) => /^(met|at|admired|loved)$/i.test(e.label)), 'the referent level drops the verbs/prepositions');
  assert.ok(['darcy', 'elizabeth', 'pemberley'].every((n) => ref.some((e) => e.label.toLowerCase() === n)),
    'the referent level surfaces the named figures');
  assert.ok(ref.length < span.length, 'referents are fewer than the words that carry them');
});

test('a referent read on top carries the ~nl docId, and its profile resolves back to the source', async () => {
  const app = await freshApp();
  const src = asAudioClip(app, TRANSCRIPT, 'clip');

  const ref = app.sourceEntities(src.sn, { level: 'referent' });
  const span = app.sourceEntities(src.sn, { level: 'span' });
  assert.ok(ref.every((e) => e.docId.endsWith('~nl')), 'referent-level entities read from the natural-language doc');
  assert.ok(span.every((e) => !e.docId.endsWith('~nl')), 'span-level entities read from the base organ doc');

  const eliz = ref.find((e) => /elizabeth/i.test(e.label));
  const prof = app.entityProfile(eliz.docId, eliz.entId);
  assert.ok(prof, 'the ~nl docId resolves to a profile');
  assert.equal(prof.sn, src.sn, 'the profile points back at the real source, not the derived reading');
  assert.ok(prof.relations.length > 0, 'the referent carries its natural-language bonds');
});

test('a prose source has the one level — its base doc already is the reading', async () => {
  const app = await freshApp();
  const src = app.ingestText(TRANSCRIPT, 'A page');
  const levels = app.sourceLevels(src.sn);
  assert.equal(levels.length, 1, 'prose offers no separate span level');
  assert.equal(levels[0].level, 'referent');
  // and its entities resolve on the source's own docId (no ~nl indirection)
  const ents = app.sourceEntities(src.sn, { level: 'referent' });
  assert.ok(ents.length > 0 && ents.every((e) => !e.docId.endsWith('~nl')), 'a prose reading is the base level itself');
});
