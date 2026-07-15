import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';

// CHRONOLOGY wired into the reader session (rooms/reader/app/findings.js). Reconstruct the timeline
// a document (or a corpus) states, and flag where the telling runs against time.

const freshApp = async () => {
  const app = createReaderApp({ audit: { turns: [] } });
  if (!app.state.ready) await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  return app;
};

test('chronologySource reconstructs a document told out of order', async () => {
  const app = await freshApp();
  app.ingestText('The venture dissolved in 2020. It had been founded back in 2015. The final audit closed in 2021.', 'Filing');
  const c = await app.chronologySource(app.topicSources()[0].sn);
  assert.ok(c && c.scope === 'source');
  assert.deepEqual(c.timeline.map((e) => e.when), ['2015', '2020', '2021']);
  assert.equal(c.reorderings.length, 1);            // 2020 told before 2015 — a flashback
  assert.equal(c.reorderings[0].kind, 'flashback');
});

test('chronologyTopic merges dated events across sources into one corpus timeline', async () => {
  const app = await freshApp();
  app.ingestText('Filing A records that the loan closed in 2016.', 'A');
  app.ingestText('Filing B records that the default had occurred in 2014.', 'B');
  const c = await app.chronologyTopic();
  assert.equal(c.scope, 'topic');
  assert.ok(c.sources.length >= 2);
  assert.deepEqual(c.timeline.map((e) => e.when), ['2014', '2016']);
  assert.equal(c.timeline[0].source, app.topicSources().find((s) => s.title === 'B').sn);
});

test('an undated document yields an empty-but-shaped timeline, not a throw', async () => {
  const app = await freshApp();
  app.ingestText('The parties met and disagreed about everything.', 'NoDates');
  const c = await app.chronologySource(app.topicSources()[0].sn);
  assert.ok(c && Array.isArray(c.timeline));
  assert.equal(c.timeline.length, 0);
  assert.ok(c.metric.undated >= 1);
});
