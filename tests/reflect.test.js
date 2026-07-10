import { test } from 'node:test';
import assert from 'node:assert/strict';

import { reflectAnswer } from '../src/enactor/ground/index.js';
import { parseText } from '../src/perceiver/parse/index.js';
import { createCompositeDoc } from '../src/organs/in/index.js';

// The reflection: the model's OUTPUT parsed back into EOT and judged against the graph —
// not just "is this claim in the graph" but "how well-grounded is what the graph holds":
// corroborated by several INDEPENDENT origins, single-source, or unwitnessed. Every verdict
// carries its witnesses (sentence + origin document) so the UI can show, on hover, where
// each claim allegedly comes from.

const relRow = (r, via) => r.eot.find((row) => row.kind === 'relation' && row.via === via);

test('a claim the document witnesses reflects as single-source, with the witnessing sentence attached', () => {
  const doc = parseText('Anna trusted Ben. Anna saw Clara.', { docId: 'novel.txt' });
  const r = reflectAnswer({ answer: 'Anna trusted Ben.', doc });
  const row = relRow(r, 'trusted');
  assert.ok(row, 'the answer lowered to a trusted-relation EOT line');
  assert.equal(row.line, 'Anna -> Ben : trusted', 'the EOT surface line (X -> Y : relation)');
  assert.equal(row.status, 'single-source', 'one origin witnesses it');
  assert.equal(row.origins, 1);
  assert.equal(row.sources[0].docId, 'novel.txt', 'the witness names its origin document');
  assert.match(row.sources[0].text, /trusted/, 'the witness carries the sentence it allegedly comes from');
});

test('a claim nothing read supports reflects as unwitnessed — no sources to show', () => {
  const doc = parseText('Anna trusted Ben.', { docId: 'novel.txt' });
  const r = reflectAnswer({ answer: 'Anna married Ben.', doc });
  const row = relRow(r, 'married');
  assert.ok(row);
  assert.equal(row.status, 'unwitnessed');
  assert.equal(row.sources.length, 0);
  assert.equal(r.summary.unwitnessed, 1);
});

test('DIVERSITY: the same relation witnessed by two independent documents is corroborated', () => {
  const a = parseText('Anna trusted Ben.', { docId: 'a.txt' });
  const b = parseText('Anna trusted Ben deeply.', { docId: 'b.txt' });
  const doc = createCompositeDoc([a, b]);
  const r = reflectAnswer({ answer: 'Anna trusted Ben.', doc });
  const row = relRow(r, 'trusted');
  assert.ok(row);
  assert.equal(row.status, 'corroborated', 'two independent origins witness the claim');
  assert.equal(row.origins, 2);
  assert.deepEqual(new Set(row.sources.map((s) => s.docId)), new Set(['a.txt', 'b.txt']),
    'one representative witness per origin document');
  assert.equal(r.summary.corroborated, 1);
  assert.equal(r.summary.origins, 2, 'the answer-grain diversity measure counts distinct origins');
});

test('the same relation repeated within ONE document does not corroborate — diversity is origins, not repetitions', () => {
  const doc = parseText('Anna trusted Ben. Later, Anna trusted Ben again.', { docId: 'one.txt' });
  const r = reflectAnswer({ answer: 'Anna trusted Ben.', doc });
  const row = relRow(r, 'trusted');
  assert.ok(row);
  assert.equal(row.status, 'single-source', 'many sentences, one origin — still a single source');
  assert.equal(row.origins, 1);
});

test('a figure nothing read mentions surfaces as a novel entity', () => {
  const doc = parseText('Anna trusted Ben.', { docId: 'novel.txt' });
  const r = reflectAnswer({ answer: 'Klamm distrusted Ben.', doc });
  const novel = r.eot.find((row) => row.kind === 'entity' && row.subj === 'klamm');
  assert.ok(novel, 'the unknown figure is surfaced');
  assert.equal(novel.status, 'novel');
  assert.ok(r.summary.entitiesNovel >= 1);
});

test('no answer or no doc → no reflection (null, never a throw)', () => {
  const doc = parseText('Anna trusted Ben.', { docId: 'novel.txt' });
  assert.equal(reflectAnswer({ answer: '', doc }), null);
  assert.equal(reflectAnswer({ answer: 'Anna trusted Ben.', doc: null }), null);
  assert.equal(reflectAnswer(), null);
});
