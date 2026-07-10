// EO: SIG·SEG·INS(Void → Field,Entity, Binding,Clearing,Making) — arXiv library — full-text papers
// arXiv as a research source — WHOLE PAPERS, read entire. (docs/web-search.md "The library sources")
//
// The scholarly twin of gutenberg.js. Search the arXiv API (Atom, no key) for candidate papers;
// under `fetchPages` — the mode every research walk already runs in — pull each hit's FULL TEXT
// as clean HTML from ar5iv (arXiv's LaTeX→HTML renderer) and read the whole paper, not the
// abstract. A paper about sparse attention grounds on the section where the mechanism is defined,
// even when that section is 8,000 words in.
//
// Everything travels the ONE fetch primitive the client already has (ctx.fetchUrl / client.fetchUrl,
// through the CORS feed proxy), so the talker never reaches the network and the admitted doc
// carries the same web-source/1 provenance every fetched page carries. Zero imports but for the
// deliberate one-paper admit (websource.admitWebSource) — the Atom parsing, id shapes, and HTML
// reduction are all offline-testable. PDFs are deliberately avoided: the proxy returns bodies as
// text, so a PDF arrives as binary mojibake; ar5iv gives real HTML.

import { admitWebSource } from './websource.js';

export const ARXIV_API = 'https://export.arxiv.org/api/query';
export const arxivSearchUrl = (q, k = 5) =>
  `${ARXIV_API}?search_query=all:${encodeURIComponent(q)}&start=0&max_results=${Math.max(1, k)}`;

// The abstract page, the ar5iv full-text HTML, and arXiv's own native HTML (the ar5iv fallback).
export const arxivAbsUrl = (id) => `https://arxiv.org/abs/${id}`;
export const ar5ivUrl = (id) => `https://ar5iv.org/abs/${id}`;
export const arxivHtmlUrl = (id) => `https://arxiv.org/html/${id}`;

// arxivIdOf(ref) → the paper id in any of the shapes a user (or a hop) holds a paper by: a bare
// id (2101.00001, optionally versioned; or an old-style hep-th/9901001), or any arxiv.org/ar5iv URL.
export const arxivIdOf = (ref) => {
  const s = String(ref || '').trim();
  const m = /(?:arxiv\.org|ar5iv(?:\.labs\.arxiv)?\.org)\/(?:abs|pdf|html)\/([^\s?#]+?)(?:v\d+)?(?:\.pdf)?(?:[?#].*)?$/i.exec(s)
    || /^(\d{4}\.\d{4,5})(?:v\d+)?$/.exec(s)
    || /^([a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?$/i.exec(s);
  return m ? m[1] : null;
};

// ── XML / entity helpers (offline, dependency-free) ──────────────────────────
const decodeXml = (s) => String(s || '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#0*39;|&apos;/g, "'").replace(/&#x27;/gi, "'").replace(/&amp;/g, '&');
const collapse = (s) => decodeXml(s).replace(/\s+/g, ' ').trim();
const allTags = (xml, tag) => {
  const out = []; const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'gi'); let m;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
};
const firstTag = (xml, tag) => allTags(xml, tag)[0] ?? '';

// parseArxivAtom(xml, k) → catalog hits as search items. `text` is the abstract, so a snippet-only
// admission still says what the paper IS; the full text arrives only under fetchPages. Each item
// keeps its arXiv id so the full-text hook can pull ar5iv without re-searching.
export const parseArxivAtom = (xml, k = 5) => {
  const s = String(xml || '');
  const entries = allTags(s, 'entry').slice(0, Math.max(1, k));
  return entries.map((e) => {
    const idRaw = collapse(firstTag(e, 'id'));
    const id = arxivIdOf(idRaw) || idRaw;
    const authors = allTags(e, 'author').map((a) => collapse(firstTag(a, 'name'))).filter(Boolean);
    const title = collapse(firstTag(e, 'title'));
    const summary = collapse(firstTag(e, 'summary'));
    return {
      title: authors.length ? `${title} — ${authors.slice(0, 3).join(', ')}` : title,
      text: summary || title,
      url: arxivAbsUrl(id),
      source: 'arxiv',
      arxivId: id,
      authors,
      published: collapse(firstTag(e, 'published')) || null,
    };
  }).filter((it) => it.arxivId);
};

// reduceHtml(html) → readable text: drop script/style/math-source, unwrap tags to spaces, decode
// entities, collapse whitespace but keep paragraph breaks at block boundaries. A local reducer so
// this module never imports webfetch (whose SEARCH_SOURCES spread would make the cycle unsafe).
export const reduceHtml = (html) => {
  let s = String(html || '');
  s = s.replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<(math|svg|figure|nav|header|footer)\b[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/<\/(p|div|section|h[1-6]|li|br|tr|blockquote)>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeXml(s).replace(/[ \t\f\v]+/g, ' ').replace(/ *\n *(?:\n *)+/g, '\n\n').replace(/^\s+|\s+$/g, '');
  return s;
};

// The search KIND (webfetch.js SEARCH_SOURCES shape): (ctx, query, k) → items. Snippet-level (the
// abstracts) until fetchPages asks for the papers themselves.
export const ARXIV_SOURCES = {
  arxiv: async (ctx, query, k) => parseArxivAtom((await ctx.fetchUrl(arxivSearchUrl(query, k))).text, k),
};

// The FULL-TEXT hook (webfetch.js FULL_TEXT shape): under fetchPages, an arxiv item's page fetch is
// the ENTIRE PAPER — ar5iv HTML reduced to text, native arXiv HTML as fallback, the abstract as the
// floor so a full-text miss is a smaller read, never an empty one.
export const ARXIV_FULLTEXT = {
  arxiv: async (client, item) => {
    const id = item?.arxivId || arxivIdOf(item?.url);
    if (!id) return item?.text || '';
    for (const url of [ar5ivUrl(id), arxivHtmlUrl(id)]) {
      try {
        const text = reduceHtml((await client.fetchUrl(url)).text);
        if (text && text.length > 400) return text;
      } catch { /* try the next renderer */ }
    }
    return item?.text || '';
  },
};

const nowIso = () => { try { return new Date().toISOString(); } catch { return null; } };

// fetchArxivPaper(ref, opts) → { doc, record } | null — the DELIBERATE one-paper path: the caller
// names a paper (by id or URL) and gets the whole thing admitted as a source, ar5iv full text with
// the abstract as a floor. Mirrors gutenberg.js#fetchGutenbergBook.
export const fetchArxivPaper = async (ref, { client, store = null, rawStore = null, fetched_at = nowIso(), hangGuard = 4_000_000 } = {}) => {
  const id = arxivIdOf(ref);
  if (!id || !client) return null;
  let text = '';
  for (const url of [ar5ivUrl(id), arxivHtmlUrl(id)]) {
    try { const t = reduceHtml((await client.fetchUrl(url)).text); if (t && t.length > 400) { text = t; break; } }
    catch { /* next */ }
  }
  if (!text) return null;
  const title = (/^\s*([^\n]{4,200})/.exec(text) || [])[1]?.trim() || `arXiv:${id}`;
  const payload = {
    url: arxivAbsUrl(id), title, text,
    retrieval_query: String(ref), engine: 'web:arxiv', fetched_at,
  };
  const admitted = store ? store.admit(payload, { hangGuard }) : admitWebSource(payload, { hangGuard });
  if (rawStore && admitted?.record?.content_hash) {
    try { await rawStore.put(admitted.record.content_hash, text, { url: payload.url, title, fetched_at }); }
    catch { /* never block admission */ }
  }
  return admitted;
};
