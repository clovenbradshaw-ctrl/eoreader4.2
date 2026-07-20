// EO: DEF(Lens → Lens, Dissecting) — the closed slot-role vocabulary
// docs/generate-row-stance-templates.md §4/§4.1: a row's data is a fixed, enumerable set
// of slot roles — no open text field except §6's pre-approved template strings. This file
// is the single source of truth for which roles exist, which shape licenses which roles,
// and what "no plan invents a role" (§16's release invariant) actually checks against.

// §4.1's roster, verbatim. Cardinality strings are documentation; `legalSlots` only
// checks membership, not the exact count (count is a render-time concern, §9).
export const SLOT_PALETTES = Object.freeze({
  readout: Object.freeze({
    answer: 'one',
    verdict: 'one',
    void: '0-1',
  }),
  cultivating: Object.freeze({
    lede: '0-1',
    lens: 'one-per-significant-aspect-then-proportional',
    relation: 'adjacent-licensed-only',
    'contest-side': 'one-per-side',
    void: 'final',
  }),
  making: Object.freeze({
    answer: 'one',
    relation: 'one',
    verdict: 'one',
  }),
  composing: Object.freeze({
    orientation: '0-1-or-fixed-by-target',
    section: 'many',
    claim: 'many-per-section',
    relation: 'one-per-join',
    'contest-side': 'at-disagreement',
    reframing: 'at-revision',
    closure: '0-1',
  }),
});

export const SHAPES = Object.freeze(Object.keys(SLOT_PALETTES));

// legalSlots(shape) -> role[] — the closed set of roles a shape may ever populate.
export const legalSlots = (shape) => {
  const palette = SLOT_PALETTES[shape];
  return palette ? Object.freeze(Object.keys(palette)) : Object.freeze([]);
};

// isLegalRole(shape, role) -> boolean — the primitive `legalSlots` is built from, and
// what a plan's `slots` override (§11) is checked against: a plan may narrow or suppress
// an existing role, never introduce one the base shape's palette does not define.
export const isLegalRole = (shape, role) => legalSlots(shape).includes(role);

// A `lens` slot resolves to its own sub-row, recursively — but only ONE level deep
// (§4.2): a lens may resolve to `readout` or `making` (both Figure-grain, terminal), never
// `cultivating` or `composing` (which would need a nested survey/essay with nowhere to
// stop). §16's release invariant / §14 items 15 & 45 check this directly.
export const LENS_TERMINAL_SHAPES = Object.freeze(['readout', 'making']);
export const isLensLegalShape = (shape) => LENS_TERMINAL_SHAPES.includes(shape);
