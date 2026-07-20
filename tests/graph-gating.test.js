import { test } from 'node:test';
import assert from 'node:assert/strict';

import { evalShellComponent } from './helpers/dc-shell.js';

// GRAPH GATING — an empty or uninformative graph must say so, not draw a stray/misleading node.
// The reported failures: the entity web silently mounting on zero nodes; Network drawing a lone
// "Network (not yet coherent)" node on a one-source topic (nothing to link); Crosswalk drawing
// every single-source referent as if identity had been crossed between sources, when none had.
// That wiring lives in the reader surface's Component logic (src/rooms/reader/ui/shell.logic.js)
// — pull it out and exercise the real _drawEntity/_drawNetwork/_drawCrosswalk methods against a
// stubbed app + DOM.

const Component = evalShellComponent();
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
