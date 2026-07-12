import { test } from 'node:test';
import assert from 'node:assert/strict';

import { inlineMdMarks } from '../src/rooms/reader/reader-render.js';

// Flatten a plan back to the VISIBLE text a reader would see: text pieces contribute their
// (marker-stripped) characters; an ent/cite seg contributes its label (`s`) or a chip stand-in.
// This is what the surface paints, so asserting on it is asserting on what the user reads.
const visible = (segsIn) => {
  const { pieces, opaque } = inlineMdMarks(segsIn);
  return segsIn.map((sg, i) => sg.t === 'text'
    ? pieces[i].map((p) => p.s).join('')
    : (sg.s != null ? sg.s : '')).join('');
};
const markOf = (segsIn, si, pieceText) => {
  const { pieces } = inlineMdMarks(segsIn);
  return pieces[si].find((p) => p.s === pieceText);
};

test('plain prose is untouched — one piece, no marks', () => {
  const segs = [{ t: 'text', s: 'no markup at all here' }];
  const { pieces, opaque } = inlineMdMarks(segs);
  assert.deepEqual(pieces[0], [{ s: 'no markup at all here', kind: '', unsourced: false }]);
  assert.equal(opaque[0], null);
});

test('italic/bold/code within a single text segment', () => {
  const segs = [{ t: 'text', s: 'a *b* and **c** and `d` end' }];
  const { pieces } = inlineMdMarks(segs);
  const byText = (s) => pieces[0].find((p) => p.s === s);
  assert.equal(byText('b').kind, 'em');
  assert.equal(byText('c').kind, 'strong');
  assert.equal(byText('d').kind, 'code');
  // the markers themselves are gone
  assert.ok(!pieces[0].some((p) => /[*`]/.test(p.s)), 'no raw markers survive');
  assert.equal(pieces[0].map((p) => p.s).join(''), 'a b and c and d end');
});

// ── the bug from the screenshot: *Swept Away* where "Swept Away" is a LINKED ENTITY, so the
//    opening `*` is in one text seg, the closing `*` in another, with the entity between them.
test('emphasis that WRAPS an entity across segments is honoured, markers removed', () => {
  const segs = [
    { t: 'text', s: 'almost certainly *' },
    { t: 'ent', s: 'Swept Away', docId: 'd', entId: 'e' },
    { t: 'text', s: '* — which critics savaged.' },
  ];
  const { pieces, opaque } = inlineMdMarks(segs);
  // the entity itself inherits the emphasis…
  assert.equal(opaque[1].kind, 'em');
  // …and NO stray asterisk is left on either side of it
  assert.equal(visible(segs), 'almost certainly Swept Away — which critics savaged.');
  assert.ok(!pieces[0].some((p) => p.s.includes('*')), 'no orphaned opening *');
  assert.ok(!pieces[2].some((p) => p.s.includes('*')), 'no orphaned closing *');
});

test('bold wrapping an entity, and a cite chip carried inside an emphasised run', () => {
  const bold = [
    { t: 'text', s: 'the film **' },
    { t: 'ent', s: 'Showgirls', docId: 'd', entId: 'e' },
    { t: 'text', s: '** gets mentioned' },
  ];
  assert.equal(inlineMdMarks(bold).opaque[1].kind, 'strong');
  assert.equal(visible(bold), 'the film Showgirls gets mentioned');

  const withCite = [
    { t: 'text', s: 'see *foo ' },
    { t: 'cite', idx: 1, sn: 'S1', reg: 's1', quote: 'q' },
    { t: 'text', s: ' bar* baz' },
  ];
  const { pieces, opaque } = inlineMdMarks(withCite);
  assert.equal(pieces[0].find((p) => p.s.trim() === 'foo').kind, 'em');
  assert.equal(opaque[1].kind, 'em', 'the chip sits inside the emphasised run');
  assert.equal(pieces[2].find((p) => p.s.trim() === 'bar').kind, 'em');
  assert.ok(!pieces[0].concat(pieces[2]).some((p) => p.s.includes('*')), 'markers gone');
});

test('a lone, unpaired marker stays literal (never eats the rest of the line)', () => {
  const segs = [{ t: 'text', s: 'a single lone * asterisk with no partner' }];
  const { pieces } = inlineMdMarks(segs);
  assert.equal(pieces[0].map((p) => p.s).join(''), 'a single lone * asterisk with no partner');
  assert.ok(pieces[0].every((p) => p.kind === ''), 'nothing emphasised');
});

test('[no source] underlines the claim it trails and drops the marker', () => {
  const segs = [{ t: 'text', s: 'The record says it rained. The sky turned green [no source]' }];
  const { pieces } = inlineMdMarks(segs);
  const flat = pieces[0].map((p) => p.s).join('');
  assert.ok(!flat.includes('[no source]'), 'the literal marker is dropped');
  assert.ok(!flat.includes('  '), 'no double space where the marker was');
  // the trailing claim is underlined, the grounded lead-in is not
  const claim = pieces[0].find((p) => /sky turned green/.test(p.s));
  assert.equal(claim.unsourced, true);
  const lead = pieces[0].find((p) => /record says it rained/.test(p.s));
  assert.equal(lead.unsourced, false);
});

test('[no source] underline can itself span an entity', () => {
  const segs = [
    { t: 'text', s: 'Earlier it was calm. Then ' },
    { t: 'ent', s: 'Atlantis', docId: 'd', entId: 'e' },
    { t: 'text', s: ' rose from the sea [no source]' },
  ];
  const { pieces, opaque } = inlineMdMarks(segs);
  assert.equal(opaque[1].unsourced, true, 'the entity inside the unsourced claim is underlined');
  assert.ok(pieces[2].find((p) => /rose from the sea/.test(p.s)).unsourced, 'tail underlined');
  assert.equal(pieces[0].find((p) => /Earlier it was calm/.test(p.s)).unsourced, false, 'grounded lead-in plain');
  assert.ok(!pieces[2].some((p) => p.s.includes('[no source]')), 'marker dropped');
});

test('emphasis and [no source] compose on the same span', () => {
  const segs = [{ t: 'text', s: 'It *definitely* happened [no source]' }];
  const { pieces } = inlineMdMarks(segs);
  const emph = pieces[0].find((p) => p.s === 'definitely');
  assert.equal(emph.kind, 'em');
  assert.equal(emph.unsourced, true, 'the italic word is also inside the unsourced claim');
});
