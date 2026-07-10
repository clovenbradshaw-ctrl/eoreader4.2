// EO: EVA·SEG(Lens,Network → Lens,Atmosphere, Binding·Tracing·Dissecting) — the objective
// metabolism/lift.js — the fitness function, stated so it only rewards what can improve.
//
// Three things produce an answer: the surfer (the scaffolding — retrieval, grounding, fold,
// allocation, and a leashed prompt), the frozen local model (fixed physics, not an organism),
// and the frontier judge (the environment). Only the surfer evolves. So the objective must
// ISOLATE that one axis, or evolution takes credit for the model and is misled by tasks the
// model would have nailed bare. The goal is not "produce good readings." It is: carry a fixed
// weak model as far as a better substrate can carry it.
//
// Fitness is a LIFT, not a LEVEL:  quality(surfer + frozen model) − quality(frozen model bare),
// divided by the resource spent. Subtracting the bare score removes the part evolution cannot
// change. The A/B scaffolding-lift the toggle already read, promoted from an experiment to the
// fitness function. The surfer is the organism; the local model is the transducer it works
// through; the frontier judge sets the ceiling and audits.
//
// THE FALSIFIER — transfer across frozen models. This is what separates "the surfer got
// better" from "the prompt got tuned." A genuine surfer gain lifts a SECOND, different frozen
// local model too; a prompt hack only helps the one it was shaped against. So a survivor's
// kept fitness is what survives a swap of the leaf — the weaker of its lifts on two frozen
// models. Prompt-overfit collapses to ~0 and is filtered. The talker/grounder split stops
// being a doctrine you enforce and becomes a selection pressure that enforces itself:
// anything that grew intelligence in the leaf's ear dies when the leaf is swapped. No rule
// that "the prompt may only improve a little" is needed — the transfer test caps it for you.

const EPS = 1e-6;

// liftOf(withSurfer, bare) — raw lift: what the surfer added on top of the frozen model's
// bare output. May be negative (a surfer that hurts). The subtraction is the whole point.
export const liftOf = (withSurfer, bare) => round(clampq(withSurfer) - clampq(bare));

// gapClosed(withSurfer, bare, ceiling) — the fraction of the ACHIEVABLE gap the surfer
// closed: (withSurfer − bare) / (ceiling − bare). Scale-free; 1 = reached the frontier
// ceiling, 0 = added nothing, <0 = made it worse. The ceiling is the judge's reference
// reading scored on faithfulness-to-source (checkable), not the judge's free opinion — so a
// task the model already nails (gap ≈ 0) earns no credit, however high the absolute score.
export const gapClosed = (withSurfer, bare, ceiling) => {
  const gap = clampq(ceiling) - clampq(bare);
  if (gap <= EPS) return 0;                    // nothing to close → no credit for the model's own competence
  return round((clampq(withSurfer) - clampq(bare)) / gap);
};

// liftFitness({ withSurfer, bare, resource, ceiling? }) — the stated fitness: lift per unit
// resource. With a `ceiling`, the numerator is the scale-free gap-fraction; without one, the
// raw lift. Only POSITIVE lift pays the resource tax (cheaper lift is fitter); a hurtful
// surfer keeps its full negative score so it can never be flattered by having spent little.
export const liftFitness = ({ withSurfer = 0, bare = 0, resource = 0, ceiling = null } = {}) => {
  const num = ceiling == null ? liftOf(withSurfer, bare) : gapClosed(withSurfer, bare, ceiling);
  return round(num > 0 ? num / (Math.max(0, resource) + 1) : num);
};

// ── The transfer falsifier ───────────────────────────────────────────────────
// TRANSFER_FLOOR — the boundary of a CREDITABLE transferable gain: a lift must clear it on BOTH
// frozen models to count as real rather than prompt-overfit. It is also the conservative PRIOR
// for any un-evidenced transferable quantity: before measurement, a gain is worth only what just
// barely transfers — the floor itself. So the Void-respect born prior sits HERE (fitness.js reads
// it): a held thread is worth, a priori, the worst-case transferable minimum, and nothing beyond
// it until the measured kept lift (the min across two frozen models) proves the transfer. This is
// the one remaining prior, named and tied to its meaning — not a free parameter someone dialed.
export const TRANSFER_FLOOR = 0;

// transfers(liftA, liftB) — did the gain survive the leaf swap? Both frozen models must be
// lifted above the floor. keptFitness — what you actually keep: the weaker lift, so a gain
// on one model that fails on the other is capped at the failing one (≈ 0 for a prompt hack).
export const transfers = (liftA, liftB, { floor = TRANSFER_FLOOR } = {}) => liftA > floor && liftB > floor;
export const keptFitness = (liftA, liftB) => round(Math.min(liftA, liftB));

// transferReading({ modelA, modelB, floor }) — the full verdict for a survivor run on two
// held-out frozen models. Each of `modelA`/`modelB` is a { withSurfer, bare, resource, ceiling? }.
// `overfit` surfaces how much of A's apparent gain failed to transfer — the prompt tax, visible.
export const transferReading = ({ modelA = {}, modelB = {}, floor = TRANSFER_FLOOR } = {}) => {
  const a = liftFitness(modelA), b = liftFitness(modelB);
  return Object.freeze({
    liftA: a, liftB: b,
    kept: keptFitness(a, b),
    transfers: transfers(a, b, { floor }),
    overfit: round(Math.max(0, a - b)),
  });
};

// ── The dual economy (slow true signal vs fast proxy) ─────────────────────────
// The frontier judge is expensive, so it is the SLOW true signal, not the per-candidate one.
// Proxy-select most of the tournament on cheap internal observables (coherence, bind-fraction,
// cost); spend judge calls on the survivors and to periodically RE-ANCHOR the proxy so it has
// not drifted from truth. `estimate` scores a lift from observables alone (no API); `reanchor`
// nudges the proxy's scale toward the judge whenever a true reading arrives for a candidate the
// proxy also scored. The proxy runs the day-to-day; the judge sets the target and audits.
export const createProxy = ({ alpha = 0.1, scale = 1 } = {}) => {
  let k = scale;
  return Object.freeze({
    estimate: ({ withSurfer = 0, bare = 0, resource = 0, ceiling = null } = {}) =>
      liftFitness({ withSurfer: k * withSurfer, bare, resource, ceiling }),
    // trueLift is the judge's lift for the same candidate; proxyLift is what estimate() gave.
    reanchor: (proxyLift, trueLift) => {
      if (proxyLift > EPS && Number.isFinite(trueLift)) k = round((1 - alpha) * k + alpha * k * (trueLift / proxyLift));
      return k;
    },
    scale: () => k,
  });
};

// ── The objective, wired into the ecology ─────────────────────────────────────
// liftWorld — a world-model for population.js that scores LIFT, not level. It plugs into the
// ecology's existing injectable `world` seam, so the competitive population optimizes the
// right objective with NO change to population.js. `bare(alloc, season) → q0` is the frozen
// model's bare quality (no surfer); `surfer(alloc, season) → q1` is the scaffolded quality.
// The world's `quality` becomes the lift q1 − q0, and the ecology's efficiency = lift/energy
// is exactly lift-per-resource. `calibrate` folds a real turn's observed lift toward truth.
export const liftWorld = ({
  bare = () => 0.55,          // the frozen model alone — fixed physics; the baseline to beat
  surfer = null,             // the scaffolded quality; defaults to a saturating response to effort
  gain = 1.0,                // learned lift-per-effort multiplier (calibrated by real turns)
} = {}) => {
  let g = gain;
  const scaffold = surfer || ((alloc) => {
    const warm = alloc.modelGate < 0.55 ? 1 : 0;
    const effort = 0.5 * warm + 0.3 * norm(alloc.maxTokens, 96, 512) + 0.2 * norm(alloc.retrieveK, 2, 12);
    return 0.62 + 0.38 * (1 - Math.exp(-3 * effort));
  });
  const evaluate = (alloc, season) => {
    const q0 = clampq(bare(alloc, season));
    const q1 = clampq(scaffold(alloc, season));
    const lift = Math.max(0, (q1 - q0)) * g;      // the surfer's contribution — what evolves
    const warm = alloc.modelGate < 0.55 ? 1 : 0;
    const spend = { model: warm, tokens: warm ? alloc.maxTokens : 0, time: warm ? 8 : 1.2, fetch: alloc.retrieveK, storage: 0 };
    return { quality: round(lift), spend };       // quality IS lift → efficiency IS lift/resource
  };
  // calibrate — nudge the lift-per-effort toward what a real turn actually paid. The caller
  // passes the observed lift (with-surfer minus bare on the real turn), not the raw level.
  const calibrate = (real = {}) => {
    const l = Number(real.lift ?? (real.withSurfer != null ? real.withSurfer - (real.bare ?? 0) : real.quality));
    if (Number.isFinite(l) && l > 0) g = round(0.9 * g + 0.1 * Math.max(0.1, Math.min(3, l / 0.3)));
    return g;
  };
  return { evaluate, calibrate, get gain() { return g; } };
};

const clampq = (x) => (Number.isFinite(+x) ? Math.max(0, Math.min(1, +x)) : 0);
const norm = (x, lo, hi) => Math.max(0, Math.min(1, (x - lo) / (hi - lo)));
const round = (x) => Math.round(x * 1000) / 1000;
