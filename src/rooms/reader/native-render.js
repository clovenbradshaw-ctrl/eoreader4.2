// EO: NUL(Field -> Void, Tending) — the Native tab's kind dispatch: one document, its own shape
// "The rendering surface should be intelligent about what kind of doc it is" — this is that
// dispatch, one storey above the format-specific renderers (markdown-render.js,
// data-render.js, code-highlight.js) and the existing sanitize-a-live-page / prose-reflow
// pair reader-render.js already carries. Given a recorded source (+ its structured doc, when
// one exists), it picks the ONE rendering that shows the document as the kind of thing it
// actually is, and always lands on the prose reflow when nothing more specific applies — so
// this can never show LESS than the Reader tab already would.
//
// A URL-bearing source's Native tab still renders from a FRESH fetch (loadPage ->
// nativePageHtml) — unchanged, this dispatch is for everything else: an uploaded file, a
// paste, a source recorded before this module existed.

import { renderKindOf } from './doc-kind.js';
import { readerModel, readerHtml, nativePageHtml } from './reader-render.js';
import { markdownToHtml, MARKDOWN_CSS } from './markdown-render.js';
import { jsonToHtml, tableToHtml, JSON_CSS, TABLE_CSS } from './data-render.js';
import { highlightCode, CODE_CSS } from './code-highlight.js';

const PAGE_CSS = 'html,body{margin:0;background:#fff}';
const page = (bodyHtml, css) => '<!doctype html><html><head><meta charset="utf-8">' +
  '<style>' + PAGE_CSS + css + '</style></head><body>' + bodyHtml + '</body></html>';

const textFallback = (source, prefs) => {
  const model = readerModel(source);
  const { html, toc } = readerHtml(model, prefs);
  return { kind: 'text', html, toc };
};

// renderNativeKindHtml({ source, doc, prefs }) → { kind, html, toc }. `doc` is the source's
// structured reading (app.docFor(sn)) — only json/table read it, for the real tree/rows an
// organ already built; every other kind reads only `source.text`. Never throws: a kind whose
// data isn't there yet (a table doc still parsing) falls back to the prose reflow rather
// than showing a blank or broken page.
export const renderNativeKindHtml = ({ source = {}, doc = null, prefs = {} } = {}) => {
  const kind = renderKindOf(source);

  if (kind === 'json') {
    if (doc && doc.modality === 'json' && 'data' in doc) {
      const { html } = jsonToHtml(doc.data);
      return { kind, html: page('<div class="eo-json-wrap" style="padding:24px">' + html + '</div>', JSON_CSS), toc: [] };
    }
    return textFallback(source, prefs);
  }

  if (kind === 'table') {
    if (doc && doc.modality === 'table' && Array.isArray(doc.records)) {
      const { html } = tableToHtml(doc);
      return { kind, html: page('<div style="padding:24px;overflow:auto">' + html + '</div>', TABLE_CSS), toc: [] };
    }
    return textFallback(source, prefs);
  }

  if (kind === 'code') {
    const { html } = highlightCode(source.text || '', source.language || '');
    return { kind, html: page(html, CODE_CSS), toc: [] };
  }

  if (kind === 'markdown') {
    const { html, toc } = markdownToHtml(source.text || '');
    return { kind, html: page('<div class="eo-md">' + html + '</div>', MARKDOWN_CSS), toc };
  }

  if (kind === 'html') {
    // A sniffed HTML text with no live URL to fetch fresh — the same sanitize/re-base pass a
    // fetched page gets, just with no base href to re-root relative assets against.
    return { kind, html: nativePageHtml(source.text || '', { baseUrl: '', prefs }), toc: [] };
  }

  return textFallback(source, prefs);
};
