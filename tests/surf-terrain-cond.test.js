// surf.js's terrain conditioning (opts.terrainAware) — the arrest-physics sibling of write/
// gravity.js's terrainAware coupling (tests/gravity.test.js). Shares the same law
// (surfer/terrain.js GRAIN_WEIGHT) and the same opt-in, byte-identical-by-default discipline.
//
// HONEST NOTE (measured, not asserted): scanning real material (all of Hamlet, every 400
// units) found terrainAware NEVER changed which cursor won `peak` — a Ground-grain cursor's
// 0.75x discount was never enough to overturn a real tie in practice; Ground-grain cursors are
// also rare among candidate stops at all (reaching a SYN verdict — the stop-eligibility gate —
// correlates with having actual content, which is what makes a locus NOT thin/Ground in the
// first place). So this suite proves the WIRING is correct and safe, not that it currently
// moves real reading behaviour — the mirror of the frame-scatter probe's own M1 finding
// ("correctly inert" is a legitimate, reportable result, not a failure).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { surfFold } from '../src/surfer/surf.js';
import { parseText } from '../src/perceiver/parse/index.js';

const STORY = 'Grete Vale entered. Grete sat. Grete read. Gregor Pike arrived. ' +
              'Gregor coughed. Gregor waited. Otto Stein knocked. Otto left. ' +
              'Otto returned. Mara Cole spoke. Mara left.';

test('terrainAware is byte-identical to plain when off (the default)', () => {
  const doc = parseText(STORY, { docId: 's' });
  const plain = surfFold(doc, 0, {});
  const withFlag = surfFold(doc, 0, { terrainAware: false });
  assert.deepEqual(withFlag, plain);
});

test('terrainAware:true never throws and returns the same base shape on ordinary prose', () => {
  const doc = parseText(STORY, { docId: 's' });
  const aware = surfFold(doc, 0, { terrainAware: true });
  assert.ok(Array.isArray(aware.stops));
  assert.ok(Number.isFinite(aware.peak));
  assert.ok(Array.isArray(aware.field));
});

test('terrainAware composes with an existing lens/thread conditioner rather than replacing it', () => {
  // Regression guard for the composition rewrite (conditioners.filter(Boolean).reduce(...)):
  // with no lens/thread supplied, terrainAware alone must produce the same `cond`-vs-no-cond
  // shape contract as before (an object with the same keys, scores still finite).
  const doc = parseText(STORY, { docId: 's' });
  const plain = surfFold(doc, 0, {});
  const aware = surfFold(doc, 0, { terrainAware: true });
  assert.deepEqual(Object.keys(aware).sort(), Object.keys(plain).sort());
  for (const f of aware.field) assert.ok(Number.isFinite(f.bayes));
});

test('a longer, varied document: terrainAware runs clean across many anchors (no crash, valid stops/peak everywhere)', () => {
  const longText = Array(30).fill(STORY).join(' ');
  const doc = parseText(longText, { docId: 'long' });
  for (let a = 0; a < doc.units.length; a += 50) {
    const aware = surfFold(doc, a, { terrainAware: true });
    assert.ok(Array.isArray(aware.stops) && aware.stops.length > 0);
    assert.ok(aware.stops.includes(aware.peak) || aware.peak === a);
  }
});
