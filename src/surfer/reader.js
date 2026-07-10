// EO: EVA·REC(Field,Lens → Lens,Field, Binding,Tracing,Composing) — the reader — ρ-side surprise
// The reader — the ρ-side self that FEELS surprise. The interpretation level's live number.
//
// Two Born measures against two priors, the distinction that's run through this whole build:
//   meaningfulness (metacognition.js) — departure from σ, the maximally-mixed ground. Reader-
//     INDEPENDENT given σ: how much structure the content has in itself. Structure-level, objective.
//   surprise (here)                   — departure from ρ, the reader's ACCUMULATED state. Reader-
//     RELATIVE: how much the content departs from what THIS self has read so far. The me-ness.
//     Interpretation-level, subjective. At turn 0 (ρ cold-starts at σ) the two coincide; as the
//     self accumulates, surprise falls where meaningfulness holds — habituation, a self forming.
//
// The reader wraps a Horizon (horizon.js) cold-started on the embedder-free structural ground, so
// the accumulated ρ is operational — no model needed. `feel` reads the surprise (does not commit);
// `feel(…, {accumulate:true})` folds the reading in, so the next turn is surprising relative to this
// one — the conversation grows an interpretive self. `curiosity` is META-surprise: is the latest
// surprise itself surprising against my history of being surprised — the gradient that drives the
// climb. `interpret` is the ρ-side faculty that fills interpretation.surprise on a σ-side surf
// result, at read-time, against this reader's own ρ — the firewall holds: the surf never computes it.

import { createHorizon } from './horizon.js';
import { structuralGround, structuralActivations } from './structure-basis.js';
import { deriveNull, projectGraph } from '../core/index.js';
import { parseText } from '../perceiver/parse/index.js';
import { meaningfulness } from './metacognition.js';

const round = (x) => Math.round(x * 1e4) / 1e4;

// The reading-character basis: operators ∪ relation-types (structuralActivations relations:true).
// Document-INDEPENDENT, so the reader's ρ aligns across turns — its surprise is over the structural
// and relational REGISTER of content (narrative vs essay vs dialogue; motion vs affect vs speech),
// the character of a reading rather than its particular cast. That is the right cross-turn me-ness:
// the self habituates to a register and is surprised by a shift in it.
const activationsOf = (content, { totalRead = true } = {}) => {
  const doc = (typeof content === 'string') ? parseText(content, { docId: 'reader', totalRead })
            : content?.log ? content
            : (content?.existence?.text != null) ? parseText(content.existence.text, { docId: 'reader', totalRead })
            : (content?.verbatim?.quotes) ? parseText(content.verbatim.quotes.map((q) => q.text).join(' '), { docId: 'reader', totalRead })
            : parseText(String(content ?? ''), { docId: 'reader', totalRead });
  return structuralActivations(doc, { relations: true }).activations;
};

export const createReader = ({ gamma = 0.8 } = {}) => {
  const horizon = createHorizon({ ground: structuralGround({ relations: true }), gamma });
  const surpriseHist = [];
  const coherentHist = [];

  // feel — the reader-relative surprise of content against the accumulated ρ (the me-ness), AND
  // whether the content is meaningful at all (against σ — "this is interesting", objective). Holding
  // both is what lets the self tell genuine interest from noise: a smear can surprise a settled self
  // (high `surprise`) yet not cohere (`interesting:false`), and chasing it is the noisy-TV trap.
  // A pure read by default; {accumulate:true} folds it in (the self grows, and habituates).
  const feel = (content, { accumulate = false, provenance = null } = {}) => {
    const acts = activationsOf(content);
    const surprise = round(horizon.surpriseOf(acts));    // relEntropy(inc, ρ) — against MY state
    const m = meaningfulness(acts);                      // does it cohere above chance — against σ
    let r = horizon.reading();
    if (accumulate) { r = horizon.observe(acts); surpriseHist.push(surprise); coherentHist.push(!!m.meaningful); }
    return Object.freeze({
      surprise, interesting: m.meaningful, thisIsInteresting: m.verdict,   // the OBJECTIVE claim
      departure: r.departure, cumulativeSurprise: r.cumulativeSurprise,
      entropy: r.entropy, reserve: r.reserve, accumulated: accumulate, provenance,
    });
  };

  // curiosity — META-surprise: does the latest surprise beat the noise floor of my surprise history
  // (deriveNull)? A spike means I was surprised more than I am used to being surprised — the model of
  // my own model coming up wrong, one storey higher. The gradient that says "attend here". Abstains
  // (null) until there is enough history to fit a floor.
  // "I FIND this interesting" — the SUBJECTIVE counterpart to "this is interesting". Not whether the
  // content beats chance (that is σ, objective, the content's own — metacognition.js), but whether it
  // surprised ME more than I am used to being surprised (against ρ, my own floor of surprise). The
  // me-ness: the same content can beat chance yet leave a settled self unmoved, or be ordinary yet
  // strike a self primed by what it just read. Curiosity is this judgment.
  const curiosity = () => {
    if (surpriseHist.length < 5) return { curious: null, verdict: '(too early — I don\'t yet know my own surprise)', latest: surpriseHist[surpriseHist.length - 1] ?? null };
    const latest = surpriseHist[surpriseHist.length - 1];
    const coherent = coherentHist[coherentHist.length - 1];
    const floor = deriveNull(surpriseHist.slice(0, -1), { alpha: 0.05 });
    const beatsFloor = Number.isFinite(floor) ? latest > floor : null;
    // COMPETENCY, not raw surprise: "I find this interesting" only if it surprised me AND it coheres.
    // Surprising-but-incoherent is NOISE (the noisy-TV trap), named as such, never followed as interest.
    const curious = beatsFloor === null ? null : (beatsFloor && coherent);
    const verdict = curious === true ? 'I find this interesting'
                  : (beatsFloor && !coherent) ? 'surprising but incoherent — noise, not interest (the noisy-TV trap)'
                  : curious === false ? 'I don\'t find this surprising' : '(can\'t yet tell)';
    return { curious, verdict, latest: round(latest), floor: Number.isFinite(floor) ? round(floor) : null, coherent };
  };

  // expect — PREDICTION. The accumulated ρ IS a predictive model; the surprise of content against
  // it IS the prediction error (how poorly ρ predicted this). A pure read (never accumulates), so it
  // measures the model as it stands. This closes the curiosity→prediction loop: competency-seeking
  // fills ρ with MEANINGFUL, diverse content (never noise), so it is the exploration policy that
  // lowers future prediction error fastest — the surf reading what it is curious about is the same
  // act as the model learning to predict better. predictionError falls as the self reads its register.
  const expect = (content) => ({ predictionError: round(horizon.surpriseOf(activationsOf(content))), reserve: horizon.reading().reserve });

  return Object.freeze({ feel, expect, curiosity, horizon, reading: () => horizon.reading() });
};

// The CAST basis — per-unit activation over the document's figures (the INS referents any
// modality's adapter emits, embedder-free). Within a document, curiosity is CAST/content novelty,
// which the operator basis is blind to (Alice-and-Bob and Carl-and-Dave read as the same register);
// the cast basis sees them as different. Modality-neutral: it reads doc.log + doc.units, nothing text.
const castActivations = (doc, { topFigures = 48 } = {}) => {
  const events = doc?.log?.snapshot ? doc.log.snapshot() : (Array.isArray(doc?.log) ? doc.log : []);
  const graph = projectGraph(doc.log);
  const rep = graph.representative || ((x) => x);
  const sight = new Map();
  for (const e of events) if (e.op === 'INS') { const id = rep(e.id); sight.set(id, (sight.get(id) || 0) + 1); }
  const top = [...sight.entries()].sort((a, b) => b[1] - a[1]).slice(0, topFigures).map(([id]) => id);
  const idx = new Map(top.map((id, i) => [id, i]));
  const K = top.length;
  const units = doc?.units || doc?.sentences || [];
  const A = units.map(() => new Array(K).fill(0));
  const touch = (s, id) => { const i = idx.get(rep(id)); if (i != null && A[s]) A[s][i] += 1; };
  for (const e of events) {
    if (e.sentIdx == null) continue;
    if (e.op === 'INS') touch(e.sentIdx, e.id);
    else if ((e.op === 'CON' || e.op === 'SIG') && !e.linkKind) { if (e.srcKind == null) touch(e.sentIdx, e.src); if (e.tgtKind == null) touch(e.sentIdx, e.tgt); }
  }
  return { A, K };
};
const mixedGround = (K) => { const rho = Array.from({ length: K }, () => new Array(K).fill(0)); for (let i = 0; i < K; i++) rho[i][i] = 1 / K; return { dim: K, rho }; };

// curiousSurf — the surf FOLLOWS WHAT IT IS CURIOUS ABOUT, seeking COMPETENCY, not raw surprise.
// THE GENERAL OPERATING MODE, on any cue, omnimodal.
//
// The noisy-TV trap: pure surprise-seeking is pathological — TV snow is MAXIMALLY surprising and
// entirely UNLEARNABLE, so a self chasing surprise gets stuck on noise. Curiosity must seek surprise
// that is also MEANINGFUL: competency = surprise (against what it has absorbed) GATED by coherence
// (does the region beat chance, concentrate into a reading — "this is interesting"). A smear scores
// ~0 competency however surprising, because its concentration is ~0. At each step it goes to the most
// COMPETENT-novel region, absorbs it, re-scores — never dwelling, never chasing snow.
//
// OMNIMODAL: operates on doc.units / doc.log via the cast basis (figures, not words), so it runs on
// any modality whose adapter fills units + emits INS/CON. A `cue` (optional per-region relevance
// weight — a query, an anchor, a salience map) BIASES where it starts and lingers, but competency
// leads, so the surf is cue-guided yet self-driven. SELECTS among pre-computed regions (the
// query-blind cut is untouched — selection, not re-cutting).
export const curiousSurf = (doc, candidates, { top = 5, cue = null } = {}) => {
  const { A, K } = castActivations(doc);
  if (!K) return [];
  const sum = (lo, hi) => { const v = new Array(K).fill(0); for (let i = lo; i < hi; i++) { const p = A[i]; if (p) for (let k = 0; k < K; k++) v[k] += p[k]; } return v; };
  const regions = (candidates || []).map((seg) => ({
    seg, vec: sum(seg.lo, seg.hi),
    coherence: meaningfulness(A.slice(seg.lo, seg.hi)).concentration,   // does the region cohere (learnable?)
    cueWeight: cue ? Math.max(0, Number(cue(seg)) || 0) : 1,            // the cue biases; competency leads
  })).filter((r) => r.vec.some((x) => x !== 0));
  if (!regions.length) return [];
  const explore = createHorizon({ ground: mixedGround(K) });           // a fresh self for this traversal
  const remaining = new Set(regions.keys());
  const path = [];
  while (path.length < top && remaining.size) {
    let best = -Infinity, bi = -1;
    for (const i of remaining) {
      const surprise = explore.surpriseOf([regions[i].vec]);
      const competency = surprise * regions[i].coherence * (cue ? regions[i].cueWeight : 1);  // meaningful surprise, cue-weighted
      if (competency > best) { best = competency; bi = i; }
    }
    if (bi < 0) break;
    explore.observe([regions[bi].vec]);                                // absorb it — the next step follows novelty
    path.push(Object.freeze({ ...regions[bi].seg, competency: round(best), coherence: round(regions[bi].coherence) }));
    remaining.delete(bi);
  }
  return path;
};

// interpret — the ρ-side faculty fills interpretation.surprise on a σ-side surf result, against the
// reader's Horizon, at read-time. Returns a NEW result (immutable; the firewall holds — the surf
// withheld this, the reader supplies it). Accumulates by default, so the conversation grows a self.
export const interpret = (result, reader, { accumulate = true } = {}) => {
  const text = (result?.verbatim?.quotes || []).map((q) => q.text).join(' ');
  const f = reader.feel(text, { accumulate });
  const c = reader.curiosity();
  return Object.freeze({
    ...result,
    interpretation: Object.freeze({
      ...result.interpretation,
      surprise: f.surprise,                       // the me-ness — reader-relative, now a live number
      cumulativeSurprise: f.cumulativeSurprise,
      thisIsInteresting: f.thisIsInteresting,      // OBJECTIVE (against σ): does it beat chance
      iFindInteresting: c.verdict,                 // SUBJECTIVE (against my ρ, competency-gated): the me-ness
      curiosity: c.curious,                        // meta-surprise AND coherent — competency, never raw surprise
      note: 'surprise + curiosity against the accumulated Horizon ρ (the me-ness), competency-gated so noise is not mistaken for interest; filled by the ρ-side reader at read-time, not the σ-side surf',
    }),
  });
};
