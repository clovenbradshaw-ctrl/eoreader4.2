// EO: SEG·DEF(Kind → Field,Lens, Unraveling,Dissecting) — grain bands, cell partition
// Grain bands — the three positions a phasepost fills, partitioned by operator.
//
// A complete SVO fills three positions at once: Ground, Figure, Pattern. The
// 27 phasepost cells partition cleanly by operator into these three bands; a
// proposition is embedded once and scored three times, once against each band,
// yielding three cells with three margins.
//
//   Ground  (NUL, INS)            →  6 cells   the terrain the clause rests on
//   Figure  (SEG, DEF, SIG, EVA)  → 12 cells   the act that stands out
//   Pattern (CON, SYN, REC)       →  9 cells   the relation across the field
//
// This is the SAME partition core/address.js infers from the operator
// (INS/NUL → Ground; CON/SYN/REC → Pattern; the rest → Figure), named here as
// the three reading positions the classifier measures against.
//
// These are the operator-GRAIN bands — the axis the 27 cells partition on. They are
// NOT the structural role positions in parse/positionElements, which read the clause
// by information structure (subject = given → Ground, object = new → Figure, verb =
// relation → Pattern). The two share these three names over two different axes; see
// docs/proposition-addressing.md ("Role positions are not the operator-grain bands").

import { OPERATORS, GRAINS } from '../../core/index.js';

export const BANDS = Object.freeze(['Ground', 'Figure', 'Pattern']);

export const BAND_OPERATORS = Object.freeze({
  Ground:  Object.freeze(['NUL', 'INS']),
  Figure:  Object.freeze(['SEG', 'DEF', 'SIG', 'EVA']),
  Pattern: Object.freeze(['CON', 'SYN', 'REC']),
});

const BAND_OF = Object.freeze(
  Object.entries(BAND_OPERATORS).reduce((m, [band, ops]) => {
    for (const op of ops) m[op] = band;
    return m;
  }, {}),
);

// The grain band an operator's cells live in, or null for an unknown op.
export const bandOf = (op) => BAND_OF[op] || null;

// DESERT — SYN(Making, Field) is empty in every language; the corpus finds no
// verbs there in any language. A classifier route to it is a misfire by
// construction. Treated as a hard demote alongside any proven-empty cell.
export const isDesert = (cell) =>
  !!cell && cell.op === 'SYN' && cell.stance === 'Making' && cell.site === 'Field';

// A cell whose centroid cannot be trusted as a real measurement: the proven
// DESERT, or any cell the registry marks empty (no attested inventory, so its
// centroid — if one exists at all — is not a measured thing). An argmax that
// lands here is a misfire: take the runner-up, or hold at no-commit.
export const isMisfireCell = (cell) =>
  isDesert(cell) || (!!cell && cell.provenance === 'empty');

// Split a CELLS registry (key → cell) into the three bands. Each entry is the
// cell augmented with its registry key, so downstream can index centroids by
// the same key the registry uses (OP_Stance_Site).
export const partitionCells = (cells) => {
  const out = { Ground: [], Figure: [], Pattern: [] };
  for (const [key, cell] of Object.entries(cells || {})) {
    const band = bandOf(cell.op);
    if (band) out[band].push({ key, ...cell });
  }
  return out;
};

// Self-check, in the spirit of core's "exactly nine operators": every operator
// is assigned to exactly one band, and the bands cover the nine. A drift here
// would silently mis-measure, so it fails loudly at load.
const assignedOps = Object.values(BAND_OPERATORS).flat();
if (assignedOps.length !== Object.keys(OPERATORS).length ||
    new Set(assignedOps).size !== assignedOps.length ||
    BANDS.some(b => !GRAINS.includes(b))) {
  throw new Error('grain-band partition is not a clean cover of the nine operators');
}
