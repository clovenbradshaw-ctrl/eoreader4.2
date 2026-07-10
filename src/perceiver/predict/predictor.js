// EO: EVA·SYN(Network,Atmosphere → Lens,Void, Tracing,Composing) — fuse priors to posterior
// The predictor — fuse the three priors into a posterior over the next move.
//
// The next move's probability comes from three sources (§2 of the spec), over
// moves not tokens:
//
//   recurrence   the n-gram over this reading's log so far          (recurrence.js)
//   structure    the active frame from the fold                      (structure.js)
//   grammar      the small move-grammar, learned once, frozen        (grammar.js)
//
// The posterior is their product, normalised — a weighted geometric mean, so the
// weights are exponents and a weight of 0 drops a prior cleanly (used by the
// controls to run recurrence-only, or recurrence×structure). Sample its argmax to
// emit a predicted move; read its sharpness as confidence; read its flatness as the
// predictor's own VOID — no grounded expectation of what comes next.
//
// Strictly causal: the prediction at position i uses moves[0..i] (the recurrence
// prefix and the local context) and the fold state at moves[i].cursor — never a
// move after i. Scrubbing back recomputes from the shorter prefix; the future never
// informs the past.

import { recurrencePrior } from './recurrence.js';
import { structuralPrior } from './structure.js';
import { grammarPrior, DEFAULT_GRAMMAR } from './grammar.js';
import { MOVE_ALPHABET } from './movelog.js';

const DEFAULT_WEIGHTS = Object.freeze({ recurrence: 1, structure: 1, grammar: 1 });

// A posterior is "flat" — the predictor's VOID — when no move dominates: its
// entropy-based concentration falls below this. At a genuinely unpredictable point
// the three priors disagree, the product spreads, and the predictor declines to
// commit rather than emit a confident wrong move.
const FLAT_CONCENTRATION = 0.33;

// Predict the move after position `i` in a move-log (the object from buildMoveLog).
// Returns the posterior (ranked), the sharpness and flatness, the three component
// distributions, and — when there is a next move — its rank, surprisal, and whether
// it was the predicted top-1.
export const predictNextMove = (moveLog, i, opts = {}) => {
  const { moves, frameByCursor } = moveLog;
  const alphabet = moveLog.alphabet || MOVE_ALPHABET;
  const weights = { ...DEFAULT_WEIGHTS, ...(opts.weights || {}) };
  const grammar = opts.grammar || DEFAULT_GRAMMAR;

  const prefix = moves.slice(0, i + 1);                 // causal: up to and incl. i
  const rec = recurrencePrior(prefix, alphabet, opts.recurrence);
  const str = structuralPrior(moves, i, { frameByCursor }, alphabet);
  const gram = grammarPrior(moves[i]?.op, grammar, alphabet);

  // Product of the priors as a weighted geometric mean, then normalise.
  const post = {};
  let Z = 0;
  for (const op of alphabet) {
    const p = Math.pow(rec[op], weights.recurrence)
            * Math.pow(str[op], weights.structure)
            * Math.pow(gram[op], weights.grammar);
    post[op] = p;
    Z += p;
  }
  for (const op of alphabet) post[op] = Z > 0 ? post[op] / Z : 1 / alphabet.length;

  const ranked = alphabet.map(op => [op, post[op]]).sort((a, b) => b[1] - a[1]);
  const [topOp, topP] = ranked[0];

  // Sharpness — the headline confidence, the top-1 probability (the spec's number).
  // Concentration — the entropy-based spread, 0 (uniform) … 1 (a point mass); the
  // robust flatness signal the predictor's VOID reads.
  let H = 0;
  for (const [, p] of ranked) if (p > 0) H -= p * Math.log2(p);
  const Hmax = Math.log2(alphabet.length);
  const concentration = Hmax > 0 ? 1 - H / Hmax : 0;
  const flat = concentration < (opts.flatThreshold ?? FLAT_CONCENTRATION);

  const out = {
    i,
    cursor: moves[i]?.cursor ?? null,
    posterior: ranked,
    top: topOp,
    topP,
    sharpness: round3(topP),
    concentration: round3(concentration),
    entropy: round3(H),
    flat,
    components: { recurrence: rec, structure: str, grammar: gram },
  };

  // Score against the actual next move, when there is one.
  const actualMove = moves[i + 1] || null;
  if (actualMove) {
    const actual = actualMove.op;
    const rank = ranked.findIndex(([op]) => op === actual) + 1;
    const pa = Math.max(post[actual] ?? 0, 1e-9);
    out.actual = actual;
    out.actualMove = actualMove;
    out.rank = rank;
    out.correctTop1 = actual === topOp;
    out.surprisalBits = round3(-Math.log2(pa));
    out.surprise = surpriseBand(out.surprisalBits, out.correctTop1);
  } else {
    out.actual = null;
    out.actualMove = null;
  }
  return out;
};

// A coarse, human-readable surprise band for the panel.
const surpriseBand = (bits, top1) => {
  if (top1) return 'low';
  if (bits < 2.5) return 'medium';
  return 'high';
};

const round3 = (x) => Math.round(x * 1000) / 1000;
