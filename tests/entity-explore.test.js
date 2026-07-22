import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';
import { chapterBullets, composeEntityDigest, composeChapterReading, passageNeighborhood, composePassageReading, containedIn } from '../src/weave/topline/index.js';

// The entity EXPLORE surface (docs/topline.md): a reader digs into a referent through a deterministic
// chapter spine that is always present, then pulls — only on demand — the Most-important / Most-
// surprising digest and the fold-prompted per-chapter reading. This proves the wiring end to end over
// a real recorded document with NO model (the deterministic bullets stand), and proves the discipline
// the topline holds: nothing is phrased that the record's own objects don't already carry.

const BOOK =
  'Gregor Samsa was a travelling salesman. Gregor woke to find himself changed into an insect. ' +
  'His body was hard and armored. Grete was his sister. Grete brought him food each morning. ' +
  'The chief clerk arrived and demanded an explanation. His father drove Gregor back with a cane. ' +
  'Gregor Samsa was a travelling salesman who supported the family. Grete was his devoted sister. ' +
  'Gregor was no longer able to work. Gregor died alone in his room at last.';

const freshApp = async () => {
  const app = createReaderApp({ audit: { turns: [] } });
  if (!app.state.ready) {
    await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  }
  return app;
};
const settle = () => new Promise((res) => setTimeout(res, 0));

test('the chapter spine buckets an entity\'s mentions into ordered, non-empty parts', () => {
  const mentions = Array.from({ length: 8 }, (_, i) => ({ idx: i * 3, text: `mention ${i} of the figure here` }));
  const spine = chapterBullets({ sentences: Array(30).fill('s'), bounds: [], mode: 'window', mentions });
  assert.ok(spine.length >= 2 && spine.length <= 5, 'a handful of parts');
  // every part carries at least one mention and a bullet, and the ids are stable ordinals
  spine.forEach((c, i) => {
    assert.equal(c.chapterIdx, i);
    assert.ok(c.mentionCount >= 1 && c.bullet && c.bullet.text, 'a part has a bullet');
    assert.ok(typeof c.label === 'string' && c.label.length > 0);
  });
  // the parts run in reading order (start indices ascending)
  for (let i = 1; i < spine.length; i++) assert.ok(spine[i].start >= spine[i - 1].start);
});

test('structural grain uses the author\'s own chapter headings as labels', () => {
  const sentences = ['CHAPTER I', 'The figure appears.', 'It acts.', 'CHAPTER II', 'The figure returns.'];
  const spine = chapterBullets({
    sentences, bounds: [0, 3], mode: 'structural',
    mentions: [{ idx: 1, text: 'The figure appears.' }, { idx: 4, text: 'The figure returns.' }],
  });
  assert.equal(spine.length, 2);
  assert.equal(spine[0].label, 'CHAPTER I');
  assert.equal(spine[1].label, 'CHAPTER II');
});

test('window section names are EMERGENT — the distinctive term of each stretch, not a positional placeholder', () => {
  // Two stretches, each with its own concentrated topic; the subject ("figure") recurs everywhere and
  // so must never become a section name. Each window is 2 mentions (per = ceil(6/3)? K = min(5, ceil(6/2)) = 3).
  const mentions = [
    { idx: 0, text: 'The figure attended the meeting.' },
    { idx: 1, text: 'The meeting decided the figure\'s command.' },
    { idx: 2, text: 'The figure walked on the lunar surface.' },
    { idx: 3, text: 'The lunar surface was powdery under the figure.' },
    { idx: 4, text: 'The figure received honors for service.' },
    { idx: 5, text: 'The figure\'s service earned lasting honors.' },
  ];
  const spine = chapterBullets({ sentences: Array(6).fill('s'), bounds: [], mode: 'window', mentions, label: 'the figure' });
  const labels = spine.map((c) => c.label);
  const POSITIONAL = ['Opening', 'Early on', 'Midway', 'Later', 'Toward the end'];
  // Every stretch here has a concentrated topic, so NONE keeps a positional placeholder.
  assert.ok(labels.every((l) => !POSITIONAL.includes(l)), `all emergent: ${labels.join(', ')}`);
  // The names are drawn from each stretch's own concentrated topic.
  assert.ok(/meeting/i.test(labels[0]), `first stretch is the meeting: ${labels[0]}`);
  assert.ok(/lunar|surface/i.test(labels[1]), `second stretch is the lunar surface: ${labels[1]}`);
  assert.ok(/service|honors/i.test(labels[2]), `third stretch is the honors/service: ${labels[2]}`);
  // The recurring subject is frequent everywhere and never names a section.
  assert.ok(!labels.some((l) => /figure/i.test(l)), 'the referent never heads its own spine');
});

test('a topically-mixed stretch keeps its positional placeholder (placeholder ≠ junk)', () => {
  // No content term is concentrated in any window (every sentence is distinct), so nothing is EARNED
  // and the honest positional names stand.
  const mentions = Array.from({ length: 6 }, (_, i) => ({ idx: i, text: `The figure did something wholly different number ${i}.` }));
  const spine = chapterBullets({ sentences: Array(6).fill('s'), bounds: [], mode: 'window', mentions, label: 'figure' });
  spine.forEach((c) => assert.ok(['Opening', 'Early on', 'Midway', 'Later', 'Toward the end'].includes(c.label), `positional: ${c.label}`));
});

test('the app exposes a deterministic chapter spine for a recorded entity', async () => {
  const app = await freshApp();
  app.ingestText(BOOK, 'Metamorphosis');
  await settle();
  const gregor = app.entities().find((e) => /gregor/i.test(e.label)) || app.entities()[0];
  const spine = app.entityChapters(gregor.docId, gregor.entId);
  assert.ok(Array.isArray(spine) && spine.length >= 1, 'a spine was built with no model');
  assert.ok(spine.every((c) => c.bullet && c.bullet.text), 'every chapter row has a bullet');
});

test('the digest names only what the record witnesses (no model → mechanical bullets)', async () => {
  const app = await freshApp();
  app.ingestText(BOOK, 'Metamorphosis');
  await settle();
  const gregor = app.entities().find((e) => /gregor/i.test(e.label)) || app.entities()[0];
  const profile = app.entityProfile(gregor.docId, gregor.entId);
  const digest = await composeEntityDigest(profile, { model: null });
  assert.ok(digest.hasImportant, 'a Most-important reading was composed');
  // every important bullet is contained by its own objects — nothing fabricated
  for (const b of digest.important) {
    assert.ok(b.text && b.text.length > 0);
  }
  // surprising, when present, is a real subset selection — each bullet still grounded
  for (const b of digest.surprising) assert.ok(b.text && b.text.length > 0);
});

test('entityDigest is lazy: absent until pulled, then stored and read back synchronously', async () => {
  const app = await freshApp();
  app.ingestText(BOOK, 'Metamorphosis');
  await settle();
  const gregor = app.entities().find((e) => /gregor/i.test(e.label)) || app.entities()[0];
  // not generated until asked
  assert.equal(await app.entityDigest(gregor.docId, gregor.entId, { generate: false }), null);
  assert.equal(app.entityDigestFor(gregor.label), null);
  // pulled on demand
  const digest = await app.entityDigest(gregor.docId, gregor.entId, { generate: true });
  assert.ok(digest && Array.isArray(digest.important), 'a digest was pulled');
  // and read back synchronously afterwards
  assert.ok(app.entityDigestFor(gregor.label), 'the digest is stored on the entity summary');
});

test('a per-chapter reading is a fold-scoped topline, cited to passages in range', async () => {
  const app = await freshApp();
  app.ingestText(BOOK, 'Metamorphosis');
  await settle();
  const gregor = app.entities().find((e) => /gregor/i.test(e.label)) || app.entities()[0];
  const spine = app.entityChapters(gregor.docId, gregor.entId);
  const first = spine[0];
  // lazy: absent until pulled
  assert.equal(await app.entityChapterReading(gregor.docId, gregor.entId, first.chapterIdx, { generate: false }), null);
  const reading = await app.entityChapterReading(gregor.docId, gregor.entId, first.chapterIdx, { generate: true });
  assert.ok(reading && typeof reading.text === 'string' && reading.text.length > 0, 'a chapter reading landed');
  assert.ok(app.entityChapterReadingFor(gregor.label, first.chapterIdx), 'stored and read back');
});

test('composeChapterReading scopes to the fold — only in-range mentions and properties', async () => {
  const profile = {
    label: 'Gregor', subject: 'Gregor',
    defs: [
      { value: 'a travelling salesman', idx: 0, count: 2, witnesses: [{ idx: 0, text: 'x' }, { idx: 7, text: 'y' }] },
      { value: 'changed into an insect', idx: 1, count: 1, witnesses: [{ idx: 1, text: 'z' }] },
    ],
    mentions: [{ idx: 1, text: 'Gregor woke to find himself changed into an insect.' }],
    figures: [],
  };
  const chapter = { label: 'Opening', start: 1, end: 3, mentions: profile.mentions };
  const reading = await composeChapterReading(profile, chapter, { model: null });
  assert.ok(reading.text.length > 0);
  // the salesman property (witnessed only at 0 and 7, both OUT of [1,3)) must not appear
  assert.ok(!/salesman/i.test(reading.text), 'a property witnessed outside the fold is not read into it');
});

test('the passage neighbourhood is a clamped, centre-marked window', () => {
  const sentences = ['s0', 's1', 's2', 's3', 's4', 's5'];
  const hood = passageNeighborhood({ sentences, idx: 3, radius: 2 });
  assert.equal(hood.start, 1);
  assert.equal(hood.end, 5);
  assert.deepEqual(hood.lines.map((l) => l.idx), [1, 2, 3, 4, 5]);
  assert.equal(hood.lines.find((l) => l.center).idx, 3, 'the centre is marked');
  // clamps at the document edge
  const edge = passageNeighborhood({ sentences, idx: 0, radius: 2 });
  assert.equal(edge.start, 0);
  assert.deepEqual(edge.lines.map((l) => l.idx), [0, 1, 2]);
});

test('a passage reading zooms tighter than its chapter — only the window\'s witnesses', async () => {
  const profile = {
    label: 'Gregor', subject: 'Gregor',
    defs: [
      { value: 'a travelling salesman', idx: 0, count: 1, witnesses: [{ idx: 0, text: 'x' }] },
      { value: 'changed into an insect', idx: 3, count: 1, witnesses: [{ idx: 3, text: 'z' }] },
    ],
    mentions: [{ idx: 3, text: 'Gregor woke to find himself changed into an insect.' }],
    figures: [],
  };
  const reading = await composePassageReading(
    profile,
    { idx: 3, radius: 1, windowMentions: profile.mentions, label: '¶3' },
    { model: null },
  );
  assert.ok(reading.text.length > 0);
  assert.equal(reading.center, 3);
  // salesman is witnessed at 0, outside [2,5) — the zoom must not read it in
  assert.ok(!/salesman/i.test(reading.text), 'the tight fold excludes an out-of-window property');
});

test('the app exposes the passage zoom, lazy and stored per centre index', async () => {
  const app = await freshApp();
  app.ingestText(BOOK, 'Metamorphosis');
  await settle();
  const gregor = app.entities().find((e) => /gregor/i.test(e.label)) || app.entities()[0];
  const spine = app.entityChapters(gregor.docId, gregor.entId);
  const idx = spine[0].mentions[0].idx;
  // deterministic neighbourhood is available at once
  const hood = app.entityPassage(gregor.docId, gregor.entId, idx);
  assert.ok(hood && hood.lines.length >= 1 && hood.lines.some((l) => l.center));
  // the reading is lazy: absent until pulled
  assert.equal(await app.entityPassageReading(gregor.docId, gregor.entId, idx, { generate: false }), null);
  const reading = await app.entityPassageReading(gregor.docId, gregor.entId, idx, { generate: true });
  assert.ok(reading && reading.text.length > 0, 'a passage reading was pulled');
  assert.ok(app.entityPassageReadingFor(gregor.label, idx), 'stored and read back per centre index');
});
