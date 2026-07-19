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
test('chorus off → surfFold is deterministic and carries no chorus fields (parity gate)', () => {
  const doc = parseText(STORY, { docId: 's' });
  const a = surfFold(doc, 1);
  const b = surfFold(doc, 1, {});
  const c = surfFold(doc, 1, { chorus: undefined });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(JSON.stringify(a), JSON.stringify(c));
  // The median-band fallback is retired (docs/segment-by-significance.md): the null is
  // the sole arrest rule now, on every reach, not only the adaptive one.
  assert.equal(a.rode, 'bayesian-void');
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

// ── the FOLD: a broad composite is bounded, not spammed into the reading ─────────
test('multiLevelSurf folds many sources into a bounded stop set', () => {
  const rel = 'The best US presidents were Abraham Lincoln and George Washington. Historians rank these presidents highly. Franklin Roosevelt also ranks among the greatest presidents. Thomas Jefferson was an influential president.';
  const off = (t) => t;
  const mk = (id, t) => parseText(t, { docId: id });
  const docs = [
    mk('w-twitter', off('Twitter migrated from Ruby to Scala. Jack Dorsey built FlockDB. The JVM handled tweet volume. Finagle powers RPC.')),
    mk('w-weather', off('A cold front swept the plains. Meteorologists warned of snow. The blizzard closed highways. Temperatures plunged.')),
    mk('w-pres1', rel),
    mk('w-cooking', off('The recipe needs flour and salt. Knead the dough smooth. Bake at high heat. Let it cool.')),
    mk('w-pres2', 'Ranked surveys of US presidents place Lincoln first. Washington and Roosevelt follow. Historians debate the rest. Presidents are graded on leadership.'),
    mk('w-sports', off('The striker scored a hat-trick. The keeper made a save. The stadium erupted. Fans celebrated.')),
    mk('w-pres3', 'Presidents like Lincoln and Washington top historian rankings. Roosevelt is among the best presidents. Surveys agree on the top five.'),
    mk('w-cars', off('The engine roared. The car cornered fast. The brakes held. The lap record fell.')),
    mk('w-space', off('The rocket launched at dawn. The booster landed. The satellite deployed. Control cheered.')),
  ];
  const comp = createCompositeDoc(docs);
  const thread = threadBasis({ query: QUERY, doc: comp });
  const anchor = sourceRanges(comp).find(r => r.docId === 'w-pres1').lo;
  const ml = multiLevelSurf(comp, anchor, { chorus: thread });
  // the fold caps the merged stop set (DEFAULT_GLOBAL_STOPS = 6) no matter how many sources.
  assert.ok(ml.stops.length <= 6, `stops folded to <= 6 (got ${ml.stops.length})`);
  assert.equal(ml.field.length, ml.stops.length, 'field carries only the surviving stops');
  // every surviving stop is from a presidents source — no off-topic span spams the reading.
  const srcOf = (i) => comp.origin(i)?.docId;
  for (const s of ml.stops) assert.match(String(srcOf(s)), /pres/, `stop ${s} is from a relevant source (${srcOf(s)})`);
});
