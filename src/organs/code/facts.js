// EO: SEG·SIG·INS(Void → Field,Entity, Dissecting,Tending,Making) — structural reading: source → code facts
// The structural reading — source code → normalized CODE FACTS.
//
// This is the organ's PARSER MEMBRANE. Everything downstream (the EOT lowering, the
// dependency order, the issue fold) consumes only the fact shape this module emits —
// never the raw text — so the extractor is swappable per language. The built-in
// extractor is a hand-rolled STRUCTURAL reader for JavaScript / ES modules (the
// engine's own language, which makes the body self-readable): a comment/string/
// template/regex-aware scrub, a brace-derived scope tree, and statement-shape scans.
// It recovers structure, not color — declarations, bindings, references, scopes,
// imports/exports — the shape the EO lowering needs, at the grain a linter reasons at.
//
// Parser lineages (grammar trees vs. scope tokenizers): a grammar-tree provider
// (tree-sitter compiled to WASM, or Lezer) yields a real CST and slots in here by
// producing the same facts via registerExtractor(lang, fn) — the organ's laws never
// change. The built-in stays the zero-dependency default so the organ runs everywhere
// the engine runs (browser + node, no build), in the same house style as
// organs/in/code.js, whose scrub/brace primitives this deepens.
//
// KNOWN LIMITS of the built-in (documented, not silent): no JSX; `with` unsupported;
// labels are skipped (not read as references); object-literal `{` vs block `{` is
// decided by the preceding token (a `case x: { … }` block after the colon reads as an
// object — harmless: object groups still nest scopes below them); expression-bodied
// arrow params register in the ENCLOSING scope (over-wide: never fabricates an issue,
// may miss a shadow); `eval` and dynamic property access are invisible, as they are to
// any static reading.

// ── signs: identifiers and paths on the EOT alphabet ──────────────────────────────
// An EOT NAMECHAR is ALPHA|DIGIT|_|- (`:` is the namespace separator, `.` the field
// path), so JS names (which may carry `$`) and file paths fold onto that alphabet.
export const seg = (s) => {
  const out = String(s ?? '').replace(/[^A-Za-z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  return out || 'anon';
};

// NAME positions keep their underscores verbatim — `_pop` and `pop`, `band_` and
// `band` are DIFFERENT bindings, and a sign that folded them together would let the
// fold resolve one onto the other. Only `$` (not in the EOT alphabet) is folded.
export const nameSeg = (s) => {
  const out = String(s ?? '').replace(/[^A-Za-z0-9_-]/g, '_');
  return out || 'anon';
};

// A module's sign segment comes from its WHOLE path (not the basename): a corpus has
// many `index.js`. `src/organs/code/facts.js` → `src-organs-code-facts`.
export const modSeg = (path) => {
  const cleaned = String(path ?? 'module')
    .replace(/^\.\//, '')
    .replace(/\.[A-Za-z]+$/, '')
    .replace(/[\\/]+/g, '-')
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .replace(/^[-_]+|[-_]+$/g, '');
  return cleaned || 'module';
};

// Resolve an import specifier against the importer's path — pure path arithmetic,
// no filesystem. Relative specs join and normalize; bare specs are external.
export const resolveSpec = (fromPath, spec) => {
  const s = String(spec ?? '');
  if (!s.startsWith('./') && !s.startsWith('../')) return { external: true, path: s };
  const base = String(fromPath ?? '').split('/').slice(0, -1);
  const parts = [...base];
  for (const p of s.split('/')) {
    if (p === '' || p === '.') continue;
    if (p === '..') parts.pop();
    else parts.push(p);
  }
  return { external: false, path: parts.join('/') };
};

// ── the scrub — comments, strings, templates, regex literals ──────────────────────
// Blank comment and string interiors so the structural scans never match inside them.
// Newlines survive (line numbers hold); removed chars become spaces (offsets hold).
// Beyond organs/in/code.js's scrub, this one: (a) KEEPS template-interpolation code
// (`${…}` bodies are real code with real references), and (b) recognizes REGEX
// literals by prior-token context — this codebase is regex-heavy, and an unrecognized
// `/["{]/` would derail every scan after it.
const REGEX_BEFORE = new Set(['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'do', 'else', 'yield', 'await', 'instanceof', 'new']);
const regexCanFollow = (ch, word) => {
  if (word) return REGEX_BEFORE.has(word);
  return ch === '' || '=(,[!&|?:;{}~+-*%<>^'.includes(ch);
};

export const scrub = (src, { keepStrings = false } = {}) => {
  const out = [];
  let i = 0;
  const n = src.length;
  let state = 'code';                 // code | line | block | sq | dq | tpl
  const tplStack = [];                // brace depths where an open ${ returns to tpl
  let depth = 0;                      // brace depth (for the tpl returns only)
  let lastSig = '';                   // last significant char emitted in code state
  let lastWord = '';                  // trailing identifier token, for regex context
  const blank = (c) => (c === '\n' ? '\n' : c === '\t' ? '\t' : ' ');

  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (state === 'code') {
      if (c === '/' && d === '/') { out.push('  '); i += 2; state = 'line'; continue; }
      if (c === '/' && d === '*') { out.push('  '); i += 2; state = 'block'; continue; }
      if (c === '/' && regexCanFollow(lastSig, lastWord)) {
        // a regex literal: consume to the unescaped closing /, honouring [...] classes
        let j = i + 1, inClass = false, ok = false;
        for (; j < n; j++) {
          const r = src[j];
          if (r === '\\') { j++; continue; }
          if (r === '\n') break;                       // no raw newline in a regex
          if (r === '[') inClass = true;
          else if (r === ']') inClass = false;
          else if (r === '/' && !inClass) { ok = true; break; }
        }
        if (ok) {
          let k = j + 1;
          while (k < n && /[a-z]/i.test(src[k])) k++;  // flags
          for (let m = i; m < k; m++) out.push(' ');
          i = k; lastSig = '/'; lastWord = '';
          continue;
        }
        // fall through: it was a division after all
      }
      if (c === "'") { out.push(c); i++; state = 'sq'; lastSig = c; lastWord = ''; continue; }
      if (c === '"') { out.push(c); i++; state = 'dq'; lastSig = c; lastWord = ''; continue; }
      if (c === '`') { out.push(c); i++; state = 'tpl'; lastSig = c; lastWord = ''; continue; }
      if (c === '{') { depth++; }
      if (c === '}') {
        if (tplStack.length && depth === tplStack[tplStack.length - 1]) {
          tplStack.pop(); out.push(' '); i++; state = 'tpl'; lastSig = ''; lastWord = ''; continue;
        }
        depth--;
      }
      out.push(c); i++;
      if (!/\s/.test(c)) {
        lastSig = c;
        lastWord = /[A-Za-z0-9_$]/.test(c) ? lastWord + c : '';
      }
      continue;
    }
    if (state === 'line') {
      if (c === '\n') { out.push('\n'); i++; state = 'code'; continue; }
      out.push(blank(c)); i++; continue;
    }
    if (state === 'block') {
      if (c === '*' && d === '/') { out.push('  '); i += 2; state = 'code'; continue; }
      out.push(blank(c)); i++; continue;
    }
    if (state === 'tpl') {
      if (c === '\\') { out.push(keepStrings ? src.slice(i, i + 2) : '  '); i += 2; continue; }
      if (c === '$' && d === '{') { tplStack.push(depth); out.push('  '); i += 2; state = 'code'; lastSig = '('; lastWord = ''; continue; }
      if (c === '`') { out.push(c); i++; state = 'code'; lastSig = c; continue; }
      out.push(keepStrings ? c : blank(c)); i++; continue;
    }
    // sq | dq
    const closer = state === 'sq' ? "'" : '"';
    if (c === '\\') { out.push(keepStrings ? src.slice(i, i + 2) : '  '); i += 2; continue; }
    if (c === closer) { out.push(c); i++; state = 'code'; lastSig = c; continue; }
    out.push(keepStrings ? c : blank(c)); i++;
  }
  return out.join('');
};

// ── offsets → line/col ────────────────────────────────────────────────────────────
export const lineColIndex = (src) => {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') starts.push(i + 1);
  return (offset) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= offset) lo = mid; else hi = mid - 1; }
    return { line: lo + 1, col: offset - starts[lo] + 1 };
  };
};

// ── token helpers over the scrubbed code ──────────────────────────────────────────
const isWordChar = (c) => /[A-Za-z0-9_$]/.test(c || '');
const isWordStart = (c) => /[A-Za-z_$]/.test(c || '');

// previous significant char before offset i: { ch, at } ('' at start of file)
const prevSig = (code, i) => {
  let j = i - 1;
  while (j >= 0 && /\s/.test(code[j])) j--;
  return { ch: j >= 0 ? code[j] : '', at: j };
};
// previous token ending at-or-before offset i: a word { word, at:startOfWord } or a char
const prevToken = (code, i) => {
  const p = prevSig(code, i);
  if (p.at < 0) return { word: '', ch: '', at: -1 };
  if (!isWordChar(p.ch)) return { word: '', ch: p.ch, at: p.at };
  let s = p.at;
  while (s > 0 && isWordChar(code[s - 1])) s--;
  return { word: code.slice(s, p.at + 1), ch: '', at: s };
};
// next significant char at-or-after offset i
const nextSig = (code, i) => {
  let j = i;
  while (j < code.length && /\s/.test(code[j])) j++;
  return { ch: j < code.length ? code[j] : '', at: j };
};

// ── matching delimiters, one pass ─────────────────────────────────────────────────
const matchPairs = (code) => {
  const paren = new Map(), brace = new Map();
  const ps = [], bs = [];
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (c === '(') ps.push(i);
    else if (c === ')') { const o = ps.pop(); if (o != null) { paren.set(o, i); paren.set(i, o); } }
    else if (c === '{') bs.push(i);
    else if (c === '}') { const o = bs.pop(); if (o != null) { brace.set(o, i); brace.set(i, o); } }
  }
  return { paren, brace };
};

// ── keywords ──────────────────────────────────────────────────────────────────────
const CONTROL = new Set(['if', 'for', 'while', 'switch', 'catch']);
export const KEYWORDS = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
  'delete', 'do', 'else', 'export', 'extends', 'finally', 'for', 'function', 'if',
  'import', 'in', 'instanceof', 'new', 'of', 'return', 'super', 'switch', 'this',
  'throw', 'try', 'typeof', 'var', 'void', 'while', 'yield', 'await', 'let',
  'true', 'false', 'null',
]);
// tokens that mean "a function keyword's expression position", for decl-vs-expression
const EXPR_BEFORE = new Set(['(', '=', ':', ',', '[', '!', '&', '|', '?', '+', '-', '*', '/', '%', '<', '>', '^', '~']);
const EXPR_BEFORE_WORDS = new Set(['return', 'typeof', 'void', 'new', 'in', 'of', 'case', 'do', 'else', 'yield', 'await', 'delete']);

// ── the scope tree ────────────────────────────────────────────────────────────────
// Every `{…}` group is classified by its preceding token: a function body (fn), a
// class body (class), a control/bare block (block), a catch block with its param
// (catch) — or an object literal, which is NOT a scope but still nests groups.
// Function-ish scopes get a headStart: the `(` of their param list (or control head),
// so declarations inside the head belong to the scope the head introduces.
const classLookback = (code, i) => {
  // walk tokens back from `{`, allowing `extends`, names, dots, and one (…) hop,
  // until `class` (true) or anything that breaks the shape (false).
  let at = i;
  for (let hops = 0; hops < 8; hops++) {
    const t = prevToken(code, at);
    if (t.word === 'class') return true;
    if (t.word === 'extends' || (t.word && !KEYWORDS.has(t.word))) { at = t.at; continue; }
    if (t.ch === '.') { at = t.at; continue; }
    if (t.ch === ')') { const o = matchAt(code, t.at); if (o == null) return false; at = o; continue; }
    return false;
  }
  return false;
};
let PAIRS = null;   // module-scan-local; set by extract, used by classLookback's hop
const matchAt = (code, closeAt) => (PAIRS ? PAIRS.paren.get(closeAt) : null);

export const buildScopes = (code, pairs) => {
  PAIRS = pairs;
  const scopes = [{ id: 0, kind: 'module', parent: -1, start: 0, end: code.length, headStart: -1, ownerName: null }];
  const groups = [];                                     // enclosing non-scope groups (object/class), by span
  const groupStack = [];                                 // {kind, close}
  const paramSpans = [];                                 // {scopeId, from, to} | {scopeId, ident:offset}

  const enclosingGroup = (i) => {
    while (groupStack.length && groupStack[groupStack.length - 1].close < i) groupStack.pop();
    return groupStack.length ? groupStack[groupStack.length - 1] : null;
  };

  for (let i = 0; i < code.length; i++) {
    if (code[i] !== '{') continue;
    const close = pairs.brace.get(i) ?? code.length;
    const p = prevSig(code, i);
    let kind = null, headStart = -1, ownerName = null;

    if (p.ch === ')') {
      const open = pairs.paren.get(p.at);
      const q = prevToken(code, open ?? p.at);
      if (q.word === 'catch') { kind = 'catch'; headStart = open; if (open != null) paramSpans.push({ from: open + 1, to: p.at, pending: true }); }
      else if (CONTROL.has(q.word)) { kind = 'block'; headStart = open ?? -1; }
      else if (q.word === 'function') { kind = 'fn'; headStart = open ?? -1; if (open != null) paramSpans.push({ from: open + 1, to: p.at, pending: true }); }
      else if (q.word && !KEYWORDS.has(q.word)) {
        // `name ( … ) {` — a function declaration's name, or a method in a class/object
        let r = prevToken(code, q.at);
        if (r.ch === '*') r = prevToken(code, r.at);                 // `function* name (`
        const g = enclosingGroup(i);
        if (r.word === 'function' || r.word === 'get' || r.word === 'set' ||
            (g && (g.kind === 'class' || g.kind === 'object'))) {
          kind = 'fn'; ownerName = q.word; headStart = open ?? -1;
          if (open != null) paramSpans.push({ from: open + 1, to: p.at, pending: true });
        } else kind = 'block';
      } else kind = 'block';
    } else if (p.ch === '>' && code[p.at - 1] === '=') {
      // `… => {` — an arrow body; params are the (…) or the bare ident before =>
      kind = 'fn';
      const s = prevSig(code, p.at - 1);
      if (s.ch === ')') {
        const open = pairs.paren.get(s.at);
        headStart = open ?? -1;
        if (open != null) paramSpans.push({ from: open + 1, to: s.at, pending: true });
        // `const x = (…) => {` — the owner, for the call-graph decoration
        const before = prevToken(code, prevToken(code, open).word === 'async' ? prevToken(code, open).at : open);
        if (before.ch === '=') {
          const w = prevToken(code, before.at);
          if (w.word && !KEYWORDS.has(w.word)) ownerName = w.word;
        }
      } else if (isWordChar(s.ch)) {
        const w = prevToken(code, s.at + 1);
        headStart = w.at;
        paramSpans.push({ ident: w.at, pending: true });
      }
    } else if (isWordChar(p.ch)) {
      const w = prevToken(code, p.at + 1);
      if (w.word === 'do' || w.word === 'else' || w.word === 'try' || w.word === 'finally' || w.word === 'catch') kind = 'block';
      else if (classLookback(code, i)) kind = 'class';
      else if (EXPR_BEFORE_WORDS.has(w.word)) kind = null;              // `return { … }` — object
      else kind = null;                                                 // ident before { → object-ish
    } else if (p.ch === '' || p.ch === ';' || p.ch === '}' || p.ch === '{') {
      kind = classLookback(code, i) ? 'class' : 'block';                // statement position
    } else if (p.ch === ':' && scopeOf(scopes, i).isSwitch) {
      kind = 'block';                                                   // `case x: { … }` — a case block
    } else {
      kind = null;                                                      // `= ( , [ : ? …` → object literal
    }

    if (kind === null) {
      groupStack.push({ kind: 'object', close });
      continue;
    }
    if (kind === 'class') {
      groupStack.push({ kind: 'class', close });
    }
    // parent: innermost scope containing i
    let parent = 0;
    for (const s of scopes) if (i > s.start && close <= s.end && s.id !== 0) { if (s.start >= scopes[parent].start) parent = s.id; }
    const scope = { id: scopes.length, kind, parent, start: i, end: close, headStart, ownerName,
                    isSwitch: kind === 'block' && p.ch === ')' && prevToken(code, pairs.paren.get(p.at) ?? p.at).word === 'switch' };
    scopes.push(scope);
    for (const ps of paramSpans) if (ps.pending) { ps.scopeId = scope.id; ps.pending = false; }
    groups.push(scope);
  }
  PAIRS = null;
  return { scopes, paramSpans };
};

// innermost scope containing an offset — a scope's head (its `(…)` or its bare arrow
// param) counts as inside it, so head declarations and default-value references land
// in the scope the head introduces.
export const scopeOf = (scopes, offset) => {
  let best = scopes[0];
  for (const s of scopes) {
    const start = s.headStart >= 0 ? Math.min(s.headStart, s.start) : s.start;
    if (offset > start && offset < s.end) {
      const bs = best.headStart >= 0 ? Math.min(best.headStart, best.start) : best.start;
      if (start >= bs) best = s;
    }
  }
  return best;
};
const fnScopeOf = (scopes, s) => {
  let cur = s;
  while (cur && cur.kind !== 'fn' && cur.kind !== 'module') cur = scopes[cur.parent] ?? null;
  return cur ?? scopes[0];
};

// ── pattern identifiers (destructuring, params) ───────────────────────────────────
// Collect the BOUND identifiers of a binding pattern span: object/array nesting, `…rest`,
// renames (`{a: b}` binds b, not a), defaults (`a = expr` binds a; expr's names are
// references, left to the main scan). Returns [{name, offset}].
const patternIdents = (code, from, to, { stopAtOfIn = false } = {}) => {
  const out = [];
  let depth = 0, skipInit = false, skipDepth = 0;
  let i = from;
  while (i < to) {
    const c = code[i];
    if (c === '{' || c === '[' || c === '(') { depth++; i++; continue; }
    if (c === '}' || c === ']' || c === ')') {
      if (depth === 0 && c === ')') break;
      depth--;
      if (skipInit && depth < skipDepth) skipInit = false;   // the group holding the default closed
      i++; continue;
    }
    if (skipInit) {
      if (c === ',' && depth <= skipDepth) skipInit = false;
      i++; continue;
    }
    if (c === '=' && code[i + 1] !== '=' && code[i + 1] !== '>' && code[i - 1] !== '=' && code[i - 1] !== '!' && code[i - 1] !== '<' && code[i - 1] !== '>') {
      skipInit = true; skipDepth = depth; i++; continue;
    }
    if (isWordStart(c)) {
      let j = i;
      while (j < to && isWordChar(code[j])) j++;
      const word = code.slice(i, j);
      if (stopAtOfIn && depth === 0 && (word === 'of' || word === 'in')) return { idents: out, endedAt: i };
      if (!KEYWORDS.has(word)) {
        const before = prevSig(code, i);
        const after = nextSig(code, j);
        const renameKey = after.ch === ':' && code[after.at + 1] !== ':';   // `{a: b}` — a is the key
        // a single `.` is a member position (not a binding); `...rest` DOES bind
        const isRest = before.ch === '.' && code[before.at - 1] === '.' && code[before.at - 2] === '.';
        const dotted = before.ch === '.' && !isRest;
        if (!dotted && !renameKey) out.push({ name: word, offset: i, isRest });
      }
      i = j; continue;
    }
    i++;
  }
  return { idents: out, endedAt: to };
};

// ── the extractor ─────────────────────────────────────────────────────────────────
// extractFacts(src, { path }) → the fact shape every downstream layer reads:
//   module      { sign, path, lang }
//   scopes      [{ id, kind, parent, ownerName }]
//   decls       [{ name, declKind, line, col, scopeId, exported, hoisted }]   (bindings)
//   members     [{ name, kind, line, col, className }]                        (methods/fields)
//   imports     [{ local, imported, spec, line, col }]
//   exports     [{ name, local, from, sourceName, line }]
//   edges       [{ spec, kind }]                                  (module-grain imports)
//   uses        [{ name, line, col, scopeId, kind: use|asg|upd, guard, call }]
//   calls       [{ fromName, toName }]                            (same-module, decoration)
const LANG_BY_EXT = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  py: 'python', pyi: 'python',
};

export const extractFacts = (src, { path = null } = {}) => {
  const text = String(src ?? '').replace(/^﻿/, '');
  const code = scrub(text);
  const withStrings = scrub(text, { keepStrings: true });
  const pairs = matchPairs(code);
  const at = lineColIndex(code);
  const ext = (/\.([A-Za-z]+)$/.exec(String(path ?? '')) || [])[1]?.toLowerCase() ?? 'js';
  const module = { sign: modSeg(path ?? 'module'), path: path ?? null, lang: LANG_BY_EXT[ext] ?? 'javascript' };

  const { scopes, paramSpans } = buildScopes(code, pairs);
  // a VIRTUAL scope (expression arrow, brace-less for) is carved after the brace walk,
  // so brace scopes its span contains still point past it — re-hang them on it, or a
  // reference inside `for (const u of xs) ys.forEach(v => { use(u); })` skips the very
  // scope that binds u.
  const adoptChildren = (sc) => {
    for (const s of scopes) {
      if (s === sc || s.id === 0) continue;
      if (s.start > sc.start && s.end <= sc.end && s.parent === sc.parent) s.parent = sc.id;
    }
  };
  const declaredAt = new Set();          // offsets that are binding-name positions, not references
  const skipSpans = [];                  // [from,to) spans the reference scan must not read
  const decls = [];
  const members = [];
  const imports = [];
  const exportsList = [];
  const edges = [];
  const uses = [];
  const exportedDeclAt = new Set();      // offsets where `export <decl>` marks the decl exported

  const inSkip = (o) => skipSpans.some(([f, t]) => o >= f && o < t);
  const pushDecl = (name, offset, declKind, scopeId, { hoisted = false, exported = false, setAside = false } = {}) => {
    declaredAt.add(offset);
    const { line, col } = at(offset);
    decls.push({ name, declKind, line, col, offset, scopeId, exported, hoisted, setAside });
    return decls[decls.length - 1];
  };

  // — params (from the scope build) —
  for (const ps of paramSpans) {
    if (ps.scopeId == null) continue;
    if (ps.ident != null) {
      let j = ps.ident;
      while (j < code.length && isWordChar(code[j])) j++;
      pushDecl(code.slice(ps.ident, j), ps.ident, 'param', ps.scopeId, { hoisted: true });
    } else {
      for (const id of patternIdents(code, ps.from, ps.to).idents) pushDecl(id.name, id.offset, 'param', ps.scopeId, { hoisted: true });
    }
  }

  // — expression-bodied arrows (`x => expr`, `(a, b) => expr`) have no brace, so the
  // scope build never saw them. Carve a VIRTUAL fn scope over the expression span —
  // deferral laws must hold (a reference inside an arrow is not a top-level read) —
  // and register the params into it. The body ends where the enclosing group resumes:
  // a `,`, `;`, or a closer at the arrow's own depth.
  const arrowRe = /=>/g;
  for (let m; (m = arrowRe.exec(code)); ) {
    const nx = nextSig(code, m.index + 2);
    if (nx.ch === '{') continue;                                   // braced: the scope build owns it
    let end = code.length, depth = 0;
    for (let i = m.index + 2; i < code.length; i++) {
      const c = code[i];
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') { if (depth === 0) { end = i; break; } depth--; }
      else if ((c === ',' || c === ';') && depth === 0) { end = i; break; }
    }
    const p = prevSig(code, m.index);
    let headStart = -1, paramSpan = null, paramIdent = null;
    if (p.ch === ')') {
      const open = pairs.paren.get(p.at);
      if (open != null) { headStart = open; paramSpan = [open + 1, p.at]; }
    } else if (isWordChar(p.ch)) {
      const w = prevToken(code, p.at + 1);
      if (w.word && !KEYWORDS.has(w.word)) { headStart = w.at; paramIdent = w; }
    }
    const parent = scopeOf(scopes, m.index).id;
    const sc = { id: scopes.length, kind: 'fn', parent, start: m.index, end, headStart, ownerName: null };
    scopes.push(sc);
    adoptChildren(sc);
    if (paramSpan) {
      for (const id of patternIdents(code, paramSpan[0], paramSpan[1]).idents) {
        if (!declaredAt.has(id.offset)) pushDecl(id.name, id.offset, 'param', sc.id, { hoisted: true });
      }
    } else if (paramIdent && !declaredAt.has(paramIdent.at)) {
      pushDecl(paramIdent.word, paramIdent.at, 'param', sc.id, { hoisted: true });
    }
  }

  // — imports / exports (hand-parsed; their statement spans are reference-silent) —
  const readClauseNames = (from, to) => {
    // `{ a, b as c, default as d }` → [{imported, local, localOffset}]
    const outNames = [];
    for (const part of splitTop(code, from, to)) {
      const m = /^\s*([A-Za-z_$][\w$]*|default)(?:\s+as\s+([A-Za-z_$][\w$]*))?\s*$/.exec(code.slice(part[0], part[1]));
      if (!m) continue;
      const local = m[2] ?? m[1];
      const localOffset = part[0] + code.slice(part[0], part[1]).lastIndexOf(local);
      outNames.push({ imported: m[1], local, localOffset });
    }
    return outNames;
  };
  const splitTop = (codeStr, from, to) => {
    const partsOut = []; let s = from, depth = 0;
    for (let i = from; i < to; i++) {
      const c = codeStr[i];
      if (c === '{' || c === '[' || c === '(') depth++;
      else if (c === '}' || c === ']' || c === ')') depth--;
      else if (c === ',' && depth === 0) { partsOut.push([s, i]); s = i + 1; }
    }
    partsOut.push([s, to]);
    return partsOut;
  };
  const stringLitAt = (o) => {
    // read a quoted literal from the string-preserving scrub at-or-after offset o
    const s = nextSig(withStrings, o);
    if (s.ch !== "'" && s.ch !== '"') return null;
    const q = s.ch;
    let j = s.at + 1;
    while (j < withStrings.length && withStrings[j] !== q) { if (withStrings[j] === '\\') j++; j++; }
    return { value: withStrings.slice(s.at + 1, j), end: j + 1 };
  };

  const importRe = /\bimport\b/g;
  for (let m; (m = importRe.exec(code)); ) {
    const start = m.index;
    if (prevSig(code, start).ch === '.') continue;                      // foo.import — not ours
    let i = m.index + 6;
    let n1 = nextSig(code, i);
    if (n1.ch === '(') {                                                // dynamic import('spec')
      const lit = stringLitAt(n1.at + 1);
      if (lit) edges.push({ spec: lit.value, kind: 'dynamic' });
      continue;
    }
    if (n1.ch === '.') continue;                                        // import.meta
    if (n1.ch === "'" || n1.ch === '"') {                               // import 'spec' — side effect
      const lit = stringLitAt(n1.at);
      if (lit) { edges.push({ spec: lit.value, kind: 'import' }); skipSpans.push([start, lit.end]); }
      continue;
    }
    // clause: [default][, * as ns][, {names}] from 'spec'
    const bound = [];
    let j = n1.at;
    for (let guard = 0; guard < 6; guard++) {
      const t = nextSig(code, j);
      if (t.ch === '*') {
        const asTok = nextSig(code, t.at + 1);                          // `as`
        const nsStart = nextSig(code, asTok.at + 2).at;
        let k = nsStart; while (k < code.length && isWordChar(code[k])) k++;
        bound.push({ imported: '*', local: code.slice(nsStart, k), localOffset: nsStart });
        j = k;
      } else if (t.ch === '{') {
        const close = pairs.brace.get(t.at) ?? t.at;
        bound.push(...readClauseNames(t.at + 1, close));
        j = close + 1;
      } else if (isWordStart(t.ch)) {
        let k = t.at; while (k < code.length && isWordChar(code[k])) k++;
        const word = code.slice(t.at, k);
        if (word === 'from') { j = k; break; }
        bound.push({ imported: 'default', local: word, localOffset: t.at });
        j = k;
      } else break;
      const c2 = nextSig(code, j);
      if (c2.ch === ',') { j = c2.at + 1; continue; }
      const f = nextSig(code, j);
      if (isWordStart(f.ch)) { let k = f.at; while (k < code.length && isWordChar(code[k])) k++; if (code.slice(f.at, k) === 'from') { j = k; } }
      break;
    }
    const lit = stringLitAt(j);
    if (!lit) continue;
    edges.push({ spec: lit.value, kind: 'import' });
    skipSpans.push([start, lit.end]);
    for (const b of bound) {
      pushDecl(b.local, b.localOffset, 'import', 0, { hoisted: true });
      // line/col are the BINDING's own position (a clause can span lines), so the
      // lowering finds the decl it belongs to and the sign carries the real site
      imports.push({ local: b.local, imported: b.imported, spec: lit.value, ...at(b.localOffset) });
    }
  }

  const exportRe = /\bexport\b/g;
  for (let m; (m = exportRe.exec(code)); ) {
    const start = m.index;
    if (prevSig(code, start).ch === '.') continue;
    const { line } = at(start);
    const n1 = nextSig(code, start + 6);
    if (n1.ch === '{') {
      const close = pairs.brace.get(n1.at) ?? n1.at;
      const names = readClauseNames(n1.at + 1, close);
      // `from 'spec'`? → re-export (reference-silent); else the locals are USES
      const f = nextSig(code, close + 1);
      let fromSpec = null;
      if (isWordStart(f.ch)) {
        let k = f.at; while (k < code.length && isWordChar(code[k])) k++;
        if (code.slice(f.at, k) === 'from') { const lit = stringLitAt(k); if (lit) { fromSpec = lit.value; skipSpans.push([start, lit.end]); } }
      }
      if (fromSpec != null) {
        edges.push({ spec: fromSpec, kind: 'reexport' });
        for (const nm of names) exportsList.push({ name: nm.local, local: null, from: fromSpec, sourceName: nm.imported, line });
      } else {
        skipSpans.push([start, close + 1]);
        for (const nm of names) {
          exportsList.push({ name: nm.local, local: nm.imported, from: null, sourceName: null, line });
          const o = part0Offset(code, n1.at + 1, close, nm.imported);
          if (o >= 0) uses.push({ name: nm.imported, ...at(o), offset: o, scopeId: scopeOf(scopes, o).id, kind: 'use', guard: false, call: false, exportRef: true });
        }
      }
      continue;
    }
    if (n1.ch === '*') {
      // export * from 'spec' | export * as ns from 'spec'
      let j = n1.at + 1;
      let nsName = null;
      const t = nextSig(code, j);
      if (isWordStart(t.ch)) {
        let k = t.at; while (k < code.length && isWordChar(code[k])) k++;
        if (code.slice(t.at, k) === 'as') {
          const s2 = nextSig(code, k); let k2 = s2.at; while (k2 < code.length && isWordChar(code[k2])) k2++;
          nsName = code.slice(s2.at, k2); j = k2;
        }
      }
      const f = nextSig(code, j);
      let k = f.at; while (k < code.length && isWordChar(code[k])) k++;
      const lit = code.slice(f.at, k) === 'from' ? stringLitAt(k) : null;
      if (lit) {
        edges.push({ spec: lit.value, kind: 'reexport' });
        exportsList.push({ name: nsName ?? '*', local: null, from: lit.value, sourceName: '*', line });
        skipSpans.push([start, lit.end]);
      }
      continue;
    }
    if (isWordStart(n1.ch)) {
      let k = n1.at; while (k < code.length && isWordChar(code[k])) k++;
      const word = code.slice(n1.at, k);
      if (word === 'default') {
        skipSpans.push([start, k]);
        // `export default function name…` / `class name…` → the decl scan finds it; link by name
        const t = nextSig(code, k);
        let hint = null;
        if (isWordStart(t.ch)) {
          let k2 = t.at; while (k2 < code.length && isWordChar(code[k2])) k2++;
          const w2 = code.slice(t.at, k2);
          if (w2 === 'function' || w2 === 'class' || w2 === 'async') {
            const nm = /(?:async\s+)?(?:function|class)\s*\*?\s*([A-Za-z_$][\w$]*)/y;
            nm.lastIndex = t.at;
            const got = nm.exec(code);
            hint = got ? got[1] : null;
          }
        }
        exportsList.push({ name: 'default', local: hint, from: null, sourceName: null, line });
        continue;
      }
      if (word === 'const' || word === 'let' || word === 'var' || word === 'function' || word === 'class' || word === 'async') {
        skipSpans.push([start, n1.at]);                 // silence only the `export` token
        exportedDeclAt.add(n1.at);                       // the decl starting here is exported
        continue;
      }
    }
  }

  // helper: offset of a clause name inside `export { … }` (first occurrence in span)
  function part0Offset(codeStr, from, to, name) {
    const re = new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`);
    const s = codeStr.slice(from, to);
    const i = s.search(re);
    return i < 0 ? -1 : from + i;
  }

  // — const / let / var (with destructuring; for-heads stop at of/in) —
  const varRe = /\b(const|let|var)\b/g;
  for (let m; (m = varRe.exec(code)); ) {
    const kw = m[1];
    const kwAt = m.index;
    if (prevSig(code, kwAt).ch === '.') continue;
    {
      // `get var() { … }` — a member NAMED var/let/const, not a declaration
      const t = prevToken(code, kwAt);
      if (t.word === 'get' || t.word === 'set') continue;
      if (nextSig(code, kwAt + kw.length).ch === '(') continue;
    }
    // a for-head whose body has NO brace never met the scope build — carve a virtual
    // block scope over head + statement, or sibling `for (const t of …) …` loops
    // would collide and the loop variable would leak into the enclosing scope.
    let forScope = null;
    {
      const p = prevSig(code, kwAt);
      if (p.ch === '(') {
        let t = prevToken(code, p.at);
        if (t.word === 'await') t = prevToken(code, t.at);
        if (t.word === 'for') {
          const close = pairs.paren.get(p.at);
          if (close != null && nextSig(code, close + 1).ch !== '{') {
            let end = code.length, depth = 0;
            for (let i = close + 1; i < code.length; i++) {
              const c = code[i];
              if (c === '(' || c === '[' || c === '{') depth++;
              else if (c === ')' || c === ']' || c === '}') {
                if (depth === 0) { end = i; break; }
                depth--;
                // a `}` returning to depth 0 closes the body's own block statement
                // (`for (…) if (…) { … }`) — the loop ends WITH it, or the next
                // statement would be swallowed into the loop's scope
                if (c === '}' && depth === 0) { end = i + 1; break; }
              }
              else if (c === ';' && depth === 0) { end = i + 1; break; }
            }
            forScope = { id: scopes.length, kind: 'block', parent: scopeOf(scopes, p.at).id, start: p.at, end, headStart: -1, ownerName: null };
            scopes.push(forScope);
            adoptChildren(forScope);
          }
        }
      }
    }
    const scope0 = forScope ?? scopeOf(scopes, kwAt + kw.length);
    const scopeId = kw === 'var' ? fnScopeOf(scopes, scope0).id : scope0.id;
    const exported = exportedDeclAt.has(kwAt);
    // span: to `;` at depth 0, a top-level of/in (for-heads), or an unbalanced `)`
    let end = code.length, depth = 0;
    for (let i = kwAt + kw.length; i < code.length; i++) {
      const c = code[i];
      if (c === '{' || c === '[' || c === '(') depth++;
      else if (c === '}' || c === ']') { if (depth === 0) { end = i; break; } depth--; }
      else if (c === ')') { if (depth === 0) { end = i; break; } depth--; }
      else if (c === ';' && depth === 0) { end = i; break; }
      else if (c === '\n' && depth === 0) {
        const nx = nextSig(code, i);
        if (nx.ch && !'=,.?:+-*/%&|^<>('.includes(nx.ch)) { end = i; break; }
      }
    }
    const got = patternIdents(code, kwAt + kw.length, end, { stopAtOfIn: true });
    // `const { a, b, ...rest } = x` — a and b are deliberately SET ASIDE (the
    // rest-omission idiom); the dead-entity law exempts what was set aside on purpose
    const hasRest = got.idents.some((id) => id.isRest);
    for (const id of got.idents) {
      pushDecl(id.name, id.offset, kw, scopeId, { hoisted: kw === 'var', exported, setAside: hasRest && !id.isRest });
    }
  }

  // — function declarations & named function expressions —
  const fnRe = /\b(?:async\s+)?function\b/g;
  for (let m; (m = fnRe.exec(code)); ) {
    const kwAt = m.index;
    const before = prevToken(code, kwAt);
    const isExpr = EXPR_BEFORE.has(before.ch) || EXPR_BEFORE_WORDS.has(before.word);
    const nameRe = /function\s*\*?\s*([A-Za-z_$][\w$]*)?\s*\(/y;
    nameRe.lastIndex = code.indexOf('function', kwAt);
    const got = nameRe.exec(code);
    if (!got || !got[1]) continue;                                     // anonymous
    const nameAt = kwAt + code.slice(kwAt).indexOf(got[1]);
    if (isExpr) {
      // the name binds only inside its own body (self-reference)
      const parenAt = code.indexOf('(', nameAt);
      const parenClose = pairs.paren.get(parenAt);
      const braceAt = parenClose != null ? nextSig(code, parenClose + 1).at : -1;
      const own = scopes.find((s) => s.start === braceAt);
      pushDecl(got[1], nameAt, 'function', own ? own.id : scopeOf(scopes, nameAt).id, { hoisted: true });
    } else {
      const exported = exportedDeclAt.has(kwAt) || exportedDeclAt.has(m.index);
      pushDecl(got[1], nameAt, 'function', scopeOf(scopes, kwAt).id, { hoisted: true, exported });
    }
  }

  // — class declarations & their members —
  const clsRe = /\bclass\s+([A-Za-z_$][\w$]*)(?:\s+extends\s+([A-Za-z_$][\w$.]*))?/g;
  const classInfos = [];
  for (let m; (m = clsRe.exec(code)); ) {
    const kwAt = m.index;
    const before = prevToken(code, kwAt);
    const isExpr = EXPR_BEFORE.has(before.ch) || EXPR_BEFORE_WORDS.has(before.word);
    const nameAt = kwAt + m[0].indexOf(m[1], 5);
    const exported = exportedDeclAt.has(kwAt);
    pushDecl(m[1], nameAt, 'class', isExpr ? scopeOf(scopes, nameAt).id : scopeOf(scopes, kwAt).id, { exported });
    classInfos.push({ name: m[1], extendsName: m[2] ?? null, at: kwAt });
  }
  // members: method and field names at class-body top depth (declaredAt-skipped for
  // the reference scan, recorded for the graph — they are properties, not bindings)
  const classBodies = [];
  {
    // class groups were recorded as groupStack entries during buildScopes; recover by shape:
    const bodyRe = /\bclass\b[^{;]*\{/g;
    for (let m; (m = bodyRe.exec(code)); ) {
      const open = m.index + m[0].length - 1;
      const close = pairs.brace.get(open);
      if (close != null) classBodies.push([open + 1, close, m.index]);
    }
  }
  for (const [bs, be, clsAt] of classBodies) {
    const cls = classInfos.find((c) => c.at <= clsAt) ?? null;
    let depth = 0;
    for (let i = bs; i < be; i++) {
      const c = code[i];
      if (c === '{' || c === '(' || c === '[') { depth++; continue; }
      if (c === '}' || c === ')' || c === ']') { depth--; continue; }
      if (depth !== 0 || !isWordStart(c)) continue;
      let j = i;
      while (j < be && isWordChar(code[j])) j++;
      const word = code.slice(i, j);
      const wordAt = i;
      i = j - 1;
      if (word === 'static' || word === 'async' || word === 'get' || word === 'set') { declaredAt.add(wordAt); continue; }
      if (KEYWORDS.has(word)) continue;
      const nx = nextSig(code, j);
      if (nx.ch === '(') {                                             // a method
        declaredAt.add(wordAt);
        members.push({ name: word, kind: 'method', ...at(wordAt), className: cls?.name ?? null });
      } else if (nx.ch === '=' && code[nx.at + 1] !== '=') {           // a class field
        declaredAt.add(wordAt);
        members.push({ name: word, kind: 'field', ...at(wordAt), className: cls?.name ?? null });
      } else if (nx.ch === ';') {
        declaredAt.add(wordAt);
        members.push({ name: word, kind: 'field', ...at(wordAt), className: cls?.name ?? null });
      }
    }
  }

  // — require() (CJS): a module edge; the binding rides the const scan —
  const reqRe = /\brequire\s*\(/g;
  for (let m; (m = reqRe.exec(code)); ) {
    const lit = stringLitAt(m.index + m[0].length);
    if (lit) edges.push({ spec: lit.value, kind: 'require' });
  }

  // — references & assignments —
  const ASSIGN_NEXT = /^(=(?![=>])|\+=|-=|\*=|\/=|%=|&&=|\|\|=|\?\?=|\*\*=|&=|\|=|\^=|<<=|>>>=|>>=)/;
  const identRe = /[A-Za-z_$][\w$]*/g;
  for (let m; (m = identRe.exec(code)); ) {
    const name = m[0];
    const o = m.index;
    if (o > 0 && isWordChar(code[o - 1])) continue;                    // `1e-300`, `0xFF` — a literal's tail, not a name
    if (declaredAt.has(o) || inSkip(o)) continue;
    if (KEYWORDS.has(name)) continue;
    const before = prevSig(code, o);
    if (before.ch === '.' && !(code[before.at - 1] === '.' && code[before.at - 2] === '.')) continue;   // property position (`...spread` stays a reference)
    const beforeTok = prevToken(code, o);
    if (beforeTok.word === 'break' || beforeTok.word === 'continue') continue;   // labels
    if (beforeTok.word === 'get' || beforeTok.word === 'set') {
      // `get foo()` shorthand outside a class body (object literal accessor)
      const nx0 = nextSig(code, o + name.length);
      if (nx0.ch === '(') continue;
    }
    if (name === 'get' || name === 'set') {
      // the accessor keyword itself, in an object literal: `get g() {`
      const nx0 = nextSig(code, o + name.length);
      if (isWordStart(nx0.ch)) continue;
    }
    const after = nextSig(code, o + name.length);
    if (after.ch === ':' && code[after.at + 1] !== ':') {
      // object key / label — keep only ternary branches and case labels
      if (beforeTok.ch !== '?' && beforeTok.word !== 'case') continue;
    }
    if (name === 'async') {
      // `async (…) =>`, `async ident =>`, `async function`, `async *gen(…)` — a modifier
      if (after.ch === '(' || after.ch === '*' || isWordStart(after.ch)) continue;
    }
    if (name === 'from' || name === 'as') {
      // stray module-clause words that escaped a skip span (defensive)
      if (inSkip(before.at) || beforeTok.ch === '}') continue;
    }
    const guard = beforeTok.word === 'typeof';
    const call = after.ch === '(';
    // method shorthand in an object literal: `name(…) {`, `async name(…) {`,
    // `*gen(…) {` — a definition, not a call
    if (call) {
      const close = pairs.paren.get(after.at);
      if (close != null && nextSig(code, close + 1).ch === '{' &&
          (before.ch === '{' || before.ch === ',' || before.ch === '*' ||
           beforeTok.word === 'async' || beforeTok.word === 'static')) {
        declaredAt.add(o);
        continue;
      }
    }
    let kind = 'use';
    const rest = code.slice(after.at, after.at + 4);
    if (ASSIGN_NEXT.test(rest)) kind = rest[0] === '=' ? 'asg' : 'upd';
    else if (rest.startsWith('++') || rest.startsWith('--')) kind = 'upd';
    else if ((before.ch === '+' && code[before.at - 1] === '+') || (before.ch === '-' && code[before.at - 1] === '-')) kind = 'upd';
    const sc = scopeOf(scopes, o);
    uses.push({ name, ...at(o), offset: o, scopeId: sc.id, kind, guard, call });
  }

  // — same-module call edges (decoration for the graph, name-matched like organs/in) —
  const callables = new Map();
  for (const d of decls) if (d.declKind === 'function' || d.declKind === 'const' || d.declKind === 'let') {
    if (!callables.has(d.name)) callables.set(d.name, d);
  }
  const calls = [];
  const seenEdge = new Set();
  for (const u of uses) {
    if (!u.call || !callables.has(u.name)) continue;
    const sc = fnScopeOf(scopes, scopes[u.scopeId]);
    const fromName = sc.ownerName;
    if (!fromName || fromName === u.name) continue;
    const key = `${fromName}>>${u.name}`;
    if (seenEdge.has(key)) continue;
    seenEdge.add(key);
    calls.push({ fromName, toName: u.name });
  }

  uses.sort((a, b) => a.offset - b.offset);
  decls.sort((a, b) => a.offset - b.offset);
  return Object.freeze({
    module, scopes, decls, members, imports, exports: exportsList, edges, uses, calls,
  });
};

// ── the provider membrane ─────────────────────────────────────────────────────────
// registerExtractor('python', fn) slots another language in: fn(src, {path}) must
// return the same fact shape. A grammar-tree provider (tree-sitter WASM, Lezer)
// mounts here without touching the lowering, the order, or the laws.
const EXTRACTORS = new Map();
export const registerExtractor = (lang, fn) => { EXTRACTORS.set(lang, fn); };
export const extractorFor = (path) => {
  const ext = (/\.([A-Za-z]+)$/.exec(String(path ?? '')) || [])[1]?.toLowerCase() ?? 'js';
  const lang = LANG_BY_EXT[ext] ?? ext;
  return EXTRACTORS.get(lang) ?? extractFacts;
};
