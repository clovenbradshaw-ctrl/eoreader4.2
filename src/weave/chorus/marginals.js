// EO: SEG·SIG(Field,Kind → Lens, Unraveling,Tending) — face marginals
// The three faces as axis-marginals of the cube (docs/chorus.md, "The fold-voice").
//
// The primary measure is the distribution over the 27-cell cube (born.js). The
// three faces are its axis-marginals, each a nine-cell distribution got by
// summing the cube over the third axis. Lenses and cells are then ONE structure:
// the cube is the reading, a lens is a marginal of it, and there is no separate
// machinery for faces.
//
// A cell key is `OP_Stance_Site`. The operator fixes (Mode, Domain) — the Act
// face; the stance fixes (Mode, grain); the site fixes (Domain, grain). So each
// cell sits at (Mode, Domain, grain), and the three marginals sum it out one
// axis at a time (matching core/faces.js FACES exactly):
//
//   Act    (Mode   × Domain)  → 9 operators — sum the cube over grain
//   Site   (Domain × grain )  → 9 terrains  — sum the cube over mode
//   Stance (Mode   × grain )  → 9 stances   — sum the cube over domain
//
// This is pure arithmetic over the Born weights. No model, no argmax.

import { OPERATORS, grainOfStance } from '../../core/index.js';

// Decompose a cell key into its three coordinates. `OP_Stance_Site` → the op,
// the stance, the site (terrain), and the shared grain read off the stance. A key
// whose op is unknown returns null, so a malformed bundle key is dropped rather
// than mis-summed.
export const cellCoords = (key) => {
  const parts = String(key).split('_');
  if (parts.length < 3) return null;
  const op = parts[0];
  const stance = parts[1];
  const site = parts.slice(2).join('_');
  const opDef = OPERATORS[op];
  if (!opDef) return null;
  const grain = grainOfStance(stance);
  return Object.freeze({
    key, op, stance, site, grain,
    mode: opDef.mode, domain: opDef.domain,
  });
};

// Sum a Born distribution ({ key, weight }[]) into a marginal keyed by `keyFn`.
// Returns a { key → weight } object; the weights sum to the input's total mass
// (which is 1 for a full Born distribution, less if the caller passed a subset).
const marginalize = (cells, keyFn) => {
  const out = {};
  for (const c of cells) {
    const coords = cellCoords(c.key);
    if (!coords) continue;
    const k = keyFn(coords);
    if (k == null) continue;
    out[k] = (out[k] || 0) + (c.weight || 0);
  }
  return out;
};

// The three marginals of a cube distribution, at once. Each is a nine-cell
// distribution over its face's ground. Pure.
export const cubeMarginals = (cells) => Object.freeze({
  act:    marginalize(cells, (c) => c.op),      // 9 operators
  site:   marginalize(cells, (c) => c.site),    // 9 terrains
  stance: marginalize(cells, (c) => c.stance),  // 9 stances
});

// One face as a sorted list of { key, weight }, descending — the form the
// governor and the render consume. `face` is 'act' | 'site' | 'stance'.
export const marginalCells = (marginals, face) => {
  const m = marginals?.[face] || {};
  return Object.entries(m)
    .map(([key, weight]) => ({ key, weight }))
    .sort((a, b) => b.weight - a.weight);
};
