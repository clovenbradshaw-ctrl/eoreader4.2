import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';

// TOPICS ARE SILOS (rooms/reader/app.js) — a topic scopes a source set, a chat and a memo,
// and the entity explorer derives from the ACTIVE topic's sources alone. So a fresh topic
// opens with no entities, whatever the record already holds; switching back finds them
// again untouched. The surface leans on the 'topics' emit to drop its cached entity list,
// so that fan-out is pinned here too.

const STORY = 'Anna Vale trusted Ben Cole. Anna spoke to Ben in the hall. ' +
  'Grete Vale visited Gregor Pike. Grete carried a bowl. Gregor thanked Grete. ' +
  'Anna met Grete at noon. Ben watched Gregor.';

const OTHER = 'Kepler studied the orbit of Mars. Brahe kept the observations. ' +
  'Kepler wrote to Brahe about the ellipse. Brahe doubted Kepler.';

// restore() creates the first topic on a microtask; wait for `ready` before recording.
const freshApp = async () => {
  const app = createReaderApp({ audit: { turns: [] } });
  if (!app.state.ready) {
    await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  }
  return app;
};

test('a new topic opens with no sources and no entities — the record does not bleed in', async () => {
  const app = await freshApp();
  app.ingestText(STORY, 'The hall');
  assert.ok(app.entities().length > 0, 'the first topic has its figures');

  app.topicNew('Second topic');
  assert.equal(app.topic().title, 'Second topic', 'the new topic is active');
  assert.equal(app.topicSources().length, 0, 'no sources scoped to the fresh topic');
  assert.equal(app.entities().length, 0, 'no entities — the silo holds');
});

test('switching back restores the first topic\'s entities untouched', async () => {
  const app = await freshApp();
  app.ingestText(STORY, 'The hall');
  const before = app.entities().map((e) => e.key).sort();
  const first = app.topic().id;

  app.topicNew('Second topic');
  app.setTopic(first);
  const after = app.entities().map((e) => e.key).sort();
  assert.deepEqual(after, before, 'the first topic\'s entity set survives the round trip');
});

test('a source recorded in the new topic stays there — the old topic is unchanged', async () => {
  const app = await freshApp();
  app.ingestText(STORY, 'The hall');
  const first = app.topic().id;
  const firstKeys = app.entities().map((e) => e.key).sort();

  app.topicNew('Second topic');
  app.ingestText(OTHER, 'The orbit');
  assert.equal(app.topicSources().length, 1, 'the record lands in the active topic');
  assert.ok(app.entities().some((e) => /kepler/i.test(e.label)), 'the new topic reads its own figures');
  assert.ok(!app.entities().some((e) => /anna/i.test(e.label)), 'none of the first topic\'s figures leak in');

  app.setTopic(first);
  assert.deepEqual(app.entities().map((e) => e.key).sort(), firstKeys, 'the first topic did not grow');
});

test("topic changes fan out as 'topics' — the surface's cue to drop its entity cache", async () => {
  const app = await freshApp();
  const kinds = [];
  app.subscribe((k) => kinds.push(k));

  app.topicNew('Second topic');
  assert.ok(kinds.includes('topics'), 'topicNew announces itself');

  kinds.length = 0;
  app.setTopic(app.state.topics[0].id);
  assert.ok(kinds.includes('topics'), 'setTopic announces itself');
});
