import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';

// FRAGILITY wired into the reader session (rooms/reader/app/findings.js). Which of the record's
// disputes are load-bearing — a contested fact about a subject the rest of the record leans on is
// a wall; one about a subject barely mentioned is cheap to be wrong about. Model-free end to end.

const freshApp = async () => {
  const app = createReaderApp({ audit: { turns: [] } });
  if (!app.state.ready) await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  return app;
};

test('fragilityTopic ranks a cross-source magnitude conflict by its footprint', async () => {
  const app = await freshApp();
  // two sources disagree on how many homes the project powers — and the record leans on the project
  app.ingestText('The Riverside Solar Project powers 18000 homes. The Riverside Solar Project supplies the grid. The Riverside Solar Project cost the city dearly.', 'Ledger');
  app.ingestText('The Riverside Solar Project powers 9000 homes. The Riverside Solar Project employs local workers.', 'Audit');

  const r = await app.fragilityTopic();
  assert.ok(r, 'a fragility reading came back');
  assert.equal(r.scope, 'topic');
  assert.ok(r.sources.length >= 2);
  const wall = r.items.find((i) => /Riverside/.test(i.subject) && i.kind === 'magnitude');
  assert.ok(wall, 'the homes disagreement is surfaced as a contested claim');
  assert.match(wall.description, /homes/);
  assert.ok(wall.load >= 1, 'it is load-bearing — the record attaches other claims to the same subject');
  assert.ok(wall.dependents.length >= 1, 'and it lists what would fall with it');
});

test('fragilitySource returns a shaped ranking (a document with no tension → empty, not a throw)', async () => {
  const app = await freshApp();
  app.ingestText('The Riverside Solar Project powers homes. It supplies the grid.', 'Plain');
  const r = await app.fragilitySource(app.topicSources()[0].sn);
  assert.ok(r && r.scope === 'source');
  assert.ok(Array.isArray(r.items));
  assert.equal(typeof r.metric.contested, 'number');
});

test('a source that is not there yields null, never a throw', async () => {
  const app = await freshApp();
  assert.equal(await app.fragilitySource(9999), null);
});
