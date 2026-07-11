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

  // A kept hop carries the very pages it read — {title, url} — so the trail's "Read N sources"
  // beat can be clicked through to what the surf returned, not just its count.
  const keptDone = after.find((h) => h.kept && h.results);
  assert.ok(keptDone, 'at least one kept hop reached onHopDone');
  assert.ok(Array.isArray(keptDone.sources) && keptDone.sources.length === keptDone.results,
    'a kept hop reports one source per result');
  assert.ok(keptDone.sources.every((s) => typeof s.url === 'string' && typeof s.title === 'string'),
    'each source carries a title and a url to click through to');
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

test('a novel page opens a deep frontier — up to 6 leads, not 4', async () => {
  // One seed page carrying eight distinct novel content terms. The frontier depth is what keeps a
  // walk alive past its first threads, so the heaviest SIX join it (leadsPerHop), not the old four.
  const richSearch = async (query) => {
    const slug = String(query).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const text = 'coral reefs zooxanthellae acidification symbiosis polyps bleaching calcification biodiversity mangroves';
    return [{ doc: { docId: `web-${slug}`, text, web: { title: query, url: `https://example.test/${slug}` } } }];
  };
  const walk = await runCuriousResearch('coral reefs', { search: richSearch, maxHops: 1, k: 1 });
  assert.equal(walk.hops[0].kept, true);
  assert.equal(walk.hops[0].leads.length, 6, 'a novel hop opens six threads');
});

test('the walk survives two consecutive strays and recovers on the next on-topic thread', async () => {
  // The seed spawns three leads whose priority order is set by term mass: bleaching (3×) >
  // symbiosis (2×) > polyps (1×). The first two threads come back off-topic (zero overlap with
  // the frame → strayed); the third is on-topic again. Under the old strayPatience of 2 the walk
  // died after the second stray with the good thread still on the frontier — now it recovers.
  const page = (slug, text) => [{ doc: { docId: `web-${slug}`, text, web: { title: slug, url: `https://example.test/${slug}` } } }];
  const forkSearch = async (query) => {
    const q = String(query).toLowerCase();
    if (q.includes('bleaching')) return page('stray-1', 'quantum chromodynamics lattice gauge renormalization');
    if (q.includes('symbiosis')) return page('stray-2', 'sourdough hydration crumb fermentation proofing');
    if (q.includes('polyps'))    return page('back-on', 'coral reefs coral reefs polyps bleaching symbiosis');
    return page('seed', 'coral reefs ocean bleaching bleaching bleaching symbiosis symbiosis polyps');
  };
  const walk = await runCuriousResearch('coral reefs', { search: forkSearch, maxHops: 8, k: 1 });

  const reasons = walk.hops.map((h) => (h.kept ? 'kept' : h.reason));
  assert.deepEqual(reasons.slice(0, 4), ['kept', 'strayed', 'strayed', 'kept'],
    'two strays in a row must not end the walk while an on-topic thread waits');
  assert.ok(walk.docs.some((d) => d.docId === 'web-back-on'), 'the recovering page grounds the answer');
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
