// EO: REC·EVA(Field,Lens → Paradigm,Lens, Composing,Binding) — answer-form predictor (learned shapes)
// The FORM predictor — what a good answer LOOKS LIKE, learned from sample answers.
// (docs/answer-expectation.md; ported from eoreader3 shape.js)
//
// The content predictor (turn/expect.js `answerPredictionError`) reads off the graph WHAT the
// answer should be about. It cannot say what a good answer of this KIND looks like — the
// register, length, and framing of a crisp lookup vs a hedged synthesis vs a warm reorient.
// That is not derivable from the document; it is a learned convention, and the only honest
// source is EXAMPLES. `data/exemplars.jsonl` is 430 authored {user_turn → response} sample
// answers, tagged by intent and shape. Embedded, each intent's responses form a CENTROID —
// the learned shape of that form — and a draft is scored by DISCRIMINATIVE cosine: is it
// unambiguously in the target basin (closer to the target shape than to any competitor)?
//
// This realizes "we can predict anything": the prediction is the nearest sample answer(s) to
// the question, not a hand-written template. It is embedder-gated — a cosine is only meaning
// under a meaning-measuring embedder — and inert without one, exactly like the significance
// column. Form is a SMOKE ALARM (eoreader3 §): it flags how unlike the kind of answer the
// draft is; it never gates a restart on its own (taste is not refusable).

// The bundled sample-answer library — a same-origin asset, fetched like the phasepost cells.
const EXEMPLARS_URL = new URL('../../data/exemplars.jsonl', import.meta.url).href;

// loadShapeLibrary(embed, { url }) → build the resident library from the bundled exemplars.
// `embed` is (text) → Promise<vec> (the caller's warm meaning embedder). Null on any failure
// — the form path degrades to inert, never throws, exactly like the cells loader.
export const loadShapeLibrary = async (embed, { url = EXEMPLARS_URL } = {}) => {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const records = parseExemplars(await res.text());
    return records.length ? await buildShapeLibrary(records, embed) : null;
  } catch { return null; }
};

const dot = (a, b) => {
  if (!a || !b) return 0;
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
};
const norm = (a) => Math.sqrt(dot(a, a)) || 1;
export const cosine = (a, b) => (!a || !b || !a.length || !b.length) ? 0 : dot(a, b) / (norm(a) * norm(b));

export const centroid = (rows, weights) => {
  const live = (rows || []).filter(Boolean);
  if (!live.length) return null;
  const d = live[0].length;
  const out = new Float64Array(d);
  let wsum = 0;
  for (let r = 0; r < live.length; r++) {
    const w = weights && weights[r] != null ? weights[r] : 1;
    wsum += w;
    for (let i = 0; i < d; i++) out[i] += live[r][i] * w;
  }
  if (wsum) for (let i = 0; i < d; i++) out[i] /= wsum;
  return out;
};

// Parse the JSONL sample-answer library. Defensive like the conventions loader: blank lines,
// // comments, and malformed JSON are skipped, never thrown. A record needs a response and an
// intent to carry signal.
export const parseExemplars = (text) => {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('//')) continue;
    try {
      const r = JSON.parse(t);
      if (r && typeof r.response === 'string' && r.intent) out.push(r);
    } catch { /* skip — never throw on a bad line */ }
  }
  return out;
};

const maxSim = (vec, exemplars) => {
  let best = -Infinity, who = null;
  for (const ex of exemplars || []) {
    if (!ex || !ex.responseVec) continue;
    const s = cosine(vec, ex.responseVec);
    if (s > best) { best = s; who = ex; }
  }
  return who ? { sim: best, exemplar: who } : { sim: 0, exemplar: null };
};

// The discriminative score (eoreader3 §5): s_t − s_c. Closer to the target shape than to any
// competing shape ⇒ positive ⇒ unambiguously in the target basin.
const discriminativeScore = (vec, targetShape) => {
  if (!targetShape) return null;
  const t = maxSim(vec, targetShape.targetExemplars);
  const c = maxSim(vec, targetShape.competitorExemplars);
  const s_t = t.exemplar ? t.sim : 0;
  const s_c = c.exemplar ? c.sim : 0;
  return { score: s_t - s_c, s_t, s_c,
    target: t.exemplar?.id ?? null, nearestCompetitor: c.exemplar?.id ?? null };
};

// The adaptive threshold (eoreader3 §5): scale the required margin UP where a competing shape
// sits close to the target centroid (more to be ambiguous against), down where it is isolated.
const THRESHOLD = { base: 0.02, k: 0.30, lo: 0.04, hi: 0.30 };
const adaptiveThreshold = (targetExemplars, competitorExemplars) => {
  const tc = centroid((targetExemplars || []).map(e => e.responseVec).filter(Boolean),
    (targetExemplars || []).map(e => e.weight));
  if (!tc) return THRESHOLD.lo;
  const near = maxSim(tc, competitorExemplars);
  const proximity = Math.max(0, near.exemplar ? near.sim : 0);
  return Math.max(THRESHOLD.lo, Math.min(THRESHOLD.hi, THRESHOLD.base + THRESHOLD.k * proximity));
};

// buildShapeLibrary(records, embed) → the resident library. `embed` is (text) → Promise<vec>
// (the caller wires it to the meaning embedder it will score with). Embeds each response and
// user_turn ONCE; selection and scoring are then synchronous over two per-turn embeddings.
export const buildShapeLibrary = async (records, embed) => {
  const lib = [];
  for (const r of records) {
    const responseVec = await embed(r.response);
    const promptVec   = r.user_turn ? await embed(r.user_turn) : null;
    lib.push({ ...r, responseVec, promptVec, weight: r.weight || 1 });
  }
  return makeLibrary(lib);
};

const round = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);

const makeLibrary = (lib) => {
  const byIntent = (intent) => lib.filter(e => e.intent === intent);

  // Read the prompt's wanted shape off the nearest sample answers (eoreader3 §9): a weighted
  // intent vote over the k nearest by question embedding. Returns the predicted intent, the
  // confidence (nearest minus nearest-of-a-different-intent), and the single nearest sample
  // answer — itself a content+form prediction of the reply.
  const matchPrompt = (queryVec, { k = 5 } = {}) => {
    const scored = [];
    for (const e of lib) if (e.promptVec) scored.push({ e, sim: cosine(queryVec, e.promptVec) });
    if (!scored.length) return null;
    scored.sort((a, b) => b.sim - a.sim);
    const top = scored.slice(0, k);
    const votes = {};
    for (const { e, sim } of top) votes[e.intent] = (votes[e.intent] || 0) + Math.max(0, sim) * (e.weight || 1);
    let intent = top[0].e.intent, best = -Infinity;
    for (const key of Object.keys(votes)) if (votes[key] > best) { best = votes[key]; intent = key; }
    const sTop = top[0].sim;
    let sOther = 0;
    for (const { e, sim } of scored) if (e.intent !== intent) { sOther = sim; break; }
    return { intent, confidence: sTop - sOther,
      best: { id: top[0].e.id, intent: top[0].e.intent, sim: sTop, user_turn: top[0].e.user_turn, response: top[0].e.response } };
  };

  // The target shape for a question: the intent cluster (ranked by prompt similarity), the
  // competitor set, and the adaptive threshold the loop carries as its own bar.
  const selectForQuestion = (queryVec, { k = 5 } = {}) => {
    if (!queryVec) return null;
    const pm = matchPrompt(queryVec, { k });
    if (!pm) return null;
    const intent = pm.intent;
    let cluster = byIntent(intent);
    if (!cluster.length) cluster = lib.slice();
    const ranked = cluster.map(e => ({ e, s: e.promptVec ? cosine(queryVec, e.promptVec) : (e.weight || 1) }))
      .sort((a, b) => b.s - a.s).map(x => x.e);
    const targetExemplars = ranked.slice(0, k);
    const competitorExemplars = lib.filter(e => e.intent !== intent);
    return {
      intent,
      promptMatch: { intent: pm.intent, confidence: round(pm.confidence), best_id: pm.best.id, best_response: pm.best.response },
      targetExemplars, competitorExemplars,
      threshold: adaptiveThreshold(targetExemplars, competitorExemplars),
    };
  };

  // Score a draft against the target shape. `off` is the prediction error: the draft is not
  // unambiguously in the target basin (its margin fell under the adaptive threshold).
  const scoreDraft = (draftVec, targetShape) => {
    const sc = discriminativeScore(draftVec, targetShape);
    if (!sc) return null;
    return { ...sc, threshold: targetShape.threshold, off: sc.score < targetShape.threshold };
  };

  return { lib, byIntent, matchPrompt, selectForQuestion, scoreDraft };
};

// The form error for the loop: select the wanted shape from the question, score the draft,
// and return a SOFT (non-gating) error when the draft is off-basin — the answer does not read
// as the kind of answer the question's nearest sample answers do. Null when inert (no library,
// no embeddings) or when the draft is in-basin.
export const answerFormError = (library, queryVec, draftVec) => {
  if (!library || !queryVec || !draftVec) return null;
  const target = library.selectForQuestion(queryVec);
  if (!target) return null;
  const sc = library.scoreDraft(draftVec, target);
  if (!sc || !sc.off) return null;
  return {
    id: 'form', dim: 'form', gates: false,
    intent: target.intent, score: round(sc.score), threshold: round(sc.threshold),
    reason: `the answer does not read like a ${target.intent} answer — its shape sits ` +
      `nearer a different kind (margin ${round(sc.score)} < ${round(sc.threshold)})`,
  };
};
