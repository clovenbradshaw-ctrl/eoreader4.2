// EO: SIG(Field → Entity, Binding) — the five-hash fingerprint
// What might preserve a holon's identity through movement or cosmetic change
// (docs/code-holons.md §2). Five hashes, each answering a narrower question than
// the last, so the equivalence ladder (§4.1) can read off exactly which one first
// diverged instead of collapsing everything into one "changed" bit:
//
//   mechanicalHash        comments stripped, whitespace collapsed
//   normalizedSyntaxHash  + every LOCAL binding alpha-renamed to a position slot
//   referenceShapeHash    the sorted set of FREE (non-local) references
//   controlFlowHash       the sequence of control keywords
//   literalProfileHash    the sequence of operator + literal tokens
//
// Built on organs/code/facts.js's own scrub() (comment/string-aware, offset- and
// length-preserving) — no new tokenizer. scopeSubtree/resolveBinding (scope.js)
// supply the lexical-scope walk alpha-renaming needs.

import { scrub } from '../../organs/code/index.js';
import { scopeSubtree, resolveBinding } from './scope.js';

// FNV-1a over a string -> an 8-hex-digit stable digest. Not cryptographic — a
// tamper-evident, deterministic content digest, the same family the rest of the
// system uses for identity (src/core/holon.js, src/coder/ledger.js).
const fnv1a = (s) => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
};
export const hashText = (s) => fnv1a(String(s ?? ''));

const collapseWs = (s) => s.replace(/\s+/g, ' ').trim();

// Token scanners run over the NO-STRINGS scrub for keyword/operator/number
// matching (a string like "if you can" must never masquerade as a control-flow
// keyword) and over the WITH-STRINGS scrub only to read actual string contents.
const CONTROL_RE = /\b(if|else|for|while|switch|case|try|catch|finally|return|throw|break|continue|do)\b/g;
const OPERATOR_RE = /(===|!==|==|!=|<=|>=|&&|\|\||\?\?|\+\+|--|=>|\*\*|[+\-*/%<>&|^~!])/g;
const NUMBER_RE = /\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g;
const BOOL_NULL_RE = /\b(true|false|null|undefined|NaN)\b/g;
const STRING_RE = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g;

const matchesInOrder = (re, text) => {
  const out = [];
  re.lastIndex = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    out.push(m[0]);
    if (m[0].length === 0) re.lastIndex += 1;
  }
  return out;
};

// Both scrub variants, built once per file read and sliced per holon — scrub()
// is already O(n); paying it once per file (not once per holon) keeps this cheap.
export const codeVariants = (text) => ({
  noStrings: scrub(text),
  withStrings: scrub(text, { keepStrings: true }),
});

// The alpha-renaming substitution table for one holon: every LOCAL identifier
// occurrence — its own declaration site, plus every use resolving (by lexical
// scope walk) to a declaration inside the holon's own scope subtree — mapped to
// a stable position-ordinal placeholder. Locals are numbered by first
// DECLARATION order (not first use), so two holons declaring the same locals in
// the same order alpha-match regardless of read order. `excludeOffset` lets the
// caller keep the holon's OWN name out of the substitution: it is redacted
// separately (see `fingerprintOf`'s `selfName`), never folded into the local
// ordinal sequence, or a rename would shift every local's ordinal by one.
export const localSubstitutions = (facts, index, rootScopeId, span, excludeOffset = -1) => {
  const subtree = scopeSubtree(facts, rootScopeId);
  const ordinal = new Map();      // decl (by identity) -> ordinal, assigned once per decl
  let next = 0;
  const subs = [];
  const assign = (decl, offset, length) => {
    if (offset === excludeOffset) return;
    if (!ordinal.has(decl)) { ordinal.set(decl, next); next += 1; }
    subs.push({ offset, length, token: `_L${ordinal.get(decl)}` });
  };
  for (const d of facts.decls) {
    if (!subtree.has(d.scopeId)) continue;
    if (d.offset < span.start || d.offset >= span.end) continue;
    assign(d, d.offset, d.name.length);
  }
  for (const u of facts.uses) {
    if (u.offset < span.start || u.offset >= span.end) continue;
    if (!subtree.has(u.scopeId)) continue;
    const decl = resolveBinding(index, u.scopeId, u.name);
    if (!decl || !subtree.has(decl.scopeId)) continue;   // free/global — leave untouched
    assign(decl, u.offset, u.name.length);
  }
  subs.sort((a, b) => a.offset - b.offset);
  return subs;
};

// Replace each `{offset,length,token}` span with its token, inside
// [span.start, span.end) only. Offsets are in the shared original/scrubbed
// coordinate space (scrub() preserves length and position by construction).
// Substitutions must be pre-sorted by offset and non-overlapping.
const applyTokens = (text, span, subs) => {
  let out = '';
  let cursor = span.start;
  for (const { offset, length, token } of subs) {
    if (offset < cursor || offset >= span.end) continue;
    out += text.slice(cursor, offset) + token;
    cursor = offset + length;
  }
  out += text.slice(cursor, span.end);
  return out;
};

// The FREE (non-local) references inside a holon's span: sorted, deduped
// `name:kind[,kind...]` entries — what the holon reaches OUTSIDE its own scope.
export const referenceShape = (facts, index, rootScopeId, span) => {
  const subtree = scopeSubtree(facts, rootScopeId);
  const seen = new Map();
  for (const u of facts.uses) {
    if (u.offset < span.start || u.offset >= span.end) continue;
    if (!subtree.has(u.scopeId)) continue;
    const decl = resolveBinding(index, u.scopeId, u.name);
    if (decl && subtree.has(decl.scopeId)) continue;     // bound to a local — not free
    if (!seen.has(u.name)) seen.set(u.name, new Set());
    seen.get(u.name).add(u.call ? 'call' : u.kind);
  }
  return [...seen.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, kinds]) => `${name}:${[...kinds].sort().join(',')}`);
};

// The five hashes for one holon span. `variants` is codeVariants(fileText);
// `index` is scope.js's indexFacts(facts); `span` is {start,end} byte offsets.
//
// `selfName` — {offset,length} of the holon's OWN declared-name occurrence,
// when the span's header includes it (holon.js extends function/class spans
// leftward to cover the signature, so a parameter or contract edit actually
// moves the hash). It is redacted with a FIXED placeholder in BOTH
// mechanicalHash and normalizedSyntaxHash — a rename must not, by itself, move
// either hash; only a real content change should. It is never counted as a
// local (excluded from the alpha-renaming ordinal sequence, so it can't shift
// every real local's ordinal).
export const fingerprintOf = (facts, index, rootScopeId, span, variants, { selfName = null } = {}) => {
  const { noStrings, withStrings } = variants;
  const nameSub = selfName ? [{ offset: selfName.offset, length: selfName.length, token: ' NAME ' }] : [];

  const mechSlice = applyTokens(withStrings, span, nameSub);
  const mechanicalHash = hashText(collapseWs(mechSlice));

  const localSubs = localSubstitutions(facts, index, rootScopeId, span, selfName?.offset ?? -1);
  const normSlice = applyTokens(withStrings, span, [...nameSub, ...localSubs].sort((a, b) => a.offset - b.offset));
  const normalizedSyntaxHash = hashText(collapseWs(normSlice));

  const refShape = referenceShape(facts, index, rootScopeId, span);
  const referenceShapeHash = hashText(refShape.join('|'));

  const raw = withStrings.slice(span.start, span.end);
  const ctrlSlice = noStrings.slice(span.start, span.end);
  const controlFlowHash = hashText(matchesInOrder(CONTROL_RE, ctrlSlice).join(','));

  const opsAndLiterals = [
    ...matchesInOrder(OPERATOR_RE, ctrlSlice),
    ...matchesInOrder(NUMBER_RE, ctrlSlice),
    ...matchesInOrder(BOOL_NULL_RE, ctrlSlice),
    ...matchesInOrder(STRING_RE, raw),
  ];
  const literalProfileHash = hashText(opsAndLiterals.join(''));

  return Object.freeze({ mechanicalHash, normalizedSyntaxHash, referenceShapeHash, controlFlowHash, literalProfileHash });
};

export const fingerprintsEqual = (a, b, keys = ['mechanicalHash', 'normalizedSyntaxHash', 'referenceShapeHash', 'controlFlowHash', 'literalProfileHash']) =>
  !!a && !!b && keys.every((k) => a[k] === b[k]);
