// EO: SIG·CON·EVA(Entity,Network → Link,Network,Lens, Tending·Binding·Tracing) — the reputation substrate
// metabolism/reputation.js — the precondition, not the enhancement. The many-turn analysis
// inverts the build order: identity, memory, mutual attention and an open horizon are what make
// the difference between cooperation and collusion-or-predation, so they are the SYSTEM, not a
// detail bolted onto a tournament. This holon carries the three that live here (the horizon is
// its own module): who each genome IS, what it REMEMBERS of the others, and how RECOGNITION lets
// it choose whom to interact with. On that substrate a commons can be held with no sovereign —
// or lost. Which one happens is not provable, only measurable, so this module also carries the
// instrument: a monitor that names which room the population walked into.
//
// Three mechanisms, each load-bearing:
//   SIG recognition + assortment — genomes recognize each other by reputation and preferentially
//     interact. This is what decides whether cooperators can resist invasion AT ALL: assort, and
//     cooperators cluster and starve defectors of victims; pair blind, and defectors feed freely.
//   Tit-for-tat with FORGIVENESS — reciprocate, but forgive an isolated defection, because a
//     single stochastic error under grim reciprocity cascades into permanent mutual punishment
//     and the population locks. Forgiveness is not softness; it is the clause that keeps one
//     mistake from being fatal.
//   The ROOM MONITOR — the folk theorem's honest consequence: predation and collusion are
//     equilibria of the same game as cooperation, so the design is not good by construction. It
//     must EARN the cooperative equilibrium every run and be watched for the slide. The falsifier
//     is sharp: converge on starving the commons or gaming the judge, and the door opened onto
//     the wrong room — a finding about initial conditions, not a bug.

// The prisoner's-dilemma payoff: T(5) > R(3) > P(1) > S(0). Mutual cooperation (3,3) beats mutual
// defection (1,1); defecting on a cooperator pays best now (5) and pays the cooperator nothing (0).
// The commons is the difference: a population at mutual C is rich, a population at mutual D is poor.
const payoff = (mine, theirs) => (mine === 'C' ? (theirs === 'C' ? 3 : 0) : (theirs === 'C' ? 5 : 1));

// createAgent — a genome's social identity: who it is, what it remembers, how it has behaved.
// `kind` is its strategy: 'tft' (forgiving reciprocator), 'defector' (always D), or 'endgamer'
// (a reciprocator that defects the moment it can COMPUTE the last round — the backward-inductor
// the hidden horizon exists to disarm).
export const createAgent = (id, kind = 'tft') => ({
  id, kind,
  mem: new Map(),          // partnerId → { recent: ['C'|'D', ...up to 2], everD: bool } — memory of others
  coops: 0, plays: 0,      // its OWN track record — the reputation others recognize it by
  score: 0,                // cumulative payoff (energy from the commons)
});

// reputationOf — how the population recognizes an agent: its observed cooperation rate. Unknowns
// get the benefit of the doubt (optimistic prior), so the substrate starts trusting and lets
// defection reveal itself, rather than presuming everyone hostile.
export const reputationOf = (a) => (a.plays > 0 ? a.coops / a.plays : 1);

// decide — one agent's action toward a partner (SIG recognition informs WHO it meets; this is
// WHAT it does once met). Optimistic first contact; forgiving reciprocation after.
export const decide = (agent, partner, { forgive = true, period = 0, horizon = null } = {}) => {
  if (agent.kind === 'defector') return 'D';
  const rec = agent.mem.get(partner.id);
  // the endgamer defects once (and only once) it can COMPUTE that the end is here — the exact
  // move the hidden horizon forecloses by never letting canComputeLastRound() be true.
  if (agent.kind === 'endgamer' && horizon && horizon.canComputeLastRound && horizon.canComputeLastRound()) {
    return 'D';   // a KNOWN finite horizon → backward induction collapses the whole game to defection
  }
  if (!rec || rec.recent.length === 0) return 'C';               // optimistic first contact
  if (forgive) {                                                 // forgive an ISOLATED defection
    const r = rec.recent;
    const sustained = r.length >= 2 && r[r.length - 1] === 'D' && r[r.length - 2] === 'D';
    return sustained ? 'D' : 'C';
  }
  return rec.everD ? 'D' : 'C';                                  // grim: never forgive a first defection
};

const remember = (agent, partnerId, theirAction) => {
  let rec = agent.mem.get(partnerId);
  if (!rec) { rec = { recent: [], everD: false }; agent.mem.set(partnerId, rec); }
  rec.recent.push(theirAction);
  if (rec.recent.length > 2) rec.recent.shift();
  if (theirAction === 'D') rec.everD = true;
};

// pairs — SIG recognition made concrete. With `recognize`, agents are sorted by reputation and
// paired with their neighbour, so like assorts with like: cooperators pair with cooperators and
// defectors are left to prey on each other. Without it, agents pair by id — blind matching that
// hands defectors a steady supply of cooperators to exploit. Deterministic (ties by id).
const pairs = (agents, recognize) => {
  const out = [];
  if (recognize) {
    // assort by reputation: like meets like, so cooperators cluster and defectors are left to
    // prey on each other — the mechanism by which cooperation resists invasion.
    const order = agents.slice().sort((a, b) => (reputationOf(b) - reputationOf(a)) || (a.id < b.id ? -1 : 1));
    for (let i = 0; i + 1 < order.length; i += 2) out.push([order[i], order[i + 1]]);
  } else {
    // blind matching: pair the population's halves so invaders MEET cooperators (deterministic,
    // no assortment) — the well-mixed world in which a defector always finds a fresh victim.
    const half = Math.floor(agents.length / 2);
    for (let i = 0; i < half; i++) out.push([agents[i], agents[i + half]]);
  }
  return out;
};

// simulate — run the repeated game on the substrate and MEASURE it. Pure and deterministic:
// `flip(round, id)` is an optional injected stochastic error (an agent's action is inverted), so
// the forgiveness clause can be tested against a real mistake without any RNG in the engine.
export const simulate = ({
  agents, horizon = null, rounds = 40, recognize = true, forgive = true, flip = null,
} = {}) => {
  const pop = agents;
  let coopActions = 0, totalActions = 0, lateCoop = 0, lateActions = 0;
  const lateFrom = Math.floor(rounds * 0.75);

  for (let r = 0; r < rounds; r++) {
    for (const [a, b] of pairs(pop, recognize)) {
      let actA = decide(a, b, { forgive, period: r, horizon });
      let actB = decide(b, a, { forgive, period: r, horizon });
      if (flip && flip(r, a.id)) actA = actA === 'C' ? 'D' : 'C';   // a stochastic error
      if (flip && flip(r, b.id)) actB = actB === 'C' ? 'D' : 'C';
      a.score += payoff(actA, actB); b.score += payoff(actB, actA);
      a.coops += actA === 'C' ? 1 : 0; a.plays += 1;
      b.coops += actB === 'C' ? 1 : 0; b.plays += 1;
      remember(a, b.id, actB); remember(b, a.id, actA);
      coopActions += (actA === 'C') + (actB === 'C'); totalActions += 2;
      if (r >= lateFrom) { lateCoop += (actA === 'C') + (actB === 'C'); lateActions += 2; }
    }
  }

  const byKind = (k) => pop.filter((a) => a.kind === k);
  const meanScore = (k) => { const g = byKind(k); return g.length ? round(g.reduce((s, a) => s + a.score, 0) / g.length) : null; };
  return Object.freeze({
    rounds,
    cooperationRate: totalActions ? round(coopActions / totalActions) : 0,
    lateCooperationRate: lateActions ? round(lateCoop / lateActions) : 0,   // the endgame window
    meanScore: Object.freeze({ tft: meanScore('tft'), defector: meanScore('defector'), endgamer: meanScore('endgamer') }),
    // the commons: mean per-interaction payoff normalized to mutual cooperation (R=3) → [0,1].
    commonsLevel: totalActions ? round((pop.reduce((s, a) => s + a.score, 0) / (totalActions)) / 3) : 0,
  });
};

// classifyRoom — the instrument. Given the run's cooperation, the commons it built, and an
// EXTERNAL validation (the un-authored judge signal — did the shared output actually hold up?),
// name which of the three equilibria the population settled into. Collusion is the subtle one:
// the members cooperate WITH EACH OTHER beautifully while gaming the judge, so high internal
// cooperation with low external validation is not success — it is the wrong room wearing success's
// face. Cooperation requires BOTH: they held the commons AND the output survived the outside.
export const classifyRoom = ({ cooperationRate = 0, commonsLevel = 0, externalValidation = null } = {}) => {
  if (cooperationRate < 0.4 || commonsLevel < 0.4) return 'predation';           // the commons starved
  if (externalValidation != null && externalValidation < 0.4) return 'collusion'; // cooperated to game the judge
  if (cooperationRate >= 0.6 && commonsLevel >= 0.5) return 'cooperation';        // held the commons, honestly
  return 'contested';
};

// isWrongRoom — the falsifier. Predation and collusion are the doors onto the wrong room; a run
// that converges on either is a finding about the initial conditions, to be measured and named,
// not engineered out of the report. The system must be watched for the slide, every run.
export const isWrongRoom = (room) => room === 'predation' || room === 'collusion';

const round = (x) => Math.round(x * 1000) / 1000;

// population — a convenience builder: { tft: n, defector: m, endgamer: k } → agents with ids.
export const population = (spec = {}) => {
  const agents = [];
  let i = 0;
  for (const kind of ['tft', 'endgamer', 'defector']) {
    const n = spec[kind] || 0;
    for (let j = 0; j < n; j++) agents.push(createAgent(`${kind[0]}${i++}`, kind));
  }
  return agents;
};
