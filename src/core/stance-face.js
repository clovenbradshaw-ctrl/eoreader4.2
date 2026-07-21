// EO: REC·DEF(Lens → Lens,Atmosphere,Paradigm, Making,Cultivating,Composing,Clearing) — the shared Stance-face reading instrument
// docs/universalizing-stance-face.md: there is exactly one Stance face in this system —
// core/cube.js's Mode × Object cross, the answer to "how it is done." This module is
// the one instrument that reads it off evidence. Every caller that needs to know how
// something should resolve — surfer/stance.js's per-cursor reading, weave/generate-row/
// stance.js's per-row ledger, or any future caller — asks THIS module, never a hand-rolled
// copy of the same null-vs-epsilon branch.
//
// Both existing callers independently decided "one clean component → Figure, several
// orderable ones → Pattern, otherwise → Ground" and independently routed the result
// through cellAt. Neither piece of that logic is actually about reading a continuous
// field versus a discrete join graph; both callers build DIFFERENT spectra (that part
// stays caller-specific, by design — a reach trace and an activation-vector density are
// different objects) but apply the SAME test to whatever spectrum they end up with.
// That test is what lives here.
//
// Two things this module deliberately does NOT take over:
//   • Ground-grain disambiguation between two Modes (e.g. surfer/stance.js's choice
//     between REC·Cultivating and DEF·Clearing via peakBayes <= reachMedian) — that is
//     real domain content owned by whichever caller has the knowledge to make it. This
//     instrument reads ONE Mode's face; it does not decide which Mode is relevant.
//   • Building the spectrum — a caller's own evidence shape, never invented here.

import { GRAINS, operatorForMode } from './operators.js';
import { stanceOf, terrainOf } from './cube.js';
import { cellAt } from './faces.js';
import { DESERT_CELL } from './contract.js';
import { deriveNull, MIN_SAMPLES } from './voidnull.js';

const round = (x) => Math.round(x * 1e4) / 1e4;

// ── StanceCapability (§2.1) ──────────────────────────────────────────────────
// A caller's declaration of which grains its own evidence can ever support, and why
// not for any it can't — declared once, at the call site, never inferred from
// behavior. reachableGrains ∪ Object.keys(unreachable) must equal all three grains;
// a capability silent about a grain is invalid, not permissive, so construction
// throws immediately rather than letting a silent gap surface at first use.
export const makeStanceCapability = ({ mode, reachableGrains = [], unreachable = {} } = {}) => {
  const covered = new Set([...reachableGrains, ...Object.keys(unreachable)]);
  const missing = GRAINS.filter((g) => !covered.has(g));
  if (missing.length) {
    throw new Error(
      `StanceCapability for mode ${mode} must account for every grain — missing: ${missing.join(', ')}`,
    );
  }
  return Object.freeze({
    mode,
    reachableGrains: Object.freeze([...reachableGrains]),
    unreachable: Object.freeze({ ...unreachable }),
  });
};

// ── The unified small-n floor (§5) ───────────────────────────────────────────
// Above MIN_SAMPLES: deriveNull's leave-one-out null, exactly as today (core/
// voidnull.js already documents and tests this regime — untouched). At or below
// MIN_SAMPLES: a closed-form floor DERIVED FROM alpha, not a second unrelated
// constant. A component below MIN_SAMPLES background carries no estimable chance
// distribution (deriveNull's own abstention reason), so this floor does not ask
// "does this exceed chance" — it asks "is there real, non-negligible mass on this
// axis at all" — but it ties the floor to the SAME alpha every large-n caller
// already tunes, via the smallest floor an n-sample spectrum could clear at that
// alpha under a conservative Chebyshev bound: epsilon(n, alpha) = 1 / sqrt(n / alpha).
// Deliberately conservative (wide), not a tight estimate — its job is "clearly real
// mass," not "significant at alpha." Verified byte-for-byte against every existing
// small-n fixture in tests/row-stance-templates.test.js and tests/row-plans.test.js
// (the flat EPS = 0.05 this replaces), not derived from first principles beyond
// "conservative and alpha-linked." Note this floor moves OPPOSITE deriveNull's own
// alpha direction (deriveNull: smaller alpha -> a HIGHER bar; this: smaller alpha ->
// a LOWER epsilon) — a property of the closed form, not a typo; no shipped caller
// varies alpha away from the shared default (0.05) today, so this is not yet load-
// bearing, but a future caller tuning alpha for both regimes should know the small-n
// side runs the other way.
const clearFloor = (spectrum, alpha) => {
  const xs = spectrum || [];
  if (xs.length > MIN_SAMPLES) {
    return { floor: deriveNull(xs, { alpha, leaveOut: xs[0] }), kind: 'deriveNull' };
  }
  return { floor: 1 / Math.sqrt(Math.max(xs.length, 1) * (1 / alpha)), kind: 'epsilon' };
};

export const clearedComponents = (spectrum, { alpha = 0.05 } = {}) => {
  const xs = spectrum || [];
  const { floor } = clearFloor(xs, alpha);
  return xs.filter((w) => w > floor);
};

// ── The dynamic desert-cell guard (§6) ───────────────────────────────────────
// Generalized over core/contract.js's forbidden-cell list (currently just
// DESERT_CELL), so a future addition there is caught here automatically rather than
// requiring a matching hand-written check in every reader.
const FORBIDDEN_CELLS = [DESERT_CELL];
const isForbiddenCell = (c) =>
  FORBIDDEN_CELLS.some((f) => f.op === c.op && f.terrain === c.terrain && f.stance === c.stance);

// cellForGrain(mode, domain, grain) — the candidate cell for (mode, domain, grain) via
// the real operator lookup (operatorForMode: a total lookup, not a per-shape hardcoded
// table), refused if it matches a forbidden cell. Checks the ACTUAL constructed
// (op, terrain, stance) triple, never a caller-supplied hint string.
export const cellForGrain = (mode, domain, grain) => {
  const op = operatorForMode(mode, domain);
  if (!op) return Object.freeze({ refused: true, reason: 'off-diagonal' });
  const terrain = terrainOf(domain, grain);
  const stance = stanceOf(mode, grain);
  const candidate = { op: op.id, terrain, stance };
  if (isForbiddenCell(candidate)) return Object.freeze({ refused: true, reason: 'desert-cell' });
  const cell = cellAt(op.id, { site: terrain, stance });
  if (!cell) return Object.freeze({ refused: true, reason: 'off-diagonal' });
  return cell;
};

const refusedReading = ({ mode, grain, capability, spectrum, reason }) => Object.freeze({
  mode, grain, stance: null, cell: null, firmness: 0, guard: false,
  refused: true, reason, capability, spectrum,
});

// ── The shared reading instrument (§4) ───────────────────────────────────────
// readStanceFace({ spectrum, mode, domain, capability, orderable, alpha }) -> StanceReading
//
//   spectrum     number[] — eigenvalues, caller's own construction.
//   mode         'Differentiate' | 'Relate' | 'Generate'.
//   domain       'Existence' | 'Structure' | 'Interpretation' — the caller's OWN domain.
//   capability   a StanceCapability (see makeStanceCapability).
//   orderable    whether the caller's evidence carries a groundable traversal order.
//   alpha        the hallucination budget for clearedComponents (default 0.05).
//   firmnessOf   (top, floor) -> firmness ∈ [0.1, 1], overridable per caller.
//
// Pure. No model, DOM, network, or mutation. Generalized over Mode — nothing here is
// Generate-specific; Generate is simply the only Mode with concrete evidence-producing
// callers today (surfer/stance.js, weave/generate-row/stance.js).
export const readStanceFace = ({
  spectrum, mode, domain, capability, orderable = false, alpha = 0.05,
  firmnessOf = (top, nul) => Math.max(0.1, Math.min(1, (top - nul) / (nul || 1e-9))),
} = {}) => {
  const xs = spectrum || [];
  const { floor, kind } = clearFloor(xs, alpha);
  const cleared = xs.filter((w) => w > floor);

  let grain;
  if (cleared.length === 0) grain = 'Ground';
  else if (cleared.length === 1) grain = 'Figure';
  else if (orderable) grain = 'Pattern';
  else grain = 'Ground';   // multi-part, unorderable: reserve, don't invent order

  const spectrumInfo = Object.freeze({
    clearedCount: cleared.length,
    floor: kind,
    floorValue: Number.isFinite(floor) ? round(floor) : null,
  });

  if (!capability.reachableGrains.includes(grain)) {
    return refusedReading({ mode, grain, capability, spectrum: spectrumInfo, reason: 'off-capability' });
  }

  const cell = cellForGrain(mode, domain, grain);
  if (cell.refused) {
    return refusedReading({ mode, grain, capability, spectrum: spectrumInfo, reason: cell.reason });
  }

  const top = xs.length ? xs[0] : 0;
  const firmness = round(Number.isFinite(floor) ? firmnessOf(top, floor) : 0.1);

  return Object.freeze({
    mode, grain, stance: cell.stance, cell: cell.key,
    firmness, guard: grain === 'Ground',
    refused: false, reason: null,
    capability, spectrum: spectrumInfo,
  });
};
