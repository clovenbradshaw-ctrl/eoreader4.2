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
import { createOrganism } from './organism.js';
import { createSoma } from './soma.js';
import { CONSTITUTION } from './constitution.js';

// createMetabolism — the bloodstream. Everything is injectable so a test can pin the
// world (a fixed scarcity clock) and the surface can drive it (starve/feed at will).
//
//   population   an optional competitive ecology (population.js). When present, it OWNS
//                genome selection — the live system runs its champion, each real turn
//                CALIBRATES the ecology's world-model, and a promotion (the champion's DNA
//                changing) is the genome edit. When absent, the single-lineage select.js
//                path runs (champion vs challenger).
//   provenance   an optional provenance chain (persist.js). When present, ONLY genome
//                edits — a promotion or an inherit, never a cull or a beat — are recorded
//                to it, hash-chained, and (if armed) committed to the permanent archive.
export const createMetabolism = ({
  scarcity = createScarcity({ regime: 'plenty' }),   // DEFAULT plenty → inert until scarcity is imposed from outside
  genome = createGenome(),
  soma = null,                       // opt-in: give the metabolism a BODY to grow/prune, not just weights to tune
  organism = null,                   // or a pre-built organism (genome ⊕ soma); with neither, the unit is today's plain genome
  population = null,
  provenance = null,
  judge = null,                      // an optional external judge (judge.js) — the un-authored fitness anchor
  now = () => Date.now(),
  anchorWeight = 0.6,
  capacity = 512,
  ...selOpts
} = {}) => {
  // The heritable unit. When structure is opted into (a `soma` or a pre-built `organism`), the
  // unit is an ORGANISM — weights AND a body plan, evolving as one, so the SAME selection loop
  // grows organs and not just tunes dials. With neither, it is the plain weight-genome (today).
  const unit = organism || (soma ? createOrganism({ genome, soma }) : genome);
  const fitness = createFitness({ energyOf: scarcity.energyOf, anchorWeight });
  const selection = createSelection({ genome: unit, ...selOpts });
  let lastDemo = null;               // the ecology's latest demographics, when a population runs

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

  // the reigning genome the live turn runs. With a population, it is the ecology's
  // champion (the best competitor); otherwise the single lineage's champion.
  const reigning = () => (population ? population.champion() : selection.champion());

  // whoRunsNext / allocation — the phenotype the next turn should spend against. With a
  // population the live system always runs the reigning champion (the ecology does its
  // competing internally); on the single-lineage path a queued challenger runs to be judged.
  const runsNext = () => (!population && pending ? 'challenger' : 'champion');
  const runningAllocation = () => (!population && pending ? pending.allocation : reigning().express());
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

    // GENOME SELECTION — two paths. With a population, the ecology owns it: the real turn
    // calibrates the world-model, one period of virtual competition runs, and a PROMOTION
    // (the champion's DNA changing) is the genome edit. Without one, the single lineage's
    // champion/challenger tournament runs, and an INHERIT is the genome edit.
    let event = null;
    if (population) {
      population.calibrate({ quality: fit.quality });
      lastDemo = population.compete(period);
      event = lastDemo.promoted || null;
    } else {
      const r = selection.record({ ran, fitness: fit.fitness, season, bill: led.bill, period });
      event = r.event;
      // spawn the next challenger (slack-gated) — a mutant judged against the champion's baseline.
      pending = null;
      if (ran === 'champion') {
        const probe = selection.maybeExplore(led.headroom(), season, r.strain, period);
        if (probe) pending = { allocation: probe.allocation, mutation: probe.mutation };
      }
    }

    // PERSIST ONLY GENOME EDITS. A promotion or an inherit — the DNA actually moved — is
    // committed to the provenance chain (DNA only). A cull or an ordinary beat is not: the
    // record is the lineage of the genome, not the churn of search. Fire-and-forget; the
    // chain and the loop never block on the archive.
    let persisted = null;
    if (provenance && event && (event.kind === 'promote' || event.kind === 'inherit')) {
      try { persisted = provenance.record(event); } catch { /* provenance is best-effort */ }
    }

    const beat = Object.freeze({
      seq: seq++, t: outcome.t ?? now(), period,
      season: { name: season.name, mult: season.mult, budget: season.budget, regime: season.regime },
      ran, spend, energy: fit.energy,   // 'champion' with a population; champion|challenger on the single lineage
      fitness: fit.fitness, quality: fit.quality, provisional: fit.provisional, viable: fit.viable,
      spent: led.spent, headroom: led.headroom(), starved: led.starved(),
      champion: reigning().genotype(),
      event,                          // a genome edit (promote/inherit), a cull, or null
      persisted: persisted ? { hash: persisted.block.hash, fired: persisted.fired, seq: persisted.block.seq } : null,
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
    const champ = reigning();
    const body = typeof champ.body === 'function' ? champ.body() : null;   // the champion's soma, when structure is opted in
    const cond = fitness.condition();
    const last = beats[beats.length - 1] || null;
    return Object.freeze({
      season: { period, name: season.name, regime: season.regime, budget: season.budget, mult: season.mult },
      condition: cond,                       // recent fitness / quality / energy / anchorRate / voidRespect / humanRate
      champion: champ.genotype(),
      championNotation: champ.notation(),
      championFit: selection.championFit(),
      // the BODY the champion runs: its organs, their upkeep, and the desert it could still grow
      // into (the unexpressed phenotype). null on the plain-genome path (weight-tuning only).
      soma: body ? body.express() : null,
      desert: body ? body.desert().length : null,
      // the freeze boundary made visible: what evolution may touch and what is held immortal
      // beneath it (core alphabet + constitution), and the one ground law — never fabricate from the Void.
      constitution: { open: CONSTITUTION.openLoci(), frozen: CONSTITUTION.frozenLoci(), notation: CONSTITUTION.notation() },
      exploring: population ? null : selection.challenger(),   // single-lineage challenger under trial, or null
      // the competitive ecology, when present: how many virtual systems are alive, how
      // diverse the gene pool is, and the last period's demographics (births / mean energy).
      ecology: population ? { size: population.size(), diversity: population.diversity(), last: lastDemo } : null,
      // the provenance chain, when present: the genome-edit ledger's length, head hash,
      // whether it is armed to write, and whether it verifies (tamper-evidence).
      chain: provenance ? { length: provenance.length(), head: provenance.head(), armed: provenance.armed(), intact: provenance.verify().ok } : null,
      allocation: allocation(),              // what the next turn is cleared to spend (clamped)
      viable: last ? last.viable : true,
      provisional: last ? last.provisional : true,   // Goodhart honesty: is fitness self-reported?
      anchorRate: cond.anchorRate,
      lineage: (population ? population.promotions() : selection.lineage()).slice(-12),
      beats: beats.length,
      starved: last ? last.starved : false,
    });
  };

  // metabolizeJudged — the async path: if an external judge is attached, grade the turn's
  // answer for the un-authored `validated` anchor, fold it into the outcome, THEN metabolize.
  // The judge sees the turn's content; only its scalar verdict reaches fitness. With no judge
  // (or dry-run), it degrades to a plain metabolize and fitness stays honestly provisional.
  const metabolizeJudged = async (outcome = {}) => {
    if (judge && typeof judge.grade === 'function' && outcome.answer != null) {
      try {
        const verdict = await judge.grade({ question: outcome.question, answer: outcome.answer, spans: outcome.spans });
        if (verdict) outcome = { ...outcome, validated: verdict.validated, covered: verdict.covered ?? outcome.covered, judged: true };
      } catch { /* a judge outage must not stall the metabolism */ }
    }
    return metabolize(outcome);
  };

  return Object.freeze({
    // the loop
    metabolize,
    metabolizeJudged,    // async: grade with the external judge (anchor), then metabolize
    allocation,          // consumers read this BEFORE a turn to know what to spend
    runsNext,
    // the membrane / readout
    vitals,
    subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
    beats: () => beats.slice(),
    lineage: () => (population ? population.promotions() : selection.lineage()),
    genome: () => reigning().genotype(),
    condition: () => fitness.condition(),
    // the optional organs, exposed so the surface / a deployment can read demographics,
    // inspect or arm the provenance chain, arm the external judge, etc.
    population,
    provenance,
    judge,
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
  // wall-clock, PLUS the body's upkeep: every organ costs resource to run, every turn, forever,
  // so a body that grows more than it can feed spends more energy and is selected against — the
  // metabolism paying for the organs. Upkeep is already energy; charged as metabolic time
  // (COSTS.time = 0.5 → ×2 time units). With a plain genome (no body) `alloc.upkeep` is absent → 0.
  time: (outcome.timeMs != null ? outcome.timeMs / 100 : 1) + (Number(alloc.upkeep) || 0) * 2,
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
export { createPopulation } from './population.js';
export { createProvenance, memoryStore } from './persist.js';
export { createJudge, buildJudgeRequest, parseVerdict, JUDGE_MODEL, buildInterpretationRequest, parseInterp, createPanel, createJudgePool } from './judge.js';
export { liftOf, gapClosed, liftFitness, transfers, keptFitness, transferReading, createProxy, liftWorld, TRANSFER_FLOOR } from './lift.js';
export { createHorizon, knownHorizon } from './horizon.js';
export { createAgent, reputationOf, decide, simulate, classifyRoom, isWrongRoom, population } from './reputation.js';
// the commons + multi-level selection (main's niche-construction line):
export { createCommons } from './commons.js';
export { demeProductivity, multiLevelSelect, traitFrequency, partition } from './demes.js';
// organ-level evolution — the body plan, its organs, and the floor evolution stands on:
export { CONSTITUTION, BANDS, admits, permitsCell, wellFormedOrgan } from './constitution.js';
export { createOrgan, foundingOrgans, FOUNDING_ORGANS, UPKEEP_BY_OP, RESOURCE_BY_OP } from './organ.js';
export { createSoma, foundingSoma, PERMITTED_CELLS } from './soma.js';
export { createOrganism, hasSoma } from './organism.js';
export { forage, createForager, SOURCES } from './forage.js';
export { createTransferProbe, modelRunner, judgeScorer } from './transfer.js';
export { createChallenger, runChallengeCycle, buildChallengeMessages, buildSatisfactionMessages, CHALLENGER_MODEL } from './challenger.js';
