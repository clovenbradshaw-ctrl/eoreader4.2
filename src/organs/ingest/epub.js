// EO: SIG·SEG(Field → Field,Entity) — EPUB reading: the zip → the whole book, in order
// An EPUB is a zip archive: META-INF/container.xml points at the OPF (the book's manifest and
// declared reading order), the manifest maps ids to files, and the spine lists those ids in the
// order the book is meant to be read. This module is the PARSING core — pure functions over
// decoded zip entries — kept apart from the fetch+unzip glue (gutenberg.js) so container/OPF/spine
// parsing is offline-testable without a real .epub file or a network call.
//
// Reused, not reinvented: each spine chapter is XHTML, so it reduces to prose the same way any
// fetched web page does (html-text.js's htmlToText) — no second HTML reader. And Project
// Gutenberg's EPUBs carry the SAME "*** START/END OF THE PROJECT GUTENBERG EBOOK ***" markers the
// plain-text rendition does (inside a `pg-boilerplate` header/footer chapter), so once the spine
// is flattened to one text blob, gutenberg.js's existing stripGutenbergBoilerplate strips the
// license furniture exactly as it does for the .txt path — one boilerplate strip, two formats.

import { htmlToText } from './html-text.js';

// resolvePath(basePath, rel) — a manifest href is relative to the OPF's OWN directory inside the
// zip, not the archive root (`OEBPS/content.opf` + `chapter1.html` → `OEBPS/chapter1.html`).
// POSIX-style only (a zip never uses backslashes); '.' and '..' segments collapse.
export const resolvePath = (basePath, rel) => {
  const r = String(rel || '');
  if (/^[a-z][\w+.-]*:/i.test(r)) return r;   // an absolute URI (rare) — leave it alone
  const baseDir = basePath.includes('/') ? basePath.slice(0, basePath.lastIndexOf('/') + 1) : '';
  const parts = (baseDir + r).split('/');
  const out = [];
  for (const p of parts) {
    if (p === '' || p === '.') continue;
    if (p === '..') out.pop();
    else out.push(p);
  }
  return out.join('/');
};

// parseContainerPath(xml) → the OPF's path inside the zip, read from META-INF/container.xml's
// <rootfile full-path="…">. Every valid EPUB carries exactly this file at this fixed location —
// the one part of the format that is not negotiable, so this is the entry point into the archive.
export const parseContainerPath = (xml) => {
  const m = /<rootfile\b[^>]*\bfull-path=["']([^"']+)["']/i.exec(String(xml || ''));
  return m ? m[1] : null;
};

// parseOpf(xml, opfPath) → { title, creator, spineHrefs } — the book's declared title/author
// (dc:title/dc:creator) and its READING ORDER: the manifest maps each item's id to its file
// (href, resolved against the OPF's directory); the spine lists those ids in order. An itemref
// marked linear="no" (a cover/ad page some editions insert outside the main flow) is skipped, and
// only manifest items whose media-type is (X)HTML are ever read as chapters — the spine can also
// list the NCX or other non-prose items in older EPUB2 files, which this excludes.
export const parseOpf = (xml, opfPath = '') => {
  const s = String(xml || '');
  const title = (/<dc:title[^>]*>([^<]*)</i.exec(s) || [])[1]?.trim() || '';
  const creator = (/<dc:creator[^>]*>([^<]*)</i.exec(s) || [])[1]?.trim() || '';
  const manifest = {};
  const itemRe = /<item\b([^>]*?)\/?>/gi;
  let m;
  const manifestBlock = /<manifest\b[^>]*>([\s\S]*?)<\/manifest>/i.exec(s)?.[1] || '';
  while ((m = itemRe.exec(manifestBlock))) {
    const attrs = m[1];
    const id = /\bid=["']([^"']+)["']/i.exec(attrs)?.[1];
    const href = /\bhref=["']([^"']+)["']/i.exec(attrs)?.[1];
    const mediaType = /\bmedia-type=["']([^"']+)["']/i.exec(attrs)?.[1] || '';
    if (id && href) manifest[id] = { href, mediaType };
  }
  const spineHrefs = [];
  const spineBlock = /<spine\b[^>]*>([\s\S]*?)<\/spine>/i.exec(s)?.[1] || '';
  const itemrefRe = /<itemref\b([^>]*?)\/?>/gi;
  while ((m = itemrefRe.exec(spineBlock))) {
    const attrs = m[1];
    if (/\blinear=["']no["']/i.test(attrs)) continue;
    const idref = /\bidref=["']([^"']+)["']/i.exec(attrs)?.[1];
    const item = idref && manifest[idref];
    if (item && /html|xml/i.test(item.mediaType)) spineHrefs.push(resolvePath(opfPath, item.href));
  }
  return { title, creator, spineHrefs };
};

// asText(v) — a zip entry as decoded UTF-8 text, whether the unzip step handed back a string
// (a test fake) or raw bytes (the real `fflate` path).
const asText = (v) => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  try { return new TextDecoder('utf-8').decode(v); } catch { return ''; }
};

// caseInsensitiveGet(entries, name) — zip readers agree on entry NAMES but not always on the
// exact case a given producer used for `META-INF/container.xml`; look up the exact name first,
// then fall back to a case-insensitive scan rather than fail the whole book over it.
const caseInsensitiveGet = (entries, name) => {
  if (name in entries) return entries[name];
  const low = name.toLowerCase();
  const key = Object.keys(entries).find((k) => k.toLowerCase() === low);
  return key != null ? entries[key] : undefined;
};

// epubTextFromEntries(entries) → { text, title, creator } — the WHOLE BOOK, chapters read in
// spine order and reduced to prose exactly as any fetched web page is (htmlToText). `entries` is
// name → (string | Uint8Array) for every file the archive held; only the container/OPF/XHTML
// entries are ever read — images, fonts, and stylesheets in the "-images" rendition sit in the
// archive untouched, the same "text and structure, not the pictures" contract every other ingest
// path keeps. Returns `{ text: '' }` when the archive isn't a readable EPUB (no container/OPF) —
// pure and defensive, never throws on a malformed or partial zip.
export const epubTextFromEntries = (entries) => {
  const files = entries || {};
  const containerXml = asText(caseInsensitiveGet(files, 'META-INF/container.xml'));
  const opfPath = parseContainerPath(containerXml);
  if (!opfPath) return { text: '', title: '', creator: '' };
  const opfXml = asText(caseInsensitiveGet(files, opfPath));
  const { title, creator, spineHrefs } = parseOpf(opfXml, opfPath);
  const chapters = spineHrefs
    .map((href) => htmlToText(asText(caseInsensitiveGet(files, href))))
    .filter(Boolean);
  return { text: chapters.join('\n\n'), title, creator };
};
