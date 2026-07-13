import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseFeedItems, feedMeta, feedToTable, feedToProse, isFeed, feedHtmlToText,
  FEED_SOURCES, FEED_FULLTEXT, fetchFeed,
} from '../src/organs/ingest/feed.js';
import { routeKind } from '../src/organs/ingest/webfetch.js';

// RSS/Atom feeds read WHOLE (docs/civic-apis.md "Feeds"). The organ is dependency-free but for the
// deliberate admit, so every parser is tested offline; the network calls ride an injected fetch.

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
  <title>City Hall Notices</title>
  <description>Official notices &amp; agendas.</description>
  <link>https://city.example.gov/notices</link>
  <lastBuildDate>Mon, 06 Jul 2026 12:00:00 GMT</lastBuildDate>
  <item>
    <title>Zoning board agenda</title>
    <link>https://city.example.gov/notices/zoning-07</link>
    <description>&lt;p&gt;The board will &lt;b&gt;hear&lt;/b&gt; three variances.&lt;/p&gt;</description>
    <pubDate>Sat, 04 Jul 2026 00:00:00 GMT</pubDate>
    <author>clerk@city.example.gov</author>
    <category>zoning</category><category>agenda</category>
  </item>
  <item>
    <title>Water main advisory</title>
    <link>https://city.example.gov/notices/water-11</link>
    <description><![CDATA[Boil-water notice for the north district.]]></description>
    <pubDate>Fri, 03 Jul 2026 00:00:00 GMT</pubDate>
  </item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
  <title>State Register</title><subtitle>Rules &amp; notices.</subtitle>
  <updated>2026-07-05T00:00:00Z</updated>
  <entry>
    <title>Emergency rule: wildfire smoke</title>
    <link href="https://reg.example.gov/rule/42" rel="alternate"/>
    <summary>An emergency rule takes effect today.</summary>
    <updated>2026-07-05T00:00:00Z</updated>
    <author><name>Jane Roe</name></author>
  </entry>
</feed>`;

const ARTICLE = '<html><body><article><h1>Zoning board agenda</h1>' +
  '<p>Full text: the board will hear three variance requests at 6pm.</p></article></body></html>';

test('isFeed recognises RSS/Atom and rejects JSON', () => {
  assert.equal(isFeed(RSS), true);
  assert.equal(isFeed(ATOM), true);
  assert.equal(isFeed('{"items":[{"title":"x"}]}'), false);   // JSON that mentions "item" is not a feed
  assert.equal(isFeed('<html><body>hi</body></html>'), false);
});

test('parseFeedItems reads RSS items in full — date, author, categories, decoded summary', () => {
  const items = parseFeedItems(RSS);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'Zoning board agenda');
  assert.equal(items[0].link, 'https://city.example.gov/notices/zoning-07');
  assert.match(items[0].summary, /The board will hear three variances\./);   // HTML stripped
  assert.equal(items[0].published, 'Sat, 04 Jul 2026 00:00:00 GMT');
  assert.equal(items[0].author, 'clerk@city.example.gov');
  assert.deepEqual(items[0].categories, ['zoning', 'agenda']);
  assert.equal(items[1].summary, 'Boil-water notice for the north district.');   // CDATA unwrapped
});

test('parseFeedItems reads Atom entries — href link, name author', () => {
  const items = parseFeedItems(ATOM);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Emergency rule: wildfire smoke');
  assert.equal(items[0].link, 'https://reg.example.gov/rule/42');
  assert.equal(items[0].author, 'Jane Roe');
  assert.equal(items[0].published, '2026-07-05T00:00:00Z');
});

test('parseFeedItems honours the k cap', () => {
  assert.equal(parseFeedItems(RSS, 1).length, 1);
});

test('feedMeta reads the channel identity, not the items', () => {
  const m = feedMeta(RSS);
  assert.equal(m.title, 'City Hall Notices');
  assert.match(m.description, /Official notices & agendas\./);
  assert.equal(m.link, 'https://city.example.gov/notices');
  const a = feedMeta(ATOM);
  assert.equal(a.title, 'State Register');
  assert.match(a.description, /Rules & notices\./);
});

test('feedToTable makes one row per item with the stable feed columns', () => {
  const t = feedToTable(parseFeedItems(RSS), { name: 'notices' });
  assert.deepEqual(t.columns, ['title', 'published', 'author', 'link', 'summary']);
  assert.equal(t.rows.length, 2);
  assert.equal(t.rows[0].title, 'Zoning board agenda');
  assert.equal(t.rows[0].link, 'https://city.example.gov/notices/zoning-07');
});

test('feedToProse renders the whole feed as dated blocks', () => {
  const prose = feedToProse(feedMeta(RSS), parseFeedItems(RSS));
  assert.match(prose, /City Hall Notices/);
  assert.match(prose, /1\. Zoning board agenda/);
  assert.match(prose, /\[zoning, agenda\]/);
  assert.match(prose, /2\. Water main advisory/);
});

test('feedHtmlToText strips tags and decodes entities', () => {
  assert.equal(feedHtmlToText('<p>A &amp; B</p><p>C</p>'), 'A & B\nC');
});

// ── the search KIND + full-text hook, through an injected ctx ────────────────
const ctxFor = (bodies) => ({ fetchUrl: async (url) => ({ text: bodies[url] ?? '' }) });

test('FEED_SOURCES.feed fetches a feed URL and returns each item as a hit', async () => {
  const ctx = ctxFor({ 'https://city.example.gov/rss': RSS });
  const items = await FEED_SOURCES.feed(ctx, 'https://city.example.gov/rss', 8);
  assert.equal(items.length, 2);
  assert.equal(items[0].source, 'feed');
  assert.equal(items[0].url, 'https://city.example.gov/notices/zoning-07');
  assert.equal(items[0].published, 'Sat, 04 Jul 2026 00:00:00 GMT');
});

test('FEED_SOURCES.feed returns [] for a non-URL query and for a non-feed body', async () => {
  assert.deepEqual(await FEED_SOURCES.feed(ctxFor({}), 'not a url', 8), []);
  const ctx = ctxFor({ 'https://x.example/page': '<html><body>hi</body></html>' });
  assert.deepEqual(await FEED_SOURCES.feed(ctx, 'https://x.example/page', 8), []);
});

test('FEED_FULLTEXT.feed pulls the item\'s linked article, with the summary as the floor', async () => {
  const client = ctxFor({ 'https://city.example.gov/notices/zoning-07': ARTICLE });
  const item = { url: 'https://city.example.gov/notices/zoning-07', text: 'short', _feedItem: { link: 'https://city.example.gov/notices/zoning-07', summary: 'short' } };
  const full = await FEED_FULLTEXT.feed(client, item);
  assert.match(full, /the board will hear three variance requests at 6pm/);
});

test('fetchFeed is the deliberate whole-feed path — meta, items, table, admitted source', async () => {
  const client = ctxFor({ 'https://city.example.gov/rss': RSS });
  const out = await fetchFeed('https://city.example.gov/rss', { client });
  assert.equal(out.meta.title, 'City Hall Notices');
  assert.equal(out.items.length, 2);
  assert.equal(out.table.rows.length, 2);
  assert.ok(out.admitted?.record, 'admits a web-source record');
  assert.equal(out.admitted.record.engine, 'web:feed');
  assert.match(out.admitted.doc.text || out.admitted.doc.raw || '', /Zoning board agenda/);
});

test('fetchFeed returns null for a non-feed body', async () => {
  const client = ctxFor({ 'https://x.example/j': '{"a":1}' });
  assert.equal(await fetchFeed('https://x.example/j', { client }), null);
});

test('routeKind sends a bare URL and rss/feed phrasing to feed', () => {
  assert.equal(routeKind('https://city.example.gov/rss.xml'), 'feed');
  assert.equal(routeKind('subscribe to the council rss'), 'feed');
  assert.equal(routeKind('atom feed for the state register'), 'feed');
});
