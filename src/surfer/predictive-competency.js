// EO: EVA·SIG·SEG(Field,Lens → Lens,Atmosphere, Tracing·Tending·Dissecting) — predictive competency (Born)
// surfer/predictive-competency.js — the fitness numerator that needs no judge: held-out prediction,
// measured by the BORN RULE.
//
// Fluency needs an outside grader because fluency is a judgment ABOUT the output, made by a subject
// with taste. Prediction needs none: reality supplies the answer key. You predict the next thing, the
// world delivers it, and the gap is the signal — self-generated, objective, asymptotic to the source's
// own entropy. That is why prediction is the truth signal with no frontier model in the loop, and why
// it unifies the metabolism with truth: surprise IS energy, so "quality per energy" with prediction as
// the numerator becomes prediction-per-joule — more efficient AND more true on one axis.
//
// WHY BORN, NOT A BAG. The density operator ρ (core/spectral.js) is, in the spec's own words, "at once
// the recognition object and the PREDICTION object — what reading the next unit will fall under, with
// what weight." Its eigen-lenses are the predictive Born weights; its von Neumann entropy is the
// predictive uncertainty of the next unit; ⟨u|ρ|u⟩ is the Born probability of a held-out unit. A
// classical bag over atoms is the DIAGONAL of this — it keeps the frequencies and throws away the
// off-diagonal COHERENCES, and the coherences are where an asserting and a defeating reading of the
// same content INTERFERE rather than add. That interference is STRUCTURE — bonds, reframes — not mere
// co-occurrence. Predicting in the Born measure rewards getting the structure right; predicting in the
// bag rewards getting the word-frequencies right. The moat is the former.
//
// THE SCORE. Walk a sequence of unit vectors (the significance/structure activations — modality-blind:
// any modality projects into the same basis). Hold each unit out and measure, in the Born measure, how
// far it sits from two states:
//   achieved — S(u ‖ ρ): the reader's ACCUMULATED ρ (the Horizon, horizon.js), which has departed the
//              ground toward the structure it has read. Low = the reader foresaw this unit.
//   baseline — S(u ‖ σ): the maximally-mixed ground — knowing the space and nothing else (the canonical
//              view-from-nowhere, corpusSigma). This is the PRINCIPLED null, not a hand-flattened bag.
// competency = mean(baseline − achieved), squashed to [0,1). A source with real structure lets ρ depart
// σ in a way that predicts held-out units far better than σ → high competency; an unstructured source
// leaves ρ ≈ σ → the two surprises coincide → ~0 (the noisy TV earns nothing, the parrot earns nothing).
// Deterministic (no RNG) and reuses the existing Born machinery — this is the un-authored floor the
// move/structure predictors deepen.

import { buildDensity, relEntropy } from '../core/index.js';
import { createHorizon } from './horizon.js';

const round3 = (x) => Math.round(x * 1000) / 1000;

// σ = I/dim — the maximally-mixed state, max von Neumann entropy, the Born rule's uniform: every
// direction equally likely, no structure. The canonical ground a departure is measured from.
const maximallyMixed = (dim) => {
  const m = Array.from({ length: dim }, () => new Array(dim).fill(0));
  for (let i = 0; i < dim; i++) m[i][i] = 1 / dim;
  return m;
};

// predictiveCompetency(units, { gamma, sigma }) → { competency, bitsSaved, achieved, baseline, steps }.
// `units` is an ordered array of unit vectors (equal length — the significance/structure activations).
// `sigma` optionally supplies an explicit ground { dim, rho } (e.g. corpusSigma / structuralGround);
// absent, the maximally-mixed state is used. `competency` ∈ [0,1) is the fitness numerator — reality's
// grade, in the Born measure the whole significance column already speaks.
export const predictiveCompetency = (units, { gamma = 0.8, sigma = null } = {}) => {
  const seq = (units || []).filter((u) => Array.isArray(u) && u.length);
  const dim = seq.length ? seq[0].length : 0;
  if (seq.length < 2 || !dim) {
    return { competency: 0, bitsSaved: 0, achieved: 0, baseline: 0, steps: seq.length };
  }
  const groundRho = (sigma?.rho && sigma.dim === dim) ? sigma.rho : maximallyMixed(dim);
  const horizon = createHorizon({ ground: { dim, rho: groundRho }, gamma });   // ρ cold-starts at σ

  let achSum = 0, baseSum = 0, scored = 0;
  for (let i = 0; i < seq.length; i++) {
    const u = seq[i];
    if (u.length !== dim) continue;
    if (i > 0) {
      // held-out: measure u's Born departure from the reader's ρ and from the ground σ, BEFORE folding.
      const inc = buildDensity([u]).rho;
      const achieved = horizon.surpriseOf([u]);     // S(u ‖ ρ) — under this reader's accumulated state
      const baseline = relEntropy(inc, groundRho);  // S(u ‖ σ) — under the maximally-mixed ground
      achSum += achieved; baseSum += baseline; scored += 1;
    }
    horizon.observe([u]);                           // advance ρ (the γ-decayed density fold)
  }

  const bitsSaved = scored ? (baseSum - achSum) / scored : 0;   // how much ρ beats σ at foreseeing held-out units
  const competency = bitsSaved > 0 ? round3(1 - Math.exp(-bitsSaved)) : 0;   // squashed to [0,1); 0 when ρ ≈ σ
  return {
    competency,
    bitsSaved: round3(bitsSaved),
    achieved: round3(scored ? achSum / scored : 0),   // mean S(u‖ρ) — the reader's residual surprise (→ source entropy)
    baseline: round3(scored ? baseSum / scored : 0),  // mean S(u‖σ) — the ground's surprise
    steps: seq.length,
  };
};

// competencyAnchor(result) → the outcome fields the metabolism's fitness reads. `predicted` is the
// un-authored anchor (metabolism/fitness.js): reality graded it, in the Born measure, so fitness rests
// on foreseeing the world's structure — not on a judge's satisfaction. A thin, declarative adaptor.
export const competencyAnchor = (result = {}) => Object.freeze({
  predicted: Number.isFinite(+result.competency) ? Math.max(0, Math.min(1, +result.competency)) : 0,
  covered: result.steps > 1 ? 1 : 0.5,
});
