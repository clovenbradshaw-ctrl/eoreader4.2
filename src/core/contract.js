// EO: DEF·EVA(Kind → Paradigm,Lens, Dissecting,Binding) — EO contract factory + validation
// EO face contracts — the conformance layer (docs/spec-good-watchmaker.md §4,
// docs/eo-for-coders.md Law 1). The canonical contract shape is THREE fields:
//
//   contract = { ops, terrains, stances }
//
// ops       Act face    — which of the nine operators the part may fire
// terrains  Site face    — where its events may land
// stances   Stance face — how its events may resolve
//
// There is no second contract shape (EO for Coders, Law 1). But the Site face has a
// direction a module cares about — what it READS vs what it WRITES — so a contract
// may ALSO carry that split as annotation:
//
//   targets   ⊆ terrains — the terrains it reads / acts on (inputs)
//   products  ⊆ terrains — the terrains it writes / yields (outputs)
//
// and `terrains` is exactly their union. targets/products refine the Site face; they
// do not add a fourth contract axis. Give a contract only `terrains` and the split
// defaults to targets = products = terrains (direction unknown); give it targets and
// products and `terrains` is computed.
//
// The kernel's checks, made mechanical here:
//   · names must be real cube coordinates (a typo is recorded, not silently kept);
//   · a CROSSING — a terrain outside the ops' Domains or a stance outside their Modes
//     — is legal but flagged (`crossColumn`): the sin was crossing silently (§7.5);
//   · the DESERT CELL — SYN resolving at Ground (SYN·Cultivating, the SYN(Field,
//     Cultivating) cell empty across 41 languages) — no contract may declare it.
//
// Pure and non-throwing: a malformed contract carries `valid:false` + `errors`, so the
// registry surfaces the whole worklist at the conformance checkpoint instead of
// crashing on the first bad name.

import { OPERATORS, isOperator, MODES, DOMAINS, GRAINS } from './operators.js';
import { STANCES, TERRAINS, stanceOf, terrainOf } from './cube.js';

// The nine terrain names and nine stance names — the legal Site and Stance coordinates.
export const TERRAIN_NAMES = Object.freeze([...new Set(DOMAINS.flatMap(d => GRAINS.map(g => TERRAINS[d][g])))]);
export const STANCE_NAMES  = Object.freeze([...new Set(MODES.flatMap(m => GRAINS.map(g => STANCES[m][g])))]);
const TERRAIN_SET = new Set(TERRAIN_NAMES);
const STANCE_SET  = new Set(STANCE_NAMES);

// The helix — the strict dependency order of the nine (EO for Coders, Layer 1).
// Existence before Structure before Significance; within each triad, the read before
// the relate before the generate. Exported for dependency-order reasoning.
export const HELIX = Object.freeze(['NUL', 'SIG', 'INS', 'SEG', 'CON', 'SYN', 'DEF', 'EVA', 'REC']);

// The desert cell: SYN at Ground grain — SYN(Field, Cultivating). Empty everywhere;
// no contract may declare it. A contract touches it when it can fire SYN AND resolve
// at Ground in the Generate mode (the Cultivating stance).
export const DESERT_CELL = Object.freeze({ op: 'SYN', terrain: 'Field', stance: 'Cultivating' });

// The three terrains an operator can land at (its Domain × the three grains) and the
// three stances it can resolve with (its Mode × the three grains) — its native reach.
export const terrainsOfOp = (op) => {
  const o = OPERATORS[op?.id ?? op];
  return o ? Object.freeze(GRAINS.map(g => terrainOf(o.domain, g))) : Object.freeze([]);
};
export const stancesOfOp = (op) => {
  const o = OPERATORS[op?.id ?? op];
  return o ? Object.freeze(GRAINS.map(g => stanceOf(o.mode, g))) : Object.freeze([]);
};

const uniq = (xs) => Object.freeze([...new Set(xs)]);

// contract({ ops, terrains?, targets?, products?, stances, note?, floor? }) →
// a frozen, validated CONTRACT. `note` is a free-text label (old name / gloss),
// annotation only. `floor` marks a genome primitive (spec §1).
export const contract = ({ ops = [], terrains = null, targets = null, products = null, stances = [], note = null, floor = false } = {}) => {
  // Resolve the Site face: targets/products refine `terrains`; `terrains` is their union.
  const tgt = targets ?? terrains ?? [];
  const prd = products ?? terrains ?? [];
  const terr = terrains ?? uniq([...tgt, ...prd]);

  const errors = [];
  for (const op of ops) if (!isOperator(op)) errors.push(`unknown-operator: ${op}`);
  for (const t of terr) if (!TERRAIN_SET.has(t)) errors.push(`unknown-terrain: ${t}`);
  for (const t of tgt)  if (!TERRAIN_SET.has(t)) errors.push(`unknown-target: ${t}`);
  for (const p of prd)  if (!TERRAIN_SET.has(p)) errors.push(`unknown-product: ${p}`);
  for (const s of stances) if (!STANCE_SET.has(s)) errors.push(`unknown-stance: ${s}`);
  if (!ops.length) errors.push('no-operator');           // every part fires ≥1 operator

  // targets/products must be inside the declared terrains (the Site face is their union).
  for (const t of tgt) if (TERRAIN_SET.has(t) && !terr.includes(t)) errors.push(`target-outside-terrains: ${t}`);
  for (const p of prd) if (TERRAIN_SET.has(p) && !terr.includes(p)) errors.push(`product-outside-terrains: ${p}`);

  // The desert cell: SYN allowed to resolve at Ground (the Cultivating stance).
  const desertCell = ops.includes('SYN') && stances.includes('Cultivating');
  if (desertCell) errors.push('desert-cell: SYN at Ground (SYN·Cultivating) is empty across all languages');

  // The native reach of the declared operators, and the crossings beyond it.
  const nativeTerrains = new Set(ops.flatMap(op => (isOperator(op) ? terrainsOfOp(op) : [])));
  const nativeStances  = new Set(ops.flatMap(op => (isOperator(op) ? stancesOfOp(op)  : [])));
  const crossedTerrains = uniq(terr.filter(t => TERRAIN_SET.has(t) && !nativeTerrains.has(t)));
  const crossedStances  = uniq(stances.filter(s => STANCE_SET.has(s) && !nativeStances.has(s)));

  return Object.freeze({
    // the canonical three-field contract (Law 1)
    ops: uniq(ops), terrains: uniq(terr), stances: uniq(stances),
    // the Site-face direction (targets ⊆ terrains ⊇ products)
    targets: uniq(tgt), products: uniq(prd),
    note, floor,
    valid: errors.length === 0,
    errors: Object.freeze(errors),
    crossColumn: crossedTerrains.length > 0 || crossedStances.length > 0,
    crossedTerrains, crossedStances,
    desertCell,
  });
};

export const isContract = (c) =>
  !!c && Array.isArray(c.ops) && Array.isArray(c.terrains) &&
  Array.isArray(c.stances) && typeof c.valid === 'boolean';

// A one-line reading of a contract in the cube's own idiom, for headers and traces:
//   INS·SIG(Void,Entity → Entity, Making) — <note>
// ops joined by ·, the Site face as targets → products, stances after the comma.
export const notateContract = (c) => {
  if (!isContract(c)) return '?';
  const site = `${c.targets.join(',') || '—'} → ${c.products.join(',') || '—'}`;
  const how  = c.stances.join(',') || '—';
  return `${c.ops.join('·')}(${site}, ${how})${c.note ? ` — ${c.note}` : ''}`;
};
