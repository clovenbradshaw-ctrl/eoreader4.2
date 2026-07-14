// The embedding relevance gate (surfer/retrieve/relevance.js) and its wiring into the curiosity
// walk (turn/research.js): a page is on-topic by MEANING, not by shared tokens, so a same-surname
// namesake (Louis Armstrong under a Neil Armstrong ask) strays off the leash — and a strayed page is
// never saved. Offline: a fake embedder, a fake search, a hand-advanced walk. No model, no network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cosine, bornScore, significanceFloor, renormAdd } from '../src/surfer/retrieve/relevance.js';
import { runCuriousResearch } from '../src/turn/research.js';

const V = (arr) => Float32Array.from(arr);

test('bornScore separates aligned from orthogonal; anti-aligned reads as unrelated, not negative', () => {
  assert.equal(bornScore(V([1, 0]), V([1, 0])), 1);
  assert.equal(bornScore(V([1, 0]), V([0, 1])), 0);
  assert.equal(bornScore(V([1, 0]), V([-1, 0])), 0);   // floored at 0, never "negatively relevant"
  assert.ok(bornScore(V([1, 0]), V([1, 0])) > bornScore(V([2, 1]), V([1, 2])));
  assert.equal(cosine(V([0, 0]), V([1, 1])), 0);       // zero vector → 0, never NaN
});

test('significanceFloor lifts out of a low background but never over an all-on-topic run', () => {
  const leash = 0.34 * 0.9;
  // Drift: a low off-topic bulk. The leash already dominates (the null cannot lower it).
  assert.ok(Math.abs(significanceFloor([0.10, 0.12, 0.09, 0.11, 0.13, 0.08], { baseline: 0.9, ratio: 0.34 }) - leash) < 1e-9);
  // Healthy: an all-on-topic cluster just under the baseline. The null MUST abstain (no separation),
  // so the floor stays at the leash and does not reject the good pages.
  assert.ok(Math.abs(significanceFloor([0.80, 0.82, 0.79, 0.85, 0.83], { baseline: 0.9, ratio: 0.34 }) - leash) < 1e-9);
  // Thin background (< MIN_SAMPLES): abstain → leash.
  assert.ok(Math.abs(significanceFloor([0.2, 0.3], { baseline: 0.9, ratio: 0.34 }) - leash) < 1e-9);
  // A weak baseline where a genuine low background sits ABOVE the leash: the null raises the floor.
  const raised = significanceFloor([0.10, 0.12, 0.09, 0.11, 0.13, 0.08], { baseline: 0.3, ratio: 0.2 });
  assert.ok(raised >= 0.2 * 0.3);
});

test('renormAdd returns a unit vector folding two readings together', () => {
  const r = renormAdd(V([1, 0, 0]), V([0, 1, 0]));
  const norm = Math.hypot(...r);
  assert.ok(Math.abs(norm - 1) < 1e-6);
  assert.ok(r[0] > 0 && r[1] > 0);
});

// A walk seeded on the astronaut. The seed page is about Neil; one lead ("jazz") fetches the Louis
// Armstrong namesake. The fake embedder puts the astronaut on one axis and jazz on another, so the
// two are orthogonal in meaning though they share the token "armstrong".
const mkDoc = (docId, title, text) => ({ doc: { docId, text, web: { title, url: 'http://x/' + docId } }, record: {} });
const NEIL = mkDoc('web-neil', 'Neil Armstrong', 'Neil Armstrong astronaut moon apollo lunar aviator. jazz.');
const LOUIS = mkDoc('web-louis', 'Louis Armstrong', 'Louis Armstrong jazz trumpet music new orleans wonderful world.');
const fakeSearch = async (q) => (String(q).toLowerCase().includes('jazz') ? [LOUIS] : [NEIL]);
const fakeEmbed = async (t) => {
  const s = String(t).toLowerCase();
  const astro = (s.match(/astronaut|moon|apollo|neil|lunar|aviator/g) || []).length;
  const jazz  = (s.match(/jazz|trumpet|music|wonderful|orleans|louis/g) || []).length;
  const n = Math.hypot(astro, jazz) || 1;
  return V([astro / n, jazz / n, 0.001]);
};

test('the meaning leash strays a same-surname namesake, and onKeep never sees it', async () => {
  const kept = [];
  const walk = await runCuriousResearch('neil armstrong astronaut', {
    search: fakeSearch, embed: fakeEmbed, topicText: 'neil armstrong astronaut moon apollo',
    onKeep: (docs) => kept.push(...docs.map((d) => d.docId)), maxHops: 6,
  });
  const strayed = walk.hops.find((h) => h.reason === 'strayed');
  assert.ok(strayed, 'the jazz namesake hop should have strayed');
  assert.match(strayed.query, /jazz/);
  assert.equal(walk.docs.some((d) => d.docId === 'web-louis'), false, 'a strayed page never grounds');
  assert.equal(kept.includes('web-louis'), false, 'a strayed page is never handed to onKeep (never saved)');
  assert.ok(kept.includes('web-neil'), 'the on-topic seed page IS kept and saved');
});

test('with no embedder the walk falls back to the token leash (byte-identical shape)', async () => {
  // A neutral fake search that always returns the seed page — no embedder, so the token path runs.
  const kept = [];
  const walk = await runCuriousResearch('neil armstrong', {
    search: async () => [NEIL], onKeep: (docs) => kept.push(...docs.map((d) => d.docId)), maxHops: 3,
  });
  assert.ok(walk.hops.length >= 1);
  assert.ok(kept.includes('web-neil'));   // onKeep still fires for kept hops even on the token path
});
