import { test } from 'node:test';
import assert from 'node:assert/strict';

import { rrf, rrfScored, RRF_K } from '../src/surfer/retrieve/rrf.js';

// Reciprocal Rank Fusion (docs/retrieval-spec.md §4) — the index-layer fuse across
// a lexical and a dense ranking of span IDs. It reads only POSITION, so it needs no
// score normalization and no tuned weight. These pin the properties the spec leans
// on: agreement compounds, a lone strong channel survives, garbage in one channel
// does not sink a span the other ranks well, and the tape-facing path returns bare
// span IDs (no score crosses the boundary, §9 step 7).

test('a span both channels rank first outranks one only a single channel found', () => {
  const lex = ['a', 'b', 'c'];
  const sem = ['a', 'x', 'y'];
  const fused = rrf([lex, sem]);
  assert.equal(fused[0], 'a', 'concordance across both channels wins the top slot');
  // b (lex rank 2) and x (sem rank 2) are single-channel; a (both) must precede them.
  assert.ok(fused.indexOf('a') < fused.indexOf('b'));
  assert.ok(fused.indexOf('a') < fused.indexOf('x'));
});

test('agreement lifts a span above single-channel noise even when one channel buries it', () => {
  // lex is mostly off-topic and ranks the answer only 3rd; sem ranks it 1st. Because
  // the answer appears in BOTH channels its reciprocal contributions compound and it
  // clears the lone rank-1 noise term — the robustness §4 claims for RRF.
  const lex = ['junk1', 'junk2', 'answer'];
  const sem = ['answer', 'n1', 'n2'];
  const fused = rrf([lex, sem]);
  // answer: 1/(60+3) + 1/(60+1) ≈ 0.0323 ; junk1: 1/(60+1) ≈ 0.0164.
  assert.equal(fused[0], 'answer', 'a corroborated span outranks a lone single-channel hit');
});

test('absence from a channel is never a penalty, only a missing contribution', () => {
  // Two spans: p appears in both at rank 2; q appears in one at rank 1.
  const lex = ['q', 'p'];
  const sem = ['z', 'p'];
  const fused = rrf([lex, sem]);
  // p: 1/(60+2) + 1/(60+2) = 2/62 ≈ 0.0323 ; q: 1/(60+1) = 1/61 ≈ 0.0164.
  assert.equal(fused[0], 'p', 'two middling appearances beat one high-but-lone appearance');
});

test('ties are deterministic — same input, same order (replay depends on it, §6)', () => {
  const a = rrf([['s1', 's2'], ['s3', 's4']]);
  const b = rrf([['s1', 's2'], ['s3', 's4']]);
  assert.deepEqual(a, b);
  // s1 and s3 both sit at rank 1 in their channel → equal score → first-seen wins.
  assert.equal(a[0], 's1');
});

test('rrf returns bare span IDs — no score crosses the boundary (§9 step 7)', () => {
  const fused = rrf([['a', 'b'], ['b', 'a']]);
  for (const el of fused) assert.equal(typeof el, 'string', 'a fused element is a span ID, not a {id,score}');
});

test('rrfScored keeps the score for a search UI, in descending order', () => {
  const scored = rrfScored([['a', 'b', 'c'], ['a', 'c', 'b']]);
  assert.equal(scored[0].spanId, 'a');
  assert.ok(scored[0].score >= scored[1].score);
  assert.ok(scored.every((r) => typeof r.score === 'number' && 'spanId' in r));
});

test('degrades on empty and malformed input rather than throwing', () => {
  assert.deepEqual(rrf([]), []);
  assert.deepEqual(rrf([[]]), []);
  assert.deepEqual(rrf([['a'], null, undefined]), ['a'], 'a non-array ranking is skipped');
  assert.deepEqual(rrf([['a', null, 'b']]), ['a', 'b'], 'a null span ID is skipped');
});

test('k is the standard constant and shifts the reciprocal weights when overridden', () => {
  assert.equal(RRF_K, 60);
  // With a smaller k, rank differences matter more; the top of a single ranking is unchanged.
  const fused = rrf([['a', 'b', 'c']], 10);
  assert.deepEqual(fused, ['a', 'b', 'c']);
});
