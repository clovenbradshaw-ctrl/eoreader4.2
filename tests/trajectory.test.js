import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { trajectoryWithinDoc, crosswalkCorpus } from '../src/rooms/reader/app/trajectory.js';

// docs/coreference-timeline.md — the Cross-Source Crosswalk Surface. These tests exercise the
// spec's own Validation § fixture: a housing plan ("the Barnes Fund"), a budget filing that calls
// the same program "the housing trust", a news article calling it "the affordable-housing fund",
// and a fourth document using "workforce housing" for a genuinely DIFFERENT program.

const repeat = (sentence, n) => Array.from({ length: n }, () => sentence).join(' ');

const docOf = (docId, text) => parseText(text, { docId, referentIdentity: 'mention' });

test('the reading cursor un-grows a document to what it alone had established by a sentence', () => {
  const text = 'Victor Frankenstein toiled in his laboratory. '
    + 'He was exhausted after the long night. '
    + 'Victor Frankenstein finally rested.';
  const doc = docOf('reading-doc', text);
  const refId = doc.referentOf(doc.surfaceMentions().find((m) => m.sentIdx === 0 && m.form === 'name').id);

  const atZero = trajectoryWithinDoc(doc, refId, { reading: 0 });
  assert.equal(atZero.state.surfaces.length, 1, 'only the sentence-0 mention has been read yet');
  assert.ok(atZero.state.surfaces.every((s) => s.sentIdx <= 0));

  const atOne = trajectoryWithinDoc(doc, refId, { reading: 1 });
  assert.equal(atOne.state.surfaces.length, 1, 'no new name mention arrives at sentence 1 (the pronoun did not resolve)');

  const atTwo = trajectoryWithinDoc(doc, refId, { reading: 2 });
  assert.equal(atTwo.state.surfaces.length, 2, 'the sentence-2 mention has now been read');

  const whole = trajectoryWithinDoc(doc, refId, { reading: Infinity });
  assert.deepEqual(whole.state.surfaces.map((s) => s.id).sort(), atTwo.state.surfaces.map((s) => s.id).sort(),
    'the whole-document cursor matches the last sentence cursor once nothing more is read');
});

test('the corpus cursor merges three corroborated relabellings and leaves the fourth distinct', () => {
  const doc1 = docOf('doc1', repeat('The Barnes Fund provides down payment assistance to city residents.', 2));
  const doc2 = docOf('doc2', repeat('The Housing Trust provides down payment assistance to city residents.', 3));
  const doc3 = docOf('doc3', repeat('The Affordable Housing Fund provides down payment assistance to city residents.', 4));
  const doc4 = docOf('doc4', repeat('Workforce Housing serves a different income band entirely.', 2));

  // the witness channel: nothing but MEANING distinguishes these three labels the first time each
  // appears (resolution-spectrum.js's MODEL tier) — a stand-in for a real model call, injected
  // exactly as enactor/factcheck/coref.js's geometricSecond is DI'd in its own tests.
  const SAME_PROGRAM = new Set(['barnes fund', 'housing trust', 'affordable housing fund']);
  const stripThe = (s) => s.trim().toLowerCase().replace(/^the\s+/, '');
  const sameReferent = (a, b) => SAME_PROGRAM.has(stripThe(a)) && SAME_PROGRAM.has(stripThe(b));

  const sources = [
    { id: 'doc1', doc: doc1, t: 1 },
    { id: 'doc2', doc: doc2, t: 2 },
    { id: 'doc3', doc: doc3, t: 3 },
    { id: 'doc4', doc: doc4, t: 4 },
  ];

  const { nodes, labelShifts } = crosswalkCorpus(sources, { sameReferent });

  assert.equal(nodes.length, 2, 'one merged program node, one distinct node');
  const merged = nodes.find((n) => n.sourceIds.includes('doc1'));
  const distinct = nodes.find((n) => n.sourceIds.includes('doc4'));
  assert.ok(merged && distinct);
  assert.deepEqual(new Set(merged.sourceIds), new Set(['doc1', 'doc2', 'doc3']),
    'the first three sources fold into ONE referent, not by spelling but by corroborated identity');
  assert.deepEqual(distinct.sourceIds, ['doc4'],
    'workforce housing never merges with the housing-trust cluster despite the overlapping domain');

  assert.ok(labelShifts.length >= 1, 'at least one label-shift tick fires as the dominant label changes');
  for (const shift of labelShifts) {
    assert.ok(shift.refId === merged.id, 'every shift belongs to the merged referent');
    assert.notEqual(shift.from, shift.to);
  }
});

test('the crosswalk never merges on lexical similarity alone — no injected witness, no merge', () => {
  const doc1 = docOf('doc1', repeat('The Barnes Fund provides down payment assistance to city residents.', 2));
  const doc2 = docOf('doc2', repeat('The Housing Trust provides down payment assistance to city residents.', 2));
  const sources = [{ id: 'doc1', doc: doc1, t: 1 }, { id: 'doc2', doc: doc2, t: 2 }];

  // no sameReferent supplied — defaults to normalized-string equality only.
  const { nodes } = crosswalkCorpus(sources);
  assert.equal(nodes.length, 2, 'two different spellings never merge without a warranted judgment');
});

test('the corpus cursor scrubs — folding to 1 source shows only that source\'s referent', () => {
  const doc1 = docOf('doc1', repeat('The Barnes Fund provides down payment assistance to city residents.', 2));
  const doc2 = docOf('doc2', repeat('The Housing Trust provides down payment assistance to city residents.', 3));
  const sources = [{ id: 'doc1', doc: doc1, t: 1 }, { id: 'doc2', doc: doc2, t: 2 }];
  const sameReferent = () => true;

  const atOne = crosswalkCorpus(sources, { corpus: 1, sameReferent });
  assert.equal(atOne.nodes.length, 1);
  assert.deepEqual(atOne.nodes[0].sourceIds, ['doc1']);

  const atTwo = crosswalkCorpus(sources, { corpus: 2, sameReferent });
  assert.deepEqual(new Set(atTwo.nodes[0].sourceIds), new Set(['doc1', 'doc2']));
});
