// renderBound marks the zero-contact claim — the "prose from nowhere" a grounded
// answer must not pass off as sourced. This pins the shipped woodpeckers leak: the
// false sentence "They're social birds and are often seen in flocks." bound at
// score 0 (in no retrieved span) yet rendered indistinguishable from the cited
// claims, then became the premise of the follow-up turn. Under `mark`, a zero-contact
// uncited claim wears an honest [no source] tag; a cited or contacted claim does not.
// Default (mark off) stays byte-identical so bindAndVeto and the weld are untouched.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderBound, UNSOURCED_MARK } from '../src/enactor/ground/bind.js';

const bound = [
  { claim: 'Woodpeckers belong to the family Picidae.', citation: 's0', score: 0.48 },
  { claim: 'They come in a range of sizes.', citation: null, score: 0.30 },        // contact, uncited
  { claim: 'They are social birds often seen in flocks.', citation: null, score: 0 }, // prose from nowhere
];

test('mark off — default render is byte-identical (parity for bindAndVeto / weld)', () => {
  const out = renderBound(bound);
  assert.equal(
    out,
    'Woodpeckers belong to the family Picidae. [s0] They come in a range of sizes. They are social birds often seen in flocks.',
  );
  assert.ok(!out.includes(UNSOURCED_MARK), 'no marker without the opt-in');
});

test('mark on — only the zero-contact claim is tagged', () => {
  const out = renderBound(bound, { mark: true });
  // The cited claim keeps its citation and gains no marker.
  assert.ok(out.includes('Picidae. [s0]'));
  assert.ok(!out.includes(`Picidae. [s0] ${UNSOURCED_MARK}`));
  // The contacted-but-uncited paraphrase is left alone — it touched a span.
  assert.ok(!out.includes(`range of sizes. ${UNSOURCED_MARK}`));
  // The prose-from-nowhere claim wears its provenance.
  assert.ok(out.includes(`often seen in flocks. ${UNSOURCED_MARK}`), 'zero-contact claim is marked');
  // Exactly one marker, on the one fabricated claim.
  assert.equal(out.split(UNSOURCED_MARK).length - 1, 1);
});

test('mark on — an edge-grounded claim (graph-witnessed) is never marked', () => {
  const edge = [{ claim: 'Grete is Gregor’s sister.', citation: 's7', edgeGrounded: true, score: 0 }];
  const out = renderBound(edge, { mark: true });
  assert.ok(!out.includes(UNSOURCED_MARK), 'a graph-witnessed claim is grounded, not prose from nowhere');
});
