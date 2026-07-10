// EO: DEF·EVA(Field,Lens → Lens, Unraveling,Tracing) — significance arc, phase bias
// shape — the significance arc, not a canon (spec-planner.md §8).
//
// The temptation is a canon of response shapes — comparison goes two-sided,
// explanation goes general-then-instance — matched to the question and filled. That
// is McKeown's schemata, and it fights this system: a schema is a shape chosen from
// OUTSIDE the field and imposed on it, a void gate run backwards, and over a thin
// stub it supplies a balance the evidence cannot earn (the §3 structural lie on
// purpose).
//
// So no canon. ONE arc, derived: open by setting terms, develop, land. DEF or an
// orienting INS, then CON and EVA through the middle, then SYN to close. That is not
// a genre — it is the DEF→EVA→REC cycle, the significance row's intrinsic order, the
// shape any reading takes when it sets terms, tests them, and holds or restructures.
// The variety a canon would supply falls out of which operators the field offers; a
// contrast edge produces a comparison because the surfer keeps arresting on it.
//
// The arc is also the FLOOR on thin answers. An opening with no development and no
// close is just an opening — the honest one-sentence answer. The arc must land on
// something, so when there is nothing to land on it collapses to the term-setting
// atom and stops. Shape is what makes a long answer hold AND what makes a thin one
// stay short.
//
// shape.js does not navigate — it BIASES the navigation. It names the phase the
// coarse walk is in and a multiplicative bias over the alphabet that leans the
// direction draw toward that phase's operators; direction.js applies it before the
// temperature reach. The operator is still drawn, never dictated — a strong REC
// signal (the weld) overrides the develop bias, as it should.

import { MOVE_ALPHABET } from '../../perceiver/predict/movelog.js';
import { arcTarget } from '../../surfer/flow/index.js';

// When the uncovered budget falls to this fraction of the total, the walk is in its
// closing reach — lean toward SYN to land. Above it, the body develops.
const CLOSE_FRAC = 0.25;

// The phase the coarse walk is in, read off the state — not chosen from a shelf.
//   open     no atoms yet: set the terms (DEF / orienting INS)
//   land     the budget is nearly spent and there is something to close over (SYN)
//   develop  the body: CON and EVA through the middle
export const arcPhase = ({ stepIndex = 0, units = [], remainingFrac = 1 } = {}) => {
  if (units.length === 0 || stepIndex === 0) return 'open';
  if (remainingFrac <= CLOSE_FRAC && units.length >= 2) return 'land';
  return 'develop';
};

// The operators each phase leans on (the significance-row order, opened out). In the
// `land` phase the external pool is spent, so the NODE ops (DEF/INS/CON/SIG) have no
// fresh ground to introduce — leaning on them is exactly the walk that stops early
// (essay-backwards). So `land` boosts the SELF ops that develop and close what the
// pool bought (EVA/REC to develop, SYN to land) and SUPPRESSES the node ops below 1,
// so the multiplicative bias steers the draw off the unrealizable moves.
const PHASE_OPS = Object.freeze({
  open:    { DEF: 2.4, INS: 1.8, SIG: 1.3 },
  develop: { CON: 1.8, EVA: 1.8, SIG: 1.2 },
  land:    { SYN: 3.0, REC: 2.0, EVA: 2.0, CON: 0.2, DEF: 0.2, INS: 0.2, SIG: 0.5 },
});

// A multiplicative bias over the alphabet for a phase — 1 for every operator the
// phase does not lean on, the boost for the ones it does. Multiplicative so it
// reweights a real posterior rather than replacing it: a near-zero move stays near
// zero (the floor is never invented), and a dominant weld signal survives.
export const phaseBias = (phase) => {
  const lean = PHASE_OPS[phase] || {};
  const bias = {};
  for (const op of MOVE_ALPHABET) bias[op] = lean[op] ?? 1;
  return bias;
};

// NOTE (essay-backwards, a negative result): biasing this posterior off the last move
// to force the interleave cadence (introduce→develop→turn) does NOT work. Even at
// recurrence weight 0 the structure+grammar priors trap the walk on whatever op last
// repeated (CON·EVA·EVA·…), and no multiplier overcomes them without becoming a
// dictate. The fine cadence is not coaxable out of the reader's move-predictor; it is
// the §4.2 plan→proposition resolver on a real referent-and-relation graph, where the
// SITE structure dictates the order. See docs/essay-backwards.md §8.

// Apply a bias to a ranked posterior ([[op, p], …]), renormalising. Returns a new
// ranked posterior (descending). Pure; direction.js draws the temperature reach off
// the result so the phase shapes WHICH operator the reach lands on.
export const applyPhaseBias = (posterior = [], bias = {}) => {
  const weighted = posterior.map(([op, p]) => [op, p * (bias[op] ?? 1)]);
  const Z = weighted.reduce((s, [, p]) => s + p, 0);
  const normed = Z > 0 ? weighted.map(([op, p]) => [op, p / Z]) : weighted;
  return normed.sort((a, b) => b[1] - a[1]);
};

// The thin-answer collapse: after the opening atom, is there anything to develop?
// True when the uncovered budget is already spent (one-span ground → one atom). The
// loop reads this to stop after the open rather than padding a develop/land it
// cannot ground — the arc's floor on thin answers made operational.
export const shouldCollapse = ({ units = [], remainingFrac = 1, epsilon = 0.05 } = {}) =>
  units.length >= 1 && remainingFrac < epsilon;

// THE BUILD-ARC SCHEDULE as a phase target (src/flow). arcPhase names the phase off
// the state; this hands that phase the corpus-typical CUMULATIVE state to aim the
// artifact at — early: entity introduction high; late: relations and coref rising,
// new entities decaying. It is the measured complement to phaseBias: phaseBias leans
// the operator draw (condition the behavior), while arcPhaseTarget conditions the
// ARTIFACT — the target is a state the corpus reaches at this reading position, not a
// rule. `t` is how far along the arc is (budget spent = 1 − remainingFrac). Off by
// default: no prior wired ⇒ null, and nothing downstream changes.
export const arcPhaseTarget = (prior, { remainingFrac = 1, stepIndex = null, totalSteps = null } = {}) => {
  if (!prior) return null;
  const t = (Number.isFinite(stepIndex) && Number.isFinite(totalSteps) && totalSteps > 0)
    ? stepIndex / totalSteps
    : Math.min(1, Math.max(0, 1 - remainingFrac));
  return arcTarget(prior, t);
};
