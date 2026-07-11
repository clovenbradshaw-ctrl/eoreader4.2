import { test } from 'node:test';
import assert from 'node:assert/strict';

import { directCorsUrl } from '../src/organs/ingest/direct-cors.js';

// The reliability seam (docs/web-search.md): the default (Wikimedia) and academic (OpenAlex) search
// routes answer a browser cross-origin, so the app's fetch chain serves them WITHOUT the proxy —
// a proxy outage can no longer take the common case offline. This pins the host/path rules that
// decide "direct" vs "proxy", so a future edit can't silently route Wikipedia back through the proxy
// (or, worse, send a non-CORS host direct, where the browser would block it).

test('Wikipedia API → direct, with origin=* appended so MediaWiki emits its CORS header', () => {
  const url = 'https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=surveillance&format=json&srlimit=5';
  assert.equal(directCorsUrl(url), `${url}&origin=*`);
});

test('the whole Wikimedia shelf routes direct — every sister project and language edition', () => {
  for (const host of [
    'en.wikipedia.org', 'de.wikipedia.org', 'www.wikidata.org', 'en.wiktionary.org',
    'en.wikiquote.org', 'en.wikisource.org', 'en.wikibooks.org', 'en.wikiversity.org',
    'en.wikinews.org', 'en.wikivoyage.org', 'species.wikimedia.org', 'commons.wikimedia.org',
  ]) {
    const out = directCorsUrl(`https://${host}/w/api.php?action=query&format=json`);
    assert.ok(out && out.startsWith(`https://${host}/w/api.php`), `${host} should route direct`);
    assert.match(out, /[?&]origin=\*/, `${host} needs origin=* for its CORS header`);
  }
});

test('an existing origin param is left alone (never doubled)', () => {
  const url = 'https://www.wikidata.org/w/api.php?action=wbsearchentities&search=x&format=json&origin=*';
  assert.equal(directCorsUrl(url), url);
});

test('OpenAlex → direct, unchanged (it sets Access-Control-Allow-Origin: * on every endpoint)', () => {
  const url = 'https://api.openalex.org/works?search=mass%20surveillance&per_page=5';
  assert.equal(directCorsUrl(url), url);
});

test('a rendered wiki page (not the API) stays on the proxy — only /w/api.php carries the CORS header', () => {
  assert.equal(directCorsUrl('https://en.wikipedia.org/wiki/Surveillance'), null);
});

test('non-CORS hosts stay on the proxy — arbitrary pages, arXiv, ar5iv, Google News RSS', () => {
  assert.equal(directCorsUrl('https://example.org/some-article'), null);
  assert.equal(directCorsUrl('https://export.arxiv.org/api/query?search_query=all:x'), null);
  assert.equal(directCorsUrl('https://ar5iv.org/abs/2101.00001'), null);
  assert.equal(directCorsUrl('https://news.google.com/rss/search?q=flock+safety'), null);
});

test('a lookalike host that is not the real Wikimedia domain never routes direct', () => {
  // Suffix, not substring: `wikipedia.org.evil.com` and `notwikipedia.org` must NOT match.
  assert.equal(directCorsUrl('https://en.wikipedia.org.evil.com/w/api.php?x=1'), null);
  assert.equal(directCorsUrl('https://notwikipedia.org/w/api.php?x=1'), null);
});

test('http (not https) and junk inputs fall back to the proxy rather than throwing', () => {
  assert.equal(directCorsUrl('http://en.wikipedia.org/w/api.php?x=1'), null);   // mixed-content; proxy it
  assert.equal(directCorsUrl('not a url'), null);
  assert.equal(directCorsUrl(''), null);
  assert.equal(directCorsUrl(null), null);
  assert.equal(directCorsUrl(undefined), null);
});
