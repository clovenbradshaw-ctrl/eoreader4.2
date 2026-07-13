import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';
import { createAuditLog } from '../src/rooms/audit/index.js';
import { registerBackend } from '../src/model/interface.js';

// ONE GROUNDED QUESTION PER TOPIC (rooms/reader/app.js `askQuestion`, index.html sendChat).
// The engine answers a single grounded question or abstains; a back-and-forth thread is what it
// does worst. So the Ask surface poses one question per topic: the FIRST question fills the current
// (still question-less) topic in place, and every question AFTER opens a CHILD topic beneath it —
// inheriting the parent's sources so the record is unchanged — rather than accreting a thread. This
// pins the topic tree that behaviour produces, headlessly (the surface that calls it is not tested).

// A blind fake backend: reads every turn as factual, answers plainly. We only assert on topic
// STRUCTURE here, so the answer text is immaterial — the turn just has to settle.
registerBackend('topic-per-question-fake', () => ({
  id: 'topic-per-question-fake', kind: 'local', isLoaded: () => true,
  describe: () => ({ backend: 'topic-per-question-fake', kind: 'local', model: 'fake', label: 'fake' }),
  async load(onProgress) { onProgress?.({ phase: 'ready', pct: 1 }); },
  async phrase() { return 'A plain grounded sentence.'; },
}));

const freshApp = async () => {
  const app = createReaderApp({ audit: createAuditLog({ capacity: 64 }) });
  if (!app.state.ready) {
    await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  }
  app.setBackend('topic-per-question-fake');
  app.setWebMode('off');
  return app;
};

test('the first question fills the current topic in place — no child, no orphan placeholder', async () => {
  const app = await freshApp();
  const before = app.state.topics.length;
  const startId = app.topic().id;

  await app.askQuestion('what does the record say about dolphins?', { web: 'off' });

  assert.equal(app.state.topics.length, before, 'no new topic was opened for the first question');
  assert.equal(app.topic().id, startId, 'the active topic is still the one the question was asked in');
  assert.ok(app.topic().messages.some((m) => m.role === 'user'), 'the topic now holds the question');
});

test('a second question opens a CHILD topic under the first, and becomes active', async () => {
  const app = await freshApp();
  await app.askQuestion('first question about the record?', { web: 'off' });
  const parent = app.topic();
  const parentId = parent.id;

  await app.askQuestion('a follow-up question?', { web: 'off' });
  const child = app.topic();

  assert.notEqual(child.id, parentId, 'the follow-up did not stay in the parent topic');
  assert.equal(child.parentId, parentId, 'the new topic is nested UNDER the topic it followed');
  assert.equal(child.workspaceId, parent.workspaceId, 'the child stays in the same workspace');
  // the parent keeps its own clean question-and-answer, untouched by the follow-up
  assert.equal(parent.messages.filter((m) => m.role === 'user').length, 1, 'the parent still holds exactly its one question');
});

test('a child question INHERITS the parent topic\'s sources — it reads the same record', async () => {
  const app = await freshApp();
  app.ingestText('Dolphins are marine mammals in the cetacean family. They are highly social.', 'On dolphins');
  const parent = app.topic();
  assert.equal(parent.sourceSns.length, 1, 'the source landed in the parent topic');

  await app.askQuestion('what is a dolphin?', { web: 'off' });   // first question fills the parent in place
  await app.askQuestion('are they social?', { web: 'off' });     // second opens the child

  const child = app.topic();
  assert.notEqual(child.id, parent.id, 'the follow-up opened a child');
  assert.deepEqual(child.sourceSns, parent.sourceSns, 'the child inherited the exact same sources');
});

test('each question-topic auto-names itself from its own question', async () => {
  const app = await freshApp();
  await app.askQuestion('who is the president?', { web: 'off' });
  const parent = app.topic();
  await app.askQuestion('who was before them?', { web: 'off' });
  const child = app.topic();

  assert.match(parent.title, /president/i, 'the parent is named from its question');
  assert.match(child.title, /before/i, 'the child is named from its own question, not the parent\'s');
});
