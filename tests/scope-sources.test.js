import { test } from 'node:test';
import assert from 'node:assert/strict';

import { scopeSources, contentTerms, SCOPE_DEFAULTS } from '../src/rooms/reader/scope-sources.js';

// SEPARATE SIGNAL FROM NOISE (rooms/reader/scope-sources.js). A turn grounds on the
// sources that bear on the question — the substantial documents plus any small source the
// question distinctly names — not the whole topic pile. These pin the "wheat from chaff"
// separation the browser `ask` path leans on.

// The scenario from the bug report: one 2,674-page PDF recorded alongside 77 small
// Wikipedia stubs, asked a vague question. The stubs LITERALLY contained the query phrase.
const bigDoc = { title: 'Responsive_-_R001994', bytes: 2231221, text: 'the responsive legal record of the matter' };
const stubSizes = [69595, 14833, 17191, 4426, 5757, 4591, 4931, 10822, 76356, 20984, 1719,
  15641, 53202, 59571, 51281, 4519, 28326, 1235, 5023, 96369, 8695, 91110, 8388, 6793, 33903, 27721, 1361];
const noisyTopic = () => {
  const srcs = [bigDoc];
  stubSizes.forEach((b, i) => srcs.push({
    title: `Wikipedia stub ${i}`, bytes: b,
    // every third stub carries the exact vague-question phrase — the coincidence that
    // let lexical matching prefer the noise.
    text: i % 3 === 0 ? 'she was the most surprising part of this entire experience' : 'an unrelated encyclopedia article',
  }));
  while (srcs.length < 78) srcs.push({ title: 'filler stub', bytes: 5000, text: 'unrelated' });
  return srcs;
};

test('a vague question keeps only the substantial document — the stubs are chaff', () => {
  const kept = scopeSources('what is the most surprising part?', noisyTopic());
  assert.equal(kept.length, 1, '78 sources scope down to one');
  assert.equal(kept[0].title, 'Responsive_-_R001994', 'the loaded document is the wheat');
});

test('a vague question reduces to too few content terms to rescue a stub', () => {
  // "what is the most surprising part?" → the only surviving content term is "surprising"
  // (what/most/part are stopped), fewer than strongHits, so no stub is rescued on words.
  const terms = contentTerms('what is the most surprising part?');
  assert.ok(terms.length < SCOPE_DEFAULTS.strongHits, `too few terms to rescue: ${JSON.stringify(terms)}`);
  assert.ok(terms.includes('surprising'));
  assert.ok(!terms.includes('part') && !terms.includes('most'), 'common words are stopped');
});

test('a small source the question DISTINCTLY names is rescued alongside the big doc', () => {
  const srcs = noisyTopic();
  // A stub about Phil Collins, small, but the question names it with several content terms.
  srcs.push({ title: 'Phil Collins', bytes: 76356, text: 'Phil Collins was the drummer and later singer of the band Genesis.' });
  const kept = scopeSources('when did the drummer Phil Collins join the band Genesis?', srcs);
  const titles = kept.map((s) => s.title);
  assert.ok(titles.includes('Responsive_-_R001994'), 'the substantial document is always wheat');
  assert.ok(titles.includes('Phil Collins'), 'a distinctly-named small source is rescued');
});

test('a small topic is left whole — nothing to separate', () => {
  const srcs = [
    { title: 'A', bytes: 1000, text: 'alpha' },
    { title: 'B', bytes: 2000, text: 'beta' },
    { title: 'C', bytes: 500, text: 'gamma' },
  ];
  const kept = scopeSources('anything at all', srcs);
  assert.equal(kept.length, 3, 'below the floor, every source is kept');
});

test('several comparable documents are all kept (no false dominance)', () => {
  const srcs = [];
  for (let i = 0; i < 10; i++) srcs.push({ title: `Doc ${i}`, bytes: 900000 + i * 1000, text: 'a full document of comparable size' });
  const kept = scopeSources('a broad question across the corpus', srcs);
  assert.equal(kept.length, 10, 'comparable substantial sources are all within the substance band');
});

test('scoping never grounds on nothing', () => {
  // A pathological topic: many tiny equal stubs, a question that names none of them.
  const srcs = [];
  for (let i = 0; i < 20; i++) srcs.push({ title: `x${i}`, bytes: 100, text: 'z' });
  const kept = scopeSources('zzzzzz qqqqqq wwwwww', srcs);
  assert.ok(kept.length >= 1, 'at least one source survives');
});

test('missing fields never throw', () => {
  const srcs = [{}, { title: null, text: null }, { bytes: 10 }];
  for (let i = 0; i < 6; i++) srcs.push({ bytes: 1 });
  assert.doesNotThrow(() => scopeSources(null, srcs));
});
