// EO: EVA·REC(Paradigm,Field → Lens, Binding,Composing) — grammar-based form scorer
// The MODEL-FREE half of the form predictor: score a draft against a fitted move-grammar
// (data/shapes.json, tools/shape-fit.mjs) instead of against response-embedding cosines.
//
// A shape here is a bigram transition matrix over the DEPICTED move alphabet — form with
// the tokens thrown away (turn/depicted.js). Scoring a draft is a likelihood under that
// matrix, not a cosine: parse the draft (the reader's own parse, deterministic, no
// model), reduce it to depicted moves, and ask how probable that sequence is under the
// target intent's grammar VERSUS under the contrast grammar fit from assistant corpora
// (chatbot-ese). The margin is the discriminant: negative means this draft's FORM sits
// closer to the assistant basin than to the wanted kind of answer.
//
// Two properties the embedding path could not give:
//   modelless   the whole scoring path is parse + arithmetic — no embedder, no warmup,
//               usable before (or without) MiniLM. Only NAVIGATION (which intent a live
//               question wants) still needs an embedder (turn/shape.js matchPrompt).
//   data-driven thresholds — each intent ships the leave-one-out margin distribution of
//               its own exemplars (fit time, tools/shape-fit.mjs), so "off-basin" means
//               "scores worse than this intent's own examples score against the same
//               contrast," not a hand-tuned constant.

import { depictedMoves } from './depicted.js';

// The bundled fitted shapes — a same-origin asset, fetched like the phasepost cells.
const SHAPES_URL = new URL('../../data/shapes.json', import.meta.url).href;
// Own DB, not the centroids loader's 'eoreader4': two modules sharing one IDB name at
// the same version would each see only the object store whichever ran first created.
const DB = 'eoreader4-shapes', STORE = 'shapes';

const LOG2 = Math.log(2);

// Mean per-move log2-likelihood of a depicted move sequence under a fitted grammar:
// the first move against the marginal, each following move against its predecessor's
// transition row. Length-normalised (mean, not sum) so a long draft is not penalised
// for being long — only for moving unlike the grammar moves. Null when the sequence
// carries no scorable move (an empty draft has no form to score).
export const sequenceLogLikelihood = (moves, grammar) => {
  if (!grammar?.marginal || !grammar?.trans) return null;
  const alpha = grammar.alphabet || Object.keys(grammar.marginal);
  const inAlpha = new Set(alpha);
  const seq = (moves || []).map((m) => (typeof m === 'string' ? m : m?.op)).filter((op) => inAlpha.has(op));
  if (!seq.length) return null;
  const floor = 1e-9;
  let bits = 0;
  bits += Math.log(Math.max(grammar.marginal[seq[0]] ?? 0, floor)) / LOG2;
  for (let i = 1; i < seq.length; i++) {
    const row = grammar.trans[seq[i - 1]] || grammar.marginal;
    bits += Math.log(Math.max(row[seq[i]] ?? 0, floor)) / LOG2;
  }
  return bits / seq.length;
};

// The discriminant: per-move bits under the target grammar minus per-move bits under
// the contrast grammar. Positive → the sequence reads more like the target kind than
// like the contrast basin. Null when either side cannot score.
export const grammarMargin = (moves, targetGrammar, contrastGrammar) => {
  const t = sequenceLogLikelihood(moves, targetGrammar);
  const c = sequenceLogLikelihood(moves, contrastGrammar);
  if (t == null || c == null) return null;
  return { margin: t - c, llTarget: t, llContrast: c };
};

const isValidShapes = (s) =>
  !!s && s.alphabet && s.perIntent && typeof s.perIntent === 'object' &&
  Object.keys(s.perIntent).length > 0 &&
  Object.values(s.perIntent).every((e) => e?.grammar?.marginal && e?.grammar?.trans);

const hasIDB = () => typeof indexedDB !== 'undefined';

const idbGet = (key) => new Promise((resolve) => {
  try {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => resolve(null);
    open.onsuccess = () => {
      const tx = open.result.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      tx.onsuccess = () => resolve(tx.result ?? null);
      tx.onerror = () => resolve(null);
    };
  } catch { resolve(null); }
});

const idbPut = (key, value) => new Promise((resolve) => {
  try {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => resolve(false);
    open.onsuccess = () => {
      const tx = open.result.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key);
      tx.onsuccess = () => resolve(true);
      tx.onerror = () => resolve(false);
    };
  } catch { resolve(false); }
});

// Load the fitted shapes: IndexedDB cache first, then network, then honest null —
// the centroids-loader discipline (perceiver/classify/centroids.js). Injectable deps
// so tests drive it with no browser and no network.
export const loadShapeGrammars = async ({
  url = SHAPES_URL,
  fetchImpl = (typeof fetch !== 'undefined' ? fetch : null),
  cacheKey = 'shapes-v3',
  useCache = hasIDB(),
} = {}) => {
  if (useCache) {
    const cached = await idbGet(cacheKey);
    if (isValidShapes(cached)) return Object.freeze({ ...cached, loadedFrom: 'cache' });
  }
  if (!fetchImpl) return null;
  try {
    const res = await fetchImpl(url);
    if (!res || !res.ok) return null;
    const shapes = await res.json();
    if (!isValidShapes(shapes)) return null;
    if (useCache) await idbPut(cacheKey, shapes);
    return Object.freeze({ ...shapes, loadedFrom: 'network' });
  } catch { return null; }
};

// The contrast grammar a draft is discriminated AGAINST: the assistant-synthetic basin
// when the fit had one (shapes v2 + nav corpus), else the pooled-exemplar background
// (v1 fallback — a weaker contrast, but still a basin to be outside of).
export const contrastOf = (shapes) =>
  shapes?.contrast?.['assistant-synthetic']?.grammar || shapes?.background?.grammar || null;

// Score a draft's text against an intent's fitted shape. Parse + arithmetic only.
// Returns { margin, llTarget, llContrast, threshold, off } — `off` when the draft's
// margin falls below what the intent's own exemplars score (the LOO p10 bar carried in
// shapes.json), i.e. the draft reads less like this kind of answer, and more like
// chatbot-ese, than the kind's own examples do. Null when inert: no shapes, unknown
// intent, no threshold on record, or a draft with no scorable form.
export const scoreDraftGrammar = (shapes, intent, draftText) => {
  const entry = shapes?.perIntent?.[intent];
  const contrast = contrastOf(shapes);
  if (!entry?.grammar || !contrast || typeof draftText !== 'string' || !draftText.trim()) return null;
  let moves;
  try { moves = depictedMoves(draftText, 'draft'); } catch { return null; }
  const m = grammarMargin(moves, entry.grammar, contrast);
  if (!m) return null;
  const threshold = entry.marginStats?.p10 ?? null;
  return {
    ...m,
    moves: moves.length,
    threshold,
    off: threshold != null && m.margin < threshold,
  };
};

const round = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);

// The form error for the loop — the grammar-based sibling of turn/shape.js
// answerFormError, taking the draft's TEXT (no draft embedding; scoring is modelless).
// Soft/non-gating by the same law: form is a smoke alarm, taste is not refusable.
// Null when inert or when the draft is in-basin.
export const grammarFormError = (shapes, intent, draftText) => {
  if (!shapes || !intent) return null;
  const sc = scoreDraftGrammar(shapes, intent, draftText);
  if (!sc || !sc.off) return null;
  return {
    id: 'form', dim: 'form', gates: false,
    intent, score: round(sc.margin), threshold: round(sc.threshold),
    reason: `the answer does not move like a ${intent} answer — its form sits nearer the ` +
      `assistant basin (margin ${round(sc.margin)} bits/move < ${round(sc.threshold)}, ` +
      `the bar this kind's own examples clear)`,
  };
};
