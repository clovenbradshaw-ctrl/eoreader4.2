// EO: EVA·SEG(Network → Lens,Network, Tracing,Unraveling) — controls / falsification
// The controls — falsify the predictor, the same discipline as the music shuffle.
//
//   persistence    is the predictor better than "next move = last move"?
//   recurrence-only the bare n-gram baseline — does structure+grammar beat it?
//   shuffle        scramble the move order; accuracy must collapse to chance. If a
//                  shuffled log predicts as well as the real one, the predictor is
//                  reading marginal operator frequencies, not the sequence.
//
// Plus scoreSeries: run the predictor across every position and aggregate top-1
// accuracy, mean reciprocal rank, mean sharpness, and mean surprisal — the numbers
// the readouts and the tests turn on.

import { predictNextMove } from './predictor.js';

// Run the predictor across all scorable positions (0 … len−2) and aggregate. Extra
// `opts` (weights, grammar) pass straight through to predictNextMove, so the same
// function scores the full fusion or any ablation.
export const scoreSeries = (moveLog, opts = {}) => {
  const n = moveLog.moves.length;
  let top1 = 0, mrrSum = 0, sharpSum = 0, surpSum = 0, scored = 0, flatCount = 0;
  const perPosition = [];
  for (let i = 0; i < n - 1; i++) {
    const p = predictNextMove(moveLog, i, opts);
    scored += 1;
    if (p.correctTop1) top1 += 1;
    mrrSum += 1 / p.rank;
    sharpSum += p.sharpness;
    surpSum += p.surprisalBits;
    if (p.flat) flatCount += 1;
    perPosition.push(p);
  }
  return {
    scored,
    accuracy: scored ? top1 / scored : 0,
    mrr: scored ? mrrSum / scored : 0,
    meanSharpness: scored ? sharpSum / scored : 0,
    meanSurprisalBits: scored ? surpSum / scored : 0,
    flatRate: scored ? flatCount / scored : 0,
    perPosition,
  };
};

// The persistence baseline: predict the next move equals the last move's op. The
// floor a structural predictor must clear.
export const persistenceAccuracy = (moveLog) => {
  const { moves } = moveLog;
  let correct = 0, scored = 0;
  for (let i = 0; i < moves.length - 1; i++) {
    scored += 1;
    if (moves[i].op === moves[i + 1].op) correct += 1;
  }
  return { scored, accuracy: scored ? correct / scored : 0 };
};

// The marginal-frequency baseline: always predict the single most common op. The
// chance level a SHUFFLED log should not beat — and that a real predictor reading
// the sequence should.
export const marginalAccuracy = (moveLog) => {
  const counts = {};
  for (const m of moveLog.moves) counts[m.op] = (counts[m.op] || 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  let correct = 0, scored = 0;
  for (let i = 0; i < moveLog.moves.length - 1; i++) {
    scored += 1;
    if (moveLog.moves[i + 1].op === top) correct += 1;
  }
  return { scored, accuracy: scored ? correct / scored : 0, top };
};

// A seeded shuffle (Fisher–Yates over a small LCG) so the control is reproducible.
const lcg = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
export const shuffleMoves = (moveLog, seed = 1) => {
  const rnd = lcg(seed >>> 0 || 1);
  const moves = moveLog.moves.map((m, i) => ({ ...m, i }));
  for (let i = moves.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [moves[i], moves[j]] = [moves[j], moves[i]];
  }
  // Reindex positions; the frame state stays keyed by the move's ORIGINAL cursor, so
  // the structural prior reads the same per-unit fold — only the ORDER is destroyed,
  // which is exactly the sequence information the shuffle is meant to remove.
  moves.forEach((m, i) => { m.i = i; });
  return { ...moveLog, moves };
};
