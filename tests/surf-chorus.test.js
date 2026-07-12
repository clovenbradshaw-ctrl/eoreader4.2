import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { surfFold, chorusStops, multiLevelSurf, keepSources, sourceRanges, threadBasis } from '../src/surfer/index.js';
import { createCompositeDoc } from '../src/organs/in/composite.js';

// A document whose loudest surprise is OFF the question and whose on-topic content is a plain,
// low-surprise list — the discourse-awareness stress case the chorus exists for.
const STORY = `The weather turned bitterly cold overnight and a sudden storm knocked out all the power.
A dramatic explosion rocked the crowded harbor, shocking everyone who witnessed the terrible blast.
The best remembered US presidents were Abraham Lincoln, George Washington, and Franklin Roosevelt.
Historians consistently rank these three presidents at the very top of every survey they conduct.
Then a violent earthquake split the ground apart and swallowed the old stone lighthouse whole.`;

const QUERY = 'list the best US presidents according to historians';

// ── PARITY: the chorus is a true no-op when opts.chorus is unset ────────────────
test('chorus off → surfFold is byte-identical (parity gate)', () => {
  const doc = parseText(STORY, { docId: 's' });
  const a = surfFold(doc, 1);
  const b = surfFold(doc, 1, {});
  const c = surfFold(doc, 1, { chorus: undefined });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(JSON.stringify(a), JSON.stringify(c));
  assert.equal(a.rode, 'bayesian-figure');
  assert.ok(!('chorus' in a) && !('report' in a));
});

// ── the chorus fires, is pure, and is deterministic ────────────────────────────
test('chorus on → rode="chorus", pure read, deterministic', () => {
  const doc = parseText(STORY, { docId: 's' });
  const before = doc.log.snapshot ? doc.log.snapshot().length : doc.log.events.length;
  const thread = threadBasis({ query: QUERY, doc });
  const s1 = surfFold(doc, 0, { chorus: thread });
  const s2 = surfFold(doc, 0, { chorus: thread });
  assert.equal(s1.rode, 'chorus');
  assert.equal(JSON.stringify(s1), JSON.stringify(s2), 'deterministic');
  const after = doc.log.snapshot ? doc.log.snapshot().length : doc.log.events.length;
  assert.equal(before, after, 'a pure read — nothing appended to the log');
  // shape is preserved: exactly the base keys, in the same set.
  assert.deepEqual(Object.keys(s1).sort(), ['anchor', 'field', 'focus', 'peak', 'recCursors', 'recAxes', 'rode', 'stops'].sort());
});

// ── discourse-awareness: the chorus keeps the question-relevant list rows ────────
test('chorus surfaces the thread-relevant rows a bare surf can miss', () => {
  const doc = parseText(STORY, { docId: 's' });
  const thread = threadBasis({ query: QUERY, doc });
  const ch = surfFold(doc, 0, { chorus: thread });
  // sentences 2 and 3 are the presidents/historians rows — the literal thread witnesses.
  assert.ok(ch.stops.includes(2) || ch.stops.includes(3),
    `chorus keeps a presidents/historians row (stops=${JSON.stringify(ch.stops)})`);
});

// ── the safety-net: a reach too thin to tell signal from chance defers to today ──
test('chorus abstains on a thin reach and defers to the median rule', () => {
  const doc = parseText(STORY, { docId: 's' });
  // a 1-cursor reach: nothing for a null to fit → chorusStops returns null.
  const ctx = { field: [{ idx: 0, focus: null, bayes: 0.5, surprisalBits: 3 }], readings: [{ bayes: 0.5, predicted: { figures: [] } }], a: 0, recCursors: [], maxStops: 5, doc, alpha: 0.05 };
  const out = chorusStops(ctx, { chorus: threadBasis({ query: QUERY, doc }) });
  assert.equal(out, null, 'thin reach → null → surfFold runs its incumbent arrest');
});

// ── sourceRanges over a composite ───────────────────────────────────────────────
test('sourceRanges maps a composite to contiguous per-source ranges', () => {
  const a = parseText('Alpha one. Alpha two.', { docId: 'A' });
  const b = parseText('Beta one. Beta two. Beta three.', { docId: 'B' });
  const comp = createCompositeDoc([a, b]);
  const ranges = sourceRanges(comp);
  assert.equal(ranges.length, 2);
  assert.equal(ranges[0].docId, 'A');
  assert.equal(ranges[1].docId, 'B');
  assert.equal(ranges[0].lo, 0);
  assert.equal(ranges[1].lo, ranges[0].hi + 1);
  // a non-composite doc is one source spanning the whole axis.
  const solo = sourceRanges(a);
  assert.equal(solo.length, 1);
  assert.equal(solo[0].lo, 0);
});

// ── LEVEL 1: keepSources drops off-topic sources when there are enough to judge ──
test('level-1 keepSources drops off-topic sources, keeps the relevant one', () => {
  const twitter = parseText('Twitter migrated its backend from Ruby to Scala and built FlockDB. Jack Dorsey discussed the RPC framework Finagle. The service moved to the JVM.', { docId: 'web-twitter' });
  const weather = parseText('A cold front swept across the plains overnight. Meteorologists warned of heavy snow. The blizzard closed every highway.', { docId: 'web-weather' });
  const cooking = parseText('The recipe calls for two cups of flour and a pinch of salt. Knead the dough until smooth. Bake at high heat.', { docId: 'web-cooking' });
  const sports  = parseText('The striker scored a hat-trick in the final. The goalkeeper made a stunning save. The stadium erupted.', { docId: 'web-sports' });
  const pres    = parseText('The best US presidents were Abraham Lincoln and George Washington. Historians rank these presidents at the top of every survey. Franklin Roosevelt also ranks among the greatest presidents.', { docId: 'web-presidents' });
  const comp = createCompositeDoc([twitter, weather, cooking, sports, pres]);
  const thread = threadBasis({ query: QUERY, doc: comp });
  const anchor = sourceRanges(comp).find(r => r.docId === 'web-presidents').lo;
  const keep = keepSources(comp, thread, { anchor });
  assert.equal(keep.abstained, false, 'with 5 sources the null resolves');
  assert.ok(keep.kept.has('web-presidents'), 'the on-topic source is kept');
  assert.ok(!keep.kept.has('web-twitter'), 'an off-topic source is dropped');
  assert.ok(!keep.kept.has('web-cooking'), 'an off-topic source is dropped');
});

// ── LEVEL 1 + 2: the merged surf lands its peak/focus in the relevant source ─────
test('multiLevelSurf peaks in the relevant source, not an off-topic neighbour', () => {
  const twitter = parseText('Twitter migrated its backend from Ruby to Scala and built FlockDB. Jack Dorsey discussed the RPC framework Finagle. The service moved to the JVM.', { docId: 'web-twitter' });
  const weather = parseText('A cold front swept across the plains overnight. Meteorologists warned of heavy snow. The blizzard closed every highway.', { docId: 'web-weather' });
  const cooking = parseText('The recipe calls for two cups of flour and a pinch of salt. Knead the dough until smooth. Bake at high heat.', { docId: 'web-cooking' });
  const sports  = parseText('The striker scored a hat-trick in the final. The goalkeeper made a stunning save. The stadium erupted.', { docId: 'web-sports' });
  const pres    = parseText('The best US presidents were Abraham Lincoln and George Washington. Historians rank these presidents at the top of every survey. Franklin Roosevelt also ranks among the greatest presidents.', { docId: 'web-presidents' });
  const comp = createCompositeDoc([twitter, weather, cooking, sports, pres]);
  const thread = threadBasis({ query: QUERY, doc: comp });
  const presRange = sourceRanges(comp).find(r => r.docId === 'web-presidents');
  // even anchored in an OFF-TOPIC source, the read should land in the relevant one.
  const ml = multiLevelSurf(comp, 0, { chorus: thread });
  assert.match(ml.rode, /chorus/);
  assert.ok(ml.peak >= presRange.lo && ml.peak <= presRange.hi,
    `peak (${ml.peak}) lands in the presidents source [${presRange.lo}, ${presRange.hi}]`);
  // the focus is not the off-topic Twitter figure.
  assert.notEqual(String(ml.focus || '').toLowerCase(), 'jack dorsey');
});
