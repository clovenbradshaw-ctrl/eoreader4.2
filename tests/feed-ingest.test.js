import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseFeedItems, feedMeta, feedToTable, feedToProse, isFeed, feedHtmlToText,
  feedItemId, feedPointer, feedPointers, FEED_SOURCES, FEED_FULLTEXT, fetchFeed,
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

test('feedItemId prefers the GUID/link, else a stable synthetic id', () => {
  assert.equal(feedItemId({ id: 'urn:guid:1', link: 'https://x/1' }), 'urn:guid:1');
  assert.equal(feedItemId({ link: 'https://x/2' }), 'https://x/2');
  const a = feedItemId({ title: 'T', published: 'D' });
  const b = feedItemId({ title: 'T', published: 'D' });
  assert.equal(a, b);                                   // deterministic
  assert.match(a, /^feed:[0-9a-f]{8}$/);
});

test('feedPointer keeps only the id + re-find fields — never the body', () => {
  const it = parseFeedItems(RSS)[1];                    // "Water main advisory" (guid = its link)
  const p = feedPointer(it, { feed: 'https://city.example.gov/rss' });
  assert.equal(p.schema, 'feed-pointer/1');
  assert.equal(p.id, 'https://city.example.gov/notices/water-11');
  assert.equal(p.url, 'https://city.example.gov/notices/water-11');
  assert.equal(p.published, 'Fri, 03 Jul 2026 00:00:00 GMT');
  assert.equal(p.feed, 'https://city.example.gov/rss');
  assert.equal('summary' in p, false, 'the body is NOT stored on the pointer');
});

test('feedPointers dedupes by unique id (a re-poll never doubles an item)', () => {
  const items = parseFeedItems(RSS);
  const ps = feedPointers([...items, items[0]], { feed: 'f' });   // item 0 repeated
  assert.equal(ps.length, 2);
});

test('fetchFeed DEFAULTS to pointer-only — no data stored, just id-keyed references', async () => {
  const client = ctxFor({ 'https://city.example.gov/rss': RSS });
  const out = await fetchFeed('https://city.example.gov/rss', { client });
  assert.equal(out.meta.title, 'City Hall Notices');
  assert.equal(out.items.length, 2);
  assert.equal(out.table.rows.length, 2);              // an in-memory view — not persisted
  assert.equal(out.pointers.length, 2);
  assert.equal(out.pointers[0].id, 'https://city.example.gov/notices/zoning-07');
  assert.equal(out.admitted, null, 'nothing admitted/stored by default');
});

test('fetchFeed with { admit:true } opts IN to storing the whole feed as one source', async () => {
  const client = ctxFor({ 'https://city.example.gov/rss': RSS });
  const out = await fetchFeed('https://city.example.gov/rss', { client, admit: true });
  assert.ok(out.admitted?.record, 'admits a web-source record when asked');
  assert.equal(out.admitted.record.engine, 'web:feed');
  assert.match(out.admitted.doc.text || out.admitted.doc.raw || '', /Zoning board agenda/);
  assert.equal(out.pointers.length, 2);                // pointers are returned either way
});

test('fetchFeed returns null for a non-feed body', async () => {
  const client = ctxFor({ 'https://x.example/j': '{"a":1}' });
  assert.equal(await fetchFeed('https://x.example/j', { client }), null);
});


test('reader ingestUrl auto-detects RSS/Atom feeds and registers a feed source with pointers', async () => {
  const { installIngest } = await import('../src/rooms/reader/app/ingest.js');
  const added = [];
  const appCtx = {
    client: ctxFor({ 'https://city.example.gov/rss': RSS }),
    state: {},
    emit: () => {},
    logIt: () => {},
    beginJob: () => 'job:1',
    settleJob: () => {},
    addSource: (src) => { added.push(src); return { sn: 'S1', ...src }; },
  };
  installIngest(appCtx);
  const src = await appCtx.ingestUrl('https://city.example.gov/rss');
  assert.equal(src.kind, 'feed');
  assert.equal(src.title, 'City Hall Notices');
  assert.equal(src.feed.pointers.length, 2);
  assert.match(src.text, /Boil-water notice/);
});

test('reader exposes a deliberate ingestFeed API for feed URLs', async () => {
  const { installIngest } = await import('../src/rooms/reader/app/ingest.js');
  const appCtx = {
    client: ctxFor({ 'https://city.example.gov/rss': RSS }),
    state: {}, emit: () => {}, logIt: () => {},
    addSource: (src) => ({ sn: 'S1', ...src }),
  };
  installIngest(appCtx);
  const src = await appCtx.ingestFeed('https://city.example.gov/rss');
  assert.equal(src.kind, 'feed');
  assert.equal(src.feed.meta.title, 'City Hall Notices');
});

test('routeKind sends a bare URL and rss/feed phrasing to feed', () => {
  assert.equal(routeKind('https://city.example.gov/rss.xml'), 'feed');
  assert.equal(routeKind('subscribe to the council rss'), 'feed');
  assert.equal(routeKind('atom feed for the state register'), 'feed');
});

// ── a .pdf URL is read as BYTES, never as lossy text (the bug: PDF syntax admitted as prose) ──

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0xff, 0xff, 0xff, 0xff]);

const pdfClient = (bytes) => ({
  fetchUrl: async () => { throw new Error('a .pdf URL must never be read through fetchUrl (lossy text)'); },
  fetchUrlBytes: async () => ({ bytes }),
});

test('reader ingestUrl reads a .pdf URL as bytes, never as text — no silent "obj<<" prose', async () => {
  const { installIngest } = await import('../src/rooms/reader/app/ingest.js');
  const added = [];
  const appCtx = {
    client: pdfClient(PDF_BYTES),
    state: {}, emit: () => {}, logIt: () => {},
    beginJob: () => 'job:1', settleJob: () => {},
    addSource: (src) => { const s = { sn: 'S1', reg: 'S1', docId: 'doc-1', ...src }; added.push(s); return s; },
    finishReading: () => {},
  };
  installIngest(appCtx);
  const src = await appCtx.ingestUrl('https://www.example.gov/report.pdf');
  // Offline in tests, pdf.js's CDN load fails — the SAME resilient fallback a file upload gets
  // (import-file.js) lands: an honest binary-fallback reading, never a bare "Ready" web page.
  assert.equal(src.kind, 'pdf');
  assert.equal(src.coverage.complete, false, 'never marked complete/ready when text extraction did not run');
  assert.ok(src.coverage.dropped.some((d) => d.includes('PDF text extraction unavailable')));
});

test('reader ingestUrl detects PDF syntax that survived a lossy text fetch and re-reads as bytes', async () => {
  const { installIngest } = await import('../src/rooms/reader/app/ingest.js');
  const garbageText = '%PDF-1.7\n1 0 obj<</Type/Catalog>>\nendobj\n2 0 obj<</Type/Pages>>\nendobj\nxref\ntrailer<<>>';
  let fetchBytesCalled = false;
  const added = [];
  const appCtx = {
    client: {
      fetchUrl: async () => ({ text: garbageText }),
      fetchUrlBytes: async () => { fetchBytesCalled = true; return { bytes: PDF_BYTES }; },
    },
    state: {}, emit: () => {}, logIt: () => {},
    beginJob: () => 'job:1', settleJob: () => {},
    addSource: (src) => { const s = { sn: 'S1', reg: 'S1', docId: 'doc-1', ...src }; added.push(s); return s; },
    finishReading: () => {},
  };
  installIngest(appCtx);
  // No .pdf extension here — a URL a user might paste for a report served without one.
  const src = await appCtx.ingestUrl('https://www.example.gov/reports/911');
  assert.equal(fetchBytesCalled, true, 'the garbage-text guard re-fetched as bytes instead of admitting the mangled text');
  assert.notEqual(src.kind, 'web', 'never admitted through admitWebSource as an ordinary clean page');
  assert.ok(!src.text.includes('1 0 obj<<'), 'the raw PDF object syntax is not what landed as the "page" text');
});
