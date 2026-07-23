// EO: SIG(Field → Field) — HTML → readable prose, the shared reduction
// Split out of webfetch.js so it has NO dependency on the fetch/search machinery (or on any
// module that itself pulls in gutenberg.js) — epub.js needs exactly this "strip the tags, keep
// the block structure" reduction to turn an EPUB chapter's XHTML into prose, and importing it
// from webfetch.js would create webfetch.js → gutenberg.js → epub.js → webfetch.js, a cycle.
// This module is the leaf; webfetch.js re-exports htmlToText from here unchanged, so every
// existing caller (the barrel, the tests) is unaffected.

export const decodeEntities = (s) => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

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
export const regexToText = (html) => decodeEntities(String(html || '')
  .replace(new RegExp(`<(${STRIP_WHOLE})\\b[\\s\\S]*?</\\1>`, 'gi'), ' ')
  .replace(new RegExp(`</(?:${BLOCK_CLOSE})\\s*>`, 'gi'), '\n')
  .replace(/<li\b[^>]*>/gi, '\n')          // a list item starts a new line even mid-flow
  // A heading starts on its own line, never welded to it — AND carries its level as a markdown
  // marker ("## Biography") rather than flattening to a bare line indistinguishable from a
  // paragraph. detectStructure's strongest signal is exactly this markdown form; without it, an
  // arbitrary (non-canonical, non-numbered) HTML heading has only the weak typographic/spacing
  // fallback to be recognized by.
  .replace(/<h([1-6])\b[^>]*>/gi, (_, n) => '\n' + '#'.repeat(+n) + ' ')
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
