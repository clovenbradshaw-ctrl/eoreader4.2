import { test } from 'node:test';
import assert from 'node:assert/strict';

import { forage, createForager, SOURCES } from '../src/metabolism/index.js';

// The judge's material (metabolism/forage.js). A judge that grades against the same fixture every
// run is an author after all — the population overfits it. So the material must come from a WIDE
// range of real sources, unpredictably. These tests pin the breadth and the graceful degradation
// with an injected fetch (no network), the same seam the surface wires window.fetch into.

// a stub fetch that answers each Wikimedia/Gutendex URL with a plausible JSON shape, and lets a
// chosen host FAIL, so the "a source outage is skipped, never fatal" contract is exercised.
const stubFetch = (failHost = null) => async (url) => {
  if (failHost && url.includes(failHost)) throw new Error('simulated outage');
  const host = new URL(url).host;
  if (host.includes('gutendex')) return { json: async () => ({ results: [{ id: 84, title: 'Frankenstein', authors: [{ name: 'Shelley, Mary' }], subjects: ['Horror tales'], languages: ['en'], download_count: 99 }] }) };
  const project = host.split('.').find((p) => p.includes('wik')) || 'wikipedia';
  return { json: async () => ({ title: `Random ${project} page`, extract: `A real extract from ${project} about something specific and citable.`, content_urls: { desktop: { page: url } } }) };
};

test('forage: pulls documents from a WIDE range of real sources (breadth is the point)', async () => {
  assert.ok(SOURCES.length >= 6, 'the source list spans many genres — encyclopedia, news, quotation, textbook, primary source, literature');
  const genres = new Set(SOURCES.map((s) => s.genre));
  assert.ok(genres.size >= 5, 'the sources cover distinct genres, not one well');
  const docs = await forage({ fetch: stubFetch(), n: 6, pick: 0 });
  assert.ok(docs.length >= 5, 'a forage returns documents across the spread');
  assert.ok(new Set(docs.map((d) => d.source)).size >= 5, 'the documents come from distinct sources, not one repeated');
  assert.ok(docs.every((d) => d.title && d.text && d.source && d.genre), 'each document carries title, text, source, and genre');
});

test('forage: a source outage is skipped, never fatal — breadth over completeness', async () => {
  const docs = await forage({ fetch: stubFetch('wikinews'), n: 6, pick: 0 });
  assert.ok(docs.length >= 4, 'the other sources still return when one is down');
  assert.ok(!docs.some((d) => /wikinews/i.test(d.source)), 'the failed source is simply absent');
});

test('forage: rotation samples DIFFERENT sources on successive draws (a shifting diet)', async () => {
  const a = await forage({ fetch: stubFetch(), n: 2, pick: 0 });
  const b = await forage({ fetch: stubFetch(), n: 2, pick: 3 });
  assert.notDeepEqual(a.map((d) => d.source), b.map((d) => d.source), 'a later pick draws a different slice of the sources');
});

test('forage: requires an injected fetch — the network seam is explicit, not hidden', async () => {
  await assert.rejects(() => forage({ n: 1 }), /injected fetch/, 'foraging touches the network; the fetch is injected so tests pin it and the surface wires it');
});

test('createForager: gathers material and (with a judge) authors a battery on it', async () => {
  // a stub judge that authors one test per call — proves the forager hands real passages to the judge.
  const judge = { authorTests: async ({ passages }) => passages.slice(0, 1).map((p) => ({ question: `What does this say? (${p.slice(0, 20)}…)`, rubric: 'cite the passage', difficulty: 'easy' })) };
  const forager = createForager({ fetch: stubFetch(), judge });
  const { docs, battery, sources } = await forager.gather({ n: 4, pick: 1, tests: 3 });
  assert.ok(docs.length >= 3 && battery && battery.length >= 1, 'the forager pulls documents and authors an evaluation battery on them');
  assert.ok(new Set(sources).size >= 3, 'the battery is grounded in a spread of real sources');
  assert.ok(forager.genres().length >= 3, 'the library remembers the shifting diet of genres it has seen');
});
