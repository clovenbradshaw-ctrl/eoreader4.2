// Unit tests for the pipeline surface's node vocabulary (rooms/reader/pipeline-nodes.js) — pure,
// DOM-free, so every kind's run() is exercised here exactly as the browser graph executor calls it.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { detectMotifs, NODE_KINDS, kindOf, paramsFor } from '../src/rooms/reader/pipeline-nodes.js';

test('detectMotifs finds a phrase that repeats at least minCount times', () => {
  const text = 'the quick brown fox jumped. the quick brown fox ran. later the quick brown fox slept again.';
  const rows = detectMotifs(text, { minLen: 3, maxLen: 3, minCount: 3 });
  assert.ok(rows.some((r) => r.phrase === 'quick brown fox'), 'expected "quick brown fox" among the motifs');
  assert.ok(rows[0].count >= 3);
});

test('detectMotifs never returns a phrase starting or ending on a stopword', () => {
  const text = 'in the garden of the house in the garden of the house in the garden of the house';
  const rows = detectMotifs(text, { minCount: 2 });
  for (const r of rows) {
    const words = r.phrase.split(' ');
    assert.ok(!['the', 'of', 'in'].includes(words[0]), `leading stopword in "${r.phrase}"`);
    assert.ok(!['the', 'of', 'in'].includes(words[words.length - 1]), `trailing stopword in "${r.phrase}"`);
  }
});

test('detectMotifs returns nothing below minCount', () => {
  const rows = detectMotifs('a unique phrase that never repeats at all', { minCount: 5 });
  assert.equal(rows.length, 0);
});

const fakeApp = (overrides = {}) => ({
  sourceBySn: (sn) => (sn === 'S1' ? { sn: 'S1', title: 'Clip one', kind: 'audio', text: 'the mountain calls the mountain calls the mountain calls again', audioMeta: { peaks: [{ amp: 0.1 }, { amp: 0.9 }, { amp: 0.3 }] } } : null),
  sourceEntities: (sn) => (sn === 'S1' ? [{ label: 'Ishmael', mentions: 12, links: 3, type: 'person' }, { label: 'Ahab', mentions: 30, links: 8 }] : []),
  ingestText: (text, title) => ({ sn: 'S2', title, text }),
  ...overrides,
});

test('source kind reads the chosen source off env.app', async () => {
  const kind = kindOf('source');
  const out = await kind.run({ node: { sourceSn: 'S1' }, env: { app: fakeApp() } });
  assert.equal(out.kind, 'source');
  assert.equal(out.data.sn, 'S1');
});

test('source kind reports a friendly error when nothing is chosen yet', async () => {
  const kind = kindOf('source');
  const out = await kind.run({ node: { sourceSn: null }, env: { app: fakeApp() } });
  assert.equal(out.data, null);
  assert.ok(out.meta.error);
});

test('transcript kind surfaces the source text', async () => {
  const kind = kindOf('transcript');
  const inputs = [{ fromId: 'n1', kind: 'source', data: { sn: 'S1' } }];
  const out = await kind.run({ inputs, env: { app: fakeApp() } });
  assert.equal(out.kind, 'text');
  assert.match(out.data, /the mountain calls/);
});

test('waveform kind reads audioMeta.peaks as a plain number series', async () => {
  const kind = kindOf('waveform');
  const inputs = [{ fromId: 'n1', kind: 'source', data: { sn: 'S1' } }];
  const out = await kind.run({ inputs, env: { app: fakeApp() } });
  assert.deepEqual(out.data, [0.1, 0.9, 0.3]);
});

test('characters kind maps sourceEntities rows to label/weight', async () => {
  const kind = kindOf('characters');
  const inputs = [{ fromId: 'n1', kind: 'source', data: { sn: 'S1' } }];
  const out = await kind.run({ inputs, env: { app: fakeApp() } });
  assert.equal(out.data.length, 2);
  assert.equal(out.data.find((r) => r.label === 'Ahab').weight, 38);
});

test('motifs kind runs over an upstream text input with node params', async () => {
  const kind = kindOf('motifs');
  const inputs = [{ fromId: 'n1', kind: 'text', data: 'call me ishmael call me ishmael call me ishmael' }];
  const params = paramsFor({ params: { minCount: 2 } }, kind);
  const out = await kind.run({ inputs, params });
  assert.ok(out.data.some((r) => r.label === 'call me ishmael'));
});

test('filter-top keeps only the highest-weighted N rows', async () => {
  const kind = kindOf('filter-top');
  const inputs = [{ fromId: 'n1', kind: 'list', data: [{ label: 'a', weight: 1 }, { label: 'b', weight: 9 }, { label: 'c', weight: 5 }] }];
  const out = await kind.run({ inputs, params: { n: 2 } });
  assert.deepEqual(out.data.map((r) => r.label), ['b', 'c']);
});

test('note-out calls env.app.ingestText with a rendered payload', async () => {
  const kind = kindOf('note-out');
  const calls = [];
  const env = { app: { ingestText: (text, title) => { calls.push({ text, title }); return { sn: 'S9' }; } } };
  const inputs = [{ fromId: 'n1', kind: 'list', data: [{ label: 'motif one', count: 4 }] }];
  const out = await kind.run({ inputs, params: { title: 'My motifs' }, env });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].title, 'My motifs');
  assert.match(calls[0].text, /motif one \(4\)/);
  assert.equal(out.data.sn, 'S9');
});

test('download-out builds a csv blob text from list rows', async () => {
  const kind = kindOf('download-out');
  let captured = null;
  const env = { download: (text, mime, filename) => { captured = { text, mime, filename }; } };
  const inputs = [{ fromId: 'n1', kind: 'list', data: [{ label: 'x', weight: 1, count: 2 }] }];
  await kind.run({ inputs, params: { filename: 'out', format: 'csv' }, env });
  assert.equal(captured.mime, 'text/csv');
  assert.match(captured.text, /label,weight,count/);
  assert.equal(captured.filename, 'out.csv');
});

test('webhook-out throws without a configured URL', async () => {
  const kind = kindOf('webhook-out');
  await assert.rejects(() => kind.run({ inputs: [], params: { url: '' }, env: {} }));
});

test('webhook-out posts a JSON envelope to the configured URL', async () => {
  const kind = kindOf('webhook-out');
  let seen = null;
  const env = { fetch: async (url, opts) => { seen = { url, opts }; return { status: 200 }; } };
  const inputs = [{ fromId: 'n1', kind: 'text', data: 'hello' }];
  const out = await kind.run({ inputs, params: { url: 'https://example.test/hook', method: 'POST' }, env });
  assert.equal(seen.url, 'https://example.test/hook');
  const body = JSON.parse(seen.opts.body);
  assert.equal(body.data[0].data, 'hello');
  assert.equal(out.meta.status, 200);
});

test('touchdesigner-out flattens inputs to OSC-safe args and sends via env.sendToBridge', async () => {
  const kind = kindOf('touchdesigner-out');
  let sent = null;
  const env = { sendToBridge: async (url, msg) => { sent = { url, msg }; } };
  const inputs = [
    { fromId: 'n1', kind: 'series', data: [0.1, 0.2] },
    { fromId: 'n2', kind: 'list', data: [{ label: 'Ahab', weight: 5 }] },
  ];
  await kind.run({ inputs, params: { bridgeUrl: 'ws://127.0.0.1:8765', address: '/eo/x' }, env });
  assert.equal(sent.url, 'ws://127.0.0.1:8765');
  assert.equal(sent.msg.address, '/eo/x');
  assert.deepEqual(sent.msg.args, [0.1, 0.2, 'Ahab', 5]);
});

test('touchdesigner-out throws a clear error when no bridge transport is available', async () => {
  const kind = kindOf('touchdesigner-out');
  await assert.rejects(() => kind.run({ inputs: [], params: {}, env: {} }), /bridge/);
});
