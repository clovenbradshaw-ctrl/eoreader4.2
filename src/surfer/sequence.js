// EO: REC·EVA(Field,Network → Network,Field, Composing,Tracing) — learned-sequence reader (n-gram)
// The learned-sequence reader — prediction from the signal's own regularities.
//
// `reading.js` predicts who-acts-next by γ-mass alone: the warmest figure, a
// recency bet with no memory of ORDER. It answers "who is present a lot lately",
// never "after THIS, what tends to follow". For a melody that predicts the
// locally loud note, not the next one.
//
// This is the other fold. It is the same move the conventions ledger makes for
// language — "nothing is hard-coded true; a convention is whatever the signal
// keeps doing, learned" (a REC fold) — applied to TRANSITIONS. The reader
// watches the INS stream go by and folds, γ-weighted for recency, how often a
// CONTEXT (the last k units) was followed by each next unit. To predict it reads
// off the row for the current context, backing off to shorter contexts when the
// long one is unseen. There is no scale, no key, no consonance table, no
// preference of any kind in here: the model is empty until the signal fills it,
// and an order-k n-gram is the canonical zero-knowledge sequence learner. Hand
// it text and it learns word-order; hand it a melody and it learns the tune —
// the same code, no domain knowledge.
//
// `order` is the only structural knob: order 1 (a plain Markov chain) cannot
// hold a melody, whose figure is the PHRASE, not the single step — after C the
// tune may go anywhere; after "C D" it is committed. Raising the order lets the
// reader hold enough context to anticipate the repeat. `gamma` sets how long the
// memory lasts; at 1 it counts flat (full recall across a whole piece).

import { noveltyAmplitude } from '../core/index.js';

const GAMMA = 0.9;     // recency decay along the reading line (slower than the
                       // graph's 0.7 — a learner must outlast a phrase to recall it)
const ORDER = 2;       // context length; 1 = Markov chain, the order reading.js implies
const NOVELTY = 1.0;   // reserve mass for an as-yet-unobserved continuation (the SEED)

const snapshot = (log) =>
  typeof log.snapshot === 'function' ? log.snapshot() : (log.events || []);

const sum = (it) => { let s = 0; for (const w of it) s += w; return s; };

// The ordered stream of unit → entity id: the first INS at each unit index, in
// reading order. For a melody that is the note at each beat; for a one-entity-
// per-unit signal it is the signal itself. `repOf` canonicalises each id to its
// merged representative — pass a projection's `representative` to read the stream
// in terms of DISCOVERED equivalence classes rather than raw per-occurrence ids.
export const unitIdSequence = (doc, repOf = (x) => x) => {
  const firstAt = new Map();
  for (const e of snapshot(doc.log)) {
    if (e.op === 'INS' && e.sentIdx != null && !firstAt.has(e.sentIdx)) {
      firstAt.set(e.sentIdx, e.id);
    }
  }
  const max = firstAt.size ? Math.max(...firstAt.keys()) : -1;
  const seq = [];
  for (let i = 0; i <= max; i++) if (firstAt.has(i)) seq.push(repOf(firstAt.get(i)));
  return seq;
};

// Fold the n-grams observed strictly BEFORE position `at`, γ-weighted by how long
// ago each was seen. `grams[j]` maps a length-j context (the last j units, keyed)
// to the distribution of what followed it; `uni` is the order-0 backoff (the same
// γ-mass prior reading.js builds).
const foldBefore = (seq, at, gamma, order, signalReserve = false) => {
  const grams = Array.from({ length: order + 1 }, () => new Map());
  const uni = new Map();
  const firstSeen = new Map();           // id → first position (the protention's birth record)
  for (let i = 0; i < at; i++) {
    const recency = Math.pow(gamma, at - 1 - i);
    uni.set(seq[i], (uni.get(seq[i]) || 0) + recency);
    if (!firstSeen.has(seq[i])) firstSeen.set(seq[i], i);
    for (let j = 1; j <= order && i - j >= 0; j++) {
      const ctx = seq.slice(i - j, i).join('>');
      const row = grams[j].get(ctx) || new Map();
      row.set(seq[i], (row.get(seq[i]) || 0) + recency);
      grams[j].set(ctx, row);
    }
  }
  // The SIGNAL-DERIVED reserve (the same protention reading.js grows) — the γ-decayed rate of
  // first-appearances over the open basis, applied to the order-0 backoff. OFF → the SEED →
  // byte-identical. Cold-start falls back to the SEED so the open basis is never zero-reserve.
  const reserve = signalReserve
    ? (noveltyAmplitude([...firstSeen.values()], at, gamma) || NOVELTY)
    : NOVELTY;
  return { grams, uni, order, reserve };
};

// The predictive distribution over the next unit given the recent context. Starts
// from the unigram mass and nests in each higher order that has seen this context,
// trusting an order in proportion to its evidence (α = mass/(mass+1)) — standard
// interpolated backoff, no domain bias. A NOVELTY reserve always holds mass for a
// continuation never seen, so the model is never certain and surprise stays finite.
const distribution = (model, ctx) => {
  const { grams, uni, order } = model;
  const reserve = model.reserve ?? NOVELTY;      // signal-derived (foldBefore) or the SEED
  const Zuni = sum(uni.values()) + reserve;
  let p = new Map();
  for (const [id, w] of uni) p.set(id, w / Zuni);
  let pNovel = reserve / Zuni;

  for (let j = 1; j <= order && j <= ctx.length; j++) {
    const key = ctx.slice(ctx.length - j).join('>');
    const row = grams[j].get(key);
    if (!row) continue;
    const Zrow = sum(row.values()) + NOVELTY;
    const alpha = (Zrow - NOVELTY) / (Zrow - NOVELTY + 1);   // confidence in this order
    const support = new Set([...p.keys(), ...row.keys()]);
    const np = new Map();
    for (const id of support) {
      const pr = (row.get(id) || 0) / Zrow;
      np.set(id, alpha * pr + (1 - alpha) * (p.get(id) || 0));
    }
    p = np;
    pNovel = alpha * (NOVELTY / Zrow) + (1 - alpha) * pNovel;
  }
  return { p, pNovel };
};

// Predict the next unit from the model learned so far, given the recent context
// (an array of recent ids, newest last; a bare id is accepted too).
export const predictNextUnit = (model, context) => {
  const ctx = Array.isArray(context) ? context : [context];
  const { p, pNovel } = distribution(model, ctx);
  const ranked = [...p.entries()].sort((a, b) => b[1] - a[1]).map(([id, prob]) => ({ id, prob }));
  return { ranked, top: ranked[0]?.id ?? null, pNovel };
};

// Walk the whole signal, predicting each unit from the model learned up to the
// unit before it, and scoring the surprise of what actually came — the learned
// counterpart of readingAt's recency surprise: −log₂ of the probability the
// LEARNED model gave the unit that landed, squashed to [0,1). `learned` is true
// once the current context has led somewhere before (a recollection, not a guess).
export const predictiveSequenceReading = (doc, { gamma = GAMMA, order = ORDER, repOf, signalReserve = false } = {}) => {
  const seq = unitIdSequence(doc, repOf);
  const labelOf = labelMap(doc);
  const steps = [];
  for (let at = 1; at < seq.length; at++) {
    const model = foldBefore(seq, at, gamma, order, signalReserve);
    const ctx = seq.slice(Math.max(0, at - order), at);
    const actual = seq[at];
    const { ranked, top, pNovel } = predictNextUnit(model, ctx);
    const pActual = (ranked.find(r => r.id === actual)?.prob) ?? pNovel;
    const bits = -Math.log2(Math.max(pActual, 1e-6));
    const ctxKey = ctx.join('>');
    steps.push({
      at,
      cur: ctx[ctx.length - 1], curLabel: ctx.map(labelOf).join(' '),
      predicted: top, predictedLabel: labelOf(top),
      actual, actualLabel: labelOf(actual),
      hit: top === actual,
      learned: model.grams[Math.min(order, ctx.length)].has(ctxKey),
      pActual: round(pActual),
      bits: round(bits),
      surprise: round(1 - Math.pow(2, -bits)),
      ranked: ranked.slice(0, 3).map(r => ({ label: labelOf(r.id), prob: round(r.prob) })),
    });
  }
  return steps;
};

const labelMap = (doc) => {
  const label = new Map();
  for (const e of snapshot(doc.log)) if (e.op === 'INS' && !label.has(e.id)) label.set(e.id, e.label);
  return (id) => (id == null ? null : (label.get(id) || id));
};

const round = (x) => Math.round(x * 1000) / 1000;
