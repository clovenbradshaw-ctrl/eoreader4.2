// EO: SYN·REC·EVA(Field,Lens → Network,Lens, Composing,Tracing) — persistent Horizon — ρ across turns
// The persistent Horizon — memory that IS the moved density operator, not a replayed log.
//
// Every surf so far rebuilt ρ from scratch and threw it away: amnesiac. But the spec's
// own fold pattern says the Horizon is what persists — "the document is a fold of its
// log; the turn is a fold of its stages; the atmosphere is the fold of the cursor
// surprises" (Prediction §3). This is that object across turns: a single density
// operator ρ that
//
//   • COLD-STARTS at σ, the corpus ground (Prediction §4: "the atmosphere is the
//     cold-start prior" — the prediction prior at turn 0 is σ, at turn n is ρ_doc, and
//     the two are separated by exactly the information gained);
//   • ACCUMULATES each turn's reading by a γ-decayed fold, recent readings heavier —
//     so a conversation grows an interpretive state instead of re-deriving one;
//   • DEPARTS σ measurably as evidence arrives — and that departure is the time-integral
//     of the per-turn surprise (Prediction §3: atmosphere = ∫ cursor bayes), which this
//     object accumulates rather than recomputes;
//   • RE-GROUNDS on a measured defeat — drops back toward the bare ground σ (a NUL in
//     the frame), the helix turning. Witness-does-not-decide: the Horizon never authors
//     a reframe; it re-grounds only when handed a measured REC (a Paradigm defeat, the
//     helix predictor's mis-frame), or, opt-in, when a turn's cross-turn surprise beats
//     the deriveNull its own surprise history throws up (the weak, surprise-only trigger).
//
// Pure on vectors past the projection — so the same Horizon accumulates over text turns,
// a melody's phrases, or a video's frames. The prediction reserve it exposes is derived
// from its own spread of readings (noveltyFromLensEntropy), so a Horizon that has
// committed to one frame predicts sharply and one still balanced predicts broadly.

import {
  buildDensity, eigenLenses, vonNeumann, relEntropy, applyStance,
  noveltyFromLensEntropy, deriveNull,
} from '../core/index.js';
import { centroidBasis, corpusSigma } from './atmosphere.js';

const round = (x) => Math.round(x * 1e4) / 1e4;

// Convex blend of two densities, trace-renormalised. Both PSD trace-1 → the blend is
// PSD trace-1, so ρ stays a valid Horizon. g is the weight on the FIRST (the memory).
const mix = (A, B, g) => {
  const n = A.length;
  if (!n || B.length !== n) return A;
  const C = Array.from({ length: n }, () => new Array(n).fill(0));
  let tr = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) C[i][j] = g * A[i][j] + (1 - g) * B[i][j];
  for (let i = 0; i < n; i++) tr += C[i][i];
  if (Math.abs(tr) > 1e-300) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) C[i][j] /= tr;
  return C;
};

// createHorizon({ prior | ground, gamma, regroundStrength, alpha, k })
//
//   prior            the centroid bundle / basis (the MEANING path: σ is built from it).
//   ground           an explicit ground σ as { dim, rho } — the EMBEDDER-FREE path: pass the
//                    structural ground (structure-basis.js `structuralGround()`) so the
//                    Horizon cold-starts over the operator basis with no centroids. Exactly
//                    one of `prior` / `ground` is needed; `ground` wins when both are given.
//   gamma            recency of the fold — weight kept on the accumulated Horizon each
//                    turn (0.8 = slow memory that outlasts a few turns; lower forgets).
//   regroundStrength how far a re-ground pulls ρ back toward σ (0.8 = most of the way to
//                    a bare ground — drop to a NUL in the frame).
//   alpha            the Born budget for the surprise-only auto-reground null.
//   k                how many eigen-lenses to surface in a reading.
export const createHorizon = ({ prior, ground = null, gamma = 0.8, regroundStrength = 0.8, alpha = 0.05, k = 3 } = {}) => {
  // The ground σ: an explicit one (the structural / embedder-free path) takes precedence;
  // otherwise build it from the centroid prior (the meaning path). basis is null on the
  // structural path — nothing internal needs it beyond the σ it would have produced.
  const basis = ground ? null : (prior?.keys ? prior : centroidBasis(prior));
  const sigma = ground || (basis ? corpusSigma(basis) : null);
  if (!sigma?.dim || !Array.isArray(sigma.rho)) {
    throw new Error('createHorizon needs a measurable ground σ — a centroid `prior`, or an explicit `ground` { dim, rho }');
  }

  const state = {
    rho: sigma.rho.map(r => r.slice()),   // cold-start: the corpus ground
    n: 0, turns: 0, regroundings: 0,
    cumSurprise: 0, lastReground: -Infinity,
    surpriseHist: [],
    log: [],                              // append-only: moves and re-grounds
  };

  const spectrum = () => eigenLenses(state.rho).map(l => l.weight);
  const reading = (extra = {}) => {
    const spec = spectrum();
    const S = vonNeumann(spec);
    return Object.freeze({
      turns: state.turns, units: state.n, regroundings: state.regroundings,
      departure: round(relEntropy(state.rho, sigma.rho)),     // how far the Horizon has left σ
      cumulativeSurprise: round(state.cumSurprise),           // ∫ per-turn surprise (Prediction §3)
      entropy: round(S),                                      // the NPOV / predictive-uncertainty scalar
      reserve: round(noveltyFromLensEntropy(S, state.rho.length)),  // the derived novelty reserve
      lenses: eigenLenses(state.rho, { k }).map(l => ({ weight: round(l.weight) })),
      ...extra,
    });
  };

  // How surprising a set of unit activations is GIVEN the accumulated Horizon — the
  // cross-turn Bayesian surprise, read before folding. The reframe signal.
  const surpriseOf = (activations) => {
    const inc = buildDensity(activations).rho;
    return inc.length ? relEntropy(inc, state.rho) : 0;
  };

  // The helix turning: relocate ρ back toward the bare ground σ and log an append-only
  // REC. Called with a measured defeat (a Paradigm rec, the helix predictor's mis-frame).
  const reground = (rec = {}) => {
    state.rho = mix(state.rho, sigma.rho, 1 - regroundStrength);   // pull toward σ
    state.regroundings += 1;
    state.lastReground = state.turns;
    state.log.push(Object.freeze({
      turn: state.turns, op: 'REC', site: 'Paradigm', stance: 'Composing',
      cell: 'REC_Composing_Paradigm', reground: true, ...rec,
    }));
    return reading();
  };

  // Fold one turn's reading into the Horizon. `activations` are the turn's unit vectors
  // (projected into the significance basis). `stance` optionally MOVES the Horizon by a
  // measured stance-map (closing the loop — the commit is what changes ρ). `autoReground`
  // turns on the surprise-only trigger (the weak form; the strong trigger is reground()).
  const observe = (activations, { stance = null, autoReground = false } = {}) => {
    const inc = buildDensity(activations).rho;
    if (!inc.length) return reading();
    const s = relEntropy(inc, state.rho);
    state.surpriseHist.push(s);

    let regrounded = false;
    if (autoReground && state.surpriseHist.length > 4 && state.turns - state.lastReground > 2) {
      const nul = deriveNull(state.surpriseHist.slice(0, -1), { scale: 'linear', alpha });
      if (Number.isFinite(nul) && s > nul) { reground({ surpriseDelta: round(s - nul), rode: 'horizon-surprise' }); regrounded = true; }
    }

    let rho2 = mix(state.rho, inc, gamma);             // the γ-decayed fold
    if (stance) {                                      // close the loop: the commit moves ρ
      rho2 = applyStance(rho2, { family: stance.family, grain: stance.grain, firmness: stance.firmness });
      state.log.push(Object.freeze({ turn: state.turns, op: stance.op || null, stance: stance.stance, grain: stance.grain }));
    }
    state.rho = rho2;
    state.n += activations.length;
    state.turns += 1;
    state.cumSurprise += s;
    return reading({ turnSurprise: round(s), regrounded });
  };

  return Object.freeze({
    observe, surpriseOf, reground, reading,
    get rho() { return state.rho.map(r => r.slice()); },
    get log() { return state.log.slice(); },
    basis, sigma,
  });
};
