import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ingestText } from '../src/organs/in/text.js';
import { buildTextReading, detectChapterBoundaries } from '../src/perceiver/text/waveform.js';
import { validateReading } from '../src/perceiver/contract.js';
import { buildWaveform } from '../src/weave/waveform/build.js';

// THE TEXT PERCEIVER — end to end through the REAL parser (ingestText), not a
// hand-built doc stub, since the point of this perceiver (§4.1) is that it is
// mostly a re-export of what the modelless read already computes. The document
// below is Frankenstein-shaped on purpose: Victor names, "the creature" recurs
// unnamed until dark-referent admission promotes it, and "father" is a
// possessive descriptor mentioned once (an accountable-loss VOID, not a cast
// member) — the same population individuation.test.js's own fixtures target.

const DOC_TEXT = [
  'Chapter One.',
  'Victor built a creature in his laboratory.',
  'Victor worked through the night on his machines.',
  'The creature opened its eyes and looked around the room.',
  'The creature fled into the dark forest that very night.',
  'Victor searched for the creature for many long days.',
  'The creature watched Victor from among the trees.',
  'Victor despaired of ever finding the creature again.',
  'The creature approached a small mountain village.',
  'Victor wrote a long letter to his father.',
  'The creature was seen by a frightened shepherd.',
  'Victor pursued the creature across the frozen ice.',
  'The creature vanished into the storm without a trace.',
  'Chapter Two.',
  'Years later Victor still dreamed of the creature.',
  'The creature had grown stronger and bolder with time.',
  'Victor built new instruments to track the creature.',
  'The creature returned to the old abandoned laboratory.',
  'Victor confronted the creature at last in the ruins.',
].join(' ');

// A SEPARATE, deliberately repetitive-vocabulary document for the turn-
// confirmation test specifically. The hash embedder (model/embed-hash.js) is a
// bag-of-words read — cosine similarity between two SHORT, lexically varied
// sentences is noisy even within one register, so a toy document needs real
// within-chapter repetition (not just the same character names) before the
// Born-null population is large and clean enough to confirm a boundary rather
// than correctly abstain on it. DOC_TEXT above is realistic prose and is used
// for everything that does NOT depend on that confirmation.
const TURN_DOC_TEXT = [
  'Chapter One.',
  'Victor and the creature raced through the dark forest.',
  'The forest was dark and the creature ran through the forest.',
  'Victor chased the creature through the dark forest at night.',
  'The dark forest hid the creature from Victor all night.',
  'Victor searched the dark forest for the creature all night.',
  'The creature stayed hidden in the dark forest from Victor.',
  'Victor and the creature moved through the dark forest again.',
  'The dark forest concealed the creature from Victor once more.',
  'Victor followed the creature deeper into the dark forest.',
  'The creature and Victor circled through the dark forest.',
  'Victor lost the creature somewhere in the dark forest.',
  'The dark forest swallowed the creature whole that night.',
  'Victor camped at the edge of the dark forest until dawn.',
  'The creature returned to the dark forest before sunrise.',
  'Victor and the creature both vanished into the dark forest.',
  'Chapter Two.',
  'The committee reviewed the budget report at the meeting.',
  'The budget report was debated by the committee at the meeting.',
  'Members of the committee discussed the budget report again.',
  'The committee voted on the budget report during the meeting.',
  'Delegates at the meeting objected to the budget report.',
  'The committee approved the budget report after the meeting.',
  'The budget report was filed by the committee after the vote.',
  'The committee reconvened to amend the budget report next week.',
  'Members of the committee signed the amended budget report.',
  'The budget report was archived by the committee clerk.',
  'The committee closed the meeting after the budget report vote.',
  'The chairperson thanked the committee for the budget report.',
].join(' ');

test('detectChapterBoundaries: finds the heading sentences, none when there are none', () => {
  const withChapters = ['Chapter One.', 'Something happens.', 'Chapter Two.', 'Something else.'];
  const segs = detectChapterBoundaries(withChapters);
  assert.deepEqual(segs.map((s) => s.start), [0, 2]);
  assert.equal(detectChapterBoundaries(['No headings here.', 'Or here.']).length, 0);
});

test('buildTextReading: produces a valid Reading straight off the modelless parse', async () => {
  const doc = await ingestText(DOC_TEXT, {});
  const reading = await buildTextReading(doc);
  const { ok, errors } = validateReading(reading);
  assert.equal(ok, true, `expected a valid Reading, got ${JSON.stringify(errors)}`);
  assert.equal(reading.units.length, doc.sentences.length);
  assert.equal(reading.meta.modality, 'text');
});

test('buildTextReading: Victor and the creature both reach the referent list; father is un-INS\'d', async () => {
  const doc = await ingestText(DOC_TEXT, {});
  const reading = await buildTextReading(doc);
  const byKey = new Map(reading.referents.map((r) => [r.key, r]));
  assert.ok(byKey.has('victor'), 'the named protagonist is a referent');
  assert.equal(byKey.get('victor').ins, true);
  const creature = [...byKey.values()].find((r) => r.display_name === 'the creature');
  assert.ok(creature, 'the recurring unnamed figure is a referent (via dark-referent admission)');
  const father = [...byKey.values()].find((r) => r.display_name === 'father');
  assert.ok(father, 'the possessive descriptor reaches the referent list');
  assert.equal(father.ins, false, 'a bare descriptor never carries INS');
});

test('buildTextReading: sighting counts track real mention counts, not a constant', async () => {
  const doc = await ingestText(DOC_TEXT, {});
  const reading = await buildTextReading(doc);
  const counts = new Map();
  for (const s of reading.sightings) counts.set(s.referent, (counts.get(s.referent) || 0) + 1);
  assert.ok(counts.get('victor') >= 7, 'Victor is sighted at least as often as he is INS\'d');
  const father = reading.referents.find((r) => r.display_name === 'father');
  assert.equal(counts.get(father.key), 1, 'father is mentioned exactly once in the text');
});

test('buildTextReading: chapter headings become coarse segments at the right ordinals', async () => {
  const doc = await ingestText(DOC_TEXT, {});
  const reading = await buildTextReading(doc);
  assert.equal(reading.segments.length, 2);
  assert.equal(reading.segments[0].start, 0);
  assert.ok(reading.segments[1].start > 0 && reading.segments[1].start < doc.sentences.length);
});

test('buildWaveform over a real text Reading: runs end to end and ranks the recurring figures above the one-off descriptor', async () => {
  const doc = await ingestText(DOC_TEXT, {});
  const reading = await buildTextReading(doc);
  const model = buildWaveform(reading);

  assert.equal(model.strain.length, doc.sentences.length);

  const byReferent = new Map(model.cast.map((c) => [c.referent, c]));
  const father = reading.referents.find((r) => r.display_name === 'father');
  const victor = byReferent.get('victor');
  const fatherLane = byReferent.get(father.key);
  assert.ok(victor, 'Victor reaches the cast lanes');
  assert.ok(fatherLane, 'father reaches the cast lanes too, even though typed off the cast');
  assert.ok(victor.salience > fatherLane.salience, 'a recurring named figure outranks a one-off descriptor');
});

test('buildWaveform over a real text Reading: confirms a turn near a genuine register break', async () => {
  const doc = await ingestText(TURN_DOC_TEXT, {});
  const reading = await buildTextReading(doc);
  const model = buildWaveform(reading);
  const chapterTwoStart = reading.segments[1].start;
  const nearChapterBreak = model.turns.some((t) => Math.abs(t.ordinal - chapterTwoStart) <= 2);
  assert.ok(nearChapterBreak, `expected a turn near the Chapter Two boundary (${chapterTwoStart}), got ${JSON.stringify(model.turns.map((t) => t.ordinal))}`);
});
