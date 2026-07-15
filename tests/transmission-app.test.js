import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';

// IDEA TRANSMISSION wired into the reader session at BOTH scopes (rooms/reader/app/transmission.js).
// A claim first voiced by one figure that a later figure voices too is an idea propagating through
// the cast. Model-free in Node (no MiniLM), so this pins the honest lexical floor end to end.

const freshApp = async () => {
  const app = createReaderApp({ audit: { turns: [] } });
  if (!app.state.ready) await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  return app;
};

// Reyes says it first; Ford, later in the document, comes to the same claim.
const SCENE = 'Reyes and Ford met to discuss the budget. Reyes said, "Fusus watches the city." The council listened for a while. Weeks later, Ford agreed. Ford said, "Fusus watches the city."';

test('transmissionSource: an idea traced from one voice to another in one document', async () => {
  const app = await freshApp();
  app.ingestText(SCENE, 'Council');
  const src = app.topicSources()[0];

  const t = await app.transmissionSource(src.sn);
  assert.ok(t, 'a transmission reading came back');
  assert.equal(t.scope, 'source');
  assert.equal(t.metric.basis, 'lexical');
  const idea = t.ideas.find((i) => /watches (the )?city/.test(i.text));
  assert.ok(idea, 'the shared claim is an idea that changed hands');
  assert.equal(idea.origin.label, 'Reyes');            // Reyes voices it earlier
  assert.ok(idea.hops.some((h) => h.label === 'Ford'), 'Ford is downstream');
});

test('transmissionTopic: ideas circulate across the corpus, origin earliest anywhere', async () => {
  const app = await freshApp();
  // source 1: Reyes originates the claim. source 2: Ford echoes it later in corpus time.
  app.ingestText('Reyes spoke to the council. Reyes said, "Fusus watches the city."', 'Hearing');
  app.ingestText('Ford addressed the press. Ford said, "Fusus watches the city."', 'Presser');

  const t = await app.transmissionTopic();
  assert.equal(t.scope, 'topic');
  assert.ok(t.sources.length >= 2, 'both sources are in the corpus timeline');
  const idea = t.ideas.find((i) => /watches (the )?city/.test(i.text));
  assert.ok(idea, 'the idea crossed from one source to another');
  assert.equal(idea.origin.label, 'Reyes');            // earliest voicing anywhere in the topic
  assert.ok(idea.hops.some((h) => h.label === 'Ford'));
});

test('an idea only one voice makes is not a transmission; empty is shaped, not a throw', async () => {
  const app = await freshApp();
  app.ingestText('Reyes spoke alone. Reyes said, "Fusus watches the city." Reyes said, "the vendor was hidden."', 'Solo');
  const t = await app.transmissionSource(app.topicSources()[0].sn);
  assert.ok(t && Array.isArray(t.ideas));
  assert.equal(t.ideas.length, 0, 'one voice → nothing has changed hands');
  assert.equal(t.metric.mutations, 0);
});
