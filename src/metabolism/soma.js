// EO: SYN·INS·SEG·CON(Network,Void → Network,Entity,Link, Composing·Making·Dissecting·Binding) — the body plan
// metabolism/soma.js — the heritable BODY, complementing genome.js (the heritable WEIGHTS).
//
// Weight-tuning is selection on a FIXED body plan: you get the best-adjusted version of the
// organism you already drew, and never a new organ. That is the clerk's ceiling — a surfer
// that can only re-weight its existing faculties becomes the ideal reader of the reading it
// already knows how to do, and cannot grow the sense it does not yet have. The leap is
// unreachable partly because the organ that would make it does not exist to be tuned. So this
// module makes the body itself vary: REC, pointed one level up, at the SET of organs.
//
// ORGANOGENESIS — REC on the organ set, in the three flavors evolution actually uses for
// novelty, each named by an operator the system already has:
//   SYN duplication + divergence — fork an organ; one copy keeps the old contract, the other
//     drifts its contract toward an unclaimed cell (the desert). How real new organs almost
//     always arrive: a redundant copy of an old one drifting into new work, safe because the
//     original still runs while the copy explores. The DEFAULT, gentlest route.
//   CON recombination — splice one organ's read-half to another's write-half, a new bond
//     between two whole organs. Needs exactly the weak linkage the holon contract guarantees.
//   fuse symbiosis — two whole organs fuse into one composite, thereafter selected and
//     inherited as a UNIT: a mitochondrion kept rather than beaten. A THRIFT move — keep both
//     senses for less than running them apart — so a lean season can fuse instead of prune.
//
// THE DEVELOPMENTAL DISCIPLINE (why this is morphogenesis and not cancer). A new organ is not
// admitted by fiat. It must pass its OWN checkpoint, alone, against its declared contract
// (organ.validate — isolation), THEN the whole body must re-close its envelope with the new
// part inside (`close` — body closure), THEN the constitution must admit the mutation's target
// (only `organs` is open; `fitness`, the guard, the log are frozen). An organ that cannot
// validate never runs; an organ that validates but breaks the body's closure is rejected with
// everything else still standing. Blind structural proliferation is how you get a tumor; the
// coherence guard is the constraint that lets a body grow new parts without the growth killing it.
//
// THE NEUTRAL RESERVOIR (why a perfectly efficient body cannot evolve). Scarcity prunes the
// organ that does not earn its upkeep — but if thrift is allowed to prune EVERYTHING that does
// not pay today, it burns the raw material of the next transition before it gets its chance: an
// organ useless under this season may be the only one that pays under a regime not yet seen. So
// a reservoir of the most structurally-NOVEL organs is protected from the cull. Standing
// variation, deterministic (novelty-ranked, not random) — the slack novelty grows from.
//
// THE HIDDEN HORIZON, kept. Pruning is decided from resource STRAIN and upkeep, never from any
// countdown; the soma exposes no "turns remaining" and computes no "I will be pruned next". A
// body that could see its own death would spend its last strength defecting (horizon.js).

import { createOrgan, organFromSpec, foundingOrgans, FOUNDING_ORGANS, RESOURCE_BY_OP, UPKEEP_BY_OP } from './organ.js';
import { DIAGONAL_CELLS } from '../core/cube.js';
import { CONSTITUTION } from './constitution.js';

const round = (x) => Math.round(x * 1000) / 1000;

// The population gradient, found in the wild and in this tree alike: Figure over Pattern over
// Ground. Figure is where language is rich and a designer can name what he builds, so the
// hand-built holons cluster there and the Ground row and Pattern column stay a desert. Evolution
// does not respect that bias: under frequency-dependent fitness an empty niche is worth taking
// precisely because it is empty, so selection pushes organs DOWN into the sparse cells the
// designer avoided — the terrains language barely names. So the desert is ordered sparsest-first
// (Ground, then Pattern, then Figure): growth drifts into the thin terrains, and the new species
// are the ones we could not build because we had no words for the work they do.
const GRAIN_SPARSITY = Object.freeze({ Ground: 0, Pattern: 1, Figure: 2 });

// The desert of the cube: every diagonal cell that is well-formed and NOT the forbidden one
// (SYN·Cultivating). Minus what the body claims, it is the unexpressed phenotype the growth
// grows into. Ordered sparsest-first so drift fills the empty Ground/Pattern niches first.
const PERMITTED_CELLS = Object.freeze(
  Object.values(DIAGONAL_CELLS)
    .filter((c) => CONSTITUTION.wellFormedOrgan({ op: c.op, stance: c.stance, terrain: c.terrain }).ok)
    .sort((a, b) => (GRAIN_SPARSITY[a.grain] - GRAIN_SPARSITY[b.grain]) || (a.key < b.key ? -1 : 1)),
);

// ARCHETYPES — the species that grow where language is thin, named so the lineage and the
// surface can SEE what emerged. Each is a cell (or family) the designer never filled, and the
// organism that occupies it is a kind we could not specify, only grow. The Void-keeper is the
// one the whole arc is about: it lives at the intersection of the two things now made permanent
// — the constitutional Ground that cannot be tuned away, and the log that pays on a lag.
const ARCHETYPES = Object.freeze({
  NUL_Clearing_Void:      'void-keeper',    // NUL at Ground: hold the unbound thread cheaply, wait for the world to bind it — the investigator made heritable
  INS_Cultivating_Void:   'habitat-builder',// INS at Ground: instantiate ambient conditions — leave the ground better than found (niche construction)
  REC_Cultivating_Atmosphere: 'legislator', // REC at Ground: learn a rule at the ambient — propose REC on the rules themselves
  EVA_Tracing_Paradigm:   'monitor',        // EVA at Pattern: evaluate the frame-of-frames — a genome that reads readers
  SEG_Unraveling_Network: 'enforcer',       // SEG at Pattern: deconstruct a regularity — the graduated sanction, a judiciary
  CON_Tracing_Network:    'federation',     // CON at Pattern: bond a whole network — the deme become a unit of selection, the superorganism
  SYN_Composing_Network:  'weave',          // SYN at Pattern: compose a regularity — build shared structure
  DEF_Unraveling_Kind:    'historian',      // DEF at Pattern: re-assert a kind — retroactive re-reading of the log
});
const archetypeOf = (cellKey) => ARCHETYPES[cellKey] || null;

const FOUNDING_OPS = Object.freeze(new Set(FOUNDING_ORGANS.map((o) => o.op)));
// resource → the operators that serve it (the inverse of organ.RESOURCE_BY_OP), in helix order
// so the choice of which missing sense to grow is deterministic.
const OPS_FOR_RESOURCE = (() => {
  const m = {};
  for (const [op, res] of Object.entries(RESOURCE_BY_OP)) (m[res] ||= []).push(op);
  return Object.freeze(m);
})();

// createSoma — the body plan. `organs` may be organ objects or genotype specs (heritability).
export const createSoma = ({
  organs = null,
  maxOrgans = 12,          // carrying capacity for STRUCTURE — the body cannot grow past it
  reservoir = 2,           // grown organs protected from the cull for their novelty (standing variation)
  constitution = CONSTITUTION,
  bornAt = 0,
} = {}) => {
  const list = (organs && organs.length)
    ? organs.map((o) => (typeof o.validate === 'function' ? o : organFromSpec(o)))
    : foundingOrgans(bornAt);

  const founders = () => list.filter((o) => o.origin === 'founder');
  const grown = () => list.filter((o) => o.origin !== 'founder');

  const occupancy = () => new Set(list.flatMap((o) => o.cellKeys()));
  const upkeep = () => round(list.reduce((s, o) => s + o.upkeep(), 0));
  const serves = () => new Set(list.flatMap((o) => o.serves()));

  // desert — the unclaimed permitted cells: everything the body could become and is not yet.
  const desert = () => { const occ = occupancy(); return PERMITTED_CELLS.filter((c) => !occ.has(c.key)); };

  // close — the BODY CHECKPOINT. Re-close the envelope with all organs inside: every organ
  // valid in isolation, no two claiming the same cell, count within carrying capacity. A body
  // that fails to close is rejected whole; the prior body still stands.
  const close = () => {
    const reasons = [];
    if (list.length > maxOrgans) reasons.push(`over-capacity: ${list.length} organs > maxOrgans ${maxOrgans}`);
    const seen = new Set();
    for (const o of list) {
      const v = o.validate();
      if (!v.ok) reasons.push(`${o.kind}: ${v.reasons.join('; ')}`);
      for (const k of o.cellKeys()) {
        if (seen.has(k)) reasons.push(`cell-collision: two organs claim ${k}`);
        seen.add(k);
      }
    }
    return Object.freeze({ ok: reasons.length === 0, reasons: Object.freeze(reasons) });
  };

  // pickTarget — WHICH desert cell to grow into, directed by strain (grow the sense you lack)
  // and otherwise a deterministic rotation over the desert (idle exploration). No RNG.
  const pickTarget = (strain, at) => {
    const d = desert();
    if (!d.length) return null;
    // THE LEAP: an UNSERVED resource grows the missing sense — the organ whose op would serve it.
    if (strain && strain.resource && !serves().has(strain.resource) && OPS_FOR_RESOURCE[strain.resource]) {
      const wants = OPS_FOR_RESOURCE[strain.resource];
      const hit = d.find((c) => wants.includes(c.op));
      if (hit) return hit;
    }
    // else drift into the sparsest EMPTY NICHE (the desert is Ground-first): a redundant organ in
    // a resource already served does not pay, but occupying a cell no one holds does — the niche is
    // worth taking because it is empty. This is what pushes the body into the Ground/Pattern rows.
    return d[Math.abs(at | 0) % d.length];
  };

  // pickSource — WHICH organ parents the new one (for SYN divergence): prefer an organ already
  // serving the target's resource (specialize a lineage), else the most-invested organ. No RNG.
  const pickSource = (targetCell) => {
    const res = RESOURCE_BY_OP[targetCell.op];
    const bySameResource = list.filter((o) => o.serves().includes(res));
    const pool = bySameResource.length ? bySameResource : list.slice();
    return pool.slice().sort((a, b) => (b.upkeep() - a.upkeep()) || (a.id < b.id ? -1 : 1))[0] || list[0];
  };

  const withOrgans = (next) => createSoma({ organs: next, maxOrgans, reservoir, constitution, bornAt });
  const refusal = (reason, extra = {}) => Object.freeze({ soma: self, refused: true, mutation: Object.freeze({ op: 'NUL', kind: 'refused', reason, ...extra, note: `refused: ${reason}` }) });

  // admit — the three-gate developmental checkpoint for a proposed next body: the new organ in
  // isolation, the constitution's target guard, then the whole body's re-closure. Any gate that
  // fails REFUSES the growth and leaves the body unchanged.
  const admit = (newOrgan, nextList, mutation) => {
    const iso = newOrgan.validate();
    if (!iso.ok) return refusal(`organ failed its checkpoint — ${iso.reasons.join('; ')}`, mutation);
    const adm = constitution.admits('organs');
    if (!adm.ok) return refusal(adm.reason, mutation);
    const next = withOrgans(nextList);
    const cl = next.close();
    if (!cl.ok) return refusal(`body would not re-close — ${cl.reasons.join('; ')}`, mutation);
    return Object.freeze({ soma: next, refused: false, mutation: Object.freeze({ ...mutation, note: mutation.note || `${mutation.kind} ${newOrgan.kind}` }) });
  };

  // grow — organogenesis. Route defaults to SYN (duplication + divergence). Returns
  // { soma, mutation } on success, or { soma:this, refused:true, mutation } if any checkpoint
  // refuses it. Directed by strain, replay-stable (no RNG).
  const grow = ({ strain = null, route = 'SYN', at = bornAt, target = null } = {}) => {
    if (list.length >= maxOrgans) return refusal(`at carrying capacity (${maxOrgans} organs)`);

    if (route === 'fuse') return fuse({ at });

    const targetCell = target || pickTarget(strain, at);
    if (!targetCell) return refusal('no desert left — the body claims every cell it may');

    if (route === 'CON') {
      // recombination: bond two whole organs with a new CON organ landing on an UNCLAIMED CON cell
      // in the desert (CON at a grain no current organ occupies — the founding `bind` already holds
      // CON·Figure, so the splice takes CON·Ground or CON·Pattern). Needs two organs to splice.
      if (list.length < 2) return refusal('recombination needs two organs to splice');
      const conCell = desert().find((c) => c.op === 'CON');
      if (!conCell) return refusal('no unclaimed CON cell to land a recombination on');
      const a = pickSource(conCell);
      const b = list.find((o) => o.id !== a.id) || a;
      const child = a.spliceWith(b, { grain: conCell.grain, bornAt: at });
      return admit(child, [...list, child], { op: 'CON', kind: 'grow', route: 'CON', organ: child.kind, cell: conCell.key, from: [a.kind, b.kind], note: `recombine ${a.kind}×${b.kind} → ${child.kind} @ ${conCell.key}` });
    }

    // SYN — the default: duplicate a source and diverge the copy toward the target cell. When
    // the target is an archetype cell (a sparse niche language never named), the child takes the
    // species name, so the lineage reads "grew a void-keeper", not an opaque coordinate.
    const source = pickSource(targetCell);
    const species = archetypeOf(targetCell.key);
    const kind = species || `${source.kind}→${targetCell.op.toLowerCase()}${targetCell.grain[0].toLowerCase()}`;
    const child = source.divergeToward({ op: targetCell.op, grain: targetCell.grain, kind, at });
    return admit(child, [...list, child], { op: 'SYN', kind: 'grow', route: 'SYN', organ: child.kind, species, cell: targetCell.key, from: source.kind, serves: RESOURCE_BY_OP[targetCell.op], note: `duplicate ${source.kind} → ${kind} @ ${targetCell.key}${species ? ` (${species})` : ''}` });
  };

  // fuse — symbiosis as a thrift move: fuse the two grown organs whose combined upkeep is
  // highest into one composite that keeps both cells for less. Reduces organ count by one while
  // preserving capability — a lean season's alternative to pruning a sense away.
  const fuse = ({ at = bornAt } = {}) => {
    const g = grown();
    if (g.length < 2) return refusal('symbiosis needs two grown organs to fuse');
    const pair = g.slice().sort((a, b) => (b.upkeep() - a.upkeep()) || (a.id < b.id ? -1 : 1)).slice(0, 2);
    const [a, b] = pair;
    const child = a.fuseWith(b, { bornAt: at });
    const nextList = [...list.filter((o) => o.id !== a.id && o.id !== b.id), child];
    return admit(child, nextList, { op: 'CON', kind: 'fuse', route: 'fuse', organ: child.kind, from: [a.kind, b.kind], saved: round(a.upkeep() + b.upkeep() - child.upkeep()), note: `fuse ${a.kind}+${b.kind} → ${child.kind} (save ${round(a.upkeep() + b.upkeep() - child.upkeep())})` });
  };

  // novelty — how much standing variation an organ represents: a genuinely new capability (an op
  // the founding body lacked) is most novel; being the sole server of its resource adds; recency
  // breaks ties. The reservoir protects the highest-novelty grown organs from the cull.
  const noveltyOf = (o) => {
    let n = 0;
    if (!FOUNDING_OPS.has(o.op)) n += 2;                                    // a sense the founders lacked
    for (const r of o.serves()) if (list.filter((x) => x.serves().includes(r)).length === 1) n += 1;  // sole server
    return n + (o.bornAt || 0) * 1e-6;                                      // recency tiebreak
  };

  // prune — reabsorb the grown organ that least earns its keep, EXCEPT the reservoir-protected
  // novelty. Founders are never pruned (the ship-with minimum is the body's floor). Directed by
  // strain (prefer shedding a costly organ that does NOT serve the strained resource — dead
  // weight under the current pressure); NEVER by a death-countdown (the hidden horizon). No RNG.
  const prune = ({ strain = null } = {}) => {
    const g = grown();
    if (!g.length) return refusal('nothing to prune — the body is at its founding minimum');
    const protectedSet = new Set(
      g.slice().sort((a, b) => (noveltyOf(b) - noveltyOf(a)) || (a.id < b.id ? -1 : 1)).slice(0, reservoir).map((o) => o.id),
    );
    const prunable = g.filter((o) => !protectedSet.has(o.id));
    if (!prunable.length) return refusal('all grown organs are reservoir-protected novelty — thrift may not eat the seed corn');
    const res = strain && strain.resource;
    const victim = prunable.slice().sort((a, b) => {
      const aServes = res && a.serves().includes(res) ? 1 : 0;   // an organ serving the strained
      const bServes = res && b.serves().includes(res) ? 1 : 0;   // resource is spared first
      return (aServes - bServes) || (b.upkeep() - a.upkeep()) || (a.id < b.id ? -1 : 1);
    })[0];
    const nextList = list.filter((o) => o.id !== victim.id);
    return Object.freeze({
      soma: withOrgans(nextList), refused: false,
      mutation: Object.freeze({ op: 'SEG', kind: 'prune', organ: victim.kind, cell: victim.cellKeys()[0], upkeep: victim.upkeep(), note: `prune ${victim.kind} (upkeep ${victim.upkeep()}) — a limb the season cannot afford` }),
    });
  };

  // revert — the path-dependence escape for STRUCTURE: shed the most-recently-grown organ back
  // toward the founding body, so no accreted organ is permanent. Complements weight-revert.
  const revert = () => {
    const g = grown();
    if (!g.length) return refusal('already at the founding body');
    const victim = g.slice().sort((a, b) => (b.bornAt || 0) - (a.bornAt || 0) || (a.id < b.id ? 1 : -1))[0];
    const nextList = list.filter((o) => o.id !== victim.id);
    return Object.freeze({ soma: withOrgans(nextList), refused: false, mutation: Object.freeze({ op: 'SEG', kind: 'revert', organ: victim.kind, note: `revert ${victim.kind} toward the founding body` }) });
  };

  // distanceTo — structural distance to another body: Jaccard on the cells claimed, plus the
  // normalized difference in organ count. In [0,1]; identical bodies → 0. The population's
  // neutral reservoir uses this (via the organism) to protect the structurally most-distant.
  const distanceTo = (other) => {
    const A = occupancy();
    const B = other && typeof other.occupancy === 'function' ? other.occupancy() : new Set(other?.cells || []);
    const union = new Set([...A, ...B]);
    const inter = [...A].filter((k) => B.has(k)).length;
    const jac = union.size ? 1 - inter / union.size : 0;
    const cnt = Math.abs(A.size - B.size) / Math.max(1, maxOrgans);
    return round(0.6 * jac + 0.4 * cnt);
  };

  const signature = () => list.map((o) => o.cellKeys().join('|')).sort().join('/') + `#${list.length}`;

  const self = {
    organs: () => list.slice(),
    count: () => list.length,
    foundingCount: () => founders().length,
    grownCount: () => grown().length,
    upkeep, serves, occupancy, desert, close,
    grow, prune, fuse, revert, distanceTo, signature,
    maxOrgans, reservoir,
    // express — the phenotype the metabolism charges and the surface renders.
    express: () => Object.freeze({
      organs: list.map((o) => Object.freeze({ kind: o.kind, cell: o.cellKeys()[0], cells: o.cellKeys(), upkeep: o.upkeep(), serves: o.serves(), origin: o.origin, path: o.path })),
      count: list.length, upkeep: upkeep(), serves: [...serves()], desert: desert().length,
      // niche — organs occupying the sparse Ground/Pattern rows (the terrains language never named).
      // The metabolism rewards this: taking an empty niche pays where a redundant Figure organ does not.
      niche: list.filter((o) => o.cells.some((c) => c.grain === 'Ground' || c.grain === 'Pattern')).length,
    }),
    genotype: () => Object.freeze({ organs: list.map((o) => o.genotype()), maxOrgans, reservoir }),
    notation: () => `body[${list.length}]: ${list.map((o) => o.kind).join('+')} · upkeep=${upkeep()} · desert=${desert().length}`,
  };
  return Object.freeze(self);
};

// foundingSoma — the ship-with body (inert until scarcity grows or prunes it).
export const foundingSoma = (opts = {}) => createSoma(opts);

export { PERMITTED_CELLS };
