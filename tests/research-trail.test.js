import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runCuriousResearch, runTurnWithResearch } from '../src/turn/research.js';

// The reader's web search reaches the net by a multi-hop CURIOSITY WALK (turn/research.js), and the
// answer bubble streams a live "research trail" off the walk's per-hop beats. That trail depends on
// two callbacks the walk must fire — onHop (before a hop's fetch) and onHopDone (after, carrying the
// hop's outcome) — and on runTurnWithResearch FORWARDING both (plus the Stop button's signal) down
// to the walk. These lock that contract; before this change the walk had no test in 4.2 at all.

// A fake search: every query about coral returns one page that shares the anchor terms (so it stays
// on the leash) plus the query's own words (so early hops are novel and spawn leads). No network.
const fakeSearch = async (query) => {
  const text = `coral reefs ocean ${query} ${query} bleaching symbiosis polyps calcium`;
  const slug = String(query).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return [{ doc: { docId: `web-${slug}`, text, web: { title: query, url: `https://example.test/${slug}` } } }];
};

test('the walk fires onHop before each hop and onHopDone after, with the hop outcome', async () => {
  const before = [], after = [];
  const walk = await runCuriousResearch('coral reefs', {
    search: fakeSearch, maxHops: 3, k: 1,
    onHop: (h) => before.push(h),
    onHopDone: (h) => after.push(h),
  });

  // The seed is the first hop, at index 1, searching the seed query itself.
  assert.ok(before.length >= 1);
  assert.equal(before[0].index, 1);
  assert.equal(before[0].query, 'coral reefs');
  assert.equal(before[0].term, null);

  // onHopDone fires once per recorded hop, in step with the walk's own hop log.
  assert.equal(after.length, walk.hops.length);
  assert.ok(after.every((h) => typeof h.query === 'string' && typeof h.kept === 'boolean'));

  // The seed page is kept and grounded; a real multi-hop walk went past it.
  assert.equal(walk.hops[0].kept, true);
  assert.ok(walk.docs.length >= 1);
  assert.ok(walk.hops.length > 1, 'the walk should follow at least one lead past the seed');
});

test('runTurnWithResearch forwards onHop/onHopDone to the walk and returns the research trace', async () => {
  const before = [], after = [];
  let sawDocs = null;
  const fakeRunTurn = async (args) => { sawDocs = args.docs || []; return { answer: 'grounded', route: 'grounded', sources: args.docs || [] }; };

  const out = await runTurnWithResearch(
    { question: 'coral reefs', docs: [] },
    {
      search: fakeSearch, runTurnImpl: fakeRunTurn, seed: 'coral reefs', maxHops: 3, k: 1,
      onHop: (h) => before.push(h),
      onHopDone: (h) => after.push(h),
    },
  );

  assert.ok(before.length >= 1, 'onHop must reach the walk through runTurnWithResearch');
  assert.equal(after.length, out.research.hops.length, 'onHopDone must reach the walk too');
  assert.ok(out.research.results >= 1);
  assert.equal(out.research.sources.length, out.research.results);
  assert.ok(Array.isArray(sawDocs) && sawDocs.length >= 1, 'the gathered pages are folded into the answer scope');
  assert.equal(out.answer, 'grounded');
});

test('an aborted signal stops the walk before it fetches — the Stop button', async () => {
  const controller = new AbortController();
  controller.abort();
  let fetched = 0;
  const countingSearch = async (q) => { fetched += 1; return fakeSearch(q); };

  const walk = await runCuriousResearch('coral reefs', {
    search: countingSearch, maxHops: 5, k: 1, signal: controller.signal,
  });

  assert.equal(fetched, 0, 'a pre-aborted walk never reaches the network');
  assert.equal(walk.hops.length, 0);
  assert.equal(walk.docs.length, 0);
});
