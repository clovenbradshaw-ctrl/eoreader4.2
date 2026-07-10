// EO: SEG·SIG·INS(Void → Field,Entity, Dissecting,Tending,Making) — Python provider (parser membrane)
// The Python provider — proof the membrane is real: a second language mounted via
// registerExtractor, emitting the SAME fact shape facts.js defines, so the lowering,
// the dependency order, and every law downstream run unchanged.
//
// Python is line-regular where JS is brace-regular, so the structural reading is an
// INDENTATION-scoped scan: only def/class/lambda carve binding scopes (Python is
// function-scoped); a name binds on its FIRST binding statement per scope (assignment,
// def, class, import, for/with/except target) and every later rebinding is a write —
// rebinding is legal Python, so the collision law never fires here, while the
// dependency law still does: a module-level use before the first binding is a real
// NameError, and a def-local read before the first local write is the real
// UnboundLocalError (Python's TDZ).
//
// HAZARDS — the behavioral register. Beyond the binding laws, this provider WITNESSES
// six structural shapes that are defects at runtime, each with an honest EO reading:
//
//   bare-except          `except:` — a SEG with no key: a boundary that names nothing
//                        catches everything, KeyboardInterrupt included
//   shared-default       `def f(x=[])` — a def-time INS (Pattern grain, made once)
//                        standing where a per-call Figure is read: grain-mixed
//   tail-drop            `range(len(x) - 1)` with no x[i+1] in the body — a partition
//                        that provably excludes its tail
//   unbounded-resource   `fh = open(…)` outside `with` — an INS whose clearing (NUL)
//                        is not bound to any boundary
//   dangling-task        `ensure_future/create_task(…)` at statement position — an INS
//                        no CON ever witnesses: the dead-entity law at expression grain
//   void-identity        `x == float("nan")` — an EVA that can never bind: NaN is the
//                        value that is not even itself
//
// A hazard is a WITNESSED shape (perceiver door — "there is a bare except at L129" is
// structure, checkable against the file); the judgment on it is the fold's (issues.js).
//
// KNOWN LIMITS: `global`/`nonlocal` are honored only as module-scope aliases;
// comprehension variables bind in the enclosing scope (over-wide — never fabricates an
// unbound, may miss a shadow); decorators are read as references; `match` statements
// read as plain blocks; star-imports admit the open world.

import { lineColIndex } from './facts.js';
import { registerExtractor } from './facts.js';

// ── keywords & builtins ───────────────────────────────────────────────────────────
const PY_KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class',
  'continue', 'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from',
  'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass',
  'raise', 'return', 'try', 'while', 'with', 'yield', 'match', 'case',
]);
export const PY_BUILTINS = new Set([
  'abs', 'aiter', 'all', 'anext', 'any', 'ascii', 'bin', 'bool', 'breakpoint',
  'bytearray', 'bytes', 'callable', 'chr', 'classmethod', 'compile', 'complex',
  'delattr', 'dict', 'dir', 'divmod', 'enumerate', 'eval', 'exec', 'filter', 'float',
  'format', 'frozenset', 'getattr', 'globals', 'hasattr', 'hash', 'help', 'hex', 'id',
  'input', 'int', 'isinstance', 'issubclass', 'iter', 'len', 'list', 'locals', 'map',
  'max', 'memoryview', 'min', 'next', 'object', 'oct', 'open', 'ord', 'pow', 'print',
  'property', 'range', 'repr', 'reversed', 'round', 'set', 'setattr', 'slice',
  'sorted', 'staticmethod', 'str', 'sum', 'super', 'tuple', 'type', 'vars', 'zip',
  '__name__', '__file__', '__doc__', '__debug__', '__import__', '__builtins__',
  'Exception', 'BaseException', 'ArithmeticError', 'AssertionError', 'AttributeError',
  'BlockingIOError', 'BrokenPipeError', 'BufferError', 'BytesWarning', 'ChildProcessError',
  'ConnectionAbortedError', 'ConnectionError', 'ConnectionRefusedError', 'ConnectionResetError',
  'DeprecationWarning', 'EOFError', 'EnvironmentError', 'FileExistsError', 'FileNotFoundError',
  'FloatingPointError', 'FutureWarning', 'GeneratorExit', 'IOError', 'ImportError',
  'ImportWarning', 'IndentationError', 'IndexError', 'InterruptedError', 'IsADirectoryError',
  'KeyError', 'KeyboardInterrupt', 'LookupError', 'MemoryError', 'ModuleNotFoundError',
  'NameError', 'NotADirectoryError', 'NotImplemented', 'NotImplementedError', 'OSError',
  'OverflowError', 'PendingDeprecationWarning', 'PermissionError', 'ProcessLookupError',
  'RecursionError', 'ReferenceError', 'ResourceWarning', 'RuntimeError', 'RuntimeWarning',
  'StopAsyncIteration', 'StopIteration', 'SyntaxError', 'SyntaxWarning', 'SystemError',
  'SystemExit', 'TabError', 'TimeoutError', 'TypeError', 'UnboundLocalError',
  'UnicodeDecodeError', 'UnicodeEncodeError', 'UnicodeError', 'UnicodeTranslateError',
  'UnicodeWarning', 'UserWarning', 'ValueError', 'Warning', 'ZeroDivisionError', 'Ellipsis',
]);

// ── the Python scrub ──────────────────────────────────────────────────────────────
// Blank comments and string bodies, PRESERVING f-string `{…}` interpolations (real
// code with real references). Newlines and offsets survive exactly (same invariant
// as the JS scrub). Triple quotes handled; string prefixes (r/b/f/u, any case) read
// off the identifier immediately before the quote.
export const pyScrub = (src) => {
  const out = src.split('');                // one cell per source char; blanks overwrite
  const n = src.length;
  let i = 0;
  let state = 'code';                       // code | comment | str
  let closer = '';                          // ' | " | ''' | """
  let fstr = false;                         // current string is an f-string
  let braceKeep = 0;                        // inside an f-string interpolation
  let fmtTail = false;                      // past the `!conv` / `:spec` of an interpolation
  const blank = (c) => (c === '\n' ? '\n' : c === '\t' ? '\t' : ' ');
  const put = (at, c) => { if (at < n) out[at] = c; };

  const prefixStart = (at) => {
    // the letters immediately before a quote: rb"", f'', B""…
    let s = at;
    while (s > 0 && /[A-Za-z]/.test(src[s - 1])) s--;
    const p = src.slice(s, at);
    return p.length <= 2 && /^[rbfuRBFU]*$/.test(p) ? s : at;
  };

  while (i < n) {
    const c = src[i];
    if (state === 'code') {
      if (c === '#') { state = 'comment'; put(i, ' '); i++; continue; }
      if (c === "'" || c === '"') {
        const triple = src[i + 1] === c && src[i + 2] === c;
        closer = triple ? c + c + c : c;
        const ps = prefixStart(i);
        fstr = src.slice(ps, i).toLowerCase().includes('f');
        for (let k = ps; k < i; k++) put(k, ' ');        // the prefix letters are string, not names
        for (let k = 0; k < closer.length; k++) put(i + k, ' ');
        i += closer.length;
        state = 'str';
        continue;
      }
      put(i, c); i++; continue;
    }
    if (state === 'comment') {
      if (c === '\n') { put(i, '\n'); state = 'code'; i++; continue; }
      put(i, blank(c)); i++; continue;
    }
    // state === 'str'
    if (braceKeep > 0) {
      // inside an f-string interpolation — keep the code, track nesting; a `!r/!s/!a`
      // conversion or a `:` format spec ends the CODE part (blank the tail)
      if (c === '{') braceKeep++;
      else if (c === '}') { braceKeep--; if (braceKeep === 0) { put(i, ' '); fmtTail = false; i++; continue; } }
      if (!fmtTail && braceKeep === 1) {
        if (c === ':' ) fmtTail = true;
        if (c === '!' && 'rsa'.includes(src[i + 1] ?? '') && (src[i + 2] === '}' || src[i + 2] === ':')) fmtTail = true;
      }
      put(i, braceKeep > 0 && !fmtTail ? c : ' ');
      i++; continue;
    }
    if (c === '\\' && closer.length === 1) { put(i, ' '); put(i + 1, ' '); i += 2; continue; }
    if (fstr && c === '{') {
      if (src[i + 1] === '{') { put(i, ' '); put(i + 1, ' '); i += 2; continue; }   // literal {{
      braceKeep = 1; put(i, ' '); i++; continue;
    }
    if (fstr && c === '}' && src[i + 1] === '}') { put(i, ' '); put(i + 1, ' '); i += 2; continue; }
    if (src.startsWith(closer, i)) {
      for (let k = 0; k < closer.length; k++) put(i + k, ' ');
      i += closer.length; state = 'code'; continue;
    }
    put(i, blank(c)); i++; continue;
  }
  return out.join('');
};

// ── small lexical helpers over the scrubbed source ─────────────────────────────────
const isWord = (c) => /[A-Za-z0-9_]/.test(c || '');
const indentOf = (line) => {
  const m = /^[ \t]*/.exec(line)[0];
  return m.replace(/\t/g, '        ').length;                     // tabs as 8, consistently
};
const modSegPy = (path) => String(path ?? 'module')
  .replace(/^\.\//, '').replace(/\.[A-Za-z]+$/, '').replace(/[\\/]+/g, '-')
  .replace(/[^A-Za-z0-9_-]/g, '_').replace(/^[-_]+|[-_]+$/g, '') || 'module';

// the FIRST top-level `=` of a statement that is an assignment (not ==, !=, <=, >=,
// :=, a lambda-default, or part of an augmented operator). Returns { at, aug } or null.
const topLevelAssign = (s, from) => {
  let depth = 0;
  for (let i = from; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === '=' && depth === 0) {
      const p = s[i - 1] ?? '', p2 = s[i - 2] ?? '', n = s[i + 1] ?? '';
      if (n === '=') { i++; continue; }                              // == comparison
      if (p === '=' || p === '!' || p === ':') continue;             // ==, !=, walrus
      if (p === '<' || p === '>') {
        if (p2 === p) return { at: i, aug: true };                   // <<= >>=
        continue;                                                    // <= >= comparisons
      }
      if ('+-%&|^@'.includes(p)) return { at: i, aug: true };        // += -= %= &= |= ^= @=
      if (p === '*' || p === '/') return { at: i, aug: true };       // *= /= **= //=
      return { at: i, aug: false };
    }
  }
  return null;
};

// collect target names of a binding position (assignment LHS, for/with/except/import
// targets): plain names and tuple/list nestings; skips attribute (`a.b =`) and
// subscript (`a[i] =`) targets — those mutate, they do not bind.
const targetNames = (code, from, to) => {
  const names = [];
  const re = /[A-Za-z_][A-Za-z0-9_]*/g;
  re.lastIndex = from;
  for (let m; (m = re.exec(code)) && m.index < to; ) {
    const name = m[0];
    const at = m.index;
    const prev = code.slice(Math.max(0, at - 1), at);
    const nextAt = re.lastIndex;
    let k = nextAt; while (k < to && /[ \t]/.test(code[k])) k++;
    if (prev === '.') continue;                                   // attribute — a mutation
    if (code[k] === '[' || code[k] === '.' || code[k] === '(') continue;   // subscript/attr/call head
    if (PY_KEYWORDS.has(name)) continue;
    names.push({ name, offset: at });
  }
  return names;
};

// ── the extractor ─────────────────────────────────────────────────────────────────
export const extractPyFacts = (src, { path = null } = {}) => {
  const text = String(src ?? '').replace(/^﻿/, '');
  const code = pyScrub(text);
  const at = lineColIndex(code);
  const rawLines = code.split('\n');
  const module = { sign: modSegPy(path ?? 'module'), path: path ?? null, lang: 'python' };

  // — logical lines: join bracket/backslash continuations so a def header or call
  //   that spans lines scans as one statement; each keeps its start line/indent.
  const stmts = [];                          // { text, line (1-based), indent, startOffset }
  {
    let depth = 0, buf = '', startLine = 1, startOffset = 0, open = false;
    let offset = 0;
    for (let li = 0; li < rawLines.length; li++) {
      const raw = rawLines[li];
      if (!open) { startLine = li + 1; startOffset = offset; buf = ''; }
      buf += (open ? '\n' : '') + raw;
      for (const ch of raw) {
        if (ch === '(' || ch === '[' || ch === '{') depth++;
        else if (ch === ')' || ch === ']' || ch === '}') depth = Math.max(0, depth - 1);
      }
      const cont = /\\\s*$/.test(raw);
      if (depth > 0 || cont) { open = true; offset += raw.length + 1; continue; }
      open = false;
      if (buf.trim()) stmts.push({ text: buf, line: startLine, indent: indentOf(buf), startOffset });
      offset += raw.length + 1;
    }
    if (open && buf.trim()) stmts.push({ text: buf, line: startLine, indent: indentOf(buf), startOffset });
  }

  // — scopes from indentation: def/class open a scope over their block —
  const scopes = [{ id: 0, kind: 'module', parent: -1, ownerName: null }];
  const openStack = [{ id: 0, indent: -1 }];
  const scopeAtStmt = [];                    // scope id per statement, body-of context
  const declaredAt = new Set();
  const decls = [];
  const members = [];
  const importsList = [];
  const exportsList = [];                   // Python: module top-level bindings are its export surface
  const edges = [];
  const uses = [];
  const hazards = [];
  const bound = new Map();                   // `${scopeId}|${name}` → decl (first binding wins)

  const pushDecl = (name, offset, declKind, scopeId) => {
    const key = `${scopeId}|${name}`;
    declaredAt.add(offset);
    if (bound.has(key)) {
      // a REBINDING — legal Python; record a write at the site instead of a decl
      uses.push({ name, ...at(offset), offset, scopeId, kind: 'asg', guard: false, call: false });
      return bound.get(key);
    }
    const d = { name, declKind, ...at(offset), offset, scopeId,
                exported: scopeId === 0 && !name.startsWith('_'), hoisted: declKind === 'param', setAside: false };
    bound.set(key, d);
    decls.push(d);
    return d;
  };

  for (const st of stmts) {
    // close scopes whose block has ended (indent back at-or-under the opener's)
    while (openStack.length > 1 && st.indent <= openStack[openStack.length - 1].indent) openStack.pop();
    const scopeId = openStack[openStack.length - 1].id;
    scopeAtStmt.push(scopeId);
    const s = st.text;
    const base = st.startOffset;
    const stripped = s.trimStart();
    const lead = s.length - stripped.length;

    // ── def / class — bind the name in the ENCLOSING scope, open a new one ──
    let m;
    if ((m = /^(async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/.exec(stripped))) {
      pushDecl(m[2], base + lead + m[0].indexOf(m[2]), 'let', scopeId);
      const fnScope = { id: scopes.length, kind: 'fn', parent: scopeId, ownerName: m[2] };
      scopes.push(fnScope);
      openStack.push({ id: fnScope.id, indent: st.indent });
      // params: inside the header parens, names at depth 1 that are declaration
      // positions (start of list / after a comma), not annotations or defaults —
      // default EXPRESSIONS evaluate at def time in the ENCLOSING scope (which is
      // the whole point of shared-default) and scan as uses there.
      const po = s.indexOf('(', lead);
      let depth = 0, expectName = true;
      for (let i = po; i < s.length; i++) {
        const c = s[i];
        if (c === '(' || c === '[' || c === '{') { depth++; continue; }
        if (c === ')' || c === ']' || c === '}') { depth--; if (depth === 0) break; continue; }
        if (depth !== 1) continue;
        if (c === ',') { expectName = true; continue; }
        if (c === ':' || c === '=') { expectName = false; continue; }
        if (expectName && /[A-Za-z_]/.test(c)) {
          let j = i; while (j < s.length && isWord(s[j])) j++;
          const w = s.slice(i, j);
          if (!PY_KEYWORDS.has(w)) pushDecl(w, base + i, 'param', fnScope.id);
          i = j - 1; expectName = false;
        } else if (expectName && (c === '*' || c === '/')) continue;
      }
      // the six-shape scan needs the header too
      scanHazardsInDef(s, base, st, hazards, at);
      continue;
    }
    if ((m = /^class\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(stripped))) {
      pushDecl(m[1], base + lead + m[0].indexOf(m[1]), 'let', scopeId);
      const clsScope = { id: scopes.length, kind: 'class', parent: scopeId, ownerName: m[1] };
      scopes.push(clsScope);
      openStack.push({ id: clsScope.id, indent: st.indent });
      members.push({ name: m[1], kind: 'class', ...at(base + lead), className: null });
      scanUses(s, base, scopeId);          // bases in the parens are references
      continue;
    }

    // ── imports ──
    if ((m = /^import\s+(.+)$/.exec(stripped))) {
      for (const part of m[1].split(',')) {
        const pm = /^\s*([A-Za-z_][A-Za-z0-9_.]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?\s*$/.exec(part);
        if (!pm) continue;
        const local = pm[2] ?? pm[1].split('.')[0];
        const off = base + s.indexOf(pm[2] ?? pm[1], lead + 6);
        pushDecl(local, off, 'import', scopeId);
        importsList.push({ local, imported: pm[1], spec: pm[1], ...at(off) });
        edges.push({ spec: pm[1], kind: 'import' });
      }
      continue;
    }
    if ((m = /^from\s+([A-Za-z_.][A-Za-z0-9_.]*)\s+import\s+(.+)$/.exec(stripped))) {
      const spec = m[1];
      edges.push({ spec, kind: 'import' });
      const clause = m[2].replace(/[()]/g, '');
      if (clause.trim() === '*') { exportsList.push({ name: '*', local: null, from: spec, sourceName: '*', line: st.line }); continue; }
      for (const part of clause.split(',')) {
        const pm = /^\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?\s*$/.exec(part);
        if (!pm) continue;
        const local = pm[2] ?? pm[1];
        const searchFrom = s.indexOf('import', lead) + 6;
        const off = base + s.indexOf(local, searchFrom);
        pushDecl(local, off, 'import', scopeId);
        importsList.push({ local, imported: pm[1], spec, ...at(off) });
      }
      continue;
    }

    // ── global / nonlocal: alias the names to the module scope ──
    if ((m = /^(?:global|nonlocal)\s+(.+)$/.exec(stripped))) {
      for (const nm of m[1].split(',').map((x) => x.trim()).filter(Boolean)) {
        const key = `${scopeId}|${nm}`;
        if (!bound.has(key) && bound.has(`0|${nm}`)) bound.set(key, bound.get(`0|${nm}`));
      }
      continue;
    }

    // ── binding statements: assignment, for/with/except targets ──
    if ((m = /^(?:async\s+)?for\s+/.exec(stripped))) {
      const inAt = s.indexOf(' in ', lead);
      if (inAt > 0) markTargets(lead + m[0].length, inAt, false);
    } else if (/^(?:async\s+)?with\s+/.test(stripped)) {
      // `with EXPR as NAME(, EXPR as NAME)*:` — names after each `as`
      const asRe = /\bas\s+([A-Za-z_][A-Za-z0-9_]*)/g;
      for (let am; (am = asRe.exec(s)); ) pushDecl(am[1], base + am.index + am[0].indexOf(am[1]), 'let', scopeId);
    } else if (/^except\b/.test(stripped)) {
      const am = /\bas\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(s);
      if (am) pushDecl(am[1], base + am.index + am[0].indexOf(am[1]), 'let', scopeId);
      if (/^except\s*:/.test(stripped)) {
        hazards.push({ law: 'bare-except', ...at(base + lead), detail: 'except: — a boundary with no key catches everything, KeyboardInterrupt and SystemExit included' });
      }
    } else {
      const eq = topLevelAssign(s, lead);
      if (eq) {
        // an annotation (`x: list[T] = …`) puts TYPE names after a top-level `:` —
        // they are references; the binding targets stop at the colon
        let cut = eq.at, depth = 0;
        for (let i = lead; i < eq.at; i++) {
          const c = s[i];
          if (c === '(' || c === '[' || c === '{') depth++;
          else if (c === ')' || c === ']' || c === '}') depth--;
          else if (c === ':' && depth === 0) { cut = i; break; }
        }
        markTargets(lead, cut, eq.aug);
      } else if ((m = /^([A-Za-z_][A-Za-z0-9_]*)\s*:(?!=)/.exec(stripped)) && !PY_KEYWORDS.has(m[1])) {
        // annotation without a value — `seed_path: Path` — declares the name
        // (a dataclass field, a forward slot); the type names scan as references
        pushDecl(m[1], base + lead, 'let', scopeId);
      }
    }
    // walrus bindings anywhere in the statement
    const walrusRe = /([A-Za-z_][A-Za-z0-9_]*)\s*:=/g;
    for (let wm; (wm = walrusRe.exec(s)); ) pushDecl(wm[1], base + wm.index, 'let', scopeId);
    // comprehension targets (`[f(d) for d in xs]`): every `for … in` past the
    // statement head binds its targets — in the current scope (over-wide, never
    // fabricates an unbound; Python 3 gives comprehensions their own)
    const compRe = /\bfor\s+/g;
    for (let cm; (cm = compRe.exec(s)); ) {
      if (cm.index === lead) continue;                            // the statement's own for
      const inAt = s.indexOf(' in ', cm.index);
      // params, not lets: a comprehension target binds for its WHOLE expression —
      // the use to its left is not premature
      if (inAt > 0) for (const t of targetNames(s, cm.index + cm[0].length, inAt)) pushDecl(t.name, base + t.offset, 'param', scopeId);
    }

    scanHazardsInStmt(st, s, base, hazards, at, stmts, text);
    scanUses(s, base, scopeId);

    // — helper bound to this statement —
    function markTargets(from, to, aug) {
      // augmented assignment (`x += 1`) requires a prior binding — a write, not a decl
      if (aug) {
        for (const t of targetNames(s, from, to)) {
          uses.push({ name: t.name, ...at(base + t.offset), offset: base + t.offset, scopeId, kind: 'upd', guard: false, call: false });
          declaredAt.add(base + t.offset);
        }
        return;
      }
      for (const t of targetNames(s, from, to)) pushDecl(t.name, base + t.offset, 'let', scopeId);
    }
  }

  // module top-level names are the module's export surface (Python convention:
  // no underscore prefix). Recorded as decl-exported, so the tables and the
  // dead-export census work the same as for ES modules.

  function scanUses(s, base, scopeId) {
    const re = /[A-Za-z_][A-Za-z0-9_]*/g;
    for (let m; (m = re.exec(s)); ) {
      const name = m[0];
      const o = base + m.index;
      if (declaredAt.has(o)) continue;
      if (PY_KEYWORDS.has(name)) continue;
      const prev = s[m.index - 1];
      if (prev === '.') continue;                                  // attribute
      if (isWord(prev)) continue;                                  // number tail like 1e6
      // keyword argument `name=` inside a call: not a reference
      let k = m.index + name.length;
      while (k < s.length && /[ \t]/.test(s[k])) k++;
      if (s[k] === '=' && s[k + 1] !== '=' && prev !== undefined && /[(,]/.test(lastSig(s, m.index))) continue;
      const call = s[k] === '(';
      uses.push({ name, ...at(o), offset: o, scopeId, kind: 'use', guard: false, call });
    }
  }
  function lastSig(s, i) {
    let j = i - 1;
    while (j >= 0 && /\s/.test(s[j])) j--;                        // newlines too — clauses span lines
    return j >= 0 ? s[j] : '';
  }

  uses.sort((a, b) => a.offset - b.offset);
  decls.sort((a, b) => a.offset - b.offset);
  return Object.freeze({
    module, scopes, decls, members, imports: importsList, exports: exportsList,
    edges, uses, calls: [], hazards,
  });
};

// ── the six behavioral shapes ───────────────────────────────────────────────────────
function scanHazardsInDef(s, base, st, hazards, at) {
  // shared-default: a mutable literal as a parameter default — made once at def time
  const re = /=\s*(\[\s*\]|\{\s*\}|list\(\s*\)|dict\(\s*\)|set\(\s*\))/g;
  for (let m; (m = re.exec(s)); ) {
    hazards.push({ law: 'shared-default', ...at(base + m.index), detail: `parameter default ${m[1].replace(/\s+/g, '')} is instantiated ONCE at def time and shared across every call — a Pattern-grain INS read as a per-call Figure` });
  }
  void st;
}

function scanHazardsInStmt(st, s, base, hazards, at, stmts, rawText) {
  const stripped = s.trimStart();
  const raw = rawText ? rawText.slice(base, base + s.length) : s;   // string literals intact
  let m;
  // dangling-task: a task INS'd at statement position that nothing awaits or binds
  if ((m = /^(?:asyncio\s*\.\s*)?(ensure_future|create_task)\s*\(/.exec(stripped))) {
    hazards.push({ law: 'dangling-task', ...at(base + s.length - stripped.length), detail: `${m[1]}(…) at statement position — the task is an INS no CON ever witnesses: never awaited, never bound; exceptions in it vanish` });
  }
  // unbounded-resource: NAME = open(…) — the handle's clearing is bound to no boundary
  if ((m = /^([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=]+)?=\s*open\s*\(/.exec(stripped))) {
    hazards.push({ law: 'unbounded-resource', ...at(base + s.length - stripped.length), detail: `${m[1]} = open(…) outside a with-block — if anything raises before ${m[1]}.close(), the handle leaks (an INS whose NUL is not guaranteed)` });
  }
  // void-identity: comparison against float("nan") — an EVA that can never bind.
  // Scanned on the RAW statement (the "nan" literal is the point).
  if ((m = /([!=]=)\s*float\s*\(\s*['"]nan['"]\s*\)|float\s*\(\s*['"]nan['"]\s*\)\s*([!=]=)/i.exec(raw))) {
    hazards.push({ law: 'void-identity', ...at(base + m.index), detail: `comparison ${m[1] ?? m[2]} float("nan") is ${(m[1] ?? m[2]) === '==' ? 'always False' : 'always True'} — NaN equals nothing, itself included; use math.isnan(…)` });
  }
  // tail-drop: range(len(X) - 1) whose block never reads [i + 1]
  if ((m = /range\s*\(\s*len\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)\s*-\s*1\s*\)/.exec(s))) {
    // look ahead into the loop body (deeper-indented statements) for a `+ 1]` read —
    // the pairwise idiom that makes the shortened range correct
    const idx = stmts.indexOf(st);
    let pairwise = false;
    for (let j = idx + 1; j < stmts.length && stmts[j].indent > st.indent; j++) {
      if (/\+\s*1\s*\]/.test(stmts[j].text)) { pairwise = true; break; }
    }
    if (!pairwise) {
      hazards.push({ law: 'tail-drop', ...at(base + m.index), detail: `range(len(${m[1]}) - 1) with no [i + 1] read in the body — the partition provably excludes the last element of ${m[1]}` });
    }
  }
}

// mount on the membrane: any .py file routes here
registerExtractor('python', extractPyFacts);
