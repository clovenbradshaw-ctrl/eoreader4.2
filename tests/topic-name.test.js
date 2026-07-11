import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deriveTopicTitle, titleFromQuestion, titleFromSource, isDefaultTopicTitle, DEFAULT_TOPIC_TITLE } from '../src/rooms/reader/topic-name.js';
import { createReaderApp } from '../src/rooms/reader/app.js';
import { registerBackend } from '../src/model/interface.js';

// TOPICS NAME THEMSELVES (rooms/reader/topic-name.js + app.js topicAutoName). A fresh
// topic is born "New topic" — a placeholder, not a name. The moment it holds content it
// takes a title derived from it: the first user question, else the first source's title.
// A manual rename pins the title for good; the placeholder regex also accepts the
// numbered variants older sessions produced, so a restore backfills those too.

// ── the pure derivation ───────────────────────────────────────────────────────

test('the placeholder is recognized in all its variants', () => {
  assert.ok(isDefaultTopicTitle('New topic'));
  assert.ok(isDefaultTopicTitle('new topic'));
  assert.ok(isDefaultTopicTitle('New topic 8'), 'the numbered legacy variant counts');
  assert.ok(!isDefaultTopicTitle('Bryan Berg'));
  assert.ok(!isDefaultTopicTitle(''));
  assert.equal(DEFAULT_TOPIC_TITLE, 'New topic');
});

test('a question becomes a title: lead-ins shed, punctuation dropped, capitalized', () => {
  assert.equal(titleFromQuestion('hey, can you please tell me about Bryan Berg?'), 'Bryan Berg');
  assert.equal(titleFromQuestion('whats the news today?'), 'Whats the news today');
  assert.equal(titleFromQuestion('  how tall is the Burj Khalifa??  '), 'How tall is the Burj Khalifa');
  assert.equal(titleFromQuestion(''), null);
  assert.equal(titleFromQuestion('   '), null);
});

test('a long question clips on a word boundary with an ellipsis', () => {
  const t = titleFromQuestion('what is the tallest building in the United States and who was its structural engineer?');
  assert.ok(t.length <= 49, `clipped (got ${t.length}: "${t}")`);
  assert.ok(t.endsWith('…'), 'the cut is marked');
  assert.ok(!/\s…$/.test(t), 'no dangling space before the ellipsis');
  assert.ok(t.startsWith('What is the tallest building'), 'the head survives');
});

test('a question that is ONLY a lead-in keeps its own words rather than vanishing', () => {
  assert.equal(titleFromQuestion('can you help?'), 'Help', 'the "can you" sheds but the ask remains');
});

test('a source title is tidied and clipped; non-names are refused', () => {
  assert.equal(titleFromSource('List of tallest buildings in the United States'),
    'List of tallest buildings in the United States');
  assert.equal(titleFromSource('  Bryan   Berg '), 'Bryan Berg');
  assert.equal(titleFromSource('Untitled'), null, '"Untitled" is not a name');
  assert.equal(titleFromSource('Pasted text'), null, 'the paste fallback is not a name');
  assert.equal(titleFromSource('https://example.com/page'), null, 'a bare URL is not a name');
});

test('derivation prefers the first question over the first source', () => {
  const messages = [
    { role: 'assistant', text: 'welcome' },
    { role: 'user', text: 'who builds card towers?' },
    { role: 'user', text: 'a later question' },
  ];
  const sources = [{ title: 'Bryan Berg' }, { title: 'Card stacking' }];
  assert.equal(deriveTopicTitle({ messages, sources }), 'Who builds card towers');
  assert.equal(deriveTopicTitle({ messages: [], sources }), 'Bryan Berg', 'no question — the first source names it');
  assert.equal(deriveTopicTitle({ messages: [], sources: [{ title: 'Untitled' }, { title: 'Card stacking' }] }),
    'Card stacking', 'a non-name source is skipped, not settled for');
  assert.equal(deriveTopicTitle({}), null, 'nothing to name from keeps the placeholder');
});

// ── the app applying it ───────────────────────────────────────────────────────

// A one-line instant backend so a turn over docs settles quickly in Node.
registerBackend('title-stub', () => ({
  id: 'title-stub', kind: 'local', isLoaded: () => true,
  describe: () => ({ backend: 'title-stub', kind: 'local', model: 'title-stub', label: 'stub' }),
  async load(onProgress) { onProgress?.({ phase: 'ready', pct: 1 }); },
  async phrase() { return 'Anna Vale trusted Ben Cole.'; },
}));

const STORY = 'Anna Vale trusted Ben Cole. Anna spoke to Ben in the hall. ' +
  'Grete Vale visited Gregor Pike. Grete carried a bowl. Gregor thanked Grete.';

// restore() sets up the seed workspace + first topic on a microtask; wait for `ready`.
const freshApp = async () => {
  const app = createReaderApp({ audit: { turns: [] } });
  if (!app.state.ready) {
    await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  }
  app.setBackend('title-stub');
  if (app.setWebMode) app.setWebMode('off');   // no network in Node
  return app;
};

test('the first source names a placeholder topic', async () => {
  const app = await freshApp();
  assert.equal(app.topic().title, 'New topic', 'born as the placeholder');
  app.ingestText(STORY, 'The hall');
  assert.equal(app.topic().title, 'The hall', 'the first source named it');
  app.ingestText('Kepler studied the orbit of Mars.', 'The orbit');
  assert.equal(app.topic().title, 'The hall', 'a second source does not rename it');
});

test('the first question names a placeholder topic, and outranks a source name later', async () => {
  const app = await freshApp();
  const asked = app.ask('who trusted Ben Cole?').catch(() => {});
  assert.equal(app.topic().title, 'Who trusted Ben Cole', 'named synchronously, before the turn runs');
  await asked;

  // A topic named from its source upgrades to the first question when one arrives —
  // the question says what the topic is ABOUT, the source only what it reads.
  app.topicNew();
  app.ingestText(STORY, 'The hall');
  assert.equal(app.topic().title, 'The hall');
  const asked2 = app.ask('what did Grete carry?').catch(() => {});
  assert.equal(app.topic().title, 'What did Grete carry', 'the question outranks the source name');
  await asked2;
});

test('a manual rename pins the title against auto-naming', async () => {
  const app = await freshApp();
  app.topicRename(app.topic().id, 'My research');
  app.ingestText(STORY, 'The hall');
  assert.equal(app.topic().title, 'My research', 'the source does not overwrite the rename');
  const asked = app.ask('who spoke in the hall?').catch(() => {});
  assert.equal(app.topic().title, 'My research', 'nor does the question');
  await asked;
});

test('a topic created with a real title is treated as named from birth', async () => {
  const app = await freshApp();
  app.topicNew('Card towers');
  app.ingestText(STORY, 'The hall');
  assert.equal(app.topic().title, 'Card towers', 'the chosen name holds');
});
