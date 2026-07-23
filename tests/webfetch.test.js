import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseFeed, htmlToText, createWebClient, searchAndAdmit, fetchAndAdmit, routeKind, SEARCH_SOURCES, DEFAULT_FEED_PROXY,
  relevanceScore, isRelevant,
} from '../src/organs/ingest/webfetch.js';

// The live half over the CORS feed proxy (docs/web-search.md): GET <proxy>?url=<URL> → raw body.
// Search is done by fetching a feed-SEARCH URL and parsing its items. The offline tests inject a
// fake fetch; one live test (gated behind EO_LIVE_PROXY=1) verifies the real proxy contract.

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>q - Google News</title>
  <item><title>Kafka's Metamorphosis at 110</title><link>https://example.org/a</link>
    <description>&lt;p&gt;A look back at the &lt;b&gt;novella&lt;/b&gt;.&lt;/p&gt;</description>
    <pubDate>Sat, 27 Jun 2026 00:00:00 GMT</pubDate></item>
  <item><title>Grete Samsa, reconsidered</title><link>https://example.org/b</link>
    <description><![CDATA[On the sister's role.]]></description></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
  <entry><title>Atom item one</title><link href="https://example.org/x" rel="alternate"/>
    <summary>First summary.</summary><updated>2026-06-27T00:00:00Z</updated></entry>
</feed>`;

// A fake fetch: route the proxied URL by the inner ?url= target to canned bodies.
const fakeFetch = (routes) => async (proxiedUrl) => {
  const inner = new URL(proxiedUrl).searchParams.get('url') || '';   // searchParams already decodes once
  const body = routes[inner];
  return { ok: body != null, status: body != null ? 200 : 404, text: async () => body ?? '' };
};

test('parseFeed reads RSS items (title, link, summary, date), decoding entities and CDATA', () => {
  const items = parseFeed(RSS);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Kafka's Metamorphosis at 110");
  assert.equal(items[0].link, 'https://example.org/a');
  assert.match(items[0].summary, /A look back at the novella\./);   // HTML in the description stripped
  assert.equal(items[1].summary, "On the sister's role.");          // CDATA unwrapped
});

test('parseFeed reads Atom entries (link via href)', () => {
  const items = parseFeed(ATOM);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Atom item one');
  assert.equal(items[0].link, 'https://example.org/x');
});

test('htmlToText strips tags and decodes entities', () => {
  assert.equal(htmlToText('<h1>Title</h1><p>A &amp; B.</p><script>x()</script>'), '# Title\nA & B.');
});

test('htmlToText keeps block structure — heading, paragraphs, and list items never weld together', () => {
  // The reader/surfer downstream depends on headings and list items landing on their own line
  // (perceiver/parse/sentences.js welds a heading onto the next sentence when they share one).
  // A heading also carries its level as a markdown marker ("## History") — detectStructure's
  // strongest structural signal — rather than flattening to a bare line indistinguishable from
  // a paragraph (reader-render.js, the "Biography"/"Childhood" heading-detection fix).
  const html = '<article><h2>History</h2><p>First paragraph.</p>' +
    '<ul><li>Alpha</li><li>Beta</li></ul><p>Second paragraph.</p></article>';
  const lines = htmlToText(html).split('\n').filter(Boolean);
  assert.deepEqual(lines, ['## History', 'First paragraph.', 'Alpha', 'Beta', 'Second paragraph.']);
});

test('htmlToText reads a table row by row instead of welding every cell into one line', () => {
  const html = '<table><tr><td>Year</td><td>Title</td></tr>' +
    '<tr><td>2013</td><td>Fruitvale Station</td></tr></table>';
  const lines = htmlToText(html).split('\n').filter(Boolean);
  assert.deepEqual(lines, ['Year Title', '2013 Fruitvale Station']);
});

test('the client builds the proxy URL as ?url=<encoded> and returns the body', async () => {
  let seen = null;
  const fetchImpl = async (u) => { seen = u; return { ok: true, status: 200, text: async () => 'BODY' }; };
  const c = createWebClient({ proxy: 'https://p.example/feed', fetchImpl });
  const r = await c.fetchUrl('https://news.example/rss?q=a&b=2');
  assert.equal(seen, 'https://p.example/feed?url=' + encodeURIComponent('https://news.example/rss?q=a&b=2'));
  assert.equal(r.text, 'BODY');
});

test('fetchUrlBytes reads the SAME proxied URL but as bytes, not a lossy text decode', async () => {
  const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0xff, 0xfe, 0x00]);   // "%PDF-" + non-UTF8 bytes
  let seen = null;
  const fetchImpl = async (u) => {
    seen = u;
    return { ok: true, status: 200, arrayBuffer: async () => pdfBytes.buffer, text: async () => { throw new Error('should not be called'); } };
  };
  const c = createWebClient({ proxy: 'https://p.example/feed', fetchImpl });
  const r = await c.fetchUrlBytes('https://site.example/report.pdf');
  assert.equal(seen, 'https://p.example/feed?url=' + encodeURIComponent('https://site.example/report.pdf'), 'same proxy hop as fetchUrl');
  assert.deepEqual([...r.bytes], [...pdfBytes], 'the exact bytes ride through — nothing decoded/re-encoded');
});

const WIKI = JSON.stringify({ query: { search: [
  { title: 'Paris', snippet: '<span class="searchmatch">Paris</span> is the capital of France.' },
  { title: 'List of capitals of France', snippet: 'The capital of France has been Paris since 1944.' },
] } });

test('routeKind picks the source: facts → wikipedia, current → news, a URL → feed', () => {
  assert.equal(routeKind('what is the capital of france'), 'wikipedia');
  assert.equal(routeKind('latest news on the strike'), 'news');
  assert.equal(routeKind('https://example.org/feed.xml'), 'feed');
  assert.deepEqual(Object.keys(SEARCH_SOURCES).sort(), [
    'api', 'arxiv', 'civic', 'commons', 'commonsmedia', 'feed', 'github', 'gutenberg', 'news',
    'openalex', 'wikibooks', 'wikidata', 'wikinews', 'wikipedia', 'wikiquote', 'wikisource',
    'wikispecies', 'wikiversity', 'wikivoyage', 'wiktionary',
  ]);
});

test('routeKind reaches the library: named projects win outright, and book/word/quote phrasing routes', () => {
  assert.equal(routeKind('gutenberg frankenstein'), 'gutenberg');            // a named source wins
  assert.equal(routeKind('wikiquote churchill on democracy'), 'wikiquote');
  assert.equal(routeKind('wikidata douglas adams'), 'wikidata');
  assert.equal(routeKind('wikimedia commons kafka portrait'), 'commons');
  assert.equal(routeKind('the full text of metamorphosis'), 'gutenberg');    // book-shaped → whole books
  assert.equal(routeKind('kafka novella about an insect'), 'gutenberg');
  assert.equal(routeKind('definition of ungeziefer'), 'wiktionary');
  assert.equal(routeKind('quotes about metamorphosis'), 'wikiquote');
  assert.equal(routeKind('house of commons sitting calendar'), 'wikipedia'); // bare "commons" is prose, not the project
});

test('wikipedia search → admit: JSON results become provenance-tagged sources, traced to the page', async () => {
  const wikiUrl = 'https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=capital%20of%20france&format=json&srlimit=2';
  const client = createWebClient({ proxy: 'https://p.example/feed', fetchImpl: fakeFetch({ [wikiUrl]: WIKI }) });
  const admitted = await searchAndAdmit('capital of france', { client, kind: 'wikipedia', k: 2 });
  assert.equal(admitted.length, 2);
  assert.equal(admitted[0].doc.sourceKind, 'web-source');
  assert.equal(admitted[0].doc.web.url, 'https://en.wikipedia.org/wiki/Paris');
  assert.match(admitted[0].doc.text, /Paris is the capital of France/);
  assert.match(admitted[0].record.engine, /wikipedia/);
});

test('news search → admit (kind: news): feed results become provenance-tagged sources', async () => {
  const searchUrl = (q) => `https://news.example/rss?q=${encodeURIComponent(q)}`;
  const client = createWebClient({
    proxy: 'https://p.example/feed', searchUrl,
    fetchImpl: fakeFetch({ [searchUrl('grete')]: RSS }),
  });
  const admitted = await searchAndAdmit('grete', { client, kind: 'news', k: 2 });
  assert.equal(admitted.length, 2);
  assert.equal(admitted[0].doc.web.url, 'https://example.org/a');
  assert.equal(admitted[0].record.retrieval_query, 'grete');
});

test('fetchPages pulls the actual website for each result (find random sites as needed)', async () => {
  const searchUrl = (q) => `https://news.example/rss?q=${encodeURIComponent(q)}`;
  const client = createWebClient({
    proxy: 'https://p.example/feed', searchUrl,
    fetchImpl: fakeFetch({
      [searchUrl('grete')]: RSS,
      'https://example.org/a': '<h1>Grete</h1><p>The full article body about Grete Samsa.</p>',
      'https://example.org/b': '<p>Another full page.</p>',
    }),
  });
  const admitted = await searchAndAdmit('grete', { client, kind: 'news', k: 2, fetchPages: true });
  assert.match(admitted[0].doc.text, /full article body about Grete Samsa/, 'the actual page text was admitted, not the snippet');
});

test('searchAndAdmit fires onAdmit once per result — the progress beat that keeps a slow walk alive', async () => {
  // A hop pulling several full pages through a slow proxy must PROVE it is advancing, or the
  // reader's no-progress watchdog aborts the turn mid-walk ("the web lookup stalled"). onAdmit is
  // that proof: one beat per fetched+admitted page, carrying the running count.
  const searchUrl = (q) => `https://news.example/rss?q=${encodeURIComponent(q)}`;
  const client = createWebClient({
    proxy: 'https://p.example/feed', searchUrl,
    fetchImpl: fakeFetch({
      [searchUrl('grete')]: RSS,
      'https://example.org/a': '<p>Page A body, long enough to admit.</p>',
      'https://example.org/b': '<p>Page B body, long enough to admit.</p>',
    }),
  });
  const beats = [];
  const admitted = await searchAndAdmit('grete', {
    client, kind: 'news', k: 2, fetchPages: true, onAdmit: (a, i) => beats.push(i),
  });
  assert.equal(admitted.length, 2);
  assert.deepEqual(beats, [1, 2], 'one beat per result, in order, carrying the running count');
});

test('a throwing onAdmit never breaks admission (a progress beat must not cost the fetch)', async () => {
  const wikiUrl = 'https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=capital%20of%20france&format=json&srlimit=2';
  const client = createWebClient({ proxy: 'https://p.example/feed', fetchImpl: fakeFetch({ [wikiUrl]: WIKI }) });
  const admitted = await searchAndAdmit('capital of france', {
    client, kind: 'wikipedia', k: 2, onAdmit: () => { throw new Error('beat blew up'); },
  });
  assert.equal(admitted.length, 2, 'results still admitted despite a throwing onAdmit');
});

test('fetchAndAdmit pulls a page through the proxy and admits its text', async () => {
  const client = createWebClient({
    proxy: 'https://p.example/feed',
    fetchImpl: fakeFetch({ 'https://example.org/a': '<h1>Grete</h1><p>She played the violin.</p>' }),
  });
  const { doc, record } = await fetchAndAdmit('https://example.org/a', { client });
  assert.equal(record.url, 'https://example.org/a');
  assert.match(doc.text, /Grete\nShe played the violin\./);
});

// ── relevance gating — an off-topic hit should not be admitted just because it was returned ──

test('relevanceScore: a shared place name is not the same question', () => {
  const query = 'what caused the 1919 Boston molasses flood';
  const onTopic = { title: 'Great Molasses Flood', text: 'A wave of molasses killed 21 in a 1919 Boston disaster.' };
  const offTopic = { title: 'Honolulu molasses spill', text: 'A 2013 pipeline leak spilled molasses into the harbor.' };
  const unrelated = { title: 'Orange Line (MBTA)', text: 'A rapid transit line serving Greater Boston.' };
  assert.ok(relevanceScore(query, onTopic) > relevanceScore(query, offTopic), 'the real flood article scores higher than a same-word namesake');
  assert.ok(relevanceScore(query, offTopic) > 0, 'it does share ONE word — the score is not zero, just low');
  assert.equal(relevanceScore(query, unrelated) < 0.34, true, 'sharing only "Boston" is not enough');
});

test('isRelevant: a 1-word query is never gated (no way to tell off-topic from same-topic-different-wording)', () => {
  assert.equal(isRelevant('grete', { title: 'Kafka\'s Metamorphosis', text: 'A look back at the novella.' }), true);
});

test('isRelevant reproduces the reported failure: 8 Wikipedia hits for a Boston 1919 flood query reduce to the one real match', () => {
  const query = 'what caused the 1919 Boston molasses flood';
  const hits = [
    { title: 'Great Molasses Flood', text: 'The 1919 disaster in Boston killed 21 when a molasses tank burst, flooding the streets.' },
    { title: 'Honolulu molasses spill', text: 'A 2013 pipeline leak in Honolulu harbor spilled molasses.' },
    { title: 'Boston', text: 'Boston is the capital and most populous city of Massachusetts.' },
    { title: 'History of New Orleans', text: 'New Orleans was founded in 1718 by French colonists.' },
    { title: 'Orange Line (MBTA)', text: 'A rapid transit line serving Greater Boston.' },
    { title: 'History of Italian Americans in Boston', text: 'Italian immigration to the North End of Boston began in the 1860s.' },
  ];
  const kept = hits.filter((h) => isRelevant(query, h));
  assert.equal(kept.length, 1, `only the real match should survive (kept: ${kept.map((h) => h.title).join(', ')})`);
  assert.equal(kept[0].title, 'Great Molasses Flood');
});

test('searchAndAdmit skips off-topic hits before spending a fetch on them', async () => {
  const wikiUrl = 'https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=1919%20Boston%20molasses%20flood&format=json&srlimit=2';
  const WIKI_MIXED = JSON.stringify({ query: { search: [
    { title: 'Great Molasses Flood', snippet: 'The 1919 disaster in Boston killed 21 when a molasses tank burst.' },
    { title: 'Orange Line (MBTA)', snippet: 'A rapid transit line serving Greater Boston.' },
  ] } });
  const client = createWebClient({ proxy: 'https://p.example/feed', fetchImpl: fakeFetch({ [wikiUrl]: WIKI_MIXED }) });
  const admitted = await searchAndAdmit('1919 Boston molasses flood', { client, kind: 'wikipedia', k: 2 });
  assert.equal(admitted.length, 1, 'the off-topic transit-line hit is not admitted as a source');
  assert.match(admitted[0].doc.text, /molasses/);
});

// Live contract check against the real proxy — opt-in (the default run stays offline/green):
//   EO_LIVE_PROXY=1 node --test tests/webfetch.test.js
test('LIVE: the real proxy fetches a page, and Wikipedia + News searches both return items', { skip: !process.env.EO_LIVE_PROXY }, async () => {
  const c = createWebClient({ proxy: DEFAULT_FEED_PROXY });
  const page = await c.fetchUrl('https://example.com/');
  assert.match(page.text, /Example Domain/);
  const wiki = await c.search('capital of france', { kind: 'wikipedia', k: 3 });
  assert.ok(wiki.length > 0 && /paris/i.test(wiki.map(i => `${i.title} ${i.text}`).join(' ')), 'wikipedia found Paris');
  const news = await c.search('kafka', { kind: 'news', k: 3 });
  assert.ok(news.length > 0 && news[0].title, 'news returned items');
});
