// EO: SEG·SYN(Void → Network, Dissecting,Composing) — code adapter — source → EOT graph
// The code adapter — source code as a traversable EO reading.
//
// Every other input organ turns its modality into the modality-neutral spine the core
// reads (organs/in/index.js). This one does the same for SOURCE CODE: it reads a file of
// code and emits EOT — the Existential-Operator-Triple surface (docs/eot-surface-syntax.md)
// — then lowers that surface through the existing ingester (ingest/eot.js) into the same
// append-only EO log every other reading lives in. "Takes in code and converts it to EOT
// for easy traversal": the structure of the program (modules, imports, functions, classes,
// methods, call edges) becomes entities and typed relations you can walk like any graph.
//
// WHY EOT and not a bespoke AST. The whole engine already knows how to read EOT — to mint
// anchors, fold the log into a graph, project it around a cursor, answer over it, render it
// back out (ingest/eot-emit.js). By emitting the SAME surface a model writes, code drops
// into that machinery for free: a call graph is just CON edges, a class hierarchy is just
// `extends` links, "what does this function call / who calls it" is a graph traversal. The
// adapter is a FRONT END that speaks EOT; the ingester does the lowering, unchanged.
//
// WHAT it understands. The extractor is tuned for JavaScript / TypeScript (this project's
// own language) and degrades gracefully on other curly-brace languages: it recovers the
// module, its imports/exports, top-level functions, classes and their methods, `extends`,
// and the same-module call edges between them. It is deliberately lightweight — a
// comment/string-aware line scan plus brace matching, no full parser — so it stays a leaf
// with no heavy dependency, exactly like the other organs.
//
// PROVENANCE. Code read from a file is real data — the world, exafference — not a model's
// interpretation. So the lowering takes the PERCEIVER door (§8.3), unlike model-authored
// EOT which takes the enactor door. The reading is ground truth about the source, held as
// what-was-read, not conjecture.

import { eotDoc }              from '../ingest/index.js';
import { valueLiteral }       from '../ingest/index.js';
import { projectGraph }       from '../../core/index.js';

// ── identifiers → EOT signs ──────────────────────────────────────────────────────
// An EOT NAMECHAR is ALPHA|DIGIT|_|- only (§4.4); `:` is the tight namespace separator
// and `.` the path field. So a JS identifier (which may carry `$`) and any free-form
// import specifier must be folded onto that alphabet before they can be a sign segment.
const seg = (s) => {
  const out = String(s ?? '').replace(/[^A-Za-z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  return out || 'anon';
};

// A dependency specifier (`./foo/bar`, `@scope/pkg`, `react`) → a readable single segment.
// Relative prefixes and slashes collapse to dashes so `./util/log` reads as `util-log`.
const depSeg = (spec) => {
  const cleaned = String(spec ?? '')
    .replace(/^['"`]|['"`]$/g, '')
    .replace(/^(\.\.\/|\.\/)+/, '')
    .replace(/\.[A-Za-z]+$/, '')          // drop a trailing file extension
    .replace(/[@/]/g, '-');
  return seg(cleaned);
};

const LANG_BY_EXT = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp', cs: 'csharp', php: 'php',
};

// ── comment / string scrubber ─────────────────────────────────────────────────────
// Blank the interior of line comments, block comments and string/template literals so the
// declaration and call scans never match a keyword inside a comment or a brace inside a
// string. Newlines are preserved, so every char keeps its line number; removed content
// becomes spaces, so brace matching stays exact. This is a single state-machine pass.
// `keepStrings` preserves string/template BODIES (comments are always blanked). The
// declaration / call / brace scans want strings gone (a brace inside a string must not
// count); the IMPORT scan wants them kept (a specifier IS a string literal to read).
const scrub = (src, { keepStrings = false } = {}) => {
  const out = [];
  let i = 0;
  const n = src.length;
  let state = 'code';          // code | line | block | sq | dq | tpl
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (state === 'code') {
      if (c === '/' && d === '/') { out.push('  '); i += 2; state = 'line'; continue; }
      if (c === '/' && d === '*') { out.push('  '); i += 2; state = 'block'; continue; }
      if (c === "'") { out.push(c); i++; state = 'sq'; continue; }
      if (c === '"') { out.push(c); i++; state = 'dq'; continue; }
      if (c === '`') { out.push(c); i++; state = 'tpl'; continue; }
      out.push(c); i++; continue;
    }
    if (state === 'line') {
      if (c === '\n') { out.push('\n'); i++; state = 'code'; continue; }
      out.push(c === '\t' ? '\t' : ' '); i++; continue;
    }
    if (state === 'block') {
      if (c === '*' && d === '/') { out.push('  '); i += 2; state = 'code'; continue; }
      out.push(c === '\n' ? '\n' : (c === '\t' ? '\t' : ' ')); i++; continue;
    }
    // inside a string/template: keep or blank the body, honour escapes, keep the closing quote
    const closer = state === 'sq' ? "'" : state === 'dq' ? '"' : '`';
    if (c === '\\') { out.push(keepStrings ? src.slice(i, i + 2) : '  '); i += 2; continue; }
    if (c === closer) { out.push(c); i++; state = 'code'; continue; }
    out.push(keepStrings ? c : (c === '\n' ? '\n' : ' ')); i++; continue;
  }
  return out.join('');
};

// Map a character offset in the scrubbed source to a 1-based line number.
const lineIndex = (src) => {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') starts.push(i + 1);
  return (offset) => {
    // binary search the greatest start ≤ offset
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= offset) lo = mid; else hi = mid - 1; }
    return lo + 1;
  };
};

// match the `{ … }` body that opens at-or-after `from`; returns [bodyStart, bodyEnd]
// char offsets (bodyEnd exclusive of the close brace), or null if no balanced body.
const braceBody = (src, from) => {
  let i = src.indexOf('{', from);
  if (i < 0) return null;
  const start = i;
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return [start + 1, i]; }
  }
  return [start + 1, src.length];
};

const KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'do', 'else',
  'await', 'typeof', 'new', 'super', 'this', 'void', 'yield', 'with', 'in', 'of',
]);

// ── the extractor (JS/TS-leaning, brace-language tolerant) ─────────────────────────
// Returns a flat list of `facts` describing the program. Each fact is a small object the
// renderer (below) turns into one EOT line. Order is source order so line numbers rise.
const extract = (src, { base, lang }) => {
  const code = scrub(src);
  const lineAt = lineIndex(code);
  const facts = [];
  const mod = `mod:${base}`;
  facts.push({ kind: 'module', sign: mod, type: 'Module', lang });

  // imports / re-exports: `import … from 'x'`, `export … from 'x'`, `require('x')`.
  // Read from the string-preserving scrub — the specifier is a string literal, but
  // commented-out imports are still blanked, so a `// import x from 'y'` won't match.
  const withStrings = scrub(src, { keepStrings: true });
  const importRe = /\b(?:import\b[^;'"`]*?\bfrom|export\b[^;'"`]*?\bfrom)\s*['"`]([^'"`]+)['"`]|\brequire\s*\(\s*['"`]([^'"`]+)['"`]\s*\)|\bimport\s*['"`]([^'"`]+)['"`]/g;
  for (let m; (m = importRe.exec(withStrings)); ) {
    const spec = m[1] || m[2] || m[3];
    if (spec) facts.push({ kind: 'import', from: mod, dep: `dep:${depSeg(spec)}`, spec });
  }

  // top-level functions: `function name(`, `async function name(`, and the common
  // `const name = (…) =>` / `const name = function` / `const name = async (…) =>` forms.
  // We also record the body span (for call attribution and async detection).
  const callables = [];   // { sign, name, bodyStart, bodyEnd }
  const declRe = /\b(export\s+)?(?:default\s+)?(async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(([^)]*)\)|\b(export\s+)?(?:default\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(async\s+)?(?:function\b[^(]*\(([^)]*)\)|\(([^)]*)\)\s*=>|([A-Za-z_$][\w$]*)\s*=>)/g;
  for (let m; (m = declRe.exec(code)); ) {
    const exported = !!(m[1] || m[5]);
    const isAsync  = !!(m[2] || m[7]);
    const name = m[3] || m[6];
    if (!name) continue;
    const params = (m[4] ?? m[8] ?? m[9] ?? (m[10] ? m[10] : '')).trim();
    const sign = `fn:${base}:${seg(name)}`;
    const body = braceBody(code, declRe.lastIndex);
    const line = lineAt(m.index);
    facts.push({ kind: 'function', sign, name, line, params, exported, async: isAsync, module: mod });
    if (body) callables.push({ sign, name, bodyStart: body[0], bodyEnd: body[1] });
  }

  // classes and their methods. The class body span scopes method detection so a bare
  // `name(args) {` is only read as a method when it sits inside a class.
  const classRe = /\b(export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)(?:\s+extends\s+([A-Za-z_$][\w$.]*))?/g;
  for (let m; (m = classRe.exec(code)); ) {
    const exported = !!m[1];
    const name = m[2];
    const sign = `cls:${base}:${seg(name)}`;
    const line = lineAt(m.index);
    facts.push({ kind: 'class', sign, name, line, exported, module: mod,
                 extends: m[3] ? `dep:${depSeg(m[3])}` : null, extendsName: m[3] || null });
    const body = braceBody(code, classRe.lastIndex);
    if (!body) continue;
    const [bs, be] = body;
    const methodRe = /(?:^|\n)[ \t]*(static\s+)?(async\s+)?(?:get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/g;
    const bodyText = code.slice(bs, be);
    for (let mm; (mm = methodRe.exec(bodyText)); ) {
      const mname = mm[3];
      if (KEYWORDS.has(mname)) continue;
      const msign = `fn:${base}:${seg(name)}-${seg(mname)}`;
      const mline = lineAt(bs + mm.index);
      const mbody = braceBody(bodyText, methodRe.lastIndex - 1);
      facts.push({ kind: 'method', sign: msign, name: mname, line: mline,
                   params: (mm[4] || '').trim(), async: !!mm[2], static: !!mm[1],
                   class: sign });
      if (mbody) callables.push({ sign: msign, name: mname, bodyStart: bs + mbody[0], bodyEnd: bs + mbody[1] });
    }
  }

  // call edges: every `name(` whose name is a known same-module callable becomes a CON
  // `calls` edge from the enclosing callable (the innermost body span containing the site)
  // to the callee. Self-recursion and unresolved names are dropped — the graph holds only
  // edges between things this file actually defines, which is what makes it traversable.
  const byName = new Map();
  for (const c of callables) byName.set(c.name, c);
  const enclosing = (offset) => {
    let best = null;
    for (const c of callables) {
      if (offset >= c.bodyStart && offset < c.bodyEnd) {
        if (!best || (c.bodyEnd - c.bodyStart) < (best.bodyEnd - best.bodyStart)) best = c;
      }
    }
    return best;
  };
  const seenEdge = new Set();
  const callRe = /([A-Za-z_$][\w$]*)\s*\(/g;
  for (let m; (m = callRe.exec(code)); ) {
    const callee = byName.get(m[1]);
    if (!callee) continue;
    const caller = enclosing(m.index);
    if (!caller || caller.sign === callee.sign) continue;
    const key = `${caller.sign}>>${callee.sign}`;
    if (seenEdge.has(key)) continue;
    seenEdge.add(key);
    facts.push({ kind: 'call', from: caller.sign, to: callee.sign });
  }

  return facts;
};

// ── facts → EOT surface (docs/eot-surface-syntax.md) ───────────────────────────────
const lit = (v) => valueLiteral(v);
const factsToEot = (facts, { path }) => {
  const lines = [];
  for (const f of facts) {
    switch (f.kind) {
      case 'module':
        lines.push(`${f.sign} : ${f.type}`);
        if (f.lang) lines.push(`${f.sign}.lang = ${lit(f.lang)}`);
        if (path)   lines.push(`${f.sign}.path = ${lit(path)}`);
        break;
      case 'import':
        lines.push(`${f.from} -> ${f.dep} : imports`);
        break;
      case 'function':
        lines.push(`${f.sign} : Function`);
        lines.push(`${f.sign}.line = ${lit(f.line)}`);
        if (f.params) lines.push(`${f.sign}.params = ${lit(f.params)}`);
        if (f.async)    lines.push(`${f.sign}.async = true`);
        if (f.exported) lines.push(`${f.sign}.exported = true`);
        lines.push(`${f.sign} -> ${f.module} : definedIn`);
        break;
      case 'class':
        lines.push(`${f.sign} : Class`);
        lines.push(`${f.sign}.line = ${lit(f.line)}`);
        if (f.exported) lines.push(`${f.sign}.exported = true`);
        lines.push(`${f.sign} -> ${f.module} : definedIn`);
        if (f.extends) lines.push(`${f.sign} -> ${f.extends} : extends`);
        break;
      case 'method':
        lines.push(`${f.sign} : Method`);
        lines.push(`${f.sign}.line = ${lit(f.line)}`);
        if (f.params) lines.push(`${f.sign}.params = ${lit(f.params)}`);
        if (f.async)  lines.push(`${f.sign}.async = true`);
        if (f.static) lines.push(`${f.sign}.static = true`);
        lines.push(`${f.sign} -> ${f.class} : memberOf`);
        break;
      case 'call':
        lines.push(`${f.from} -> ${f.to} : calls`);
        break;
    }
  }
  return lines.join('\n');
};

// ── the organ ──────────────────────────────────────────────────────────────────────
// ingestCode(file, opts) → a traversable doc (the eotDoc shape: docId, log, signs,
// sentences, diagnostics) AUGMENTED with:
//   eotText   the EOT surface the code lowered through (the "converted to EOT" artifact)
//   facts     the structured extraction, for callers that want the raw shape
//   lang      the detected language
//   projectGraph(frame)  the same graph projection the other organs expose, so the call
//             graph / membership tree walks exactly like any other reading
//
// `file` may be a string of source, or a File/Blob with a `.name` (used for the module
// sign, the path field, and language detection). `opts.name` / `opts.lang` override.
export const ingestCode = async (file, opts = {}) => {
  const src  = typeof file === 'string' ? file : await file.text();
  const path = opts.name || (typeof file === 'string' ? null : file?.name) || null;
  const fname = path || 'module';
  const extMatch = /\.([A-Za-z]+)$/.exec(String(fname));
  const ext = extMatch ? extMatch[1].toLowerCase() : '';
  const lang = opts.lang || LANG_BY_EXT[ext] || 'code';
  const base = seg(String(fname).replace(/^.*[\\/]/, '').replace(/\.[A-Za-z]+$/, '') || 'module');

  const facts   = extract(src, { base, lang });
  const eotText = factsToEot(facts, { path });

  // Lower through the existing ingester. Code is real data → the perceiver door (§8.3):
  // the reading is ground about the source, not the model's conjecture.
  const doc = eotDoc(eotText, {
    docId: opts.docId || base,
    frame: 'code',
    door: 'perceiver',
    agent: opts.agent || (path ? `import:code:${path}` : 'import:code'),
  });

  // Expose the graph projection the other organs attach (text.js), so the call/membership
  // graph re-weights around a cursor without the organ knowing the UI exists.
  const graphDoc = { ...doc, code: true, lang, base, eotText, facts };
  graphDoc.projectGraph = (frame = {}) => projectGraph(doc.log, frame);
  return Object.freeze(graphDoc);
};
