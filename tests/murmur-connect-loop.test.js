import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createAuditLog } from '../src/rooms/audit/index.js';
import { createMurmur } from '../src/murmur/index.js';
import { createReaderApp } from '../src/rooms/reader/app.js';

// The full connective loop, driven through the reader app (phase 4). A recurring relation read at
// two distant passages is recognized by murmur, nominated as a candidate, promoted by the idle
// gate to a grounded connection, written to the session graph, and prosified — all at rest, never
// mid-turn. This is the end-to-end the plan's verification section names, made durable.

const buildApp = async () => {
  const audit = createAuditLog({ capacity: 50 });
  let t = 1000;
  const murmur = createMurmur({ audit, now: () => (t += 1000) });
  const app = createReaderApp({ audit, murmur });
  await new Promise((r) => setTimeout(r, 30));   // let restore() settle to a fresh session
  if (!app.topicSources().length) app.topicNew('T');
  return { app, murmur };
};

// read passage A (turn 1), an unrelated passage (turn 2), then A again (turn 3) → recognition.
const drive = async (murmur, docId) => {
  const a = Float32Array.from([1, 0, 0, 0]), b = Float32Array.from([0, 1, 0, 0]);
  await murmur.observe({ ref: { turnId: 't1', docId, sentIdxs: [0], cursor: 0 }, query: 'alice', queryVec: a, readingVecs: [a], measuresMeaning: true });
  await murmur.observe({ ref: { turnId: 't2', docId, sentIdxs: [2], cursor: 2 }, query: 'weather', queryVec: b, readingVecs: [b], measuresMeaning: true });
  await murmur.observe({ ref: { turnId: 't3', docId, sentIdxs: [5], cursor: 5 }, query: 'alice again', queryVec: a, readingVecs: [a], measuresMeaning: true });
};

const RECURRING = ['Alice trusted Bob.', 'The harvest failed.', 'Rain fell.', 'Crops died.', 'Traders fretted.', 'Alice trusted Bob deeply.'];

test('connectTick promotes a recognized recurrence to a grounded connection + prose, at rest', async () => {
  const { app, murmur } = await buildApp();
  const src = app.ingestText(RECURRING.join('\n'), 'T');
  await drive(murmur, src.docId);

  assert.equal(murmur.peekNominations().length, 1, 'the echo was nominated');
  const wrote = await app.connectTick(true);
  assert.ok(wrote >= 1, 'the idle gate wrote at least the grounded connection');

  const refl = app.reflections();
  const connection = refl.find((r) => r.tier === 2 && !r.prose);
  assert.ok(connection, 'a grounded connection is recorded in the reflections drawer');
  assert.equal(connection.canWitness, false, 'surfaced as firewalled — it can never witness');
  assert.match(connection.note, /connects to an earlier passage/, 'the note names the cross-passage link');
  const prose = refl.find((r) => r.prose);
  assert.ok(prose && prose.note.trim().length > 0, 'the connection is prosified (model-free when no LLM is warm)');

  assert.equal(await app.connectTick(true), 0, 'the queue is drained — a second pass writes nothing');
});

test('the idle gate never runs mid-turn (busy blocks it, and does not drain the queue)', async () => {
  const { app, murmur } = await buildApp();
  const src = app.ingestText(RECURRING.join('\n'), 'T');
  await drive(murmur, src.docId);
  assert.equal(murmur.peekNominations().length, 1, 'a candidate is pending');

  app.state.busy = { kind: 'answer', label: 'decoding' };   // a turn is decoding
  const wrote = await app.connectTick(false);               // the governed (non-manual) pass
  assert.equal(wrote, 0, 'engaged → the connective pass yields to the turn');
  assert.equal(murmur.peekNominations().length, 1, 'and it did not drain the queue while blocked');

  app.state.busy = null;
  assert.ok((await app.connectTick(false)) >= 1, 'once at rest, the pending connection is written');
});
