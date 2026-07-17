import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildScene, renderToContainer } from '../src/surfaces/waveform/render.strict.js';
import { applyAudioSkin } from '../src/surfaces/waveform/skins/audio.js';
import { applyTabularSkin } from '../src/surfaces/waveform/skins/tabular.js';

// SKINS — restyle only (docs/omnimodal-waveform.md §5). A skin receives the
// Scene buildScene already produced and may add presentational metadata, but
// every mark array must survive UNCHANGED: same turns, same echoes, same cast
// lanes, same peak, same visibility. If a skin ever changes any of those, the
// discipline is broken.

const VOCAB = { FOREGROUND: 'stated', PRESENT: 'in the texture', LATENT: 'implied' };

const makeModel = () => {
  const n = 20;
  const baseline = new Array(n).fill(0.2);
  const strain = new Array(n).fill(0.05);
  strain[10] = 0.9;
  const confidence = new Array(n).fill(1);
  return {
    baseline, strain, confidence,
    frames: [{ start: 0, end: 10, label: 'Part One' }, { start: 10, end: n, label: null }],
    turns: [{ ordinal: 10, strain_delta: 0.85, hot: true }],
    ruler: [],
    echoes: [{ span_a: 2, span_b: 15, sim: 0.9 }],
    cast: [{ referent: 'a', display: 'A', gateType: 'holon', onCast: true, salience: 3, presence: [] }],
    vocab: VOCAB,
    discard: { get: (i) => (i >= 0 && i < n ? { ordinal: i, baseline: baseline[i], strain: strain[i], turnLine: 0.3 } : null) },
    provenance: (i) => ({ ordinal: i }),
  };
};

for (const [name, skin] of [['audio', applyAudioSkin], ['tabular', applyTabularSkin]]) {
  test(`${name} skin: adds a theme, never touches the marks`, () => {
    const scene = buildScene(makeModel());
    const skinned = skin(scene);
    assert.equal(skinned.style.theme, name);
    assert.equal(typeof skinned.style.backgroundGlyph, 'string');
    assert.deepEqual(skinned.turnMarks, scene.turnMarks, 'turns are untouched');
    assert.deepEqual(skinned.echoArcs, scene.echoArcs, 'echoes are untouched');
    assert.deepEqual(skinned.castLanes, scene.castLanes, 'cast lanes are untouched');
    assert.deepEqual(skinned.peakCallout, scene.peakCallout, 'the peak callout is untouched');
    assert.deepEqual(skinned.visibility, scene.visibility, 'the visibility ladder is untouched');
    assert.deepEqual(skinned.gauge, scene.gauge, 'the gauge decision is untouched');
  });
}

const makeFakeDoc = () => {
  const makeEl = (tag) => ({
    tagName: tag, attrs: {}, children: [],
    setAttribute(k, v) { this.attrs[k] = String(v); },
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); },
    get firstChild() { return this.children[0] || null; },
    set textContent(v) { this._text = v; },
    get textContent() { return this._text; },
    addEventListener() {},
  });
  return { createElementNS: (ns, tag) => makeEl(tag) };
};

test('renderToContainer: opts.skin changes the theme class but paints the identical set of marks', () => {
  const doc = makeFakeDoc();
  const model = makeModel();

  const plainContainer = doc.createElementNS(null, 'div');
  const plainSvg = renderToContainer(model, plainContainer, { doc, mode: 'study' });

  const skinnedContainer = doc.createElementNS(null, 'div');
  const skinnedSvg = renderToContainer(model, skinnedContainer, { doc, mode: 'study', skin: applyAudioSkin });

  assert.ok(skinnedSvg.attrs.class.includes('waveform-theme-audio'));
  assert.ok(!plainSvg.attrs.class.includes('waveform-theme'));
  assert.equal(skinnedSvg.children.length, plainSvg.children.length, 'the skin paints exactly the same number of elements');
});
