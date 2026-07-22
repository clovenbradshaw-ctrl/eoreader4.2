import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  pickTextFormat, parseGutendex, gutenbergTextUrl, gutenbergBookUrl, gutenbergEpubUrl,
  GUTENBERG_FULLTEXT, looksLikeBook, stripGutenbergBoilerplate, readGutenbergBook, fetchGutenbergBook,
} from '../src/organs/ingest/gutenberg.js';
import { createReaderApp } from '../src/rooms/reader/app.js';
import { createAuditLog } from '../src/rooms/audit/index.js';

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

// ── EPUB-first ingestion ─────────────────────────────────────────────────────────────────────
// gutenbergEpubUrl is the stable direct file, never the catalog's redirect form.
test('gutenbergEpubUrl: the stable direct "-images.epub" file, matching the cache .txt pattern', () => {
  assert.equal(gutenbergEpubUrl(84), 'https://www.gutenberg.org/cache/epub/84/pg84-images.epub');
  assert.doesNotMatch(gutenbergEpubUrl(84), /\/ebooks\//, 'never the catalog redirect form');
});

// A fake EPUB archive (the same shape epub.test.js exercises directly) with its own PG START/END
// markers — proves the boilerplate strip runs on the EPUB path exactly as it does for .txt.
const EPUB_CONTAINER = '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>';
const EPUB_OPF = `<package>
  <metadata><dc:title xmlns:dc="x">Frankenstein</dc:title></metadata>
  <manifest>
    <item id="hdr" href="header.html" media-type="application/xhtml+xml"/>
    <item id="c1" href="chapter1.html" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="hdr"/><itemref idref="c1"/></spine>
</package>`;
const EPUB_ENTRIES = {
  'META-INF/container.xml': EPUB_CONTAINER,
  'OEBPS/content.opf': EPUB_OPF,
  'OEBPS/header.html': '<p>Title: Frankenstein</p><p>Author: Mary Shelley</p>'
    + '<p>*** START OF THE PROJECT GUTENBERG EBOOK FRANKENSTEIN ***</p>',
  'OEBPS/chapter1.html': '<p>' + 'You will rejoice to hear that no disaster has accompanied the start. '.repeat(10) + '</p>'
    + '<p>*** END OF THE PROJECT GUTENBERG EBOOK FRANKENSTEIN ***</p><p>License text follows.</p>',
};

// A client that can fetch bytes (any non-empty payload — the fake `unzip` below ignores the
// actual bytes and returns the fixed archive above, so the test never needs a real zip file).
const epubClient = ({ bytesOk = true, txtOk = true } = {}) => ({
  fetchUrlBytes: async (url) => ({ url, bytes: bytesOk ? new Uint8Array([1, 2, 3]) : new Uint8Array(0), ok: bytesOk }),
  fetchUrl: async (url) => ({ url, text: txtOk ? REAL_BOOK : HTML_404, ok: txtOk, status: txtOk ? 200 : 404 }),
});
const fakeUnzip = () => EPUB_ENTRIES;

test('readGutenbergBook: reads the EPUB when bytes+unzip are available, boilerplate stripped', async () => {
  const text = await readGutenbergBook(84, { client: epubClient(), unzip: fakeUnzip });
  assert.ok(looksLikeBook(text));
  assert.match(text, /You will rejoice to hear/);
  assert.match(text, /Author: Mary Shelley/);
  assert.doesNotMatch(text, /License text follows/, 'the EPUB footer chapter is stripped like the .txt footer');
});

test('readGutenbergBook: falls back to the canonical .txt when the client has no fetchUrlBytes', async () => {
  // No `fetchUrlBytes` on the client at all (an older/minimal client) — readGutenbergEpub must
  // no-op rather than throw, and the .txt path still delivers the book.
  const text = await readGutenbergBook(84, { client: { fetchUrl: epubClient().fetchUrl } });
  assert.ok(looksLikeBook(text));
  assert.match(text, /You will rejoice to hear/);
});

test('readGutenbergBook: falls back to .txt when the EPUB bytes fetch fails', async () => {
  const text = await readGutenbergBook(84, { client: epubClient({ bytesOk: false }), unzip: fakeUnzip });
  assert.ok(looksLikeBook(text));
  assert.match(text, /You will rejoice to hear/);
});

test('readGutenbergBook: falls back to .txt when unzip throws (no zip support / corrupt archive)', async () => {
  const throwingUnzip = () => { throw new Error('not a zip'); };
  const text = await readGutenbergBook(84, { client: epubClient(), unzip: throwingUnzip });
  assert.ok(looksLikeBook(text));
  assert.match(text, /You will rejoice to hear/);
});

test('readGutenbergBook: empty string when both the EPUB and the .txt fail', async () => {
  const client = { fetchUrlBytes: async () => ({ ok: false, bytes: new Uint8Array(0) }),
                    fetchUrl: async () => { throw new Error('network down'); } };
  const text = await readGutenbergBook(84, { client, unzip: fakeUnzip });
  assert.equal(text, '');
});

test('fetchGutenbergBook: admits the EPUB-derived book when bytes+unzip are available', async () => {
  const admitted = await fetchGutenbergBook('84', { client: epubClient(), unzip: fakeUnzip });
  assert.ok(admitted?.doc);
  assert.match(admitted.doc.text, /You will rejoice to hear/);
  assert.equal(admitted.record.title, 'Frankenstein');
});

// A "Read" hit on a library search result (recordHit, rooms/reader/app/ingest.js) fetches the
// WHOLE book and admits it in one go — parsed eagerly (admitWebSource's plain synchronous call),
// that locks the tab for the whole read and freezes any progress UI riding on the same thread
// (the "freezes and stops showing the name" report). onProgress must reach admitWebSource so a
// deliberate whole-book read can opt into the chunked, yielding parse instead.
test('fetchGutenbergBook: threads onProgress through to the admission, without changing the result', async () => {
  const calls = [];
  const admitted = await fetchGutenbergBook('84', { client: epubClient(), unzip: fakeUnzip, onProgress: (p) => calls.push(p) });
  assert.ok(admitted?.doc);
  assert.match(admitted.doc.text, /You will rejoice to hear/);
  assert.equal(admitted.record.title, 'Frankenstein');
  assert.ok(calls.length >= 2, 'onProgress fired (at least the start and end of the parse)');
  assert.equal(calls.at(-1).done, calls.at(-1).total);
});

// ── ingestUrl: the SAME freeze, hit through the plainer path ───────────────────────────────────
// recordHit (a library-search "Read" hit) threads onProgress into admitWebSource, above. But a
// Gutenberg link pasted straight into the address bar / Add-source modal goes through ingestUrl
// (rooms/reader/app/ingest.js), which called fetchGutenbergBook with no onProgress at all — so
// THAT path still ran the whole book through parseText's one synchronous sweep and froze the tab
// (the reported "gutenberg import… freezes"). This pins the fix at the app level.
const LONG_BOOK_BODY = Array.from({ length: 600 }, (_, i) =>
  `You will rejoice to hear that no disaster has accompanied chapter ${i}.`).join(' ');
const LONG_REAL_BOOK = 'The Project Gutenberg eBook of Frankenstein\n\n'
  + '*** START OF THE PROJECT GUTENBERG EBOOK FRANKENSTEIN ***\n\n'
  + 'Title: Frankenstein\nAuthor: Mary Shelley\n\n'
  + LONG_BOOK_BODY
  + '\n\n*** END OF THE PROJECT GUTENBERG EBOOK FRANKENSTEIN ***\nLicense text follows.';

// Stands in for the proxy chain: no EPUB bytes available (readGutenbergEpub no-ops before ever
// touching the fflate CDN import), so the canonical cache .txt carries the book — same fallback
// exercised by readGutenbergBook's own "no fetchUrlBytes" test above, just through the real client.
const gutenbergFetchImpl = async (proxiedUrl) => {
  const u = String(proxiedUrl);
  if (u.includes('pg84-images.epub')) return { ok: false, status: 404, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) };
  if (u.includes('pg84.txt')) return { ok: true, status: 200, text: async () => LONG_REAL_BOOK, arrayBuffer: async () => new ArrayBuffer(0) };
  return { ok: false, status: 404, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) };
};

test('ingestUrl: a pasted Gutenberg link threads onProgress too — the parse yields instead of freezing the busy pill', async () => {
  const app = createReaderApp({ audit: createAuditLog({ capacity: 16 }), fetchImpl: gutenbergFetchImpl });
  if (!app.state.ready) {
    await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  }

  // Subscribing BEFORE the ingest starts and reading state.busy synchronously inside the callback
  // (emit() invokes subscribers synchronously) captures every transition with no polling — every
  // onProgress tick from inside the chunked parse loop lands here exactly when it fires.
  const busyLabels = [];
  const unsub = app.subscribe((k) => { if (k === 'busy' && app.state.busy) busyLabels.push(app.state.busy.label); });

  const src = await app.ingestUrl('https://www.gutenberg.org/ebooks/84');
  unsub();

  assert.ok(src, 'the pasted Gutenberg URL admitted a source');
  assert.match(src.text, /You will rejoice to hear/);

  // Without onProgress threaded, parseText takes its one-synchronous-sweep path and the pill never
  // shows a "done / total" tick — only the generic "Reading …" label. With it threaded, the 600-
  // sentence body crosses the parser's 250-sentence chunk boundary, so at least two such ticks land.
  const progressTicks = busyLabels.filter((l) => /\d+ \/ \d+ sentences/.test(l || ''));
  assert.ok(progressTicks.length >= 2,
    `expected multiple incremental "N / total sentences" ticks (the chunked, yielding parse); saw busy labels: ${JSON.stringify(busyLabels)}`);
});
