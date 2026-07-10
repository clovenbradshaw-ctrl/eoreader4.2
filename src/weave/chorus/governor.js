// EO: SEG(Field → Field, Clearing) — coverage governor
// The governor — voice by cumulative mass to a coverage budget (docs/chorus.md,
// "The governor").
//
// Normalize, square (born.js), then voice by cumulative mass: order the cells by
// weight, take them until the running sum crosses the budget, stop. The tail is
// NOT cut by a rule — it falls below the budget on its own. The number of voices
// is whatever the distribution needs: one for a sharp reading, several for an
// ambiguous one. There is no k to tune. There is a coverage fraction, a readable
// knob and not a magic number.
//
// This is the same shape the level governor (levels.js) runs on the level axis —
// instantiate only what the material lights up, on both axes.

import { sortedByWeight } from './born.js';

// The default coverage budget. Two thirds is the same order as Probe A's pass
// line (docs/chorus.md, Gate zero) — if real readings concentrate ~2/3 of their
// mass in three cells, a 2/3 budget voices roughly that head and lets the tail go
// silent. A caller may raise it toward 1 (voice more of the tail) or lower it
// (voice only the sharpest cells). It is never a count.
export const DEFAULT_COVERAGE = 0.8;

// Voice a distribution to a coverage budget. Returns:
//   voiced   — the head, in descending weight, whose cumulative mass first
//              crosses the budget (the crossing cell is included).
//   silent   — the tail, below the budget, kept WITH its address (never dropped;
//              recoverability is the whole reason the voices are folds).
//   massVoiced / coverage — the mass actually spoken and the budget it targeted.
//
// Degenerate inputs are honest: an all-zero distribution (no mass) voices nothing
// — silence is the correct reading of "nothing measured", not a forced top-1.
// Pure and deterministic (ties break by input order, via sortedByWeight).
export const govern = (cells, { coverage = DEFAULT_COVERAGE } = {}) => {
  const budget = Math.max(0, Math.min(1, coverage));
  const sorted = sortedByWeight(cells || []);
  const total = sorted.reduce((s, c) => s + (c.weight || 0), 0);

  const voiced = [];
  let mass = 0;
  if (total > 0) {
    for (const c of sorted) {
      voiced.push(c);
      mass += c.weight || 0;
      if (mass >= budget * total) break;   // crossed the budget → stop
    }
  }
  const voicedKeys = new Set(voiced.map((c) => c.key));
  const silent = sorted.filter((c) => !voicedKeys.has(c.key));

  return Object.freeze({
    voiced: Object.freeze(voiced),
    silent: Object.freeze(silent),
    coverage: budget,
    massVoiced: mass,
    massTotal: total,
    k: voiced.length,   // reported, never tuned — the reading chose it
  });
};
