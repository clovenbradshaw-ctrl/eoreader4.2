// EO: SIG·SEG(Field → Field, Tending,Dissecting) — embedding cosine retrieval
// Semantic retrieval. Uses the embedder if warm; otherwise returns nothing.
// The hot lexical path never blocks on this.
//
// The doc's clause / sentence embeddings are cached on the doc itself (set up in
// ingest), so a turn re-uses them across retrieval, fold, and form.
//
// CLAUSE GRAIN (perceiver/parse/clause-layer.js) — the RAG-competitive edge. When the
// doc carries a clause layer, we score the query against each CLAUSE, not each pooled
// SENTENCE, so a compound sentence whose one relevant clause sits beside three
// irrelevant ones is no longer diluted below the fold — the intra-sentence match RAG
// chunking chases, without a chosen chunk size. The MATCH is clause-precise; the
// CITATION stays sentence-precise (`idx` is the clause's sentIdx, so the fold binds it
// exactly as before — "its index is real"). We keep the best-scoring clause per
// sentence so one sentence never floods the top-k with its own fragments. Without a
// clause layer (a non-text organ, or a doc built by bare parseText) we fall back to the
// sentence-grain path, byte-identical to before.

export const retrieveSemantic = async (doc, query, embedder, k = 8) => {
  if (!embedder || !embedder.isWarm()) return [];

  if (Array.isArray(doc.clauses) && doc.clauses.length && typeof doc.clauseEmbeddings === 'function') {
    const qVec = await embedder.embed(query);
    const vecs = await doc.clauseEmbeddings(embedder);
    // Best-scoring clause per sentence — clause-precise match, sentence-precise cite.
    const bySentence = new Map();
    vecs.forEach((v, i) => {
      const c = doc.clauses[i];
      if (!c) return;
      const score = cosine(qVec, v);
      const prev = bySentence.get(c.sentIdx);
      if (!prev || score > prev.score) bySentence.set(c.sentIdx, { idx: c.sentIdx, score, text: c.text });
    });
    return [...bySentence.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(s => ({ idx: s.idx, score: s.score, text: s.text, kind: 'sem' }));
  }

  // Sentence-grain fallback (no clause layer on this doc).
  if (typeof doc.sentenceEmbeddings !== 'function') return [];
  const qVec = await embedder.embed(query);
  const vecs = await doc.sentenceEmbeddings(embedder);
  const out = vecs.map((v, idx) => ({ idx, score: cosine(qVec, v) }));
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, k).map(s => ({
    idx: s.idx,
    score: s.score,
    text: doc.sentences[s.idx],
    kind: 'sem',
  }));
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
