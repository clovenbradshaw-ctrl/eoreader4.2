// EO: SIG·SEG(Field → Field, Tending,Clearing) — vague-query density fold
// impressionQuery — embed the query, find the region of the document with
// the highest field density, fold that region. Useful for vague questions
// where lexical retrieval surfaces nothing crisp.

import { foldNote } from './integral.js';

export const impressionQuery = async (doc, query, embedder, k = 6) => {
  if (!embedder || !embedder.isWarm()) return null;
  if (typeof doc.sentenceEmbeddings !== 'function') return null;
  const qVec = await embedder.embed(query);
  const vecs = await doc.sentenceEmbeddings(embedder);
  const scored = vecs.map((v, idx) => ({
    idx, score: cosine(qVec, v),
    text: doc.sentences[idx],
  }));
  scored.sort((a, b) => b.score - a.score);
  return foldNote(scored.slice(0, k));
};

const cosine = (a, b) => {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
};
