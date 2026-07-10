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
// Given the page's own fetched HTML, make it safe to drop into a sandboxed <iframe srcdoc>: strip
// scripts / noscript / meta-refresh (so it can't navigate or run), and inject a <base href> so its
// relative CSS and images still resolve. A plain-text URL (a .txt, a Gutenberg book) has no markup
// to render, so it falls through to the same reflow the reader uses. (eoreader4.1 loadCenter/
// loadEmbed native branch.)
const looksHtml = (text) => /<(?:!doctype|html|head|body|div|p|table|article|section|main|h[1-6])\b/i.test(String(text || '').slice(0, 3000));

export const nativePageHtml = (rawHtml, { baseUrl = '', prefs = {} } = {}) => {
  const text = String(rawHtml || '');
  if (!looksHtml(text)) {
    // Plain text — render it as a reflowed reader page rather than a raw HTML dump.
    const model = readerModel({ text, url: baseUrl });
    return readerHtml(model, prefs).html;
  }
  let doc = text
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<meta[^>]+http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, '');
  const baseTag = '<base href="' + escAttr(baseUrl) + '" target="_blank"><meta name="referrer" content="no-referrer">';
  if (/<head[^>]*>/i.test(doc)) doc = doc.replace(/<head([^>]*)>/i, '<head$1>' + baseTag);
  else if (/<html[^>]*>/i.test(doc)) doc = doc.replace(/<html([^>]*)>/i, '<html$1><head>' + baseTag + '</head>');
  else doc = baseTag + doc;
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
