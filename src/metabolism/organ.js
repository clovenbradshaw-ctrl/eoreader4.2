// EO: INS·SYN·CON·EVA(Void,Network → Entity,Link,Lens, Making·Composing·Binding·Binding) — an organ is a contract
// metabolism/organ.js — the unit organogenesis grows: a part that is also a whole.
//
// An organ is, formally, a CONTRACT — a region of the cube a part is licensed to occupy —
// instantiated as a holon on a substrate path. That is the whole trick the audit essay
// already found: a holon is modular, weakly-linked, and declares one contract in three
// fields, which is exactly a genome format — a part can vary without breaking the rest, and
// a duplicated part can drift into new work while the original keeps running. So the organ
// is not a new abstraction; it is the holon, pointed at the body instead of the reading.
//
// An organ claims ONE diagonal cell of the cube (an operator crossed with a grain → its
// stance and terrain). The 27 cells minus the ones current organs occupy are the DESERT —
// the unexpressed phenotype, the developmental space evolution is allowed to grow into.
// Weight-tuning can never reach those cells because there is no organ there to tune; growing
// an organ is instantiating a holon whose contract claims a cell no current organ claims.
//
// THE ISOLATION CHECKPOINT (the watchmaker's developmental discipline). A new organ is not
// admitted by fiat. `validate()` is its own checkpoint: it must be a well-formed contract on
// the cube — real coordinates, on the diagonal — and it must NOT fabricate a whole from the
// Void (SYN at Ground, the desert cell). That last is not a preference; it is the ground the
// whole space rests on (constitution.js): you may DWELL in the Void (hold an unbound thread —
// NUL at Ground) but you may not FABRICATE from it. An organ that cannot validate in isolation
// never gets wired into anything. That is the difference between morphogenesis and a tumor.
//
// UPKEEP. A grown organ costs resource to run, every turn, forever — the metabolism pays for
// it. The costliest cells are the reasoning ones (REC/EVA/DEF, the Interpretation domain, the
// organs that warm the model); the cheapest are the mechanical holds and attributions (NUL/
// SIG). So a body that grows a reasoning organ it does not feed will atrophy it under a lean
// season, exactly as a costly trait with no fitness payoff is selected out.

import { contract, notateContract } from '../core/index.js';
import { cellOf } from '../core/index.js';
import { OPERATORS } from '../core/index.js';
import { holonId, joinHolon, parseHolon } from '../core/index.js';
import { wellFormedOrgan } from './constitution.js';

// UPKEEP_BY_OP — energy per turn to keep an organ firing a given operator alive. Grounded in
// the same premise as scarcity.js COSTS: the model call (the reasoning organs) is THE expensive
// act; mechanical holds and bonds are near-free. This is the price the metabolism pays for
// structure, and thus the pressure that prunes a body that grows more than it can feed.
export const UPKEEP_BY_OP = Object.freeze({
  NUL: 0.5,   // hold — the Void-dwelling organ, near free
  SIG: 0.6,   // attribute
  SEG: 0.8,   // resplit / parse
  CON: 1.0,   // bond — the central operator, but mechanical
  INS: 1.2,   // instantiate
  DEF: 1.8,   // assert
  SYN: 2.5,   // synthesize
  EVA: 3.5,   // evaluate — model-ish
  REC: 4.5,   // learn a rule — the priciest, the reasoning organ
});

// RESOURCE_BY_OP — which scarce resource an organ firing this operator SERVES (relieves the
// strain on). The Interpretation domain reasons (model); Existence/Structure relate to forage
// (fetch); Generate instantiates output (tokens); Differentiate-Structure resplits (time);
// Differentiate-Existence holds (storage — the Void-keeper). So a strain on a resource knows
// which cell would serve it, and the leap the system cannot make is the cell no organ occupies.
export const RESOURCE_BY_OP = Object.freeze({
  EVA: 'model', REC: 'model', DEF: 'model',
  SIG: 'fetch', CON: 'fetch',
  INS: 'tokens', SYN: 'tokens',
  SEG: 'time',
  NUL: 'storage',
});

// The default founding organs — the body the system ships with, each a real faculty pinned to
// a real cube cell. A soma at these founders reproduces today's behavior (inert until scarcity
// grows or prunes it). Kinds are labels; the cell (op × grain) is the identity of record.
export const FOUNDING_ORGANS = Object.freeze([
  Object.freeze({ kind: 'sense',  op: 'INS', grain: 'Figure', holon: 'soma.sense'  }),  // organs/in — instantiate entities from a source
  Object.freeze({ kind: 'forage', op: 'SIG', grain: 'Figure', holon: 'soma.forage' }),  // surfer/retrieve — attribute candidate entities
  Object.freeze({ kind: 'bind',   op: 'CON', grain: 'Figure', holon: 'soma.bind'   }),  // enactor/ground — the citation bond (the central operator)
  Object.freeze({ kind: 'judge',  op: 'EVA', grain: 'Figure', holon: 'soma.judge'  }),  // enactor/factcheck — evaluate a reading under a frame
  Object.freeze({ kind: 'render', op: 'NUL', grain: 'Ground', holon: 'soma.render' }),  // organs/out — lower a directive onto the void (output)
]);

const round = (x) => Math.round(x * 1000) / 1000;
const opId = (op) => (op && op.id) ? op.id : op;

// createOrgan — an organ from its claimed cell (op × grain), its substrate holon path, its
// local params (its own weights), and its origin (how it was grown — for the audit lineage).
// A composite organ (from fusion) claims MORE than one cell; pass `cells` for that case.
export const createOrgan = ({ kind = 'organ', op = 'NUL', grain = 'Figure', holon = null, params = null, origin = 'founder', bornAt = 0, cells = null } = {}) => {
  const path = holon || joinHolon('soma', kind);
  const id = holonId(path);

  // Resolve the cell(s) this organ claims. A single-cell organ crosses one operator with one
  // grain; a composite (fused) organ carries an explicit list.
  const claimed = cells && cells.length
    ? cells.map((c) => cellOf(c.op, c.grain)).filter(Boolean)
    : [cellOf(opId(op), grain)].filter(Boolean);

  const ops = [...new Set(claimed.map((c) => c.op))];
  const terrains = [...new Set(claimed.map((c) => c.terrain))];
  const stances = [...new Set(claimed.map((c) => c.stance))];

  // The organ's declared contract — the three fields, the genome format itself.
  const spec = contract({ ops, terrains, stances, note: `organ:${kind}` });

  const p = Object.freeze({ effort: 1, ...(params || {}) });

  // validate — THE ISOLATION CHECKPOINT. Passes iff every claimed cell is well-formed on the
  // cube AND none fabricates from the Void (the desert cell), and the merged contract is valid.
  // An organ that fails here never wires into a body. Pure; returns the worklist, never throws.
  const validate = () => {
    const reasons = [];
    if (!claimed.length) reasons.push('no-cell: the organ claims no cube coordinate');
    for (const c of claimed) {
      const w = wellFormedOrgan({ op: c.op, stance: c.stance, terrain: c.terrain });
      if (!w.ok) reasons.push(w.reason);
    }
    if (!spec.valid) reasons.push(...spec.errors);
    return Object.freeze({ ok: reasons.length === 0, reasons: Object.freeze(reasons) });
  };

  // upkeep — the energy this organ costs the metabolism per turn. The sum of its cells' op
  // tiers, scaled by its effort param. A composite's cells sum, but see fuseWith for the
  // symbiotic discount that makes fusion a thrift move rather than a doubling.
  const upkeep = () => round(claimed.reduce((s, c) => s + (UPKEEP_BY_OP[c.op] ?? 1), 0) * (p.effort ?? 1));

  // serves — the resources this organ relieves (one per claimed cell's operator). The soma
  // reads this to know whether a strained resource already has an organ, or needs one grown.
  const serves = () => Object.freeze([...new Set(claimed.map((c) => RESOURCE_BY_OP[c.op]).filter(Boolean))]);

  // cellKeys — the canonical cube keys this organ occupies (for desert/occupancy accounting).
  const cellKeys = () => Object.freeze(claimed.map((c) => c.key));

  const self = {
    id, kind, path, origin, bornAt,
    op: ops[0], grain,
    cells: Object.freeze(claimed),
    contract: spec,
    params: p,
    validate, upkeep, serves, cellKeys,
    depth: () => parseHolon(path).depth,
    notation: () => `${kind}@${path} :: ${notateContract(spec)} · upkeep=${upkeep()}`,
    genotype: () => Object.freeze({ kind, cells: claimed.map((c) => ({ op: c.op, grain: c.grain })), holon: path, params: { ...p }, origin: typeof origin === 'string' ? origin : { ...origin } }),
  };

  // divergeToward — SYN duplication + divergence: the primary, gentle route to a new organ.
  // A copy of THIS organ on a NEW substrate (a child of its holon — growing the organ grows
  // its holon), whose contract drifts to a target cell (op × grain) no current organ claims.
  // The original still runs while the copy explores — safe for the same reason biological gene
  // duplication is safe. `at` names the target cell; the caller (soma) picks it from the desert.
  self.divergeToward = ({ op: tOp, grain: tGrain, kind: tKind, bornAt: at = bornAt } = {}) => createOrgan({
    kind: tKind || `${kind}'`,
    op: tOp ?? self.op,
    grain: tGrain ?? grain,
    holon: joinHolon(path, tKind || `${(tOp ?? self.op).toString().toLowerCase()}${tGrain ? tGrain[0].toLowerCase() : ''}`),
    params: { ...p },
    origin: { route: 'SYN', duplicatedFrom: id, fromKind: kind, at },
    bornAt: at,
  });

  // spliceWith — CON recombination: splice this organ's read-half (its target terrain) to
  // another's write-half (its product terrain), producing a CON organ that bonds the two. This
  // is the recombination route, and it needs exactly the weak linkage the holon contract
  // guarantees — the two organs stay whole; the splice is a new bond BETWEEN them, at CON·Figure.
  self.spliceWith = (other, { grain: g = 'Figure', bornAt: at = bornAt } = {}) => createOrgan({
    kind: `${kind}×${other.kind}`,
    op: 'CON', grain: g,
    holon: joinHolon('soma', `splice.${kind}.${other.kind}`),
    params: { ...p, ...(other.params || {}) },
    origin: { route: 'CON', spliced: [id, other.id], fromKinds: [kind, other.kind], at },
    bornAt: at,
  });

  // fuseWith — symbiosis: two whole organs fuse into one composite that thereafter is selected
  // and inherited as a UNIT — a mitochondrion kept rather than beaten. The composite claims BOTH
  // cells, but its upkeep carries a discount (the shared membrane costs less than two separate
  // organs), so fusion is a THRIFT move: keep both capabilities, pay less than their sum. That is
  // why a lean season can fuse instead of prune — losing cost without losing a sense.
  self.fuseWith = (other, { discount = 0.3, bornAt: at = bornAt } = {}) => {
    const cellsSpec = [...claimed.map((c) => ({ op: c.op, grain: c.grain })), ...other.cells.map((c) => ({ op: c.op, grain: c.grain }))];
    const sumTiers = cellsSpec.reduce((s, c) => s + (UPKEEP_BY_OP[c.op] ?? 1), 0);
    // the symbiotic thrift: the host pays full freight for the costlier capability and the
    // fused-in symbiont rides at a discount — always below the sum of running the two apart, so
    // fusion keeps both senses for less. `effort` is set so upkeep() lands on that target.
    const hi = Math.max(upkeep(), other.upkeep());
    const lo = Math.min(upkeep(), other.upkeep());
    const target = round(hi + lo * (1 - discount));
    const effort = sumTiers > 0 ? round(target / sumTiers) : 1;
    return createOrgan({
      kind: `${kind}+${other.kind}`,
      cells: cellsSpec,
      holon: joinHolon('soma', `symbiont.${kind}.${other.kind}`),
      params: { ...p, ...(other.params || {}), effort },
      origin: { route: 'fuse', fused: [id, other.id], fromKinds: [kind, other.kind], at },
      bornAt: at,
    });
  };

  return Object.freeze(self);
};

// organFromSpec — rebuild an organ from a genotype record (for heritability / reconstruction).
export const organFromSpec = (g = {}) => createOrgan({
  kind: g.kind, holon: g.holon, params: g.params, origin: g.origin, bornAt: g.bornAt,
  cells: g.cells && g.cells.length ? g.cells : null,
  op: g.cells && g.cells[0] ? g.cells[0].op : g.op,
  grain: g.cells && g.cells[0] ? g.cells[0].grain : g.grain,
});

// foundingOrgans — the ship-with body: the founders instantiated as organs. A soma at these
// reproduces today's behavior; scarcity is what grows or sheds anything beyond them.
export const foundingOrgans = (bornAt = 0) =>
  FOUNDING_ORGANS.map((o) => createOrgan({ ...o, origin: 'founder', bornAt }));
