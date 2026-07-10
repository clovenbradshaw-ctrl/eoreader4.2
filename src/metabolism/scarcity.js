// EO: DEF·SEG(Atmosphere,Field → Atmosphere,Field, Clearing·Cultivating·Tending) — the external scarcity
// metabolism/scarcity.js — the external constraint: the resource currency, the
// per-period budget, and the lean-season regime the organism lives under.
//
// This is the thing the system can lose. Everything else in the faculty is the
// mechanism that answers to it. A metabolism is a self-maintenance loop running
// under resource scarcity — a system that must continuously spend to stay itself,
// cannot spend everything, and therefore must get good at spending. The engine of
// that "getting good" is not the abundance; it is the scarcity, and the scarcity
// has to be EXTERNAL, real, and occasionally cruel, or nothing is forced at all.
// So this module is a constructor argument, not a thing the system picks: the
// environment (a deployment, a season, a famine) hands it in.
//
// Five acts are metabolically expensive, each an organ with a cost, and beneath
// all five is the true external resource they convert into — energy, and its proxy,
// money. A single currency the organism has to manage: the bloodstream.
//   model    warming/paying the model — THE expensive organ (the essay's headline).
//   tokens   the context window — working memory, held under attention.
//   time     the wall-clock deadline — deliberate further, or commit now.
//   fetch    retrieval / foraging — rate limits, network, archive quota.
//   storage  the materialized view — bounded; what to keep becomes selectable.

// COSTS — energy per unit of each resource. The model call dominates by design:
// the whole point of scarcity is to force traffic off the expensive organ onto the
// cheap pathways the architecture already carries (mechanical answerers that never
// warm the model, the predictor, the retrieved span). Mechanical work is ~free.
export const COSTS = Object.freeze({
  model: 100,       // per model call (warm/paid) — the costliest act
  tokens: 0.02,     // per output/context token
  time: 0.5,        // per 100ms of wall-clock
  fetch: 3,         // per foraging fetch (bandwidth + quota)
  storage: 0.001,   // per byte materialized
});

// energyOf — score a spend ledger into the single currency. This is where the five
// constraints stop being separate knobs and become one number the organism manages.
export const energyOf = (spend = {}, costs = COSTS) => {
  let e = 0;
  for (const k of Object.keys(costs)) e += (Number(spend[k]) || 0) * costs[k];
  return e;
};

// The regimes — the shape of the resource world over time. `plenty` is the DEFAULT,
// and it is deliberately inert: a constant, generous budget under which nothing is
// forced and the genome does not evolve (a metabolism selected against no pressure
// only drifts). Scarcity is opt-in because it must come from outside. `seasonal`
// and `harsh` impose the lean season the essay argues for: a budget that varies and
// PERIODICALLY STARVES, punctuated by enough plenty to adapt in (the slack the
// exploration needs). Famine periods select for grace under starvation — the shape
// of the performance curve across a range of resource, not peak performance at one.
export const REGIMES = Object.freeze({
  plenty:   Object.freeze({ base: 1.0, amp: 0.0,  cycle: 1,  famineEvery: 0, famineFloor: 1.0 }),
  seasonal: Object.freeze({ base: 0.6, amp: 0.4,  cycle: 8,  famineEvery: 12, famineFloor: 0.12 }),
  harsh:    Object.freeze({ base: 0.4, amp: 0.3,  cycle: 5,  famineEvery: 5,  famineFloor: 0.06 }),
});

// The season names, by how much of the period's full ration is on the table.
export const seasonName = (mult) =>
  mult <= 0.2 ? 'famine' : mult < 0.6 ? 'lean' : mult < 0.9 ? 'turning' : 'plenty';

// createScarcity — the world's resource clock. DETERMINISTIC in the period index so
// a replayed log reproduces the same seasons and the same evolutionary trajectory
// (the append-only log's parity ethos, extended to the metabolism). No Math.random,
// no wall-clock in the schedule; `ration` and `famine` are pure functions of `p`.
//
//   ration       — the full energy budget for a plenty period (the environment's gift).
//   regime       — 'plenty' | 'seasonal' | 'harsh', or a custom shape.
//   famineAt     — an explicit set/array of period indices forced to famine (a deliberate
//                  cruelty the operator can schedule on top of the regime's own cadence).
export const createScarcity = ({ ration = 1000, regime = 'plenty', costs = COSTS, famineAt = null } = {}) => {
  const shape = typeof regime === 'string' ? (REGIMES[regime] || REGIMES.plenty) : { ...REGIMES.plenty, ...regime };
  const regimeName = typeof regime === 'string' ? regime : 'custom';
  const forced = new Set(famineAt || []);

  // The seasonal multiplier at period p ∈ [0,1]: a base ration modulated by a slow
  // cosine (the seasons), with periodic famines punched in on a fixed cadence — and
  // any operator-forced famine. A cosine keeps the peaks (plenty) recurring, which is
  // the structural guarantee of exploration slack: the lean season is never permanent.
  const multiplier = (p) => {
    if (forced.has(p)) return shape.famineFloor;
    if (shape.famineEvery > 0 && p > 0 && p % shape.famineEvery === 0) return shape.famineFloor;
    if (shape.amp === 0) return shape.base;
    const wave = shape.base + shape.amp * Math.cos((2 * Math.PI * p) / Math.max(1, shape.cycle));
    return Math.max(shape.famineFloor, Math.min(1, wave));
  };

  // season(p) — the world at period p: how much energy is on the table, and its name.
  const season = (p = 0) => {
    const mult = multiplier(p | 0);
    const budget = ration * mult;
    return Object.freeze({ period: p | 0, regime: regimeName, mult: round(mult), budget: round(budget), name: seasonName(mult) });
  };

  // A spend ledger for one period: charge against the season's budget, and know when
  // the organism has been starved (spent its whole ration and still needs to act).
  const ledger = (p = 0) => {
    const s = season(p);
    let spent = 0;
    const bill = { model: 0, tokens: 0, time: 0, fetch: 0, storage: 0 };
    return {
      season: s,
      charge(spend) {
        for (const k of Object.keys(bill)) bill[k] += Number(spend[k]) || 0;
        const e = energyOf(spend, costs);
        spent += e;
        return e;
      },
      get spent() { return round(spent); },
      get bill() { return { ...bill }; },
      remaining() { return round(s.budget - spent); },
      // fraction of the ration still available — the headroom the exploration slack
      // is gated on. ≤0 means starved: the organism overspent the world's gift.
      headroom() { return s.budget > 0 ? Math.max(0, (s.budget - spent) / s.budget) : 0; },
      starved() { return spent >= s.budget; },
    };
  };

  return Object.freeze({
    regime: regimeName,
    ration,
    costs,
    season,          // the world at a period (pure)
    ledger,          // a chargeable spend-book for a period
    energyOf: (spend) => energyOf(spend, costs),
    // is this period one the world starves the organism in? (before any spend)
    isFamine: (p = 0) => season(p).name === 'famine',
  });
};

const round = (x) => Math.round(x * 1000) / 1000;
