import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';

const freshApp = async (opts = {}) => {
  const app = createReaderApp({ audit: { turns: [] }, ...opts });
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

test('library read hits can be admitted to an explicit topic after focus changes', async () => {
  const app = await freshApp();
  const roman = app.topicNew('Roman topic');
  const maple = app.topicNew('Maple topic');

  app.setTopic(maple.id);
  const src = await app.recordHit({
    title: 'Republic note',
    url: 'https://example.test/republic',
    text: 'The Roman Republic faced civil wars and constitutional strain.',
  }, 'Roman Republic', { topicId: roman.id });

  assert.ok(src, 'source recorded');
  assert.deepEqual(app.topicById(roman.id).sourceSns, [src.sn]);
  assert.deepEqual(app.topicById(maple.id).sourceSns, []);
});

test('feed ingestion passes the captured topic into source registration', async () => {
  const { installIngest } = await import('../src/rooms/reader/app/ingest.js');
  const body = `<?xml version="1.0"?><rss version="2.0"><channel><title>Roman Feed</title><link>https://example.test/</link><description>Updates</description><item><title>Senate</title><link>https://example.test/senate</link><description>Roman Senate update.</description></item></channel></rss>`;
  const added = [];
  const appCtx = {
    client: { fetchUrl: async () => ({ text: body }) },
    state: { activeTopicId: 'maple' }, emit: () => {}, logIt: () => {},
    beginJob: () => 'job:1', settleJob: () => {},
    addSource: (src) => { added.push(src); return { sn: 'S1', ...src }; },
  };
  installIngest(appCtx);

  const src = await appCtx.ingestUrl('https://example.test/rss', { topicId: 'roman' });

  assert.equal(src.kind, 'feed');
  assert.equal(added[0].topicId, 'roman');
});

test('native navigation records child pages in the parent source topic after focus changes', async () => {
  const app = await freshApp({ fetchImpl: async () => ({ ok: true, text: async () => '<html><head><title>Child</title></head><body><p>The Roman forum page.</p></body></html>' }) });
  const roman = app.topicNew('Roman topic');
  const maple = app.topicNew('Maple topic');
  const parent = app.ingestText('Parent page about Rome.', 'Roman parent', { topicId: roman.id });

  app.setTopic(maple.id);
  const out = await app.navigatePage(parent.sn, 'https://example.test/child');

  assert.ok(out.childSn, 'child source recorded');
  assert.ok(app.topicById(roman.id).sourceSns.includes(out.childSn));
  assert.deepEqual(app.topicById(maple.id).sourceSns, []);
});

test('preserved re-reads stay with the source topic after focus changes', async () => {
  const app = await freshApp();
  const roman = app.topicNew('Roman topic');
  const maple = app.topicNew('Maple topic');
  const original = app.ingestText('Original Roman note.', 'Roman source', { topicId: roman.id });

  app.setTopic(maple.id);
  const result = await app.reReadSource(original.sn, { mode: 'preserve' });

  assert.ok(result.source, 'preserved re-read recorded');
  assert.ok(app.topicById(roman.id).sourceSns.includes(result.source.sn));
  assert.deepEqual(app.topicById(maple.id).sourceSns, []);
});
