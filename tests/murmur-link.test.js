import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMurmur, buildConnection, connectionKey, canGroundConnection } from '../src/murmur/index.js';

// Phase-4 recognition LINKING (docs/murmur.md). Phase 1 measured recognition as a bare scalar and
// threw away which prior matched; phase 4 keeps each prior reading's LOCUS beside its vector, so a
// recognition points BACK at the specific earlier event — and nominates a candidate connection.

const V = (...xs) => Float32Array.from(xs);
// A three-turn session: read A, read an unrelated B, then read A again → the third reading
// recognizes the first. `now` is injected so the working-feel ring is deterministic.
const echoSession = async (m) => {
  const a = V(1, 0, 0, 0), b = V(0, 1, 0, 0);
  await m.observe({ ref: { turnId: 't1', docId: 'doc1', sentIdxs: [5, 6], cursor: 5 }, query: 'alice baked', queryVec: a, readingVecs: [a], measuresMeaning: true });
  await m.observe({ ref: { turnId: 't2', docId: 'doc1', sentIdxs: [20], cursor: 20 }, query: 'the weather', queryVec: b, readingVecs: [b], measuresMeaning: true });
  return m.observe({ ref: { turnId: 't3', docId: 'doc1', sentIdxs: [40], cursor: 40 }, query: 'alice again', queryVec: a, readingVecs: [a], measuresMeaning: true });
};

test('recognition links back to the SPECIFIC earlier locus (phase 4)', async () => {
  let t = 1000; const m = createMurmur({ now: () => (t += 1000) });
  const s = await echoSession(m);
  const rec = s.impressions.find((i) => i.register === 'recognition');
  assert.ok(rec, 'a recognition impression fires on the repeated reading');
  assert.ok(rec.link && rec.link.ref, 'it carries a link back to the earlier locus');
  assert.equal(rec.link.ref.turnId, 't1', 'the link points at turn 1 — the reading it echoes, not itself');
  assert.equal(rec.link.ref.cursor, 5, 'and at the earlier passage the reading circled');
  assert.equal(rec.ref.turnId, 't3', 'the impression is FELT now (t3); the link is where it points');
});

test('a recognition produces a reafferent CANDIDATE connection, deduped per locus pair', async () => {
  let t = 1000; const m = createMurmur({ now: () => (t += 1000) });
  await echoSession(m);
  const noms = m.peekNominations();
  assert.equal(noms.length, 1, 'exactly one candidate for the echo (no compounding)');
  const c = noms[0];
  assert.equal(c.kind, 'candidate', 'never an assertion / claim / event');
  assert.equal(c.grounded, false, 'a candidate is never grounded on its own say-so');
  assert.equal(canGroundConnection(c), false, 'reafferent — it can never witness itself (§8 type law)');
  assert.equal(c.from.turnId, 't3');
  assert.equal(c.to.turnId, 't1', 'from = where we are now, to = the earlier passage it connects to');
});

test('nominations() DRAINS — the idle gate consumes each candidate once', async () => {
  let t = 1000; const m = createMurmur({ now: () => (t += 1000) });
  await echoSession(m);
  assert.equal(m.nominations().length, 1, 'first drain hands over the candidate');
  assert.equal(m.nominations().length, 0, 'second drain is empty — a read side-channel, consumed once');
});

test('orthogonal readings raise no recognition and nominate nothing (precision over recall)', async () => {
  let t = 1000; const m = createMurmur({ now: () => (t += 1000) });
  const a = V(1, 0, 0, 0), b = V(0, 1, 0, 0), c = V(0, 0, 1, 0);
  await m.observe({ ref: { turnId: 't1', docId: 'd', sentIdxs: [0], cursor: 0 }, query: 'a', queryVec: a, readingVecs: [a], measuresMeaning: true });
  await m.observe({ ref: { turnId: 't2', docId: 'd', sentIdxs: [10], cursor: 10 }, query: 'b', queryVec: b, readingVecs: [b], measuresMeaning: true });
  await m.observe({ ref: { turnId: 't3', docId: 'd', sentIdxs: [20], cursor: 20 }, query: 'c', queryVec: c, readingVecs: [c], measuresMeaning: true });
  assert.equal(m.peekNominations().length, 0, 'nothing echoed → nothing nominated (the worker stays asleep)');
});

test('connectionKey is stable per (from → to) locus pair', () => {
  const c1 = buildConnection({ from: { docId: 'd', cursor: 40, turnId: 't3' }, to: { docId: 'd', cursor: 5, turnId: 't1' } });
  const c2 = buildConnection({ from: { docId: 'd', cursor: 40, turnId: 't3' }, to: { docId: 'd', cursor: 5, turnId: 't1' } });
  assert.equal(connectionKey(c1), connectionKey(c2), 'same loci → same key (so the echo is nominated once)');
  const c3 = buildConnection({ from: { docId: 'd', cursor: 41, turnId: 't3' }, to: { docId: 'd', cursor: 5, turnId: 't1' } });
  assert.notEqual(connectionKey(c1), connectionKey(c3), 'a different from-locus is a different candidate');
});
