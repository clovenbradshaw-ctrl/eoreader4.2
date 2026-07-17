import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildScene, renderToContainer } from '../src/surfaces/waveform/render.strict.js';

// THE STRICT RENDER — a hand-built WaveformModel (not run through buildWaveform)
// so these tests exercise the render's OWN decisions (visibility ladder, peak
// selection, gauge muting) in isolation, with fully controlled inputs rather
// than Born-null-derived ones.

const VOCAB = { FOREGROUND: 'narrating', PRESENT: 'present', LATENT: 'orbited' };

const makeModel = (over = {}) => {
  const n = 20;
  const baseline = new Array(n).fill(0.2);
  const strain = new Array(n).fill(0.05);
  strain[10] = 0.9; // the one real spike
  const confidence = new Array(n).fill(1);
  confidence[0] = 0.25;
  return {
    baseline, strain, confidence,
    frames: [{ start: 0, end: 10, label: 'Part One' }, { start: 10, end: n, label: null }],
    turns: [{ ordinal: 10, strain_delta: 0.85, hot: true }, { ordinal: 4, strain_delta: 0.1, hot: false }],
    ruler: [],
    echoes: [{ span_a: 2, span_b: 15, sim: 0.9 }],
    cast: [
      { referent: 'a', display: 'A', gateType: 'holon', onCast: true, salience: 3, presence: [] },
      { referent: 'b', display: 'B', gateType: 'field', onCast: false, salience: 1, presence: [] },
    ],
    vocab: VOCAB,
    discard: { get: (i) => (i >= 0 && i < n ? { ordinal: i, baseline: baseline[i], strain: strain[i], turnLine: 0.3 } : null) },
    provenance: (i) => ({ ordinal: i }),
    ...over,
  };
};

test('buildScene: Read mode hides everything', () => {
  const scene = buildScene(makeModel(), { mode: 'read' });
  assert.equal(Object.values(scene.visibility).every((v) => v === false), true);
});

test('buildScene: Skim mode shows only bands and turn markers', () => {
  const scene = buildScene(makeModel(), { mode: 'skim' });
  assert.equal(scene.visibility.turns, true);
  assert.equal(scene.visibility.bands, true);
  assert.equal(scene.visibility.waveform, false);
  assert.equal(scene.visibility.cast, false);
});

test('buildScene: Study mode shows everything', () => {
  const scene = buildScene(makeModel(), { mode: 'study' });
  assert.ok(Object.values(scene.visibility).every((v) => v === true));
});

test('buildScene: only the hot turn renders emphasized', () => {
  const scene = buildScene(makeModel());
  const hot = scene.turnMarks.filter((t) => t.emphasized);
  assert.equal(hot.length, 1);
  assert.equal(hot[0].ordinal, 10);
});

test('buildScene: the peak callout picks the hottest turn, never more than one', () => {
  const scene = buildScene(makeModel());
  assert.ok(scene.peakCallout);
  assert.equal(scene.peakCallout.ordinal, 10);
});

test('buildScene: no hot turns means no forced peak callout (precision over recall)', () => {
  const model = makeModel({ turns: [{ ordinal: 4, strain_delta: 0.1, hot: false }] });
  const scene = buildScene(model);
  assert.equal(scene.peakCallout, null);
});

test('buildScene: cast lanes default to onCast members only', () => {
  const scene = buildScene(makeModel());
  assert.equal(scene.castLanes.length, 1);
  assert.equal(scene.castLanes[0].referent, 'a');
});

test('buildScene: confidence below 1 is flagged for de-emphasis, never omitted', () => {
  const scene = buildScene(makeModel());
  const zone = scene.confidenceZones.find((z) => z.ordinal === 0);
  assert.equal(zone.deemphasized, true);
  assert.ok(scene.confidenceZones.length === 20, 'every ordinal is represented, none dropped');
});

test('buildScene: the gauge mutes itself when baseline has no stable expected floor', () => {
  const n = 20;
  const volatileBaseline = Array.from({ length: n }, (_, i) => (i % 2 === 0 ? 0.05 : 5));
  const scene = buildScene(makeModel({ baseline: volatileBaseline }));
  assert.equal(scene.gauge.muted, true);
  assert.equal(scene.gauge.label, null);
});

test('buildScene: the gauge shows a word label, never a number, on a stable document', () => {
  const scene = buildScene(makeModel());
  assert.equal(scene.gauge.muted, false);
  assert.equal(typeof scene.gauge.label, 'string');
  assert.ok(!/\d/.test(scene.gauge.label), 'no digit ever appears in the gauge label');
});

// ---- the DOM adapter — a minimal hand-rolled stub, not jsdom -----------------

const makeFakeDoc = () => {
  const makeEl = (tag) => ({
    tagName: tag,
    attrs: {},
    children: [],
    _text: '',
    listeners: {},
    setAttribute(k, v) { this.attrs[k] = String(v); },
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); },
    get firstChild() { return this.children[0] || null; },
    set textContent(v) { this._text = v; },
    get textContent() { return this._text; },
    addEventListener(evt, fn) { (this.listeners[evt] ||= []).push(fn); },
    fire(evt) { for (const fn of (this.listeners[evt] || [])) fn(); },
  });
  return { createElementNS: (ns, tag) => makeEl(tag) };
};

test('renderToContainer: Read mode paints a bare, empty svg', () => {
  const doc = makeFakeDoc();
  const container = doc.createElementNS(null, 'div');
  const svg = renderToContainer(makeModel(), container, { doc, mode: 'read' });
  assert.equal(svg.children.length, 0);
});

test('renderToContainer: Study mode paints bands, the strain line, turn ticks, an echo arc, and the gauge', () => {
  const doc = makeFakeDoc();
  const container = doc.createElementNS(null, 'div');
  const svg = renderToContainer(makeModel(), container, { doc, mode: 'study' });
  const classesOf = (tag) => svg.children.filter((c) => c.tagName === tag).map((c) => c.attrs.class);
  assert.ok(classesOf('rect').some((c) => c.includes('band')), 'bands painted');
  assert.ok(classesOf('polyline').includes('strain-line'), 'the one bold strain line painted');
  assert.ok(classesOf('polyline').includes('baseline-area'), 'the muted baseline area painted');
  assert.ok(classesOf('line').some((c) => c.includes('turn-tick-emphasized')), 'the hot turn ticks emphasized');
  assert.ok(svg.children.some((c) => c.tagName === 'path' && c.attrs.class === 'echo-arc'), 'the echo arc painted');
  assert.ok(svg.children.some((c) => c.tagName === 'circle' && c.attrs.class === 'peak-callout'), 'the one peak callout painted');
  assert.ok(svg.children.some((c) => c.tagName === 'text'), 'the gauge word painted');
});

test('renderToContainer: clicking a turn tick navigates through the model\'s own provenance, never a hardcoded route', () => {
  const doc = makeFakeDoc();
  const container = doc.createElementNS(null, 'div');
  let navigated = null;
  const model = makeModel();
  const svg = renderToContainer(model, container, { doc, mode: 'study', onNavigate: (loc) => { navigated = loc; } });
  const tick = svg.children.find((c) => c.tagName === 'line' && c.attrs.class.includes('turn-tick-emphasized'));
  tick.fire('click');
  assert.deepEqual(navigated, model.provenance(10));
});

test('renderToContainer: hovering a turn tick surfaces the discard "why" readout', () => {
  const doc = makeFakeDoc();
  const container = doc.createElementNS(null, 'div');
  let hovered = null;
  const model = makeModel();
  const svg = renderToContainer(model, container, { doc, mode: 'study', onHover: (entry) => { hovered = entry; } });
  const tick = svg.children.find((c) => c.tagName === 'line' && c.attrs.class.includes('turn-tick-emphasized'));
  tick.fire('mouseenter');
  assert.deepEqual(hovered, model.discard.get(10));
});
