// EO: EVA·SEG(Field,Network → Lens,Atmosphere, Binding·Tracing·Tending) — the definer's fitness
// The chorus of definers (fold-framings × prompts) each writes a candidate contextual definition;
// the system must pick the best WITHOUT a human grading taste. This is that grade — the same shape
// metabolism/fitness.js gives a turn, specialised to a definition, so the chorus and the metabolism
// speak one currency.
//
// Two things quality must be, and one exploit it must not fall to (the Goodhart the whole design
// turns on — fitness.js):
//   coverage   how much of the definition actually GROUNDS — the grounded-span fraction the
//              surface already computes (enactor/ground/spans.js). Do not fabricate.
//   salience   how much of THE FOLD the definition covers — the reading's own focus (its title and
//              themes). This is the anti-Goodhart term: a definition can ground perfectly by
//              parroting a trivial mention, but if it does not speak to what this reading is ABOUT
//              its salience collapses, so "claim less and safer" cannot win.
// coverage × salience is the self-reported base — and self-report is a hypothesis, so it is only
// ever PROVISIONAL. It becomes ANCHORED when an UN-AUTHORED signal is present, and then that signal
// dominates, exactly as fitness.js prescribes:
//   competency the Born-measure held-out prediction (surfer/predictive-competency.js): does a
//              profile built from this definition predict the entity's held-out mentions? Reality's
//              own grade, no judge — and the one that truly kills the parrot (a definition that only
//              echoes what it was shown predicts nothing held-out, so it earns nothing here).
//   wikiAgree  agreement with the settled Wikipedia referent — canonical meaning the model was never
//              handed. A weaker anchor than competency, used when a referent was confirmed.
// Both anchors are OPTIONAL; absent both, fitness is provisional and says so — never silently
// treated as if reality had graded it.

import { contentTokens } from './contain.js';

const clamp01 = (x) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);
const round3 = (x) => Math.round(x * 1000) / 1000;

// The fold's own terms — what THIS reading is about (its title + themes), as a content-term set.
const foldTerms = (fold) => new Set(contentTokens([fold?.title || '', ...((fold?.themes) || [])].join(' . ')));

// salience(defText, fold) — the share of the fold's terms the definition actually touches. With an
// empty fold there is nothing to be off-topic about, so salience is neutral (1): the term only ever
// PENALISES a definition that ignores a fold it was given, never invents a target where none exists.
export const salience = (defText, fold) => {
  const want = foldTerms(fold);
  if (!want.size) return 1;
  const have = new Set(contentTokens(defText));
  let hit = 0;
  for (const t of want) if (have.has(t)) hit += 1;
  return clamp01(hit / want.size);
};

// wikiAgree(defText, wikiText) — how much of the definition the canonical referent echoes back
// (precision against the settled meaning). Null when there is no referent to anchor on.
export const wikiAgree = (defText, wikiText) => {
  const def = new Set(contentTokens(defText));
  const wiki = new Set(contentTokens(wikiText || ''));
  if (!def.size || !wiki.size) return null;
  let hit = 0;
  for (const t of def) if (wiki.has(t)) hit += 1;
  return clamp01(hit / def.size);
};

// definitionFitness(candidate) → { score, anchored, terms:{coverage,salience,competency,wikiAgree} }.
//   candidate = {
//     text,                    the written definition
//     coverage,                grounded-span fraction (0..1) — from groundSpans downstream
//     fold,                    { title, themes } the definer framed by
//     competency,              OPTIONAL (0..1) — Born held-out prediction; the dominant anchor
//     wikiText,                OPTIONAL — the confirmed referent's text, for the wiki anchor
//   }
// The base is coverage × salience. Each present anchor multiplies the base by (0.5 + 0.5·anchor),
// so an anchor can at most halve or fully keep the base — it MODULATES self-report toward reality,
// never manufactures fitness from nothing. `anchored` is true iff at least one un-authored anchor
// was present (competency preferred), mirroring fitness.js's provisional/anchored honesty.
export const definitionFitness = (candidate = {}) => {
  const coverage = clamp01(candidate.coverage);
  const sal = salience(candidate.text, candidate.fold);
  const comp = candidate.competency == null ? null : clamp01(candidate.competency);
  const wa = candidate.wikiText != null ? wikiAgree(candidate.text, candidate.wikiText) : (candidate.wikiAgree == null ? null : clamp01(candidate.wikiAgree));

  let score = coverage * sal;
  const anchors = [];
  if (comp != null) { score *= 0.5 + 0.5 * comp; anchors.push('competency'); }
  if (wa != null)   { score *= 0.5 + 0.5 * wa;   anchors.push('wiki'); }

  return Object.freeze({
    score: round3(score),
    anchored: anchors.length > 0,
    anchors: Object.freeze(anchors),
    terms: Object.freeze({ coverage: round3(coverage), salience: round3(sal), competency: comp == null ? null : round3(comp), wikiAgree: wa == null ? null : round3(wa) }),
  });
};

// definitionCompetency(defText, { seen, heldOut }) → [0,1] — the un-authored anchor, judge-free.
//
// The Born-measure predictive competency (surfer/predictive-competency.js) is the truth signal the
// whole design wants: hold a unit out, measure how far the reader's accumulated state predicts it
// beyond a baseline. This is that idea in the BAG measure — the DIAGONAL of the Born object (the
// doc's own comment: "a classical bag is the diagonal of ρ") — because a written definition gives us
// term frequencies, not activation vectors. It is a proxy, honest about being one, with a path to the
// full measure later.
//
//   heldOut   the entity's mention sentences — reality's answer key, NOT shown to the definer.
//   seen      the facts the definer WAS shown (the telegram objects). The baseline reader.
// A definition earns competency only by predicting the held-out mentions BETTER than the raw facts
// already do — i.e. by abstracting the facts into structure that generalises. A parrot of the facts
// predicts no better than the facts (≈0); an off-topic definition predicts worse (0). This is exactly
// why competency kills the Goodhart parrot that grounding-coverage alone rewards.
const cw = (t) => contentTokens(t);
const profileOf = (texts) => {
  const f = new Map();
  let n = 0;
  for (const t of texts) for (const w of cw(t)) { f.set(w, (f.get(w) || 0) + 1); n += 1; }
  return { f, n, vocab: f.size };
};
// −log2 p(token) under a profile, add-one smoothed over the profile's vocabulary — the surprise the
// surprise core prices each held-out arrival at (core/surprise.js), in the bag.
const surprise = (tokens, prof) => {
  if (!tokens.length) return 0;
  const denom = prof.n + prof.vocab + 1;
  let bits = 0;
  for (const w of tokens) {
    const p = ((prof.f.get(w) || 0) + 1) / denom;
    bits += -Math.log2(p);
  }
  return bits / tokens.length;
};
export const definitionCompetency = (defText, { seen = [], heldOut = [] } = {}) => {
  const held = (heldOut || []).map((t) => cw(t)).filter((ts) => ts.length);
  if (!held.length) return null;                                  // no answer key → no anchor
  const defProf = profileOf([String(defText || '')]);
  const baseProf = profileOf((seen || []).map(String));
  if (!defProf.n) return 0;
  let saved = 0;
  for (const ts of held) saved += surprise(ts, baseProf) - surprise(ts, defProf);   // bits the def saves over the facts
  const meanBits = saved / held.length;
  // squash bits-saved to [0,1): 0 or negative (no better than the facts, or worse) → 0; ~2 bits → ~0.75.
  return clamp01(1 - Math.pow(2, -Math.max(0, meanBits)));
};

// bestOfChorus(candidates) → the fittest candidate, each annotated with its `fitness`. Ties break to
// the earlier candidate (stable, deterministic — no RNG, replay-safe). Empty in → null.
export const bestOfChorus = (candidates = []) => {
  const scored = (candidates || []).filter(Boolean).map((c) => ({ ...c, fitness: definitionFitness(c) }));
  if (!scored.length) return null;
  return scored.reduce((best, c) => (c.fitness.score > best.fitness.score ? c : best), scored[0]);
};
