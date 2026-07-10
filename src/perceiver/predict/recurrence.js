// EO: SIG(Field → Atmosphere, Tracing) — recurrence prior, Phase 1
// Phase 1 — the recurrence prior. An n-gram over the move alphabet, estimated
// from the log up to the cursor and nothing else.
//
// Given the moves so far, what move has tended to follow this pattern earlier in
// THIS same reading? The DEF→EVA→EVA→REC cycle, the INS→SIG run on a fresh
// figure — these are recurrences in the operator stream, and a count-based n-gram
// over an alphabet of ten is enough to read them. The model is an interpolation of
// a bigram (last move → next) with a unigram (the marginal), each add-α smoothed
// so every symbol keeps a floor of probability — the prior for the as-yet-unseen,
// the n-gram's reserve for a move this pattern has not produced before.
//
// It is the persistence/recurrence baseline of the move-predictor: cheap, no model,
// no learning beyond counting, entirely from the log you already have.

// How fast the bigram is trusted over the unigram as context accrues. With few
// observations of `last`, the estimate leans on the marginal; once `last` has been
// seen K times the bigram carries half the weight, more beyond.
const TRUST_K = 4;

// Build the recurrence distribution over `alphabet` for the move after `movesSoFar`.
// `movesSoFar` is the prefix of the move-log up to and including the cursor — the
// last element's op is the bigram context. Returns an object op→probability summing
// to 1 over the whole alphabet (every symbol non-zero, the smoothing floor).
export const recurrencePrior = (movesSoFar, alphabet, { alpha = 0.5 } = {}) => {
  const V = alphabet.length;
  const uni = new Map(alphabet.map(op => [op, 0]));   // count(op)
  const big = new Map();                               // "prev|op" → count
  const ctx = new Map(alphabet.map(op => [op, 0]));   // count(prev) as a context

  let prev = null;
  for (const m of movesSoFar) {
    const op = m.op;
    if (!uni.has(op)) continue;                        // ignore anything off-alphabet
    uni.set(op, uni.get(op) + 1);
    if (prev != null) {
      big.set(`${prev}|${op}`, (big.get(`${prev}|${op}`) || 0) + 1);
      ctx.set(prev, (ctx.get(prev) || 0) + 1);
    }
    prev = op;
  }

  const N = movesSoFar.length;
  const last = prev;                                   // the bigram context: the final move's op
  const ctxN = last != null ? (ctx.get(last) || 0) : 0;
  const lambda = ctxN / (ctxN + TRUST_K);              // how much to trust the bigram

  const dist = {};
  let Z = 0;
  for (const op of alphabet) {
    const pUni = (uni.get(op) + alpha) / (N + alpha * V);
    const pBig = last != null
      ? ((big.get(`${last}|${op}`) || 0) + alpha) / (ctxN + alpha * V)
      : pUni;
    const p = lambda * pBig + (1 - lambda) * pUni;
    dist[op] = p;
    Z += p;
  }
  for (const op of alphabet) dist[op] /= Z;            // renormalise (guards float drift)
  return dist;
};
