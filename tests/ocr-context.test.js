// The OCR reading that edits itself in context — the third layer over the eyes. A shaky line
// is re-read as what it LIKELY MEANS given the document's own confident vocabulary and the
// corpus, as a belief-marked GUESS that lands on the append-only log — auditable, and peelable
// straight back off. These drive it in Node exactly as the reader does: no model, no DOM.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ingestOcr, resolveOcrInContext, revertOcrGuesses } from '../src/organs/in/index.js';
import { CONVERSATIONAL_CAP } from '../src/turn/converse/index.js';

const box = (x0, y0, x1, y1) => ({ x0, y0, x1, y1 });

// A doc whose first line two eyes agree on (confident context) and whose second line only one
// eye saw, with a garble the confident line's own vocabulary can correct.
const shakyDoc = () => ingestOcr({ name: 'scan.png', page: 1, readings: [
  { engine: 'tesseract', lines: [
    { text: 'Anna trusted the contract.',  bbox: box(10, 10, 300, 30), confidence: 95 },
    { text: 'Anna trvsted the contract.',  bbox: box(10, 40, 300, 60), confidence: 60 },  // garble, one eye
  ] },
  { engine: 'florence', lines: [
    { text: 'Anna trusted the contract.',  bbox: box(11, 11, 301, 31), confidence: null },
  ] },
] });

test('a garble on a shaky line is re-read as the confident term — and marked a guess', () => {
  const doc = shakyDoc();
  const before = doc.spans[1].text;
  assert.equal(before, 'Anna trvsted the contract.', 'line 2 starts as the raw, garbled reading');

  const receipt = resolveOcrInContext(doc);
  assert.equal(receipt.edits, 1, 'exactly one line was re-read');
  assert.equal(doc.spans[1].text, 'Anna trusted the contract.', 'the garble is guessed to the confident term');
  assert.equal(doc.spans[1].raw, 'Anna trvsted the contract.', 'the RAW reading is kept, not destroyed');
  assert.equal(doc.spans[1].guessed, true);
  assert.ok(doc.spans[1].ref.belief <= CONVERSATIONAL_CAP + 1e-9, 'a guess is still a seen assertion — under the cap');
  assert.ok(doc.spans[1].ref.rawBelief != null, 'the pre-guess belief is retained for the audit');
  assert.match(receipt.rules[0].evidence, /trusted/, 'the evidence names the term that justified the guess');
});

test('the first line, corroborated by two eyes, is never touched', () => {
  const doc = shakyDoc();
  const l1 = doc.spans[0].text;
  resolveOcrInContext(doc);
  assert.equal(doc.spans[0].text, l1, 'a fully-corroborated line is trusted as-is');
  assert.ok(!doc.spans[0].guessed);
});

test('every guess lands on the append-only log as SEG · INS · DEF · EVA · REC', () => {
  const doc = shakyDoc();
  resolveOcrInContext(doc);
  const log = doc.log.snapshot();
  const id = doc.spans[1].id;
  assert.ok(log.some((e) => e.op === 'SEG' && e.kind === 'retract'), 'the shaky reading is RETRACTED, not deleted');
  assert.ok(log.some((e) => e.op === 'INS' && e.kind === 'guessed' && e.id === id), 'the guess is re-minted as an INS');
  assert.ok(log.some((e) => e.op === 'DEF' && e.key === 'revisedFrom' && e.value === 'Anna trvsted the contract.'), 'provenance: what it was');
  assert.ok(log.some((e) => e.op === 'DEF' && e.key === 'context-evidence'), 'provenance: why');
  assert.ok(log.some((e) => e.op === 'EVA' && e.reason === 'ocr-context-guess'), 'the guess is weighed as an EVA');
  assert.ok(log.some((e) => e.op === 'REC' && e.kind === 'context-unify'), 'the correction rule is learned as a REC');
});

test('char ranges reproject after a length-changing guess, so the address stays exact', () => {
  const doc = shakyDoc();
  resolveOcrInContext(doc);
  // Every span's [charStart,charEnd) must still name its own text in the reconstructed doc.text.
  for (const s of doc.spans) {
    assert.equal(doc.text.slice(s.charStart, s.charEnd), s.text, `${s.id} address matches its text`);
    assert.equal(doc.spanAt(s.charStart)?.id, s.id, 'spanAt resolves the reprojected passage');
  }
});

test('revertOcrGuesses peels the layer back off — and records the reversal', () => {
  const doc = shakyDoc();
  resolveOcrInContext(doc);
  assert.equal(doc.spans[1].text, 'Anna trusted the contract.');

  const { reverted } = revertOcrGuesses(doc);
  assert.equal(reverted, 1);
  assert.equal(doc.spans[1].text, 'Anna trvsted the contract.', 'the raw reading is restored');
  assert.ok(!doc.spans[1].guessed);
  assert.equal(doc.text.slice(doc.spans[1].charStart, doc.spans[1].charEnd), doc.spans[1].text, 'address re-aligned after revert');
  // The reversal is itself on the log — nothing is unwritten, in either direction.
  assert.ok(doc.log.snapshot().some((e) => e.op === 'EVA' && e.reason === 'ocr-guess-reverted'), 'the revert is an auditable act');
});

test('the corpus lexicon corrects a garble no line in the doc could — "what else we have"', () => {
  // A single-eye scan whose only reading garbles a name the DOC never spells right, but the
  // rest of the corpus does. The external lexicon supplies the term.
  const doc = ingestOcr({ name: 'note.png', page: 1, readings: [
    { engine: 'tesseract', lines: [{ text: 'From Darcv, with regards.', bbox: box(0, 0, 300, 20), confidence: 55 }] },
  ] });
  const receipt = resolveOcrInContext(doc, { lexicon: ['Darcy', 'regards'] });
  assert.equal(doc.spans[0].text, 'From Darcy, with regards.', 'the corpus name corrects the garble');
  assert.match(receipt.rules[0].evidence, /Darcy/);
});

test('a clean, fully-corroborated doc is inert — no guess, no log growth', () => {
  const doc = ingestOcr({ name: 'clean.png', page: 1, readings: [
    { engine: 'a', lines: [{ text: 'The meeting adjourned.', bbox: box(0, 0, 300, 20), confidence: 96 }] },
    { engine: 'b', lines: [{ text: 'The meeting adjourned.', bbox: box(1, 1, 301, 21), confidence: 94 }] },
  ] });
  const len = doc.log.length;
  const receipt = resolveOcrInContext(doc);
  assert.equal(receipt.edits, 0, 'nothing to guess when every line is corroborated');
  assert.equal(doc.log.length, len, 'the log did not grow — byte-identical to never running it');
});
