// EO: EVA(Lens,Field → Atmosphere, Tending) — structural prior, Phase 2
// Phase 2 — the structural prior, from the fold. The active frame shapes which
// move is licensed and likely next, computed from the log state at the cursor.
//
// This is the prior recurrence cannot carry: a count over the operator stream does
// not know that a term is strained near threshold, that a figure just entered, that
// the field has gone flat. The fold does. At each cursor the reading maintains a
// frame (core/enacted/loop.js) with a running strain against a REC threshold, a γ-mass
// surprise, and a record of what just entered. The structural prior reads that
// state and bends the distribution over the next move toward what the frame
// licenses — no model, only the reading's own standing commitments:
//
//   strain near threshold      → REC becomes probable (the break is coming)
//   a new figure just entered  → SIG / CON probable (attribute it, bond it)
//   a term was just asserted   → EVA probable (test the particular against it)
//   the figure field is flat   → NUL / VOID probable (hold; assert nothing here)
//   otherwise                  → the routine body of reading (INS·SIG·CON·EVA·SEG)
//
// The output is a normalised distribution over the alphabet with a floor on every
// symbol, so the product with the other priors never zeroes a move out.

const FLOOR = 0.01;                 // every move keeps this much mass (no hard zeros)
const ROUTINE = ['INS', 'SIG', 'CON', 'EVA', 'SEG', 'DEF'];

// Tunables — the weights on each structural rule. Measured against the worked
// example to be sharp on the routine and decisive at the REC without drowning the
// others. The REC weight is large because it must overcome the recurrence and
// grammar bigrams, which (rightly) say the common continuation of an EVA is the next
// cursor's INS — only the strain knows THIS EVA is the one that breaks the frame.
const W = Object.freeze({
  rec: 7.0,        // mass added to REC, scaled by strain² — decisive near a break
  flat: 1.8,       // mass added to NUL+VOID when the field is flat
  newFig: 0.3,     // a gentle nudge to SIG+CON after a figure enters (recurrence leads)
  def: 0.3,        // a gentle nudge to EVA after a term is asserted (recurrence leads)
  routine: 1.0,    // baseline mass on the routine body (decays as strain rises)
});
const FLAT_BAYES = 0.12;            // γ-mass surprise below this reads as a flat field
const LOW_STRAIN = 0.35;            // strain ratio below this is "not near a break"

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// The structural distribution for the move after position `i` in `moves`.
// `ctx.frameByCursor` is the per-unit fold state from buildMoveLog. Causal: it
// reads only the frame as of moves[i].cursor and the local move context.
export const structuralPrior = (moves, i, ctx, alphabet) => {
  const add = Object.fromEntries(alphabet.map(op => [op, FLOOR]));

  const here = moves[i];
  const frame = (ctx.frameByCursor || [])[here?.cursor] || { ratio: 0, bayes: 0, newFigure: false };
  const lastOp = here?.op;
  const ratio = clamp01(frame.ratio || 0);
  const flat = (frame.bayes ?? 0) < FLAT_BAYES && !frame.newFigure && ratio < LOW_STRAIN;

  // The routine body — most moves are perception and testing — but it gives way as
  // the frame nears a break: a reading whose terms are failing is not calmly
  // instantiating the next figure, it is about to restructure. So routine mass holds
  // at full through the moderate strain of an ordinary build-up (a knee at half the
  // threshold) and then decays to nothing as the ratio approaches a break, ceding the
  // field to REC exactly where the frame breaks — and only there, so a holding frame
  // is unaffected and the routine-cursor accuracy is not paid for the break.
  const routineW = W.routine * (1 - clamp01((ratio - 0.5) * 2));
  for (const op of ROUTINE) add[op] += routineW;

  // REC: licensed by accumulated strain — but only right after an EVA, because in
  // the move stream a restructuring follows the evaluation that broke the frame
  // (…EVA→REC), never a content SEG or CON mid-cursor. So the boost fires when the
  // reading has just evaluated and the strain is high, and rises with the strain
  // ratio so the break is anticipated before it fires; near zero on a holding frame.
  if (lastOp === 'EVA') add.REC += W.rec * ratio * ratio;

  // A flat field: the engine expects to find nothing here — hold (NUL) or assert
  // the absence (VOID). The structural VOID that keeps the predictor honest.
  if (flat) { add.NUL += W.flat; add.VOID += W.flat * 0.6; }

  // A figure just entered: attribute it (SIG) and bond it (CON) next.
  if (lastOp === 'INS' || frame.newFigure) { add.SIG += W.newFig; add.CON += W.newFig; }

  // A term was just asserted: test the next particular against it (EVA).
  if (lastOp === 'DEF') add.EVA += W.def;

  // A bond/attribution often closes a clause the reading then evaluates.
  if (lastOp === 'CON' || lastOp === 'SIG') add.EVA += W.def * 0.5;

  let Z = 0;
  for (const op of alphabet) Z += add[op];
  const dist = {};
  for (const op of alphabet) dist[op] = add[op] / Z;
  return dist;
};
