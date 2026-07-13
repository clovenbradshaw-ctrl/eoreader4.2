// EO: SIG·SEG·INS(Void → Field,Entity, Binding,Clearing,Making) — RSS/Atom feeds, read whole
// Syndication feeds as first-class sources — a feed is a LIST of dated items, not one blob.
// (docs/web-search.md "The search kinds"; docs/civic-apis.md "Feeds")
//
// webfetch.js already had a thin `feed` kind that fetched a URL and returned its items as light
// snippet sources. This organ is the deliberate, whole-feed twin of gutenberg.js/arxiv.js: it
// reads a feed ENTIRE — every item with its title, link, publication date, author, categories and
// summary — and offers three shapes of the same content:
//
//   • as SOURCES — each item admitted as its own web-source/1 record, so a claim can cite the
//     exact entry ("posted 2026-07-01, item 3") and, under fetchPages, the item's linked ARTICLE
//     is pulled in full (FEED_FULLTEXT), not just the RSS summary;
//   • as a TABLE — the items as rows (title · link · published · author · summary), so the data
//     room can sort/filter/count them the way it does a CSV (organs/in/table.js);
//   • as one DOC — the whole feed rendered as dated prose for a straight read.
//
// Dependency-free but for the deliberate admit (websource.admitWebSource) — the feed/HTML parsing
// is offline-testable, and the module never imports webfetch (whose SEARCH_SOURCES spread would
// make the import cycle unsafe — the same rule arxiv.js/openalex.js follow). webfetch imports THIS.

import { admitWebSource } from './websource.js';

// ── entity / CDATA decoding (offline, dependency-free) ───────────────────────
const decodeEntities = (s) => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

// Reduce a fragment of feed HTML to readable text: drop tags, unwrap block ends to spaces,
// decode entities, collapse whitespace. A LOCAL reducer (like arxiv.js#reduceHtml) so this
// module never reaches into webfetch for htmlToText and stays cycle-free.
export const feedHtmlToText = (html) => decodeEntities(String(html || '')
  .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<\/(p|div|li|h[1-6]|tr|section|blockquote|br)\s*>/gi, '\n')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<[^>]+>/g, ' '))
  .replace(/[ \t]+/g, ' ')
  .replace(/ +([.,;:!?])/g, '$1')
  .replace(/\n{3,}/g, '\n\n')
  .replace(/[ \t]*\n[ \t]*/g, '\n')
  .trim();

const firstTag = (block, name) => {
  const m = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(block);
  return m ? decodeEntities(m[1]).trim() : '';
};
const allTags = (block, name) => {
  const out = []; const re = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'gi'); let m;
  while ((m = re.exec(block))) out.push(decodeEntities(m[1]).trim());
  return out;
};
const attr = (tag, block, name) => {
  const m = new RegExp(`<${tag}\\b[^>]*\\b${name}=["']([^"']+)["']`, 'i').exec(block);
  return m ? decodeEntities(m[1]).trim() : '';
};

// isFeed(text) → does this body look like RSS/Atom (vs. a JSON API payload or a plain page)?
// A cheap sniff so a caller can route an ambiguous URL — the same URL might be a feed or an API.
export const isFeed = (text) => {
  const s = String(text || '').slice(0, 4000);
  return /<rss\b|<feed\b[^>]*xmlns|<rdf:RDF\b|<channel\b|<(?:item|entry)\b/i.test(s)
      && !/^\s*[[{]/.test(s);      // a JSON body is not a feed even if it mentions "item"
};

// feedMeta(xml) → the CHANNEL's own identity: { title, description, link, updated }. Reads the
// feed header, not its items — so a source/table can be named for the feed it came from.
export const feedMeta = (xml) => {
  const s = String(xml || '');
  // The channel header is everything before the first item/entry.
  const head = s.split(/<(?:item|entry)\b/i)[0] || s;
  const link = attr('link', head, 'href') || firstTag(head, 'link');
  return {
    title: firstTag(head, 'title') || '',
    description: feedHtmlToText(firstTag(head, 'description') || firstTag(head, 'subtitle') || ''),
    link: link || '',
    updated: firstTag(head, 'lastBuildDate') || firstTag(head, 'updated') || firstTag(head, 'pubDate') || '',
  };
};

// parseFeedItems(xml, k?) → the items in FULL: RSS <item> and Atom <entry>, each with its date,
// author, categories, id and enclosure. Richer than webfetch.parseFeed (which returns only
// title/link/summary/published) because this organ reads the whole entry. Pure, defensive: a
// malformed block yields a best-effort item, never a throw.
export const parseFeedItems = (xml, k = Infinity) => {
  const s = String(xml || '');
  const isAtom = /<entry\b/i.test(s) && !/<item\b/i.test(s);
  const blocks = s.match(isAtom ? /<entry\b[\s\S]*?<\/entry>/gi : /<item\b[\s\S]*?<\/item>/gi) || [];
  const out = [];
  for (const b of blocks) {
    if (out.length >= k) break;
    const title = firstTag(b, 'title');
    let link = firstTag(b, 'link');
    if (!link || isAtom) {                                 // Atom: <link href="…">
      link = attr('link', b, 'href') || link;
    }
    const rawSummary = firstTag(b, 'description') || firstTag(b, 'summary') || firstTag(b, 'content') || '';
    const summary = feedHtmlToText(rawSummary);
    const published = firstTag(b, 'pubDate') || firstTag(b, 'published') || firstTag(b, 'updated') || firstTag(b, 'dc:date') || '';
    const author = firstTag(b, 'author').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      || firstTag(b, 'dc:creator') || attr('author', b, 'name') || '';
    const categories = allTags(b, 'category').map((c) => c.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
    // <enclosure url="…"> (podcasts, attachments) and Atom <link rel="enclosure">.
    const enclosure = attr('enclosure', b, 'url') || '';
    const id = firstTag(b, 'guid') || firstTag(b, 'id') || link || '';
    if (title || link || summary) out.push({ title, link, summary, published, author, categories, enclosure, id });
  }
  return out;
};

// A row/cell-safe scalar — a category array joins, everything else stringifies.
const cell = (v) => Array.isArray(v) ? v.join('; ') : (v == null ? '' : String(v));

// feedToTable(items, { name }) → { name, columns, rows } for organs/in/table.js — the feed as a
// grid the data room can sort/filter/count (organs/in/table.js#ingestTable, rooms/data). One row
// per item; columns are the stable feed fields, so two feeds tabulate the same way.
export const feedToTable = (items, { name = 'feed' } = {}) => ({
  name,
  columns: ['title', 'published', 'author', 'link', 'summary'],
  rows: (items || []).map((it) => ({
    title: cell(it.title), published: cell(it.published), author: cell(it.author),
    link: cell(it.link), summary: cell(it.summary),
  })),
});

// feedToProse(meta, items) → the whole feed as one dated document: the channel header, then each
// item as a titled, dated block. The straight-read shape (a doc that drops into the answer scope).
export const feedToProse = (meta, items) => {
  const head = [meta?.title, meta?.description].filter(Boolean).join('\n');
  const body = (items || []).map((it, i) => {
    const when = it.published ? ` (${it.published})` : '';
    const by = it.author ? ` — ${it.author}` : '';
    const cats = it.categories?.length ? `\n[${it.categories.join(', ')}]` : '';
    return `${i + 1}. ${it.title || '(untitled)'}${when}${by}\n${it.link || ''}${cats}\n${it.summary || ''}`.trim();
  }).join('\n\n');
  return [head, body].filter(Boolean).join('\n\n').trim();
};

// The search KIND (webfetch.js SEARCH_SOURCES shape): (ctx, query, k) → items. The query is a
// feed URL; each item becomes a search hit. Snippet-level (the RSS summary) until fetchPages asks
// for the linked articles (FEED_FULLTEXT). Returns [] for a non-URL query so routeKind can fall
// through, and [] (never a throw) when the body is not a feed.
export const FEED_SOURCES = {
  feed: async (ctx, query, k) => {
    if (!/^https?:\/\//i.test(String(query || '').trim())) return [];
    const { text } = await ctx.fetchUrl(query.trim());
    if (!isFeed(text)) return [];
    return parseFeedItems(text, k).map((it) => ({
      title: it.title || it.link || '(untitled)',
      text: it.summary || it.title || '',
      url: it.link || query,
      source: 'feed',
      published: it.published || null,
      // carry the item so FEED_FULLTEXT can fetch its article without re-parsing the feed
      _feedItem: it,
    }));
  },
};

// The FULL-TEXT hook (webfetch.js FULL_TEXT shape): under fetchPages, a feed item's page fetch is
// its LINKED ARTICLE — fetch the item's link and reduce its HTML, with the RSS summary as the
// floor so a fetch miss is a smaller read, never an empty one. A summary-only feed (no distinct
// article URL) keeps its summary.
export const FEED_FULLTEXT = {
  feed: async (client, item) => {
    const url = item?._feedItem?.link || item?.url;
    const floor = item?._feedItem?.summary || item?.text || '';
    if (!url || !/^https?:\/\//i.test(url)) return floor;
    try {
      const text = feedHtmlToText((await client.fetchUrl(url)).text);
      return (text && text.length > (floor.length || 0)) ? text : floor;
    } catch { return floor; }
  },
};

const nowIso = () => { try { return new Date().toISOString(); } catch { return null; } };

// fetchFeed(url, opts) → { meta, items, table, admitted } | null — the DELIBERATE whole-feed path
// (mirrors gutenberg.js#fetchGutenbergBook / arxiv.js#fetchArxivPaper). Name a feed by URL and get
// the channel identity, every item, a data-room table, and — unless { admit:false } — the whole
// feed admitted as ONE dated prose source so it drops straight into the answer scope.
export const fetchFeed = async (url, { client, store = null, k = Infinity, admit = true, fetched_at = nowIso(), hangGuard = 2_000_000 } = {}) => {
  if (!client || !/^https?:\/\//i.test(String(url || '').trim())) return null;
  const { text } = await client.fetchUrl(String(url).trim());
  if (!isFeed(text)) return null;
  const meta  = feedMeta(text);
  const items = parseFeedItems(text, k);
  const table = feedToTable(items, { name: meta.title || 'feed' });
  let admitted = null;
  if (admit) {
    const payload = {
      url, title: meta.title || url, text: feedToProse(meta, items),
      excerpt: meta.description || (items[0]?.summary || ''),
      retrieval_query: String(url), engine: 'web:feed', fetched_at,
    };
    admitted = store ? store.admit(payload, { hangGuard }) : admitWebSource(payload, { hangGuard });
  }
  return { meta, items, table, admitted };
};
