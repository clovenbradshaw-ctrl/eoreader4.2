// EO: EVA·SIG(Network → Lens, Tracing,Binding) — predict next move (navigate)
// Direction — "a sense of where we're going", as p(next) over the SELF.
//
// The arc plans its sections from retrieved evidence; a continuation has no
// retrieval to plan from — it has its own becoming. So the direction is the
// forward move-distribution (predict/predictor.js) run over a move-log built
// from the units generated SO FAR. This is spec-generation.md Piece 3's source
// switch: the same predictor the reader uses, pointed at self instead of doc.
//
// THE WELD (docs/long-generation.md). Each accepted unit carries the floor's
// verdict; we read it back as the per-cursor STRAIN the structural prior reads
// (predict/structure.js): a unit that drifted (low bound fraction) raises strain,
// so the next draw leans toward REC/VOID — the engine that starts confabulating
// stops itself. strain = 1 − boundFraction; the structural prior does the rest.

import { predictNextMove } from '../../perceiver/predict/predictor.js';
import { MOVE_ALPHABET } from '../../perceiver/predict/movelog.js';
import { applyPhaseBias } from './shape.js';

// The move the loop opens with when there is no self-history yet: CON, the
// workhorse grounded move (assert a relation tied to a span). A draw cannot run
// over an empty log, so the first step is seeded rather than predicted. Under the
// significance arc the OPEN phase sets terms, so `seedMove` lets the loop seed DEF
// instead — an essay opens by defining, not by asserting a bare relation.
export const SEED_MOVE = 'CON';

// Build the self move-log the predictor runs over. One move per accepted unit —
// the move-type it realized — and a frame per cursor whose strain is read back. Two
// strain sources, and they are DIFFERENT things (essay-backwards):
//
//   drift strain      = 1 − boundFraction. The FLOOR's grounding verdict. High when
//                       the model confabulated. In the live loop this is ~0 on every
//                       APPENDED unit (the floor drops or re-binds drift), so on its
//                       own it never licenses a REC — the turn is dead.
//   semantic strain   = how far this unit's content has moved from the frame the
//                       opening set (a lexical self-fold, `opts.semanticStrain`). High
//                       where the grounded, developed material STRAINS the frame — an
//                       argument's turn, which happens on clean-binding prose. This is
//                       the first cut of "read self back through the perceiver"
//                       (spec-generation.md); the full form reads the accepted prose
//                       back through the document reader.
//
// The ratio the structural prior reads is the MAX of the two: a turn fires REC whether
// it came from a grounding break or from the argument straining its own frame.
export const selfMoveLog = (units = [], opts = {}) => {
  const moves = units.map((u, i) => Object.freeze({
    op: u.move || SEED_MOVE,
    cursor: i,
    i,
  }));
  // The running self-fold — the content words said SO FAR. Strain at cursor i is how
  // much new direction unit i opens against everything before it. Accumulated causally:
  // the novelty of unit i is measured against units 0..i−1 only, never itself or later.
  const useSemantic = !!opts.semanticStrain;
  const seen = new Set();

  // The field-read strain (docs/generation-by-field-reading.md), when the caller has
  // read the accepted atoms back as a density field: strainByCursor[i] = 1 at a turn (a
  // void-cleared atmosphere/paradigm boundary). It is the principled form of the lexical
  // self-fold below and OVERRIDES it when present — the real density departure, not a
  // spelling proxy.
  const field = opts.strainByCursor || null;

  const frameByCursor = units.map((u, i) => {
    const bf = typeof u.boundFraction === 'number' ? u.boundFraction : 1;
    const driftStrain = clamp01(1 - bf);     // the floor's verdict read back
    let semStrain = 0;
    if (field) {
      semStrain = clamp01(field[i] || 0);    // the field boundary IS the strain
    } else if (useSemantic) {
      const w = contentWords(unitText(u));
      semStrain = i === 0 ? 0 : noveltyVs(w, seen);  // the opener sets terms, never a turn
      for (const t of w) seen.add(t);                // the fold grows AFTER the measure
    }
    const strain = Math.max(driftStrain, semStrain);
    return Object.freeze({
      ratio: strain,
      // a clean unit reads as a live (non-flat) field; a fully-drifted unit reads
      // as flat so the structural prior also nudges NUL/VOID, not only REC.
      bayes: bf > 0.5 ? 1 : 0,
      newFigure: (u.sources || []).length > 0,
      brokeHere: false,
    });
  });
  return { moves, frameByCursor, alphabet: MOVE_ALPHABET };
};

// A unit's text for the self-fold — its rendered prose, falling back to its sub-claim.
const unitText = (u) => String(u?.text || u?.subClaim || '');

// Content words: lowercased word runs, stopwords and very short tokens dropped, so the
// novelty measure reads topical drift, not function-word churn.
const STOP = new Set(('the a an of to in on at by for and or but is are was were be been ' +
  'it its this that these those with as from into over under about not no so than then ' +
  'they them their we our you your he she his her i me my one two more most such what which ' +
  'who whom whose when where why how all any each every some out up down off').split(' '));
const contentWords = (s) => {
  const out = new Set();
  for (const m of String(s).toLowerCase().match(/[a-z][a-z']{2,}/g) || []) {
    if (!STOP.has(m)) out.add(m);
  }
  return out;
};

// Novelty of a word set against the running self-fold: the fraction of this unit's
// content words that have NOT been said before. 1 = an all-new direction (a turn);
// 0 = pure restatement (the routine body). Empty unit → 0 (nothing to turn on).
const noveltyVs = (words, seen) => {
  if (!words.size) return 0;
  let fresh = 0;
  for (const w of words) if (!seen.has(w)) fresh++;
  return fresh / words.size;
};

// Predict the next move from the self-history. Returns the drawn move, the ranked
// posterior, the sharpness, and `flat` — the predictor's flat posterior, the honest
// "no grounded expectation of what comes next" that QUIESCES the loop (spec-planner.md
// §2: quiesce is the navigation declining to deposit, NOT a VOID-site move).
//
// temperature is the quantile up the surprise distribution (spec-generation.md):
// 0 (default) is argmax — the low-surprise draw that stays in frame; > 0 reaches
// further up for a deliberate move. The reach is a rank index into the posterior,
// so "more surprising" is calibrated, not a guess.
//
// `phaseBias` (spec-planner.md §8) is the significance arc's lean — a multiplicative
// reweighting of the posterior toward the current phase's operators (open→DEF/INS,
// develop→CON/EVA, land→SYN) applied BEFORE the temperature reach, so the phase
// shapes which operator the reach lands on. The operator is still drawn, never
// dictated: a near-zero move stays near zero and a dominant weld signal survives.
export const predictDirection = (units = [], opts = {}) => {
  if (units.length === 0) {
    return { move: opts.seedMove || SEED_MOVE, seeded: true, flat: false, sharpness: null, posterior: null };
  }
  const log = selfMoveLog(units, { semanticStrain: opts.semanticStrain, strainByCursor: opts.strainByCursor });
  const i = log.moves.length - 1;            // predict the move AFTER the last unit
  const pred = predictNextMove(log, i, { weights: opts.weights });

  // The significance-arc lean, when a phase bias is given (§8) — reweight, renormalise.
  const posterior = opts.phaseBias
    ? applyPhaseBias(pred.posterior, opts.phaseBias)
    : pred.posterior;

  // The temperature draw: reach `temperature` ranks up the (descending) posterior,
  // clamped to the alphabet. T=0 → rank 0 → argmax. Deterministic given T, so a
  // run is reproducible (no RNG in this layer — Math.random is unavailable here).
  const reach = Math.max(0, Math.min(posterior.length - 1, Math.round(opts.temperature || 0)));
  const move = posterior[reach][0];

  return {
    move,
    seeded: false,
    flat: pred.flat,
    sharpness: pred.sharpness,
    concentration: pred.concentration,
    posterior,
    top: posterior[0][0],
  };
};

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
