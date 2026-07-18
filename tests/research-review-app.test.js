import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';

// Research Review wired into the reader session (docs/research-review.md): reviewStart discovers
// candidates and reviews the first batch WITHOUT joining any other topic; reviewCompute reads the
// evidence-area / duplicate-cluster / corpus-recipe engine over exactly those reviewed candidates;
// reviewAdmit is the explicit act that copies a selection into a real topic, leaving the review
// topic itself as the audit record.

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>q - Google News</title>
  <item><title>Harbor seawall budget rises, agency says</title><link>https://harboragency.example/press-1</link>
    <description>Official statement on the seawall budget.</description></item>
  <item><title>Seawall costs draw scrutiny</title><link>https://harborwire.example/story-a</link>
    <description>Independent coverage of the seawall costs.</description></item>
  <item><title>City council debates seawall funding</title><link>https://harborwire.example/story-b</link>
    <description>A second, independent report on funding.</description></item>
  <item><title>Engineers weigh in on seawall design</title><link>https://harboragency.example/press-2</link>
    <description>A follow-up agency release on the design.</description></item>
  <item><title>Residents react to seawall plan</title><link>https://localvoices.example/reax</link>
    <description>Community reaction to the plan.</description></item>
</channel></rss>`;

const PAGES = {
  'https://harboragency.example/press-1': '<html><head><title>Agency Release</title></head><body><p>The harbor seawall budget rose to $145 million, the agency reported, citing new engineering estimates for the project.</p></body></html>',
  'https://harborwire.example/story-a': '<html><head><title>Harborwire A</title></head><body><p>Independent reporting on the seawall found the budget climbed to $145 million after a design change, according to officials.</p></body></html>',
  'https://harborwire.example/story-b': '<html><head><title>Harborwire B</title></head><body><p>City council members debated the seawall funding plan and questioned the schedule for completion by 2030.</p></body></html>',
};

// A fake fetch: route the proxied URL by the inner ?url= target to canned bodies (mirrors
// tests/native-nav.test.js and tests/webfetch.test.js).
const fakeFetch = (routes) => async (proxiedUrl) => {
  let inner = String(proxiedUrl);
  try { inner = new URL(proxiedUrl).searchParams.get('url') || inner; } catch { /* not a URL with a query */ }
  const body = routes[inner];
  return { text: async () => body ?? '', ok: body != null, status: body != null ? 200 : 404 };
};

const NEWS_SEARCH_URL = 'https://news.google.com/rss/search?q=' + encodeURIComponent('latest news on the harbor seawall');

const freshApp = async () => {
  const app = createReaderApp({
    audit: { turns: [] },
    fetchImpl: fakeFetch({ [NEWS_SEARCH_URL]: RSS, ...PAGES }),
  });
  if (!app.state.ready) await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  return app;
};

test('reviewStart discovers candidates, reviews the first batch, leaves the rest discovered-only', async () => {
  const app = await freshApp();
  const t = await app.reviewStart('latest news on the harbor seawall', { discoverK: 5, reviewK: 3 });
  assert.ok(t, 'a review topic was opened');
  assert.equal(t.kind, 'review');
  assert.ok(t.review, 'the audit record is attached to the topic');
  assert.equal(t.review.query, 'latest news on the harbor seawall');
  assert.equal(t.sourceSns.length, 3, 'exactly reviewK candidates were fetched and admitted');
  assert.equal(t.review.discovered.length, 2, 'the remaining discovered hits are kept as stubs, not fetched');
  assert.equal(app.state.activeTopicId, t.id, 'the review topic is the working scope, same as searchTopic today');
});

test('a reviewed source is NOT joined to any other topic — admission is a separate, explicit act', async () => {
  const app = await freshApp();
  const before = app.state.topics.filter((x) => x.kind !== 'review').length;
  await app.reviewStart('latest news on the harbor seawall', { discoverK: 5, reviewK: 3 });
  const after = app.state.topics.filter((x) => x.kind !== 'review').length;
  assert.equal(after, before, 'no non-review topic gained a source just from reviewing');
});

test('reviewCompute reads the duplicate-cluster / evidence-area engine over the reviewed rows', async () => {
  const app = await freshApp();
  const t = await app.reviewStart('latest news on the harbor seawall', { discoverK: 5, reviewK: 3 });
  const view = app.reviewCompute(t.id);
  assert.ok(view);
  assert.equal(view.cards.length, 3);
  // press-1 is on harboragency.example; story-a and story-b are both on harborwire.example — same
  // registrable host, same voice — so three reviewed pages reduce to TWO independent origins, drawn
  // from identity facts alone (never a content-similarity guess).
  assert.equal(view.stats.independentOrigins, 2);
  const cluster = view.clusters.find((c) => c.members.length > 1);
  assert.ok(cluster, 'story-a and story-b clustered as one origin');
  assert.equal(cluster.members.length, 2);
  assert.ok(view.reading.length > 0, 'the research reading paragraph is non-empty');
  assert.ok(view.recipes.balanced && view.recipes.perspectives, 'corpus recipes are computed');
});

test('reviewToggleExclude and reviewApplyRecipe shape the working selection without touching the record', async () => {
  const app = await freshApp();
  const t = await app.reviewStart('latest news on the harbor seawall', { discoverK: 5, reviewK: 3 });
  const [sn] = t.sourceSns;
  app.reviewToggleExclude(t.id, sn);
  assert.ok(app.topicById(t.id).review.excludedSns.includes(sn));
  app.reviewToggleExclude(t.id, sn);
  assert.ok(!app.topicById(t.id).review.excludedSns.includes(sn), 'toggling twice restores it');

  app.reviewApplyRecipe(t.id, 'perspectives');
  const t2 = app.topicById(t.id);
  assert.equal(t2.review.recipe, 'perspectives');
  const kept = t2.sourceSns.filter((s) => !t2.review.excludedSns.includes(s));
  assert.ok(kept.length > 0 && kept.length <= t2.sourceSns.length);
});

test('reviewAdmit copies the selection into a NEW topic and stamps the review topic as provenance', async () => {
  const app = await freshApp();
  const t = await app.reviewStart('latest news on the harbor seawall', { discoverK: 5, reviewK: 3 });
  const excluded = t.sourceSns[0];
  app.reviewToggleExclude(t.id, excluded);

  const target = app.reviewAdmit(t.id, { newTitle: 'New York congestion pricing impacts' });
  assert.ok(target);
  assert.equal(target.title, 'New York congestion pricing impacts');
  assert.equal(target.sourceSns.length, 2, 'only the non-excluded sources were admitted');
  assert.ok(!target.sourceSns.includes(excluded));

  const reviewAfter = app.topicById(t.id);
  assert.ok(reviewAfter.review.admittedAt, 'the review topic records when admission happened');
  assert.equal(reviewAfter.review.targetTopicId, target.id);
  assert.equal(reviewAfter.sourceSns.length, 3, 'the review topic itself keeps every reviewed candidate — the audit trail');
  assert.equal(app.state.activeTopicId, target.id, 'admission moves the reader into the real topic');
});

test('reviewAdmit into an EXISTING topic adds sources without duplicating a source across a re-admit', async () => {
  const app = await freshApp();
  const t = await app.reviewStart('latest news on the harbor seawall', { discoverK: 5, reviewK: 3 });
  const existing = app.topicNew('Congestion pricing', {});
  const target = app.reviewAdmit(t.id, { targetTopicId: existing.id });
  assert.equal(target.id, existing.id);
  assert.equal(target.sourceSns.length, 3);
  const again = app.reviewAdmit(t.id, { targetTopicId: existing.id });
  assert.equal(again.sourceSns.length, 3, 're-admitting the same selection does not duplicate sns');
});

test('reviewMore pulls discovered-only stubs into Reviewed on demand', async () => {
  const app = await freshApp();
  const t = await app.reviewStart('latest news on the harbor seawall', { discoverK: 5, reviewK: 3 });
  assert.equal(t.review.discovered.length, 2);
  const gained = await app.reviewMore(t.id, 5);
  const t2 = app.topicById(t.id);
  assert.equal(t2.review.discovered.length, 0, 'both remaining stubs were pulled in');
  assert.equal(t2.sourceSns.length, 3 + gained);
});
