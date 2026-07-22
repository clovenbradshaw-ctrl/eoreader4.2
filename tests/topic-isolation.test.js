import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';

const freshApp = async () => {
  const app = createReaderApp({ audit: { turns: [] } });
  if (!app.state.ready) await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  return app;
};

test('addSource can route to an explicit topic even after the active topic changes', async () => {
  const app = await freshApp();
  const roman = app.topicNew('Roman topic');
  const maple = app.topicNew('Maple topic');

  app.setTopic(roman.id);
  const capturedTopicId = app.topic().id;
  app.setTopic(maple.id);

  const src = app.ingestText('The Roman Republic fell after civil wars.', 'Roman note', { topicId: capturedTopicId });
  assert.ok(src, 'source recorded');
  assert.deepEqual(app.topicById(roman.id).sourceSns, [src.sn]);
  assert.deepEqual(app.topicById(maple.id).sourceSns, []);
});

test('deduplicated sources are linked to the explicit destination topic, not current topic', async () => {
  const app = await freshApp();
  const roman = app.topicNew('Roman topic');
  const maple = app.topicNew('Maple topic');

  const first = app.ingestText('Shared evidence text about a republic.', 'Shared', { topicId: roman.id });
  app.setTopic(maple.id);
  const dup = app.ingestText('Shared evidence text about a republic.', 'Shared again', { topicId: roman.id });

  assert.equal(dup.sn, first.sn);
  assert.deepEqual(app.topicById(roman.id).sourceSns, [first.sn]);
  assert.deepEqual(app.topicById(maple.id).sourceSns, []);
});
