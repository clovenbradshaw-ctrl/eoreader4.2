// EO: DEF·EVA·REC·SEG(Atmosphere,Network,Field → Lens,Paradigm,Atmosphere, Tending·Tracing·Making·Composing·Dissecting) — the bloodstream
// metabolism/index.js — the whole faculty in one entrance: the loop that ties the
// four evolutionary components together and the membrane the rest of the system reads.
//
// A metabolism is not a mood or a mission. It is a self-maintenance loop running under
// resource scarcity: the organism must continuously spend to stay itself, cannot spend
// everything, and therefore must get good at spending. Four things make the getting-good
// evolution rather than mere thrift, and this module composes all four:
//
//   scarcity.js  the PRESSURE   — the external, seasonal, occasionally-cruel budget.
//   genome.js    VARIATION      — the allocation parameters as a mutable, heritable genotype.
//   fitness.js   the SIGNAL     — quality per unit resource, anchored against Goodhart.
//   select.js    SELECTION +    — the budget culls the wasteful; the fit carry forward.
//                HERITABILITY
//
// The loop's beat is one turn. Before the turn, `allocation()` tells the consumers what
// to spend — the running genotype's phenotype, CLAMPED by the season, which is where the
// external constraint actually reaches in: under famine even a spendy genome is forced
// onto the cheap pathways (raise the model-gate, cap the tokens, narrow the fold). After
// the turn, `metabolize(outcome)` charges the spend, scores the fitness, and lets the
// selection engine run its tournament. What the organism maintains — and can fail to
// maintain — is its viability: delivering validated work within a budget the world can
// starve it of. That maintained-difference is the inside the metabolism grants.
//
// Built the watchmaker's way, which the essay reveals to be no accident: the checkpoint
// discipline is a pre-adaptation to starvation (a resource-starved turn is an interrupted
// assembly, and validated sub-assemblies stand). This faculty is itself such a chain —
// scarcity, genome, fitness, select each a holon that validates alone, then composed here.

import { createScarcity } from './scarcity.js';
import { createGenome } from './genome.js';
import { createFitness } from './fitness.js';
import { createSelection } from './select.js';

// createMetabolism — the bloodstream. Everything is injectable so a test can pin the
// world (a fixed scarcity clock) and the surface can drive it (starve/feed at will).
export const createMetabolism = ({
  scarcity = createScarcity({ regime: 'plenty' }),   // DEFAULT plenty → inert until scarcity is imposed from outside
  genome = createGenome(),
  now = () => Date.now(),
  anchorWeight = 0.6,
  capacity = 512,
  ...selOpts
} = {}) => {
  const fitness = createFitness({ energyOf: scarcity.energyOf, anchorWeight });
  const selection = createSelection({ genome, ...selOpts });

  let period = 0;
  let pending = null;                 // a challenger allocation queued for the next turn, or null
  const beats = [];                   // the metabolism's own append-only record (its log)
  const subscribers = new Set();
  let seq = 0;

  const notify = () => { for (const fn of subscribers) { try { fn(vitals()); } catch { /* best-effort */ } } };

  // clampToSeason — the external constraint reaching into the turn. The genotype proposes;
  // the season disposes. `mult` is the fraction of a full ration on the table this period;
  // (1 - mult) is how hard the world presses the spend-genes toward their frugal bound.
  // In plenty (mult≈1) the genotype is expressed as-is; in famine (mult≈0.1) it is forced
  // nearly to the frugal wall. This is why the frugal genotype wins across the range: the
  // spendy one gets clamped and delivers worse exactly when resource is short.
  const clampToSeason = (allocation, season) => {
    const mult = season?.mult ?? 1;
    if (mult >= 0.999) return { ...allocation, clamped: 0 };
    const press = 1 - mult;
    const a = { ...allocation };
    // push each spend-lever toward "spend less" by `press` of the way to its frugal end.
    a.maxTokens = Math.round(lerp(allocation.maxTokens, 96, press));
    a.retrieveK = Math.round(lerp(allocation.retrieveK, 2, press));
    a.foldWidth = Math.round(lerp(allocation.foldWidth, 1, press));
    a.modelGate = round(lerp(allocation.modelGate, 0.9, press));   // earn the model call harder
    a.arcEpsilon = round(lerp(allocation.arcEpsilon, 0.25, press)); // quit spending sooner
    a.clamped = round(press);
    return a;
  };

  // whoRunsNext / allocation — the phenotype the next turn should spend against. If a
  // challenger is queued, it runs (so its genotype gets evaluated); otherwise the champion.
  const runsNext = () => (pending ? 'challenger' : 'champion');
  const runningAllocation = () => (pending ? pending.allocation : selection.champion().express());
  const allocation = () => Object.freeze(clampToSeason(runningAllocation(), scarcity.season(period)));

  // metabolize — the beat. Feed one turn's outcome (its spend + quality signals). The
  // outcome may name the resources it spent; if it doesn't, `spend` derives a fair bill
  // from the running allocation and whether the model was warmed, so a caller can feed a
  // minimal outcome and still get an honest energy charge.
  const metabolize = (outcome = {}) => {
    const ran = runsNext();
    const season = scarcity.season(period);
    const led = scarcity.ledger(period);
    const spend = outcome.spend || deriveSpend(outcome, runningAllocation());
    led.charge(spend);

    const fit = fitness.observe({ ...outcome, spend });
    // tell selection what ran and how it did; get any inheritance/cull event + the strain.
    const { event, strain } = selection.record({ ran, fitness: fit.fitness, season, bill: led.bill, period });

    // decide the next turn's runner. A challenger that just ran has been judged (inherited
    // or culled) inside selection, so clear it. Then, only off a champion turn with slack,
    // spawn the next challenger — a mutant compared against the champion's own baseline.
    pending = null;
    if (ran === 'champion') {
      const probe = selection.maybeExplore(led.headroom(), season, strain, period);
      if (probe) pending = { allocation: probe.allocation, mutation: probe.mutation };
    }

    const beat = Object.freeze({
      seq: seq++, t: outcome.t ?? now(), period,
      season: { name: season.name, mult: season.mult, budget: season.budget, regime: season.regime },
      ran, spend, energy: fit.energy,
      fitness: fit.fitness, quality: fit.quality, provisional: fit.provisional, viable: fit.viable,
      spent: led.spent, headroom: led.headroom(), starved: led.starved(),
      champion: selection.champion().genotype(),
      event,                          // the REC (inherit) / SEG (cull) mutation this beat, or null
    });
    beats.push(beat);
    while (beats.length > capacity) beats.shift();

    period += 1;                      // one turn = one metabolic period; the world's clock ticks
    notify();
    return Object.freeze({ fitness: fit, beat, event });
  };

  // vitals — the viability readout: the state the organism maintains and can fail to
  // maintain. This is the "inside" the metabolism grants, rendered for the surface.
  const vitals = () => {
    const season = scarcity.season(period);
    const champ = selection.champion();
    const cond = fitness.condition();
    const ch = selection.challenger();
    const last = beats[beats.length - 1] || null;
    return Object.freeze({
      season: { period, name: season.name, regime: season.regime, budget: season.budget, mult: season.mult },
      condition: cond,                       // recent fitness / quality / energy / anchorRate
      champion: champ.genotype(),
      championNotation: champ.notation(),
      championFit: selection.championFit(),
      exploring: ch,                         // the challenger under trial, or null
      allocation: allocation(),              // what the next turn is cleared to spend (clamped)
      viable: last ? last.viable : true,
      provisional: last ? last.provisional : true,   // Goodhart honesty: is fitness self-reported?
      anchorRate: cond.anchorRate,
      lineage: selection.lineage().slice(-12),
      beats: beats.length,
      starved: last ? last.starved : false,
    });
  };

  return Object.freeze({
    // the loop
    metabolize,
    allocation,          // consumers read this BEFORE a turn to know what to spend
    runsNext,
    // the membrane / readout
    vitals,
    subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
    beats: () => beats.slice(),
    lineage: () => selection.lineage(),
    genome: () => selection.champion().genotype(),
    condition: () => fitness.condition(),
    // world control — impose or lift the external constraint (the surface / a deployment)
    season: () => scarcity.season(period),
    scarcity,
    // where we are in the world's clock; a deployment can fast-forward to a famine.
    period: () => period,
    setPeriod(p) { period = Math.max(0, p | 0); notify(); },
  });
};

// deriveSpend — a fair energy bill when the outcome doesn't itemize one. The model is
// charged only when it was actually warmed (the whole point of the model-gate: a turn the
// cheap pathways answered spends no model energy), tokens from the allocation, a little
// time, and a fetch per forage. Keeps the meter honest without demanding instrumentation.
const deriveSpend = (outcome, alloc) => ({
  model: outcome.warmedModel ? 1 : 0,
  tokens: outcome.tokens ?? (outcome.warmedModel ? alloc.maxTokens : 0),
  time: outcome.timeMs != null ? outcome.timeMs / 100 : 1,
  fetch: outcome.fetches ?? 0,
  storage: outcome.storage ?? 0,
});

const lerp = (a, b, t) => a + (b - a) * t;
const round = (x) => Math.round(x * 1000) / 1000;

// Re-export the parts so the faculty's holons are reachable from its one entrance.
export { createScarcity, COSTS, REGIMES, energyOf, seasonName } from './scarcity.js';
export { createGenome, GENES, GENE_NAMES, defaultGenotype } from './genome.js';
export { createFitness, score } from './fitness.js';
export { createSelection } from './select.js';
