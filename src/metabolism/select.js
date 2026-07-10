// EO: SEG·EVA(Network,Lens → Link,Network, Dissecting·Binding·Tracing) — selection under scarcity
import { GENES } from './genome.js';
// metabolism/select.js — the filter that lets fit genotypes persist and kills unfit
// ones. Selection is the external budget made real: under abundance the wasteful and
// the efficient survive equally and nothing is filtered; under scarcity the variant
// that spends a model call to win a trivial confirmation is outcompeted by the one
// that routes that confirmation to the mechanical answerer, and the wasteful genome
// dies because the budget will not feed it.
//
// This is the selection + heritability half of the four (variation lives in genome.js,
// the fitness signal in fitness.js, the scarcity pressure in scarcity.js). It holds a
// CHAMPION genotype — the incumbent, carried forward every period, which is the
// heritability: the surviving configuration persists, so the organism accumulates
// instead of restarting from zero each turn. Periodically it spawns a CHALLENGER (a
// REC-mutant of the champion, directed by the strain the champion was under) and, when
// the challenger proves fitter over enough evidence, the challenger is inherited.
//
// Three guards, each answering one of the essay's failure modes:
//   SLACK — variation costs resource; a system starved too hard has no surplus to
//     explore with and freezes on whatever genome it held when the famine hit. So
//     exploration is GATED on headroom: no challenger is spawned in famine or when the
//     period's ration is nearly spent. The lean season must therefore be seasonal —
//     punctuated by plenty — for the organism to ever adapt, which is by design.
//   PATH-DEPENDENCE — an early adaptation, good enough at the time, can lock in and
//     foreclose better ones. Guarded two ways: a challenger is periodically a REVERT
//     (mutate a gene back toward its default), so no locked-in gene is permanent; and
//     the champion is never frozen — every gene stays reachable by a future REC.
//   HYSTERESIS — a challenger must beat the champion by a MARGIN, and over more than a
//     single lucky turn, before it inherits, so selection tracks real efficiency and
//     not the noise of one favorable season.

export const createSelection = ({
  genome,                    // the starting genome (createGenome) — the founding champion
  margin = 0.05,             // fractional fitness edge a challenger needs to inherit (hysteresis)
  explorationFloor = 0.25,   // min period headroom before a challenger may be spawned (slack guard)
  trialPeriods = 1,          // periods a challenger runs before the verdict (the loop runs it once)
  revertEvery = 7,           // every Nth exploration is a revert-to-default (path-dependence guard)
} = {}) => {
  let champion = genome;
  let championFit = 0;       // the champion's γ-recent fitness, updated each period it runs
  let challenger = null;     // { genome, mutation, fitSum, fitN, bornAt }
  let explorations = 0;      // count of challengers spawned (drives the revert cadence)
  const lineage = [];        // every inheritance / rejection — the auditable evolutionary record

  // strainOf — read the dominant resource strain from a fitness reading + the season,
  // so mutation is DIRECTED (spend less of what the world made scarce). Under famine or
  // an overspend, the binding resource is whatever the last turn spent most energy on;
  // magnitude scales with how far over the ration the organism went.
  const strainOf = (fitReading, season, bill) => {
    if (!bill) return null;
    // the resource that cost the most energy this period is the one to relieve.
    const weighted = { model: bill.model * 100, tokens: bill.tokens * 0.02, time: bill.time * 0.5, fetch: bill.fetch * 3 };
    let resource = null, top = 0;
    for (const [k, v] of Object.entries(weighted)) if (v > top) { top = v; resource = k; }
    const pressure = season && season.budget > 0 ? Math.max(0, (fitReading?.energy || 0) - season.budget) / season.budget : 0;
    return resource ? { resource, magnitude: 1 + Math.min(2, pressure) } : null;
  };

  // maybeExplore — spawn a challenger IF the slack guard allows. Returns the challenger's
  // expressed allocation to try next period, or null (conserve — run the champion again).
  const maybeExplore = (headroom, season, strain, period) => {
    if (challenger) return null;                                  // one challenger at a time
    if (season && season.name === 'famine') return null;          // slack guard: never explore in famine
    if (headroom < explorationFloor) return null;                 // slack guard: no surplus to spend on variation
    explorations += 1;
    const revert = (explorations % revertEvery === 0)             // path-dependence guard: periodic revert
      ? pickDriftedGene(champion)
      : null;
    // deterministic gene rotation for idle exploration (no RNG — replay-stable).
    const pick = GENE_ROTATION[period % GENE_ROTATION.length];
    const { genome: g, mutation } = champion.vary({ strain: revert ? null : strain, pick, revert });
    challenger = { genome: g, mutation, fitSum: 0, fitN: 0, bornAt: period };
    return { allocation: g.express(), mutation };
  };

  // record — feed one period's result. Updates the champion's fitness (when the champion
  // ran) or the challenger's trial (when the challenger ran), and RESOLVES the trial into
  // an inheritance or a rejection once enough evidence is in. Returns any REC event.
  const record = ({ ran = 'champion', fitness = 0, season = null, bill = null, period = 0 } = {}) => {
    let event = null;
    if (ran === 'challenger' && challenger) {
      challenger.fitSum += fitness;
      challenger.fitN += 1;
      if (challenger.fitN >= trialPeriods) {
        const chFit = challenger.fitSum / challenger.fitN;
        // SELECTION: the challenger inherits only if it beats the champion by the margin.
        if (chFit > championFit * (1 + margin)) {
          event = Object.freeze({
            op: 'REC', kind: 'inherit', ...challenger.mutation,
            championFit: round(championFit), challengerFit: round(chFit), period,
            note: `inherit ${challenger.mutation.gene}: ${challenger.mutation.before}→${challenger.mutation.after} ` +
                  `(fit ${round(championFit)}→${round(chFit)})`,
          });
          champion = challenger.genome;
          championFit = chFit;
        } else {
          event = Object.freeze({
            op: 'SEG', kind: 'cull', gene: challenger.mutation.gene,
            championFit: round(championFit), challengerFit: round(chFit), period,
            note: `cull ${challenger.mutation.gene} (fit ${round(chFit)} ≤ ${round(championFit)})`,
          });
        }
        lineage.push(event);
        challenger = null;
      }
    } else {
      // the champion ran: track its recent fitness as the bar the challenger must clear.
      championFit = championFit === 0 ? fitness : 0.7 * championFit + 0.3 * fitness;
    }
    return { event, strain: strainOf({ energy: bill ? energyBill(bill) : 0 }, season, bill) };
  };

  return Object.freeze({
    champion: () => champion,
    championFit: () => round(championFit),
    challenger: () => (challenger ? { mutation: challenger.mutation, allocation: challenger.genome.express(), trials: challenger.fitN } : null),
    exploring: () => !!challenger,
    record,
    maybeExplore,
    strainOf,
    lineage: () => lineage.slice(),
  });
};

// GENE_ROTATION — a fixed order for idle exploration, so which gene drifts is a pure
// function of the period index (replay-stable, no RNG). Matches genome.js GENE_NAMES.
const GENE_ROTATION = Object.freeze(['modelGate', 'maxTokens', 'retrieveK', 'bindFloor', 'foldWidth', 'arcEpsilon', 'gamma']);

// pickDriftedGene — the gene that has drifted FURTHEST from its default is the one a
// revert challenger pulls back, so the path-dependence escape targets the deepest rut.
const pickDriftedGene = (genome) => {
  const gt = genome.genotype();
  let best = null, bestGap = 0;
  for (const n of GENE_ROTATION) {
    const g = GENES[n]; if (!g) continue;
    const span = (g.max - g.min) || 1;
    const gap = Math.abs((gt[n] - g.default) / span);
    if (gap > bestGap) { bestGap = gap; best = n; }
  }
  return bestGap > 0 ? best : null;
};

const energyBill = (bill) => (bill.model * 100) + (bill.tokens * 0.02) + (bill.time * 0.5) + (bill.fetch * 3);
const round = (x) => Math.round(x * 1000) / 1000;
