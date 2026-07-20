// EO: EVA·REC·DEF(Field,Lens → Lens,Atmosphere, Making,Cultivating,Clearing) — update stance + confab guard
// The Stance face — how the surfer MOVES ρ (Track F), and the confabulation guard
// made quantitative.
//
// Tracks A–E read the Horizon ρ. This is the fourth surfer faculty: not where to look
// (the cursor), not which lens (Track C), but HOW TO UPDATE — the manner of the commit.
// The witness-does-not-decide rule says that manner has a measured-correct answer read
// off the field, never authored. It is the only faculty that closes the loop back onto
// ρ (core/spectral.js applyStance), so it is what makes the column a DYNAMICS rather
// than a sequence of readings.
//
// THE GUARD, MADE QUANTITATIVE (cube.md #1, #7). cube.md's predicted error is "Make
// where you should Cultivate or Clear" — a Figure fix on a Ground problem, the invented
// location ("the situation in the —" with a spurious place). In operator terms it is
// exact: minting a fake rank-1 eigen-lens when the honest move was to raise the floor
// (Cultivating — "I am less sure where this is", entropy up, no direction) or remove a
// component (Clearing — a defeat). This module reads the update stance off the field
// shape around the peak by asking core/stance-face.js's readStanceFace — the ONE shared
// instrument every Stance-face reader uses (docs/universalizing-stance-face.md) — and
// REFUSES a Making the field does not support:
//
//   if a rank-1 component clears its spectral null           → Making     (commit a lens)
//   else if the field around the peak is measurably flat      → Cultivating (reserve, do not commit)
//   else                                                      → Clearing   (dephase; a real
//                                                                            surprise but no clean lens)
//
// This is answerability (surfer/answerable.js fieldIsVoid — the refusal to Make where
// you should Clear) generalised from the binary void/not-void to the full nine-way
// stance read. The Ground-grain outcomes (Cultivating/Clearing) ARE the guard firing:
// the field supports only a Ground move, so a Figure commit would be the confabulation,
// and the talker must reserve rather than name a clause.
//
// This file owns the field-reading and the Ground-disambiguation content (why a flat
// field means Cultivating and a surprised-but-lensless one means Clearing —
// peakBayes <= reachMedian): that judgment picks WHICH Mode's Ground stance applies,
// and readStanceFace deliberately never makes that call on a caller's behalf (it reads
// one Mode's face; it does not decide which Mode is relevant). The "does this spectrum
// clear one component, several orderable ones, or none" test itself has moved to
// core/stance-face.js, shared with weave/generate-row/stance.js's row instrument.

import { eigenLenses, applyStance, vonNeumann, readStanceFace, makeStanceCapability } from '../core/index.js';

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round = (x) => Math.round(x * 1e4) / 1e4;

// This caller's own declared reach (docs/universalizing-stance-face.md §7): a
// continuous per-cursor field carries no relation graph to traverse, so Pattern is
// structurally unreachable — a DECLARED fact, checked at every call, not an inferred
// one read off the shape of MOVES.
const SURFER_CAPABILITY = makeStanceCapability({
  mode: 'Generate',
  reachableGrains: ['Ground', 'Figure'],
  unreachable: { Pattern: 'a continuous per-cursor field has no relation graph to traverse' },
});
// The Differentiate-mode sibling for the Clearing branch: the guard only ever dephases
// at Ground (a real surprise with no clean lens); it never names a Figure or Pattern
// under Differentiate here.
const CLEARING_CAPABILITY = makeStanceCapability({
  mode: 'Differentiate',
  reachableGrains: ['Ground'],
  unreachable: {
    Figure: 'the guard only ever dephases at Ground here',
    Pattern: 'the guard only ever dephases at Ground here',
  },
});

// The Mode each measured move belongs to — used only to route applyMeasuredStance's ρ
// update (core/spectral.js applyStance) to the right family of primitive.
const STANCE_MODE = Object.freeze({ Making: 'Generate', Cultivating: 'Generate', Clearing: 'Differentiate' });

// updateStance(field, peak, rho, { alpha }) → { op, site, stance, grain, firmness, guard, rode }
//
//   field   the per-cursor reach trace (each { idx, bayes, … }) — the surf's own field.
//   peak    the cursor the significance reading is taken at.
//   rho     the Horizon (density operator) built over the doc's significance activations.
//   alpha   the hallucination budget for the spectral null on the eigenvalues.
//
// Returns the measured commit. `guard` is true when the field supports only a
// Ground-grain move — the confabulation guard firing: reserve, do not name a clause.
export const updateStance = (field, peak, rho, { alpha = 0.05 } = {}) => {
  const spectrum = rho?.length ? eigenLenses(rho).map(l => l.weight) : [];
  const peakBayes = field?.find(f => f.idx === peak)?.bayes ?? 0;
  const reachMedian = median((field || []).map(f => f.bayes));

  const reading = readStanceFace({
    spectrum, mode: 'Generate', domain: 'Interpretation',
    capability: SURFER_CAPABILITY, orderable: false, alpha,
  });

  let picked, firmness;
  if (!reading.refused && reading.grain === 'Figure') {
    picked = reading; firmness = reading.firmness;
  } else {
    // Ground: the surfer's own content-specific split, unchanged — readStanceFace
    // reads the FACE, this caller still decides WHICH Mode's Ground applies.
    if (peakBayes <= reachMedian) {
      picked = readStanceFace({
        spectrum, mode: 'Generate', domain: 'Interpretation', capability: SURFER_CAPABILITY, alpha,
      });
      firmness = 0.3;
    } else {
      picked = readStanceFace({
        spectrum, mode: 'Differentiate', domain: 'Interpretation', capability: CLEARING_CAPABILITY, alpha,
      });
      firmness = 0.5;
    }
  }

  if (picked.refused || !picked.cell) {
    return { op: null, site: null, stance: null, grain: null, firmness: 0, guard: false, rode: 'stance-field', refused: true };
  }

  // The cell key is OP_Stance_Terrain (core/cube.js cellOf) — read op/site off it
  // rather than re-deriving them from a hand-rolled Mode/grain table.
  const [op, , site] = picked.cell.split('_');

  return Object.freeze({
    op, site, stance: picked.stance, grain: picked.grain,
    firmness: round(firmness),
    guard: picked.grain === 'Ground',   // a Ground commit IS the confabulation guard firing
    cell: picked.cell,
    rode: 'stance-field',
  });
};

// applyMeasuredStance(rho, stance, opts) → { rho', entropyBefore, entropyAfter } — close
// the loop: actually move the Horizon by the measured stance (core/spectral.applyStance)
// and report the entropy change, so the audit can show what the commit did to ρ. A
// Making lowers entropy (a spike), a Cultivating raises it (the reserve), a Clearing
// drops the floor. Pure; the caller decides whether to persist ρ'.
export const applyMeasuredStance = (rho, stance, { lens = null } = {}) => {
  if (!rho?.length || !stance || stance.refused) return null;
  const before = vonNeumann(eigenLenses(rho).map(l => l.weight));
  const moved = applyStance(rho, { family: STANCE_MODE[stance.stance], grain: stance.grain, firmness: stance.firmness, lens });
  const after = vonNeumann(eigenLenses(moved).map(l => l.weight));
  return { rho: moved, entropyBefore: round(before), entropyAfter: round(after) };
};
