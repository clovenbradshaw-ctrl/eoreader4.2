import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// GRAPH GATING — an empty or uninformative graph must say so, not draw a stray/misleading node.
// The reported failures: the entity web silently mounting on zero nodes; Network drawing a lone
// "Network (not yet coherent)" node on a one-source topic (nothing to link); Crosswalk drawing
// every single-source referent as if identity had been crossed between sources, when none had.
// That wiring lives in the dc app script inside index.html — pull it out and exercise the real
// _drawEntity/_drawNetwork/_drawCrosswalk methods against a stubbed app + DOM.

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
const block = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/);
assert.ok(block, 'the dc app script is present in index.html');
const Component = (() => {
  class DCLogic { constructor() {} setState() {} subscribe() { return () => {}; } }
  return new Function('DCLogic', block[1] + '\nreturn Component;')(DCLogic);
})();
const proto = Component.prototype;

const withMountStub = (fn) => {
  const calls = [];
  const prevWindow = globalThis.window;
  globalThis.window = { EO: { mountTieredGraph: (el, opts) => { calls.push(opts); return { destroy() {} }; } } };
  try { return { calls, result: fn() }; } finally { globalThis.window = prevWindow; }
};

test('_drawEntity: an empty topic shows an explanatory message, never a bare empty mount', () => {
  const el = { innerHTML: '' };
  const ctx = { _app: { topicTieredData: () => ({ nodes: [], edges: [] }) }, setState() {} };
  const { calls } = withMountStub(() => proto._drawEntity.call(ctx, el, {}));
  assert.equal(calls.length, 0, 'mountTieredGraph is never called on empty data');
  assert.match(el.innerHTML, /No figures read yet/);
  assert.deepEqual(ctx._tgToggles, []);
});

test('_drawEntity: real data still draws normally (the gate does not block a populated web)', () => {
  const el = { innerHTML: '' };
  const nodes = [{ id: 'e1', kind: 'entity', label: 'Ada' }];
  const ctx = {
    _app: { topicTieredData: () => ({ nodes, edges: [] }) },
    _filterTiered: proto._filterTiered,
    setState() {},
  };
  const { calls } = withMountStub(() => proto._drawEntity.call(ctx, el, {}));
  assert.equal(calls.length, 1, 'mountTieredGraph draws once real nodes exist');
  assert.equal(calls[0].nodes.length, 1);
});

test('_drawNetwork: no corroborating link shows an explanatory message, not a lone stray node', () => {
  const el = { innerHTML: '' };
  // networkGraphData's own shape for "nothing links": just the synthetic network node, no links.
  const ctx = {
    _app: { networkTieredData: () => ({ nodes: [{ id: 'net', kind: 'network', label: 'Network (not yet coherent)' }], edges: [] }) },
    setState() {},
  };
  const { calls } = withMountStub(() => proto._drawNetwork.call(ctx, el, {}));
  assert.equal(calls.length, 0, 'mountTieredGraph is never called when nothing actually links');
  assert.match(el.innerHTML, /Network needs at least two sources/);
  assert.deepEqual(ctx._tgToggles, []);
});

test('_drawNetwork: an actual corroboration link draws normally', () => {
  const el = { innerHTML: '' };
  const data = {
    nodes: [
      { id: 's1', kind: 'source', label: 'Source A' }, { id: 's2', kind: 'source', label: 'Source B' },
      { id: 'link1', kind: 'link', label: 'Source A ↔ Source B' },
      { id: 'net', kind: 'network', label: 'Network · 1 link' },
    ],
    edges: [{ a: 's1', b: 'link1' }, { a: 's2', b: 'link1' }, { a: 'link1', b: 'net' }],
  };
  const ctx = { _app: { networkTieredData: () => data }, _filterNetwork: proto._filterNetwork, setState() {} };
  const { calls } = withMountStub(() => proto._drawNetwork.call(ctx, el, {}));
  assert.equal(calls.length, 1, 'mountTieredGraph draws once a real link exists');
});

test('_drawCrosswalk: a referent confined to one source shows an explanatory message', () => {
  const el = { innerHTML: '' };
  // Every entity here has exactly ONE tier-0 source→entity edge — nothing actually crossed.
  const data = {
    nodes: [{ id: 'src:1', kind: 'source', label: 'S1' }, { id: 'xref-1', kind: 'entity', label: 'Solo Referent' }],
    edges: [{ a: 'src:1', b: 'xref-1', tier: 0, code: 'INS' }],
  };
  const ctx = { _app: { crosswalkTieredData: () => data }, setState() {} };
  const { calls } = withMountStub(() => proto._drawCrosswalk.call(ctx, el, {}));
  assert.equal(calls.length, 0, 'mountTieredGraph is never called when no referent is actually corroborated across sources');
  assert.match(el.innerHTML, /Crosswalk needs a referent that shows up in more than one source/);
  assert.deepEqual(ctx._tgToggles, []);
});

test('_drawCrosswalk: a referent corroborated by two sources draws normally', () => {
  const el = { innerHTML: '' };
  const data = {
    nodes: [
      { id: 'src:1', kind: 'source', label: 'S1' }, { id: 'src:2', kind: 'source', label: 'S2' },
      { id: 'xref-1', kind: 'entity', label: 'Crossed Referent' },
    ],
    edges: [
      { a: 'src:1', b: 'xref-1', tier: 0, code: 'INS' },
      { a: 'src:2', b: 'xref-1', tier: 0, code: 'INS' },
    ],
  };
  const ctx = { _app: { crosswalkTieredData: () => data }, _filterTiered: proto._filterTiered, setState() {} };
  const { calls } = withMountStub(() => proto._drawCrosswalk.call(ctx, el, {}));
  assert.equal(calls.length, 1, 'mountTieredGraph draws once a referent is genuinely corroborated across two sources');
});

// A wide corpus — 25 crossed referents sharing the same two sources — the reported hairball
// shape (2,121 nodes in the live app). Crosswalk must cap the default draw and let a search
// isolate its matches instead of only narrowing the sidebar checklist while the canvas kept
// drawing everything.
const wideCrosswalkData = () => {
  const nodes = [{ id: 'src:1', kind: 'source', label: 'S1' }, { id: 'src:2', kind: 'source', label: 'S2' }];
  const edges = [];
  for (let i = 0; i < 25; i++) {
    const id = `xref-${String(i).padStart(2, '0')}`;
    nodes.push({ id, kind: 'entity', label: `Referent ${String(i).padStart(2, '0')}`, ref: { docId: 'd', entId: id } });
    edges.push({ a: 'src:1', b: id, tier: 0, code: 'INS' }, { a: 'src:2', b: id, tier: 0, code: 'INS' });
  }
  return { nodes, edges };
};

test('_drawCrosswalk: defaults to the 20 most-corroborated referents, not the whole corpus', () => {
  const el = { innerHTML: '' };
  const ctx = { _app: { crosswalkTieredData: wideCrosswalkData }, _filterTiered: proto._filterTiered, state: {}, setState() {} };
  const { calls } = withMountStub(() => proto._drawCrosswalk.call(ctx, el, {}));
  assert.equal(ctx._tgToggles.length, 20, 'the checklist caps at 20 referents by default');
  assert.equal(calls.length, 1);
  const drawnEntities = calls[0].nodes.filter((n) => n.kind === 'entity');
  assert.equal(drawnEntities.length, 20, 'the DRAWN graph is capped too, not just the sidebar list');
  assert.equal(ctx._crosswalkTotal, 25);
});

test('_drawCrosswalk: a search query isolates its matches on the canvas, not only the checklist', () => {
  const el = { innerHTML: '' };
  const ctx = { _app: { crosswalkTieredData: wideCrosswalkData }, _filterTiered: proto._filterTiered, state: {}, setState() {} };
  const { calls } = withMountStub(() => proto._drawCrosswalk.call(ctx, el, { query: 'Referent 07' }));
  assert.equal(ctx._tgToggles.length, 1, 'the checklist narrows to the one match');
  const drawnEntities = calls[0].nodes.filter((n) => n.kind === 'entity');
  assert.equal(drawnEntities.length, 1, 'the drawn graph narrows to the match too — not the full 25-referent corpus');
  assert.equal(drawnEntities[0].label, 'Referent 07');
});
