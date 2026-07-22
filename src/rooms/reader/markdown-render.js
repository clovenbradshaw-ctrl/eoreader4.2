// EO: NUL(Field -> Void, Tending) — markdown -> HTML, a document's own typeset shape
// A markdown source (a plain .md upload, or pasted markdown text) carries real structure —
// headings, lists, emphasis, links, tables — that the Reader tab's prose reflow can't show:
// it only recognises an ATX '#' heading (reader-render.js#lineForm), so **bold**/- item/
// [link](url) all show through as literal punctuation. This gives the Native tab the
// document's OWN typeset shape instead — the thing "markdown renders as markdown" means.
//
// Deliberately not a full CommonMark implementation: no reference-style links, no setext
// (===/--- underline) headings, no raw-HTML passthrough (a literal <div> in the source is
// shown as text, not interpreted — every span of output text is escaped once, up front, so
// nothing written INTO a document can execute inside it). That covers the shapes people
// actually write by hand — headings, paragraphs, lists (nested), blockquotes, fenced code,
// tables, links/images, emphasis — the same "the common cases, honestly" scope
// reader-render.js's own structure detector keeps.
//
// Pure: markdownToHtml(text) -> { html, toc }, no DOM, no network.

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => esc(s).replace(/"/g, '&quot;');

// ---- block-level: lines -> a tree of {type,...} nodes ------------------------------------
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)\s*$/;
// The (?=\s|$) lockstep on the hash run — not a separate "#tag" check run afterwards — is the
// point: {1,6} backtracks on its own if a later part of the pattern needs it to, so a SEPARATE
// regex re-testing "is this run followed by non-space" can walk back the count `atx[1]` already
// settled on ("## Two" nearly matched as a rejected "#tag" this way, since {1,6} can give back a
// hash to satisfy \S). Binding the lookahead to the SAME quantifier keeps the two checks — how
// many hashes, and what follows them — from disagreeing with each other.
const ATX_RE = /^ {0,3}(#{1,6})(?=\s|$)(?:\s+(.*?))?\s*$/;
const HR_RE = /^ {0,3}([-*_])(?: *\1){2,} *$/;
const QUOTE_RE = /^ {0,3}>\s?/;
const LIST_ITEM_RE = /^( {0,3})([-*+]|\d{1,9}[.)])(?:\s+(.*))?$/;
const TABLE_SEP_RE = /^ {0,3}\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

const isBlockStart = (line) =>
  ATX_RE.test(line) ||
  FENCE_RE.test(line) || HR_RE.test(line) || QUOTE_RE.test(line) ||
  LIST_ITEM_RE.test(line) || (line.trim().startsWith('|') && /\|/.test(line));

const dedent = (line, n) => {
  let k = 0; while (k < n && k < line.length && line[k] === ' ') k++;
  return line.slice(k);
};

const splitRow = (line) => {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
};

const parseTable = (lines, i) => {
  if (i + 1 >= lines.length || !/\|/.test(lines[i]) || !TABLE_SEP_RE.test(lines[i + 1])) return null;
  const header = splitRow(lines[i]);
  const aligns = splitRow(lines[i + 1]).map((c) => {
    const t = c.trim(), l = t.startsWith(':'), r = t.endsWith(':');
    return l && r ? 'center' : r ? 'right' : l ? 'left' : null;
  });
  let j = i + 2; const rows = [];
  while (j < lines.length && lines[j].trim() !== '' && /\|/.test(lines[j])) { rows.push(splitRow(lines[j])); j++; }
  return { block: { type: 'table', header, aligns, rows }, next: j };
};

// A list's own extent: every line at its item indent, plus every blank/deeper-indented line
// (a wrapped line, a nested list, a second paragraph in one item) — anything dedented back
// to or past the base column ends it.
const collectListExtent = (lines, start, baseIndent, ordered) => {
  let end = start;
  while (end < lines.length) {
    const line = lines[end];
    if (line.trim() === '') { end++; continue; }
    const m = LIST_ITEM_RE.exec(line);
    // A same-indent item continues this list only while it stays the same TYPE (bullet vs
    // numbered) — a numbered "1." right after a bullet "-" starts a new list, not a longer one.
    if (m && m[1].length === baseIndent) { if (/\d/.test(m[2]) !== ordered) break; end++; continue; }
    if ((/^ */.exec(line))[0].length > baseIndent) { end++; continue; }
    break;
  }
  while (end > start && lines[end - 1].trim() === '') end--;
  return end;
};

const parseList = (lines, start) => {
  const first = LIST_ITEM_RE.exec(lines[start]);
  const baseIndent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const end = collectListExtent(lines, start, baseIndent, ordered);
  const items = [];
  let i = start;
  while (i < end) {
    const m = LIST_ITEM_RE.exec(lines[i]);
    const markerWidth = m[1].length + m[2].length + (m[3] != null ? 1 : 0);
    const itemLines = [m[3] || ''];
    let j = i + 1;
    while (j < end) {
      const line = lines[j];
      if (line.trim() === '') { itemLines.push(''); j++; continue; }
      const nm = LIST_ITEM_RE.exec(line);
      if (nm && nm[1].length === baseIndent) break;
      itemLines.push(dedent(line, markerWidth));
      j++;
    }
    while (itemLines.length && itemLines[itemLines.length - 1].trim() === '') itemLines.pop();
    const children = parseBlocks(itemLines);
    items.push({ children, tight: children.length <= 1 });
    i = j;
  }
  return { block: { type: 'list', ordered, items }, next: end };
};

export const parseBlocks = (lines) => {
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim() === '') { i++; continue; }

    const fence = FENCE_RE.exec(lines[i]);
    if (fence) {
      const marker = fence[1][0], lang = fence[2] || '';
      const closeRe = new RegExp('^ {0,3}\\' + marker + '{' + fence[1].length + ',}\\s*$');
      let j = i + 1; const body = [];
      while (j < lines.length && !closeRe.test(lines[j])) { body.push(lines[j]); j++; }
      blocks.push({ type: 'code', lang, text: body.join('\n') });
      i = j + 1; continue;
    }

    const atx = ATX_RE.exec(lines[i]);
    if (atx) {
      blocks.push({ type: 'heading', level: atx[1].length, text: (atx[2] || '').replace(/\s+#+\s*$/, '') });
      i++; continue;
    }

    if (HR_RE.test(lines[i])) { blocks.push({ type: 'hr' }); i++; continue; }

    if (QUOTE_RE.test(lines[i])) {
      const body = []; let j = i;
      while (j < lines.length && (QUOTE_RE.test(lines[j]) || (lines[j].trim() !== '' && !isBlockStart(lines[j])))) {
        body.push(lines[j].replace(QUOTE_RE, '')); j++;
      }
      blocks.push({ type: 'blockquote', children: parseBlocks(body) });
      i = j; continue;
    }

    const table = parseTable(lines, i);
    if (table) { blocks.push(table.block); i = table.next; continue; }

    if (LIST_ITEM_RE.test(lines[i])) {
      const list = parseList(lines, i);
      blocks.push(list.block); i = list.next; continue;
    }

    let j = i; const para = [];
    while (j < lines.length && lines[j].trim() !== '' && (j === i || !isBlockStart(lines[j]))) { para.push(lines[j]); j++; }
    blocks.push({ type: 'para', text: para.join('\n') });
    i = j;
  }
  return blocks;
};

// ---- inline: one span of text -> escaped HTML with code/emphasis/links resolved ----------
const DANGEROUS_HREF = /^\s*(javascript|data|vbscript):/i;
// Bold alternatives before the single-char italic ones, so at a **strong** position the
// bold branch claims both stars before italic ever gets a look at the first one —
// first-match-wins, left-to-right, the same discipline as reader-render.js's own
// inlineMdMarks. Code spans are stashed out (below) before this ever runs, so an emphasis
// marker inside `code` is never touched.
const EMPH_RE = /\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|\*([^\s*](?:[\s\S]*?[^\s*])?)\*|_([^\s_](?:[\s\S]*?[^\s_])?)_|~~([\s\S]+?)~~/g;
function emphasize(s) {
  return s.replace(EMPH_RE, (m, b1, b2, i1, i2, d) =>
    b1 != null ? '<strong>' + b1 + '</strong>'
      : b2 != null ? '<strong>' + b2 + '</strong>'
        : i1 != null ? '<em>' + i1 + '</em>'
          : i2 != null ? '<em>' + i2 + '</em>'
            : '<del>' + d + '</del>');
}

// Sentinels for spans that must ride through the emphasis pass untouched, built at runtime
// (never written as a literal escape in source) from Private Use Area code points — so
// nothing a person types in ordinary prose ever collides with one, the way stashing behind
// plain digits would (a document mentioning "the year 2024" would reopen that by accident).
// LINK_MARK matters for a reason beyond user input: the <a>/<img> tags THIS function itself
// generates carry a literal `target="_blank"` — one underscore, no partner — so if that HTML
// were left inline for emphasize() to scan, a SECOND link's `target="_blank"` anywhere later
// in the same paragraph reads as the closing underscore, italicising (and truncating) every
// tag in between. Stashing every generated link/image behind a sentinel first, restoring
// after emphasize() runs, means emphasize() only ever sees markdown source text, never HTML
// this module wrote a moment ago.
const BREAK_MARK = String.fromCharCode(0xE000);
const CODE_MARK = String.fromCharCode(0xE001);
const LINK_MARK = String.fromCharCode(0xE002);
const codeMarkRe = new RegExp(CODE_MARK + '(\\d+)' + CODE_MARK, 'g');
const linkMarkRe = new RegExp(LINK_MARK + '(\\d+)' + LINK_MARK, 'g');
const breakMarkRe = new RegExp(BREAK_MARK, 'g');

export const inline = (text) => {
  // a hard break — two-or-more trailing spaces, or a trailing backslash, before a newline.
  const withBreaks = String(text == null ? '' : text).replace(/(?: {2,}|\\)\n/g, BREAK_MARK);
  let s = esc(withBreaks);

  const linkStash = [];
  const stashLink = (html) => { linkStash.push(html); return LINK_MARK + (linkStash.length - 1) + LINK_MARK; };
  s = s.replace(/&lt;((?:https?:\/\/|mailto:)[^\s&]+?)&gt;/g, (_, href) => stashLink('<a href="' + escAttr(href) + '" target="_blank" rel="noopener noreferrer">' + href + '</a>'));

  const codeStash = [];
  s = s.replace(/(`+)([\s\S]+?)\1/g, (_, __, body) => {
    codeStash.push(body.replace(/^ (\S)/, '$1').replace(/(\S) $/, '$1'));
    return CODE_MARK + (codeStash.length - 1) + CODE_MARK;
  });

  s = s.replace(/(!?)\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_, bang, label, href, title) => {
    const safe = DANGEROUS_HREF.test(href) ? '#' : href;
    if (bang) return stashLink('<img src="' + escAttr(safe) + '" alt="' + label + '"' + (title ? ' title="' + escAttr(title) + '"' : '') + ' loading="lazy">');
    return stashLink('<a href="' + escAttr(safe) + '" target="_blank" rel="noopener noreferrer">' + emphasize(label) + '</a>');
  });

  s = emphasize(s);
  s = s.replace(codeMarkRe, (_, n) => '<code>' + codeStash[+n] + '</code>');
  s = s.replace(linkMarkRe, (_, n) => linkStash[+n]);
  return s.replace(breakMarkRe, '<br>');
};

// ---- block -> HTML, collecting a heading table of contents as it goes --------------------
const renderRow = (cells, tag, aligns) => '<tr>' + cells.map((c, i) =>
  '<' + tag + (aligns[i] ? ' style="text-align:' + aligns[i] + '"' : '') + '>' + inline(c) + '</' + tag + '>').join('') + '</tr>';

const renderBlock = (b, toc) => {
  switch (b.type) {
    case 'heading': {
      const id = 'eo-md-' + toc.length;
      toc.push({ id, label: b.text.replace(/[*_`]/g, '').trim(), level: b.level });
      return '<h' + b.level + ' id="' + id + '">' + inline(b.text) + '</h' + b.level + '>';
    }
    case 'para': return '<p>' + inline(b.text) + '</p>';
    case 'hr': return '<hr>';
    case 'code': return '<pre class="eo-md-code"' + (b.lang ? ' data-lang="' + escAttr(b.lang) + '"' : '') + '><code>' + esc(b.text) + '</code></pre>';
    case 'blockquote': return '<blockquote>' + b.children.map((c) => renderBlock(c, toc)).join('\n') + '</blockquote>';
    case 'table': {
      const head = '<thead>' + renderRow(b.header, 'th', b.aligns) + '</thead>';
      const body = b.rows.length ? '<tbody>' + b.rows.map((r) => renderRow(r, 'td', b.aligns)).join('') + '</tbody>' : '';
      return '<table>' + head + body + '</table>';
    }
    case 'list': {
      const tag = b.ordered ? 'ol' : 'ul';
      const items = b.items.map((it) => '<li>' + (
        it.tight
          ? (it.children[0] ? inline(it.children[0].text) : '')
          : it.children.map((c) => renderBlock(c, toc)).join('\n')
      ) + '</li>').join('');
      return '<' + tag + '>' + items + '</' + tag + '>';
    }
    default: return '';
  }
};

// markdownToHtml(text) -> { html, toc }. toc is [{id,label,level}], the same contents-drawer
// shape readerHtml/decorateNativeDoc already produce — one entrance, three sources.
export const markdownToHtml = (text) => {
  const lines = String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n');
  const blocks = parseBlocks(lines);
  const toc = [];
  const html = blocks.map((b) => renderBlock(b, toc)).join('\n');
  return { html, toc };
};

// A GitHub-README-ish typographic shell — its own small stylesheet, deliberately not the
// Reader tab's paper/sepia/dark theme system: this is a structured-document view (markdown,
// json, a table, code — native-render.js's other kinds share it), not a paged reading
// experience, so it does not carry the reader's size/width/theme preferences.
export const MARKDOWN_CSS = `
.eo-md{max-width:820px;margin:0 auto;padding:40px 28px 120px;font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1b1b22}
.eo-md h1,.eo-md h2,.eo-md h3,.eo-md h4,.eo-md h5,.eo-md h6{font-family:Georgia,serif;font-weight:700;line-height:1.25;margin:1.4em 0 .5em;color:#15151a}
.eo-md h1{font-size:1.9em;border-bottom:1px solid #ececf0;padding-bottom:.25em}
.eo-md h2{font-size:1.5em;border-bottom:1px solid #ececf0;padding-bottom:.2em}
.eo-md h3{font-size:1.22em}.eo-md h4{font-size:1.05em}
.eo-md p,.eo-md ul,.eo-md ol,.eo-md blockquote,.eo-md table,.eo-md pre{margin:0 0 1em}
.eo-md ul,.eo-md ol{padding-left:1.6em}
.eo-md li{margin:.2em 0}
.eo-md li>p{margin:.3em 0}
.eo-md a{color:#5B4BE6;text-decoration:none}
.eo-md a:hover{text-decoration:underline}
.eo-md blockquote{border-left:3px solid #DED8FD;margin-left:0;padding:2px 0 2px 16px;color:#5a5a63}
.eo-md code{font:13px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;background:#f2f2f6;border-radius:4px;padding:.15em .4em}
.eo-md pre.eo-md-code{background:#15151a;color:#dce4f0;border-radius:8px;padding:14px 16px;overflow:auto}
.eo-md pre.eo-md-code code{background:none;padding:0;color:inherit}
.eo-md img{max-width:100%}
.eo-md hr{border:none;border-top:1px solid #ececf0;margin:2em 0}
.eo-md table{border-collapse:collapse;width:100%;font-size:.94em}
.eo-md th,.eo-md td{border:1px solid #ececf0;padding:6px 10px;text-align:left}
.eo-md th{background:#fafafb;font-weight:700}
`;
