import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';

// The reader auto-composes a topline for every source and every entity, and takes feedback that
// steers it. This proves the wiring end to end, over a real recorded document, with NO model (so
// the deterministic telegram is what is produced — which is exactly correct for a thin field).

const BOOK =
  'Gregor Samsa was a travelling salesman. Gregor woke to find himself changed into an insect. ' +
  'His body was hard and armored. Grete was his sister. Grete brought him food each morning. ' +
  'The chief clerk arrived and demanded an explanation. His father drove Gregor back with a cane. ' +
  'Gregor Samsa was a travelling salesman who supported the family. Grete was his devoted sister.';

const freshApp = async () => {
  const app = createReaderApp({ audit: { turns: [] } });
  if (!app.state.ready) {
    await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  }
  return app;
};
const settle = () => new Promise((res) => setTimeout(res, 0));

test('recording a source auto-composes its topline (the deterministic telegram, no model)', async () => {
  const app = await freshApp();
  const src = app.ingestText(BOOK, 'Metamorphosis');
  await settle(); await settle();                       // let the deferred auto-gen run

  const summary = await app.sourceSummary(src.sn);
  assert.ok(summary && typeof summary.text === 'string' && summary.text.length > 0, 'a topline was composed');
  assert.equal(summary.modelless, true, 'no model was loaded — the telegram stands');
  // every content word of the topline traces back to its own objects — nothing was fabricated
  const { containedIn } = await import('../src/weave/topline/index.js');
  assert.equal(containedIn(summary.text, summary.objects.map((o) => o.text).join(' ')), true);
  // it rests on real passages
  assert.ok(Array.isArray(summary.cites));
  // and it is stored on the source, persisted (a non-underscore field)
  assert.equal(app.sourceSummaryOf(src.sn).text, summary.text);
});

test('every admitted entity gets a topline that names only what the record witnesses', async () => {
  const app = await freshApp();
  app.ingestText(BOOK, 'Metamorphosis');
  await settle();
  const ents = app.entities();
  assert.ok(ents.length > 0, 'entities were admitted');
  const gregor = ents.find((e) => /gregor/i.test(e.label)) || ents[0];

  const summary = await app.entitySummary(gregor.docId, gregor.entId);
  assert.ok(summary && summary.text.length > 0, 'an entity topline was composed');
  const { containedIn } = await import('../src/weave/topline/index.js');
  assert.equal(containedIn(summary.text, summary.objects.map((o) => o.text).join(' ')), true);
  // it is keyed by the merged label and readable back synchronously
  assert.equal(app.entitySummaryFor(gregor.label).text, summary.text);
});

test('feedback steers the topline — "shorter" tightens it, and it never invents', async () => {
  const app = await freshApp();
  const src = app.ingestText(BOOK, 'Metamorphosis');
  await settle();
  const before = await app.sourceSummary(src.sn);

  const after = await app.summaryFeedback({ scope: 'source', sn: src.sn, text: 'make it shorter' });
  assert.ok(after.text.length <= before.text.length, 'the steered topline is no longer than the original');
  assert.ok((after.feedback || []).some((f) => /shorter/.test(f.text)), 'the feedback is recorded');
  assert.equal(after.steer.cap, 2, 'the steer persisted the length cap');

  // a request outside the record is reported as unmet, never fabricated
  const unmet = await app.summaryFeedback({ scope: 'source', sn: src.sn, text: 'focus on Napoleon' });
  assert.ok((unmet.unmet || []).includes('napoleon'), 'the record never named Napoleon — reported, not invented');
  assert.ok(!/napoleon/i.test(unmet.text), 'and Napoleon never appears in the topline');
});

test('a source topline survives a serialize/restore round-trip', async () => {
  const app = await freshApp();
  const src = app.ingestText(BOOK, 'Metamorphosis');
  await settle();
  await app.sourceSummary(src.sn);
  const key = app.entities()[0];
  await app.entitySummary(key.docId, key.entId);

  // the persisted snapshot carries the summaries (source on the source, entity in state.summaries)
  const snap = JSON.parse(JSON.stringify(app.state));
  assert.ok(snap.sources[0].summary && snap.sources[0].summary.text, 'source topline is in the snapshot');
  assert.ok(Object.keys(snap.summaries.entities).length > 0, 'entity toplines are in the snapshot');
});
