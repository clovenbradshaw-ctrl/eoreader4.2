// EO: NUL·SEG(Field -> Void, Clearing,Dissecting) — XML/TEI -> HTML, the document's own shape
// An XML/TEI source carries structure a plain prose reflow can't show: a critical edition's
// division numbering (Book/Definition/Proposition, or whatever a document's own <div>/@n
// happens to be), verse lines, list-like rights statements, and — the thing worth a dedicated
// view — bibliographic front matter (title/author, who edited and funded it, the print source
// it transcribes, its revision history) that belongs in its OWN card, not run into the body's
// first paragraph. This gives the Native tab that shape: a metadata card off `doc.tei` (when the
// source parsed as TEI) followed by the body's own blocks — headings, division labels,
// paragraphs, verse lines, list items, notes — every span of text escaped once, same discipline
// as markdown-render.js: nothing a document carries is ever interpreted as markup here.
//
// Pure: xmlToHtml(source, doc) -> { html, toc }, no DOM, no network.

import { parseXmlDocument } from '../../organs/ingest/index.js';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const BLOCK_TAG = { heading: 'h2', label: 'div', paragraph: 'p', line: 'div', item: 'li', note: 'aside', quote: 'blockquote' };
const BLOCK_CLASS = { label: 'eo-xml-label', line: 'eo-xml-line', note: 'eo-xml-note' };

// renderBody(spans) → { html, toc }. `spans` is doc.spans with the synthetic title/frontmatter
// blocks already filtered out — every remaining block becomes its own tagged, escaped element;
// consecutive 'item' blocks are grouped into one <ul> (list items never arrive pre-wrapped, since
// the block walk that produced them (organs/ingest/xml-text.js) has no concept of a list
// container, only of items).
const renderBody = (spans) => {
  const toc = [];
  const out = [];
  let i = 0;
  while (i < spans.length) {
    const s = spans[i];
    if (s.kind === 'item') {
      const items = [];
      while (i < spans.length && spans[i].kind === 'item') { items.push(spans[i].text); i++; }
      out.push('<ul>' + items.map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul>');
      continue;
    }
    const tag = BLOCK_TAG[s.kind] || 'p';
    const cls = BLOCK_CLASS[s.kind] ? ' class="' + BLOCK_CLASS[s.kind] + '"' : '';
    if (s.kind === 'heading') {
      const id = 'eo-xml-' + toc.length;
      toc.push({ id, label: s.text, level: s.level || 1 });
      out.push('<h2 id="' + id + '">' + esc(s.text) + '</h2>');
    } else {
      out.push('<' + tag + cls + '>' + esc(s.text) + '</' + tag + '>');
    }
    i++;
  }
  return { html: out.join('\n'), toc };
};

// teiCard(tei) → the front-matter metadata card's HTML, or '' when the source didn't parse as
// TEI (a generic XML document — the Native tab then shows only the body). Every field is
// optional; absent ones are simply skipped, never shown blank.
const teiCard = (tei) => {
  if (!tei) return '';
  const rows = [];
  const row = (label, value) => { if (value) rows.push('<div class="eo-xml-meta-row"><span class="eo-xml-meta-k">' + esc(label) + '</span><span class="eo-xml-meta-v">' + esc(value) + '</span></div>'); };
  row('Author', tei.authors.join(', '));
  row('Editor', tei.editors.join(', '));
  for (const r of tei.respStmts) row(r.resp || 'Prepared by', r.names.join(', '));
  row('Sponsor', tei.sponsor);
  row('Principal investigator', tei.principal);
  row('Funder', tei.funder.join(', '));
  row('Publisher', [tei.publisher, tei.pubPlace].filter(Boolean).join(', '));
  row('Authority', tei.authority);
  row('Source', tei.sourceDesc);
  if (!rows.length && !tei.availability.length && !tei.revisions.length) return '';
  const avail = tei.availability.length
    ? '<div class="eo-xml-meta-avail">' + tei.availability.map((p) => '<p>' + esc(p) + '</p>').join('') + '</div>'
    : '';
  const revisions = tei.revisions.length
    ? '<details class="eo-xml-meta-rev"><summary>Revision history (' + tei.revisions.length + ')</summary>' +
      tei.revisions.map((r) => '<p>' + esc(r) + '</p>').join('') + '</details>'
    : '';
  return '<div class="eo-xml-meta">' + rows.join('') + avail + revisions + '</div>';
};

// xmlToHtml(source, doc) → { html, toc }. `doc` is organs/in/xml.js's ingestXml() doc when one
// is available (an ingested .xml file); its `doc.tei` builds the metadata card and `doc.spans`
// (title/frontmatter blocks filtered out) the body. Without a doc — a sniffed-but-not-yet-parsed
// XML source, or a legacy source recorded before this module existed — the source's own text is
// parsed fresh so the Native tab still shows something better than raw tag soup.
export const xmlToHtml = (source = {}, doc = null) => {
  const parsed = doc && doc.modality === 'xml' ? doc : null;
  let tei = parsed ? parsed.tei : null;
  let spans = parsed ? parsed.spans.filter((s) => s.kind !== 'title' && s.kind !== 'frontmatter') : null;

  if (!parsed) {
    // No structured doc yet — parse the raw text on the spot (pure, cheap) rather than fall
    // back to a plain reflow; a pasted/legacy XML source still gets the real body structure.
    const p = parseXmlDocument(source.text || '');
    tei = p.meta;
    spans = p.blocks;
  }

  const title = (tei && tei.title) || source.title || '';
  const titleHtml = title ? '<h1 class="eo-xml-title">' + esc(title) + '</h1>' : '';
  const card = teiCard(tei);
  const { html: bodyHtml, toc } = renderBody(spans || []);
  return { html: '<div class="eo-xml">' + titleHtml + card + bodyHtml + '</div>', toc };
};

export const XML_CSS = `
.eo-xml{max-width:820px;margin:0 auto;padding:40px 28px 120px;font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1b1b22}
.eo-xml-title{font-family:Georgia,serif;font-weight:700;font-size:1.9em;line-height:1.2;margin:0 0 .3em;color:#15151a}
.eo-xml-meta{background:#f7f7fa;border:1px solid #ececf0;border-radius:10px;padding:14px 18px;margin:0 0 1.6em;font-size:.92em}
.eo-xml-meta-row{display:flex;gap:8px;padding:2px 0}
.eo-xml-meta-k{flex:0 0 180px;color:#6a6a75;font-weight:600}
.eo-xml-meta-v{flex:1;color:#1b1b22}
.eo-xml-meta-avail{margin-top:8px;padding-top:8px;border-top:1px solid #ececf0;color:#4a4a53}
.eo-xml-meta-avail p{margin:.3em 0}
.eo-xml-meta-rev{margin-top:8px;padding-top:8px;border-top:1px solid #ececf0;color:#6a6a75}
.eo-xml-meta-rev summary{cursor:pointer;font-weight:600}
.eo-xml-meta-rev p{margin:.4em 0;font:12.5px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap}
.eo-xml h2{font-family:Georgia,serif;font-weight:700;line-height:1.25;margin:1.4em 0 .5em;color:#15151a;font-size:1.4em}
.eo-xml p{margin:0 0 1em}
.eo-xml .eo-xml-label{margin:1.6em 0 .2em;font:700 .74em/1.4 -apple-system,BlinkMacSystemFont,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#8b6a2e}
.eo-xml .eo-xml-line{margin:0 0 .15em}
.eo-xml .eo-xml-note{margin:0 0 1em;padding:8px 14px;border-left:3px solid #DED8FD;background:#f7f6fd;color:#5a5a63;font-size:.92em}
.eo-xml blockquote{border-left:3px solid #DED8FD;margin-left:0;padding:2px 0 2px 16px;color:#5a5a63}
.eo-xml ul{padding-left:1.6em}
.eo-xml li{margin:.2em 0}
`;
