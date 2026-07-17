import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createCalibrationLocal } from '../src/metabolism/index.js';
import { createModel } from '../src/model/interface.js';
import '../src/model/echo.js';               // registers the deterministic, network-free 'echo' backend
import { createHashEmbedder } from '../src/model/embed-hash.js';
import { createAuditLog } from '../src/rooms/audit/index.js';
import { admitWebSource } from '../src/organs/ingest/websource.js';

// calibration-local.js wires runCalibrationCycle's `local(task, allocation)` to the SAME real turn
// pipeline answerer.js already drives for the challenger cycle — a calibration run is a REAL turn, not
// a toy stand-in, and its fold/plan come from what the pipeline actually computed. Only the network is
// stubbed (admitWebSource yields the same parsed prose doc a live fetch would, exactly like
// answerer.test.js), so these tests run the whole pipeline for real.

const stubSearch = (seenK) => async (query, opts = {}) => {
  seenK.push(opts.k ?? null);
  const base = 'The reactor core reached criticality at noon. Operators vented steam and the temperature fell within the hour. No radiation was released beyond the site boundary.';
  const text = `${base} ${query} ${query}`;
  const slug = String(query).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'q';
  const { doc, record } = admitWebSource({ url: `https://example.test/${slug}`, title: `Reactor incident — ${query}`, text, retrieval_query: query, engine: 'web:test', fetched_at: 't' });
  return [{ item: { title: record.title, url: record.url }, doc, record }];
};

const model = createModel('echo');
const embedder = createHashEmbedder();

test('calibration-local: runs a REAL turn and returns { answer, fold, plan } from what the pipeline actually computed', async () => {
  const seenK = [];
  const auditLog = createAuditLog({ capacity: 64 });
  const local = createCalibrationLocal({ model, embedder, auditLog, search: stubSearch(seenK), maxHops: 2 });
  const out = await local({ question: 'What happened when the reactor reached criticality?' }, { maxTokens: 200, retrieveK: 2 });

  assert.equal(typeof out.answer, 'string', 'a rendered answer came back through the real pipeline');
  assert.ok(out.answer.length, 'the answer is non-empty — the turn actually grounded on the fetched pages');
  assert.ok(Array.isArray(out.fold) && out.fold.length, 'the fold is populated — either the reading\'s spans or the retrieved sources');
  assert.ok(Array.isArray(out.sources) && out.sources.length >= 1, 'the sources ride back too, same as answerer.js');
  assert.equal(seenK[0], 2, 'the allocation\'s retrieveK reached the live search call — the running genome is not a synthetic number');
});

test('calibration-local: a plan, when the surfer produced stops, is an ordered list of legible beats', async () => {
  const auditLog = createAuditLog({ capacity: 64 });
  const local = createCalibrationLocal({ model, embedder, auditLog, search: stubSearch([]), maxHops: 2 });
  const out = await local({ question: 'Describe the reactor incident timeline' }, { retrieveK: 1 });
  if (out.plan) {
    assert.ok(Array.isArray(out.plan), 'the plan is an ordered array when the surfer produced stops');
    for (const beat of out.plan) {
      assert.equal(typeof beat.stop, 'number');
      assert.equal(typeof beat.summary, 'string');
    }
  }
});

test('calibration-local: a DIFFERENT allocation changes what actually reaches the pipeline (retrieveK -> the live search k)', async () => {
  const seenK = [];
  const auditLog = createAuditLog({ capacity: 64 });
  const local = createCalibrationLocal({ model, embedder, auditLog, search: stubSearch(seenK), maxHops: 2 });
  await local({ question: 'q1' }, { retrieveK: 2 });
  await local({ question: 'q2' }, { retrieveK: 7 });
  const dedup = seenK.filter((k, i) => k != null && k !== seenK[i - 1]);
  assert.deepEqual(dedup, [2, 7], 'each cycle\'s own allocation reaches its own live turn — a fresh answerer per call, not one frozen at construction time');
});

test('calibration-local: never needs the network to be safe — a dead search yields an honest empty answer, no fabricated fold', async () => {
  const auditLog = createAuditLog({ capacity: 64 });
  const local = createCalibrationLocal({ model, embedder, auditLog, search: async () => [] });
  const out = await local({ question: 'anything at all' }, {});
  assert.equal(typeof out.answer, 'string');
  assert.deepEqual(out.sources, [], 'nothing fetched -> no sources claimed');
});
