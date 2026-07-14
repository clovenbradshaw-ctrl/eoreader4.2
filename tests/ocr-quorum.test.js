// The OCR quorum — many eyes reading one image, reconciled. These drive the PURE brain
// (organs/in/ocr-quorum.js) and the ingest wiring (organs/in/ocr.js) in Node, exactly as
// the browser drives them. No model, no DOM: an "eye" is just a list of lines with boxes.
//
// What they pin down: the belief spectrum (corroborated > single-eye, everything under the
// witness cap), spatial alignment by mutual-nearest overlap, election of an ACTUAL eye's
// reading (never a stitched line), the learned reliability rule (REC), the disagreement
// flag (EVA), and the byte-identical single-eye fallback.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveOcr, ocrBelief, normBox } from '../src/organs/in/ocr-quorum.js';
import { ingestOcr } from '../src/organs/in/index.js';
import { CONVERSATIONAL_CAP } from '../src/turn/converse/index.js';

// A line box helper — Tesseract's {x0,y0,x1,y1} shape.
const box = (x0, y0, x1, y1) => ({ x0, y0, x1, y1 });

// ── ocrBelief — a reading is an assertion, held below authored text ───────────────

test('ocrBelief: consensus outranks a lone eye, and nothing exceeds the witness cap', () => {
  const corroborated = ocrBelief({ agreement: 1, confidence: 0.9, eyes: 3 });
  const split        = ocrBelief({ agreement: 0.5, confidence: 0.9, eyes: 2 });
  const singleEye    = ocrBelief({ agreement: null, confidence: 0.9, eyes: 1 });

  assert.ok(corroborated > split, 'agreement lifts belief above a split reading');
  assert.ok(corroborated > singleEye, 'two agreeing eyes beat one confident eye');
  for (const b of [corroborated, split, singleEye])
    assert.ok(b <= CONVERSATIONAL_CAP + 1e-9, `an OCR line is SEEN, never authored — capped at ${CONVERSATIONAL_CAP}`);
  // A single eye is one of the two witnesses corroboration asks for — at most half-believed.
  assert.ok(singleEye <= CONVERSATIONAL_CAP * 0.5 + 1e-9, 'a lone eye tops out at the single-eye ceiling');
});

test('ocrBelief: full agreement with no per-line confidence still reaches the ceiling', () => {
  // A VLM eye reports no confidence; two of them agreeing is pure consensus.
  assert.equal(ocrBelief({ agreement: 1, confidence: null, eyes: 2 }), CONVERSATIONAL_CAP);
});

// ── normBox — every eye's geometry, in one shape ─────────────────────────────────

test('normBox accepts Tesseract rects, xywh arrays, and VLM quads', () => {
  assert.deepEqual(normBox({ x0: 10, y0: 20, x1: 110, y1: 44 }), { x0: 10, y0: 20, x1: 110, y1: 44 });
  assert.deepEqual(normBox([10, 20, 100, 24]), { x0: 10, y0: 20, x1: 110, y1: 44 });
  assert.deepEqual(normBox([10, 20, 110, 20, 110, 44, 10, 44]), { x0: 10, y0: 20, x1: 110, y1: 44 });
  assert.equal(normBox(null), null);
});

// ── alignment + election — DEF the reading, EVA the frames ────────────────────────

test('three eyes on two lines: overlapping boxes align, the majority reading is elected', () => {
  // Line 1 at y≈20, line 2 at y≈60. Eye C misreads line 1 ("trvsted"); all agree on line 2.
  const q = resolveOcr([
    { engine: 'tesseract', lines: [
      { text: 'Anna trusted Ben.', bbox: box(10, 18, 200, 40), confidence: 92 },
      { text: 'The deal closed.',  bbox: box(10, 58, 200, 80), confidence: 95 },
    ] },
    { engine: 'florence', lines: [
      { text: 'Anna trusted Ben.', bbox: box(12, 20, 198, 41), confidence: 88 },
      { text: 'The deal closed.',  bbox: box(11, 60, 199, 81), confidence: 90 },
    ] },
    { engine: 'paddle', lines: [
      { text: 'Anna trvsted Ben.', bbox: box(11, 19, 201, 42), confidence: 70 },
      { text: 'The deal closed.',  bbox: box(10, 59, 200, 82), confidence: 85 },
    ] },
  ]);

  assert.equal(q.blocks.length, 2, 'the three eyes reduce to the two physical lines');

  const l1 = q.blocks[0];
  assert.equal(l1.text, 'Anna trusted Ben.', 'the two-eye majority reading wins over the lone misread');
  assert.equal(l1.ref.eyes, 3, 'all three eyes are recorded as witnesses to line 1');
  assert.ok(Math.abs(l1.ref.agreement - 2 / 3) < 1e-3, 'agreement is 2 of 3 eyes');
  assert.equal(l1.ref.disagreement, true, 'the split is flagged, not silently trusted');
  const dissenter = l1.ref.witnesses.find((w) => w.engine === 'paddle');
  assert.equal(dissenter.agreed, false, 'the misreading eye is marked as not agreeing');

  const l2 = q.blocks[1];
  assert.equal(l2.ref.agreement, 1, 'line 2 is unanimous');
  assert.equal(l2.ref.disagreement, false);
  assert.ok(l2.ref.belief > l1.ref.belief, 'the unanimous line is believed more than the split one');
});

test('the elected reading is one an eye actually produced — never a per-character stitch', () => {
  // Two distinct misreads and one clean read of the same line; the clean one must be elected
  // verbatim (casing + punctuation), not a Frankenstein assembled from the three.
  const q = resolveOcr([
    { engine: 'a', lines: [{ text: 'Q3 revenue: $37,800.', bbox: box(0, 0, 300, 20), confidence: 96 }] },
    { engine: 'b', lines: [{ text: 'Q3 revenue: $37,8OO.', bbox: box(0, 1, 300, 21), confidence: 60 }] },
    { engine: 'c', lines: [{ text: 'Q3 revenue $378OO',    bbox: box(0, 0, 300, 20), confidence: 55 }] },
  ]);
  const surfaces = new Set(['Q3 revenue: $37,800.', 'Q3 revenue: $37,8OO.', 'Q3 revenue $378OO']);
  assert.ok(surfaces.has(q.blocks[0].text), 'the elected line is verbatim from some eye');
  assert.equal(q.blocks[0].text, 'Q3 revenue: $37,800.', 'the most confident of the tied surfaces is elected');
});

// ── REC — the learned reliability rule ("which eye is best") ──────────────────────

test('reliability is learned from agreement with the consensus, and names the best eye', () => {
  const q = resolveOcr([
    { engine: 'steady', lines: [
      { text: 'alpha', bbox: box(0, 0, 100, 20), confidence: 90 },
      { text: 'bravo', bbox: box(0, 30, 100, 50), confidence: 90 },
      { text: 'charlie', bbox: box(0, 60, 100, 80), confidence: 90 },
    ] },
    { engine: 'good', lines: [
      { text: 'alpha', bbox: box(1, 1, 101, 21), confidence: 80 },
      { text: 'bravo', bbox: box(1, 31, 101, 51), confidence: 80 },
      { text: 'charlie', bbox: box(1, 61, 101, 81), confidence: 80 },
    ] },
    { engine: 'shaky', lines: [
      { text: 'alpha',  bbox: box(2, 2, 102, 22), confidence: 50 },
      { text: 'bravo',  bbox: box(2, 32, 102, 52), confidence: 50 },
      { text: 'charleye', bbox: box(2, 62, 102, 82), confidence: 50 },  // one miss
    ] },
  ]);

  const rel = Object.fromEntries(q.reliability.map((r) => [r.engine, r.reliability]));
  assert.equal(rel.steady, 1, 'steady matched the consensus every checked line');
  assert.equal(rel.good, 1);
  assert.ok(Math.abs(rel.shaky - 2 / 3) < 1e-3, 'shaky missed one of three checked lines');
  assert.ok(q.best === 'steady' || q.best === 'good', 'the best eye is one that never dissented');
  // The rule rides the ledger as REC events, plus a DEF of the winner.
  assert.ok(q.ledger.some((e) => e.op === 'REC' && e.kind === 'eye-reliability'), 'REC events record each eye');
  assert.ok(q.ledger.some((e) => e.op === 'DEF' && e.kind === 'most-reliable-eye'), 'a DEF names the best eye');
  assert.ok(q.ledger.some((e) => e.op === 'EVA'), 'the disagreement is weighed as an EVA');
});

// ── the single-eye case — kept, but flagged as uncorroborated ─────────────────────

test('a line only one eye saw is kept, believed low, and flagged single-eye', () => {
  const q = resolveOcr([
    { engine: 'tesseract', lines: [
      { text: 'shared line', bbox: box(0, 0, 100, 20), confidence: 90 },
      { text: 'only tesseract saw this', bbox: box(0, 30, 100, 50), confidence: 95 },
    ] },
    { engine: 'florence', lines: [
      { text: 'shared line', bbox: box(1, 1, 101, 21), confidence: 88 },
    ] },
  ]);
  const lone = q.blocks.find((b) => b.text === 'only tesseract saw this');
  assert.equal(lone.ref.eyes, 1, 'one eye');
  assert.ok(lone.ref.belief <= CONVERSATIONAL_CAP * 0.5 + 1e-9, 'a lone eye is believed at most half');
  assert.ok(q.disagreements.some((d) => d.kind === 'single-eye' && d.readings[0].text === 'only tesseract saw this'));
});

// ── the ingest wiring — the quorum lands on the spine ─────────────────────────────

test('ingestOcr(readings) assembles the reconciled doc and lays DEF/EVA/REC on the log', () => {
  const doc = ingestOcr({ name: 'scan.png', page: 1, readings: [
    { engine: 'tesseract', lines: [
      { text: 'Anna trusted Ben.', bbox: box(10, 18, 200, 40), confidence: 92 },
      { text: 'The deal closed.',  bbox: box(10, 58, 200, 80), confidence: 95 },
    ] },
    { engine: 'florence', lines: [
      { text: 'Anna trvsted Ben.', bbox: box(12, 20, 198, 41), confidence: 70 },
      { text: 'The deal closed.',  bbox: box(11, 60, 199, 81), confidence: 90 },
    ] },
  ] });

  assert.match(doc.text, /Anna trusted Ben\./, 'the elected reading is in the reconstructed text');
  assert.equal(doc.spans.length, 2);
  assert.equal(doc.quorum.eyes.length, 2, 'the doc records the eyes that read it');
  assert.ok(Array.isArray(doc.reliability) && doc.reliability.length === 2, 'the learned rule rides the doc');
  assert.ok(Array.isArray(doc.belief) && doc.belief.length === 2, 'per-line belief rides the doc');

  const log = doc.log.snapshot();
  assert.ok(log.some((e) => e.op === 'EVA' && /disagree/.test(e.reason || '')), 'the split line is an EVA on the log');
  assert.ok(log.some((e) => e.op === 'REC'), 'the reliability rule is REC on the log');
  // The EVA points at a real span the reader can open.
  const eva = log.find((e) => e.op === 'EVA' && /disagree/.test(e.reason || ''));
  assert.ok(doc.spans.some((s) => s.id === eva.id), 'the EVA names an addressable line');
});

test('ingestOcr with a single eye reads exactly like a single-witness scan (fallback parity)', () => {
  // The multi-eye path with ONE eye must land the same lines as the classic single-list path.
  const classic = ingestOcr({ name: 'p.png', page: 2, lines: [
    { text: 'one line here', bbox: { x0: 5, y0: 5, x1: 105, y1: 25 }, confidence: 91 },
  ] });
  const quorum = ingestOcr({ name: 'p.png', page: 2, readings: [
    { engine: 'tesseract', lines: [{ text: 'one line here', bbox: { x0: 5, y0: 5, x1: 105, y1: 25 }, confidence: 91 }] },
  ] });
  assert.equal(quorum.text, classic.text, 'the same text lands either way');
  assert.equal(quorum.spans.length, classic.spans.length);
  assert.equal(quorum.spans[0].text, classic.spans[0].text);
});
