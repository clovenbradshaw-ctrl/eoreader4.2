// EO: SEG·SIG(Void → Field,Entity, Dissecting,Tending) — Rust provider (hazard membrane)
// The Rust provider — a FOURTH language on the membrane, hazard-only.
//
// Rust's borrow checker and `rustc` catch a great deal; what they wave through (without
// clippy) is the behavioral tier — panics on untrusted input, float identity, an
// accumulator shadowed away, a predicate inverted. This provider emits only WITNESSED
// hazards, each an idiomatic Rust defect with its EO reading. Mounts like every provider.
//
// The six shapes (BUGS_MANIFEST Rust tier): `== <float>` (an EVA that can never bind —
// the void-identity law, ported), `let x = x + …` inside a loop (a SEG that re-carves the
// name each turn, so the outer never updates), `retain` keeping the BELOW-floor side (an
// inverted partition), `.parse().unwrap()` on untrusted text (a NUL fabricated into a
// value — panics), `.len() - 1` with no empty guard (a usize underflow past the Void),
// and `token[..n]` byte-slicing a `str` (a SEG on a boundary the UTF-8 grain forbids).

import { modSeg, lineColIndex } from './facts.js';

// ── a Rust-aware scrub — line/doc comments, nested block comments, strings, raw strings ─
const scrub = (src) => {
  const out = src.split('');
  const n = src.length;
  let i = 0, state = 'code', depth = 0, hashes = 0;
  const blank = (c) => (c === '\n' ? '\n' : c === '\t' ? '\t' : ' ');
  const put = (a, c) => { if (a < n) out[a] = c; };
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (state === 'code') {
      if (c === '/' && d === '/') { put(i, ' '); put(i + 1, ' '); i += 2; state = 'line'; continue; }
      if (c === '/' && d === '*') { depth = 1; put(i, ' '); put(i + 1, ' '); i += 2; state = 'block'; continue; }
      if (c === 'r' && (d === '"' || d === '#')) {          // raw string r"…" / r#"…"#
        let j = i + 1; hashes = 0; while (src[j] === '#') { hashes++; j++; }
        if (src[j] === '"') { for (let k = i; k <= j; k++) put(k, ' '); i = j + 1; state = 'raw'; continue; }
      }
      if (c === '"') { put(i, ' '); i++; state = 'str'; continue; }
      i++; continue;
    }
    if (state === 'line') { if (c === '\n') { state = 'code'; i++; continue; } put(i, blank(c)); i++; continue; }
    if (state === 'block') {
      if (c === '/' && d === '*') { depth++; put(i, ' '); put(i + 1, ' '); i += 2; continue; }
      if (c === '*' && d === '/') { depth--; put(i, ' '); put(i + 1, ' '); i += 2; if (depth === 0) state = 'code'; continue; }
      put(i, blank(c)); i++; continue;
    }
    if (state === 'raw') {
      if (c === '"' && src.slice(i + 1, i + 1 + hashes) === '#'.repeat(hashes)) { for (let k = i; k <= i + hashes; k++) put(k, ' '); i += hashes + 1; state = 'code'; continue; }
      put(i, blank(c)); i++; continue;
    }
    // str
    if (c === '\\') { put(i, ' '); put(i + 1, ' '); i += 2; continue; }
    if (c === '"') { put(i, ' '); i++; state = 'code'; continue; }
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
const forSpans = (code, brace) => {
  const spans = [];
  for (const m of code.matchAll(/\b(for|while|loop)\b[^{;]*\{/g)) {
    const open = m.index + m[0].length - 1;
    const close = brace.get(open);
    if (close != null) spans.push([open, close]);
  }
  return spans;
};
const within = (spans, o) => spans.some(([a, b]) => o > a && o < b);

// ── the extractor (hazard-only facts) ──────────────────────────────────────────────
export const extractRustFacts = (src, { path = null } = {}) => {
  const code = scrub(String(src ?? ''));
  const at = lineColIndex(code);
  const brace = matchBraces(code);
  const loops = forSpans(code, brace);
  const hz = [];
  const add = (law, offset, detail) => hz.push({ law, ...at(offset), detail });

  // R1 · float `==` — an EVA that can never bind reliably (the void-identity law, ported)
  for (const m of code.matchAll(/([A-Za-z_)\]]\w*(?:\.\w+)*)\s*==\s*(\d+\.\d+|\d+\.\d*[eE][-+]?\d+)|(\d+\.\d+)\s*==/g))
    add('float-equality', m.index,
      'comparing floats with == — precision drift makes the equality silently false; compare (a - b).abs() < EPSILON');

  // R2 · `let x = x + …` inside a loop — a SEG that re-carves the name; the outer never moves
  for (const m of code.matchAll(/\blet\s+(?:mut\s+)?([A-Za-z_]\w*)\s*=\s*\1\b[^;]*[-+*/]/g))
    if (within(loops, m.index))
      add('shadowed-accumulator', m.index,
        `\`let ${m[1]} = ${m[1]} + …\` inside a loop re-binds a NEW ${m[1]} each turn; the outer ${m[1]} never updates — use \`${m[1]} += …\` on a \`let mut\``);

  // R3 · retain keeping the BELOW-threshold side — an inverted partition (heuristic, warn)
  for (const m of code.matchAll(/\.\s*retain\s*\(\s*\|[^|]*\|\s*[^)]*?<\s*(floor|min|minimum|threshold|limit|cutoff)\b/g))
    add('inverted-retain', m.index,
      `retain(|…| … < ${m[1]}) KEEPS the items below the floor and drops the rest — retain keeps the side its closure returns true for; likely inverted (>= ${m[1]})`);

  // R4 · `.parse().unwrap()` on untrusted text — a NUL fabricated into a value
  for (const m of code.matchAll(/\.\s*parse\s*(::\s*<[^>]*>)?\s*\(\s*\)\s*\.\s*unwrap\s*\(\s*\)/g))
    add('unwrap-on-parse', m.index,
      '.parse().unwrap() panics on any input that is not a number — parse returns Result; handle Err (unwrap_or / match), never unwrap untrusted text');

  // R5 · `.len() - 1` with NO empty guard — a usize underflow past the Void
  for (const m of code.matchAll(/\.\s*len\s*\(\s*\)\s*-\s*1\b/g)) {
    if (/is_empty\s*\(/.test(code.slice(Math.max(0, m.index - 240), m.index))) continue;   // guarded above
    add('usize-underflow', m.index,
      '.len() - 1 on a possibly-empty collection underflows usize (panics / wraps) — guard is_empty() first, or use .last()');
  }

  // R6 · `token[..n]` byte-slicing a str — a SEG on a boundary the UTF-8 grain forbids
  for (const m of code.matchAll(/\b([A-Za-z_]\w*)\s*\[\s*\.\.\s*([A-Za-z_]\w*|\d+)\s*\]/g))
    add('byte-slice-str', m.index,
      `${m[1]}[..${m[2]}] byte-indexes the value; on a &str this panics at a non-char boundary or past its byte length — use ${m[1]}.chars().take(${m[2]}).collect()`);

  hz.sort((a, b) => (a.line - b.line) || (a.col - b.col));
  return Object.freeze({
    module: { sign: modSeg(path ?? 'module'), path: path ?? null, lang: 'rust' },
    scopes: [{ id: 0, kind: 'module', parent: -1 }],
    decls: [], members: [], imports: [], exports: [], edges: [], uses: [], calls: [], hazards: hz,
  });
};

import { registerExtractor } from './facts.js';
registerExtractor('rust', extractRustFacts);
