// EO: DEF·EVA·REC·SEG(Field,Network,Atmosphere → Lens,Paradigm,Atmosphere, Tending·Tracing·Making·Composing·Dissecting) — evolutionary reward
// lineup/reward.js — reward the surfers, evolutionarily, without silencing a voice.
//
// The chorus is a population; the reward is its selection. But the fitness must resist the
// obvious Goodhart — reward step count and every voice learns to spam idle reaches — so it
// is signal PER UNIT SPEND, anchored the way metabolism/fitness.js anchors: what the chorus
// KEPT (signal.js), split among the voices that corroborated it, minus a tax on the noise a
// voice committed. A surfer that found one corroborated, grounded thing cheaply outscores
// one that committed twenty leads nobody could confirm.
//
// SELECTION WITHOUT EXTINCTION. A plain replicator would drive the lineup to monoculture —
// whichever temperament scored best this round crowds the rest out, and then the novel lead
// (ADHD) that FEEDS the closer (type A) is gone and the whole chorus goes blind. So selection
// runs against a DIVERSITY FLOOR (metabolism/homeostat.js's discipline): a fit temperament
// gets a deeper walk next round (its share rises → index.js grants it more steps), but no
// share falls below the floor. The falsifier is sharp and named: drop the floor to zero and
// the lineup collapses to one voice within a few rounds — measurable, not assumed away.
//
// THE ROOM MONITOR (metabolism/reputation.js classifyRoom). Cooperation is not guaranteed by
// construction. Voices could COLLUDE — corroborate each other's ungrounded reaches so
// everything reads as consensus signal while nothing is anchored to the world. That is high
// internal cooperation with low external validation, and it is the wrong room wearing
// success's face. So the reward measures the honest external check — how much of the kept
// signal was actually grounded (signal.groundedFraction) — and names the room every round.

import { classifyRoom } from '../../metabolism/index.js';

// reward — score the round and evolve the cast. Inputs:
//   surfers      [{ id, temperament, findings, spend }]  — spend includes any forage cost.
//   separation   the signal/noise split (signal.js): { signal, signalKeys, groundedFraction }.
//   prevShares   Map temperament → share (the cast that ran this round).
//   reputations  Map temperament → { coops, plays } — carried across rounds, mutated here.
//   floor        the diversity floor a share may never fall below.
//   eta          the replicator step size (how hard fitness moves the shares).
//   noiseTax     how much committed-but-unconfirmed work costs (the anti-Goodhart weight).
//   commonsLevel the source commons's built level — the shared habitat, for the room monitor.
export const reward = ({
  surfers = [], separation, prevShares, reputations = new Map(),
  floor = 0.05, eta = 1.5, noiseTax = 0.5, commonsLevel = 0, externalValidation = null,
} = {}) => {
  const signalKeys = separation?.signalKeys || new Set();
  // credit per signal entry, split among the voices that reached it (corroboration shares
  // the reward — no voice is paid twice for a finding two of them agreed on).
  const creditByKey = new Map();
  for (const e of (separation?.signal || [])) {
    creditByKey.set(e.key, { per: (e.weight || 0.2) / Math.max(1, e.consensus), voices: new Set(e.voices) });
  }

  const fitness = new Map();
  for (const s of surfers) {
    let contributed = 0, confirmed = 0, noiseVol = 0;
    for (const f of s.findings) {
      const inSignal = signalKeys.has(f.key);
      if (inSignal) {
        confirmed += 1;
        const c = creditByKey.get(f.key);
        if (c && c.voices.has(s.temperament)) contributed += c.per;
      } else {
        noiseVol += (1 - (f.weight || 0.2));   // an idle reach nobody kept costs the most
      }
    }
    const total = s.findings.length;
    const spend = Number.isFinite(s.spend) ? s.spend : total;
    const fit = round((contributed - noiseTax * noiseVol) / (spend + 1));
    // coopRate — the reputation others recognise it by: did its output hold up (get kept)?
    // Optimistic prior for a voice that committed nothing (reputation.js): benefit of the doubt.
    const coopRate = total ? round(confirmed / total) : 1;
    fitness.set(s.temperament, Object.freeze({
      fitness: fit, contributed: round(contributed), confirmed, total, noiseVol: round(noiseVol),
      spend, coopRate,
    }));
    // carry the reputation across rounds (mutated in place — the memory of the population).
    const rep = reputations.get(s.temperament) || { coops: 0, plays: 0 };
    rep.coops += confirmed; rep.plays += total;
    reputations.set(s.temperament, rep);
  }

  // ── selection: the replicator, against the diversity floor ──────────────────
  const names = [...prevShares.keys()];
  const fitOf = (n) => fitness.get(n)?.fitness ?? 0;
  const meanFit = names.reduce((m, n) => m + (prevShares.get(n) || 0) * fitOf(n), 0);
  const raw = new Map(names.map((n) => [n, (prevShares.get(n) || 0) * Math.exp(eta * (fitOf(n) - meanFit))]));
  let sum = 0; for (const v of raw.values()) sum += v;
  const norm = new Map();
  if (sum > 0) for (const [n, v] of raw) norm.set(n, v / sum);
  else for (const n of names) norm.set(n, 1 / names.length);
  // The diversity floor as a RESERVED allocation, not a post-hoc clamp: give every voice
  // `floor` up front, then distribute the remaining (1 - floor·n) by the replicator's weights.
  // This guarantees each share ≥ floor AND the shares sum to 1 — no voice goes extinct, and
  // (unlike clamp-then-renormalize) the renormalization cannot push a floored voice back under.
  const n = names.length;
  const shares = new Map();
  if (floor > 0 && floor * n < 1) {
    for (const [nm, v] of norm) shares.set(nm, round(floor + (1 - floor * n) * v));
  } else {
    for (const [nm, v] of norm) shares.set(nm, round(v));   // floor off (or infeasible) → the bare replicator
  }

  // ── the room monitor: cooperation, or the wrong room wearing its face ───────
  const coopRates = surfers.map((s) => fitness.get(s.temperament)?.coopRate ?? 1);
  const cooperationRate = coopRates.length ? round(coopRates.reduce((a, b) => a + b, 0) / coopRates.length) : 0;
  // externalValidation — did the kept signal hold up OUTSIDE the chorus (a foraged source
  // corroborated it)? null when there was no outside to check against (a graph-only round),
  // which tells classifyRoom to skip the collusion test rather than brand honest work colluding.
  const room = classifyRoom({ cooperationRate, commonsLevel, externalValidation });

  return Object.freeze({
    fitness, shares, reputations,
    room, cooperationRate, externalValidation,
    monoculture: round(1 - entropyOf([...shares.values()])),   // 0 = every voice equal, 1 = one voice
  });
};

// the share distribution's normalized entropy deficit — 0 when uniform (a full chorus), →1
// as it concentrates on one voice. The homeostat reads this to know if the floor is holding.
const entropyOf = (ps) => {
  const xs = ps.filter((p) => p > 0);
  if (xs.length <= 1) return 0;
  const h = -xs.reduce((a, p) => a + p * Math.log2(p), 0);
  return h / Math.log2(xs.length);
};

const round = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : 0);
