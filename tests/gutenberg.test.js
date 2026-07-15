import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  pickTextFormat, parseGutendex, gutenbergTextUrl, gutenbergBookUrl,
  GUTENBERG_FULLTEXT, looksLikeBook, stripGutenbergBoilerplate,
} from '../src/organs/ingest/gutenberg.js';

// THE GUTENBERG SEARCH READS THE ACTUAL .txt, NEVER PG's MALFORMED REDIRECT / A LANDING PAGE.
//
// Gutendex advertises the plain text as `/ebooks/{id}.txt.utf-8` — a redirect whose Location
// header PG serves malformed (`…/https,%20http://…/cache/epub/{id}/pg{id}.txt`), so a client that
// follows it 404s to a ~6 KB HTML error page. Admitting that page as "the book" made the reader
// parse site chrome (Search / Donate / DOCTYPE) instead of the novel — the reported "not doing
// good entity recognition". The fix: prefer the canonical cache `.txt`, never the redirect form.

const FRANKENSTEIN_FORMATS = {
  'text/html': 'https://www.gutenberg.org/ebooks/84.html.images',
  'application/epub+zip': 'https://www.gutenberg.org/ebooks/84.epub3.images',
  'application/octet-stream': 'https://www.gutenberg.org/cache/epub/84/pg84-h.zip',
  'text/plain; charset=utf-8': 'https://www.gutenberg.org/ebooks/84.txt.utf-8',
};

test('pickTextFormat: refuses the /ebooks/{id}.txt.utf-8 redirect endpoint', () => {
  // The only text/plain PG lists is the broken redirect → null, so the caller uses the cache .txt.
  assert.equal(pickTextFormat(FRANKENSTEIN_FORMATS), null);
  assert.equal(pickTextFormat({ 'text/plain': 'https://www.gutenberg.org/ebooks/84.txt' }), null);
  assert.equal(pickTextFormat({}), null);
});

test('pickTextFormat: keeps a DIRECT file URL, preferring UTF-8', () => {
  const url = pickTextFormat({
    'text/plain; charset=us-ascii': 'https://www.gutenberg.org/files/84/84.txt',
    'text/plain; charset=utf-8': 'https://www.gutenberg.org/files/84/84-0.txt',
  });
  assert.equal(url, 'https://www.gutenberg.org/files/84/84-0.txt');
  // A lone direct (non-utf8) file is still fine — it is a real .txt, not the redirect.
  assert.equal(
    pickTextFormat({ 'text/plain; charset=us-ascii': 'https://www.gutenberg.org/files/84/84.txt' }),
    'https://www.gutenberg.org/files/84/84.txt',
  );
  // A .zip masquerading as text/plain is never picked (it would arrive as mojibake).
  assert.equal(pickTextFormat({ 'text/plain': 'https://www.gutenberg.org/files/84/84-0.zip' }), null);
});

test('parseGutendex: the item textUrl falls back to the canonical cache .txt, never the redirect', () => {
  const json = { results: [{
    id: 84, title: 'Frankenstein; or, the Modern Prometheus',
    authors: [{ name: 'Shelley, Mary Wollstonecraft', death_year: 1851 }],
    subjects: ['Horror tales', 'Science fiction'], summaries: ['A creature…'],
    download_count: 90000, formats: FRANKENSTEIN_FORMATS,
  }] };
  const [item] = parseGutendex(json, 5);
  assert.equal(item.textUrl, gutenbergTextUrl(84));
  assert.equal(item.textUrl, 'https://www.gutenberg.org/cache/epub/84/pg84.txt');
  assert.ok(!/\.txt\.utf-8/.test(item.textUrl), 'never the broken redirect endpoint');
  assert.equal(item.url, gutenbergBookUrl(84));   // the landing page is still the human link
});

test('looksLikeBook: an HTML error page is not a book; real prose is', () => {
  assert.equal(looksLikeBook('<!DOCTYPE html>\n<html class="client-nojs" lang="en-US">…'), false);
  assert.equal(looksLikeBook('   '), false);
  assert.equal(looksLikeBook('Title: Frankenstein\n\n' + 'a'.repeat(300)), true);
});

// A fake client mirroring PG's behaviour: the redirect endpoint yields the 404 HTML page; the
// canonical cache URL yields the real book with its transcription markers.
const HTML_404 = '<!DOCTYPE html>\n<html class="client-nojs" lang="en-US"><head><title>404</title></head>'
  + '<body>Search Donate About Project Gutenberg Contact Us</body></html>';
const REAL_BOOK = 'The Project Gutenberg eBook of Frankenstein\n\n'
  + '*** START OF THE PROJECT GUTENBERG EBOOK FRANKENSTEIN ***\n\n'
  + 'Title: Frankenstein\nAuthor: Mary Shelley\n\n'
  + 'You will rejoice to hear that no disaster has accompanied the commencement of an enterprise. '.repeat(20)
  + '\n\n*** END OF THE PROJECT GUTENBERG EBOOK FRANKENSTEIN ***\nLicense text follows.';

const fakeClient = () => ({
  fetchUrl: async (url) => ({
    url,
    text: /\/cache\/epub\/\d+\/pg\d+\.txt$/.test(url) ? REAL_BOOK : HTML_404,
    ok: true, status: 200,
  }),
});

test('GUTENBERG_FULLTEXT: falls back to the canonical cache .txt when the catalog URL is not a book', async () => {
  // An item whose textUrl is the broken redirect: the hook must recover the real book, not admit
  // the HTML error page.
  const item = { source: 'gutenberg', gutenbergId: 84, url: gutenbergBookUrl(84),
    textUrl: 'https://www.gutenberg.org/ebooks/84.txt.utf-8' };
  const text = await GUTENBERG_FULLTEXT.gutenberg(fakeClient(), item);
  assert.ok(looksLikeBook(text), 'the recovered text reads as a book');
  assert.match(text, /You will rejoice to hear/);
  assert.doesNotMatch(text, /DOCTYPE|Donate/, 'no HTML chrome leaked in');
  // Boilerplate was stripped: the license footer is gone, the front matter kept.
  assert.doesNotMatch(text, /License text follows/);
  assert.match(text, /Author: Mary Shelley/);
});

test('GUTENBERG_FULLTEXT: reads the id from the ebooks URL when no textUrl/id is set', async () => {
  const text = await GUTENBERG_FULLTEXT.gutenberg(fakeClient(), { source: 'gutenberg', url: 'https://www.gutenberg.org/ebooks/84' });
  assert.ok(looksLikeBook(text));
  assert.match(text, /You will rejoice to hear/);
});
