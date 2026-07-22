import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';

// Following a link INSIDE a native page keeps ONE SITE as ONE SOURCE and records every page you
// click through as a SUB-OBJECT beneath it (app.navigatePage → addSource parentSn), folded by
// default in the sidebar. This exercises the model that the Native view's click-to-follow rides on:
// no DOM needed — the surface resolves the href, this records + nests it.

// A fake page corpus keyed by the URL the proxy is handed (the client appends the real URL to its
// feed-proxy base, so match on substring). Each returns a fetch-like { text(), ok, status }.
const PAGES = {
  'npr.org/story-a': '<html><head><title>Story A — NPR</title></head><body><article><p>The first story runs long and has plenty of readable prose to admit as a record.</p></article></body></html>',
  'npr.org/story-b': '<html><head><title>Story B — NPR</title></head><body><article><p>A second, entirely different story with its own distinct readable body of prose here.</p></article></body></html>',
  'npr.org': '<html><head><title>NPR — Home</title></head><body><nav><a href="/story-a">A</a></nav><main><p>The NPR home page carries a masthead and a river of headlines linking onward.</p></main></body></html>',
  'example.com': '<html><head><title>Example — off-site</title></head><body><article><p>A wholly separate site on a different registrable domain, with its own readable prose to admit.</p></article></body></html>',
};
const pageFor = (url) => {
  // The client fetches THROUGH a feed proxy (…?url=<encoded real url>); decode before matching.
  let real = String(url); try { real = decodeURIComponent(url.replace(/^.*[?&]url=/, '')) || String(url); } catch { real = String(url); }
  // longest-key-first so /story-a matches before the bare host
  const key = Object.keys(PAGES).sort((a, b) => b.length - a.length).find((k) => real.includes(k));
  return key ? PAGES[key] : '<html><body><p>An unknown but adequately long page body for admission.</p></body></html>';
};
const fakeFetch = async (url) => ({ text: async () => pageFor(String(url)), ok: true, status: 200 });

const freshApp = async () => {
  const app = createReaderApp({ audit: { turns: [] }, fetchImpl: fakeFetch });
  if (!app.state.ready) {
    await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  }
  return app;
};

test('a recorded source folds its sub-objects by default and carries no parent', async () => {
  const app = await freshApp();
  const parent = await app.ingestUrl('https://www.npr.org');
  assert.equal(parent.parentSn, null, 'a directly-ingested source is a root');
  assert.equal(parent.collapsed, true, 'its sub-objects start folded');
});

test('navigatePage records the followed page as a sub-object of the site', async () => {
  const app = await freshApp();
  const parent = await app.ingestUrl('https://www.npr.org');
  const before = app.topicSources().length;

  const r = await app.navigatePage(parent.sn, 'https://www.npr.org/story-a');
  assert.ok(r && r.childSn, 'the followed page was recorded');
  assert.equal(r.url, 'https://www.npr.org/story-a', 'the site URL rides back for the iframe base');

  const child = app.sourceBySn(r.childSn);
  assert.equal(child.parentSn, parent.sn, 'the followed page nests under the site it was clicked on');
  assert.equal(app.topicSources().length, before + 1, 'exactly one new source joined the record');
  // the parent stays a single top-level source
  assert.equal(app.sourceBySn(parent.sn).parentSn, null, 'the site itself remains a root');
});

test('following a link unfolds its site so the new sub-object is visible at once', async () => {
  const app = await freshApp();
  const parent = await app.ingestUrl('https://www.npr.org');
  assert.equal(app.sourceBySn(parent.sn).collapsed, true, 'the site starts folded');

  await app.navigatePage(parent.sn, 'https://www.npr.org/story-a');
  // A sub-object recorded into a COLLAPSED parent renders nowhere (the sidebar only descends an open
  // parent) — the "navigating the site records nothing" report. The followed page must unfold it.
  assert.equal(app.sourceBySn(parent.sn).collapsed, false, 'the site is unfolded so the followed page shows');
});

test('an off-domain link is recorded as its own top-level source, never a cross-domain child', async () => {
  const app = await freshApp();
  const parent = await app.ingestUrl('https://www.npr.org');
  const r = await app.navigatePage(parent.sn, 'https://example.com/off');
  assert.ok(r && r.childSn, 'the off-domain page is still recorded');
  const rec = app.sourceBySn(r.childSn);
  assert.equal(rec.parentSn, null, 'it lands at the top level, not nested under npr.org');
});

test('re-visiting a followed page is a no-op on the registry (dedup by content)', async () => {
  const app = await freshApp();
  const parent = await app.ingestUrl('https://www.npr.org');
  const r1 = await app.navigatePage(parent.sn, 'https://www.npr.org/story-a');
  const count = app.topicSources().length;
  const r2 = await app.navigatePage(parent.sn, 'https://www.npr.org/story-a');
  assert.equal(r2.childSn, r1.childSn, 'the same page resolves to the same sub-object');
  assert.equal(app.topicSources().length, count, 'no duplicate source was created');
});

test('several followed pages all nest under the one site', async () => {
  const app = await freshApp();
  const parent = await app.ingestUrl('https://www.npr.org');
  const a = await app.navigatePage(parent.sn, 'https://www.npr.org/story-a');
  const b = await app.navigatePage(parent.sn, 'https://www.npr.org/story-b');
  const kids = app.topicSources().filter((s) => s.parentSn === parent.sn).map((s) => s.sn);
  assert.ok(kids.includes(a.childSn) && kids.includes(b.childSn), 'both followed pages are sub-objects');
  assert.equal(app.topicSources().filter((s) => !s.parentSn).length, 1, 'still exactly one top-level source');
});

test('sourceToggleCollapse folds and unfolds a site’s sub-objects', async () => {
  const app = await freshApp();
  const parent = await app.ingestUrl('https://www.npr.org');
  assert.equal(app.sourceBySn(parent.sn).collapsed, true);
  app.sourceToggleCollapse(parent.sn);
  assert.equal(app.sourceBySn(parent.sn).collapsed, false, 'unfolded');
  app.sourceToggleCollapse(parent.sn);
  assert.equal(app.sourceBySn(parent.sn).collapsed, true, 'folded again');
});

test('removing a site lifts its sub-objects to the top level rather than dropping them', async () => {
  const app = await freshApp();
  const parent = await app.ingestUrl('https://www.npr.org');
  const child = await app.navigatePage(parent.sn, 'https://www.npr.org/story-a');
  app.removeSource(parent.sn);
  const c = app.sourceBySn(child.childSn);
  assert.ok(c, 'the sub-object survives its parent');
  assert.equal(c.parentSn, null, 'and rises to the top level');
});
