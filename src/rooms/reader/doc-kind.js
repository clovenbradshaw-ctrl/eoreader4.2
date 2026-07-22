// EO: NUL(Field → Void, Tending) — which render kind a source's own content actually is
// The dispatcher's first question, answered once and reused everywhere: given a recorded
// source, what native shape should its rendered ("Native") tab take? `source.kind` already
// carries the answer for anything the ingest router (import-file.js) tagged precisely
// (json/table/markdown/code); this only SNIFFS the text when there is no such tag and no
// live URL to fetch fresh (a pasted block, or a source recorded before this module existed).
// Pure — no DOM, no app, no network. Never mutates or re-classifies what ingest already knows.

// The five shapes native-render.js knows how to lay out, plus 'text' — the always-safe
// fallback (the same prose reflow the Reader tab already gives every source).
export const RENDER_KINDS = Object.freeze(['html', 'markdown', 'json', 'table', 'code', 'text']);

// A hint of real markup near the top of the text — same signal reader-render's own
// looksHtml uses for a freshly fetched page, reused here for a pasted/typed one.
export const looksLikeHtml = (text) =>
  /<(?:!doctype|html|head|body|div|p|table|article|section|main|h[1-6])\b/i.test(String(text || '').slice(0, 3000));

// Markdown has no single tell the way HTML's angle brackets are one — a lone asterisk or
// dash is common in ordinary prose. So this counts DISTINCT kinds of markdown syntax and
// only calls it markdown once two or more show up: an ATX heading, a fenced code block, a
// list marker, a link, a blockquote, or a bold run. One stray sign reads as coincidence;
// two together are a document that was actually written in markdown.
const MD_SIGNS = [
  /^ {0,3}#{1,6}\s+\S/m,        // ATX heading
  /^ {0,3}```/m,                // fenced code block
  /^ {0,3}[-*+]\s+\S/m,         // unordered list item
  /^ {0,3}\d+[.)]\s+\S/m,       // ordered list item
  /\[[^\]\n]+\]\([^)\n]+\)/,    // an inline link
  /^ {0,3}>\s?\S/m,             // blockquote
  /(?:^|[^*])\*\*[^*\n]+\*\*/,  // bold
];
export const looksLikeMarkdown = (text) => {
  const s = String(text || '').slice(0, 5000);
  let hits = 0;
  for (const re of MD_SIGNS) { if (re.test(s)) hits++; if (hits >= 2) return true; }
  return false;
};

// renderKindOf(source) → one of RENDER_KINDS. `source` needs only `.kind`, `.text`, `.url`.
// A URL-bearing source renders its Native tab from a FRESH fetch (loadPage → nativePageHtml),
// never from this sniff — so the sniff only ever runs for a source with no url to refetch.
export const renderKindOf = (source = {}) => {
  const kind = String(source.kind || '').toLowerCase();
  if (kind === 'json') return 'json';
  if (kind === 'table' || kind === 'dataset') return 'table';
  if (kind === 'markdown') return 'markdown';
  if (kind === 'code') return 'code';
  if (!source.url) {
    const text = source.text || '';
    if (looksLikeHtml(text)) return 'html';
    if (looksLikeMarkdown(text)) return 'markdown';
  }
  return 'text';
};

// Whether the Native tab has anything DIFFERENT to offer over the Reader tab's prose reflow.
// 'text' means it doesn't — Native would just duplicate Reader, so the tab stays hidden for it
// (the source viewer already offers a URL-bearing source's live render regardless of this).
export const isNativelyRenderable = (source = {}) => renderKindOf(source) !== 'text';
