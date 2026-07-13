// The Replay collapse fold — the whole thesis, tested as arithmetic. An ingest organ
// returns a DISTRIBUTION; the collapse happens at read time against a switchable corpus;
// it is pure, reversible, and the audio never moves. These tests pin exactly that.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  collapseToken, foldReading, edgePresent, figureActivation, CORPUS_BASE,
} from '../src/rooms/replay/collapse.js';
import { SCENE, SOURCES, DEFAULT_ENABLED } from '../src/rooms/replay/scene.js';

const ALL = new Set(DEFAULT_ENABLED);
const noMNPD = new Set(DEFAULT_ENABLED.filter((s) => s !== 'MNPD'));
const noMinutes = new Set(DEFAULT_ENABLED.filter((s) => s !== 'minutes'));
const NONE = new Set();

// The headline uncertain word lives in segment 1 ("We heard about the ⌇drones⌇ …").
const dronesToken = SCENE.segments[1].tokens[4];
const p = (col, w) => col.candidates.find((c) => c.word === w)?.p ?? 0;
const near = (a, b, eps = 0.005) => Math.abs(a - b) <= eps;

test('a candidate distribution is normalized and sorted', () => {
  const col = collapseToken(dronesToken, ALL);
  const sum = col.candidates.reduce((a, c) => a + c.p, 0);
  assert.ok(near(sum, 1), `probabilities sum to 1, got ${sum}`);
  for (let i = 1; i < col.candidates.length; i++) {
    assert.ok(col.candidates[i - 1].p >= col.candidates[i].p, 'sorted p-descending');
  }
});

test('all sources on: the corpus collapses to drones .71 / drums .19 / drives .10', () => {
  const col = collapseToken(dronesToken, ALL);
  assert.equal(col.chosen, 'drones');
  assert.ok(near(p(col, 'drones'), 0.71), `drones ${p(col, 'drones')}`);
  assert.ok(near(p(col, 'drums'), 0.19), `drums ${p(col, 'drums')}`);
  assert.ok(near(p(col, 'drives'), 0.10), `drives ${p(col, 'drives')}`);
  // The corpus overruled the microphone — that is the point.
  assert.equal(col.corpusDecided, true);
  assert.equal(col.acousticChosen, 'drums');
});

test('turn MNPD off and the word changes: drums becomes the best hypothesis (~.43)', () => {
  const col = collapseToken(dronesToken, noMNPD);
  assert.equal(col.chosen, 'drums', 'the word that was holding drones up was in the document you removed');
  assert.ok(near(p(col, 'drums'), 0.43, 0.01), `drums ${p(col, 'drums')}`);
});

test('itself only (read against nothing) is the microphone alone — worse, and more honest', () => {
  const col = collapseToken(dronesToken, NONE);
  assert.equal(col.chosen, 'drums');           // the audio, unaided, hears drums
  assert.ok(near(p(col, 'drones'), 0.10), `drones falls to ${p(col, 'drones')}`);
  // Under itself-only every candidate weight is just its acoustic prior × CORPUS_BASE.
  const raw = dronesToken.cand.reduce((a, c) => a + c.ac * CORPUS_BASE, 0);
  assert.ok(near(p(col, 'drums'), (dronesToken.cand.find((c) => c.w === 'drums').ac * CORPUS_BASE) / raw));
});

test('the audio never moves: the acoustic argmax is the same whatever is switched on', () => {
  for (const e of [ALL, noMNPD, noMinutes, NONE]) {
    assert.equal(collapseToken(dronesToken, e).acousticChosen, 'drums');
  }
});

test('a corpus-thin word (neighbor) holds its reading across every source flip', () => {
  const neighbor = SCENE.segments[1].tokens[7];
  for (const e of [ALL, noMNPD, noMinutes, NONE]) {
    assert.equal(collapseToken(neighbor, e).chosen, 'neighbor');
  }
});

test('foldReading is a pure function of (scene, enabled, cursor)', () => {
  const a = foldReading(SCENE, { enabled: [...ALL], cursor: 3 });
  const b = foldReading(SCENE, { enabled: [...ALL], cursor: 3 });
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
});

test('the reading grows with the cursor and un-grows when you scrub back', () => {
  const early = foldReading(SCENE, { enabled: [...ALL], cursor: 1 });
  const late = foldReading(SCENE, { enabled: [...ALL], cursor: 4 });
  assert.ok(late.revealed.length > early.revealed.length);
  assert.ok(late.nodes.length >= early.nodes.length);
  // scrubbing back to the same cursor reconstitutes exactly the earlier reading
  const back = foldReading(SCENE, { enabled: [...ALL], cursor: 1 });
  assert.deepEqual(JSON.parse(JSON.stringify(early)), JSON.parse(JSON.stringify(back)));
});

test('the city→MNPD edge is present with MNPD on and simply gone with MNPD off', () => {
  const on = foldReading(SCENE, { enabled: [...ALL], cursor: SCENE.segments.length });
  const off = foldReading(SCENE, { enabled: [...noMNPD], cursor: SCENE.segments.length });
  const has = (v) => v.edges.some((e) => e.from === 'city' && e.to === 'MNPD');
  assert.equal(has(on), true, 'city binds to MNPD only because MNPD is in the room');
  assert.equal(has(off), false, 'remove MNPD and the resident is talking about nobody in particular');
});

test('edgePresent respects the cursor and the source condition', () => {
  const edge = { from: 'city', to: 'MNPD', requires: ['MNPD'], bornAt: 2 };
  assert.equal(edgePresent(edge, 1, ALL), false, 'not yet reached');
  assert.equal(edgePresent(edge, 3, ALL), true);
  assert.equal(edgePresent(edge, 3, noMNPD), false, 'source removed');
});

test('the attention field is a property of the reading: the city goes cold without the minutes', () => {
  const city = SCENE.figures.find((f) => f.id === 'city');
  const cur = SCENE.segments.length;
  const hot = figureActivation(city, cur, ALL);
  const cold = figureActivation(city, cur, noMinutes);
  assert.ok(hot > 0, 'the city is a figure while the council minutes are in the room');
  assert.equal(cold, 0, 'nothing in the remaining corpus makes the city a figure');
});

test('a plain token has no distribution', () => {
  assert.equal(collapseToken('the', ALL), null);
});
