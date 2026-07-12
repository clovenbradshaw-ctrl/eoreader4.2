import { test } from 'node:test';
import assert from 'node:assert/strict';

import { operatorsOf, glyphOf, OPERATORS } from '../src/core/index.js';

// The operator projection is the fix for the CON-heavy graph: CON is the ACT of
// connecting (a staple), not the catch-all for every edge. An edge is already a link;
// typing it CON says nothing. This projects a relation onto the operator(s) that name
// its act — and lets an edge carry a NESTED stack when it is more than one act at once.

test('kinship and authorship project to INS — a parent instantiates, not merely bonds', () => {
  for (const via of ['mother', 'father', 'son', 'daughter', 'grandfather', 'parent', 'child', 'author', 'writer'])
    assert.deepEqual(operatorsOf(via, 'CON'), ['INS'], `${via} → INS`);
});

test('a metamorphosis carries NESTED operators — SEG (old form re-split) then INS (new state)', () => {
  for (const via of ['became', 'transformed', 'turn-into', 'turned', 'metamorphosed'])
    assert.deepEqual(operatorsOf(via, 'CON'), ['SEG', 'INS'], `${via} → SEG·INS`);
});

test('genuine bonds stay CON — sibling, spouse, social, leadership are CON\'s true home', () => {
  for (const via of ['sister', 'brother', 'wife', 'husband', 'friend', 'neighbour', 'captain', 'leader'])
    assert.deepEqual(operatorsOf(via, 'CON'), ['CON'], `${via} → CON`);
});

test('an untyped verb falls back to the base operator the parser assigned', () => {
  assert.deepEqual(operatorsOf('knows', 'CON'), ['CON']);   // ordinary bond
  assert.deepEqual(operatorsOf('said', 'SIG'), ['SIG']);    // speech kept SIG
  assert.deepEqual(operatorsOf(undefined, 'DEF'), ['DEF']); // copular kept DEF
  assert.deepEqual(operatorsOf('met', 'SYN'), ['SYN']);     // a source-read SYN survives
  assert.deepEqual(operatorsOf('', undefined), ['CON']);    // nothing at all → the honest floor
});

test('every operator has a distinct glyph, and glyphOf tolerates a non-operator', () => {
  const glyphs = Object.values(OPERATORS).map((o) => o.glyph);
  assert.equal(new Set(glyphs).size, glyphs.length, 'the nine glyphs are distinct');
  assert.equal(glyphOf('INS'), '●');
  assert.equal(glyphOf('CON'), '⋈');
  assert.equal(glyphOf('nonsense'), '·', 'an unknown code draws the neutral dot, never throws');
});
