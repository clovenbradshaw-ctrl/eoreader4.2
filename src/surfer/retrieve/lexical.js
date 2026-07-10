// EO: SIG·SEG(Field → Field, Tending,Dissecting) — forward token-set retrieval
// Forward token-set retrieval. The hot path — sub-millisecond on docs
// up to ~5k sentences. No async; no model; no embedder.
//
// Matching is FUZZY at the term seam: a query term the document spells exactly
// hits at full weight; a term it never spells exactly is widened to the nearest
// tokens it DOES spell ("greta"→"grete"), hitting at a distance discount so an
// exact match always outranks a fuzzy one. A term with neither an exact nor a near
// match contributes nothing — never a phantom hit. Only out-of-vocabulary terms
// pay the edit-distance scan, so the common, all-exact query is as fast as before.

import { tok } from '../../perceiver/parse/index.js';
import { fuzzyMatches } from '../../perceiver/parse/index.js';

// The document's token vocabulary — the union of every sentence's token set. Built
// once per document and cached on a WeakMap (no doc mutation), and from the SAME
// `tok` the index was built from, so the fuzzy expansion can never drift from it.
const vocabCache = new WeakMap();
export const docVocab = (doc) => {
  let v = vocabCache.get(doc);
  if (v) return v;
  v = new Set();
  for (const set of doc.tokensBySentence) for (const t of set) v.add(t);
  vocabCache.set(doc, v);
  return v;
};

export const retrieveLexical = (doc, query, k = 8) => {
  const qTokens = tok(query);
  if (qTokens.length === 0) return [];

  // Resolve each query term to the document tokens that count as a hit for it, each
  // weighted: exact = 1, a near-miss the document did spell = a discount by edit
  // distance. A term with no match resolves to itself (and simply never hits).
  const vocab = docVocab(doc);
  const accepts = qTokens.map((t) => {
    const ms = fuzzyMatches(t, vocab);
    return ms.length ? ms.map((m) => [m.token, 1 - m.dist * 0.35]) : [[t, 1]];
  });

  const out = [];
  const qLen = qTokens.length;
  for (let i = 0; i < doc.tokensBySentence.length; i++) {
    const sentSet = doc.tokensBySentence[i];
    let score = 0;
    for (const acc of accepts) {
      let best = 0;                                  // a term scores its best variant present
      for (const [t, w] of acc) if (w > best && sentSet.has(t)) best = w;
      score += best;
    }
    if (score === 0) continue;
    out.push({ idx: i, score: score / qLen, text: doc.sentences[i], kind: 'lex' });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, k);
};
