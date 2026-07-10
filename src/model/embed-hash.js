// EO: SIG(Field → Atmosphere, Tending) — hash embedder
// A hash-based embedder. Deterministic, zero-warmup. Used by tests and
// as the default until the real embedder is warmed.
//
// Vectors are 64-dim, L2-normalised. Tokens hash to dimensions via FNV-1a.
// Cosine similarity over these vectors is a (very rough) bag-of-words
// measure — enough to exercise the pipeline; not enough for real semantics.

import { tok } from '../perceiver/parse/index.js';

const DIM = 64;

const hash = (t) => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
};

export const createHashEmbedder = () => {
  const cache = new Map();
  return {
    id: 'hash-embed',
    // The no-commit guard: this is the hash organ, not MiniLM. Its vectors live
    // in spelling space, so a cosine here is a (rough) bag-of-words overlap, not
    // a meaning-distance. The phasepost classifier reads this flag and holds
    // every position at no-commit rather than let spelling masquerade as
    // meaning. A verb classified by spelling is the hardcoded list with extra
    // steps — exactly what measurement-not-choice exists to avoid.
    measuresMeaning: false,
    organ: 'hash',
    isWarm: () => true,
    async warm() { /* always warm */ },
    async embed(text) {
      const key = String(text);
      if (cache.has(key)) return cache.get(key);
      const v = new Float32Array(DIM);
      for (const t of tok(text)) v[hash(t) % DIM] += 1;
      let norm = 0;
      for (let i = 0; i < DIM; i++) norm += v[i] * v[i];
      norm = Math.sqrt(norm) || 1;
      for (let i = 0; i < DIM; i++) v[i] /= norm;
      cache.set(key, v);
      return v;
    },
  };
};
