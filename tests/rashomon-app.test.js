import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';

// THE RASHOMON FOLD, wired into the reader session at BOTH scopes (rooms/reader/app/rashomon.js).
// The surface can ask, of one source or of the whole topic, how two figures' folds differ — where
// they agree, conflict, merely diverge, and what each names alone. Model-free here (no MiniLM in
// Node), so this pins the honest lexical floor end to end through the session controller.

const SCENE = [
  'Reyes and Delgado joined the meeting.',
  'Reyes said, "Fusus is a surveillance tool."',
  'Reyes said, "Fusus watches the city."',
  'Delgado said, "Fusus is a safety tool."',
].join(' ');

const freshApp = async () => {
  const app = createReaderApp({ audit: { turns: [] } });
  if (!app.state.ready) await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  return app;
};

test('rashomonCandidates lists the figures with a voice, by scope', async () => {
  const app = await freshApp();
  app.ingestText(SCENE, 'Council');
  const src = app.topicSources()[0];

  const perSource = app.rashomonCandidates({ sn: src.sn });
  const labels = perSource.map((c) => c.label);
  assert.ok(labels.includes('Reyes') && labels.includes('Delgado'), `both speakers offered: ${labels}`);
  assert.ok(perSource.every((c) => c.id), 'source-scope candidates carry ids for rashomonSource');
  assert.equal(perSource[0].label, 'Reyes');            // most-voiced first (two quotes)

  const perTopic = app.rashomonCandidates();
  assert.ok(perTopic.find((c) => c.label === 'Reyes')?.sources >= 1, 'topic candidates count their sources');
});

test('rashomonSource: two figures in one document, diffed', async () => {
  const app = await freshApp();
  app.ingestText(SCENE, 'Council');
  const src = app.topicSources()[0];
  const cands = app.rashomonCandidates({ sn: src.sn });
  const reyes = cands.find((c) => c.label === 'Reyes');
  const delgado = cands.find((c) => c.label === 'Delgado');

  const diff = await app.rashomonSource(src.docId, reyes.id, delgado.id);
  assert.ok(diff, 'a diff came back');
  assert.equal(diff.scope, 'source');
  assert.equal(diff.basis, 'lexical');                  // no meaning embedder warm in Node
  // Fusus is the divergent subject — both speak of it, agreeing on nothing.
  const fusus = diff.divergent.find((d) => d.subject === 'Fusus');
  assert.ok(fusus, 'Fusus diverges between the two folds');
  assert.ok(fusus.a.some((t) => /surveillance/.test(t)) && fusus.b.some((t) => /safety/.test(t)));
  // Reyes alone says Fusus watches the city.
  assert.ok(diff.onlyA.some((t) => /watches/.test(t)));
  assert.ok(!diff.onlyB.some((t) => /watches/.test(t)));
});

test('rashomonTopic: two figures across the whole topic, folded then diffed', async () => {
  const app = await freshApp();
  app.ingestText(SCENE, 'Council');
  // a second source that carries the SAME two voices with fresh claims — the topic-scope union
  app.ingestText('Reyes and Delgado spoke again. Reyes said, "Fusus scans the streets." Delgado said, "Fusus is legal."', 'Follow-up');

  const diff = await app.rashomonTopic('Reyes', 'Delgado');
  assert.ok(diff, 'a topic diff came back');
  assert.equal(diff.scope, 'topic');
  assert.ok(diff.sources.length >= 2, 'both sources contributed voices to the fold');
  // Reyes's corpus-wide fold names claims from BOTH sources (watches the city AND tracks everyone).
  const reyesLines = [...diff.onlyA, ...diff.divergent.flatMap((d) => d.a)];
  assert.ok(reyesLines.some((t) => /watches/.test(t)), 'source 1 claim present');
  assert.ok(reyesLines.some((t) => /scans/.test(t)), 'source 2 claim present — the fold is corpus-wide');
});

test('an unknown or one-sided figure yields an empty-but-shaped diff, never a throw', async () => {
  const app = await freshApp();
  app.ingestText(SCENE, 'Council');
  const diff = await app.rashomonTopic('Reyes', 'Nobody');
  assert.ok(diff && diff.scope === 'topic');
  assert.equal(diff.shared.length, 0);
  assert.equal(diff.conflict.length, 0);
});
