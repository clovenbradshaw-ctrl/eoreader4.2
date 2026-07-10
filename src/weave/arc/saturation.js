// EO: EVA(Field,Network → Lens, Binding,Tracing) — saturation stop-gate
// The SATURATION gate (EVA → NUL, §5.6) — the actual stop condition.
//
// This is what makes length emergent. Before generating each planned section,
// EVA asks whether it would add NEW coverage. The loop ends when the evidence is
// drawn down, regardless of how many sections the plan nominally held: a
// `standard` arc over a thin document produces two paragraphs, over a rich one
// ten, with no change to the policy.
//
//   remaining   = totalMass − covered mass
//   nextNovelty = 1 − overlap(section.spanSet, coveredSpans)
//   stop when    remaining/total < EPSILON   (budget spent)
//            or  nextNovelty     < NOVELTY_FLOOR   (next section just re-cites)
//
// Returns the measured values alongside the verdict, so the audit's
// length-decision trace records the saturation numbers at termination — the
// length of the answer becomes a reviewable number, not a guess.

import { EPSILON, NOVELTY_FLOOR } from './constants.js';

// The ground-pool form of the gate, for the planner's atom walk (spec-planner.md
// §10). A section arc plans clusters; the planner deposits one span at a time, so it
// reads saturation directly off the ranked ground pool: stop when the UNCOVERED mass
// falls below `epsilon` of the total. This is the single knob that now does what a
// length target used to do — the one number that sets response shape — so it is
// exposed and recorded, never a hidden backstop.
export const groundSaturation = (ground = [], covered = new Set(), { epsilon = EPSILON } = {}) => {
  const cov = covered instanceof Set ? covered : new Set(covered || []);
  let total = 0, coveredMass = 0;
  for (const [i, s] of (ground || []).entries()) {
    const idx = s.idx ?? i;
    const mass = s.score || 0;
    total += mass;
    if (cov.has(idx)) coveredMass += mass;
  }
  const remainingFrac = total > 0 ? (total - coveredMass) / total : 0;
  return { saturated: remainingFrac < epsilon, remainingFrac, total, coveredMass };
};

// The fraction of a section's spans that are already covered.
export const overlap = (spanSet = [], coveredSpans) => {
  if (!spanSet.length) return 1;            // a section with no evidence adds nothing
  const covered = coveredSpans instanceof Set ? coveredSpans : new Set(coveredSpans);
  let hit = 0;
  for (const idx of spanSet) if (covered.has(idx)) hit++;
  return hit / spanSet.length;
};

// The EVA coverage gate. `proceed:true` means generate the section; `false`
// means NUL — terminate the arc here. `reason` names which condition fired.
export const evaCoverageGate = (section, covered, { totalMass = 0, epsilon = EPSILON, noveltyFloor = NOVELTY_FLOOR } = {}) => {
  const coveredMass = covered?.coveredMass || 0;
  const coveredSpans = covered?.coveredSpans || new Set();
  const remaining = totalMass - coveredMass;
  const remainingFrac = totalMass > 0 ? remaining / totalMass : 0;
  const novelty = 1 - overlap(section.spanSet, coveredSpans);

  if (remainingFrac < epsilon)
    return { proceed: false, reason: 'budget-spent', remainingFrac, novelty };
  if (novelty < noveltyFloor)
    return { proceed: false, reason: 'no-novelty', remainingFrac, novelty };
  return { proceed: true, reason: null, remainingFrac, novelty };
};
