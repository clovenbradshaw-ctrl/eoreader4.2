import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  deepReading, createDeepReader, buildReflection, readReflections,
  buildSubstrate, RESTING,
} from '../src/surfer/fold/index.js';
import { surfFold } from '../src/surfer/index.js';
import { canWitness } from '../src/core/index.js';
import { parseText } from '../src/perceiver/parse/index.js';

// DEEP READING (fold/deep-reading.js) — when the model is not otherwise busy, surf to the
// place of most interest, fold it, and deposit a reflection on the graph. The reflection is
// an ENACTED EVA (ontology) that is REAFFERENT and held at band VOID (epistemics — the
// firewall), so it can never be mistaken for a witnessed fact.

const BOOK =
  'Gregor woke to find himself changed. His body was hard and armored. ' +
  'The family gathered at the door and would not enter. Grete brought him food but looked away. ' +
  'The chief clerk arrived and demanded an explanation. Gregor could not make himself understood. ' +
  'His father drove him back with a stick. The apple lodged in his back and festered. ' +
  'Grete decided the creature was no longer her brother. In the morning the charwoman found him dead.';

const bookDoc = () => parseText(BOOK, { docId: 'metamorphosis.txt', genderCoref: true });

test('ONTOLOGY + EPISTEMICS: a reflection is an enacted EVA, reafferent, held at band void — the firewall', () => {
  const e = buildReflection({ cursor: 3, focus: 'grete', verdict: 'strain', surprise: 0.4, body: 'Grete turns away.', sources: [3, 4] });
  assert.equal(e.op, 'EVA', 'the reflection operator is EVA (Relate × Interpretation — evaluate)');
  assert.equal(e.register, 'enacted', "the reading's OWN act — never a depicted perception");
  assert.equal(e.band, 'void', 'held open — an interpretation, not asserted firm');
  assert.equal(e.grounded, false);
  assert.equal(e.door, 'enactor', 'reafference — the enactor door');
  assert.equal(canWitness(e.prov), false, 'the §8 type law bars a reflection from witnessing anything as world');
  assert.equal(e.cursor, 3, 'the place of most interest is the cursor — it grounds/replays there');
  assert.deepEqual([...e.sources], [3, 4], 'the fold sources ride as citations');
});

test('a deep reading surfs to the place of most interest, folds it, and appends ONE reflection to the graph', () => {
  const doc = bookDoc();
  const before = doc.log.length;
  const r = deepReading(doc, { surf: surfFold });
  assert.ok(r, 'a reflection was produced');
  assert.ok(Number.isInteger(r.peak), 'it reflected at a real cursor — the surfer peak (place of most interest)');
  assert.ok(r.body.length > 0, 'the reflection has a body');
  assert.equal(doc.log.length, before + 1, 'exactly one event was appended to the log');
  assert.equal(r.committed, true);
  assert.equal(r.canWitness, false, 'the appended reflection cannot witness — the firewall holds on the real log');

  // it landed as an enacted EVA and NOTHING else — projectGraph skips EVA, so it is not a depicted fact.
  const appended = doc.log.snapshot().at(-1);
  assert.equal(appended.op, 'EVA');
  assert.equal(appended.register, 'enacted');
});

test('ADDED TO THE GRAPH: the reflection surfaces as a first-class eo:Reflection node, band void, reafferent', () => {
  const doc = bookDoc();
  deepReading(doc, { surf: surfFold });
  const reflections = readReflections(doc);
  assert.equal(reflections.length, 1, 'readReflections reads the enacted EVA off the log');

  const substrate = buildSubstrate({ structure: { relations: [], defs: [] }, reflections });
  assert.equal(substrate.reflections.length, 1, 'the substrate carries it as an eo:Reflection node');
  const node = substrate.reflections[0];
  assert.equal(node.band, 'void', 'held open in the graph');
  assert.equal(node.witness, 'reafferent', 'the firewall is explicit on the graph node');
  assert.equal(node.grounded, false);
  assert.ok(node.reading.length > 0, 'the reflection prose is carried');
});

test('a document with no deep reading is byte-identical — readReflections is empty, the substrate unchanged', () => {
  const doc = bookDoc();
  assert.deepEqual(readReflections(doc), []);
  const substrate = buildSubstrate({ structure: { relations: [], defs: [] } });
  assert.deepEqual(substrate.reflections, [], 'no reflection node where none was deposited');
});

test('an injected model voice reflects in its own words; the epistemics are still the firewall', () => {
  const doc = bookDoc();
  const reflect = (fold, ctx) => ({ body: `a thought about ${ctx.focus ?? 'the scene'} at ${ctx.cursor}`, verdict: 'strain' });
  const r = deepReading(doc, { surf: surfFold, reflect });
  assert.match(r.body, /a thought about/, "the model's voice is used");
  assert.equal(r.canWitness, false, 'model-voiced or not, a reflection is reafference and cannot witness');
});

test('GOVERNED LOOP: it wakes on idle, reflects on the interesting places, habituates, and quiesces (I2, I3, I4)', () => {
  const doc = bookDoc();
  const reader = createDeepReader({ doc, surf: surfFold });
  assert.ok(reader.isResting(), 'the reader starts at rest, not spinning');

  const r = reader.arrive({ anchor: 0 });                     // the caller signals "not busy" (I4)
  assert.equal(reader.state, RESTING, 'it self-terminates — it never spins (I3)');
  assert.equal(r.quiesced, true);
  assert.ok(r.reflections.length >= 1, 'it reflected on at least one place of interest');

  // habituation: no two reflections land on the same place (the rumination cure)
  const peaks = reader.reflections.map((x) => x.peak);
  assert.equal(new Set(peaks).size, peaks.length, 'each place is reflected on at most once');

  // I2 firewall — the loop can never ground its own reflection
  assert.equal(reader.canGround(reader.reflections[0]), false, 'a reflection cannot ground itself — reafferent by type');
});

test('the median-band governor holds: with the band above every peak, NO reflection is committed (I3)', () => {
  const doc = bookDoc();
  const before = doc.log.length;
  const reader = createDeepReader({ doc, surf: surfFold, medianBand: 1e9 });   // an unreachable floor
  const r = reader.arrive({ anchor: 0 });
  assert.equal(r.reflections.length, 0, 'nothing beats the floor → nothing worth saying → no reflection');
  assert.equal(doc.log.length, before, 'the log is untouched — a below-band peek leaves no event');
  assert.equal(r.quiesced, true);
});

test('surf is required, and a doc without a log yields no reflection (never a throw)', () => {
  assert.throws(() => deepReading(bookDoc(), {}), /surf.*must be injected/);
  assert.equal(deepReading({}, { surf: surfFold }), null);
  assert.throws(() => createDeepReader({ doc: bookDoc() }), /surf must be injected/);
});
