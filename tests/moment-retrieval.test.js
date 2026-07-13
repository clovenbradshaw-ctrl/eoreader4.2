import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMomentIndex, decomposeQuery, searchMoments, findMoments, parseDuration,
  saidAnnotations, dwellAnnotations, seenAnnotations,
} from '../src/surfer/moment.js';

// Video moment retrieval — a described moment resolves to WITNESSED spans, or an honest
// INDETERMINATE. Pure: synthetic span annotations in (the shape the transcript, the retina, and the
// CV read all produce), ranked candidates out. No model, no browser — the retrieval discipline pinned.

// A tiny fixture: a councilmember says "drone", a CV read sees a drone on screen at the same time, a
// vehicle dwells in the lot for twelve minutes, and a tracked figure (the man in the blue jacket)
// appears in three shots — once with his back turned (labelled only "person").
const ANNS = [
  { span: [40.0, 40.4], kind: 'said', text: 'drone', terms: ['drone'], entityId: 'w:drone', witness: 'whisper' },
  { span: [39.5, 60.0], kind: 'seen', text: 'drone', terms: ['drone'], entityId: 'obj:drone-1', witness: 'florence-2' },
  { span: [39.5, 60.0], kind: 'concept', text: 'a small quadcopter over a parking lot', terms: ['small', 'quadcopter', 'over', 'parking', 'lot'], witness: 'florence-2' },
  { span: [120, 840], kind: 'dwell', text: 'scene present-still for 720s', terms: ['present-still', 'present', 'still', 'persists'], witness: 'motion (fixed-camera)', dur: 720, verdict: 'present-still' },
  { span: [120, 840], kind: 'seen', text: 'a parked sedan', terms: ['parked', 'sedan', 'car', 'vehicle'], entityId: 'obj:sedan-1', witness: 'florence-2' },
  { span: [10, 14], kind: 'seen', text: 'man in a blue jacket', terms: ['man', 'blue', 'jacket'], entityId: 'fig:jacket', witness: 'florence-2' },
  { span: [70, 74], kind: 'seen', text: 'person', terms: ['person'], entityId: 'fig:jacket', witness: 'florence-2' },      // back turned — label lost the jacket
  { span: [150, 156], kind: 'seen', text: 'man in blue jacket by the door', terms: ['man', 'blue', 'jacket', 'door'], entityId: 'fig:jacket', witness: 'florence-2' },
];

test('parseDuration reads a duration out of the query, digits or words', () => {
  assert.equal(parseDuration('every vehicle parked longer than 10 minutes'), 600);
  assert.equal(parseDuration('someone stood at a door more than two minutes'), 120);
  assert.equal(parseDuration('at least 90 seconds'), 90);
  assert.equal(parseDuration('a red car'), null);
});

test('a said word and a seen concept at the same time corroborate into one MATCH with both witnesses', async () => {
  const index = buildMomentIndex(ANNS);
  const { results } = await findMoments(index, 'drone');
  assert.ok(results.length >= 1);
  const top = results[0];
  assert.equal(top.verdict, 'match');
  // The in/out point spans the union of the corroborating annotations, and the witness names both.
  assert.ok(top.span[0] <= 40 && top.span[1] >= 40.4);
  const kinds = new Set(top.witness.map((w) => w.kind));
  assert.ok(kinds.has('said') && kinds.has('seen'), 'both the heard and the seen witness the moment');
});

test('weak partial evidence ABSTAINS — a maybe, not a confident wrong span', async () => {
  const index = buildMomentIndex(ANNS);
  // Only "car" hits (one seen annotation); "blue" and "sedan-colored" do not co-occur there.
  const { results } = await findMoments(index, 'blue pickup truck');
  // "blue" hits the jacket figure but as a lone term of a 3-term query → not enough for a match.
  for (const r of results) assert.equal(r.verdict, 'indeterminate');
  assert.ok(results.every((r) => r.coverage < 1));
});

test('no evidence returns nothing — an empty result, never a fabricated hit', async () => {
  const index = buildMomentIndex(ANNS);
  const { results } = await findMoments(index, 'helicopter ambulance');
  assert.equal(results.length, 0);
});

test('an entity query is FIGURE-LEVEL — it pulls every appearance, including the back-turned shot', () => {
  const index = buildMomentIndex(ANNS);
  const results = searchMoments(index, { terms: [], entity: 'fig:jacket' });
  // Three appearances at 10–14, 70–74, 150–156 — the middle one labelled only "person".
  assert.equal(results.length, 3);
  assert.ok(results.every((r) => r.verdict === 'match'));   // the tracked figure is an exact hit
  const spans = results.map((r) => r.span[0]).sort((a, b) => a - b);
  assert.deepEqual(spans, [10, 70, 150]);
  // The back-turned shot (labelled "person") is among them — frame-matching on "jacket" would miss it.
  assert.ok(results.some((r) => r.witness.some((w) => w.text === 'person')));
});

test('duration becomes a predicate — "parked longer than ten minutes" filters by the span itself', async () => {
  const index = buildMomentIndex(ANNS);
  const { query, results } = await findMoments(index, 'vehicle parked longer than 10 minutes');
  assert.equal(query.minDuration, 600);
  assert.ok(results.length >= 1);
  const hit = results.find((r) => r.dur >= 600);
  assert.ok(hit, 'the twelve-minute dwell clears the ten-minute floor');
  assert.ok(hit.span[0] === 120 && hit.span[1] === 840);
  // A short version of the same query keeps it; a 20-minute floor drops it.
  const { results: none } = await findMoments(index, 'vehicle parked longer than 20 minutes');
  assert.ok(none.every((r) => r.dur >= 1200));
  assert.equal(none.length, 0);
});

test('kind hints from the phrasing narrow the search (said vs on-screen text)', async () => {
  const said = await decomposeQuery('when does she say drone');
  assert.deepEqual(said.kinds, ['said']);
  const seen = await decomposeQuery('the sign that reads drone zone');
  assert.ok(seen.kinds.includes('text'));
  const index = buildMomentIndex(ANNS);
  // Restricted to spoken word, the CV "seen drone" is excluded; only the transcript hit remains.
  const res = searchMoments(index, { terms: ['drone'], kinds: ['said'] });
  assert.ok(res.length >= 1);
  assert.ok(res.every((r) => r.witness.every((w) => w.kind === 'said')));
});

test('an injected proposer decomposes; its failure falls back to the lexical read', async () => {
  const propose = async (text) => ({ terms: ['drone'], kinds: ['seen'] });
  const q = await decomposeQuery('find the flying thing', { propose });
  assert.deepEqual(q.terms, ['drone']);
  assert.deepEqual(q.kinds, ['seen']);
  const boom = async () => { throw new Error('model offline'); };
  const q2 = await decomposeQuery('a parked sedan', { propose: boom });
  assert.ok(q2.terms.includes('parked') && q2.terms.includes('sedan'));   // lexical fallback stood
});

test('adapters derive span annotations from the docs the reader already holds', () => {
  const audioDoc = { witness: 'whisper', tokens: [
    { id: 'w:drone', text: 'drone', norm: 'drone', start: 40, end: 40.4, conf: 0.9 },
    { id: 'w:lot', text: 'lot', norm: 'lot', start: 40.5, end: 40.8 },
  ] };
  const said = saidAnnotations(audioDoc);
  assert.equal(said.length, 2);
  assert.equal(said[0].kind, 'said');
  assert.deepEqual(said[0].span, [40, 40.4]);

  const persistence = { cameraCompensated: false, dwells: [
    { start: 120, end: 840, dur: 720, verdict: 'present-still' },
    { start: 900, end: 905, dur: 5, verdict: 'void' },
  ] };
  const dwells = dwellAnnotations(persistence);
  assert.equal(dwells.length, 2);
  assert.ok(dwells[0].terms.includes('present-still'));
  assert.equal(dwells[0].dur, 720);

  const seen = seenAnnotations([
    { span: [39.5, 60], caption: 'a drone over a lot', regions: [{ label: 'drone', entityId: 'obj:drone-1' }], ocr: ['NO PARKING'] },
  ]);
  assert.ok(seen.some((a) => a.kind === 'seen' && a.terms.includes('drone')));
  assert.ok(seen.some((a) => a.kind === 'concept'));
  assert.ok(seen.some((a) => a.kind === 'text' && a.terms.includes('parking')));
});
