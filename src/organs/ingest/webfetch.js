// EO: SIG·SEG·INS(Void,Field → Field,Entity, Binding,Clearing,Making) — live fetch/search client over CORS proxy
// The web FETCH/SEARCH client — the live half that feeds the admission core (websource.js).
// (docs/web-search.md)
//
// The proxy is a CORS fetch proxy: GET <proxy>?url=<http(s) URL> returns that URL's raw body as
// text (the n8n `feed` webhook — feed-friendly Accept, 5 redirects, 15s, CORS *). It is NOT a
// search engine, so SEARCH is done by fetching a feed-SEARCH URL (Google News RSS by default)
// and parsing the items — the same one fetch primitive carries both. The local talker never
// reaches the network; this mechanical layer fetches and the admission core binds.

import { admitWebSource } from './websource.js';
import { GUTENBERG_SOURCES, GUTENBERG_FULLTEXT } from './gutenberg.js';
import { WIKIMEDIA_SOURCES, WIKIMEDIA_FULLTEXT } from './wikimedia.js';

// The proxy the user pointed us at. Overridable per client; no auto-fire is wired here — a
// caller (a confirmed user action) constructs the client and admits the results into scope.
export const DEFAULT_FEED_PROXY = 'https://n8n.intelechia.com/webhook/feed';

// Search by FEED: a query → a feed-search URL the proxy can fetch. Google News RSS is the
// default (the proxy's Accept headers prefer feeds); swap `searchUrl` for another engine.
const NEWS_RSS = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}`;

const decodeEntities = (s) => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

const firstTag = (block, name) => {
  const m = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(block);
  return m ? decodeEntities(m[1]).trim() : '';
};

// Strip an HTML page to readable text: drop script/style, turn block ends into newlines, remove
// the rest of the tags, decode entities, collapse whitespace. Pragmatic, dependency-free — the
// readability the proxy does not do server-side (the proxy is feed-oriented, returns raw body).
// Selectors for page CHROME — removed before reading (the article is none of these). Borrowed
// from the EO_Reader DOM reader and extended for the modern web's furniture: cookie/consent
// banners, ad slots, social/share widgets, "related"/"recommended" rails, comment threads, and
// newsletter sign-ups. The article is none of these, and dropping them before reading keeps the
// surfer on the prose — it arrests on Bayesian surprise, and a rare widget line outshouts the body.
const CHROME_SELECTOR = [
  'script', 'style', 'noscript', 'template', 'nav', 'header', 'footer', 'aside', 'form',
  'button', 'svg', 'select', 'figure', 'iframe', 'dialog', 'video', 'audio', 'canvas',
  '[role=navigation]', '[role=banner]', '[role=contentinfo]', '[role=search]',
  '[role=complementary]', '[role=dialog]', '[aria-hidden=true]', '[hidden]',
  '#mw-navigation', '#mw-panel', '#mw-head', '#footer', '.mw-editsection', '.navbox',
  '.vector-header', '.vector-page-toolbar', '.toc', '#toc', '.sidebar', '.reflist',
  '[class*=cookie]', '[id*=cookie]', '[class*=consent]', '[id*=consent]',
  '[class*=newsletter]', '[class*=share]', '[class*=social]', '[class*=related]',
  '[class*=recommend]', '[class*=promo]', '[class*=advert]', '[class*=sidebar]',
  '[class*=comment]', '#comments', '[class*=breadcrumb]', '[class*=paywall]', '[class*=subscribe]',
].join(',');
// Where the article actually lives — content containers, scored by text length in pickMain.
const MAIN_SELECTOR = 'article, main, [role=main], #mw-content-text, .mw-parser-output, ' +
  '.post-content, .article-body, .entry-content, [itemprop=articleBody]';

// Tag-regex reader — the no-DOM fallback (Node, tests) AND the serializer the browser path hands
// its cleaned subtree to. Strip the chrome elements whole, turn BLOCK BOUNDARIES into newlines so
// the document's structure survives, then drop the remaining inline tags. Headings, list items,
// and table rows each land on their own line — the structure the parser's heading and sentence
// boundaries depend on (perceiver/parse/sentences.js welds a heading onto the next sentence, and
// mints a phantom relation across it, when the two share a line).
const STRIP_WHOLE = 'script|style|noscript|template|nav|header|footer|aside|form|button|svg|select|figure|iframe|dialog|video|audio|canvas';
const BLOCK_CLOSE = 'p|div|li|h[1-6]|tr|section|article|blockquote|ul|ol|dl|dd|dt|table|caption|figcaption|pre|main|details|summary|address';
const regexToText = (html) => decodeEntities(String(html || '')
  .replace(new RegExp(`<(${STRIP_WHOLE})\\b[\\s\\S]*?</\\1>`, 'gi'), ' ')
  .replace(new RegExp(`</(?:${BLOCK_CLOSE})\\s*>`, 'gi'), '\n')
  .replace(/<li\b[^>]*>/gi, '\n')          // a list item starts a new line even mid-flow
  .replace(/<h[1-6]\b[^>]*>/gi, '\n')      // a heading starts on its own line, never welded to it
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<[^>]+>/g, ' '))
  .replace(/[ \t]+/g, ' ')
  .replace(/ +([.,;:!?])/g, '$1')          // inline tags removed → no space before punctuation
  .replace(/\n{3,}/g, '\n\n')
  .replace(/[ \t]*\n[ \t]*/g, '\n')
  .trim();

// Pick the element that actually holds the article: among the content containers, the one with the
// most text wins. First-match-wins used to grab a tiny teaser <article> card and miss the body.
// Falls back to <body> when no candidate carries enough prose to look like an article.
const pickMain = (doc) => {
  const body = doc.body || doc.documentElement;
  const nonWs = (el) => ((el && el.textContent || '').match(/\S/g) || []).length;
  let best = null, bestLen = 0;
  for (const el of doc.querySelectorAll(MAIN_SELECTOR)) {
    const len = nonWs(el);
    if (len > bestLen) { best = el; bestLen = len; }
  }
  if (!best) return body;
  // Trust the container when it holds a real article's worth of text, or a meaningful share of the
  // page's. Only when the best match is a negligible sliver (a <main> wrapping just a search box,
  // say, with the real prose in undecorated divs) do we read the whole body instead.
  return (bestLen >= 200 || bestLen >= nonWs(body) * 0.25) ? best : body;
};

// DOM reader (browser only): parse the page, drop the chrome, pick the content container, then read
// it WITH ITS BLOCK STRUCTURE PRESERVED. The old reader took main.textContent, which emits no
// newlines at block boundaries — every paragraph, heading, and list item welded into one run, so
// the parser could not tell a section heading from the sentence beneath it and the surf rode a
// mega-unit. We instead hand the cleaned subtree's HTML to the same structure-aware serializer the
// Node path uses, so the browser (the real app) reads at least as well as the headless fallback.
const domToText = (html) => {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  doc.querySelectorAll(CHROME_SELECTOR).forEach((n) => n.remove());
  const main = pickMain(doc);
  return regexToText((main && main.innerHTML) || (main && main.textContent) || '');
};

// HTML → readable prose. Use the DOM reader in the browser (the real app), the regex reader
// in Node (tests, headless). A DOM failure falls back to regex rather than throwing.
export const htmlToText = (html) => {
  if (typeof DOMParser !== 'undefined') {
    try { const t = domToText(html); if (t) return t; } catch { /* fall back to regex */ }
  }
  return regexToText(html);
};

// Wikipedia, clean: fetch the plain-text article EXTRACT through the API rather than scraping the
// rendered page (whose nav/sidebar/footer chrome otherwise dominates — the EOT graph came back as
// "Main -> Random : page", menu items, not article facts). Returns prose, or '' on any failure.
export const wikiExtract = async (client, title) => {
  if (!title) return '';
  const url = 'https://en.wikipedia.org/w/api.php?format=json&action=query&prop=extracts' +
    '&explaintext=1&exsectionformat=plain&redirects=1&titles=' + encodeURIComponent(title);
  try {
    const j = JSON.parse((await client.fetchUrl(url)).text);
    const pages = j?.query?.pages || {};
    const first = Object.values(pages)[0];
    return String(first?.extract || '').trim();
  } catch { return ''; }
};

// parseFeed(xml) → items [{ title, link, summary, published }] for RSS (<item>) and Atom
// (<entry>). Pure and regex-based (no DOM in Node), defensive: a malformed block yields a
// best-effort item, never a throw.
export const parseFeed = (xml) => {
  const s = String(xml || '');
  const out = [];
  const isAtom = /<entry\b/i.test(s) && !/<item\b/i.test(s);
  const blocks = s.match(isAtom ? /<entry\b[\s\S]*?<\/entry>/gi : /<item\b[\s\S]*?<\/item>/gi) || [];
  for (const b of blocks) {
    const title = firstTag(b, 'title');
    let link = firstTag(b, 'link');
    if (!link || isAtom) {                       // Atom: <link href="…">
      const m = /<link\b[^>]*\bhref=["']([^"']+)["']/i.exec(b);
      if (m) link = decodeEntities(m[1]).trim();
    }
    const summary = htmlToText(firstTag(b, 'description') || firstTag(b, 'summary') || firstTag(b, 'content'));
    const published = firstTag(b, 'pubDate') || firstTag(b, 'updated') || firstTag(b, 'published') || '';
    if (title || link) out.push({ title, link, summary, published });
  }
  return out;
};

// ── The search KINDS — every source the html has, each through the same proxy ────────────────
// A kind is (ctx, query, k) → items[{ title, text, url, source }]. ctx gives `fetchUrl` (a page
// via the feed proxy's ?url=) and `fetchRaw` (a sibling webhook directly, for ECF), plus
// `proxyBase` and `searchUrl`. Each parses its own shape (Wikipedia/ECF are JSON; News/Feed RSS).
const wikiPageUrl = (title) => `https://en.wikipedia.org/wiki/${encodeURIComponent(String(title).replace(/ /g, '_'))}`;

export const SEARCH_SOURCES = {
  // WIKIPEDIA — the encyclopedic source (facts, entities). The reliable one for VERIFY.
  wikipedia: async (ctx, query, k) => {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=${k}`;
    const j = JSON.parse((await ctx.fetchUrl(url)).text);
    return (j?.query?.search || []).map((h) => ({
      title: h.title, text: htmlToText(h.snippet || '') || h.title, url: wikiPageUrl(h.title), source: 'wikipedia',
    }));
  },
  // NEWS — current events (Google News RSS).
  news: async (ctx, query, k) =>
    parseFeed((await ctx.fetchUrl(ctx.searchUrl(query))).text).slice(0, k)
      .map((it) => ({ title: it.title, text: it.summary || it.title, url: it.link, source: 'news' })),
  // FEED — fetch an arbitrary RSS/Atom feed or page the query names by URL (any website).
  feed: async (ctx, query, k) => {
    if (!/^https?:\/\//.test(query)) return [];
    return parseFeed((await ctx.fetchUrl(query)).text).slice(0, k)
      .map((it) => ({ title: it.title, text: it.summary || it.title, url: it.link, source: 'feed' }));
  },
  // THE LIBRARY — Project Gutenberg (whole books, gutenberg.js) and the Wikimedia reference
  // shelf + Wikidata (wikimedia.js), each a kind on the same (ctx, query, k) contract.
  ...GUTENBERG_SOURCES,
  ...WIKIMEDIA_SOURCES,
};

// FULL_TEXT: kind → async (client, item) → the WHOLE content behind a search hit, for the
// `fetchPages` step below. Wikipedia reads the clean API extract (never the chromed page); every
// Wikimedia sister project reads the same way on its own host; a Gutenberg hit reads the ENTIRE
// BOOK (boilerplate stripped); a Wikidata hit renders the entity's claims as legible lines. A
// kind with no hook falls back to fetching the page URL and reducing its HTML.
const FULL_TEXT = {
  wikipedia: (client, item) => wikiExtract(client, item?.title),
  ...GUTENBERG_FULLTEXT,
  ...WIKIMEDIA_FULLTEXT,
};

// A query that NAMES a library source is routed to it outright — "wikiquote churchill" means
// search Wikiquote, "gutenberg frankenstein" means the library. `commons` alone is ambiguous
// prose ("House of Commons"), so it requires the full "wikimedia commons".
const NAMED_KIND = [
  ['gutenberg', /\bgutenberg\b/], ['wikidata', /\bwikidata\b/], ['wiktionary', /\bwiktionary\b/],
  ['wikiquote', /\bwikiquote\b/], ['wikisource', /\bwikisource\b/], ['wikibooks', /\bwikibooks\b/],
  ['wikiversity', /\bwikiversity\b/], ['wikinews', /\bwikinews\b/], ['wikivoyage', /\bwikivoyage\b/],
  ['wikispecies', /\bwikispecies\b/], ['commons', /\bwikimedia commons\b/],
];

// routeKind(query) → which source, when the caller asks for 'auto'. A named library source wins
// outright; then current-events phrasing → news; a URL / "rss"/"feed" → feed; book-shaped
// phrasing → the Gutenberg library (whole books); definition phrasing → Wiktionary; quotation
// phrasing → Wikiquote; everything else → Wikipedia (facts/entities).
export const routeKind = (query) => {
  const q = String(query || '').toLowerCase();
  for (const [kind, re] of NAMED_KIND) if (re.test(q)) return kind;
  if (/\b(latest|news|today|recent|recently|breaking|this week|right now|currently)\b/.test(q)) return 'news';
  if (/^https?:\/\//.test(query) || /\b(rss|feed|atom)\b/.test(q)) return 'feed';
  if (/\b(novel|novella|full text|whole book|entire book|read the book)\b/.test(q)) return 'gutenberg';
  if (/\b(define|definition|meaning of|etymology)\b/.test(q)) return 'wiktionary';
  if (/\b(quote|quotes|quotation|quotations)\b/.test(q)) return 'wikiquote';
  return 'wikipedia';
};

// createWebClient({ proxy, fetchImpl, searchUrl }) → the fetch/search instrument. `fetchImpl` is
// injectable (the real fetch in app/Node; a fake in tests). `fetchUrl` fetches a page THROUGH the
// feed proxy (?url=); `fetchRaw` hits a URL directly (for sibling webhooks like /ecf); `search`
// dispatches to a KIND (or auto-routes).
export const createWebClient = ({
  proxy = DEFAULT_FEED_PROXY,
  fetchImpl = (typeof fetch !== 'undefined' ? fetch : null),
  searchUrl = NEWS_RSS,
} = {}) => {
  const proxyBase = proxy.replace(/\/feed\/?$/, '');     // .../webhook — the sibling-webhook root
  const proxied = (url) => `${proxy}?url=${encodeURIComponent(url)}`;
  const fetchRaw = async (url) => {
    if (!fetchImpl) throw new Error('webfetch: no fetch implementation available');
    const res = await fetchImpl(url);
    return { url, text: await res.text(), ok: res.ok !== false, status: res.status ?? 200 };
  };
  const fetchUrl = (url) => fetchRaw(proxied(url));       // a page, through the feed proxy
  const ctx = { proxyBase, proxied, fetchRaw, fetchUrl, searchUrl };
  const search = async (query, { kind = 'auto', k = 8 } = {}) => {
    const resolved = kind === 'auto' ? routeKind(query) : kind;
    const fn = SEARCH_SOURCES[resolved] || SEARCH_SOURCES.wikipedia;
    try { return (await fn(ctx, query, k)).map((it) => ({ ...it, kind: resolved })); }
    catch { return []; }
  };
  return { proxy, proxyBase, proxied, fetchRaw, fetchUrl, search };
};

const nowIso = () => { try { return new Date().toISOString(); } catch { return null; } };

// Persist the full fetched text as binary to the OPFS raw store (ingest/opfs-store.js), keyed by
// the admitted record's content hash — "save it all". Alongside the bytes, hand the store the
// page's identity (url/title/fetched_at) so its pointer manifest can reference the page on the web
// at export time without re-embedding the text. Best-effort and awaited only enough to keep the
// cache warm; a store fault never blocks admission. No-op when no rawStore is threaded.
const keepRaw = async (rawStore, admitted, text) => {
  const rec  = admitted?.record;
  const hash = rec?.content_hash;
  if (rawStore && hash) {
    try {
      await rawStore.put(hash, text, {
        url: rec.url, final_url: rec.final_url, title: rec.title, fetched_at: rec.fetched_at,
      });
    } catch { /* never block admission */ }
  }
  return admitted;
};

// Fetch one page through the proxy and ADMIT it as a web source (websource.js). The page's HTML
// is reduced to text before admission so the parse sees prose, not tags. The full reduced text is
// retained as binary in `rawStore` (OPFS) when one is threaded.
export const fetchAndAdmit = async (url, { client, store = null, rawStore = null, fetched_at = nowIso() } = {}) => {
  const c = client || createWebClient();
  const { text } = await c.fetchUrl(url);
  const reduced = htmlToText(text);
  const payload = { url, text: reduced, fetched_at, engine: 'feed-proxy' };
  const admitted = store ? store.admit(payload) : admitWebSource(payload);
  return keepRaw(rawStore, admitted, reduced);
};

// searchAndAdmit(query, { kind, fetchPages }) → search a source (or auto-route), then admit the
// top results. By default the result's snippet/summary is admitted as a light source; with
// `fetchPages` each result's full page is fetched THROUGH the proxy — the engine pulling the
// actual website ("find random websites as needed"). Returns [{ item, doc, record, … }].
export const searchAndAdmit = async (query, { client, store = null, rawStore = null, k = 5, kind = 'auto', fetchPages = false, fetched_at = nowIso() } = {}) => {
  const c = client || createWebClient();
  const items = await c.search(query, { kind, k });
  const out = [];
  for (const it of items) {
    let text = it.text || it.title || '';
    if (fetchPages && it.url) {
      try {
        // A kind with a FULL_TEXT hook reads its own way — the clean API extract for the
        // Wikimedia family, the ENTIRE BOOK for Gutenberg, the rendered claims for Wikidata.
        // Anything else → fetch the page and reduce its HTML, with the chrome stripped.
        const full = FULL_TEXT[it.source] || FULL_TEXT[it.kind];
        text = (full
          ? await full(c, it)
          : htmlToText((await c.fetchUrl(it.url)).text)) || text;
      } catch { /* keep the snippet */ }
    }
    const payload = { url: it.url || c.proxied(query), title: it.title, text,
                      excerpt: it.text, retrieval_query: query, engine: `web:${it.source || it.kind || kind}`, fetched_at };
    const admitted = store ? store.admit(payload) : admitWebSource(payload);
    await keepRaw(rawStore, admitted, text);   // retain the full page bytes (OPFS) when threaded
    out.push({ item: it, ...admitted });
  }
  return out;
};
