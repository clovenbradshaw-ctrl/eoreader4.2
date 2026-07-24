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

// The words that NAME a section boundary in any document — a book's divisions and the canonical
// parts of an article or a paper. Used two ways: as the lead word of a numbered family ("Chapter 3"),
// and — standing alone — as a heading in its own right ("Abstract", "References", "See also"). This is
// structural vocabulary, not a per-source hack: the same set marks a holon boundary in a novel, a
// wiki page, and a journal article.
const SECTION_WORD = /^(chapter|letter|part|book|canto|section|volume|stave|act|scene|epilogue|prologue|appendix|appendices)$/i;
const CANON_HEAD = /^(abstract|introduction|background|related work|prior work|methods?|methodology|materials and methods|experiments?|results|evaluation|analysis|discussion|conclusions?|future work|references|bibliography|acknowledge?ments?|appendix|appendices|notes|see also|external links|further reading|summary|overview|preface|foreword|epilogue|prologue|glossary|index|contents)(\s+[a-z0-9.]{1,12})?[.:]?$/i;
// The subset of CANON_HEAD that names BACK matter — apparatus that only ever trails a document
// (references, an appendix, a "See also" list). Distinct from FRONT-matter canonical terms
// (Abstract, Introduction, Overview, Preface, …), which legitimately open a document and must
// never be mistaken for "everything from here on is trailing matter."
const BACKMATTER_HEAD = /^(references|bibliography|acknowledge?ments?|appendix|appendices|notes|see also|external links|further reading|glossary|index)(\s+[a-z0-9.]{1,12})?[.:]?$/i;

// Classify a short line by FORM → {fam,kind,level,val,label} | null. The family key carries the lead
// word + numeral position so "Chapter I" groups apart from a caption that merely mentions "Chapter I".
// A numeral- or marker-led line ("CHAPTER 42. The Whiteness of the Whale.", "3.2.1 Scaled Dot-Product
// Attention") is a HEADING even when its title reads like a sentence — the number/marker IS the form,
// so the sentence-veto applies only to the shape (all-caps / title-case) branch, never here.
const lineForm = (t) => {
  t = norm(t);
  if (t.length < 1 || t.length > 100) return null;
  const words = t.split(/\s+/);
  if (words.length > 16) return null;   // a marker heading's title can run long ("Chapter 73. Stubb and Flask kill…")
  const md = t.match(/^(#{1,6})\s+(\S.*)$/);
  if (md) return { fam: 'md' + md[1].length, kind: 'decl', level: md[1].length, label: md[2].replace(/\s*#+$/, '') };
  let idx = -1, cls = null, depth = 1, val = null;
  for (let k = 0; k < words.length; k++) {
    const w = words[k].replace(/^[^\w#]+|[^\w]+$/g, '');
    if (k === 0 && /^\d+(?:\.\d+)+$/.test(w) && w.split('.').every((x) => +x <= 400)) { idx = k; cls = 'D'; depth = w.split('.').length; break; }
    if (/^\d{1,3}$/.test(w)) { idx = k; cls = 'N'; val = +w; break; }
    const r = roman(w); if (r != null) { idx = k; cls = 'R'; val = r; break; }
  }
  if (idx >= 0) {
    const before = idx > 0 ? words[idx - 1].replace(/[^A-Za-z]/g, '').toLowerCase() : '';
    // A numeral counts as a heading marker only when it is SET OFF as one: it carries a trailing
    // delimiter ("I.", "42.", "3)"), is led by a section word ("Chapter 12"), or the line simply isn't
    // a sentence ("1 Introduction"). This is what tells the heading "I. A Scandal in Bohemia" from the
    // first-person pronoun that opens half the sentences in a novel ("I walked to the door.") — the
    // pronoun has no delimiter and its line reads as prose, so it is not admitted.
    const delim = /[.):\]]$/.test(words[idx]);
    if (delim || SECTION_WORD.test(before) || !sentencey(t)) {
      // Key the family by what follows the numeral, so heading TIERS never merge into one blurred run:
      //   · titled ("I. A Scandal in Bohemia", "1 Introduction") vs a bare marker ("I.", a table "3")
      //   · an ALL-CAPS title ("I. A SCANDAL IN BOHEMIA" — a book's louder, top division) vs a
      //     mixed-case one ("I. From the moment…" — a quieter sub-part that reset its count per story)
      // Without this, a book of numbered stories or a paper of numbered sections read as zero structure
      // (one non-sequential blob) because the top run and the reset sub-runs shared a numeral position.
      const titleWords = words.slice(idx + 1);
      const titled = titleWords.some((w) => /[A-Za-z]{2,}/.test(w));
      const caps = titled && !/[a-z]/.test(titleWords.join(' ')) ? 'C' : '';
      return cls === 'D' ? { fam: 'dec', kind: 'decl', level: depth, label: t }
        : { fam: before + '|' + cls + '@' + idx + (titled ? 'T' : '') + caps, kind: 'num', level: 1, val, label: t };
    }
    return null;
  }
  if (sentencey(t)) return null;
  if (words.length > 9 || t.length > 72) return null;   // the typographic (shape) branch stays tight
  const caps = /[A-Z]/.test(t) && !/[a-z]/.test(t);
  const titled = words.filter((w) => /^[“"(]?[A-Z]/.test(w)).length >= Math.max(1, Math.ceil(words.length * 0.6));
  if (caps) return { fam: 'CAPS', kind: 'shape', label: t };
  if (titled) return { fam: 'TITLE', kind: 'shape', label: t };
  return null;
};

// detectStructure(paras, blockGaps) → [{paraIndex,label,kind:'heading',level}] in reading order.
//
// ONE structural pass, source-agnostic — structure is structure. A section heading is a SHORT line
// that stands off from the prose around it by SOME means, and RECURS to tile the text:
//   · a numeral / marker form   — "Chapter I", "3.2.1 Scaled Dot-Product Attention", "## Methods"
//   · a canonical section name  — "Abstract", "References", "See also" (structural vocabulary)
//   · typography               — an all-caps / title-case line
//   · SPACING                  — a short line set above a larger-than-usual blank gap (the only
//                                 signal a Wikipedia extract's sentence-case headings carry)
// `blockGaps[i]` is the count of blank lines before paragraph i (from paragraphize); absent, spacing
// carries no information and the pass falls back to form + canonical, which is correct for a text
// whose gaps we don't know. Each candidate joins a FAMILY; a family is admitted only when it recurs
// regularly and stays sparse — so a run of short nav links or a page of glossary terms never becomes
// a table of contents. Levels come from the natural depth (markup / decimal / keyword rank); a
// disjoint sibling frame and the spacing/canonical headings sit at the top level.
export const detectStructure = (paras, blockGaps = []) => {
  const N = paras.length;
  if (N < 2) return [];
  // The baseline paragraph spacing, and whether the text varies it at all. A heading sits above a gap
  // LARGER than the baseline (the minimum) — for a Wikipedia extract that double-spaces its section
  // heads but single-spaces its paragraphs, the mode is useless (headings can outnumber paragraphs),
  // so the minimum is the paragraph gap and anything above it is a boundary.
  let minGap = Infinity, maxGap = 1;
  for (const g of blockGaps) { if (g < minGap) minGap = g; if (g > maxGap) maxGap = g; }
  if (!isFinite(minGap)) minGap = 1;
  const gapSignal = maxGap > minGap;
  // One candidate per paragraph, by SIGNAL STRENGTH: a numeral/markup form is strongest; then a
  // canonical section name; then spacing; a bare typographic (all-caps / title-case) form is weakest
  // and only breaks ties. Canonical outranks typography so a lone "Abstract" / "References" — which
  // reads as a one-word title — is taken as the structural heading it is, not a stray shape.
  const cand = [];
  const short = (s) => s.length >= 2 && s.length <= 80 && s.split(' ').length <= 12 && !sentencey(s) && !/[,;:]$/.test(s);
  paras.forEach((t, i) => {
    const f = lineForm(t);
    const s = norm(t);
    if (f && (f.kind === 'num' || f.kind === 'decl')) cand.push({ ...f, i });
    else if (short(s) && CANON_HEAD.test(s)) cand.push({ fam: 'CANON', kind: 'canon', level: 1, label: s, i });
    else if (short(s) && gapSignal && (blockGaps[i] || minGap) > minGap) cand.push({ fam: 'GAP', kind: 'gap', level: 1, label: s, i });
    else if (f && f.kind === 'shape') cand.push({ ...f, i });
  });
  // A back-matter trailer's own CONTENT — a "See also" list entry, a citation, an "External links"
  // description — is often itself short and title-cased ("The Ada Lovelace Institute.") and would
  // otherwise dilute the shape family's density enough to block real body headings (Biography,
  // Childhood, …) from ever being admitted. References/See also/External links/Notes/etc. always
  // TRAIL an article (unlike front-matter canon — Abstract/Introduction/Overview — which OPENS
  // one), so once the first back-matter heading is seen, nothing after it can be a body heading —
  // drop SHAPE/GAP candidates (the weak, noise-prone kinds) from that point on. num/decl/canon are
  // untouched: a numbered/declared family has its own sequence+density admission guard already,
  // and canon detection must never depend on this at all.
  const firstBackAt = cand.reduce((m, c) => (c.kind === 'canon' && BACKMATTER_HEAD.test(c.label) && c.i < m) ? c.i : m, Infinity);
  const trimmed = isFinite(firstBackAt) ? cand.filter((c) => (c.kind !== 'shape' && c.kind !== 'gap') || c.i < firstBackAt) : cand;
  const byFam = new Map();
  trimmed.forEach((c) => { if (!byFam.has(c.fam)) byFam.set(c.fam, []); byFam.get(c.fam).push(c); });
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
  // Admit a family by KIND. Numbered: a recurring lead-form whose numerals RUN in order (gs), spaced
  // REGULARLY (cov) and SPARSELY (density), covering a real stretch of the text. Coverage is measured
  // loosely — an academic paper's sections sit in its first third with a long references/tables tail,
  // so 0.55-of-the-whole would wrongly reject "1 Introduction … 7 Conclusion"; the sequential run and
  // regular spacing are the real evidence, coverage only rules out a numbered list clustered in one
  // spot. Declared markup/decimal is honored. Canonical: a couple of structural names, sparse.
  let acc = fams.filter((f) => f.kind === 'num'
    ? (f.n >= 3 && f.coverage >= 0.3 && f.cov <= 1.0 && f.density <= 0.06 && f.gs >= (f.empty ? 0.8 : 0.7))
    : f.kind === 'decl'
      ? (/^md/.test(f.fam) ? f.n >= 1 : (f.n >= 3 && f.coverage >= 0.25 && f.cov <= 1.6))
      : f.kind === 'canon'
        ? (f.n >= 2 && f.density <= 0.12)
        : false);
  // SPACING is the fallback for a document that does NOT number or mark its sections (a Wikipedia
  // extract, whose sentence-case heads carry no form). When the doc already numbers/marks its
  // structure, trust that and ignore spacing — else a book's blank-line-set-off illustration captions
  // would flood the contents beside the real chapters.
  if (!acc.some((f) => f.kind === 'num' || f.kind === 'decl')) {
    acc = acc.concat(fams.filter((f) => f.kind === 'gap' && f.n >= 3 && f.coverage >= 0.35 && f.density <= 0.35));
  }
  // A distinct FRAME series — the four "Letter"s that open Frankenstein, a "Prologue" set — runs
  // 1..n right before (or after) the main chapters, so it sits OUTSIDE their span and fails the
  // coverage bar the body chapters clear. Once a main numbered run is accepted, admit a sibling
  // numbered family that runs strictly 1..n by ones, is sparse, and does NOT overlap an accepted
  // family's paragraph range — a real front/back section, not mid-body "Figure 1..4" captions. It's
  // a SIBLING (level 1), never a nested sub-level, so its range being disjoint is exactly the tell.
  if (acc.some((f) => f.kind === 'num')) {
    const taken = new Set(acc.map((f) => f.fam));
    const spans = acc.filter((f) => f.kind !== 'decl').map((f) => { const ix = f.M.map((c) => c.i); return [ix[0], ix[ix.length - 1]]; });
    for (const f of fams) {
      if (f.kind !== 'num' || taken.has(f.fam) || f.n < 2 || f.density > 0.06) continue;
      const v = f.M.map((c) => c.val);
      if (!(v[0] <= 2 && v.every((x, k) => k === 0 || x === v[k - 1] + 1))) continue;
      const ix = f.M.map((c) => c.i), lo = ix[0], hi = ix[ix.length - 1];
      if (spans.some(([a, b]) => lo <= b && hi >= a)) continue;
      f.sibling = true; acc.push(f); taken.add(f.fam); spans.push([lo, hi]);
    }
  }
  // Shape-only families (titles / all-caps, no numbering) only as a last resort, strict — else a
  // dictionary's example names or an anthology's titles would hallucinate a TOC. "Last resort"
  // means no STRUCTURAL signal fired (numbered/marked/spaced) — a lone CANON family (just the
  // trailing References/See also/External links) is real signal but not a substitute for a body
  // table of contents, so it must not preempt shape: else every Wikipedia-shaped article, which
  // always carries a canonical trailer, would lose its own Biography/Childhood/… body headings to
  // the trailer alone.
  if (!acc.some((f) => f.kind === 'num' || f.kind === 'decl' || f.kind === 'gap')) {
    acc = acc.concat(fams.filter((f) => f.kind === 'shape' && f.n >= 3 && f.coverage >= 0.6 && f.cov <= 0.55 && f.density <= 0.08));
  }
  if (!acc.length) return [];
  // Rank only the nesting numbered families (a "Part" enclosing "Chapter"s) for heading level. Markup
  // and decimal carry their own depth; a disjoint sibling frame and the spacing/canonical headings sit
  // at the top level rather than inheriting a spurious sub-level from their density.
  const infs = acc.filter((f) => f.kind === 'num' && !f.sibling).sort((a, b) => a.density - b.density);
  const rank = new Map(); infs.forEach((f, r) => rank.set(f.fam, r + 1));
  const secs = [];
  for (const f of acc) for (const c of f.M) {
    const level = f.kind === 'decl' ? (c.level || 1)
      : (f.kind === 'num' && !f.sibling) ? (rank.get(f.fam) || 1)
        : 1;
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

// body → paragraph blocks + the blank-gap before each. Split on blank lines, reflow each block's hard
// wraps into one run (the reflow that makes a Gutenberg .txt read as prose), and record `gaps[i]` =
// how many blank lines preceded block i. That gap is a STRUCTURAL signal a plain-text extract carries
// and nothing else does: a Wikipedia section heading sits above a DOUBLE blank line where paragraphs
// are single-spaced, so the gap is often the only thing that marks a sentence-case heading as one.
// Returns { paras, preRaw, gaps }; when the text has NO blank lines at all (verse / a single wrapped
// column) there are no blocks, so preRaw carries the whole text for a line-preserving render.
const paragraphize = (body) => {
  const t = String(body || '').replace(/\r\n?/g, '\n');
  const parts = t.split(/(\n[ \t]*(?:\n[ \t]*)+)/);   // keep the blank-run separators to size each gap
  const paras = [], gaps = [];
  for (let i = 0; i < parts.length; i += 2) {
    const block = norm(String(parts[i] || '').replace(/\s*\n\s*/g, ' '));
    if (!block) continue;
    const sep = i > 0 ? parts[i - 1] : '';
    const blank = Math.max(1, (sep.match(/\n/g) || []).length - 1);   // blank lines in the separator
    paras.push(block); gaps.push(i === 0 ? 1 : blank);
  }
  if (paras.length <= 1) return { paras: [], preRaw: t.replace(/[ \t]+$/gm, '').trim(), gaps: [] };
  return { paras, preRaw: null, gaps };
};

// A book's OWN front matter — the shouted title page and its inline table of contents — sits in the
// body between the START marker and the first chapter, so stripGutenbergMarkers keeps it. Left in, it
// renders as furniture: the title/byline repeat the header block we already paint, and the contents
// (a "CONTENTS" line + the run of "Letter 1 Letter 2 … Chapter 24") reflow into ONE run-on paragraph
// because the enumerated entries carry no blank lines between them. The reader builds its own TOC, so
// this furniture is noise. These helpers recognise it by FORM (never a keyword list of book titles).

// A line naming a section by its kind + number: "Chapter I", "Letter 2", "Part Third". The book's own
// contents, when run onto one line, packs MANY of these; a real heading carries exactly one.
const TOC_MARKER = /\b(?:chapter|letter|part|book|canto|section|volume|stave|act|scene|epilogue|prologue)\b[ \t]+(?:[ivxlcdm]+|\d+|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/gi;
const tocMarkerCount = (s) => { const m = String(s || '').match(TOC_MARKER); return m ? m.length : 0; };
const isContentsHead = (s) => /^(?:contents|table of contents|table des matières|índice)\.?$/i.test(norm(s));
// Punctuation-folded for a forgiving title match: "MOBY-DICK;" and "Moby Dick" canon to "moby dick".
const canonLine = (s) => norm(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// trimFrontFurniture(paras, title) → the paragraphs with the book's own title page and printed table
// of contents removed. Two passes:
//   (1) a MULTI-LINE printed contents — a "CONTENTS" heading followed by a run of one-per-line
//       heading entries (Moby Dick lists all 135 chapters this way). Left in, every chapter heading
//       appears twice, doubling the family so the chapter detector's density guard rejects the whole
//       run — the "we used to extract structure, now we get none" regression — and it renders as a
//       wall of headings. Splice the block out.
//   (2) the CONTIGUOUS title-page furniture at the very top — repeated title fragments, a "by
//       <author>" byline, a stray "CONTENTS", or a run-ON contents line ("Letter 1 … Chapter 24").
//       Stop at the first real content, or a lone section heading (kept as the opening chapter).
// Form-only, never a keyword list of titles; bounded to the front so mid-book prose is never touched.
// Trims `paras` and its parallel `gaps` together so paragraph gaps stay aligned. Returns { paras, gaps }.
const trimFrontFurniture = (paras, gaps, title = '') => {
  let ps = paras, gs = gaps;
  // A contents ENTRY: a bare heading (ETYMOLOGY) or one led by a section marker (CHAPTER 42. …) — the
  // latter by marker, not lineForm, since a title like "The Whiteness of the Whale." reads as a
  // sentence lineForm would reject, breaking the run mid-list.
  const isEntry = (p) => p != null && (tocMarkerCount(p) >= 1 || lineForm(p) != null);
  const scan = Math.min(ps.length, 60);
  for (let i = 0; i < scan; i++) {
    if (!isContentsHead(ps[i])) continue;
    // Consume the printed list, but only while an entry is FOLLOWED BY another entry — so the run
    // stops before the first REAL heading (the one trailed by prose), keeping Frankenstein's opening
    // "Letter 1" while still dropping Moby Dick's 135-line chapter list.
    let j = i + 1;
    while (j < ps.length && isEntry(ps[j]) && isEntry(ps[j + 1])) j++;
    // A printed multi-line contents is a LONG consecutive run (Moby Dick lists 135). A handful of
    // heading-form lines after "CONTENTS" is not — it's the real opening (Frankenstein's run-on
    // contents is one line, then the first "Letter 1"), so only splice a genuinely long list.
    if (j - (i + 1) >= 6) { ps = ps.slice(0, i).concat(ps.slice(j)); gs = gs.slice(0, i).concat(gs.slice(j)); }
    break;
  }
  // (2) When the leading region ANNOUNCES a printed contents — a "CONTENTS" head, or a run-on list
  // that packs several section markers into one non-sentence line ("Letter 1 Letter 2 … Chapter 24")
  // — then everything from the top through that contents IS front matter: the title page above it and
  // the contents itself. Drop up to the first real section (a lone marker heading like "Letter 1") or
  // the first prose. Anchored on the contents signal, so it needs no title match — a page that never
  // announces a contents is left untouched, so ordinary articles keep their opening line.
  const announcesToc = (p) => isContentsHead(p) || (tocMarkerCount(p) >= 4 && !sentencey(p));
  const lead = Math.min(ps.length, 12);
  let cAt = -1;
  for (let k = 0; k < lead; k++) { if (announcesToc(ps[k])) { cAt = k; break; } }
  if (cAt >= 0) {
    let k = cAt + 1;
    while (k < ps.length && k < cAt + 12 && (announcesToc(ps[k]) || (tocMarkerCount(ps[k]) >= 1 && lineForm(ps[k]) == null))) k++;
    ps = ps.slice(k); gs = gs.slice(k);
  }
  // (3) Otherwise (a book with a repeated title page but no printed contents), trim the CONTIGUOUS
  // title-page furniture matched against the known title: repeated title fragments and the byline.
  const t = canonLine(title);
  const isTitleFrag = (p) => {
    const c = canonLine(p);
    if (c.length < 4 || !t || norm(p).split(' ').length > 12 || sentencey(p)) return false;
    return t === c || t.startsWith(c + ' ') || t.endsWith(' ' + c) || t.includes(' ' + c + ' ');
  };
  const isByline = (p) => /^by\s+\S/i.test(norm(p)) && norm(p).split(' ').length <= 10 && !sentencey(p);
  const furniture = (p) => isContentsHead(p) || tocMarkerCount(p) >= 3 || isTitleFrag(p) || isByline(p);
  let k = 0;
  while (k < ps.length && k < 12 && furniture(ps[k])) k++;
  return { paras: ps.slice(k), gaps: gs.slice(k) };
};

// readerModel(source) → the structured book: title/author/byline + paragraphs + detected chapters.
// `source` is the S-registry entry (needs .text; uses .title / .url / .domain / .published when
// present). Pure — no DOM, no network.
export const readerModel = (source = {}) => {
  const stripped = stripGutenbergMarkers(source.text || '');
  const { fields, body } = extractFrontMatter(stripped);
  const pg = paragraphize(body);
  const preRaw = pg.preRaw;
  const titleHint = norm(source.title || fields.title || '');
  // Drop the book's own title-page / inline contents furniture (prose only — verse/preRaw is verbatim).
  const trimmed = preRaw != null ? { paras: pg.paras, gaps: pg.gaps } : trimFrontFurniture(pg.paras, pg.gaps, titleHint);
  const paras = trimmed.paras;
  const title = norm(titleHint || (preRaw || paras[0] || body).split('\n').map(norm).find((l) => l.length > 2) || 'Untitled');
  const author = fields.author ? norm(fields.author.replace(/\s*\(.*?\)\s*$/, '')) : null;
  // The date/publication line — drop Gutenberg's "[eBook #NNNN]" note so the byline stays clean.
  const dateStr = String(source.published || fields['original publication'] || fields['release date'] || '')
    .replace(/\s*\[[^\]]*\]\s*$/, '');
  const words = (preRaw || paras.join(' ')).split(/\s+/).filter(Boolean).length;
  const sections = preRaw ? [] : detectStructure(paras, trimmed.gaps);
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
    // Entity links + cited-passage highlight ride INSIDE the book, but stay invisible until the
    // reader turns links on (html.eo-links-on, flipped live from the surface — no reload). Off, the
    // spans are plain prose so the book reads clean; on, they underline in the accent and the
    // paragraphs a citation grounds pick up a gold margin rule (the merged Document apparatus).
    '.eo-ent{color:inherit;text-decoration:none;}' +
    '.eo-links-on .eo-ent{color:var(--eo-acc);border-bottom:1px dotted var(--eo-acc);cursor:pointer;}' +
    '.eo-links-on .eo-ent:hover{background:var(--eo-flash);border-radius:3px;}' +
    '.eo-links-on p.eo-cited,.eo-links-on pre.eo-cited{border-left:3px solid #C79A3A;padding-left:14px;margin-left:-17px;}' +
    '.eo-focus{background:var(--eo-flash);border-radius:5px;box-shadow:0 0 0 6px var(--eo-flash);transition:background .5s,box-shadow .5s;}' +
    // ── CO-READING margin — the reading's OWN thoughts, in the margin of the place they belong ──
    // The reading-mode ladder (docs/co-reading.md): Paper is clean prose (margins hidden);
    // Companion shows the co-read margin-thoughts where the reader dwells; Lit is Companion plus the
    // lenses (here the Link lens — entity links on). A margin-thought is ghosted, italic, and marked
    // "mine": the FIREWALL made visible — witnessed prose is solid, the reading's own thought is
    // held open beside it, and the two never blur (it carries data-canwitness="false"). Inline-ghost
    // below the passage by default (always safe); floated into the right gutter on a wide viewport.
    '.eo-margin{display:none;}' +
    '.eo-mode-companion .eo-margin,.eo-mode-lit .eo-margin{display:block;margin:.35em 0 1.2em;padding:2px 0 2px 14px;font:italic 400 .8em/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--eo-fg2);border-left:3px solid var(--eo-rule);opacity:.92;}' +
    '.eo-margin .eo-mine{font-style:normal;font-weight:700;font-size:.72em;letter-spacing:.05em;text-transform:uppercase;color:var(--eo-acc);opacity:.72;margin-right:7px;vertical-align:1px;}' +
    '.eo-margin.strain{border-left-color:var(--eo-acc);}' +
    '@media(min-width:1320px){.eo-mode-companion .eo-margin,.eo-mode-lit .eo-margin{float:right;clear:right;width:200px;margin:0 -228px .5em 22px;border-left-width:2px;padding-left:12px;opacity:.8;transition:opacity .18s;}.eo-mode-companion .eo-margin:hover,.eo-mode-lit .eo-margin:hover{opacity:1;}}';
};

// canonText — fold smart quotes/dashes/whitespace/case so a snippet lifted off the rendered book
// matches the doc's own sentence text (shared by scrollToText and the co-reading margin matcher).
const canonText = (s) => String(s || '')
  .replace(/[‘’‚‛]/g, "'").replace(/[“”„]/g, '"')
  .replace(/[–—‒]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();

// readerHtml(model, prefs, opts) → { html, toc }. `html` is a complete <!doctype> document for an
// <iframe srcdoc>; `toc` is [{id,label,level}] for the surface's contents menu.
// `opts.segsOf(text)` — when present, the surface's entity linker: a paragraph's TEXT → a segment
// stream ([{ t:'text'|'ent', s, docId?, entId? }]), which we turn into escaped prose with .eo-ent
// spans (so the reflowed book carries the same entity links the Document view had). `opts.isCited`
// flags a paragraph a citation grounds; `opts.linksOn` bakes the initial links-visible state onto
// <html> (the surface then flips it live). Absent, the book renders as plain escaped prose exactly
// as before — the linker lives in the app (it needs the record's lexicon), never here.
export const readerHtml = (model, prefsIn = {}, opts = {}) => {
  const rp = clampReadPrefs(prefsIn);
  const toc = [];
  const segsOf = typeof opts.segsOf === 'function' ? opts.segsOf : null;
  const isCited = typeof opts.isCited === 'function' ? opts.isCited : () => false;
  // tabindex/role/aria-label make a mention a real keyboard control, not just a mouse target
  // (Mobile Reader already renders its entity segments as actual buttons — this brings the
  // desktop book reader to the same standard). tabindex follows the same initial linksOn gate
  // the eo-links-on CSS class uses; the app's toggleEntityMode flips both live together.
  const entTabIndex = opts.linksOn ? '0' : '-1';
  const inner = (t) => segsOf
    ? segsOf(t).map((sg) => (sg && sg.t === 'ent')
        ? '<span class="eo-ent" data-doc="' + escAttr(sg.docId) + '" data-ent="' + escAttr(sg.entId) + '" tabindex="' + entTabIndex + '" role="link" aria-label="' + escAttr(String(sg.s || '') + ' — open entity profile') + '">' + esc(sg.s) + '</span>'
        : esc(sg && sg.s != null ? sg.s : '')).join('')
    : esc(t);
  const citedCls = (t) => { try { return isCited(t) ? ' eo-cited' : ''; } catch { return ''; } };
  let bodyHtml;
  if (model.preRaw != null) {
    // No paragraph structure to find (verse / a single wrapped column) — keep every line break.
    bodyHtml = '<pre class="eo-raw' + citedCls(model.preRaw) + '">' + inner(model.preRaw) + '</pre>';
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
        if (hit.s.kind === 'heading' || titleish(t)) { parts.push('<h2 class="' + cls + '" id="' + id + '" data-para="' + i + '"' + ind + '>' + esc(disp) + '</h2>'); chapStart = true; return; }
        parts.push('<p id="' + id + '" data-para="' + i + '" class="eo-first' + citedCls(t) + '">' + inner(t) + '</p>'); chapStart = false; return;
      }
      const cls = ((chapStart ? 'eo-first' : '') + citedCls(t)).trim();
      parts.push('<p id="eo-p-' + i + '" data-para="' + i + '"' + (cls ? ' class="' + cls + '"' : '') + '>' + inner(t) + '</p>'); chapStart = false;
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
  const html = '<!doctype html><html' + (opts.linksOn ? ' class="eo-links-on"' : '') + '><head><meta charset="utf-8"><base target="_blank">' +
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
    const canon = canonText;
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

// ── CO-READING DOM helpers — the reading-mode ladder + the margin (docs/co-reading.md) ────────
// The surface calls these against the mounted reader iframe (same-origin, scriptless), exactly as
// it calls applyThemeVars / scrollToText. The ENGINE decides WHAT the reading catches on (app.coRead*
// over the firewalled deep reader); these only PRESENT it — set the mode, read the position signal,
// lay the ghosted notes. No engine logic here, and every one is try/caught so a detached frame is a
// no-op, never a throw.

// The blocks a reader's eye and a margin note anchor to — prose leaves, not chrome.
const READ_BLOCKS = 'p,li,blockquote,pre,h2,dd,dt';

// applyReadingMode(doc, mode, { links }) — set the reading-mode body class (paper|companion|lit).
// Lit also lights the Link lens (entity links on); `links` carries the standalone Links-toggle state
// so LEAVING Lit restores it rather than forcing links off. Paper hides the margin entirely.
export const applyReadingMode = (doc, mode = 'paper', { links = false } = {}) => {
  try {
    const b = doc && doc.body; if (!b) return;
    const m = ['paper', 'companion', 'lit'].includes(mode) ? mode : 'paper';
    b.classList.remove('eo-mode-paper', 'eo-mode-companion', 'eo-mode-lit');
    b.classList.add('eo-mode-' + m);
    doc.documentElement.classList.toggle('eo-links-on', m === 'lit' || !!links);
  } catch { /* iframe not reachable */ }
};

// topVisibleText(doc) — the reading text at the top of the viewport: the first prose block still
// below the fold. This is co-reading's POSITION signal (where the eye has settled), handed to
// app.coReadHere as TEXT because the reflowed book carries no sentence index. '' when nothing is in view.
export const topVisibleText = (doc) => {
  try {
    const win = doc && doc.defaultView; if (!win || !doc.body) return '';
    const fold = 84;                                    // a little below the top edge — the line being read
    for (const el of doc.body.querySelectorAll(READ_BLOCKS)) {
      const r = el.getBoundingClientRect();
      if (r.bottom > fold && r.top < win.innerHeight) return (el.textContent || '').trim().slice(0, 180);
    }
    return '';
  } catch { return ''; }
};

// renderMarginNotes(doc, notes) — lay the reading's own thoughts in the margin of the places they
// belong. Each note { anchorText, note, verdict, id } is matched to the block it hangs beside (the
// same canon text-match scrollToText uses, retried on shorter prefixes) and a ghosted <aside> is
// inserted before it, marked "mine" and carrying data-canwitness="false" — the firewall, made
// visible. Idempotent: it clears the prior notes first, so a refresh re-lays cleanly. A note whose
// anchor is not on the page (scrolled-away / not rendered) is skipped, never thrown. Returns the count laid.
export const renderMarginNotes = (doc, notes = []) => {
  try {
    if (!doc || !doc.body) return 0;
    for (const old of doc.body.querySelectorAll('aside.eo-margin')) old.remove();
    if (!notes.length) return 0;
    const leaves = [...doc.body.querySelectorAll(READ_BLOCKS)];
    const findBlock = (text) => {
      const full = canonText(text); if (full.length < 8) return null;
      const at = (len) => { const n = full.slice(0, len); if (n.length < 8) return null; for (const el of leaves) if (canonText(el.textContent).indexOf(n) >= 0) return el; return null; };
      return at(60) || at(36) || at(20);
    };
    let placed = 0; const used = new Set();
    for (const n of notes) {
      if (!n || !n.note || !n.anchorText) continue;
      const el = findBlock(n.anchorText); if (!el || used.has(el)) continue;   // one note per block
      used.add(el);
      const aside = doc.createElement('aside');
      aside.className = 'eo-margin' + (n.verdict === 'strain' ? ' strain' : '');
      aside.setAttribute('data-canwitness', 'false');   // the firewall — never the witnessed text
      if (n.id) aside.setAttribute('data-refl', String(n.id));
      const mine = doc.createElement('span'); mine.className = 'eo-mine'; mine.textContent = 'mine';
      aside.appendChild(mine);
      aside.appendChild(doc.createTextNode(String(n.note)));
      el.parentNode.insertBefore(aside, el);
      placed++;
    }
    return placed;
  } catch { return 0; }
};

// ── the LIVE-SITE view — the real page, made to read like ours ───────────────────────────────
// nativePageHtml renders the site's OWN markup (so it still looks like itself); the surface mounts
// it in a same-origin sandboxed iframe (scripts stripped, no allow-scripts) and calls
// decorateNativeDoc once the DOM is in. That lays the same reading layer the Reader bakes into the
// reflowed book — clickable entity links, the cited-passage rule, a scroll-to-passage flash target,
// and a contents list from the page's own headings — but onto the page's real DOM. It mutates the
// passed document in place, and is idempotent per document (flags on the doc guard each pass), so a
// re-fire of the ref callback (a live "Links" toggle, a re-render) never double-wraps.

// #rrggbb (or #rgb) → rgba() with alpha — for the injected highlight tints.
const hexA = (hex, a) => {
  const h = String(hex || '').replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(n.slice(0, 2), 16) || 0, g = parseInt(n.slice(2, 4), 16) || 0, b = parseInt(n.slice(4, 6), 16) || 0;
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
};
// The reading-layer CSS for a live page — the site carries none of its own, so inject it, keyed to
// the accent and gated on html.eo-links-on (the "Links" toggle), matching readerCss's rules so the
// click delegate + scrollToText flash behave exactly as they do in the reader.
const nativeLayerCss = (accent) => (
  '.eo-ent{border-radius:2px;transition:background .12s}' +
  '.eo-links-on .eo-ent{cursor:pointer;color:' + accent + ';border-bottom:1px dotted ' + hexA(accent, 0.85) + '}' +
  '.eo-links-on .eo-ent:hover{background:' + hexA(accent, 0.13) + '}' +
  // in-app navigable links (same-site hrefs) — a soft accent underline so the "Links" toggle makes
  // the whole page read as clickable, and a hover lift that says "this follows in place, and records".
  '.eo-links-on a[href]{cursor:pointer}' +
  '.eo-links-on .eo-nav{text-decoration:none;box-shadow:inset 0 -1px 0 ' + hexA(accent, 0.5) + ';transition:box-shadow .12s,background .12s}' +
  '.eo-links-on .eo-nav:hover{box-shadow:inset 0 -2px 0 ' + accent + ';background:' + hexA(accent, 0.08) + '}' +
  '.eo-cited{scroll-margin-top:22px;border-radius:0 6px 6px 0;transition:background .2s,box-shadow .2s}' +
  '.eo-links-on .eo-cited{background:' + hexA('#C79A3A', 0.13) + ';box-shadow:inset 3px 0 0 #C79A3A}' +
  '.eo-focus{background:' + hexA(accent, 0.16) + ';box-shadow:0 0 0 5px ' + hexA(accent, 0.16) + ';border-radius:3px;transition:background .5s,box-shadow .5s}'
);
// A node in the article body, not the site chrome (nav/masthead/footer). Shared by both passes.
const eoInChrome = (el) => !!(el && el.closest && el.closest('nav,header,footer,aside,[role="navigation"],[role="banner"],[role="contentinfo"]'));
// registrable-ish domain (last two labels of the host, www dropped) — npr.org for www.npr.org.
const regDomain = (u) => { try { const h = new URL(u).hostname.replace(/^www\./, '').toLowerCase(); return h.split('.').slice(-2).join('.'); } catch { return ''; } };

export const decorateNativeDoc = (doc, {
  segsOf = null, isCited = null, accent = READ_ACCENT, linksOn = true, maxNodes = 20000, maxWraps = 8000,
  pageUrl = '',
} = {}) => {
  const out = { toc: [], entWraps: 0, cited: 0, navLinks: 0 };
  try {
    if (!doc || !doc.body) return out;
    // 1) styles — id-stable, rewritten each pass so an accent change restyles without stacking.
    let sTag = doc.getElementById('__eo_native_css');
    if (!sTag) { sTag = doc.createElement('style'); sTag.id = '__eo_native_css'; (doc.head || doc.documentElement).appendChild(sTag); }
    sTag.textContent = nativeLayerCss(accent);
    try { doc.documentElement.classList.toggle('eo-links-on', !!linksOn); } catch { /* no root */ }

    // 2) contents — from the page's OWN headings (skip chrome, dedupe by text, cap at 80). Each keeps
    // its existing id or gets an eo-ch-N one, so the surface's scrollToAnchor drives it like the
    // reader's TOC. Computed once per document and memoised on it.
    if (doc.__eoNativeToc) { out.toc = doc.__eoNativeToc; }
    else {
      const toc = [], seen = new Set(); let n = 0;
      doc.querySelectorAll('h1,h2,h3,h4').forEach((h) => {
        if (n >= 80 || eoInChrome(h)) return;
        const label = norm(h.textContent || '');
        if (label.length < 2 || label.length > 90) return;
        const key = label.toLowerCase(); if (seen.has(key)) return; seen.add(key);
        const lv = Math.min(3, Math.max(1, +h.tagName.slice(1) || 1));
        if (!h.id) h.id = 'eo-ch-' + n;
        toc.push({ id: h.id, label, level: lv }); n++;
      });
      out.toc = toc.length >= 2 ? toc : [];   // one lone heading is not a contents
      doc.__eoNativeToc = out.toc;
    }

    // 3) entity links — walk the visible prose and wrap known names as clickable .eo-ent spans, using
    // the record's own segment stream (segsOf) so the live page links exactly what the reader does.
    // Skip script/style/code and anything already inside a link or a prior wrap; cap the DOM work so
    // a long article can't freeze the tab. Runs once per document.
    if (segsOf && !doc.__eoNativeEnts) {
      doc.__eoNativeEnts = true;
      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const v = node.nodeValue;
          if (!v || v.length < 3 || !v.trim()) return NodeFilter.FILTER_REJECT;
          const p = node.parentNode;
          if (!p || p.nodeType !== 1) return NodeFilter.FILTER_REJECT;
          const tag = p.nodeName;
          if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEXTAREA' || tag === 'CODE' || tag === 'PRE' || tag === 'A') return NodeFilter.FILTER_REJECT;
          if (p.closest && p.closest('a,.eo-ent')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      const nodes = []; let node;
      while ((node = walker.nextNode()) && nodes.length < maxNodes) nodes.push(node);
      for (const tn of nodes) {
        if (out.entWraps > maxWraps) break;
        let segs = null; try { segs = segsOf(tn.nodeValue); } catch { segs = null; }
        if (!segs || !segs.some((sg) => sg && sg.t === 'ent')) continue;
        const frag = doc.createDocumentFragment();
        for (const sg of segs) {
          if (sg && sg.t === 'ent' && out.entWraps <= maxWraps) {
            const span = doc.createElement('span');
            span.className = 'eo-ent';
            span.setAttribute('data-doc', sg.docId == null ? '' : String(sg.docId));
            span.setAttribute('data-ent', sg.entId == null ? '' : String(sg.entId));
            // A mention only reads as a hyperlink once Links is on (the eo-links-on class
            // gates the underline/pointer in CSS); tabindex/role follow the same initial gate
            // — toggleEntityMode flips both live — so an inert span is never a stray Tab stop
            // in Links-off text, and a reachable one always has somewhere real to go.
            span.setAttribute('tabindex', linksOn ? '0' : '-1');
            span.setAttribute('role', 'link');
            span.setAttribute('aria-label', String(sg.s || '') + ' — open entity profile');
            span.textContent = sg.s; frag.appendChild(span); out.entWraps++;
          } else {
            frag.appendChild(doc.createTextNode(sg && sg.s != null ? sg.s : ''));
          }
        }
        tn.parentNode.replaceChild(frag, tn);
      }
    }

    // 3b) navigable links — tag every SAME-SITE hyperlink (its href resolves, through the injected
    // <base href>, to a page on this record's own site) as `.eo-nav`, so the "Links" toggle paints
    // the whole page as clickable and the surface's click delegate knows which anchors follow IN-APP
    // (recorded as sub-objects) versus which leave for a new tab. Off-site links keep their own look.
    // Runs once per document; the site's registrable domain comes from pageUrl (falls back to the
    // page's own <base href> when not supplied).
    if (!doc.__eoNativeNav) {
      doc.__eoNativeNav = true;
      let site = regDomain(pageUrl);
      if (!site) { try { const b = doc.querySelector('base[href]'); if (b) site = regDomain(b.href); } catch { /* no base */ } }
      if (site) {
        const anchors = doc.getElementsByTagName('a');
        for (let i = 0; i < anchors.length && out.navLinks < 6000; i++) {
          const a = anchors[i];
          const rawHref = (a.getAttribute && a.getAttribute('href')) || '';
          if (rawHref.startsWith('#')) continue;                             // an in-page anchor, not a nav
          let href = ''; try { href = a.href || ''; } catch { href = ''; }   // resolves via <base href>
          if (!/^https?:/i.test(href)) continue;
          if (regDomain(href) !== site) continue;
          a.classList.add('eo-nav'); out.navLinks++;
        }
      }
    }

    // 4) cited passages — mark the article blocks whose text the record cites, so the gold rule lands
    // on the live page too (revealed with the "Links" toggle). Runs once per document.
    if (isCited && !doc.__eoNativeCited) {
      doc.__eoNativeCited = true;
      const blocks = [...doc.body.querySelectorAll('p,li,blockquote,h1,h2,h3,h4,td,dd')];
      for (const el of blocks) {
        if (out.cited >= 200) break;
        if (eoInChrome(el)) continue;
        const t = (el.textContent || '').trim();
        if (t.length < 24) continue;
        let hit = false; try { hit = !!isCited(t); } catch { hit = false; }
        if (hit) { el.classList.add('eo-cited'); out.cited++; }
      }
    }
  } catch { /* iframe not reachable / detached */ }
  return out;
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
  note:     { label: 'the reading',      color: '#9AA6BD', hint: '# …' },
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

  const DIM = '#8B93A3', VALUE = '#ABB2BF';
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

// ── the VERBATIM PROMPT leaf — exactly what the talker was handed, byte-for-byte ─────────────
// The facing panel's leading leaf: the prompt this answer's turn actually sent to the model,
// read straight off the audit turn's own record (turn/stages.js promptText — the woven
// `role: content` messages joined blank-line-separated; app.js finishMessage stashes it on the
// message). VERBATIM is the contract: no re-derivation, no paraphrase — and no EoT colourizing,
// because the prompt is prose the talker read, and classifying its lines by operator shape
// would paint accidental meaning onto any colon or arrow the prose happens to carry. One calm
// foreground for every line; the role markers (`system:` / `user:`) take the section hue so the
// message boundaries stay scannable.
//   facingPromptLines(promptText, opts) → { lines, truncated, more, total } — the same line
//   shape ({ n, kind, color, s, segs }) and honest-cap reporting as facingReadingLines, so the
//   pane paints both leaves with one code path.
export const PROMPT_LINE_COLOR = '#ABB2BF';
export const facingPromptLines = (promptText, { max = 2400 } = {}) => {
  const all = String(promptText == null ? '' : promptText).split('\n');
  const shown = all.slice(0, max);
  const roleRe = /^(system|user|assistant):/;
  const lines = shown.map((raw, i) => {
    const kind = raw.trim() === '' ? 'blank' : 'prompt';
    const m = roleRe.exec(raw);
    const segs = m
      ? [{ s: m[0], color: EOT_ELEMENT_TYPES.rule.color, role: 'role' },
         { s: raw.slice(m[0].length), color: PROMPT_LINE_COLOR, role: 'text' }]
      : [{ s: raw === '' ? ' ' : raw, color: PROMPT_LINE_COLOR, role: 'text' }];
    return { n: i + 1, kind, color: PROMPT_LINE_COLOR, s: raw === '' ? ' ' : raw, dim: kind === 'blank', segs };
  });
  return { lines, truncated: all.length > max, more: Math.max(0, all.length - max), total: all.length };
};

// ── inline markdown OVER A SEGMENT STREAM (the settled answer) ────────────────────────────────
// The answer body is rendered per-character as `*italic*` / `**bold**` / `code`, and — once it
// settles — split into typed SEGMENTS by the entity linker and the [sN] citation chips
// (app.answerSegments). That split is the bug: an emphasised run that WRAPS an entity or a chip
// (`*Swept Away*`, where "Swept Away" is a linked entity) lands its opening `*` in one text
// segment and its closing `*` in another, so parsing each text segment in isolation never pairs
// the markers and the raw `*` shows through. This resolves emphasis (and the [no source]
// underline) ONCE across the WHOLE paragraph — entities/cites standing in as a single opaque
// placeholder each — then maps the result back onto the segments, so a marker that straddles an
// entity is honoured and the entity inside it inherits the emphasis.
//
// Pure and view-agnostic: it emits semantic MARKS (kind: ''|'code'|'strong'|'em', unsourced:bool),
// never CSS, and the surface maps marks → styles. Same emphasis grammar as the live streaming
// renderer, so a span never flips shape when the answer settles.
//   input  segsIn = [{ t:'text', s }, { t:'ent', s, … }, { t:'cite', … }, …]  (one paragraph)
//   output { pieces, opaque } — arrays indexed to segsIn:
//            pieces[i] = [{ s, kind, unsourced }]  for a text seg (markers removed), else null
//            opaque[i] = { kind, unsourced }        for an ent/cite seg, else null
const NO_SOURCE_MARK = '[no source]';
export const inlineMdMarks = (segsIn) => {
  const segs = Array.isArray(segsIn) ? segsIn : [];
  // Concatenate the paragraph: text contributes its characters, an ent/cite contributes ONE
  // object-replacement char (U+FFFC) — never a marker, never a word char, so it neither opens nor
  // breaks emphasis, but can sit INSIDE a run and inherit its style. `owner`/`off` map every
  // char in `full` back to its segment (off = −1 marks the opaque stand-in).
  let full = '';
  const owner = [], off = [];
  for (let si = 0; si < segs.length; si++) {
    const sg = segs[si];
    if (sg && sg.t === 'text') {
      const s = String(sg.s == null ? '' : sg.s);
      for (let k = 0; k < s.length; k++) { owner.push(si); off.push(k); }
      full += s;
    } else { owner.push(si); off.push(-1); full += '\uFFFC'; }
  }
  const kind = new Array(full.length).fill('');    // '' | 'code' | 'strong' | 'em'
  const under = new Array(full.length).fill(false); // the [no source] wavy underline
  const drop = new Array(full.length).fill(false);  // marker chars removed from the output

  // [no source]: the grounder trails an unsourced assertion of fact with this marker. Underline
  // the claim it trails — back to the prior sentence break — and drop the marker (and the space
  // before it, so no gap is left). The claim may itself span an entity, so this too runs over `full`.
  for (let at = full.indexOf(NO_SOURCE_MARK); at >= 0; at = full.indexOf(NO_SOURCE_MARK, at + 1)) {
    let lead = at;
    while (lead > 0 && /\s/.test(full[lead - 1])) lead--;                 // trim trailing space off the claim
    const inner = full.slice(0, Math.max(0, lead - 1));                   // …minus the claim's own terminal punct
    const brk = Math.max(inner.lastIndexOf('. '), inner.lastIndexOf('! '), inner.lastIndexOf('? '), inner.lastIndexOf('\n'));
    const from = brk >= 0 ? brk + 2 : 0;
    for (let i = from; i < lead; i++) under[i] = true;
    for (let i = lead; i < at + NO_SOURCE_MARK.length; i++) drop[i] = true;
  }

  // Emphasis: the SAME left-to-right, non-nesting grammar the live renderer uses — `code` first
  // (its content is opaque to bold/italic), then **bold**/__bold__, then *italic*/_italic_ guarded
  // so an intra-word `_` or a lone `*` stays literal. A matched span drops its markers and paints
  // its interior; a half-typed marker with no partner simply never matches and shows through.
  const re = /(`+)([^`]+?)\1|(\*\*|__)([\s\S]+?)\3|(?<![A-Za-z0-9])([*_])([\s\S]+?)\5(?![A-Za-z0-9])/g;
  let mm;
  while ((mm = re.exec(full)) !== null) {
    const s0 = mm.index, e0 = re.lastIndex;
    const ml = mm[1] ? mm[1].length : mm[3] ? 2 : 1;                      // marker width, both sides
    const k = mm[1] ? 'code' : mm[3] ? 'strong' : 'em';
    for (let i = s0; i < s0 + ml; i++) drop[i] = true;
    for (let i = e0 - ml; i < e0; i++) drop[i] = true;
    for (let i = s0 + ml; i < e0 - ml; i++) kind[i] = k;                  // last match wins (non-nesting)
  }

  // Map back onto the segments, coalescing adjacent same-mark characters into one piece.
  const pieces = segs.map((sg) => (sg && sg.t === 'text') ? [] : null);
  const opaque = segs.map(() => null);
  for (let i = 0; i < full.length; i++) {
    const si = owner[i];
    if (off[i] < 0) { opaque[si] = { kind: kind[i], unsourced: under[i] }; continue; }
    if (drop[i]) continue;
    const arr = pieces[si], top = arr[arr.length - 1];
    if (top && top.kind === kind[i] && top.unsourced === under[i]) top.s += full[i];
    else arr.push({ s: full[i], kind: kind[i], unsourced: under[i] });
  }
  return { pieces, opaque };
};

// ── kind-aware Native-tab rendering — split into sibling modules (doc-kind.js,
// markdown-render.js, data-render.js, code-highlight.js, native-render.js) and re-exported
// here so the surface's one membrane (window.EO.readerRender) still reaches everything the
// source viewer's tabs need, without this file growing into the dispatcher itself.
export { renderKindOf, isNativelyRenderable, RENDER_KINDS } from './doc-kind.js';
export { renderNativeKindHtml } from './native-render.js';
