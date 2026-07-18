// Unit tests for the pipeline surface's graph engine (rooms/reader/pipeline-engine.js) — the CRUD
// + topological executor a saved surface runs through. Uses an in-memory storage stub (no
// localStorage in Node) and a fake `app` standing in for window.EO.app.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createPipelineEngine, runGraph } from '../src/rooms/reader/pipeline-engine.js';

const memStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};

const fakeApp = () => ({
  sourceBySn: (sn) => (sn === 'S1' ? { sn: 'S1', title: 'Moby-Dick', kind: 'text', text: 'call me ishmael call me ishmael call me ishmael twice over' } : null),
  sourceEntities: () => [{ label: 'Ishmael', mentions: 5, links: 1 }],
  workspaceSources: () => [{ sn: 'S1', title: 'Moby-Dick', kind: 'text' }],
  ingestText: (text, title) => ({ sn: 'S9', title, text }),
});

test('createPipelineEngine: create, addNode, connect, and run a real chain end to end', async () => {
  const engine = createPipelineEngine({ app: fakeApp(), storage: memStorage() });
  const g = engine.create('Test surface');
  const src = engine.addNode(g.id, 'source', { x: 0, y: 0, sourceSn: 'S1' });
  const txt = engine.addNode(g.id, 'transcript', { x: 100, y: 0 });
  const motifs = engine.addNode(g.id, 'motifs', { x: 200, y: 0 });
  engine.setParams(g.id, [motifs.id], { minCount: 2 });
  engine.connect(g.id, src.id, txt.id);
  engine.connect(g.id, txt.id, motifs.id);

  const result = await engine.run(g.id);
  assert.equal(result.cyclic.length, 0);
  assert.ok(result.statusById[src.id].ok);
  assert.ok(result.statusById[txt.id].ok);
  assert.ok(result.statusById[motifs.id].ok);
  assert.ok(result.statusById[motifs.id].meta.count >= 1, 'motifs node should have found at least one repeated phrase');
});

test('setParams applies the same patch to a whole series of selected nodes at once', () => {
  const engine = createPipelineEngine({ app: fakeApp(), storage: memStorage() });
  const g = engine.create('Batch test');
  const a = engine.addNode(g.id, 'motifs', {});
  const b = engine.addNode(g.id, 'motifs', {});
  const c = engine.addNode(g.id, 'filter-top', {});   // a different kind — untouched by the shared patch
  engine.setParams(g.id, [a.id, b.id], { minCount: 7 });
  const stored = engine.get(g.id);
  assert.equal(stored.nodes.find((n) => n.id === a.id).params.minCount, 7);
  assert.equal(stored.nodes.find((n) => n.id === b.id).params.minCount, 7);
  assert.equal(stored.nodes.find((n) => n.id === c.id).params.minCount, undefined);
});

test('removeNode also drops any edge touching it', () => {
  const engine = createPipelineEngine({ app: fakeApp(), storage: memStorage() });
  const g = engine.create('Prune test');
  const a = engine.addNode(g.id, 'source', { sourceSn: 'S1' });
  const b = engine.addNode(g.id, 'transcript', {});
  engine.connect(g.id, a.id, b.id);
  engine.removeNode(g.id, a.id);
  const stored = engine.get(g.id);
  assert.equal(stored.nodes.length, 1);
  assert.equal(stored.edges.length, 0);
});

test('persistence: a second engine instance over the same storage sees the saved graph', () => {
  const storage = memStorage();
  const e1 = createPipelineEngine({ app: fakeApp(), storage });
  const g = e1.create('Persisted');
  e1.addNode(g.id, 'source', { sourceSn: 'S1' });

  const e2 = createPipelineEngine({ app: fakeApp(), storage });
  const reloaded = e2.get(g.id);
  assert.ok(reloaded);
  assert.equal(reloaded.nodes.length, 1);
});

test('runGraph: a cycle leaves its members unreached rather than hanging', async () => {
  const graph = {
    nodes: [
      { id: 'a', kind: 'motifs', params: {} },
      { id: 'b', kind: 'filter-top', params: {} },
    ],
    edges: [{ id: 'e1', from: 'a', to: 'b' }, { id: 'e2', from: 'b', to: 'a' }],
  };
  const result = await runGraph(graph, {});
  assert.deepEqual(new Set(result.cyclic), new Set(['a', 'b']));
  assert.equal(result.statusById.a.ok, false);
  assert.equal(result.statusById.b.ok, false);
});

test('runGraph: an unknown node kind fails just that node, not the whole run', async () => {
  const graph = {
    nodes: [
      { id: 'a', kind: 'source', sourceSn: 'S1', params: {} },
      { id: 'b', kind: 'not-a-real-kind', params: {} },
    ],
    edges: [],
  };
  const result = await runGraph(graph, { app: fakeApp() });
  assert.equal(result.statusById.a.ok, true);
  assert.equal(result.statusById.b.ok, false);
  assert.match(result.statusById.b.error, /unknown node kind/);
});

test('runGraph: an output node fed by two upstream branches sees both', async () => {
  const graph = {
    nodes: [
      { id: 'src', kind: 'source', sourceSn: 'S1', params: {} },
      { id: 'chars', kind: 'characters', params: {} },
      { id: 'txt', kind: 'transcript', params: {} },
      { id: 'hook', kind: 'webhook-out', params: { url: 'https://example.test/x' } },
    ],
    edges: [
      { id: 'e1', from: 'src', to: 'chars' },
      { id: 'e2', from: 'src', to: 'txt' },
      { id: 'e3', from: 'chars', to: 'hook' },
      { id: 'e4', from: 'txt', to: 'hook' },
    ],
  };
  let posted = null;
  const env = { app: fakeApp(), fetch: async (url, opts) => { posted = JSON.parse(opts.body); return { status: 200 }; } };
  const result = await runGraph(graph, env);
  assert.equal(result.statusById.hook.ok, true);
  assert.equal(posted.data.length, 2);
});
