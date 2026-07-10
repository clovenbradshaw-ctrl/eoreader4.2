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
// component (Clearing — a defeat). updateStance reads the update stance off the field
// shape around the peak and REFUSES a Making the field does not support:
//
//   if a rank-1 component clears its spectral deriveNull   → Making     (commit a lens)
//   else if the field around the peak is measurably flat    → Cultivating (reserve, do not commit)
//   else                                                    → Clearing   (dephase; a real
//                                                                          surprise but no clean lens)
//   …route (op, site, stance) through cellAt — drop if the Object-diagonal guard rejects it.
//
// This is answerability (surfer/answerable.js fieldIsVoid — the refusal to Make where
// you should Clear) generalised from the binary void/not-void to the full nine-way
// stance read. The Ground-grain outcomes (Cultivating/Clearing) ARE the guard firing:
// the field supports only a Ground move, so a Figure commit would be the confabulation,
// and the talker must reserve rather than name a clause.

import { deriveNull, eigenLenses, cellOf, applyStance, vonNeumann } from '../core/index.js';
import { cellAt } from '../core/index.js';

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round = (x) => Math.round(x * 1e4) / 1e4;

// The three measured moves and the cell each lands in (Resolution × Site faces). Each
// is a real Object-diagonal cell of core/cube.js — Making at Lens (Figure), Cultivating
// and Clearing at Atmosphere (Ground). The op is fixed by the Mode: Generate→REC,
// Differentiate→DEF at the Interpretation domain.
const MOVES = Object.freeze({
  Making:      { op: 'REC', site: 'Lens',       stance: 'Making',      grain: 'Figure', family: 'Generate' },
  Cultivating: { op: 'REC', site: 'Atmosphere', stance: 'Cultivating', grain: 'Ground', family: 'Generate' },
  Clearing:    { op: 'DEF', site: 'Atmosphere', stance: 'Clearing',    grain: 'Ground', family: 'Differentiate' },
});

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

  let name, firmness;
  if (spectrum.length) {
    const top = spectrum[0];
    const nul = deriveNull(spectrum, { scale: 'linear', alpha, leaveOut: top });
    if (Number.isFinite(nul) && top > nul) {
      // a rank-1 component cleared its spectral null → mass is there → commit a lens
      name = 'Making';
      firmness = Math.max(0.1, Math.min(1, (top - nul) / (nul || 1e-9)));   // how hard the map applies
    }
  }
  if (!name) {
    // no clean lens — the field decides between reserving (flat) and removing (a real
    // surprise with no direction to commit). This is where the guard fires.
    if (peakBayes <= reachMedian) { name = 'Cultivating'; firmness = 0.3; }   // flat → reserve
    else                          { name = 'Clearing';    firmness = 0.5; }   // surprise, no lens → dephase
  }

  const move = MOVES[name];
  // Route through the Object-diagonal guard. A grain-mixed request (a Figure stance at a
  // Ground site) returns null and the move is refused — the guard as a measurement, not
  // a rule. Every MOVES entry is diagonal by construction, so this confirms rather than
  // surprises; it is here so a future edit that breaks the diagonal fails loudly.
  const cell = cellAt(move.op, { site: move.site, stance: move.stance });
  if (!cell) return { op: null, site: null, stance: null, grain: null, firmness: 0, guard: false, rode: 'stance-field', refused: true };

  return Object.freeze({
    op: move.op, site: move.site, stance: move.stance, grain: move.grain,
    firmness: round(firmness),
    guard: move.grain === 'Ground',   // a Ground commit IS the confabulation guard firing
    cell: cell.key,
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
  const moved = applyStance(rho, { family: MOVES[stance.stance]?.family, grain: stance.grain, firmness: stance.firmness, lens });
  const after = vonNeumann(eigenLenses(moved).map(l => l.weight));
  return { rho: moved, entropyBefore: round(before), entropyAfter: round(after) };
};
