import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createMetabolism, createScarcity, createGenome, score, energyOf,
  CONSTITUTION, admits, permitsCell,
  createOrgan, foundingOrgans,
  createSoma, PERMITTED_CELLS,
  createOrganism, hasSoma, createPopulation,
} from '../src/metabolism/index.js';

// Organ-level evolution (metabolism/constitution.js, organ.js, soma.js, organism.js). Weight-
// tuning is selection on a FIXED body plan — the clerk's ceiling. These tests pin the escape:
// evolution that grows the BODY (organs + their holon substrate), guarded by a floor it cannot
// reach, paid for by scarcity, and rewarded — for the held thread that later binds — in a way
// the false vigil cannot fake. Each test is a named falsifier: it fails if its mechanism is
// decorative. Nothing here is good by construction; it is measured.

test('constitution: four bands, frozen-by-default, and the one ground law that cannot be tuned away', () => {
  // the body and governance are OPEN — evolution may touch them.
  assert.equal(admits('organs').ok, true, 'the set of organs is open — the body plan is under selection');
  assert.equal(admits('weights').ok, true, 'each organ\'s dials are open');
  assert.equal(admits('governance').band, 'operational', 'governance is the open operational band (Ostrom 3)');
  // the definition of the good, the guard, the firewall, the log, the alphabet — all FROZEN.
  for (const frozen of ['fitness', 'guard', 'firewall', 'appendOnly', 'checkpoint', 'hiddenHorizon', 'operators', 'coherence', 'voidLaw']) {
    assert.equal(admits(frozen).ok, false, `${frozen} must be frozen — a self-interested population would weaken it`);
  }
  // frozen BY DEFAULT: a locus nobody opened is refused, not free.
  assert.equal(admits('some_unclassified_knob').ok, false, 'the safe default is frozen — nothing is editable unless explicitly opened');
  // THE GROUND LAW: you may DWELL in the Void (hold), you may NOT FABRICATE from it (the desert cell).
  assert.equal(permitsCell({ op: 'SYN', stance: 'Cultivating' }).ok, false, 'SYN·Cultivating — fabricating a whole from the Void — is the one forbidden move');
  assert.equal(permitsCell({ op: 'NUL', stance: 'Clearing' }).ok, true, 'NUL at Ground — dwelling in the Void, holding a thread — is permitted');
});

test('organ: an organ is a contract that must pass its own checkpoint, alone, before it can wire', () => {
  const founders = foundingOrgans();
  assert.ok(founders.length >= 4 && founders.every((o) => o.validate().ok), 'the founding organs each validate in isolation');
  // the tumor guard: an organ that fabricates a whole from the Void never validates → never runs.
  const fabricator = createOrgan({ kind: 'fabricator', op: 'SYN', grain: 'Ground', holon: 'soma.bad' });
  assert.equal(fabricator.validate().ok, false, 'an organ claiming the desert cell fails its checkpoint — morphogenesis, not cancer');
  // dwelling in the Void is fine: NUL at Ground holds the unbound thread.
  assert.equal(createOrgan({ kind: 'void-keeper', op: 'NUL', grain: 'Ground', holon: 'soma.hold' }).validate().ok, true);
  // upkeep tiers: the reasoning organ (REC) costs the metabolism far more than the mechanical hold (NUL).
  const rec = createOrgan({ op: 'REC', grain: 'Figure' }), nul = createOrgan({ op: 'NUL', grain: 'Ground' });
  assert.ok(rec.upkeep() > nul.upkeep() * 4, 'the model-ish reasoning organ is the expensive one; the hold is near-free');
});

test('soma: organogenesis grows into the SPARSE desert (Ground/Pattern), each grow re-closing the body', () => {
  const s = createSoma();
  assert.equal(s.close().ok, true, 'the founding body closes');
  assert.equal(PERMITTED_CELLS.length, 26, 'the space is the 27 diagonal cells minus the one forbidden (SYN·Cultivating)');
  // growth drifts into the thin terrains the designer avoided — the desert is ordered sparsest-first.
  assert.equal(PERMITTED_CELLS[0].grain, 'Ground', 'the desert is ordered sparsest-first: Ground before Pattern before Figure');
  const g = s.grow({ at: 0 });
  assert.equal(g.refused, false, 'a grow succeeds');
  assert.equal(g.soma.count(), s.count() + 1, 'the organ was added');
  assert.equal(g.soma.close().ok, true, 'the body re-closes with the new organ inside');
  assert.ok(g.soma.organs().every((o) => o.validate().ok), 'every organ in the grown body validates');
  // the three routes each yield a valid organ.
  const dup = s.grow({ route: 'SYN', at: 3 });
  const rec = s.grow({ route: 'CON', at: 3 });
  assert.ok(!dup.refused && !rec.refused, 'duplication and recombination both produce admissible organs');
  // fuse is THRIFT: the symbiont keeps both capabilities for less than running them apart.
  let grown = s.grow({ at: 1 }).soma.grow({ at: 2 }).soma;
  const beforeUpkeep = grown.upkeep();
  const fused = grown.grow({ route: 'fuse' });
  assert.ok(!fused.refused && fused.soma.upkeep() < beforeUpkeep, 'symbiosis lowers upkeep — keep the sense, pay less');
});

test('soma: the developmental checkpoint refuses growth that would not close (no runaway proliferation)', () => {
  // a body at carrying capacity cannot grow — the guard against cancerous proliferation.
  let s = createSoma({ maxOrgans: 6 });
  let grewTo = s.count();
  for (let i = 0; i < 20; i++) { const r = s.grow({ at: i }); if (!r.refused) { s = r.soma; grewTo = s.count(); } }
  assert.ok(grewTo <= 6, 'growth stops at carrying capacity — the body cannot proliferate past its bound');
  const refused = s.grow({ at: 99 });
  assert.equal(refused.refused, true, 'a grow at capacity is refused, not forced');
  assert.equal(refused.mutation.op, 'NUL', 'the refusal is a first-class, logged outcome — never a silent drop');
});

test('soma: the neutral reservoir protects novelty from the cull — thrift may not eat the seed corn', () => {
  // grow several organs, then prune under strain: the most structurally-novel are protected.
  let s = createSoma({ reservoir: 2 });
  for (let i = 0; i < 5; i++) { const r = s.grow({ at: i }); if (!r.refused) s = r.soma; }
  const grownBefore = s.grownCount();
  const p = s.prune({ strain: { resource: 'model' } });
  assert.equal(p.refused, false, 'with grown organs beyond the reservoir, a prune succeeds');
  assert.equal(p.soma.grownCount(), grownBefore - 1, 'exactly one limb is reabsorbed');
  // shrink to only the reservoir count of grown organs — now the cull is forbidden.
  let tiny = createSoma({ reservoir: 2 });
  tiny = tiny.grow({ at: 0 }).soma;   // one grown organ, reservoir protects up to 2
  assert.equal(tiny.prune().refused, true, 'the last novel organ is reservoir-protected — a perfectly efficient body cannot evolve');
});

test('soma: the hidden horizon holds — the body computes no death countdown', () => {
  let s = createSoma();
  for (let i = 0; i < 5; i++) { const r = s.grow({ at: i }); if (!r.refused) s = r.soma; }   // grow past the reservoir
  // no genome may compute its own final turn: the soma exposes no endgame affordance.
  for (const forbidden of ['lastRound', 'turnsRemaining', 'willPrune', 'deathAt', 'finalPeriod']) {
    assert.equal(typeof s[forbidden], 'undefined', `the soma must not expose ${forbidden} — death stays invisible to the living`);
  }
  // prune is driven by resource strain, not by any countdown the organism can read.
  assert.equal(s.prune({ strain: { resource: 'model' } }).refused, false, 'pruning answers to scarcity, not to a fuel gauge');
});

test('organism: one REC, two levels — grow the missing sense, specialize into a niche, shed under overspend, tune at rest', () => {
  const o = createOrganism();
  assert.equal(hasSoma(o), true, 'an organism carries a body; a plain genome does not');
  // THE LEAP: the founding body has no organ serving `time` → a time strain GROWS the missing sense.
  const leap = o.vary({ strain: { resource: 'time', magnitude: 1 } });
  assert.equal(leap.mutation.level, 'organ', 'a strain on an unserved resource grows the organ that would serve it');
  assert.equal(leap.genome.body().count(), o.body().count() + 1, 'the body actually grew');
  // a SERVED resource with slack grows a specialist into a sparse EMPTY NICHE (frequency-dependent).
  const niche = o.vary({ strain: { resource: 'model', magnitude: 1 } });
  assert.equal(niche.mutation.level, 'organ', 'a served resource with slack takes an empty niche — the cell is worth having because no one holds it');
  // OVERSPEND (a lean season, magnitude high): shed structure — fuse two organs into a cheaper symbiont.
  let grown = o.vary({ strain: { resource: 'time', magnitude: 1 } }).genome;   // +1 grown
  grown = grown.vary({ strain: { resource: 'fetch', magnitude: 1 } }).genome;  // +1 grown → two to fuse
  const shed = grown.vary({ strain: { resource: 'model', magnitude: 1.8 } });
  assert.ok(['prune', 'fuse'].includes(shed.mutation.kind), 'overspend sheds structure (fuse/prune), it does not grow it');
  // idle drift tunes (structural growth is strain-directed, as REC is — it restructures on a break).
  assert.equal(o.vary({ pick: 'gamma' }).mutation.level, 'weight', 'idle exploration tunes; growth needs a break to direct it');
  // a body with NO room to grow falls back to tuning — growth cannot proliferate past capacity.
  const full = createOrganism({ soma: createSoma({ maxOrgans: 5 }) });   // founding already fills 5
  assert.equal(full.vary({ strain: { resource: 'time', magnitude: 1 } }).mutation.level, 'weight', 'a full body tunes — no room to grow');
  // every proposed mutation targets an OPEN locus — the dispatch never aims at a frozen one.
  for (const m of [leap.mutation, niche.mutation, shed.mutation]) assert.ok(CONSTITUTION.admits(m.target).ok, `${m.target} must be an open locus`);
});

test('organism: structure is heritable and replay-stable — a genotype round-trips and a replay reproduces the body', () => {
  const o = createOrganism();
  const grown = o.vary({ strain: { resource: 'time', magnitude: 1 } }).genome;
  // rebuild from the genotype reproduces the whole individual, body and all.
  const rt = o.rebuild(grown.genotype());
  assert.equal(rt.signature(), grown.signature(), 'the body plan is heritable — a genotype reconstructs the organism exactly');
  // no RNG: the same vary sequence from the same start yields the same body signature.
  const run = () => { let x = createOrganism(); for (const r of ['fetch', 'time', 'model', 'time']) x = x.vary({ strain: { resource: r, magnitude: 1 } }).genome; return x.signature(); };
  assert.equal(run(), run(), 'organogenesis is directed and replay-stable — the same strains grow the same body');
});

test('population: the body plan is under selection — an organism ecology sustains life and evolves', () => {
  const scarcity = createScarcity({ regime: 'seasonal', ration: 1400 });
  const pop = createPopulation({ scarcity, founder: createOrganism(), size: 14, capacity: 28 });
  let promoted = 0;
  for (let p = 0; p < 120; p++) { const d = pop.compete(p); if (d.promoted) promoted += 1; }
  assert.ok(pop.size() > 1 && pop.size() <= 28, 'the organism ecology neither collapses nor overruns its carrying capacity');
  assert.ok(promoted >= 1, 'the champion evolves under competition — at least one promotion');
  // the champion carries a real body, not just weights.
  assert.equal(typeof pop.champion().body, 'function', 'the reigning champion is a full organism — weights AND a body plan');
});

test('fitness: the Void-respect term — holding earns nothing, the delayed binding pays, the false vigil starves', () => {
  const eo = (s) => energyOf(s);
  // holding the posture of patience earns NOTHING now — the false-vigil defense.
  assert.equal(score({ delivered: true, held: 20, spend: { model: 0 } }, { energyOf: eo }).voidRespect, 0, 'the posture of patience is never rewarded — only the realized binding is');
  // a held thread that LATER binds pays, and it anchors (the world itself grounded it).
  const bound = score({ delivered: true, groundedOnDelay: 3, heldForBinding: 3, spend: { model: 0 } }, { energyOf: eo });
  assert.ok(bound.voidRespect > 0 && bound.anchoredBy === 'delayed-binding', 'the held thread that grounds is the investigator\'s payoff, and it is externally anchored');
  // precision over a spray baseline: the same 3 bindings out of 30 held earn less than 3 out of 3.
  const spray = score({ delivered: true, groundedOnDelay: 3, heldForBinding: 30, spend: { model: 0 } }, { energyOf: eo });
  assert.ok(bound.voidRespect > spray.voidRespect, 'holding-everything-cheaply cannot harvest coincidental bindings — precision wins');
  // human interaction is the STRONGEST anchor — the primary evolver, in time.
  assert.equal(score({ delivered: true, grounded: 2, claimed: 2, covered: 1, endorsed: 0.9, spend: {} }, { energyOf: eo }).anchoredBy, 'human');
});

test('metabolism: an organism metabolism charges upkeep, surfaces the body + the floor, and stays deterministic', () => {
  const run = () => {
    const s = createScarcity({ regime: 'harsh', ration: 1000 });
    const m = createMetabolism({ scarcity: s, soma: createSoma() });
    for (let i = 0; i < 40; i++) m.metabolize({ warmedModel: m.allocation().modelGate < 0.55, grounded: 3, claimed: 4, coherence: 0.8, covered: 1, delivered: true, validated: 0.8 });
    return m;
  };
  const m = run();
  const v = m.vitals();
  assert.ok(v.soma && v.soma.count >= 4, 'the champion body is surfaced for the reader');
  assert.ok(typeof v.desert === 'number' && v.desert > 0, 'the unexpressed phenotype (the desert it could grow into) is visible');
  assert.ok(v.constitution.frozen.includes('fitness') && v.constitution.open.includes('organs'), 'the freeze boundary is legible: fitness frozen, organs open');
  // upkeep bites: a body that grows costs energy every turn (a plain genome charges none).
  const plain = createMetabolism({ scarcity: createScarcity({ regime: 'harsh' }), genome: createGenome() });
  plain.metabolize({ warmedModel: false, grounded: 3, claimed: 4, covered: 1, delivered: true });
  assert.equal(plain.vitals().soma, null, 'a plain-genome metabolism has no body — non-breaking, weight-tuning only');
  // determinism: no RNG anywhere on the organism path.
  assert.deepEqual(run().lineage(), run().lineage(), 'the same log reproduces the same evolutionary lineage — body and all');
});
