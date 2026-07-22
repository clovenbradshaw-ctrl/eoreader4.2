// TIER 3 — Segmentation, the one gold set (docs/parse-conformance-spec.md).
// "Unit boundaries are the coordinate system for every other signal. A bad
// split does not degrade the waveform gracefully; it invents a turn."
//
// Segmenter under test: segmentSentences (src/perceiver/parse/sentences.js) —
// a pure `string -> string[]` function, no offsets, called directly for #12
// (fast, no full parse needed) and via readWithSeed/doc.sentences for #11/#13
// (the real pipeline, matching how every other tier reads).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { segmentSentences } from '../src/perceiver/parse/sentences.js';
import { loadFixture } from './conformance/harness/fixtures.js';
import { readWithSeed } from './conformance/harness/read.js';
import { deriveUnitOffsets, contentCharCount } from './conformance/harness/offsets.js';
import { GOLD_SETS } from './conformance/gold/segmentation-boundaries.js';

// ── #11 — Hand-labeled boundary set: precision/recall against a committed baseline ──
//
// A boundary is the end offset of a unit. Precision/recall is computed over
// the SET of boundary offsets each side produces (not over unit text, since
// two unit sequences with a shifted split still share every boundary except
// the ones that actually differ). See tests/conformance/gold/
// segmentation-boundaries.js for the six real segmentation bugs this
// baseline was built from, and its header for the hand-labeling method.
const boundarySet = (text, units) => {
  const offs = deriveUnitOffsets(text, units);
  assert.ok(offs.every((o) => o.ok), 'offset recovery failed while scoring a gold set — the gold unit text is not a subsequence of its source');
  return new Set(offs.map((o) => o.end));
};

const scoreFixture = (text, predicted, gold) => {
  const predEnds = boundarySet(text, predicted);
  const goldEnds = boundarySet(text, gold);
  let tp = 0, fp = 0, fn = 0;
  for (const e of predEnds) if (goldEnds.has(e)) tp++; else fp++;
  for (const e of goldEnds) if (!predEnds.has(e)) fn++;
  return { tp, fp, fn };
};

// Committed baseline (docs/parse-conformance-spec.md #11: "Track the number
// as a committed baseline; a PR that lowers recall needs a written
// justification in the PR body"). These are the EXACT tp/fp/fn this suite
// measures today — a change to segmentSentences that alters them, in either
// direction, must update this file deliberately, not incidentally.
const BASELINE = {
  'muni-council-minutes-01': { tp: 41, fp: 2, fn: 1 },
  'legal-order-01': { tp: 34, fp: 9, fn: 1 },
};

test('Tier3 #11: hand-labeled boundary set — precision/recall against the committed baseline', async () => {
  const FIXTURE_TEXT = {
    'muni-council-minutes-01': loadFixture('muni-council-minutes-01').text,
    'legal-order-01': loadFixture('legal-order-01').text,
  };
  let grand = { tp: 0, fp: 0, fn: 0 };
  for (const { fixtureId, units: gold } of GOLD_SETS) {
    const text = FIXTURE_TEXT[fixtureId];
    assert.ok(text, `${fixtureId}: no fixture text loaded for this gold set entry`);

    // The gold set must be a content-preserving relabeling of the source —
    // never a hand-authored paraphrase — so a discrepancy against the
    // baseline can only ever be a real boundary disagreement, not a typo.
    const predicted = segmentSentences(text);
    assert.equal(
      gold.reduce((n, u) => n + contentCharCount(u), 0),
      contentCharCount(text),
      `${fixtureId}: gold set content-character count != source content-character count — the gold set was mistyped, not just re-boundaried`,
    );

    const { tp, fp, fn } = scoreFixture(text, predicted, gold);
    const baseline = BASELINE[fixtureId];
    assert.deepEqual({ tp, fp, fn }, baseline,
      `${fixtureId}: measured {tp:${tp},fp:${fp},fn:${fn}} != committed baseline {tp:${baseline.tp},fp:${baseline.fp},fn:${baseline.fn}} — segmentSentences' behavior on this fixture changed. If this is a deliberate improvement, update BASELINE here with a note; if recall (tp/(tp+fn)) dropped, the spec requires a written justification in the PR body.`);
    grand.tp += tp; grand.fp += fp; grand.fn += fn;
  }
  const precision = grand.tp / (grand.tp + grand.fp);
  const recall = grand.tp / (grand.tp + grand.fn);
  assert.ok(precision > 0.85 && precision < 0.9, `combined precision ${precision.toFixed(4)} moved outside the committed [0.85, 0.9) band`);
  assert.ok(recall > 0.97, `combined recall ${recall.toFixed(4)} dropped below the committed 0.97 floor — recall drops need a written justification (spec #11)`);
});

// ── #12 — Adversarial boundary battery ───────────────────────────────────────
// Named cases with a verified expected unit count. Split into two groups:
// cases the segmenter gets right (asserted directly) and confirmed real
// gaps (test.todo, per this suite's established policy of measuring and
// documenting rather than weakening an assertion to force a pass). Every
// count below was produced by actually running segmentSentences, not
// predicted by inspection — see the PR description for the verification
// transcript.
const CORRECT_CASES = [
  { name: 'abbreviation: Rev. Dr. title', text: 'Rev. Dr. Martin gave the invocation. The meeting began.', expected: 2 },
  { name: 'abbreviation: Inc.', text: 'Acme Inc. announced a merger. Shares rose.', expected: 2 },
  { name: 'abbreviation: et al.', text: 'Smith et al. filed the brief. It was denied.', expected: 2 },
  { name: 'abbreviation: No. (docket/case number)', text: 'See No. 25-CH-0417 for the docket entry. Review it.', expected: 2 },
  { name: 'docket/case number', text: 'No. 25-CH-0417 was filed. It is pending.', expected: 2 },
  { name: 'decimal in money', text: 'The invoice totaled $1,234.56 for services. Payment is due.', expected: 2 },
  { name: 'decimal percent', text: 'The rate is 3.14 percent this year. It rose.', expected: 2 },
  { name: 'ALL-CAPS header, no terminal punctuation', text: 'SECTION ONE\nThe text follows here as prose. It continues.', expected: 3 },
  { name: 'enumerated list (colon not a boundary in isolated modern prose)', text: 'The requirements are: (a) apples. (b) oranges. (c) pears.', expected: 3 },
  { name: 'OCR line-wrap hyphenation (boundary count unaffected by dehyphenation quality)', text: 'The docu-\nment was filed on time. It was reviewed.', expected: 2 },
  { name: 'hard line break mid-sentence in fixed-width text', text: 'The council reviewed the\nmatter and voted to approve\nthe item without further delay.', expected: 1 },
  { name: 'no terminal punctuation at EOF', text: 'The meeting adjourned at five', expected: 1 },
  { name: 'no terminal punctuation at EOF, with a prior sentence', text: 'The clerk read the minutes. The meeting adjourned at five', expected: 2 },
];

test('Tier3 #12: adversarial boundary battery — cases the segmenter handles correctly', () => {
  for (const { name, text, expected } of CORRECT_CASES) {
    const units = segmentSentences(text);
    assert.equal(units.length, expected, `"${name}": expected ${expected} units, got ${units.length} — ${JSON.stringify(units)}`);
  }
});

const GAP_CASES = [
  {
    name: 'abbreviation: citation string (Tenn. Code Ann. §)',
    text: 'See Tenn. Code Ann. § 39-13-101 for the rule.',
    actual: 3, ideal: 1,
    why: '"Tenn" and "Ann" are not in conventions/ledger.js SEED_ABBREVIATIONS — the same finding the gold set documents for legal-order-01\'s statute citation.',
  },
  {
    name: 'abbreviation: "v." (versus, unseeded — unlike the seeded "vs")',
    text: 'The case is Smith v. Jones. It was decided.',
    actual: 3, ideal: 2,
    why: '"v" is not in SEED_ABBREVIATIONS (only "vs" is) — the same finding the gold set documents for legal-order-01\'s case caption.',
  },
  {
    name: 'ellipsis mid-sentence',
    text: 'Wait... he said, trailing off. Then he left.',
    actual: 3, ideal: 2,
    why: 'the final "." of "..." is scanned as an independent floor character, followed by whitespace, so it cuts a sentence-final mark out of what is actually a mid-sentence pause.',
  },
  {
    name: 'quotation whose terminal punctuation precedes the close quote',
    text: 'She said, "Stop." He froze. Then "Go!" she shouted. He ran.',
    actual: 3, ideal: 4,
    why: 'a period/exclamation immediately before a closing quote is never even considered a candidate boundary (isFloor requires the NEXT char to be whitespace/end, and here it is the closing quote) — correct for "Go!" she shouted (mid-sentence attribution, should not split), but also suppresses the genuine boundary after "Stop." since the scanner never looks past the closing quote to see a fresh capitalized sentence follows.',
  },
  {
    name: 'parenthetical containing a full sentence',
    text: 'The rule applies here. (This is true.) And so it goes.',
    actual: 2, ideal: 3,
    why: 'the period inside "(This is true.)" is followed by ")" not whitespace, so it is never a candidate boundary, and nothing else in the scanner treats ")" as one either — the parenthetical sentence silently welds onto what follows it.',
  },
  {
    name: 'footnote marker directly after the period (no space)',
    text: 'The rule applies.1 It is clear. The court agreed.',
    actual: 2, ideal: 3,
    why: 'the period in "applies.1" is followed by the digit "1", not whitespace, so isFloor never even considers it a candidate boundary — the footnote-marked sentence and the one after it weld together.',
  },
  {
    name: 'table row leaked into the text layer, ending in the word "No"',
    text: 'Name          Votes\nReyes         Yes\nVance         No\nThe motion carried.',
    actual: 3, ideal: 4,
    why: '"No" is the literal last word of a table cell, but CONTINUATION_TAIL (sentences.js) also contains the structural word "no" (as in "there was no time") — the heading-line heuristic reads the vote value as a wrapped clause and soft-wraps the row onto the following sentence instead of cutting.',
  },
];

for (const { name, text, actual, ideal, why } of GAP_CASES) {
  test(`Tier3 #12 GAP: ${name} (measured ${actual}, ideal ${ideal})`, { todo: `KNOWN GAP, confirmed — ${why}` }, () => {
    const units = segmentSentences(text);
    assert.equal(units.length, ideal, `expected the ideal ${ideal} units; segmentSentences currently produces ${units.length}: ${JSON.stringify(units)}`);
  });
}

// A passing companion to the GAP_CASES above: whatever the boundary COUNT,
// every gap case must still round-trip its content losslessly (Tier 2's
// partition law, restated locally) — a wrong split is a real bug, but it
// must never also be a content-dropping one.
test('Tier3 #12: every adversarial case (correct or gap) conserves content — no split ever drops a character', () => {
  for (const { text } of [...CORRECT_CASES, ...GAP_CASES]) {
    const units = segmentSentences(text);
    const offs = deriveUnitOffsets(text, units);
    assert.ok(offs.every((o) => o.ok), `content-conservation check itself failed to relocate a unit for: ${JSON.stringify(text)}`);
    assert.equal(units.reduce((n, u) => n + contentCharCount(u), 0), contentCharCount(text));
  }
});

// ── #13 — Reflow invariance ──────────────────────────────────────────────────
// "Re-wrapping a document at 40/72/120 columns, or normalizing CRLF<->LF, or
// adding/removing a trailing newline, must not change unit boundaries
// (modulo the offset map)."
//
// Measured split: whitespace-only reflow (CRLF normalization, a trailing
// newline added/removed, doubled inter-word spacing) IS invariant — verified
// below, and consistent with Tier 2 #9's narrower offset-recovery check.
// Column rewrapping is NOT invariant: it introduces new single-newlines at
// arbitrary word-boundary positions, and segmentSentences' heading-vs-soft-
// wrap heuristic (sentences.js isHeadingLine) decides per PHYSICAL line, so
// a rewrap can create or destroy a heading cut the original layout never
// presented (confirmed on this fixture at columns 40, 72, and 120 alike,
// including in body paragraphs with no heading content at all — the
// heuristic is reflow-fragile by construction, not just at document titles).
const wordWrap = (text, width) =>
  text.split('\n\n').map((para) =>
    para.split(/\s+/).filter(Boolean).reduce((lines, word) => {
      if (!lines.length) return [word];
      const last = lines[lines.length - 1];
      return (last.length + 1 + word.length <= width)
        ? [...lines.slice(0, -1), `${last} ${word}`]
        : [...lines, word];
    }, []).join('\n')
  ).join('\n\n');

test('Tier3 #13: reflow invariance — whitespace-only reformatting never changes unit boundaries', () => {
  const base = loadFixture('muni-council-minutes-01').text;
  const baseUnits = segmentSentences(base);
  const variants = {
    'CRLF line endings': base.replace(/\n/g, '\r\n'),
    'trailing newline added': base + '\n\n\n',
    'trailing newline removed': base.replace(/\s+$/, ''),
    'doubled inter-word spacing': base.replace(/ /g, '  '),
  };
  for (const [label, text] of Object.entries(variants)) {
    const units = segmentSentences(text);
    assert.deepEqual(units, baseUnits, `${label}: unit sequence changed under a whitespace-only reformat`);
  }
});

test.todo('Tier3 #13 GAP, confirmed — column rewrapping (40/72/120) changes unit boundaries because the heading-vs-soft-wrap heuristic decides per physical line', () => {
  const base = loadFixture('muni-council-minutes-01').text;
  const baseUnits = segmentSentences(base);
  for (const width of [40, 72, 120]) {
    const units = segmentSentences(wordWrap(base, width));
    assert.deepEqual(units, baseUnits, `rewrap at ${width} columns changed the unit sequence`);
  }
});

// ── #14 — Unicode normalization invariance ───────────────────────────────────
// "NFC vs. NFD input yields the same unit count and the same referent set.
// Straight vs. curly quotes and hyphen-vs-en-dash likewise."
test('Tier3 #14: unicode normalization invariance — unit count, straight/curly quotes, hyphen/en-dash', async () => {
  const nfcText = 'François Müller called the meeting to order. He called it to order.';
  assert.equal(segmentSentences(nfcText.normalize('NFD')).length, segmentSentences(nfcText).length,
    'NFD input produced a different unit count than NFC input');

  const straight = 'She said, "Stop now." He froze in place.';
  const curly = 'She said, “Stop now.” He froze in place.';
  assert.equal(segmentSentences(curly).length, segmentSentences(straight).length,
    'curly quotes produced a different unit count than straight quotes');

  const hyphen = 'The well-known council member spoke. The vote followed.';
  const endash = 'The well–known council member spoke. The vote followed.';
  assert.equal(segmentSentences(endash).length, segmentSentences(hyphen).length,
    'en-dash produced a different unit count than a hyphen');
});

// GAP, confirmed: the referent SET (not just unit count) is NOT NFC/NFD-
// invariant. Root cause: name admission matches runs of \p{L} (Letter);
// Unicode combining diacritical marks (NFD's decomposed accents) are
// category Mn (Mark, nonspacing), NOT \p{L}, so a name match under NFD input
// stops at the base letter, right before the accent — "François" -> "Franc",
// "Müller" -> "Mu". This is the same class of gap Tier 4's rename-isomorphism
// file found in nameWordsOf's own admitted-label filtering, on the admission
// side of the pipeline instead.
test.todo('Tier3 #14 GAP, confirmed — NFD input truncates admitted referent labels at the first combining diacritical mark', async () => {
  const nfcText = 'François Müller called the meeting to order. Müller then read the minutes. Everyone present agreed with François.';
  const docNfc = await readWithSeed(nfcText, { seed: 'tier3-14-nfc' });
  const docNfd = await readWithSeed(nfcText.normalize('NFD'), { seed: 'tier3-14-nfd' });
  assert.deepEqual(
    new Set([...docNfd.admission.admitted.keys()]),
    new Set([...docNfc.admission.admitted.keys()]),
    'NFD input admitted a different referent-label set than NFC input',
  );
});
