import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseArxivAtom, arxivIdOf, reduceHtml, ARXIV_SOURCES, ARXIV_FULLTEXT, arxivSearchUrl,
} from '../src/organs/ingest/arxiv.js';
import {
  parseOpenAlex, deInvertAbstract, openalexIdOf, OPENALEX_SOURCES, OPENALEX_FULLTEXT,
} from '../src/organs/ingest/openalex.js';
import { routeKind, SEARCH_SOURCES } from '../src/organs/ingest/webfetch.js';

const ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2101.00001v2</id>
    <published>2021-01-01T00:00:00Z</published>
    <title>Attention Is All You Need Again</title>
    <summary>  We revisit attention.
    Across several lines.  </summary>
    <author><name>Ada Lovelace</name></author>
    <author><name>Alan Turing</name></author>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/hep-th/9901001v1</id>
    <title>An Old-Scheme Identifier &amp; Its Quirks</title>
    <summary>An old-scheme paper.</summary>
    <author><name>Ed Witten</name></author>
  </entry>
</feed>`;

const AR5IV = `<html><head><style>.x{color:red}</style></head><body>
<h1>Attention Is All You Need Again</h1>
<p>${'We revisit the attention mechanism in careful detail. '.repeat(12)}</p>
<script>track()</script></body></html>`;

const OPENALEX = JSON.stringify({
  results: [
    {
      id: 'https://openalex.org/W123',
      display_name: 'Sleep and Memory Consolidation',
      publication_year: 2019,
      cited_by_count: 4321,
      authorships: [{ author: { display_name: 'Jane Roe' } }],
      abstract_inverted_index: { Sleep: [0], consolidates: [1], memory: [2, 5], and: [3], improves: [4] },
      open_access: { is_oa: true, oa_url: 'https://example.org/paper' },
      best_oa_location: { landing_page_url: 'https://example.org/paper.html', pdf_url: 'https://example.org/paper.pdf' },
    },
    { id: 'https://openalex.org/W999', title: 'No Abstract Work', cited_by_count: 0 },
  ],
});

// ── arXiv ────────────────────────────────────────────────────────────────────

test('arxiv: Atom parses into full items, new and old id schemes', () => {
  const items = parseArxivAtom(ATOM, 5);
  assert.equal(items.length, 2);
  assert.equal(items[0].arxivId, '2101.00001');
  assert.match(items[0].title, /Attention Is All You Need Again — Ada Lovelace, Alan Turing/);
  assert.equal(items[0].text, 'We revisit attention. Across several lines.');
  assert.equal(items[0].url, 'https://arxiv.org/abs/2101.00001');
  assert.equal(items[0].source, 'arxiv');
  assert.equal(items[1].arxivId, 'hep-th/9901001');       // old scheme survives
  assert.match(items[1].title, /&/);                       // XML entity decoded
});

test('arxiv: arxivIdOf reads every shape', () => {
  assert.equal(arxivIdOf('2101.00001'), '2101.00001');
  assert.equal(arxivIdOf('2101.00001v3'), '2101.00001');
  assert.equal(arxivIdOf('https://arxiv.org/abs/2401.12345v1'), '2401.12345');
  assert.equal(arxivIdOf('https://ar5iv.org/abs/2401.12345'), '2401.12345');
  assert.equal(arxivIdOf('http://arxiv.org/pdf/1706.03762v5.pdf'), '1706.03762');
  assert.equal(arxivIdOf('hep-th/9901001'), 'hep-th/9901001');
  assert.equal(arxivIdOf('not a paper'), null);
});

test('arxiv: the source kind fetches and parses through ctx', async () => {
  let seen = null;
  const ctx = { fetchUrl: async (u) => { seen = u; return { text: ATOM }; } };
  const items = await ARXIV_SOURCES.arxiv(ctx, 'attention transformers', 3);
  assert.equal(seen, arxivSearchUrl('attention transformers', 3));
  assert.equal(items.length, 2);
});

test('arxiv: full text reads ar5iv HTML, abstract as the floor', async () => {
  const client = { fetchUrl: async () => ({ text: AR5IV }) };
  const text = await ARXIV_FULLTEXT.arxiv(client, { arxivId: '2101.00001', text: 'abstract' });
  assert.match(text, /Attention Is All You Need Again/);
  assert.ok(text.length > 400);
  // a total miss falls back to the abstract, never empty
  const bad = { fetchUrl: async () => { throw new Error('down'); } };
  assert.equal(await ARXIV_FULLTEXT.arxiv(bad, { arxivId: '2101.00001', text: 'abstract floor' }), 'abstract floor');
});

test('arxiv: reduceHtml drops script/style and unwraps tags', () => {
  const t = reduceHtml('<style>a{}</style><h1>Title</h1><p>A &amp; B.</p><script>x()</script>');
  assert.match(t, /Title/); assert.match(t, /A & B\./);
  assert.doesNotMatch(t, /x\(\)|color|<\/?\w+/);
});

// ── OpenAlex ─────────────────────────────────────────────────────────────────

test('openalex: an inverted abstract is reconstructed in order', () => {
  assert.equal(
    deInvertAbstract({ Sleep: [0], consolidates: [1], memory: [2, 5], and: [3], improves: [4] }),
    'Sleep consolidates memory and improves memory');
  assert.equal(deInvertAbstract(null), '');
});

test('openalex: works parse with the citation prior and OA location', () => {
  const items = parseOpenAlex(OPENALEX, 5);
  assert.equal(items.length, 2);
  assert.match(items[0].title, /Sleep and Memory Consolidation — Jane Roe/);
  assert.equal(items[0].text, 'Sleep consolidates memory and improves memory');
  assert.equal(items[0].citedBy, 4321);
  assert.equal(items[0].year, 2019);
  assert.equal(items[0].isOA, true);
  assert.equal(items[0].oaUrl, 'https://example.org/paper.html');
  assert.equal(items[1].text, 'No Abstract Work');    // no abstract → title is the payload
  assert.equal(items[1].citedBy, 0);
});

test('openalex: openalexIdOf reads the id shapes', () => {
  assert.equal(openalexIdOf('https://openalex.org/W2741809807'), 'W2741809807');
  assert.equal(openalexIdOf('W123'), 'W123');
  assert.equal(openalexIdOf('nope'), null);
});

test('openalex: full text reads clean HTML but never a PDF', async () => {
  const client = { fetchUrl: async () => ({ text: `<p>${'Full open-access body text. '.repeat(30)}</p>` }) };
  const html = await OPENALEX_FULLTEXT.openalex(client, { oaUrl: 'https://x/paper.html', text: 'abs' });
  assert.ok(html.length > 400);
  // a pdf oaUrl is not fetched (binary through the text proxy) — abstract is the payload
  const pdf = await OPENALEX_FULLTEXT.openalex(client, { oaUrl: 'https://x/paper.pdf', pdfUrl: 'https://x/paper.pdf', text: 'abs floor' });
  assert.equal(pdf, 'abs floor');
});

// ── routing ──────────────────────────────────────────────────────────────────

test('routeKind reaches the academic shelves', () => {
  assert.equal(routeKind('arxiv 1706.03762'), 'arxiv');                       // named wins
  assert.equal(routeKind('openalex sleep and memory'), 'openalex');
  assert.equal(routeKind('recent preprint on diffusion models'), 'arxiv');
  assert.equal(routeKind('what does the research on sleep and memory say'), 'openalex');
  assert.equal(routeKind('a systematic review of mindfulness studies'), 'openalex');
  assert.equal(routeKind('the capital of france'), 'wikipedia');              // still the default
  assert.ok('arxiv' in SEARCH_SOURCES && 'openalex' in SEARCH_SOURCES);
});
