import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createSlotField, induceSlots, BOUNDARY } from '../src/core/conventions/slots.js';

// THE SCALE-FREE INDUCTION PRIMITIVE. With no dictionary and no named categories, units that
// keep the same company fall into the same slot; the closed class emerges as the frame; the
// operation is recursive (slots become the next rung's units) and modality-neutral (units are
// opaque keys, so it never assumes language).

const OPTS = { frameSize: 20, clusterTop: 50, minFreq: 2, k: 6, simFloor: 0.2 };

// A tiny grammar: DET (NOUN) VERB, and the transitive DET NOUN VERB DET NOUN. Every determiner
// precedes every noun, every noun precedes every verb — strong distributional signal.
const DET = ['a', 'the'], NOUN = ['dog', 'cat', 'man', 'king'], VERB = ['ran', 'ate', 'saw', 'left'];
const grammarStream = () => {
  const s = [];
  for (const d of DET) for (const n of NOUN) for (const v of VERB) s.push(d, n, v, BOUNDARY);
  for (const d of DET) for (const n of NOUN) for (const v of VERB) for (const d2 of DET) for (const n2 of NOUN) s.push(d, n, v, d2, n2, BOUNDARY);
  return s;
};

test('slots emerge: determiners, nouns, and verbs each cluster by shared company', () => {
  const { slotOf } = induceSlots(grammarStream(), OPTS);
  // each class collapses to one slot…
  assert.equal(slotOf.get('a'), slotOf.get('the'), 'determiners share a slot');
  assert.equal(slotOf.get('dog'), slotOf.get('cat'), 'nouns share a slot');
  assert.equal(slotOf.get('cat'), slotOf.get('man'));
  assert.equal(slotOf.get('man'), slotOf.get('king'));
  assert.equal(slotOf.get('ran'), slotOf.get('saw'), 'verbs share a slot');
  assert.equal(slotOf.get('saw'), slotOf.get('left'));
  // …and the three classes are distinct slots
  const det = slotOf.get('a'), noun = slotOf.get('dog'), verb = slotOf.get('ran');
  assert.notEqual(det, noun); assert.notEqual(noun, verb); assert.notEqual(det, verb);
});

test('the frame emerges as the highest-frequency units (no list supplied)', () => {
  const field = createSlotField(OPTS).observe(grammarStream());
  const frame = field.frame();
  // determiners recur most (they head every subject and every object) → they sit in the frame.
  assert.ok(frame.has('a') && frame.has('the'), 'the closed class is in the frame');
});

test('nearest-by-company recovers slot-mates', () => {
  const field = createSlotField(OPTS).observe(grammarStream());
  const nn = field.neighbors('dog').map(([u]) => u);
  assert.ok(nn.includes('cat') && nn.includes('man'), `dog's company-neighbours are the other nouns: ${nn}`);
  assert.ok(!nn.includes('ran'), 'a verb is not a noun-slot neighbour');
});

test('recursion: lifting to slot ids compresses the stream into next-rung units', () => {
  const seq = grammarStream();
  const { slotOf, field } = induceSlots(seq, OPTS);
  const lifted = field.lift(seq, slotOf);
  // every determiner became the same slot token, so the lifted alphabet is far smaller…
  const rawTypes = new Set(seq.filter((u) => u !== BOUNDARY));
  const liftedTypes = new Set(lifted.filter((u) => u !== BOUNDARY));
  assert.ok(liftedTypes.size < rawTypes.size, `lifted alphabet ${liftedTypes.size} < raw ${rawTypes.size}`);
  assert.ok([...liftedTypes].every((u) => u.startsWith('§')), 'lifted units are slot ids');
  // …and the next rung can be induced from the lifted stream without error.
  const rung2 = createSlotField(OPTS).observe(lifted);
  assert.doesNotThrow(() => rung2.cluster());
  // the boundary survives the lift so the rung above still sees segment breaks.
  assert.ok(lifted.includes(BOUNDARY));
});

test('modality-neutral: the same operation clusters abstract symbols with no language at all', () => {
  // three opaque classes in a fixed frame — could be image-region kinds or audio events.
  const C = ['c1', 'c2'], A = ['a1', 'a2', 'a3'], B = ['b1', 'b2', 'b3'];
  const s = [];
  for (const c of C) for (const a of A) for (const b of B) { s.push(c, a, b, BOUNDARY); s.push(c, a, b, BOUNDARY); }
  const { slotOf } = induceSlots(s, OPTS);
  assert.equal(slotOf.get('a1'), slotOf.get('a2')); assert.equal(slotOf.get('a2'), slotOf.get('a3'));
  assert.equal(slotOf.get('b1'), slotOf.get('b2')); assert.equal(slotOf.get('b2'), slotOf.get('b3'));
  assert.notEqual(slotOf.get('a1'), slotOf.get('b1'));
  assert.notEqual(slotOf.get('a1'), slotOf.get('c1'));
});

test('deterministic: the same stream induces the same slots every time', () => {
  const seq = grammarStream();
  const a = induceSlots(seq, OPTS).slotOf;
  const b = induceSlots(seq, OPTS).slotOf;
  for (const u of a.keys()) assert.equal(a.get(u), b.get(u), `${u} is stable`);
});
