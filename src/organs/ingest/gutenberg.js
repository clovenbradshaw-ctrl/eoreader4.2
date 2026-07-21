// EO: SIG·SEG·INS(Void → Field,Entity, Binding,Clearing,Making) — Project Gutenberg library — whole books
// Project Gutenberg as a research source — WHOLE BOOKS, read entire.
// (docs/web-search.md "The library sources")
//
// The research walks (turn/research.js, turn/deep-research.js) gather by search kinds
// (webfetch.js SEARCH_SOURCES). This module adds the LIBRARY: search the Project Gutenberg
// catalog through Gutendex (the PG catalog as a JSON API, no key), and — under `fetchPages`,
// the mode every research walk already runs in — pull each hit's PLAIN-TEXT EBOOK in full and
// admit the ENTIRE BOOK as a source. Not a snippet, not a first chapter: the same
// "absorb as much as possible" discipline admitWebSource already runs for pages, applied to
// books, so a question about Grete's violin grounds on the passage where she plays it even
// when that passage is 40,000 words in.
//
// Everything travels the ONE fetch primitive the client already has (ctx.fetchUrl, through the
// CORS feed proxy), so the talker never reaches the network and the admitted doc carries the
// same web-source/1 provenance every fetched page carries. Pure but for that injected fetch;
// the catalog parsing, format picking, and boilerplate stripping are all offline-testable.

import { admitWebSource } from './websource.js';
import { epubTextFromEntries } from './epub.js';

// The Gutendex catalog endpoint (https://gutendex.com — the Project Gutenberg catalog served
// as JSON). A search hits /books?search=<q>; results carry id, title, authors, subjects,
// summaries, and a `formats` map of mime-type → file URL.
export const GUTENDEX_BASE = 'https://gutendex.com';
export const gutendexSearchUrl = (q) => `${GUTENDEX_BASE}/books?search=${encodeURIComponent(q)}`;

// The canonical PG page for a book, and the stable plain-text location by ebook number —
// the fallback when a catalog entry lists no usable text/plain format.
export const gutenbergBookUrl = (id) => `https://www.gutenberg.org/ebooks/${id}`;
export const gutenbergTextUrl = (id) => `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`;

// The EPUB3 ("with images") rendition — the PRIMARY read: every book PG hosts gets one built,
// unlike the plain .txt (recent additions sometimes carry only HTML/EPUB), and it is the
// full-fidelity edition (illustrations, proper chapter structure) rather than a bare text dump.
// The catalog only ever advertises the REDIRECT form (`/ebooks/{id}.epub3.images`) — the same
// "malformed Location through a proxy" risk `pickTextFormat` above refuses for .txt — and PG's
// cache directory also carries a VERSIONED direct file (`pg{id}-images-3.epub`) whose numeric
// suffix isn't predictable from the id alone. But every book's cache directory additionally
// carries this UNVERSIONED direct name alongside the versioned one, so it — not the redirect, not
// the guessable-only-per-book versioned file — is the one stable URL worth hardcoding.
export const gutenbergEpubUrl = (id) => `https://www.gutenberg.org/cache/epub/${id}/pg${id}-images.epub`;

// pickTextFormat(formats) → the URL of the book's PLAIN-TEXT rendition, or null. Prefer an
// explicit utf-8 text/plain, then any text/plain that is not a zip archive (the proxy returns
// bodies as text, so a .zip would arrive as mojibake, not a book).
//
// CRUCIALLY it must NOT return the catalog's usual text/plain URL — `/ebooks/{id}.txt.utf-8`
// (or `.txt`). That is a REDIRECT endpoint whose Location header PG serves malformed
// (`…/https,%20http://www.gutenberg.org/cache/epub/{id}/pg{id}.txt`), so a client that follows
// it lands on a 404 HTML error page, not the book. Admitting that page is the "landing page,
// not the .txt" bug: `stripGutenbergBoilerplate` finds no PG markers, returns the HTML, and the
// reader parses site chrome (Search / Donate / DOCTYPE) instead of the novel. So we keep only
// DIRECT file URLs (`/files/…`, `/cache/epub/…`); when the catalog offers only the redirect
// form, we return null and the caller falls back to the canonical cache text URL
// (`gutenbergTextUrl`), which is stable and already UTF-8.
export const pickTextFormat = (formats = {}) => {
  const direct = Object.entries(formats || {}).filter(([mime, url]) => {
    const u = String(url || '');
    return /^text\/plain/i.test(mime) && !/\.zip($|\?)/i.test(u) && !/\/ebooks\/\d+\.txt\b/i.test(u);
  });
  if (!direct.length) return null;
  const utf8 = direct.find(([mime]) => /utf-?8/i.test(mime));
  return (utf8 || direct[0])[1];
};

// parseGutendex(json, k) → catalog hits as search items. `text` is the catalog's own summary
// (or the subjects), so a snippet-only admission still says what the book IS; the full text
// arrives only under fetchPages. Each item keeps its ebook id and text URL so the full-text
// hook can pull the book without re-searching.
export const parseGutendex = (json, k = 5) => {
  let j = json;
  if (typeof j === 'string') { try { j = JSON.parse(j); } catch { return []; } }
  return (j?.results || []).slice(0, Math.max(1, k)).map((b) => {
    const authors = (b.authors || []).map((a) => a?.name).filter(Boolean).join('; ');
    const summary = String((b.summaries || [])[0] || '').trim();
    const subjectList = (b.subjects || []).slice(0, 6);
    const subjects = subjectList.join('; ');
    const bookTitle = String(b.title || '');
    return {
      title: authors ? `${bookTitle} — ${authors}` : bookTitle,
      text: summary || subjects || bookTitle,
      url: gutenbergBookUrl(b.id),
      source: 'gutenberg',
      gutenbergId: b.id,
      // The clean, un-concatenated fields — what the book surface renders as its own rows
      // (title / author / subjects), separate from the combined `title` the generic list uses.
      bookTitle, author: authors, subjects: subjectList, summary,
      downloads: Number.isFinite(b.download_count) ? b.download_count : null,
      textUrl: pickTextFormat(b.formats) || gutenbergTextUrl(b.id),
      published: b.authors?.[0]?.death_year ? String(b.authors[0].death_year) : null,
    };
  });
};

// The PG transcription markers: everything before `*** START OF THE PROJECT GUTENBERG
// EBOOK … ***` is license/host boilerplate, everything from `*** END OF …` on is the license
// in full. Older books say THIS for THE; both are matched.
const START_MARK = /^\s*\*{3}\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK\b[^\n]*$/im;
const END_MARK   = /^\s*\*{3}\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK\b[^\n]*$/im;

// The labeled front-matter fields worth KEEPING from the header — the book telling you what it
// is. parse/metadata.js reads exactly this shape (`Title:`, `Author:`, …) into doc.metadata, so
// these lines are carried over the cut instead of drowned with the license text around them.
const FRONT_FIELD = /^(Title|Author|Editor|Translator|Illustrator|Release date|Language|Original publication|Credits)\s*:/i;

// stripGutenbergBoilerplate(raw) → the BOOK: the labeled front matter (title/author/…, kept so
// the metadata harvester still reads it), then everything between the START and END markers.
// A text with no PG markers is returned unchanged — this strips transcription furniture, it
// never eats a document it does not recognise.
export const stripGutenbergBoilerplate = (raw) => {
  const s = String(raw || '').replace(/\r\n?/g, '\n');
  const start = START_MARK.exec(s);
  if (!start) return s.trim();
  const end = END_MARK.exec(s);
  const head = s.slice(0, start.index);
  const body = s.slice(start.index + start[0].length, end ? end.index : undefined).trim();
  const front = head.split('\n').map((l) => l.trim()).filter((l) => FRONT_FIELD.test(l));
  return (front.length ? front.join('\n') + '\n\n' : '') + body;
};

// The search KIND (webfetch.js SEARCH_SOURCES shape): (ctx, query, k) → items. Snippet-level —
// the catalog's summaries — until fetchPages asks for the books themselves.
export const GUTENBERG_SOURCES = {
  gutenberg: async (ctx, query, k) =>
    parseGutendex((await ctx.fetchUrl(gutendexSearchUrl(query))).text, k),
};

// looksLikeBook(text) → does the boilerplate-stripped body read as an actual ebook, or as the
// HTML error/landing page PG's malformed .txt redirect lands on? A real book opens on its front
// matter or prose; an error page opens on an HTML tag. Cheap, structural — the guard that lets
// the full-text hook fall back to the canonical .txt when the catalog URL misbehaves.
export const looksLikeBook = (text) => {
  const t = String(text || '').replace(/^﻿/, '').trimStart();
  if (t.length < 200) return false;                                  // too short to be a book body
  if (/^<(?:!doctype|html|head|body|div|meta|title)\b/i.test(t)) return false;   // an HTML page, not a .txt
  return true;
};

// unzipEpub(bytes) → { name: Uint8Array } for every archive entry. Lazily loads `fflate` from
// the CDN — the same "inject the library, bundle nothing" seam import-file.js uses for pdf.js /
// SheetJS / Readability, so nothing loads until an EPUB actually needs unzipping. Cached after
// the first load; a caller (a test) can bypass it entirely by passing its own `unzip`.
let _unzipSync = null;
const loadUnzipSync = async () => {
  if (_unzipSync) return _unzipSync;
  const { unzipSync } = await import('https://cdn.jsdelivr.net/npm/fflate@0.8.2/+esm');
  _unzipSync = unzipSync;
  return _unzipSync;
};

// readGutenbergEpub(id, { client, unzip }) → boilerplate-stripped book text, or '' on any
// failure. Fetches the EPUB3 rendition as RAW BYTES (`client.fetchUrlBytes` — the same seam
// PDFs use; a zip put through a UTF-8 `.text()` decode loses the bytes it can't represent and
// can never be unzipped again), unzips it, reads every spine chapter in order (epub.js), and
// runs the concatenated result through the SAME boilerplate strip the .txt path uses — PG's
// EPUBs carry the identical START/END markers, inside a `pg-boilerplate` header/footer chapter.
const readGutenbergEpub = async (id, { client, unzip = null } = {}) => {
  if (!client?.fetchUrlBytes) return '';
  const { bytes, ok } = await client.fetchUrlBytes(gutenbergEpubUrl(id));
  if (ok === false || !bytes || !bytes.length) return '';
  const doUnzip = unzip || await loadUnzipSync();
  const files = doUnzip(bytes);
  const { text } = epubTextFromEntries(files);
  return stripGutenbergBoilerplate(text);
};

// readGutenbergBook(id, { client, unzip }) → the WHOLE BOOK, boilerplate stripped — EPUB FIRST
// (the illustrated, full-fidelity edition PG builds for every book it hosts, unlike the plain
// .txt some recent additions never got), falling back to the canonical cache .txt when the EPUB
// can't be read: no bytes-fetch/zip support in this runtime, a network hiccup, or an archive that
// doesn't parse as a book. A book missing one rendition still reads from the other.
export const readGutenbergBook = async (id, { client, unzip = null } = {}) => {
  try {
    const epubText = await readGutenbergEpub(id, { client, unzip });
    if (looksLikeBook(epubText)) return epubText;
  } catch { /* fall through to .txt */ }
  try {
    return stripGutenbergBoilerplate((await client.fetchUrl(gutenbergTextUrl(id))).text);
  } catch { return ''; }
};

// The FULL-TEXT hook (webfetch.js FULL_TEXT shape): under fetchPages, a gutenberg item's page
// fetch is the ENTIRE BOOK — the EPUB first, the canonical .txt as its fallback, and (only if
// BOTH fail to read as a book) whatever text/plain format the catalog itself advertised, which
// may be PG's malformed .txt redirect — so a landing page is never the last resort admitted.
// This is "read entire books as needed": the research walk asked for pages, and for this source
// a page IS a book.
export const GUTENBERG_FULLTEXT = {
  gutenberg: async (client, item) => {
    const id = item?.gutenbergId ?? gutenbergIdOf(item?.url) ?? gutenbergIdOf(item?.textUrl);
    if (id == null) return '';
    const whole = await readGutenbergBook(id, { client });
    if (looksLikeBook(whole)) return whole;
    const canonical = gutenbergTextUrl(id);
    const first = item?.textUrl || canonical;
    const read = async (u) => stripGutenbergBoilerplate((await client.fetchUrl(u)).text);
    let text = await read(first);
    if (first !== canonical && !looksLikeBook(text)) {
      try { text = await read(canonical); } catch { /* keep what the first URL gave */ }
    }
    return text || whole;
  },
};

const nowIso = () => { try { return new Date().toISOString(); } catch { return null; } };

// gutenbergIdOf(ref) → the ebook number in any of the shapes a user (or a hop) holds a book
// by: a bare number, "#1342", a gutenberg.org /ebooks/1342 or /cache/epub/1342/… URL.
export const gutenbergIdOf = (ref) => {
  const s = String(ref || '').trim();
  const m = /^#?(\d+)$/.exec(s)
    || /gutenberg\.org\/(?:ebooks|files|cache\/epub)\/(\d+)/i.exec(s);
  return m ? Number(m[1]) : null;
};

// fetchGutenbergBook(ref, opts) → { doc, record } | null — the DELIBERATE one-book path: the
// caller names a book (by ebook number or PG URL) and gets the whole thing admitted as a
// source. Because this read is chosen, not ambient, it carries a higher hang guard than a
// search hop: a long novel (War and Peace runs ~3.2M chars) is read entire rather than cut at
// the page-safety backstop.
//
// `onProgress` (optional) rides straight into admitWebSource's own escape hatch — without it a
// whole novel parses in one synchronous sweep and locks the tab for the whole read; with it the
// parse yields as it goes. Threaded only to the direct admission: `store` (an in-memory dedup
// layer no production caller currently supplies) keeps its own synchronous admit() contract.
export const fetchGutenbergBook = async (ref, { client, store = null, rawStore = null, fetched_at = nowIso(), hangGuard = 6_000_000, unzip = null, onProgress = null } = {}) => {
  const id = gutenbergIdOf(ref);
  if (!id || !client) return null;
  const text = await readGutenbergBook(id, { client, unzip });
  if (!text) return null;
  const title = (/^Title\s*:\s*(.+)$/im.exec(text) || [])[1]?.trim() || `Project Gutenberg #${id}`;
  const payload = {
    url: gutenbergBookUrl(id), title, text,
    retrieval_query: String(ref), engine: 'web:gutenberg', fetched_at,
  };
  const admitted = store ? store.admit(payload, { hangGuard }) : await admitWebSource(payload, { hangGuard, onProgress });
  if (rawStore && admitted?.record?.content_hash) {
    try {
      await rawStore.put(admitted.record.content_hash, text,
        { url: payload.url, title, fetched_at });
    } catch { /* never block admission */ }
  }
  return admitted;
};
