// EO: SIG·SEG(Entity → Field, Tending·Clearing) — the hidden horizon
// metabolism/horizon.js — the structurally hidden endgame.
//
// A repeated game holds cooperation only under the SHADOW OF THE FUTURE. The instant a player
// can compute its own last round, backward induction unravels cooperation from the end: defect
// on the final round (no future left to punish you), therefore defect on the second-to-last
// (the last is already lost), and the whole chain collapses to defection. Stable predation and
// stable collusion are equilibria of the very same game — the folk theorem says cooperation is
// REACHABLE, never that it is selected. So the endgame must be ENGINEERED AWAY, not hoped away:
// pruning and starvation arrive without a countdown, and NO genome can compute its own final
// period. There is no end to induct backward from.
//
// Replay-stable, not truly random: the hazard is a deterministic function of (id, period, seed)
// ONLY — decorrelated from anything the organism controls or observes about itself — so a
// replayed log reproduces the same survivals, yet no organism can predict its own from its own
// state. That is the whole trick: HIDDEN from the player, DETERMINED for the record. The fuel
// gauge is probabilistic; the endgame is unreachable by the strategy that would exploit it.

// createHorizon — a probabilistic continuation. `delta` is the per-period survival probability,
// the literal shadow of the future: higher delta → a longer expected game → more room for
// cooperation to be the rational equilibrium. There is deliberately NO lastRound() to call.
export const createHorizon = ({ delta = 0.92, seed = 0x9e3779b9 } = {}) => {
  const d = Math.max(0, Math.min(0.999, delta));
  return Object.freeze({
    hidden: true,
    delta: d,
    // does organism `id` continue past `period`? A hazard draw it cannot compute in advance.
    continues: (id, period) => hash01(`${id}:${period}:${seed}`) < d,
    // the EXPECTED remaining horizon — all anyone is allowed to know. E[depth] = d/(1-d).
    meanDepth: () => (d >= 1 ? Infinity : round(d / (1 - d))),
    // the load-bearing negative: you cannot compute your own last round, because there isn't one to compute.
    canComputeLastRound: () => false,
  });
};

// knownHorizon — the CONTROL, the architecture to AVOID: a fixed, computable last round. With
// it, a rational player backward-inducts straight to defection. It exists only so a falsifier
// can show the hidden horizon sustaining exactly what the known one unravels. Do not deploy it.
export const knownHorizon = (finalPeriod = 20) => Object.freeze({
  hidden: false,
  finalPeriod,
  continues: (_id, period) => period < finalPeriod,
  lastRound: () => finalPeriod,          // the fatal affordance — a computable endgame
  canComputeLastRound: () => true,
});

// hash01 — FNV-1a → [0,1). Deterministic, dependency-free; the same hash family the rest of the
// system uses for identity, here used for a replay-stable hazard the organism cannot anticipate.
const hash01 = (str) => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return (h >>> 0) / 4294967296;
};
const round = (x) => Math.round(x * 1000) / 1000;
