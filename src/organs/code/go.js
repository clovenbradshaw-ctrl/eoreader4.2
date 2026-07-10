// EO: SEG·SIG(Void → Field,Entity, Dissecting,Tending) — Go provider (hazard membrane)
// The Go provider — a THIRD language on the membrane, hazard-only.
//
// Go's binding rules are its compiler's job (and `go build` already runs); what a
// compiler and `go vet` largely miss is the BEHAVIORAL tier — the concurrency and
// aliasing defects that build clean and fail at runtime. So this provider emits no
// scope/binding facts (the fold's dependency laws are for module languages); it emits
// only WITNESSED hazards, each an idiomatic Go defect with its EO reading, at the
// grain a reviewer reasons at. It mounts exactly like python.js: same fact shape
// (minimal), the lowering and the fold unchanged.
//
// The six shapes (BUGS_MANIFEST Go tier): a slice appended from goroutines with no
// mutex (a SYN with no boundary — Field-grain race), an error discarded then its value
// dereferenced (a CON to a Void the record said was empty), a `defer` inside a loop
// (a NUL deferred past every iteration — all handles held), a write to a nil map (an
// INS into a Field never made), a range-copy field assignment (a DEF on a copy the
// world never sees), and `wg.Add` inside the goroutine it counts (the barrier races
// its own registration).

import { modSeg, lineColIndex } from './facts.js';

// ── a Go-aware scrub — comments, strings, raw strings, runes ───────────────────────
const scrub = (src) => {
  const out = src.split('');
  const n = src.length;
  let i = 0, state = 'code', closer = '';
  const blank = (c) => (c === '\n' ? '\n' : c === '\t' ? '\t' : ' ');
  const put = (a, c) => { if (a < n) out[a] = c; };
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (state === 'code') {
      if (c === '/' && d === '/') { put(i, ' '); put(i + 1, ' '); i += 2; state = 'line'; continue; }
      if (c === '/' && d === '*') { put(i, ' '); put(i + 1, ' '); i += 2; state = 'block'; continue; }
      if (c === '"' || c === '`' || c === "'") { closer = c; put(i, ' '); i++; state = 'str'; continue; }
      i++; continue;
    }
    if (state === 'line') { if (c === '\n') { state = 'code'; i++; continue; } put(i, blank(c)); i++; continue; }
    if (state === 'block') { if (c === '*' && d === '/') { put(i, ' '); put(i + 1, ' '); i += 2; state = 'code'; continue; } put(i, blank(c)); i++; continue; }
    // str
    if (c === '\\' && closer !== '`') { put(i, ' '); put(i + 1, ' '); i += 2; continue; }
    if (c === closer) { put(i, ' '); i++; state = 'code'; continue; }
    put(i, blank(c)); i++;
  }
  return out.join('');
};

const matchBraces = (code) => {
  const brace = new Map(), stack = [];
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '{') stack.push(i);
    else if (code[i] === '}') { const o = stack.pop(); if (o != null) { brace.set(o, i); brace.set(i, o); } }
  }
  return brace;
};

// spans of `go func(...) { … }` bodies (byte ranges of the braces)
const goroutineSpans = (code, brace) => {
  const spans = [];
  for (const m of code.matchAll(/\bgo\s+func\b[^{]*\{/g)) {
    const open = m.index + m[0].length - 1;
    const close = brace.get(open);
    if (close != null) spans.push([open, close]);
  }
  return spans;
};
// spans of `for … { … }` bodies — `[^{]*` so a C-style `for i; c; p {` (with its
// semicolons) still reaches the body brace, not just `for cond {` / `for range {`.
const forSpans = (code, brace) => {
  const spans = [];
  for (const m of code.matchAll(/\bfor\b[^{]*\{/g)) {
    const open = m.index + m[0].length - 1;
    const close = brace.get(open);
    if (close != null) spans.push([open, close]);
  }
  return spans;
};
const within = (spans, o) => spans.some(([a, b]) => o > a && o < b);

// ── the extractor (hazard-only facts) ──────────────────────────────────────────────
export const extractGoFacts = (src, { path = null } = {}) => {
  const code = scrub(String(src ?? ''));
  const at = lineColIndex(code);
  const brace = matchBraces(code);
  const goroutines = goroutineSpans(code, brace);
  const fors = forSpans(code, brace);
  const hz = [];
  const add = (law, offset, detail) => hz.push({ law, ...at(offset), detail });

  // G6 · wg.Add inside the goroutine it counts — the barrier races its registration
  for (const m of code.matchAll(/\.\s*Add\s*\(/g))
    if (within(goroutines, m.index))
      add('waitgroup-add-in-goroutine', m.index,
        'wg.Add(…) inside the goroutine — Wait() can pass before the worker registers; Add before the `go` statement');

  // G1 · a slice appended from a goroutine with NO mutex — a Field-grain data race
  for (const m of code.matchAll(/\b([A-Za-z_]\w*)\s*=\s*append\s*\(\s*\1\b/g)) {
    const span = goroutines.find(([a, b]) => m.index > a && m.index < b);
    if (!span) continue;
    if (/\.\s*Lock\s*\(/.test(code.slice(span[0], span[1]))) continue;   // guarded — not a race
    add('data-race-append', m.index,
      `${m[1]} = append(${m[1]}, …) from a goroutine with no mutex — concurrent appends race and drop writes; guard with sync.Mutex or a channel`);
  }

  // G2 · error discarded then value dereferenced — a CON to a Void the record said was empty
  for (const m of code.matchAll(/\b([A-Za-z_]\w*)\s*,\s*_\s*:=\s*[A-Za-z_][\w.]*\s*\(/g)) {
    const v = m[1];
    const rest = code.slice(m.index + m[0].length, m.index + 400);
    if (new RegExp(`\\b${v}\\s*\\.`).test(rest))
      add('unchecked-error-deref', m.index,
        `the error from this call is discarded (\`, _ :=\`) and \`${v}\` is dereferenced anyway — a nil-pointer panic when it fails`);
  }

  // G3 · defer inside a loop — every handle held until the function returns
  for (const m of code.matchAll(/\bdefer\b/g))
    if (within(fors, m.index) && !within(goroutines, m.index))
      add('defer-in-loop', m.index,
        'defer inside a loop — the NUL (Close/Unlock) is deferred to function return, so every iteration\'s resource is held at once');

  // G4 · write to a nil map — an INS into a Field never made
  for (const m of code.matchAll(/\bvar\s+([A-Za-z_]\w*)\s+map\[/g)) {
    const name = m[1];
    const after = code.slice(m.index);
    const made = new RegExp(`\\b${name}\\s*[:=]?=\\s*make\\s*\\(`).test(after);
    const write = new RegExp(`\\b${name}\\s*\\[[^\\]]*\\]\\s*(\\+\\+|--|[-+*/]?=[^=])`).exec(after);
    if (!made && write)
      add('nil-map-write', m.index,        // witnessed at the `var … map[…]` declaration — the missing make
        `${name} is declared \`var … map[…]\` but never made, then written — \`assignment to entry in nil map\` panic; use make(map[…])`);
  }

  // G5 · range-copy mutation — a DEF on a copy the backing array never sees
  for (const m of code.matchAll(/\bfor\s+_\s*,\s*([A-Za-z_]\w*)\s*:=\s*range\b[^{]*\{/g)) {
    const name = m[1];
    const open = m.index + m[0].length - 1;
    const close = brace.get(open);
    if (close == null) continue;
    const body = code.slice(open + 1, close);
    const w = new RegExp(`\\b${name}\\s*\\.\\s*[A-Za-z_]\\w*\\s*=[^=]`).exec(body);
    if (w) add('range-copy-mutation', open + 1 + w.index,
      `${name} is a COPY of each element (\`for _, ${name} := range …\`); assigning ${name}.Field is lost — iterate by index: \`for i := range …\` then …[i].Field`);
  }

  hz.sort((a, b) => (a.line - b.line) || (a.col - b.col));
  return Object.freeze({
    module: { sign: modSeg(path ?? 'module'), path: path ?? null, lang: 'go' },
    scopes: [{ id: 0, kind: 'module', parent: -1 }],
    decls: [], members: [], imports: [], exports: [], edges: [], uses: [], calls: [], hazards: hz,
  });
};

import { registerExtractor } from './facts.js';
registerExtractor('go', extractGoFacts);
