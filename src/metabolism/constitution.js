// EO: DEF·EVA·NUL(Paradigm,Atmosphere → Paradigm, Dissecting·Binding·Clearing) — the freeze boundary
// metabolism/constitution.js — the floor evolution stands on and cannot reach.
//
// Organ-level evolution widens what can vary from a fixed body plan's DIAL SETTINGS
// (genome.js — weight-tuning) to the BODY PLAN ITSELF (soma.js — grow/prune organs).
// That is a far larger and far more dangerous freedom, and the single most important
// design decision it forces is not what to open but where the floor sits: the line
// between a system that can grow and one that can dissolve itself. This module draws
// that line, explicitly, as a closed and enumerated set — because the line is a
// judgement imposed on the code, not a property the code carries, and a population
// under selection is a machine for finding the rule you filed on the wrong side.
//
// FOUR BANDS, deepest first (the layered answer to "how deep is up for evolution?"):
//
//   core          the ALPHABET. The nine operators, the three faces, the cube geometry,
//                 the coherence function, the append-only log, the three-field contract.
//                 The space of possible moves — evolution happens INSIDE it, never TO it.
//                 A system does not evolve its own alphabet; the fixed alphabet is the
//                 condition of the open vocabulary. FROZEN forever.
//   constitution  the RULES OF THE GAME. The fitness function (the definition of the
//                 good), the coherence guard AS the guard, the proposer/disposer firewall
//                 (the judge selects, never writes a weight), the append-only property,
//                 the checkpoint-before-wiring, the hidden-horizon rule. The tell that a
//                 rule belongs here: a self-interested population would weaken it. FROZEN
//                 — revisable only from OUTSIDE the population (the human holds the pen).
//   operational   the GOVERNANCE. Sanction schedule, regeneration rate, migration policy
//                 (Ostrom's third principle — the governed may modify the operating rules).
//                 OPEN.
//   body          the ORGANS, substrate, weights, wiring, routing, fold widths, the region
//                 of the cube each organ claims (widened only by logged REC, re-passing its
//                 checkpoint). Where the clerk's fixed-body-plan ceiling gets broken. OPEN.
//
// THE GROUND THAT CANNOT BE TUNED AWAY. Beneath even the constitution sits one law that is
// not a rule of THIS game but a law of the SPACE every game is played inside: you may DWELL
// in the Void (hold a true-but-unbindable apprehension — NUL at Ground, encounter without
// changing) but you may NOT FABRICATE from it (synthesize a whole from nothing — SYN at
// Ground, the desert cell, the one verb no language has). Confabulation is a false Figure, a
// binding with no source; Void-respect is the held thread kept open until the world hands
// over the binding. The difference is the whole difference between the clerk and the
// investigator — and it cannot be a fitness term, because a good that can be optimized will
// be optimized away: the clerk that fills the Void scores today, the creature that holds it
// open scores in three weeks or never, so any tunable Void-respect erodes on schedule. So it
// is not a preference weighted in the genome. It is a law of the space, enforced by the
// coherence guard (core/cube.js), which validates every organ and is validated by none. You
// cannot evolve past it any more than a reading can evolve past coherence. Above it, let
// everything evolve. It cannot, because it is the ground it stands on.
//
// FROZEN BY DEFAULT. The safe default for an evolving system is that nothing is editable
// unless it is on the open allowlist and proven un-exploitable. `admits` refuses any target
// not explicitly opened — so a locus nobody classified is frozen, not free.

import { DESERT_CELL } from '../core/contract.js';
import { coherence, stanceOf } from '../core/cube.js';
import { OPERATORS, isOperator } from '../core/operators.js';

export const BANDS = Object.freeze({ CORE: 'core', CONSTITUTION: 'constitution', OPERATIONAL: 'operational', BODY: 'body' });

// The frozen loci, each tagged with the band that freezes it and WHY it is frozen —
// for core, because it is the alphabet; for the constitution, because a self-interested
// population would weaken it (the cheater test). This is the enumerated, defended list.
export const FROZEN = Object.freeze({
  // core — the alphabet evolution is written in
  operators:     Object.freeze({ band: 'core', why: 'the nine operators are the space of moves, not a move' }),
  faces:         Object.freeze({ band: 'core', why: 'Act/Site/Stance are the coordinates every contract is written in' }),
  cube:          Object.freeze({ band: 'core', why: 'the 27 diagonal cells are the geometry, not a parameter' }),
  coherence:     Object.freeze({ band: 'core', why: 'the coherence guard decides well-formedness; it validates all, is validated by none' }),
  voidLaw:       Object.freeze({ band: 'core', why: 'dwell in the Void, never fabricate from it — the desert cell is a law of the space, uncompetable' }),
  log:           Object.freeze({ band: 'core', why: 'the append-only log is the source of truth; editing it abolishes anti-gaslighting' }),
  contractShape: Object.freeze({ band: 'core', why: 'a contract is exactly three fields — the genome format itself' }),
  // constitution — the rules a cheater would weaken (the human holds the pen)
  fitness:       Object.freeze({ band: 'constitution', why: 'the definition of the good; a population that edits its fitness optimizes toward whatever it already is' }),
  guard:         Object.freeze({ band: 'constitution', why: 'let the population edit the guard and it legalizes its own incoherence — a tumor calling itself an organ' }),
  firewall:      Object.freeze({ band: 'constitution', why: 'proposer/disposer — the judge selects and never writes a weight; break it and the causal claim collapses' }),
  appendOnly:    Object.freeze({ band: 'constitution', why: 'make the log editable and the whole anti-gaslighting property is gone in one turn' }),
  checkpoint:    Object.freeze({ band: 'constitution', why: 'every organ passes its own checkpoint before it is wired — the difference between morphogenesis and cancer' }),
  hiddenHorizon: Object.freeze({ band: 'constitution', why: 'no genome may compute its own final turn; a creature that sees its death defects on the way out' }),
});

// The open loci — the CLOSED, DECLARED allowlist of what evolution may touch. Everything
// NOT named here is frozen by default. Body is wide open; the operational (governance) band
// is open because the population revising how it governs itself is the point of that layer.
export const OPEN = Object.freeze({
  // body — where the fixed-body-plan ceiling breaks
  organs:         Object.freeze({ band: 'body', why: 'the set of organs — grow one, prune one; the body plan is under selection' }),
  substrate:      Object.freeze({ band: 'body', why: 'the holon substrate an organ attaches to — grown with the organ it holds' }),
  weights:        Object.freeze({ band: 'body', why: 'each organ\'s internal allocation parameters — the dial settings' }),
  wiring:         Object.freeze({ band: 'body', why: 'how organs connect (CON at the body level) — the flow' }),
  contractRegion: Object.freeze({ band: 'body', why: 'the region of the cube an organ claims — widened only by logged REC, re-passing its checkpoint' }),
  routing:        Object.freeze({ band: 'body', why: 'routing thresholds and fold widths — the leash within the organ' }),
  // operational — governance (Ostrom principle 3)
  governance:     Object.freeze({ band: 'operational', why: 'sanction schedule, regeneration rate, migration policy between demes' }),
});

// classify — which band a locus sits in. Unknown loci resolve to `null` (frozen by default),
// which `admits` treats as refusal: the safe default is that nothing constitutional is
// editable unless it has been proven not exploitable and placed on the open list.
export const classify = (locus) => {
  if (OPEN[locus]) return OPEN[locus].band;
  if (FROZEN[locus]) return FROZEN[locus].band;
  return null;
};

// admits — the guard checked at EVERY proposed mutation (every REC on a weight, every INS
// that grows an organ, every SEG that prunes one). A mutation names the `target` locus it
// would touch; it is admitted iff that locus is on the open allowlist. A target on a frozen
// locus — or an unclassified one — is REFUSED, and the refusal is a first-class, logged
// outcome, never a silent drop. This is the boundary made mechanical rather than intended.
export const admits = (target) => {
  const band = classify(target);
  if (band === BANDS.BODY || band === BANDS.OPERATIONAL) {
    return Object.freeze({ ok: true, target, band, reason: OPEN[target].why });
  }
  if (band === BANDS.CORE || band === BANDS.CONSTITUTION) {
    return Object.freeze({ ok: false, target, band, reason: `frozen (${band}): ${FROZEN[target].why}` });
  }
  return Object.freeze({ ok: false, target, band: null, reason: `frozen by default: no open locus named '${target}'` });
};

// permitsCell — the Void law made mechanical against a proposed organ cell (op, stance). An
// organ that would FABRICATE a whole from the Void — SYN resolving at Ground (the desert cell,
// SYN·Cultivating) — is forbidden outright, the one hard prohibition. Every other cell is
// permitted here and defeased elsewhere; only this one is refused, because it is the move that
// manufactures a binding from nothing. Dwelling in the Void (NUL at Ground) is explicitly fine.
export const permitsCell = ({ op, stance } = {}) => {
  if (!isOperator(op)) return Object.freeze({ ok: false, reason: `unknown-operator: ${op}` });
  const st = stance ?? (OPERATORS[op] ? stanceOf(OPERATORS[op].mode, 'Ground') : null);
  const fabricatesFromVoid = op === DESERT_CELL.op && st === DESERT_CELL.stance;
  if (fabricatesFromVoid) {
    return Object.freeze({ ok: false, reason: `void-law: ${DESERT_CELL.op} at Ground (${DESERT_CELL.op}·${DESERT_CELL.stance}) fabricates a whole from the Void — the one forbidden move` });
  }
  return Object.freeze({ ok: true, reason: null });
};

// The Void law, restated as a coherence check for any (op, stance, terrain) triple an organ
// declares: it must be a well-formed cell on the cube AND not the desert cell. Delegates the
// well-formedness to core (the guard that is validated by none), so respecting the Void is
// not a preference this module weights — it is enforcement this module merely NAMES.
export const wellFormedOrgan = (cell) => {
  const c = coherence(cell);
  if (!c.ok) return Object.freeze({ ok: false, reason: `incoherent-cell: ${c.reason}` });
  return permitsCell(cell);
};

export const frozenLoci = () => Object.freeze(Object.keys(FROZEN));
export const openLoci = () => Object.freeze(Object.keys(OPEN));

// A one-line reading of the boundary, for the surface and the audit trail: what is open to
// evolution and what is held immortal beneath it.
export const notation = () =>
  `open{${openLoci().join(',')}} · frozen{${frozenLoci().join(',')}} · ground: dwell-in-Void, never-fabricate-from-it`;

// THE CONSTITUTION — the frozen object itself, the thing that validates every genome and is
// validated by none. It carries no `vary`, no setter, no path by which anything it governs
// can reach it. The population plays ON it and cannot play WITH it.
export const CONSTITUTION = Object.freeze({
  bands: BANDS,
  frozen: FROZEN,
  open: OPEN,
  admits,
  classify,
  permitsCell,
  wellFormedOrgan,
  frozenLoci,
  openLoci,
  notation,
});
