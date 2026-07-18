import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildScene, renderToContainer } from '../src/surfaces/operator-clock/render.js';
import { HELIX } from '../src/core/contract.js';

// A hand-built FoldTrace (not run through buildFoldTrace) so these tests exercise
// the CLOCK's own decisions (which spoke lights, the REC notch) in isolation —
// same discipline as tests/waveform-render.test.js's hand-built WaveformModel.
const makeTrace = () => ([
  { order_index: 0, pos_start: 0, pos_end: 1, ops_fired: 'SYN', site: 'Field', stance: 'Cultivating', address: 'SYN(Field, Cultivating)', accepted: false, reject_reason: 'desert-cell', cooked_height: 0, rec_fired: false, discard_refs: 0, reading_id: 'd' },
  { order_index: 1, pos_start: 1, pos_end: 2, ops_fired: 'INS,EVA', site: 'Entity', stance: 'Making', address: 'INS(Entity, Making)', accepted: true, reject_reason: null, cooked_height: 0.4, rec_fired: false, discard_refs: null, reading_id: 'd' },
  { order_index: 2, pos_start: 2, pos_end: 3, ops_fired: 'REC', site: 'Paradigm', stance: 'Composing', address: 'REC(Paradigm, Composing)', accepted: true, reject_reason: null, cooked_height: 0.9, rec_fired: true, discard_refs: null, reading_id: 'd' },
]);

test('buildScene: exactly nine spokes, one per HELIX operator, in HELIX order', () => {
  const scene = buildScene(makeTrace(), { pos: 1 });
  assert.equal(scene.n, 9);
  assert.deepEqual(scene.spokes.map((s) => s.op), HELIX);
});

test('buildScene: lights exactly the ops_fired of the fold nearest pos, nothing else', () => {
  const scene = buildScene(makeTrace(), { pos: 1 });
  const lit = scene.spokes.filter((s) => s.lit).map((s) => s.op);
  assert.deepEqual(lit.sort(), ['EVA', 'INS'].sort());
  assert.equal(scene.fold.address, 'INS(Entity, Making)');
  assert.equal(scene.fold.accepted, true);
});

test('buildScene: a rejected fold surfaces its reject_reason on the scene', () => {
  const scene = buildScene(makeTrace(), { pos: 0 });
  assert.equal(scene.fold.accepted, false);
  assert.equal(scene.fold.reject_reason, 'desert-cell');
});

test('buildScene: rec_fired marks the REC spoke for a break, never a plain lit spoke', () => {
  const scene = buildScene(makeTrace(), { pos: 2 });
  const rec = scene.spokes.find((s) => s.op === 'REC');
  assert.equal(rec.lit, true);
  assert.equal(rec.rec, true, 'REC must carry its own break flag, not just "lit"');
  const others = scene.spokes.filter((s) => s.op !== 'REC');
  assert.ok(others.every((s) => !s.rec), 'no non-REC spoke is ever marked as a break');
});

test('buildScene: an empty trace scenes to no fold, no spoke lit', () => {
  const scene = buildScene([], { pos: 0 });
  assert.equal(scene.fold, null);
  assert.ok(scene.spokes.every((s) => !s.lit));
});

// ---- the DOM adapter, against a minimal fake document (no jsdom dependency in
// this tree — the same discipline render.strict.js's own tests would need if they
// exercised renderToContainer directly; here we hand-roll the same tiny fake).
const fakeDoc = () => {
  const mk = () => {
    const node = {
      attrs: {}, children: [], listeners: {}, textContent: '',
      setAttribute(k, v) { this.attrs[k] = String(v); },
      appendChild(c) { this.children.push(c); return c; },
      addEventListener(evt, fn) { (this.listeners[evt] ||= []).push(fn); },
      get firstChild() { return this.children[0] || null; },
      removeChild(c) { this.children = this.children.filter((x) => x !== c); },
    };
    return node;
  };
  return { createElementNS: () => mk() };
};

test('renderToContainer: paints one spoke line + one label per operator, plus the ring', () => {
  const el = { children: [], appendChild(c) { this.children.push(c); return c; }, get firstChild() { return this.children[0] || null; }, removeChild(c) { this.children = this.children.filter((x) => x !== c); } };
  const svg = renderToContainer(makeTrace(), el, { doc: fakeDoc(), pos: 1 });
  const spokeLines = svg.children.filter((c) => c.attrs.class && c.attrs.class.startsWith('clock-spoke'));
  const labels = svg.children.filter((c) => c.attrs.class && c.attrs.class.startsWith('clock-glyph'));
  assert.equal(spokeLines.length, 9);
  assert.equal(labels.length, 9);
});

test('renderToContainer: hovering a spoke calls the injected onHover with that spoke', () => {
  const el = { children: [], appendChild(c) { this.children.push(c); return c; }, get firstChild() { return this.children[0] || null; }, removeChild(c) { this.children = this.children.filter((x) => x !== c); } };
  let seen = 'unset';
  const svg = renderToContainer(makeTrace(), el, { doc: fakeDoc(), pos: 1, onHover: (spoke) => { seen = spoke; } });
  const insSpoke = svg.children.find((c) => c.attrs['data-op'] === 'INS');
  insSpoke.listeners.mouseenter[0]();
  assert.equal(seen.op, 'INS');
  insSpoke.listeners.mouseleave[0]();
  assert.equal(seen, null);
});
