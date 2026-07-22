// EO: NUL(Void → Void, Clearing) — the typed NUL ledger
// Exactly the analysis gaps this level of reading can detect and name honestly
// (docs/code-holons.md §5) — it does not attempt the harder gaps (macro
// expansion, generated-code provenance) and does not pretend to. A gap never
// deletes a holon's prior reading; the caller (index.js) marks it stale and
// keeps it.

import { resolveSpec } from '../../organs/code/index.js';

const OPEN_TO_CLOSE = { '(': ')', '{': '}', '[': ']' };
const CLOSERS = new Set(Object.values(OPEN_TO_CLOSE));

// A direct brace/paren balance check over the NO-STRINGS scrub (comments and
// string contents already blanked, so a stray bracket inside either can never
// masquerade as a real one). facts.js's hand-rolled reader is lenient — it will
// not throw on malformed code — so this is the only way v1 notices a parse gap.
export const findParseGap = (noStrings) => {
  const stack = [];
  for (let i = 0; i < noStrings.length; i += 1) {
    const c = noStrings[i];
    if (OPEN_TO_CLOSE[c]) { stack.push({ c, i }); continue; }
    if (CLOSERS.has(c)) {
      const top = stack[stack.length - 1];
      if (!top || OPEN_TO_CLOSE[top.c] !== c) return { start: i, end: i + 1 };
      stack.pop();
    }
  }
  if (stack.length) return { start: stack[stack.length - 1].i, end: noStrings.length };
  return null;
};

const EVAL_RE = /\beval\s*\(/g;
const MEMBER_RE = /[A-Za-z_$][\w$]*\s*\[\s*([^\]]*?)\s*\]/g;
// A "static" index: a bare numeric/string/template literal, or a single bare
// identifier (`arr[i]` — the ordinary loop-counter case, resolvable to a real
// reference the same way any other use is). Anything else — a call
// (`obj[getKey()]`), a member expression (`obj[a.b]`), a computed expression
// (`obj[a + b]`) — genuinely cannot be reasoned about statically.
const isStaticIndex = (s) => /^\d+(\.\d+)?$/.test(s) || /^['"`]/.test(s) || /^[A-Za-z_$][\w$]*$/.test(s);

// eval() and computed member access with a non-static key: the same "invisible
// to any static reading" limit organs/code/facts.js already documents for
// itself, now surfaced as a typed gap instead of a silent absence.
export const findDynamicBindings = (noStrings) => {
  const out = [];
  for (const m of noStrings.matchAll(EVAL_RE)) {
    out.push({ kind: 'analysis-gap', reason: 'dynamic-binding', span: { start: m.index, end: m.index + m[0].length }, grounds: 'eval() — invisible to any static reading', retryable: false, affectedAnalyses: ['semanticVerdict'] });
  }
  for (const m of noStrings.matchAll(MEMBER_RE)) {
    const inner = (m[1] ?? '').trim();
    if (!inner || isStaticIndex(inner)) continue;
    out.push({ kind: 'analysis-gap', reason: 'dynamic-binding', span: { start: m.index, end: m.index + m[0].length }, grounds: `computed member access with a non-static key (\`${inner}\`) — invisible to any static reading`, retryable: false, affectedAnalyses: ['semanticVerdict'] });
  }
  return out;
};

// An import edge that resolves, by path arithmetic alone, to no file in the
// corpus it was handed. The file may exist on disk — this perceiver only knows
// the files it was given, so the gap is honest about scope, not a claim the
// file doesn't exist.
export const findMissingDependencies = (facts, corpusPaths) => {
  const known = new Set(corpusPaths);
  const candidatesFor = (p) => [p, `${p}.js`, `${p}.mjs`, `${p}.jsx`, `${p}.ts`, `${p}.tsx`, `${p}/index.js`, `${p}/index.mjs`];
  const out = [];
  for (const e of facts.edges ?? []) {
    if (!['import', 'require', 'dynamic', 'reexport'].includes(e.kind)) continue;
    const resolved = resolveSpec(facts.module?.path ?? '', e.spec);
    if (resolved.external) continue;
    if (candidatesFor(resolved.path).some((c) => known.has(c))) continue;
    out.push({ kind: 'analysis-gap', reason: 'missing-dependency', span: null, spec: e.spec, grounds: `import '${e.spec}' resolves to no file in the given corpus`, retryable: true, affectedAnalyses: ['propagation'] });
  }
  return out;
};

// detectNulls(facts, variants, corpusPaths) — variants is fingerprint.js's
// codeVariants(text), reused rather than re-scrubbed.
export const detectNulls = (facts, variants, corpusPaths = []) => {
  const nulls = [];
  const gap = findParseGap(variants.noStrings);
  if (gap) nulls.push({ kind: 'analysis-gap', reason: 'parse-gap', span: gap, grounds: 'unbalanced brackets in the scrubbed source', retryable: true, affectedAnalyses: ['admission', 'semanticVerdict'] });
  nulls.push(...findDynamicBindings(variants.noStrings));
  nulls.push(...findMissingDependencies(facts, corpusPaths));
  return nulls;
};
