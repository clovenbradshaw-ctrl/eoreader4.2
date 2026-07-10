// EO: EVA·SIG(Field → Field,Atmosphere, Tracing,Tending) — the one surprise (KL)
// THE ONE SURPRISE — the modality-agnostic core (Track A, docs/spec-one-surprise.md).
//
// There is exactly one surprise: D_KL(posterior ‖ prior) over a γ-decayed referent
// profile in a fixed basis. The profile is the BACKWARD object — the γ-decayed summary
// of what has arrived; the posterior is that profile advanced one step (every incumbent
// decays by γ, every atom delivered this step deposits γ⁰ = 1). A fixed NOVELTY reserve
// atom keeps the divergence defined on a newcomer (absolute continuity) and makes an
// opening fall to exactly zero on its own.
//
// This is the form `reading.js` already computed for the text Bayesian-surprise channel,
// lifted out verbatim so it is the ONLY form. The only modality-specific code is the
// FRONT-END map from raw signal into the basis: `prior` and `arrival` are Maps from a
// basis-atom (an arbitrary key — a proposition for text, a tonal move for music, a cell
// for the phasepost path) to a mass, and `axisLabel` renders an atom to a readable strain
// axis. Everything here — the posterior, the divergence, the reserve, the per-dimension
// contribution — is shared.
//
// Operations and their ORDER are preserved exactly from reading.js so the text path stays
// byte-identical: the parity gate is `node --test tests/*.test.js` (docs/spec-one-surprise.md).

// The self/world tags the efference split writes — the SAME line core/self draws, so the surprise
// core and the monitor speak one vocabulary (one loop, one me). Leaf import, no cycle.
import { SELF, WORLD } from './self/index.js';

export const NOVELTY_RESERVE = 1.0;   // reserved prior mass for an as-yet-unseen atom — the SEED

// noveltyAmplitude — the SIGNAL-DERIVED reserve (the protention learning its own amplitude).
//
// The constant above is a hand-rolled prior: it reserves the SAME mass for an unseen atom
// whether newcomers are pouring in or the cast has long since closed. The reserve SHARE
// `novelty/(ΣmassΒ+novelty)` then moves only as accumulated mass grows — blind to the RATE at
// which genuine newcomers actually arrive. This derives the reserve from the signal instead:
// the γ-decayed count of recent FIRST-appearances. An atom first seen at step `f` contributes
// γ^(at−1−f); a flurry of newcomers lifts the reserve (the unseen is plausible), a long drought
// lets it decay (a newcomer becomes a shock). `firstSeen` is the collection of first-appearance
// steps of the atoms in the prior; only those strictly before `at` count, so the reserve is
// strictly CAUSAL — a reading never reads its own future. Returns 0 at the opening (no prior);
// callers fall back to NOVELTY_RESERVE as the cold-start seed rather than collapsing to zero.
//
// Measured aggregate-flat against its controls (experiments/exp-0002): it helps signals with
// positively-autocorrelated novelty and regresses anti-correlated ones, so it ships OPT-IN and
// is NOT promoted. Kept here, in the genome, as the recorded variant the next cycle improves on.
export const noveltyAmplitude = (firstSeen, at, gamma) => {
  let amp = 0;
  for (const f of firstSeen) if (f != null && f < at) amp += Math.pow(gamma, at - 1 - f);
  return amp;
};

// surpriseAt(prior, arrival, { gamma, novelty, axisLabel }) → { bayesBits, bayesBy }
//
//   prior     Map<atom, mass>  the γ-decayed profile BEFORE this step (the backward object)
//   arrival   Map<atom, mass>  the deposit delivered AT this step (the full unit)
//   gamma     the recency-decay kernel (the horizon)
//   novelty   the reserve atom's mass (protention)
//   axisLabel (atom) → label   front-end renderer for the per-dimension strain axis
//
// Returns the SIGNIFICANCE channel: `bayesBits` is the raw KL in bits (caller squashes /
// rounds), `bayesBy` is the per-dimension KL contribution (rounded) — the strain AXIS a
// boundary (REC) restructures along. The paired predictive channel (−log₂ p(arrival)) and
// the explicit forward distribution p(next) fold into this core in the next Track A step;
// the signature is shaped to carry them without disturbing this one.
export const surpriseAt = (prior, arrival, { gamma, novelty = NOVELTY_RESERVE, axisLabel = (k) => k } = {}) => {
  const support   = new Set([...prior.keys(), ...arrival.keys()]);
  const newcomers = [...arrival.keys()].filter(k => !prior.has(k));
  // The profile's own reserve probability — co-entrants split it, so the reserve is
  // never multiply-counted (a single newcomer gets all of it).
  const sumPrior  = [...prior.values()].reduce((s, m) => s + m, 0);
  // Opening guard: with no prior mass AND no reserve there is nothing to move belief
  // against — return the honest zero rather than divide by zero. A signal-derived
  // reserve is 0 at the opening; the default reserve (NOVELTY_RESERVE > 0) never trips
  // this, so the text path stays byte-identical (the parity gate).
  if (sumPrior + novelty <= 0) return { bayesBits: 0, bayesBy: {} };
  const reserve   = novelty / (sumPrior + novelty);
  const newShare  = newcomers.length ? reserve / newcomers.length : 0;

  const postMass = new Map();
  let sumPost = 0;
  for (const k of support) {
    const m1 = gamma * (prior.get(k) || 0) + (arrival.get(k) || 0); // m′ = γ·m + deposits
    postMass.set(k, m1);
    sumPost += m1;
  }
  const denomPost = sumPost + novelty;
  const priorW = (k) => (prior.has(k) ? prior.get(k) : newShare);
  let sumW = novelty;
  for (const k of support) sumW += priorW(k);

  let bayesBits = 0;
  const bayesBy = {};                          // per-DIMENSION KL contribution — the strain AXIS the
  for (const k of support) {                   // enacted loop accumulates so a REC knows what broke it
    const pPost = postMass.get(k) / denomPost;
    if (pPost <= 0) continue;
    const c = pPost * Math.log2(pPost / (priorW(k) / sumW));
    bayesBits += c;
    if (c > 0) { const a = axisLabel(k); bayesBy[a] = round((bayesBy[a] || 0) + c); }  // belief moved TOWARD it
  }
  // The reserve atom (protention) — present in both prior and posterior, the term that
  // keeps the KL defined (absolute continuity) on every newcomer.
  {
    const pPost = novelty / denomPost;
    if (pPost > 0) bayesBits += pPost * Math.log2(pPost / (novelty / sumW));
  }
  bayesBits = Math.max(0, bayesBits);          // KL ≥ 0 (clamp float noise)
  return { bayesBits, bayesBy };
};

// noveltyFromLensEntropy — the reserve DERIVED from the spread of readings (the
// significance-column Prediction section, consequence #1). Today's NOVELTY_RESERVE is a
// constant; ρ's von Neumann entropy (core/spectral.js) is the predictive uncertainty of
// the next unit: near 0 → one eigen-lens dominates → a committed frame → predict sharply
// (small reserve); near log k → a balanced mixture of readings → reserve novelty mass and
// predict broadly. This makes the reserve a Bayesian model-average over readings rather
// than a max-likelihood point — the standard route to calibration. PURE ON THE SCALAR, so
// it improves prediction (and the generative draw off forwardDist) for ANY modality: a
// melody's themes, a video's motion motifs, a text's readings all decompose the same way.
//
// Normalised by log(dim) so it is the FRACTION of maximal mixing, scaled by `base`
// (NOVELTY_RESERVE by default). Floored at a small share of base so forwardDist stays
// proper on an empty profile. Opt-in: callers that pass no entropy keep the constant, so
// every existing golden is byte-identical.
export const noveltyFromLensEntropy = (lensEntropy, dim, base = NOVELTY_RESERVE) => {
  if (!Number.isFinite(lensEntropy) || !Number.isFinite(dim) || dim < 2) return base;
  const maxS = Math.log(dim);
  if (!(maxS > 0)) return base;
  const frac = Math.max(0, Math.min(1, lensEntropy / maxS));   // fraction of maximal mixing
  return base * (0.1 + 0.9 * frac);                            // floor at 0.1·base, never 0
};

// p(next | profile) — THE FORWARD DISTRIBUTION (Track A, docs/spec-one-surprise.md).
//
// Surprise has two objects. The profile is the BACKWARD object — the γ-decayed summary of
// what has arrived. Scoring (and generating) also needs the FORWARD object: an explicit
// distribution over what arrives next. This is it: the profile renormalised into a proper
// distribution over the basis, with the NOVELTY reserve holding probability for an unseen
// atom (`reserve`). Σ p(dist) + reserve = 1.
//
// "Reading scores the arrival under p(next); generation draws from p(next)." Same object,
// two uses. It is exposed here for the DRAW (the generator's first act, Part II) and as the
// honest forward object the recognition core can already turn around into. It is NOT yet
// wired into the predictive SCORE — today's surprisal is an ad-hoc floored mean, not
// −log₂ p(arrival) under this distribution; adopting this for scoring changes the surprisal
// and ships behind RULES_REV with a parallel golden (the deferred Track A step).
export const forwardDist = (profile, { novelty = NOVELTY_RESERVE } = {}) => {
  const sum = [...profile.values()].reduce((s, m) => s + m, 0);
  const Z = sum + novelty;                       // reserve mass keeps it proper over an open basis
  if (Z <= 0) return { dist: [], reserve: 0, Z: 0 };  // opening guard — empty profile, zero reserve
  const dist = [...profile.entries()]
    .map(([atom, m]) => [atom, m / Z])
    .sort((a, b) => b[1] - a[1]);                // ranked — the heaviest incumbents lead the draw
  return { dist, reserve: novelty / Z, Z };
};

// forwardScore(profile, arrival, { novelty, axisLabel }) → the FORWARD PREDICTIVE CHANNEL (Track A).
//
// surpriseAt is the BACKWARD object — how far belief MOVED once the arrival landed. This is the
// FORWARD object SCORED: −log₂ p(arrival) under p(next | profile), the honest predictive surprisal
// the "ad-hoc floored mean" (reading.js) stands in for. "Reading scores the arrival under p(next);
// generation draws from p(next)" — this is that scoring, the same forward object either way.
//
// ONE FORWARD MODEL, POINTED TWO WAYS (enactor/efference.js §5). Fed the WORLD's arrival it is
// perceptual surprise (a miss is news); fed the predicted return of the self's OWN commit it is the
// efference copy, deepened here from the identity stub into a real transformed-consequence forward
// model — the SAME function, the source of the arrival the only difference. The self/world split
// (attenuate the reafferent, keep the exafferent) is drawn by the monitor ONE layer up; this core
// only scores, so it stays modality-blind: profile/arrival are Map<atom,mass> in ANY basis
// (propositions, tonal moves, motion, cells), the front-end map the only modality-specific code.
//
// Purely ADDITIVE: nothing scores against it until the gated Track-A adoption wires it into the
// reading's surprisal (RULES_REV + a parallel golden), so the text path stays byte-identical.
export const forwardScore = (profile, arrival, { novelty = NOVELTY_RESERVE, axisLabel = (k) => k } = {}) => {
  const { dist, reserve, Z } = forwardDist(profile, { novelty });
  // Opening / empty-arrival guard: no forward mass yet, or nothing arrived → nothing to have foreseen,
  // so the honest predictive surprise is zero (mirrors surpriseAt's opening guard).
  if (!(Z > 0) || !arrival || arrival.size === 0) {
    return { predBits: 0, predMeanBits: 0, predBy: {}, novel: 0, reserve: round(reserve || 0) };
  }
  const p = new Map(dist);                                   // atom → probability under p(next)
  const newcomers = [...arrival.keys()].filter((a) => !p.has(a));
  // Co-arriving newcomers SPLIT the reserve, so the unseen mass is never multiply-counted — the same
  // discipline surpriseAt uses for the prior reserve (a lone newcomer takes all of it).
  const newShare = newcomers.length ? reserve / newcomers.length : reserve;

  let predBits = 0, totalMass = 0;
  const predBy = {};
  for (const [a, m] of arrival) {
    const pa = Math.max(p.has(a) ? p.get(a) : newShare, 1e-12);   // floored so an opening never diverges
    const bits = -Math.log2(pa);
    predBits += m * bits;                                    // mass-weighted joint surprisal of the arrival
    totalMass += m;
    const lab = axisLabel(a);
    if (bits > 0) predBy[lab] = round((predBy[lab] || 0) + m * bits);   // the axes the reader failed to foresee
  }
  return {
    predBits: round(predBits),                              // total −log₂ p(arrival), mass-weighted
    predMeanBits: round(totalMass > 0 ? predBits / totalMass : 0),   // per-unit-mass — the comparable, calibratable number
    predBy,                                                  // per-dimension predictive surprise — the steer axis (REC reads it)
    novel: newcomers.length,                                // arrivals the forward model had never seen (drew the reserve)
    reserve: round(reserve),                                // protention mass share held for the unseen
  };
};

// feltSurprise(profile, arrival, { predicted, attenuation, novelty, axisLabel }) → the surprise a
// SUBJECT actually feels, forwardScore split along the efference self/world line (enactor/efference.js,
// enactor/monitor.js, core/self).
//
// forwardScore treats every arrival as exafferent — world-caused. But a subject predicts the sensed
// consequence of its OWN commits (the efference copy), so an arriving atom that MATCHES an outstanding
// copy is REAFFERENT: the system sensing what it produced — me-ness — carrying no news it did not
// already author. It is ATTENUATED (you cannot tickle yourself). An atom matching NO copy is
// EXAFFERENT: the world, unbidden — the real surprise, the learning signal. `predicted` is the set of
// atom keys the self predicted (its outstanding copies reduced to the arrival's basis) — modality-blind,
// exactly as the efference copy is "one copy form, one self." No predicted set → every atom is world →
// this is forwardScore exactly (the disarmed-safe degradation).
//
//   worldBits — EXAFFERENT: what the subject did NOT cause. The truth / fitness / learning signal.
//   feltBits  — worldBits + (1 − attenuation)·selfBits: what the subject experiences, self damped.
//   attenuation 1 → self zeroed (the strict tickle law); 0 → self felt in full (no self/world discount).
//
// The world and self streams are scored SEPARATELY (each its own reserve split), because they are two
// sources; with an empty predicted set there is no self stream and the result is forwardScore untouched.
export const feltSurprise = (profile, arrival, { predicted = null, attenuation = 1, novelty = NOVELTY_RESERVE, axisLabel = (k) => k } = {}) => {
  const pred = predicted instanceof Set ? predicted : new Set(predicted || []);
  const att = Math.max(0, Math.min(1, attenuation));
  const world = new Map(), self = new Map();
  const tags = {};
  for (const [a, m] of (arrival || new Map())) {
    if (pred.size && pred.has(a)) { self.set(a, m); tags[axisLabel(a)] = SELF; }
    else { world.set(a, m); tags[axisLabel(a)] = WORLD; }
  }
  const w = forwardScore(profile, world, { novelty, axisLabel });
  const s = self.size
    ? forwardScore(profile, self, { novelty, axisLabel })
    : { predBits: 0, predMeanBits: 0, predBy: {}, novel: 0 };
  return {
    feltBits: round(w.predBits + (1 - att) * s.predBits),   // what the subject experiences (self damped)
    worldBits: w.predBits,                                  // EXAFFERENT — the news / learning / fitness signal
    selfBits: s.predBits,                                   // REAFFERENT (raw, pre-attenuation) — me-ness undamped
    worldMeanBits: w.predMeanBits,                          // per-mass exafferent — the comparable number
    worldBy: w.predBy,                                      // which UNBIDDEN atoms drove the surprise (the steer axis)
    attenuation: att,
    tags,                                                   // atom label → 'self' | 'world'
    worldNovel: w.novel,                                    // exafferent newcomers — genuinely new world
    selfCount: self.size,                                   // how much of the arrival was self-caused (me-ness mass)
  };
};

const round = (x) => Math.round(x * 100) / 100;
