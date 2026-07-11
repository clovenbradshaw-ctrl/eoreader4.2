// EO: NUL·SEG(Field → Void, Clearing,Dissecting) — render a recorded source as a book
// reader/reader-render.js — turn a recorded source into a READABLE surface: a themed,
// paper-and-serif "book" (the reader), and a sanitized native-page render, both as a
// self-contained HTML document string for an <iframe srcdoc>.
//
// This is the 4.1 advanced reader, ported and made PURE. The heart of it — "especially good
// at rendering Project Gutenberg books" — is three moves, none of which need the model, the
// engine graph, or the network:
//   1. reflow  — a Gutenberg .txt is hard-wrapped at ~70 cols with a blank line between
//                paragraphs; split on the blank lines, join the hard wraps, and prose flows
//                again (the current Document view splits on EVERY newline, so a book reads as
//                one short line per block — this is the bug the reader fixes).
//   2. structure — a chapter is discovered by the FORM of a short line that RECURS and tiles
//                the text (roman numerals, "Chapter N", ALL-CAPS, a markdown #), never by a
//                keyword list; each becomes a heading + a TOC anchor.
//   3. theme   — paper (light/sepia/dark) + type family (serif/sans) + size/width, all as CSS
//                variables so the surface can retint the open book LIVE, without a reload
//                (scroll position survives).
//
// Everything here is offline and framework-free: readerModel / readerHtml take a source and
// return strings, so they unit-test with no DOM; applyThemeVars / scrollToText are the two DOM
// helpers the surface calls against the mounted iframe's contentDocument.

// ── paper themes + type families (verbatim from eoreader4.1's READ_THEMES/READ_FONTS) ────────
export const READ_THEMES = {
  light: { bg: '#ffffff', fg: '#23272e', fg2: '#9aa1ab', rule: '#eef0f3' },
  sepia: { bg: '#f4ecd9', fg: '#473f30', fg2: '#9a8e72', rule: '#e6dac0' },
  dark:  { bg: '#14171c', fg: '#c8ccd3', fg2: '#71777f', rule: '#262a31' },
};
export const READ_FONTS = {
  serif: 'Georgia,"Iowan Old Style","Times New Roman",serif',
  sans:  '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif',
};
// The reader's accent — EO violet (the surface's link/brand color), used for drop caps,
// chapter rules, and the focus-passage flash.
export const READ_ACCENT = '#5B4BE6';
export const DEFAULT_READ_PREFS = { fs: 19, lh: 1.7, w: 720, theme: 'light', font: 'serif' };
export const READ_THEME_ORDER = ['light', 'sepia', 'dark'];
export const READ_WIDTH_ORDER = [600, 720, 860];

// Clamp a prefs patch into the same bounds the toolbar allows (fs 14–30, lh 1.3–2.2).
export const clampReadPrefs = (p = {}) => {
  const rp = { ...DEFAULT_READ_PREFS, ...(p && typeof p === 'object' ? p : {}) };
  rp.fs = Math.max(14, Math.min(30, +rp.fs || 19));
  rp.lh = Math.max(1.3, Math.min(2.2, Math.round((+rp.lh || 1.7) * 10) / 10));
  if (!READ_WIDTH_ORDER.includes(+rp.w)) rp.w = 720; else rp.w = +rp.w;
  if (!READ_THEMES[rp.theme]) rp.theme = 'light';
  if (!READ_FONTS[rp.font]) rp.font = 'serif';
  return rp;
};

// ── tiny pure helpers ────────────────────────────────────────────────────────────────────────
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => esc(s).replace(/"/g, '&quot;');
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// Roman numeral → value, or null. (eoreader4.1 _roman.)
const roman = (r) => {
  if (!/^[ivxlcdm]+$/i.test(r)) return null;
  const m = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let n = 0; r = String(r).toUpperCase();
  for (let i = 0; i < r.length; i++) { const a = m[r[i]], b = m[r[i + 1]]; if (b && a < b) { n += b - a; i++; } else n += a; }
  return n;
};
// A line that ends like a sentence and carries ≥2 lowercase words is prose, not a heading.
const sentencey = (t) => /[.!?]["')”]?$/.test(t) && (t.match(/\b[a-z]{2,}\b/g) || []).length >= 2;
// A short, unpunctuated line reads as a title.
const titleish = (s) => { s = norm(s); return s.length >= 2 && s.length <= 52 && !/[.!?:;,]$/.test(s) && s.split(' ').length <= 9; };

// Classify a short line by FORM only → {fam,kind,level,val,label} | null. (eoreader4.1 _lineForm.)
// The family key carries the lead word + numeral position so "Chapter I" groups apart from a
// caption that merely mentions "Chapter I. 1".
const lineForm = (t) => {
  t = norm(t);
  if (t.length < 1 || t.length > 72) return null;
  const words = t.split(/\s+/);
  if (words.length > 9) return null;
  const md = t.match(/^(#{1,6})\s+(\S.*)$/);
  if (md) return { fam: 'md' + md[1].length, kind: 'decl', level: md[1].length, label: md[2].replace(/\s*#+$/, '') };
  if (sentencey(t)) return null;
  let idx = -1, cls = null, depth = 1, val = null;
  for (let k = 0; k < words.length; k++) {
    const w = words[k].replace(/^[^\w#]+|[^\w]+$/g, '');
    if (k === 0 && /^\d+(?:\.\d+)+$/.test(w) && w.split('.').every((x) => +x <= 400)) { idx = k; cls = 'D'; depth = w.split('.').length; break; }
    if (/^\d{1,3}$/.test(w)) { idx = k; cls = 'N'; val = +w; break; }
    const r = roman(w); if (r != null) { idx = k; cls = 'R'; val = r; break; }
  }
  if (idx >= 0) {
    const before = idx > 0 ? words[idx - 1].replace(/[^A-Za-z]/g, '').toLowerCase() : '';
    return cls === 'D' ? { fam: 'dec', kind: 'decl', level: depth, label: t } : { fam: before + '|' + cls + '@' + idx, kind: 'num', level: 1, val, label: t };
  }
  const caps = /[A-Z]/.test(t) && !/[a-z]/.test(t);
  const titled = words.filter((w) => /^[“"(]?[A-Z]/.test(w)).length >= Math.max(1, Math.ceil(words.length * 0.6));
  if (caps) return { fam: 'CAPS', kind: 'shape', label: t };
  if (titled) return { fam: 'TITLE', kind: 'shape', label: t };
  return null;
};

// → [{paraIndex,label,kind:'heading',level}] in reading order. (eoreader4.1 detectStructure, the
// form-discovery half — the entity-field fallback is dropped, as it needs the live graph; a text
// with no recurring heading form simply reads as flowing prose with no TOC, which is correct.)
export const detectStructure = (paras) => {
  const N = paras.length;
  if (N < 2) return [];
  const cand = [];
  paras.forEach((t, i) => { const f = lineForm(t); if (f) cand.push({ ...f, i }); });
  const byFam = new Map();
  cand.forEach((c) => { if (!byFam.has(c.fam)) byFam.set(c.fam, []); byFam.get(c.fam).push(c); });
  const fams = [];
  for (const [fam, M] of byFam) {
    const idxs = M.map((c) => c.i), n = idxs.length;
    const coverage = n < 2 ? 0 : (idxs[n - 1] - idxs[0]) / Math.max(1, N - 1);
    const gaps = []; for (let k = 1; k < n; k++) gaps.push(idxs[k] - idxs[k - 1]);
    const mean = gaps.reduce((a, b) => a + b, 0) / (gaps.length || 1);
    const cov = gaps.length ? Math.sqrt(gaps.reduce((a, b) => a + (b - mean) * (b - mean), 0) / gaps.length) / Math.max(1, mean) : 0;
    const empty = /^\|[NR]@/.test(fam);
    let gs = 1;
    if (M[0].kind === 'num') { const v = M.map((c) => c.val); let g = 0; for (let k = 1; k < v.length; k++) { const s = v[k] - v[k - 1]; if (s === 1 || (s < 0 && v[k] <= 3)) g++; } gs = v.length > 1 ? g / (v.length - 1) : 0; }
    fams.push({ fam, M, kind: M[0].kind, n, coverage, cov, density: n / N, empty, gs });
  }
  // Numbered families: a recurring lead-form whose numerals run, spanning the doc, regular and
  // SPARSE (a page-footer/glossary is too dense). Declared markup (markdown/decimal) is honored.
  let acc = fams.filter((f) => f.kind === 'num'
    ? (f.n >= 3 && f.coverage >= 0.55 && f.cov <= 1.0 && f.density <= 0.06 && f.gs >= (f.empty ? 0.8 : 0.7))
    : f.kind === 'decl'
      ? (/^md/.test(f.fam) ? f.n >= 1 : (f.n >= 3 && f.coverage >= 0.3 && f.cov <= 1.6))
      : false);
  // Shape-only families (titles / all-caps, no numbering) only as a last resort, strict — else a
  // dictionary's example names or an anthology's titles would hallucinate a TOC.
  if (!acc.length) acc = fams.filter((f) => f.kind === 'shape' && f.n >= 3 && f.coverage >= 0.6 && f.cov <= 0.55 && f.density <= 0.08);
  if (!acc.length) return [];
  const infs = acc.filter((f) => f.kind !== 'decl').sort((a, b) => a.density - b.density);
  const rank = new Map(); infs.forEach((f, r) => rank.set(f.fam, r + 1));
  const secs = [];
  for (const f of acc) for (const c of f.M) {
    const level = f.kind === 'decl' ? (c.level || 1) : (rank.get(f.fam) || 1);
    secs.push({ paraIndex: c.i, label: norm(c.label).slice(0, 72), kind: 'heading', level });
  }
  secs.sort((a, b) => a.paraIndex - b.paraIndex);
  const seen = new Set(), out = [];
  for (const s of secs) { if (seen.has(s.paraIndex)) continue; seen.add(s.paraIndex); out.push(s); }
  return out;
};

// ── Project Gutenberg boilerplate (defensive) ────────────────────────────────────────────────
// The reader's sources are usually stripped at ingest (organs/ingest/gutenberg.js), but a book
// pasted straight in still carries the transcription markers; strip them here too so the license
// text never opens the reading. Mirrors ingest's stripGutenbergBoilerplate: keep the labeled
// front matter that sits BEFORE the START marker (Title/Author/…), drop everything else around the
// body between START and END. A text with no markers is returned unchanged.
const PG_START = /^\s*\*{3}\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK\b[^\n]*$/im;
const PG_END   = /^\s*\*{3}\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK\b[^\n]*$/im;

// The labeled front matter a Gutenberg book keeps over the cut. Lift it off the head so it
// becomes the byline instead of the first "paragraph", and so Author/date feed the title block.
const FRONT_FIELD = /^(Title|Author|Editor|Translator|Illustrator|Release date|Language|Original publication|Credits)\s*:\s*(.+)$/i;

export const stripGutenbergMarkers = (raw) => {
  const s = String(raw || '').replace(/\r\n?/g, '\n');
  const start = PG_START.exec(s);
  if (!start) return s.trim();
  const end = PG_END.exec(s);
  const head = s.slice(0, start.index);
  const body = s.slice(start.index + start[0].length, end ? end.index : undefined).trim();
  const front = head.split('\n').map((l) => l.trim()).filter((l) => FRONT_FIELD.test(l));
  return (front.length ? front.join('\n') + '\n\n' : '') + body;
};
const extractFrontMatter = (text) => {
  const lines = String(text || '').split('\n');
  const fields = {};
  let i = 0;
  // Scan the head: skip blanks, capture consecutive front-matter fields, stop at the first
  // prose line (so a "Title:" buried mid-book is never mistaken for front matter).
  for (; i < lines.length && i < 40; i++) {
    const ln = lines[i].trim();
    if (!ln) continue;
    const m = FRONT_FIELD.exec(ln);
    if (m) { const key = m[1].toLowerCase(); if (!fields[key]) fields[key] = norm(m[2]); continue; }
    break;
  }
  // Only treat the head as front matter if we actually found labeled fields there.
  const body = Object.keys(fields).length ? lines.slice(i).join('\n').replace(/^\n+/, '') : text;
  return { fields, body };
};

// body → paragraph blocks. Split on blank lines, then reflow each block's hard wraps into one
// run (this is the reflow that makes a Gutenberg .txt read as prose). Returns { paras, preRaw }:
// when the text has NO blank lines at all (verse / a single wrapped column) there are no blocks to
// find, so preRaw carries the whole text for a pre-wrap render that keeps every line break.
const paragraphize = (body) => {
  const t = String(body || '').replace(/\r\n?/g, '\n');
  const blocks = t.split(/\n[ \t]*\n+/).map((b) => norm(b.replace(/\s*\n\s*/g, ' '))).filter(Boolean);
  if (blocks.length <= 1) return { paras: [], preRaw: t.replace(/[ \t]+$/gm, '').trim() };
  return { paras: blocks, preRaw: null };
};

// readerModel(source) → the structured book: title/author/byline + paragraphs + detected chapters.
// `source` is the S-registry entry (needs .text; uses .title / .url / .domain / .published when
// present). Pure — no DOM, no network.
export const readerModel = (source = {}) => {
  const stripped = stripGutenbergMarkers(source.text || '');
  const { fields, body } = extractFrontMatter(stripped);
  const { paras, preRaw } = paragraphize(body);
  const title = norm(source.title || fields.title || (preRaw || body).split('\n').map(norm).find((l) => l.length > 2) || 'Untitled');
  const author = fields.author ? norm(fields.author.replace(/\s*\(.*?\)\s*$/, '')) : null;
  // The date/publication line — drop Gutenberg's "[eBook #NNNN]" note so the byline stays clean.
  const dateStr = String(source.published || fields['original publication'] || fields['release date'] || '')
    .replace(/\s*\[[^\]]*\]\s*$/, '');
  const words = (preRaw || paras.join(' ')).split(/\s+/).filter(Boolean).length;
  const sections = preRaw ? [] : detectStructure(paras);
  return { title, author, dateStr: norm(dateStr), paras, preRaw, sections, words, domain: source.domain || '' };
};

// The reading stylesheet, baked with the current prefs so the first paint matches (the surface
// then retints live via applyThemeVars). Ported from eoreader4.1 _bookHtml's <style>, minus the
// bookmark / media / readings-audit rules the reader here does not carry.
const readerCss = (rp) => {
  const tm = READ_THEMES[rp.theme] || READ_THEMES.light;
  const v = (n, d) => '--eo-' + n + ':' + d + ';';
  return ':root{' + v('fs', (rp.fs || 19) + 'px') + v('lh', String(rp.lh || 1.7)) + v('maxw', (rp.w || 720) + 'px') +
    v('ff', READ_FONTS[rp.font] || READ_FONTS.serif) + v('bg', tm.bg) + v('fg', tm.fg) + v('fg2', tm.fg2) +
    v('rule', tm.rule) + v('acc', READ_ACCENT) + v('flash', 'rgba(91,75,230,.16)') + '}' +
    'html,body{margin:0;background:var(--eo-bg);}' +
    'body{font:var(--eo-fs)/var(--eo-lh) var(--eo-ff);color:var(--eo-fg);transition:background .2s,color .2s;}' +
    '.eo-book{max-width:var(--eo-maxw);margin:0 auto;padding:54px 30px 200px;}' +
    'h1.eo-title{font:700 1.95em/1.18 var(--eo-ff);letter-spacing:-.018em;color:var(--eo-fg);margin:0 0 4px;}' +
    '.eo-author{font:italic 600 1.08em/1.4 var(--eo-ff);color:var(--eo-fg);margin:0 0 12px;}' +
    '.eo-author .eo-life{font-style:normal;font-weight:400;color:var(--eo-fg2);}' +
    '.eo-byline{font:.72em/1.5 -apple-system,BlinkMacSystemFont,sans-serif;color:var(--eo-fg2);margin:0 0 34px;border-bottom:1px solid var(--eo-rule);padding-bottom:18px;}' +
    'h2.eo-chap{font:700 2.15em/1.12 var(--eo-ff);letter-spacing:-.02em;color:var(--eo-fg);margin:2.6em 0 .7em;scroll-margin-top:16px;}' +
    'h2.eo-chap.sub{font-size:1.5em;font-weight:600;color:var(--eo-fg2);}' +
    'p{margin:0 0 1.15em;}' +
    'p.eo-first::first-letter{font-size:3.1em;line-height:.86;float:left;padding:6px 10px 0 0;font-weight:700;color:var(--eo-acc);font-family:Georgia,serif;}' +
    'pre.eo-raw{white-space:pre-wrap;word-break:break-word;font:var(--eo-fs)/var(--eo-lh) var(--eo-ff);margin:0;}' +
    '.eo-focus{background:var(--eo-flash);border-radius:5px;box-shadow:0 0 0 6px var(--eo-flash);transition:background .5s,box-shadow .5s;}';
};

// readerHtml(model, prefs, opts) → { html, toc }. `html` is a complete <!doctype> document for an
// <iframe srcdoc>; `toc` is [{id,label,level}] for the surface's contents menu.
export const readerHtml = (model, prefsIn = {}, opts = {}) => {
  const rp = clampReadPrefs(prefsIn);
  const toc = [];
  let bodyHtml;
  if (model.preRaw != null) {
    // No paragraph structure to find (verse / a single wrapped column) — keep every line break.
    bodyHtml = '<pre class="eo-raw">' + esc(model.preRaw) + '</pre>';
  } else {
    const secAt = new Map();
    model.sections.forEach((s, n) => secAt.set(s.paraIndex, { s, n }));
    const parts = [];
    let chapStart = true; // re-armed after each heading → drop cap opens every chapter
    model.paras.forEach((t, i) => {
      const hit = secAt.get(i);
      if (hit) {
        const id = 'eo-ch-' + hit.n, lv = hit.s.level || 1;
        toc.push({ id, label: norm(hit.s.label), level: lv });
        const disp = /^#{1,6}\s/.test(t) ? t.replace(/^#{1,6}\s+/, '').replace(/\s*#+$/, '') : t;
        const cls = 'eo-chap' + (lv > 1 ? ' sub' : '');
        const ind = lv > 1 ? ' style="margin-left:' + ((lv - 1) * 1.15) + 'em"' : '';
        if (hit.s.kind === 'heading' || titleish(t)) { parts.push('<h2 class="' + cls + '" id="' + id + '"' + ind + '>' + esc(disp) + '</h2>'); chapStart = true; return; }
        parts.push('<p id="' + id + '" class="eo-first">' + esc(t) + '</p>'); chapStart = false; return;
      }
      parts.push('<p' + (chapStart ? ' class="eo-first"' : '') + '>' + esc(t) + '</p>'); chapStart = false;
    });
    bodyHtml = parts.join('\n');
  }
  const authorHtml = model.author
    ? '<div class="eo-author">' + esc(model.author) + (model.dateStr ? '<span class="eo-life"> · ' + esc(model.dateStr) + '</span>' : '') + '</div>'
    : '';
  const mins = Math.max(1, Math.round(model.words / 220));
  const byline = [
    model.sections.length > 1 ? model.sections.length + ' chapters' : null,
    model.words ? mins + ' min read' : null,
    model.domain && !model.author ? esc(model.domain) : null,
  ].filter(Boolean).join(' · ') || 'read as a book';
  const html = '<!doctype html><html><head><meta charset="utf-8"><base target="_blank">' +
    '<style>' + readerCss(rp) + '</style></head><body><div class="eo-book">' +
    '<h1 class="eo-title">' + esc(model.title) + '</h1>' + authorHtml +
    '<div class="eo-byline">' + byline + '</div>' + bodyHtml +
    '</div></body></html>';
  return { html, toc };
};

// Convenience: source → { html, toc, title } in one call.
export const buildReaderDoc = (source, prefs, opts) => {
  const model = readerModel(source);
  const { html, toc } = readerHtml(model, prefs, opts);
  return { html, toc, title: model.title };
};

// ── native page render (the "render a website natively" tab) ────────────────────────────────
// Given the page's own fetched HTML, make it render like the REAL website inside a sandboxed
// <iframe srcdoc> that runs no JavaScript. The iframe has no `allow-scripts`, so nothing here can
// execute — but a modern page hides most of its look behind script, so a naive "strip and drop in"
// paints a field of blank boxes. Four moves recover the real page without running a line of it:
//   • sanitize   — cut <script>/<meta refresh> so the markup can't navigate or leave dead nodes.
//   • re-base    — drop the page's own <base> and inject our own <base href> = the real URL, so
//                  every relative stylesheet/image/font resolves against the site (not the srcdoc's
//                  opaque origin), plus <meta referrer=no-referrer> and a CSP that upgrades any
//                  http asset to https (else it's blocked as mixed content on our https host).
//   • un-lazy    — promote each image's real URL out of its data-* attribute into src/srcset, the
//                  job the site's lazy-loader script would have done, so images actually appear.
//   • un-noscript— UNWRAP <noscript> rather than delete it: its contents ARE the author's own
//                  no-JS fallback (usually the plain <img> or a fallback stylesheet), which is
//                  exactly the state we're rendering.
// A plain-text URL (a .txt, a Gutenberg book) has no markup to render, so it falls through to the
// same reflow the reader uses. (eoreader4.1 loadCenter/loadEmbed native branch.)
const looksHtml = (text) => /<(?:!doctype|html|head|body|div|p|table|article|section|main|h[1-6])\b/i.test(String(text || '').slice(0, 3000));

// Lazy-load conventions: a placeholder sits in `src` while the REAL image waits in a data-* attr
// for a script to swap in on scroll. These cover lazysizes (data-src/data-srcset — the common
// one), jQuery.lazyload (data-original), and their usual variants. The `\s*=` guard makes
// `data-src` never match the `data-srcset` prefix.
const LAZY_SRC = ['data-src', 'data-lazy-src', 'data-original'];
const LAZY_SRCSET = ['data-srcset', 'data-lazy-srcset'];
const attrVal = (tag, name) => {
  const m = new RegExp('\\b' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\'|([^\\s"\'>]+))', 'i').exec(tag);
  return m ? (m[2] ?? m[3] ?? m[4]) : null;
};
const setAttr = (tag, name, value) => {
  const re = new RegExp('\\b' + name + '\\s*=\\s*("[^"]*"|\'[^\']*\'|[^\\s"\'>]+)', 'i');
  const attr = name + '="' + escAttr(value) + '"';
  return re.test(tag) ? tag.replace(re, attr) : tag.replace(/^<([a-z0-9]+)/i, '<$1 ' + attr);
};
// One <img>/<source> tag → the same tag with its real image promoted into src/srcset.
const revealLazyTag = (tag) => {
  const src = LAZY_SRC.map((a) => attrVal(tag, a)).find((v) => v != null && v !== '');
  const srcset = LAZY_SRCSET.map((a) => attrVal(tag, a)).find((v) => v != null && v !== '');
  let out = tag;
  if (src) out = setAttr(out, 'src', src);
  if (srcset) out = setAttr(out, 'srcset', srcset);
  return out;
};
// Match a whole <img>/<source> start tag WITHOUT tripping on a `>` inside a quoted attribute —
// a lazy placeholder `src` is often an inline SVG data-URI (`data:image/svg+xml,<svg …>`), whose
// `>` would end a naive `[^>]*` match early and hide the data-src that follows. The alternation
// skips over single/double-quoted runs; since `[^>"']` excludes both quotes, exactly one branch
// can start at any position, so there is no runaway backtracking.
const revealLazyImages = (html) => html.replace(/<(?:img|source)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi, revealLazyTag);

export const nativePageHtml = (rawHtml, { baseUrl = '', prefs = {} } = {}) => {
  const text = String(rawHtml || '');
  if (!looksHtml(text)) {
    // Plain text — render it as a reflowed reader page rather than a raw HTML dump.
    const model = readerModel({ text, url: baseUrl });
    return readerHtml(model, prefs).html;
  }
  // sanitize + re-base: cut scripts and meta-refresh, and drop the page's own <base> (a `<base
  // href="/">` meant for the site's origin would misdirect every relative asset here). The iframe
  // sandbox lacks allow-scripts, so this strip is defence-in-depth, not the sole guard.
  let doc = text
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<meta[^>]+http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, '')
    .replace(/<base\b[^>]*>/gi, '');
  // un-lazy, then un-noscript (unwrap, keeping the fallback content the site meant for no-JS).
  doc = revealLazyImages(doc).replace(/<\/?noscript\b[^>]*>/gi, '');
  const head = '<base href="' + escAttr(baseUrl) + '" target="_blank">' +
    '<meta name="referrer" content="no-referrer">' +
    '<meta http-equiv="Content-Security-Policy" content="upgrade-insecure-requests">';
  if (/<head[^>]*>/i.test(doc)) doc = doc.replace(/<head([^>]*)>/i, '<head$1>' + head);
  else if (/<html[^>]*>/i.test(doc)) doc = doc.replace(/<html([^>]*)>/i, '<html$1><head>' + head + '</head>');
  else doc = head + doc;
  return doc;
};

// ── DOM helpers the surface calls against the mounted reader iframe ──────────────────────────
// applyThemeVars(doc, prefs) — retint the open book LIVE by setting the CSS variables on its
// <html>, so a theme / size / font change needs no reload and scroll position survives.
// (eoreader4.1 applyReadCSS.)
export const applyThemeVars = (doc, prefsIn = {}) => {
  const rp = clampReadPrefs(prefsIn);
  const tm = READ_THEMES[rp.theme] || READ_THEMES.light;
  const r = doc && doc.documentElement && doc.documentElement.style;
  if (!r) return;
  r.setProperty('--eo-fs', (rp.fs || 19) + 'px');
  r.setProperty('--eo-lh', String(rp.lh || 1.7));
  r.setProperty('--eo-maxw', (rp.w || 720) + 'px');
  r.setProperty('--eo-ff', READ_FONTS[rp.font] || READ_FONTS.serif);
  r.setProperty('--eo-bg', tm.bg); r.setProperty('--eo-fg', tm.fg);
  r.setProperty('--eo-fg2', tm.fg2); r.setProperty('--eo-rule', tm.rule);
  try { doc.body.style.background = tm.bg; } catch { /* body not ready */ }
};

// scrollToText(doc, text) — scroll the open book to the first block that contains `text` (a cited
// passage), fold smart quotes/dashes/whitespace, retry on shorter prefixes, and flash it.
// (eoreader4.1 _scrollToText.)
export const scrollToText = (doc, text) => {
  try {
    if (!doc || !doc.body || !text) return;
    const canon = (s) => String(s || '')
      .replace(/[‘’‚‛]/g, "'").replace(/[“”„]/g, '"')
      .replace(/[–—‒]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();
    const full = canon(text); if (!full) return;
    const leaves = [...doc.body.querySelectorAll('p,li,blockquote,h1,h2,h3,h4,h5,h6,pre,dd,dt')];
    const find = (len) => { const needle = full.slice(0, len); if (needle.length < 8) return null; for (const el of leaves) { if (canon(el.textContent).indexOf(needle) >= 0) return el; } return null; };
    const el = find(80) || find(48) || find(28) || find(16); if (!el) return;
    const de = doc.scrollingElement || doc.documentElement;
    de.scrollTop = Math.max(0, el.getBoundingClientRect().top + de.scrollTop - 80);
    el.classList.add('eo-focus');
    setTimeout(() => { try { el.classList.remove('eo-focus'); } catch { /* gone */ } }, 1600);
  } catch { /* iframe not reachable */ }
};

// scrollToAnchor(doc, id) — smooth-scroll the open book to a TOC chapter anchor.
export const scrollToAnchor = (doc, id) => {
  try {
    const el = doc && doc.getElementById(id); const win = doc && doc.defaultView;
    if (!el || !win) return;
    const top = el.getBoundingClientRect().top + win.scrollY - 14;
    try { win.scrollTo({ top: Math.max(0, top), behavior: 'smooth' }); } catch { win.scrollTo(0, Math.max(0, top)); }
  } catch { /* iframe not reachable */ }
};

// ── the FACING PAGE — how the system read the source, syntax-lit like a terminal ─────────────
// A bilingual book prints the original on one leaf and its translation on the facing leaf. The
// facing view does the same for a reading: the source's own prose on the left, and on the right
// the EoT surface the engine extracted from it (ingest/read.js → eot-emit.js) — every admitted
// proposition, one line, coloured by its ELEMENT TYPE. The colour IS the reading: you see at a
// glance where the engine found a type, a relation, an attribute, an identity, a judgement.
//
// The element type of a line is its EoT operator, recovered from the line's SHAPE (the same
// shapes emitEot writes; docs/eot-surface-syntax.md). This is a presentation classifier — it
// reads the surface back, it does not re-run the engine — so it lives with the other render
// helpers, not in the ingest leaf. One terminal palette (a dark One-Dark-ish scheme), keyed by
// element type, drives both the lines and the legend.
export const EOT_ELEMENT_TYPES = {
  type:     { label: 'is-a · type',      color: '#56B6C2', hint: 'x : Type' },
  link:     { label: 'relation',         color: '#E5C07B', hint: 'x -> y : rel' },
  attr:     { label: 'attribute',        color: '#98C379', hint: 'x.k = v' },
  absence:  { label: 'absence',          color: '#E06C75', hint: 'x.k = nil' },
  identity: { label: 'identity',         color: '#C678DD', hint: 'a == b' },
  compose:  { label: 'composition',      color: '#61AFEF', hint: 'x <- [..]' },
  segment:  { label: 'partition',        color: '#D19A66', hint: 'x | key' },
  sig:      { label: 're-designation',   color: '#4EC9B0', hint: '!sig / !clm' },
  eva:      { label: 'judgement',        color: '#F191C4', hint: '!eva' },
  rec:      { label: 'reframe',          color: '#FF5C57', hint: '!rec' },
  rule:     { label: 'section',          color: '#7AA2F7', hint: '# ── … ──' },
  note:     { label: 'the reading',      color: '#6B7280', hint: '# …' },
  blank:    { label: '',                 color: 'transparent', hint: '' },
};
// Legend / display order — structure first (what it takes to exist and connect), then the
// flagged judgements, then the reading's own thinking last.
export const EOT_KIND_ORDER = ['type', 'link', 'attr', 'absence', 'identity', 'compose', 'segment', 'sig', 'eva', 'rec', 'rule', 'note'];

// classifyEotLine(line) → element-type key (a key of EOT_ELEMENT_TYPES). Pure over one surface
// line; recognises the operator by shape. Order matters: a value-bearing form (`==`, `= nil`,
// `=`) is tested before the relational/typing forms so a quoted value that happens to contain
// `->` or `:` is never mistaken for a relation or a type.
export const classifyEotLine = (line) => {
  const t = String(line == null ? '' : line).trim();
  if (t === '') return 'blank';
  if (t.startsWith('#')) return /^#+\s*──/.test(t) ? 'rule' : 'note';
  if (t.startsWith('!eva')) return 'eva';
  if (t.startsWith('!rec')) return 'rec';
  if (t.startsWith('!sig') || t.startsWith('!clm')) return 'sig';
  if (/\s==\s/.test(t)) return 'identity';
  if (/\s<-\s\[/.test(t)) return 'compose';
  if (/=\s*nil\b/.test(t)) return 'absence';
  if (/\s=\s/.test(t)) return 'attr';
  if (/\s->\s/.test(t)) return 'link';
  if (/\s\|\s/.test(t)) return 'segment';
  if (/\s:\s/.test(t)) return 'type';
  return 'note';
};

// ── entity kinds — colouring the THINGS a proposition connects, not only its operator ─────────
// classifyEotLine above colours a line by its OPERATOR — the shape of the move. But a reading is
// mostly the entities it moves: people, places, dates, works, quantities. Those get their own hue
// here, so `Trump`, `Congress`, `July` and `"SAVE AMERICA ACT"` read as different KINDS of thing
// at a glance — the way identifiers, numbers and strings differ in an editor.
//
// A kind is recovered the same honest way an element type is: from the SURFACE, never by re-running
// the engine. When the reading DECLARED a type (an is-a line `X : Type`, emitted from a
// `SIG via:'is'`), that word IS the kind and drives a stable colour everywhere the sign appears.
// Otherwise a small, conservative heuristic buckets the token — a presentation aid, not a claim.
export const EOT_ENTITY_KINDS = {
  proper:   { label: 'name',     color: '#9CDCFE' },  // a capitalised named thing (person / place)
  org:      { label: 'org',      color: '#F9CE7B' },  // an acronym, or an -Inc/-Party/-Dept/… body
  time:     { label: 'time',     color: '#D7B4F3' },  // a date, month, weekday, year or clock time
  quantity: { label: 'quantity', color: '#F7A98C' },  // money, percent or a bare number
  work:     { label: 'work',     color: '#F2A9C4' },  // a titled work / named act (quoted or CAPS)
  term:     { label: 'term',     color: '#9DA7B3' },  // a common noun / lowercased id — muted default
};
// The entity-kind legend order — the vivid, specific kinds first, the muted `term` last.
export const EOT_ENTITY_KIND_ORDER = ['proper', 'org', 'time', 'quantity', 'work', 'term'];

// Declared types (the reading's OWN vocabulary) take a stable colour off this bright-tint ring,
// picked by a cheap string hash so one type is always one hue within a reading. The ring shares no
// hex with the six heuristic kinds above, so a declared type never collides with a guessed bucket.
const DECLARED_TINTS = ['#C3E88D', '#89DDC8', '#B5CEA8', '#7FB3FF', '#E0A3FF', '#FFC499', '#8FD9D2', '#D2B48C'];
const hashTint = (s) => {
  let h = 0; const str = String(s);
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return DECLARED_TINTS[Math.abs(h) % DECLARED_TINTS.length];
};

// A titled value rides quoted on the surface (`"SAVE AMERICA ACT"`); strip the quotes for matching.
const unquoteTok = (s) => {
  const t = String(s == null ? '' : s).trim();
  return t.length >= 2 && t[0] === '"' && t[t.length - 1] === '"' ? t.slice(1, -1) : t;
};
const kindSpec = (k) => ({ key: k, label: EOT_ENTITY_KINDS[k].label, color: EOT_ENTITY_KINDS[k].color });

// heuristic shapes — conservative, most-specific first. Each is a form a reader can recognise
// without a gazetteer, so a wrong bucket is rare and, being only a colour, harmless.
const RE_TIME = /^(?:\d{4}|\d{1,2}:\d{2}|(?:Mon|Tues?|Wednes|Thurs?|Fri|Satur|Sun)day|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?)$/;
const RE_TZ = /\b(?:AM|PM)\b|\b[AECMP][SD]?T\b/;           // "AM ET", "9 PM", "EST"
const RE_QUANTITY = /^[$€£]?\d[\d,.]*\s?(?:%|percent|bn|billion|million|trillion|k|m|b)?$/i;
const RE_ACRONYM = /^[A-Z][A-Z0-9]{1,5}$/;                 // NATO, NPR, FBI, G7
const RE_ORG_SUFFIX = /\b(?:Inc|Corp|LLC|Ltd|Co|Company|Party|Committee|Department|Dept|Agency|Council|Union|Association|Assn|Bureau|Commission|Court|Bank|University|Institute|Foundation|Group|Board|Office|Senate|House|Congress|Parliament|NATO|UN|EU)\.?$/;
const RE_WORK_SUFFIX = /\b(?:Act|Bill|Amendment|Resolution|Treaty|Accord|Plan|Report|Programme?)$/;

// entityKind(token, declaredTypes) → { key, label, color }. declaredTypes: Map<sign, Type>.
export const entityKind = (token, declaredTypes) => {
  const raw = String(token == null ? '' : token).trim();
  const bare = unquoteTok(raw);
  const declared = (declaredTypes && (declaredTypes.get(raw) || declaredTypes.get(bare))) || null;
  if (declared) return { key: 'is:' + declared, label: declared, color: hashTint(declared) };
  if (!bare) return kindSpec('term');
  const words = bare.split(/\s+/).filter(Boolean);
  const allCaps = words.length >= 2 && words.every((w) => /^[A-Z][A-Z0-9'.-]*$/.test(w));
  if (raw !== bare && /^[A-Za-z]/.test(bare)) return kindSpec('work');   // a quoted title
  if (RE_TIME.test(bare) || RE_TZ.test(bare)) return kindSpec('time');
  if (RE_QUANTITY.test(bare)) return kindSpec('quantity');
  if (allCaps || RE_WORK_SUFFIX.test(bare)) return kindSpec('work');     // SAVE AMERICA ACT
  if (RE_ACRONYM.test(bare) || RE_ORG_SUFFIX.test(bare)) return kindSpec('org');
  if (/^[A-Z]/.test(bare)) return kindSpec('proper');
  return kindSpec('term');
};

// splitFirstOutsideQuotes(str, needle) → [before, after] at the FIRST needle OUTSIDE double quotes,
// or null. Mirrors classifyEotLine's value-safety: a quoted value carrying the glyph never splits.
const splitFirstOutsideQuotes = (str, needle) => {
  let inQ = false;
  for (let i = 0; i + needle.length <= str.length; i++) {
    if (str[i] === '"' && str[i - 1] !== '\\') inQ = !inQ;
    if (!inQ && str.startsWith(needle, i)) return [str.slice(0, i), str.slice(i + needle.length)];
  }
  return null;
};

// facingSegments(raw, kind, declaredTypes) → [{ s, color, role, kindKey? }] — one surface line as
// coloured runs: entities by their KIND, the operator by its element-type colour, labels/values in
// a calm accent, provenance dimmed. Lossless: the segments' text re-joins to `raw` exactly. Comment
// and section-rule lines stay one run (their whole-line colour is the reading's own voice).
export const facingSegments = (raw, kind, declaredTypes) => {
  const line = String(raw == null ? '' : raw);
  if (kind === 'blank') return [{ s: line === '' ? ' ' : line, color: 'transparent', role: 'blank' }];
  const opColorOf = (k) => (EOT_ELEMENT_TYPES[k] || EOT_ELEMENT_TYPES.note).color;
  if (kind === 'note' || kind === 'rule') return [{ s: line, color: opColorOf(kind), role: kind }];

  const DIM = '#5a6272', VALUE = '#ABB2BF';
  const ent = (tok) => { const k = entityKind(tok, declaredTypes); return { s: tok, color: k.color, role: 'ent', kindKey: k.key }; };
  const dim = (tok) => ({ s: tok, color: DIM, role: 'meta' });
  const valueSeg = (v) => {
    const t = v.trim();
    if (t === 'nil' || t === '∅' || t === 'true' || t === 'false') return { s: v, color: '#C678DD', role: 'const' };
    if (/^-?\d/.test(t)) return { s: v, color: '#D19A66', role: 'num' };
    if (t[0] === '"') return { s: v, color: '#98C379', role: 'str' };
    return { s: v, color: VALUE, role: 'val' };
  };
  const out = [];
  // peel a trailing provenance clause (` @agent`, ` ~ts`) — each a single token — off the end.
  let body = line, tail = '';
  const mt = /(?: @\S+)?(?: ~\S+)?$/.exec(body);
  if (mt && mt[0]) { tail = mt[0]; body = body.slice(0, body.length - tail.length); }
  // peel a leading flag (!sig / !clm / !eva / !rec); the tagged body carries its own shape.
  let eff = kind;
  const flag = /^(!(?:sig|clm|eva|rec))(\s+)/.exec(body);
  if (flag) { out.push({ s: flag[1], color: opColorOf(kind), role: 'flag' }, dim(flag[2])); body = body.slice(flag[0].length); eff = classifyEotLine(body); }
  const opC = opColorOf(eff);
  const op = (glyph) => ({ s: glyph, color: opC, role: 'op' });
  const entPath = (lhs) => { const d = lhs.indexOf('.'); if (d > 0) out.push(ent(lhs.slice(0, d)), dim(lhs.slice(d))); else out.push(ent(lhs)); };

  let parts;
  if (eff === 'identity' && (parts = splitFirstOutsideQuotes(body, ' == '))) {
    out.push(ent(parts[0]), op(' == '), ent(parts[1]));
  } else if (eff === 'compose' && (parts = splitFirstOutsideQuotes(body, ' <- '))) {
    out.push(ent(parts[0]), op(' <- '));
    const inner = parts[1].replace(/^\[/, '').replace(/\]$/, '');
    out.push(dim('['));
    inner.split(/(,\s*)/).forEach((piece) => { if (/^,/.test(piece)) out.push(dim(piece)); else if (piece) out.push(ent(piece)); });
    out.push(dim(']'));
  } else if (eff === 'absence' && (parts = splitFirstOutsideQuotes(body, ' = '))) {
    entPath(parts[0]); out.push(op(' = '), { s: parts[1], color: opColorOf('absence'), role: 'const' });
  } else if (eff === 'attr' && (parts = splitFirstOutsideQuotes(body, ' = '))) {
    entPath(parts[0]); out.push(op(' = '), valueSeg(parts[1]));
  } else if (eff === 'link' && (parts = splitFirstOutsideQuotes(body, ' -> '))) {
    out.push(ent(parts[0]), op(' -> '));
    const lbl = splitFirstOutsideQuotes(parts[1], ' : ');
    if (lbl) {
      out.push(ent(lbl[0]), dim(' : '));
      const neg = /^not-/.exec(lbl[1]);
      if (neg) out.push({ s: neg[0], color: opColorOf('absence'), role: 'neg' }, valueSeg(lbl[1].slice(neg[0].length)));
      else out.push(valueSeg(lbl[1]));
    } else out.push(ent(parts[1]));
  } else if (eff === 'segment' && (parts = splitFirstOutsideQuotes(body, ' | '))) {
    out.push(ent(parts[0]), op(' | '), valueSeg(parts[1]));
  } else if (eff === 'type' && (parts = splitFirstOutsideQuotes(body, ' : '))) {
    out.push(ent(parts[0]), op(' : '), { s: parts[1], color: hashTint(parts[1].trim()), role: 'type' });
  } else {
    // eva / rec / anything unrecognised — a generic pass: entities coloured, glyphs dimmed, spacing kept.
    body.split(/(\s+)/).forEach((tok) => { if (!tok) return; if (/^\s+$/.test(tok)) out.push(dim(tok)); else if (/^[A-Za-z0-9"$€£]/.test(tok)) out.push(ent(tok)); else out.push(dim(tok)); });
  }
  if (tail) out.push(dim(tail));
  return out;
};

// facingReadingLines(eotText, opts) → { lines, legend, kindLegend, truncated, more, total }
//   lines   [{ n, kind, label, color, s, dim, segs }] — one per surface line. `color`/`s` remain
//           the whole-line element colour and raw text (the terminal gutter uses `n`); `segs` is
//           the per-token breakdown [{ s, color, role }] the pane paints, so a line shows entities
//           by KIND, its operator by element type, and values in a calm accent. `dim` flags muted.
//   legend      the element TYPES present, in EOT_KIND_ORDER — [{ kind, label, color }] (operators)
//   kindLegend  the entity KINDS present, vivid-first then declared types — [{ kind, label, color }]
//   truncated/more/total  honest bound reporting, mirroring the EoT view's cap
// Pure: takes the reading's EoT text (app.eotFor(sn).text) and lays it out for the terminal pane.
export const facingReadingLines = (eotText, { max = 2400 } = {}) => {
  const all = String(eotText == null ? '' : eotText).split('\n');
  const shown = all.slice(0, max);
  // pass 1 — the reading's DECLARED types (`X : Type`, plus `!sig`/`!clm` re-designations) →
  // sign → Type, so a typed sign gets its declared colour on EVERY line, not only where it's typed.
  const declaredTypes = new Map();
  for (const raw of shown) {
    const k = classifyEotLine(raw);
    if (k === 'type') { const p = splitFirstOutsideQuotes(String(raw), ' : '); if (p) declaredTypes.set(p[0].trim(), p[1].trim()); }
    else if (k === 'sig') { const p = splitFirstOutsideQuotes(String(raw).replace(/^!(?:sig|clm)\s+/, ''), ' : '); if (p) declaredTypes.set(p[0].trim(), p[1].trim()); }
  }
  // pass 2 — lay out each line, colouring its tokens and noting which kinds actually appear.
  const present = new Set();
  const kindsPresent = new Set();
  const lines = shown.map((raw, i) => {
    const kind = classifyEotLine(raw);
    const spec = EOT_ELEMENT_TYPES[kind] || EOT_ELEMENT_TYPES.note;
    if (kind !== 'blank') present.add(kind);
    const segs = facingSegments(raw, kind, declaredTypes);
    for (const sg of segs) if (sg.role === 'ent' && sg.kindKey) kindsPresent.add(sg.kindKey);
    return { n: i + 1, kind, label: spec.label, color: spec.color, s: raw === '' ? ' ' : raw, dim: kind === 'note' || kind === 'blank', segs };
  });
  const legend = EOT_KIND_ORDER.filter((k) => present.has(k)).map((k) => ({ kind: k, label: EOT_ELEMENT_TYPES[k].label, color: EOT_ELEMENT_TYPES[k].color }));
  const kindLegend = EOT_ENTITY_KIND_ORDER.filter((k) => kindsPresent.has(k)).map((k) => ({ kind: k, label: EOT_ENTITY_KINDS[k].label, color: EOT_ENTITY_KINDS[k].color }));
  for (const key of [...kindsPresent].filter((k) => k.startsWith('is:')).sort()) kindLegend.push({ kind: key, label: key.slice(3), color: hashTint(key.slice(3)) });
  return { lines, legend, kindLegend, truncated: all.length > max, more: Math.max(0, all.length - max), total: all.length };
};
