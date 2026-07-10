// EO: SYN·SEG·EVA(Network,Field → Network,Void, Composing·Dissecting·Tracing) — the competitive ecology
// metabolism/population.js — multiple virtual systems competing for one scarce shared
// resource. Selection under scarcity is only truly real when it is RELATIVE: a single
// lineage hill-climbing against its own past can drift, but a population competing for a
// pool that cannot feed them all is filtered by exclusion — the variant that spends a
// model call to win a trivial confirmation is out-competed by the one that routes it to
// the mechanical answerer, and the wasteful genome dies because the shared budget will
// not feed it. Not a metaphor: organisms hold energy, draw from a common ration in order
// of efficiency, run a surplus and reproduce or run a deficit and starve out, bounded by
// the environment's carrying capacity. The best competitor is promoted to the live system.
//
// The competitors are VIRTUAL — one real engine runs the reigning champion's genome for
// real; the rest are evaluated against a world-model that the real turns CALIBRATE. That
// is the point: you cannot afford to A/B every mutation on real (expensive) turns, so the
// population searches genome-space virtually against a learned resource/quality landscape,
// and only the champion is ever run for real. Ground truth flows in through `calibrate`.
//
// DNA only. An organism is a genome (allocation parameters) plus scalar bookkeeping —
// energy, age, ids, win-count. Nothing about any document, question, or answer ever
// enters here; the ecology competes on how it SPENDS, never on what it read.

import { createGenome, GENE_NAMES, GENES } from './genome.js';

// createPopulation — the ecology. `scarcity` supplies the shared ration per period (the
// carrying capacity of the world); `founder` seeds the gene pool.
export const createPopulation = ({
  scarcity,
  founder = createGenome(),
  size = 12,               // founding / sustainable population
  capacity = 24,           // carrying capacity — the world sustains only so many
  reproduceAt = 24,        // energy surplus at which an organism reproduces
  dieBelow = -6,           // energy deficit at which it starves out
  metabolicTax = 2,        // baseline upkeep every organism pays each period — the cost of merely existing
  reproduceCost = 10,      // energy an organism spends to make one offspring
  valuePerQuality = 20,    // energy an organism banks per unit of quality it produces when fed
  world = defaultWorld(),  // the calibratable quality/cost model the virtual turns run against
} = {}) => {
  let nextId = 1;
  const mk = (genome, parentId, period) => ({ id: nextId++, genome, energy: 6, age: 0, born: period, parentId, wins: 0 });

  // Found the population as directed variants of the founder, so there is variation to
  // select on from period 0. Deterministic: gene i of the founder is nudged for organism i.
  const organisms = [mk(founder, null, 0)];
  for (let i = 1; i < size; i++) {
    const pick = GENE_NAMES[i % GENE_NAMES.length];
    const { genome } = founder.vary({ pick, bias: 1 + (i % 3) });
    organisms.push(mk(genome, null, 0));
  }

  let championId = organisms[0].id;
  let championGenotype = founder.genotype();
  const promotions = [];   // every time the champion's genome changes — the genome edits

  // compete — run one period of the ecology. Returns the period's demographics + whether
  // the champion changed (a genome edit worth persisting).
  const compete = (period = 0) => {
    const season = scarcity.season(period);
    let pool = season.budget;          // the shared food this period — the thing competed for

    // 1. each organism expresses its genome, clamped by the season, and the world-model
    //    predicts what it would earn (quality/fitness) and what it would spend (energy).
    const bids = organisms.map((o) => {
      const alloc = clampToSeason(o.genome.express(), season);
      const { quality, spend } = world.evaluate(alloc, season);
      const energy = scarcity.energyOf(spend);
      const efficiency = quality / (energy + 1);   // fitness — the priority for the shared pool
      return { o, alloc, quality, energy, efficiency };
    });

    // 2. COMPETITION: the efficient feed first. The shared pool is drawn DOWN by each fed
    //    organism's resource footprint (its energy cost) — so a frugal organism (small
    //    footprint) lets far more of its kind eat before the pool is gone, while a spendy
    //    one crowds the trough and leaves its cohort to starve. A fed organism BANKS energy
    //    proportional to the value (quality) it produced; a starved one banks nothing and
    //    pays the upkeep. That is the exclusion: under a small pool, the wasteful are fed
    //    last, fed rarely, and decline; the efficient are fed first, fed often, and grow.
    bids.sort((a, b) => (b.efficiency - a.efficiency) || (a.o.id - b.o.id));  // deterministic ties
    for (const bid of bids) {
      const { o, energy, quality } = bid;
      let gain;
      if (pool >= energy) {                 // the pool covers this organism's footprint
        pool -= energy;
        gain = valuePerQuality * quality - metabolicTax;      // fed: banks its value, pays upkeep
        o.wins += 1;
      } else if (pool > 0) {                // a partial ration — a lean meal
        const frac = pool / energy; pool = 0;
        gain = valuePerQuality * quality * frac - metabolicTax;
      } else {                              // the pool is empty — starved out this period
        gain = -metabolicTax;
      }
      o.energy += gain;
      o.age += 1;
    }

    // 3. DEATH: the starved fall below the viability floor and are removed.
    let living = organisms.filter((o) => o.energy > dieBelow);

    // 4. REPRODUCTION: organisms with surplus spawn a mutated offspring, directed by the
    //    resource they spent most on (spend less of it) — the strain that shapes the child.
    const births = [];
    for (const o of living) {
      if (o.energy >= reproduceAt && living.length + births.length < capacity) {
        o.energy -= reproduceCost;
        const strain = dominantStrain(o.genome, season);
        const { genome } = o.genome.vary({ strain });
        births.push(mk(genome, o.id, period));
      }
    }
    living = living.concat(births);

    // 5. CARRYING CAPACITY: if the world is over-full, the least-energy organisms die —
    //    the environment cannot sustain everyone, and scarcity, not preference, decides.
    living.sort((a, b) => b.energy - a.energy);
    const survivors = living.slice(0, capacity);

    // 6. keep the pool non-empty of lineages: if competition wiped everyone, reseed from the
    //    last champion (extinction guard — a dead ecology cannot evolve).
    if (survivors.length === 0) survivors.push(mk(createGenome(championGenotype), null, period));

    organisms.length = 0;
    organisms.push(...survivors);

    // 7. the champion is the most successful competitor — highest energy. A change in its
    //    genome is a genome edit: the moment the live system's DNA actually moves.
    const top = survivors[0];
    let promoted = null;
    if (!sameGenotype(top.genome.genotype(), championGenotype)) {
      const before = championGenotype;
      championId = top.id; championGenotype = top.genome.genotype();
      promoted = diffGenotype(before, championGenotype, { period, energy: round(top.energy), pop: survivors.length });
      promotions.push(promoted);
    } else {
      championId = top.id;
    }

    return Object.freeze({
      period, season: season.name, pool: round(season.budget - pool < 0 ? 0 : season.budget),
      alive: survivors.length, births: births.length,
      champion: championGenotype, championEnergy: round(top.energy),
      meanEnergy: round(survivors.reduce((s, o) => s + o.energy, 0) / survivors.length),
      promoted,
    });
  };

  return Object.freeze({
    compete,
    calibrate: world.calibrate,        // feed a real turn's ground truth into the world-model
    champion: () => createGenome(championGenotype),
    championGenotype: () => ({ ...championGenotype }),
    promotions: () => promotions.slice(),
    demographics: () => organisms.map((o) => ({ id: o.id, energy: round(o.energy), age: o.age, wins: o.wins, parentId: o.parentId })),
    size: () => organisms.length,
    diversity: () => genotypeSpread(organisms),
  });
};

// defaultWorld — the calibratable quality/cost model the virtual turns run against. The
// premise the essay grants: cheap answers are usually about as good as expensive ones, so
// QUALITY saturates fast in spend and FITNESS (quality/energy) rewards frugality — until a
// real turn calibrates otherwise. `gain` is an EMA of observed quality-per-effort from the
// live system: if model calls genuinely buy quality, this rises and the ecology stops
// over-starving (the exchange-rate guard — scarcity must fall on waste, not essential work).
const defaultWorld = () => {
  let gain = 1.0;        // learned quality-per-effort multiplier (calibrated by real turns)
  const evaluate = (alloc, _season) => {
    // effort ∈ [0,1]: how rich the allocation is (warm model + tokens + forage), normalized.
    const warm = alloc.modelGate < 0.55 ? 1 : 0;
    const effort = 0.5 * warm + 0.3 * norm(alloc.maxTokens, 96, 512) + 0.2 * norm(alloc.retrieveK, 2, 12);
    // quality saturates: most of it is available at modest effort; extra spend barely adds.
    const quality = gain * (0.62 + 0.38 * (1 - Math.exp(-3 * effort)));
    const spend = {
      model: warm, tokens: warm ? alloc.maxTokens : 0,
      time: warm ? 8 : 1.2, fetch: alloc.retrieveK, storage: 0,
    };
    return { quality: round(quality), spend };
  };
  // calibrate — nudge `gain` toward the quality-per-effort the real world actually paid.
  const calibrate = (realOutcome = {}) => {
    const q = Number(realOutcome.quality);
    if (Number.isFinite(q) && q > 0) gain = round(0.9 * gain + 0.1 * Math.max(0.2, Math.min(3, q)));
    return gain;
  };
  return { evaluate, calibrate, get gain() { return gain; } };
};

// dominantStrain — the resource an organism's genome spends most on, so its offspring is
// directed to spend less of it (mutation shaped by the pressure the parent lived under).
const dominantStrain = (genome, season) => {
  const a = clampToSeason(genome.express(), season);
  const weighted = {
    model: (a.modelGate < 0.55 ? 1 : 0) * 100,
    tokens: a.maxTokens * 0.02,
    fetch: a.retrieveK * 3,
    time: 0.6,
  };
  let resource = 'tokens', top = 0;
  for (const [k, v] of Object.entries(weighted)) if (v > top) { top = v; resource = k; }
  return { resource, magnitude: 1 };
};

// clampToSeason — the shared clamp (kept in step with index.js): the season presses the
// spend-genes toward frugality, so a spendy organism is forced lean exactly when resource
// is short. Duplicated here (not imported from index) so the ecology is a standalone holon.
const clampToSeason = (allocation, season) => {
  const mult = season?.mult ?? 1;
  if (mult >= 0.999) return allocation;
  const press = 1 - mult;
  return {
    ...allocation,
    maxTokens: Math.round(lerp(allocation.maxTokens, 96, press)),
    retrieveK: Math.round(lerp(allocation.retrieveK, 2, press)),
    foldWidth: Math.round(lerp(allocation.foldWidth, 1, press)),
    modelGate: round(lerp(allocation.modelGate, 0.9, press)),
    arcEpsilon: round(lerp(allocation.arcEpsilon, 0.25, press)),
  };
};

const norm = (x, lo, hi) => Math.max(0, Math.min(1, (x - lo) / (hi - lo)));
const sameGenotype = (a, b) => GENE_NAMES.every((n) => a[n] === b[n]);
const diffGenotype = (before, after, meta) => {
  const changed = GENE_NAMES.filter((n) => before[n] !== after[n])
    .map((n) => ({ gene: n, before: before[n], after: after[n], delta: round(after[n] - before[n]) }));
  return Object.freeze({ op: 'REC', kind: 'promote', changes: changed, ...meta,
    note: `promote ${changed.map((c) => `${c.gene}:${c.before}→${c.after}`).join(', ') || '(founder)'}` });
};
const genotypeSpread = (organisms) => {
  if (organisms.length < 2) return 0;
  let d = 0, n = 0;
  for (const n1 of GENE_NAMES) {
    const span = (GENES[n1].max - GENES[n1].min) || 1;
    const vals = organisms.map((o) => o.genome.get(n1));
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    d += Math.sqrt(vals.reduce((s, v) => s + ((v - mean) / span) ** 2, 0) / vals.length); n++;
  }
  return round(d / n);
};
const lerp = (a, b, t) => a + (b - a) * t;
const round = (x) => Math.round(x * 1000) / 1000;
