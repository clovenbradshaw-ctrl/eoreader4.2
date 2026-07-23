// EO: SEG(Field → Field) — XML/TEI → readable prose blocks + header metadata
// Split out alongside html-text.js: the same "strip the tags, keep the block structure"
// reduction, but for XML read AS XML rather than sniffed as HTML. That distinction matters —
// a TEI document (the Perseus/CTS critical-edition corpus, and scholarly/legal/legislative XML
// generally) nests its OWN vocabulary (<div1>/<div2>/<p>/<head>/<l>/<lb/>) inside a <teiHeader>
// of bibliographic front matter, and several of its tag names (div, p, body, head) collide with
// real HTML tags. Handed to an HTML parser (or dumped into a browser with no stylesheet), the
// unknown TEI elements read as anonymous INLINE spans while the colliding names get HTML's
// block treatment — the two together run every field of the header into one paragraph and
// occasionally swallow content outright (a stray <title> mid-document gets treated as the
// page's own <title>, invisible). This module parses the tag structure ON ITS OWN TERMS instead.
//
// Dependency-free by design (no DOMParser) — the same reason html-text.js keeps a regex reader
// for Node/tests: a real XML tree walk needs nesting depth, but computing "does this tag's
// close force a paragraph break" and "how deep is this div nested" only needs a token scan with
// a name stack, never a full DOM. `parseXmlDocument` is the one entrance; everything else is a
// pure helper it composes, exported for its own tests.
//
// Deliberately not a general-purpose XML processor: no external-DTD/entity resolution (a
// document whose header abbreviates its own boilerplate behind a custom entity declared in an
// external .dtd — the older Perseus P4 texts do this — is read with that entity reference left
// inert rather than fetched over the network; resolving it would mean this reader performing
// arbitrary external-URL fetches while parsing untrusted markup, the classic XXE shape). Standard
// entities, numeric character references, and CDATA are decoded; everything else degrades
// honestly (kept, not silently dropped — `unresolvedXmlEntities` names what could not resolve).

import { decodeEntities } from './html-text.js';

const collapse = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

// ---- prolog / doctype -------------------------------------------------------------------
// A DOCTYPE's internal subset ("[ ... ]") carries its own <!ENTITY ...> declarations, each
// with its own '>' — a naive `<!DOCTYPE[^>]*>` stops at the FIRST one and leaves the rest of
// the subset (and a stray "]>") to be misread as document content. Match the optional bracketed
// subset as its own lazy group instead, so the whole declaration comes out in one piece.
const XMLDECL_RE = /^\s*<\?xml[^?]*\?>/i;
const DOCTYPE_RE = /<!DOCTYPE\b[^>[]*(\[[\s\S]*?\])?\s*>/i;
const COMMENT_RE = /<!--[\s\S]*?-->/g;

// stripProlog(xml) → the document with its XML declaration and DOCTYPE (internal subset and
// all) removed — pure grammar, never document content.
export const stripProlog = (xml) => String(xml || '').replace(XMLDECL_RE, '').replace(DOCTYPE_RE, '').trim();

// ---- attributes --------------------------------------------------------------------------
const ATTR_RE = /([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
export const parseAttrs = (attrString) => {
  const out = {};
  const re = new RegExp(ATTR_RE);
  let m;
  while ((m = re.exec(String(attrString || '')))) {
    const key = m[1].toLowerCase().replace(/^[^:]+:/, '');
    out[key] = decodeEntities(m[2] != null ? m[2] : m[3]);
  }
  return out;
};

// rootTagOf(xml) → { name, attrs } for the document's outermost element, or null. Read after
// stripProlog, so this is the real root, not a PI/comment/doctype mistaken for one.
export const rootTagOf = (xml) => {
  const m = /^\s*<([A-Za-z_][\w.:-]*)\b([^>]*)>/.exec(String(xml || ''));
  return m ? { name: m[1], attrs: parseAttrs(m[2]) } : null;
};

const TEI_ROOT_RE = /^tei(\.\d+)?$/i;
// isTeiRoot({name,attrs}) → true for TEI.2 (P3/P4, the Perseus/CTS "opensource" corpus's own
// format) and <TEI> (P5, xmlns tei-c.org) alike — the two shapes the format has worn.
export const isTeiRoot = (root) => {
  if (!root) return false;
  if (TEI_ROOT_RE.test(String(root.name || '').replace(/^[^:]+:/, ''))) return true;
  return Object.entries(root.attrs || {}).some(([k, v]) => /^xmlns(:|$)/.test(k) && /tei-c\.org/i.test(v));
};

// splitTeiHeader(xml) → { headerXml, bodyXml } — teiHeader never nests itself, so a single
// first-match extraction is exact, not a heuristic. Absent, the whole document reads as body.
export const splitTeiHeader = (xml) => {
  const s = String(xml || '');
  const m = /<teiHeader\b[^>]*>([\s\S]*?)<\/teiHeader>/i.exec(s);
  if (!m) return { headerXml: null, bodyXml: s };
  return { headerXml: m[1], bodyXml: s.slice(0, m.index) + s.slice(m.index + m[0].length) };
};

// ---- flat text (header leaf fields) -------------------------------------------------------
// stripTags(s) → decoded, tag-stripped, whitespace-collapsed plain text — for the SHORT
// bibliographic leaf fields (a title, a funder, a source citation), never the body (which needs
// block boundaries, not one flattened line — that is xmlBodyToBlocks below).
export const stripTags = (s) => {
  let t = String(s || '');
  t = t.replace(COMMENT_RE, ' ');
  t = t.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  t = t.replace(/<[^>]*>/g, ' ');
  return collapse(decodeEntities(t));
};

const firstElementText = (xml, tag) => {
  const m = new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>', 'i').exec(xml);
  return m ? stripTags(m[1]) : '';
};
const allElementTexts = (xml, tag) => {
  const out = [];
  const re = new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>', 'gi');
  let m;
  while ((m = re.exec(xml))) { const t = stripTags(m[1]); if (t) out.push(t); }
  return out;
};

// unresolvedXmlEntities(xml) → the general-entity names referenced but never declared/resolved
// in this reading (an older TEI file's custom header shorthand, declared only in an external
// DTD this parser will not fetch) — named honestly rather than silently swallowed or crashed on.
const STANDARD_ENTITY = new Set(['amp', 'lt', 'gt', 'quot', 'apos']);
export const unresolvedXmlEntities = (xml) => {
  const found = [];
  const seen = new Set();
  const re = /&([A-Za-z_][\w.:-]*);/g;
  let m;
  while ((m = re.exec(String(xml || '')))) {
    if (STANDARD_ENTITY.has(m[1]) || seen.has(m[1])) continue;
    seen.add(m[1]); found.push(m[1]);
  }
  return found;
};

// ---- body → blocks -------------------------------------------------------------------------
// The single-pass tag scan: comments/PIs skipped, CDATA read literally, everything else is
// either a BREAK (a self-closing print-line/page milestone — never glued, always a space), a
// HEAD (a real <head>/<title> — the strongest heading signal), a DIVISION (a <div>/<div1..7>,
// tracked only for nesting depth and its own @n/@type/@subtype — the reference label a critical
// edition hangs on a division INSTEAD of spelling a <head> out; Perseus's Euclid carries no
// <head> anywhere in its 15,000 lines and reads by @n alone: "1" / "Def" / "1", "2", "3" …), a
// BLOCK (p/l/item/note/…, each its own addressable unit), or unrecognised — left transparent,
// its own text still flows into whatever block is open, its tag simply never rendered.
const TOKEN_RE = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<(\/)?([A-Za-z_][\w.:-]*)((?:\s+(?:"[^"]*"|'[^']*'|[^"'<>])*)?)\s*(\/)?>|([^<]+)|(<)/g;

const BREAK_TAGS = new Set(['lb', 'pb', 'cb', 'milestone']);
const HEAD_TAGS = new Set(['head', 'title']);
// Pure structural wrappers — depth (and, for a division, a label) only; no text of their own.
const DIV_TAGS = new Set(['div', 'div0', 'div1', 'div2', 'div3', 'div4', 'div5', 'div6', 'div7',
  'body', 'text', 'front', 'back', 'group', 'list', 'table', 'castlist', 'lg', 'sp']);
const BLOCK_KIND = {
  p: 'paragraph', l: 'line', item: 'item', ab: 'paragraph', row: 'paragraph', entry: 'paragraph',
  record: 'paragraph', desc: 'paragraph', summary: 'paragraph', bibl: 'paragraph',
  note: 'note', stage: 'note', speaker: 'note', quote: 'quote', epigraph: 'quote',
  closer: 'paragraph', salute: 'paragraph', dateline: 'paragraph', byline: 'paragraph',
  argument: 'paragraph', trailer: 'paragraph', opener: 'paragraph', castitem: 'paragraph',
};

export const xmlBodyToBlocks = (bodyXml) => {
  const src = String(bodyXml || '');
  const blocks = [];
  let buf = '';
  let curKind = null;
  let divDepth = 0;

  const flush = () => {
    const text = collapse(buf);
    buf = '';
    if (!text) { curKind = null; return; }
    const kind = curKind || 'paragraph';
    const level = (kind === 'heading' || kind === 'label') ? Math.max(1, Math.min(6, divDepth || 1)) : null;
    const last = blocks[blocks.length - 1];
    // Adjacent division labels (Book "1" then its "Def" group, opened back-to-back with no
    // content between) read as one breadcrumb — "1 · Def" — rather than two bare, context-free
    // lines; a real block landing between them (a paragraph, a heading) breaks the run, so a
    // later sibling's label ("2") never inherits an earlier one's prefix.
    if (kind === 'label' && last && last.kind === 'label') { last.text = last.text + ' · ' + text; last.level = level; }
    else blocks.push({ text, kind, level });
    curKind = null;
  };

  const re = new RegExp(TOKEN_RE);
  let m;
  while ((m = re.exec(src))) {
    if (m[1] != null) { buf += m[1]; continue; }                 // CDATA — literal, never re-decoded
    if (m[6] != null) { buf += decodeEntities(m[6]); continue; }  // ordinary text run
    if (m[7] != null) { buf += '<'; continue; }                   // a stray '<' — never stalls the scan
    if (m[3] == null) continue;                                   // a comment or a PI

    const name = m[3].toLowerCase().replace(/^[^:]+:/, '');
    const closing = m[2] === '/';
    const selfClose = m[5] === '/';

    if (BREAK_TAGS.has(name)) { if (!closing) buf += ' '; continue; }

    if (HEAD_TAGS.has(name)) {
      if (closing) flush();
      else { flush(); curKind = 'heading'; }
      continue;
    }

    if (DIV_TAGS.has(name)) {
      if (closing) { flush(); divDepth = Math.max(0, divDepth - 1); continue; }
      flush();
      divDepth++;
      const attrs = parseAttrs(m[4]);
      const label = attrs.n || attrs.type || attrs.subtype || null;
      if (label) { curKind = 'label'; buf = label; flush(); }
      if (selfClose) divDepth = Math.max(0, divDepth - 1);
      continue;
    }

    if (BLOCK_KIND[name]) {
      if (closing) { flush(); continue; }
      flush();
      curKind = BLOCK_KIND[name];
      if (selfClose) flush();
      continue;
    }
    // any other element (TEI's <num>, <hi>, <foreign>, <ref>, an unknown vocabulary's tag, …) —
    // the tag itself is never rendered; its text still reaches the open block untouched.
  }
  flush();
  return blocks;
};

// ---- TEI header → structured metadata ------------------------------------------------------
// teiHeaderMeta(headerXml) → the bibliographic front matter, kept APART from body prose (title,
// author/editor, who prepared the edition, who funded/published it, the rights statement, the
// print source it transcribes, its revision history) — never flattened into one run-on
// paragraph the way an HTML-minded reader would. Every field degrades to '' / [] when absent;
// nothing here throws on a header that only carries some of these.
export const teiHeaderMeta = (headerXml) => {
  const xml = String(headerXml || '');
  // titleStmt is where TEI actually scopes title/author/editor/sponsor/principal/funder/respStmt
  // — reading the WHOLE header for these would also pick up sourceDesc's citation of the print
  // source (its own author/editor) and a revisionDesc/change's own respStmt (who made THAT edit,
  // not who is responsible for the edition), conflating two different attributions into one.
  const titleStmtM = /<titleStmt\b[^>]*>([\s\S]*?)<\/titleStmt>/i.exec(xml);
  const titleStmt = titleStmtM ? titleStmtM[1] : xml;
  const titles = allElementTexts(titleStmt, 'title');

  const respStmts = [];
  const respRe = /<respStmt\b[^>]*>([\s\S]*?)<\/respStmt>/gi;
  let rm;
  while ((rm = respRe.exec(titleStmt))) {
    const inner = rm[1];
    const resp = firstElementText(inner, 'resp');
    const names = allElementTexts(inner, 'name');
    if (resp || names.length) respStmts.push({ resp, names });
  }

  const availM = /<availability\b[^>]*>([\s\S]*?)<\/availability>/i.exec(xml);
  const availability = availM ? xmlBodyToBlocks(availM[1]).map((b) => b.text) : [];

  const sourceM = /<sourceDesc\b[^>]*>([\s\S]*?)<\/sourceDesc>/i.exec(xml);
  const sourceDesc = sourceM ? stripTags(sourceM[1]) : '';

  // author/editor/funder can legitimately repeat — the SAME name in titleStmt (who wrote/edited
  // THIS edition) and again in sourceDesc's citation of the print source it transcribes. Kept as
  // a set so a name given twice for two different reasons reads once, not "by Euclid, Euclid".
  const uniq = (arr) => [...new Set(arr)];

  return {
    title: titles[0] || '',
    subtitle: titles.slice(1).find(Boolean) || '',
    authors: uniq(allElementTexts(titleStmt, 'author')),
    editors: uniq(allElementTexts(titleStmt, 'editor')),
    sponsor: firstElementText(titleStmt, 'sponsor'),
    principal: firstElementText(titleStmt, 'principal'),
    funder: uniq(allElementTexts(titleStmt, 'funder')),
    publisher: firstElementText(xml, 'publisher'),
    pubPlace: firstElementText(xml, 'pubPlace'),
    authority: firstElementText(xml, 'authority'),
    respStmts,
    availability,
    sourceDesc,
    revisions: allElementTexts(xml, 'change'),
  };
};

// parseXmlDocument(xmlText) → { isTei, rootTag, meta, blocks, unresolvedEntities }. `meta` is
// null for a non-TEI document (no <teiHeader> to split out — the whole document reads as body,
// still correctly block-structured, just with no separate front-matter panel). The one entrance;
// organs/in/xml.js hands the result straight to assembleDocument.
export const parseXmlDocument = (xmlText) => {
  const raw = String(xmlText || '');
  const cleaned = stripProlog(raw).replace(COMMENT_RE, ' ');
  const root = rootTagOf(cleaned);
  const isTei = isTeiRoot(root);
  const { headerXml, bodyXml } = isTei ? splitTeiHeader(cleaned) : { headerXml: null, bodyXml: cleaned };
  const meta = headerXml != null ? teiHeaderMeta(headerXml) : null;
  const blocks = xmlBodyToBlocks(bodyXml);
  return {
    isTei, rootTag: root ? root.name : null, meta, blocks,
    unresolvedEntities: unresolvedXmlEntities(raw),
  };
};
