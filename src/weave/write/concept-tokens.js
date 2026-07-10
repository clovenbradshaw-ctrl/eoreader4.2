// EO: CON·SYN·SIG(Entity,Field → Link,Network, Binding,Composing,Tending) — the bridge; concept->token map + entity trie (Track B)
// concept-tokens.js — THE BRIDGE (spec-the-lens-port.md, Track B).
//
// The lens lives over figures, operators and eigen-lenses; logits live over BPE
// fragments. This module is the ONE object that makes the two commensurable, and the
// spec is blunt that it is the centre of the design, not an inconvenience to route
// around: "Build this map for one document and measure whether first-token biasing
// actually moves the surface before committing to it. That measurement decides whether
// the whole idea holds."
//
// The map is built PER DOCUMENT from the ACTUAL surface forms that appear — the entity
// labels the parse admitted (INS events) and the numerals in the text — tokenised with
// the model's OWN tokenizer (injected here as a seam so this module is pure and Node-
// testable; the WebLLM adapter fills it via @mlc-ai/web-tokenizers `Tokenizer.fromJSON`,
// byte-identical to the engine's ids). Two disciplines keep first-token biasing honest:
//
//   • build from real surface forms — exact for the grounded set, and the entity spans
//     you tokenise ARE the void's permitted-entity trie for free; and
//   • gate the up-weight to WORD BOUNDARIES — apply it only when the previous token closed
//     a word, so an up-weight never lands mid-word and produces garbage.
//
// The general form is a weighted prefix trie; the GBNF grammar is the special case where
// weights are 0/−∞ and the lens the case where they are finite (lens-port.js owns that).
//
// The injected tokenizer seam:
//   tokenizer = { encode(text) -> number[],  decode(token|number[]) -> string }
// `encode` must tokenise a bare string into the model's token ids; `decode` must invert a
// single id (or a list) back to text. Byte-level BPE marks a word start with a leading
// space, so every surface form is encoded in BOTH its ' form' (word-initial) and 'form'
// (mid-text) variants — the word-initial first token is the one the lens up-weights.

// docEvents — the append-only log, snapshot-or-events, defensively (matches salience.js).
const docEvents = (doc) =>
  typeof doc?.log?.snapshot === 'function' ? doc.log.snapshot() : (doc?.log?.events || []);

// groundedSurfaceForms — the entity surface forms the parse admitted, in ORIGINAL case
// (INS events carry the minted label). Deduped, longest-first so a multi-word name is
// tried before its bare head when both are grounded.
export const groundedSurfaceForms = (doc) => {
  const seen = new Set();
  const forms = [];
  for (const e of docEvents(doc)) {
    if (e.op !== 'INS' || e.id == null) continue;
    const label = String(e.label || '').trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    forms.push(label);
  }
  return forms.sort((a, b) => b.length - a.length);
};

// A number-shaped surface token: any run that carries a digit (years, counts, dates,
// percentages). Drawn from the document text so a number IS grounded only when a span
// actually carries it — the spec's "a number that is not in a span has no business in the
// surface."
const NUMBER_RE = /\d(?:[\d,.:/–-]*\d)?/g;   // separators only BETWEEN digits — no trailing '.'
export const groundedNumbers = (doc) => {
  const out = new Set();
  for (const s of (doc?.sentences || [])) {
    const m = String(s).match(NUMBER_RE);
    if (m) for (const n of m) out.add(n);
  }
  return out;
};

// ── The permitted-entity trie ────────────────────────────────────────────────────────
// A prefix trie over the WORD-INITIAL token sequences of the grounded entity forms. The
// void gate (lens-port.js) walks it once a word begins on a grounded entity's first token:
// from then until the word closes, only trie continuations are admitted, so "Gregor
// Schmidt" cannot be minted when only "Gregor Samsa" is grounded — the invented-name lie
// becomes structurally unavailable rather than vetoed in hindsight. A fresh word that does
// NOT begin on any entity's first token never enters the trie, so ordinary prose is free.
export const buildEntityTrie = (forms, tokenizer) => {
  const root = { children: new Map(), word: false };
  const firstTokens = new Set();
  for (const form of forms) {
    const ids = tokenizer.encode(' ' + form);   // word-initial variant
    if (!ids.length) continue;
    firstTokens.add(ids[0]);
    let node = root;
    for (const id of ids) {
      let next = node.children.get(id);
      if (!next) { next = { children: new Map(), word: false }; node.children.set(id, next); }
      node = next;
    }
    node.word = true;
  }
  return {
    root,
    // Does `token` begin a grounded entity (i.e. could open the trie)?
    opens: (token) => firstTokens.has(token),
    // Step from `node` by `token`; null if the token leaves every grounded path.
    step: (node, token) => (node ? node.children.get(token) || null : null),
    // Has a complete grounded name been spelled at `node`?
    isWord: (node) => !!node && node.word,
  };
};

// ── The concept → token map ────────────────────────────────────────────────────────────
// buildConceptTokenMap(doc, surf, tokenizer) → the bridge object the lens port writes
// through. `surf` is optional and only used to surface the focus figure first; the grounded
// set comes from the document, not the surfer.
export const buildConceptTokenMap = (doc, surf, tokenizer, { extraForms = [] } = {}) => {
  if (!doc || !tokenizer || typeof tokenizer.encode !== 'function') {
    return emptyMap();
  }
  // Track F: fold in the surfaces a span-gated REC re-grounded on prior turns (lens-port.js
  // approvedSurfaces) — the trie tightens itself across the session without minting new holes.
  const seen = new Set();
  const forms = [...groundedSurfaceForms(doc), ...extraForms.map(String)]
    .filter(f => f && f.trim() && !seen.has(f.toLowerCase()) && seen.add(f.toLowerCase()))
    .sort((a, b) => b.length - a.length);
  const numbers = groundedNumbers(doc);

  // figure label (lowercased, as the surfer/log key) → its token realisations.
  const wordInitial = new Map();   // label -> number[]  (' form')
  const midText     = new Map();   // label -> number[]  ('form')
  let cleanFirstToken = 0, lossyMultiToken = 0;
  for (const form of forms) {
    const key = form.toLowerCase();
    if (wordInitial.has(key)) continue;
    const wi = tokenizer.encode(' ' + form);
    const mt = tokenizer.encode(form);
    wordInitial.set(key, wi);
    midText.set(key, mt);
    if (wi.length === 1) cleanFirstToken += 1; else if (wi.length > 1) lossyMultiToken += 1;
  }

  // The numeral gate's allow-set: every token id that participates in a grounded number,
  // both variants. A number-shaped token NOT in this set is ungrounded.
  const groundedNumberTokens = new Set();
  for (const n of numbers) {
    for (const id of tokenizer.encode(' ' + n)) groundedNumberTokens.add(id);
    for (const id of tokenizer.encode(n))       groundedNumberTokens.add(id);
  }

  const trie = buildEntityTrie(forms, tokenizer);

  return Object.freeze({
    figures: forms.map(f => f.toLowerCase()),
    forms,
    focus: surf?.focus || null,
    // The word-initial first token of a figure — the one the lens up-weights at a boundary.
    firstTokenOf: (label) => {
      const ids = wordInitial.get(String(label || '').toLowerCase());
      return ids && ids.length ? ids[0] : null;
    },
    tokensOf: (label) => (wordInitial.get(String(label || '').toLowerCase()) || []).slice(),
    entityTrie: trie,
    groundedNumberTokens,
    isNumberToken: makeIsNumberToken(tokenizer),
    isGroundedNumberToken: (token) => groundedNumberTokens.has(token),
    coverage: Object.freeze({
      figuresMapped: wordInitial.size,
      cleanFirstToken,
      lossyMultiToken,
      groundedNumbers: numbers.size,
    }),
  });
};

const emptyMap = () => Object.freeze({
  figures: [], forms: [], focus: null,
  firstTokenOf: () => null,
  tokensOf: () => [],
  entityTrie: buildEntityTrie([], { encode: () => [] }),
  groundedNumberTokens: new Set(),
  isNumberToken: () => false,
  isGroundedNumberToken: () => false,
  coverage: Object.freeze({ figuresMapped: 0, cleanFirstToken: 0, lossyMultiToken: 0, groundedNumbers: 0 }),
});

// isNumberToken — does this single token decode to text carrying a digit? Memoised per
// tokenizer so the per-step decode is paid once per id, not once per step.
const makeIsNumberToken = (tokenizer) => {
  const cache = new Map();
  return (token) => {
    if (cache.has(token)) return cache.get(token);
    let v = false;
    try { v = /\d/.test(tokenizer.decode([token])); } catch { v = false; }
    cache.set(token, v);
    return v;
  };
};

// ── Word boundaries ────────────────────────────────────────────────────────────────────
// wordBoundaryClosed(surface) → did the previous token close a word, so an up-weight on a
// word-initial token is safe? Computed from the running decoded surface alone (the history
// processSampledToken accumulates), so it is tokenizer-agnostic: a boundary is open at the
// start, after whitespace, or after sentence/clause punctuation.
export const wordBoundaryClosed = (surface) => {
  const s = String(surface || '');
  if (s.length === 0) return true;
  return /[\s([{"'‘“.,;:!?–—-]$/.test(s);
};

// measureBridge — THE afternoon measurement (spec Track B). How much of the grounded set
// maps to a single word-initial token (where first-token biasing is exact) versus a lossy
// multi-token entry (where the trie entry is needed). Surfaced by scripts/lens-port-probe.mjs.
export const measureBridge = (doc, surf, tokenizer) => {
  const map = buildConceptTokenMap(doc, surf, tokenizer);
  const { figuresMapped, cleanFirstToken, lossyMultiToken, groundedNumbers } = map.coverage;
  return Object.freeze({
    figuresMapped,
    cleanFirstToken,
    lossyMultiToken,
    groundedNumbers,
    cleanFraction: figuresMapped ? cleanFirstToken / figuresMapped : 0,
  });
};
