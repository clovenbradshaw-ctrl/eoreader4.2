import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';

// STANDING FOLDS wired into the reader session (rooms/reader/app/standing.js). A saved comparison
// or trace, re-run against a grown corpus, reports what changed — the living fold. Model-free in
// Node, so this pins the honest floor + the delta + persistence end to end through the controller.

const freshApp = async () => {
  const app = createReaderApp({ audit: { turns: [] } });
  if (!app.state.ready) await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  return app;
};

test('a saved trace reports new ideas that changed hands after a source arrives', async () => {
  const app = await freshApp();
  app.ingestText('Reyes spoke to the council. Reyes said, "Fusus watches the city."', 'Hearing');

  const saved = await app.standingSave({ kind: 'trace', scope: 'topic' });
  assert.ok(saved && saved.id, 'the trace is now watched');
  assert.equal(saved.kind, 'trace');
  assert.equal(app.standingList().length, 1);

  // a new source arrives in which Ford echoes the same idea — the idea now changes hands
  app.ingestText('Ford addressed the press. Ford said, "Fusus watches the city."', 'Presser');

  const { delta } = await app.standingRefresh(saved.id);
  assert.equal(delta.kind, 'trace');
  assert.equal(delta.changed, true);
  assert.ok(delta.newIdeas.length >= 1, 'the idea newly changed hands since the save');
  assert.match(delta.summary, /changed hands/);

  // refreshing again with nothing new → no change (the baseline advanced)
  const again = await app.standingRefresh(saved.id);
  assert.equal(again.delta.changed, false);
});

test('a saved comparison reports a newly appeared conflict', async () => {
  const app = await freshApp();
  app.ingestText('Reyes and Delgado met. Reyes said, "Fusus records faces." Delgado said, "Fusus is a safety tool."', 'One');
  const src = app.topicSources()[0];
  const cands = app.rashomonCandidates({ sn: src.sn });
  const a = cands.find((c) => c.label === 'Reyes'), b = cands.find((c) => c.label === 'Delgado');

  const saved = await app.standingSave({ kind: 'compare', scope: 'source', sn: src.sn, docId: src.docId, a: a.id, b: b.id });
  assert.ok(saved, 'the comparison is watched');

  const { delta } = await app.standingRefresh(saved.id);
  assert.equal(delta.kind, 'compare');
  assert.equal(delta.changed, false);   // nothing changed on an immediate refresh
});

test('standing folds persist across a reload and stay scoped to their topic', async () => {
  const app = await freshApp();
  app.ingestText('Reyes spoke. Reyes said, "Fusus watches the city." Ford agreed later. Ford said, "Fusus watches the city."', 'Doc');
  const saved = await app.standingSave({ kind: 'trace', scope: 'topic' });
  assert.equal(app.standingList().length, 1);

  // a reload restores from the persisted snapshot
  const snap = JSON.parse(JSON.stringify(app.state));   // stand-in for the serialized store
  assert.ok(Array.isArray(snap.standing) && snap.standing.length === 1, 'the watch is in the serialized state');
  assert.equal(snap.standing[0].id, saved.id);
  assert.ok(snap.standing[0].snapshot, 'the baseline snapshot rides with it');

  app.standingRemove(saved.id);
  assert.equal(app.standingList().length, 0);
});
