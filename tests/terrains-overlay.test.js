// The terrain-overlay fold, pinned. The demo surface (src/rooms/terrains) paints the
// cube's nine Site-face terrains over one passage; this proves the pure fold underneath
// it — segmentation, arcs, washes — is deterministic and honest, the way the plain and
// replay rooms pin their folds.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildOverlay, segment } from '../src/rooms/terrains/overlay.js';
import * as SCENE from '../src/rooms/terrains/scene.js';
import { TERRAINS, terrainInfo } from '../src/core/cube.js';
import { DOMAINS, GRAINS } from '../src/core/operators.js';

// ── the switcher is the cube: every terrain the surface offers is a real Site-face cell ──
test('every terrain the demo draws is one of the cube’s nine Site-face terrains', () => {
  const nine = new Set(DOMAINS.flatMap((d) => GRAINS.map((g) => TERRAINS[d][g])));
  const drawn = ['Entity', 'Kind', 'Void', 'Link', 'Network', 'Field', 'Lens', 'Paradigm', 'Atmosphere'];
  assert.equal(drawn.length, 9);
  for (const t of drawn) assert.ok(nine.has(t), `${t} must be a real terrain`);
  assert.equal(new Set(drawn).size, 9);
});

// ── segmentation: atoms tile the sentence exactly, disjoint, in order ──
test('segment tiles the text exactly and in order', () => {
  const text = 'the city council approved Fusus today';
  const marks = [
    { layer: 'entity', start: 4, end: 16 },   // "city council"
    { layer: 'link',   start: 17, end: 25 },  // "approved"
    { layer: 'entity', start: 26, end: 31 },  // "Fusus"
  ];
  const atoms = segment(text, marks);
  assert.equal(atoms.map((a) => a.text).join(''), text, 'atoms must reconstruct the text');
  for (let i = 1; i < atoms.length; i += 1) assert.equal(atoms[i].start, atoms[i - 1].end, 'atoms must be contiguous');
});

test('overlapping terrains produce an atom carrying BOTH, styled by the top priority', () => {
  // "surveillance" (Lens) sits inside "a surveillance platform" (Entity).
  const text = 'a surveillance platform here';
  const atoms = segment(text, [
    { layer: 'entity', start: 0, end: 23 },       // "a surveillance platform"
    { layer: 'lens',   start: 2, end: 14 },       // "surveillance"
  ]);
  const both = atoms.find((a) => a.marks.length === 2);
  assert.ok(both, 'there must be an atom covered by both terrains');
  assert.equal(both.text, 'surveillance');
  assert.equal(both.top, 'lens', 'Lens outranks Entity for the visible style');
  // and the atoms still tile the whole string
  assert.equal(atoms.map((a) => a.text).join(''), text);
});

// ── inline channel: marks appear only when their terrain is on ──
test('no inline terrain on → no marks anywhere', () => {
  const model = buildOverlay({ inline: new Set() });
  for (const s of model.sentences) for (const a of s.atoms) assert.equal(a.top, null);
  assert.equal(model.arcs.length, 0);
});

test('entity on → entity atoms carry an id that exists in the scene', () => {
  const ids = new Set(SCENE.ENTITIES.map((e) => e.id));
  const model = buildOverlay({ inline: new Set(['entity']) });
  const entAtoms = model.sentences.flatMap((s) => s.atoms).filter((a) => a.top === 'entity');
  assert.ok(entAtoms.length >= SCENE.ENTITIES.length - 1);
  for (const a of entAtoms) {
    const m = a.marks.find((x) => x.layer === 'entity');
    assert.ok(ids.has(m.id), `${m.id} must be a real entity`);
  }
});

// ── arcs: only with Link on; endpoints resolve against rendered entities ──
test('arcs appear only when Link is on, and one per scene link', () => {
  assert.equal(buildOverlay({ inline: new Set(['entity']) }).arcs.length, 0);
  const model = buildOverlay({ inline: new Set(['entity', 'link']) });
  assert.equal(model.arcs.length, SCENE.LINKS.length);
  // with entities on, both endpoints of every scene link are rendered
  for (const arc of model.arcs) {
    assert.equal(arc.hasFrom, true, `${arc.rel} from-endpoint should render`);
    assert.equal(arc.hasTo, true, `${arc.rel} to-endpoint should render`);
  }
});

test('link on but entity off → arcs know their endpoints are not drawn (stub)', () => {
  const model = buildOverlay({ inline: new Set(['link']) });
  assert.equal(model.arcs.length, SCENE.LINKS.length);
  for (const arc of model.arcs) assert.equal(arc.hasFrom, false);
});

// ── recolour channel: the entity colour key follows identity / kind / network ──
test('recolour switches the entity colour key between id, kind, and cluster', () => {
  const key = (recolor) => {
    const m = buildOverlay({ inline: new Set(['entity']), recolor })
      .sentences[0].atoms.find((a) => a.top === 'entity').marks.find((x) => x.layer === 'entity');
    return m.colorKey;
  };
  const council = SCENE.ENTITIES.find((e) => e.id === 'council');
  assert.equal(key('identity'), 'council');
  assert.equal(key('kind'), council.kind);
  assert.equal(key('network'), council.cluster);
});

// ── wash channel: exactly the active wash is carried, one value per sentence ──
test('a wash carries its own kind and one cell per sentence; none → no wash', () => {
  assert.ok(buildOverlay({}).sentences.every((s) => s.wash === null));
  for (const wash of ['field', 'atmosphere', 'paradigm']) {
    const model = buildOverlay({ wash });
    assert.equal(model.sentences.length, SCENE.SENTENCES.length);
    for (const s of model.sentences) assert.equal(s.wash.kind, wash);
  }
});

test('the paradigm wash marks exactly the sentence where the frame turns', () => {
  const model = buildOverlay({ wash: 'paradigm' });
  const breaks = model.sentences.filter((s) => s.wash.break);
  assert.equal(breaks.length, 1, 'exactly one frame break in the passage');
  assert.equal(breaks[0].sent, SCENE.PARADIGM.findIndex((p) => p.break));
});

// ── determinism: same input, same model ──
test('the fold is pure — same channels, same model', () => {
  const a = buildOverlay({ inline: new Set(['entity', 'link', 'lens']), wash: 'atmosphere' });
  const b = buildOverlay({ inline: new Set(['entity', 'link', 'lens']), wash: 'atmosphere' });
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
});

// ── the void terrain is a real Ground cell (so the "absence" treatment is principled) ──
test('Void is Existence · Ground — an ambient terrain, not a figure', () => {
  const info = terrainInfo('Void');
  assert.equal(info.domain, 'Existence');
  assert.equal(info.grain, 'Ground');
});
