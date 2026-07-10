// EO: EVA(Field,Network → Lens,Atmosphere, Binding·Tracing·Tending) — the metabolic ratio
// metabolism/fitness.js — fitness as quality per unit resource, anchored against the
// one exploit that would otherwise eat the whole design.

import { TRANSFER_FLOOR, keptFitness } from './lift.js';
//
// Fitness is efficiency, and efficiency is only meaningful because the resource in
// the denominator is scarce. The numerator is quality — grounded claims delivered,
// the reading settled, the question actually answered. The denominator is energy —
// the single currency the five constraints convert into. Grounded claims per model
// call. Bound fraction per token. Settled reading per joule.
//
// GOODHART (the essay's first and fatal failure mode). If fitness is measured only on
// the system's INTERNAL signals — coherence, bind-fraction against its own fold — then
// the cheapest way to raise it is not to reason better but to CLAIM LESS AND CLAIM
// SAFER: emit only the trivially groundable, dodge the hard edge, inflate the ratio by
// shrinking ambition. That evolves a parasite: magnificently efficient at producing
// unfalsifiable, uninteresting, perfectly grounded pabulum. Two defenses, both here:
//   1. The numerator is (grounded work × COVERAGE). Coverage is how much of what was
//      ASKED got answered. Claiming less shrinks coverage, so it cannot win by dodging
//      — quality credits answering the question, not merely grounding whatever is easy.
//   2. An UN-AUTHORED ANCHOR. Part of fitness must rest on something the system cannot
//      author: an external correction rate, a downstream check, an adversarial verdict.
//      When present it dominates and fitness is `anchored`; when absent, fitness is
//      `provisional` and says so, because self-reported fitness is a hypothesis, not a
//      result. What you make the fitness of is what the organism becomes — so the hook
//      is prominent and its absence is surfaced, never silently treated as success.

// score — one turn's outcome → a fitness reading. Pure. All fields optional and
// defensively read, because the audit record shape varies by turn and path.
//
//   outcome = {
//     grounded, claimed,     // claims that bound / claims attempted (bind-fraction)
//     coherence,             // the reading's own coherence statistic (0..1)
//     covered,               // fraction of the ASK answered (0..1) — the anti-Goodhart term
//     delivered,             // did the turn produce a usable answer at all? (bool)
//     viable,                // did it complete within budget with validated work? (bool)
//     corrections,           // EXTERNAL: corrections applied downstream (lower is better)
//     predicted,             // EXTERNAL: held-out PREDICTION competency (0..1) — reality's own grade, no judge
//     validated,             // EXTERNAL: an un-authored pass/verdict (0..1), or null (fluency; a judge's taste)
//     endorsed,              // EXTERNAL: a HUMAN interaction's reward (0..1) — the strongest anchor
//     held,                  // unbound threads HELD OPEN this turn (Void-respect) — earns nothing now
//     groundedOnDelay,       // previously-held threads that bound THIS turn (retroactive credit)
//     heldForBinding,        // held threads that were candidates to bind — the spray baseline
//     spend,                 // { model, tokens, time, fetch, storage } charged this turn
//   }
//
// THE VOID-RESPECT TERM — the axis the clerk and the investigator finally come apart on. The old
// numerator scored only the Figure column (a bound claim), so it could not tell the two apart:
// confabulation FILLS the Void (a binding with no source — forbidden outright at the floor,
// organ.js / constitution.js), while Void-respect HOLDS a true-but-unbindable apprehension open
// until the world grounds it. It is breedable exactly one way, and only this way. You never
// reward the unbound claim — that is the confabulator, and it is unmeasurable besides. You never
// reward the HOLDING — that breeds the false vigil, the courtier who fakes patience with empty
// threads. You reward only the held thread that LATER BINDS, credited retroactively across the
// append-only log to the genome that kept it alive, and scaled by PRECISION over a spray baseline
// so holding-everything-cheaply cannot harvest coincidental bindings. A fabricated thread never
// binds; the delayed judge starves the liar and feeds the one who waited. Courage rendered as
// patience — and un-gameable, because faking it requires actually predicting the future.
//
// STRUCTURE frozen, MAGNITUDE measured (the Born-rule move). What is a preference a cheater would
// weaken — retroactive-only, precision-gated, that a held-then-bound thread is rewarded AT ALL —
// is frozen. But HOW MUCH one precise delayed binding is worth against a joule is NOT a hard
// constant anyone sets: a hand-picked weight is domain-blind, and a population-tuned weight gets
// optimized to zero (the clerk scores today). So the magnitude is `voidValue` — an EXCHANGE RATE
// read off the observed structure, calibrated from the UN-AUTHORED lift a held thread actually
// delivered (createFitness, below), capped by transfer so it cannot self-inflate. A small born
// PRIOR lets it bootstrap before evidence; every observation moves it toward measured reality.
// Neither the human's thumb nor the population's strategy — the world's measurement.
export const score = (outcome = {}, { energyOf, anchorWeight = 0.6, voidValue = 1 } = {}) => {
  const grounded = num(outcome.grounded);
  const claimed  = Math.max(grounded, num(outcome.claimed));
  const bindFraction = claimed > 0 ? grounded / claimed : 0;
  const coherence = clamp01(outcome.coherence, 0.5);
  // COVERAGE — the anti-dodge term. Default 1 only when the turn actually delivered;
  // a non-delivering turn covers nothing, so silence cannot score as thrift.
  const covered = outcome.delivered === false ? 0 : clamp01(outcome.covered, 1);

  // The AUTHORED quality — what the system can compute about itself. Grounded work,
  // weighted by how much of the ask it answered and how coherent the reading was.
  // Coverage multiplies, so claiming less to look grounded lowers quality, not raises it.
  const authoredQuality = (grounded > 0 ? grounded : (outcome.delivered ? 0.5 : 0))
    * covered
    * (0.5 + 0.5 * coherence)
    * (0.5 + 0.5 * bindFraction);

  // VOID-RESPECT — retroactive credit for the held thread that finally bound. `held` (the posture
  // of patience) never enters the numerator; only `groundedOnDelay` (a realized delayed binding)
  // does, scaled by precision over the spray baseline `heldForBinding`. A sprayer that holds
  // everything binds at the base rate and earns little per binding; a true holder binds precisely
  // and earns fully. The false vigil starves beside the confabulator.
  const held = num(outcome.held);
  const boundLater = num(outcome.groundedOnDelay);
  const heldCandidates = Math.max(boundLater, num(outcome.heldForBinding));
  const precision = heldCandidates > 0 ? boundLater / heldCandidates : 0;   // lift over spray (measured)
  // magnitude is the MEASURED exchange rate `voidValue`, not a posited constant — how much a
  // precise delayed binding is worth, read off the world (calibrated in createFitness). The shape
  // (retroactive, precision-gated) is the frozen structure; the scale floats on reality.
  const voidRespect = boundLater * (0.5 + 0.5 * precision) * (Number.isFinite(+voidValue) ? +voidValue : 1);

  // The UN-AUTHORED anchor. Human interaction (`endorsed`) is the strongest — un-authorable by
  // construction and, in time, the PRIMARY evolver. Then `predicted` — held-out PREDICTION competency
  // (surfer/predictive-competency.js): reality itself supplies the answer key, so it is objective and
  // needs no subject with taste, which is why it ranks ABOVE the judge's `validated` (fluency, a
  // verdict a frontier model authors). Then a realized delayed binding (the world grounding a held
  // thread), then the `corrections` penalty. null everything → unanchored → honestly provisional.
  // Making prediction the anchor is what collapses "quality per energy" into "prediction per energy":
  // the numerator now rewards foreseeing the world, not looking thrifty or sounding fluent.
  const hasHuman = outcome.endorsed != null;
  const hasPredicted = outcome.predicted != null;
  const hasAnchor = hasHuman || hasPredicted || outcome.validated != null || boundLater > 0 || outcome.corrections != null;
  const anchoredBy = hasHuman ? 'human'
    : hasPredicted ? 'prediction'
    : outcome.validated != null ? 'judge'
    : boundLater > 0 ? 'delayed-binding'
    : outcome.corrections != null ? 'corrections' : null;
  const anchor = hasHuman ? clamp01(outcome.endorsed)
    : hasPredicted ? clamp01(outcome.predicted)
    : outcome.validated != null ? clamp01(outcome.validated)
    : boundLater > 0 ? Math.min(1, 0.5 + 0.5 * precision)
    : Math.max(0, 1 - num(outcome.corrections) * 0.25);

  // Blend: when anchored, the un-authored signal carries `anchorWeight` of the quality, so fitness
  // is tethered to being right, not to looking thrifty. Void-respect adds ON TOP — a held thread
  // that grounded is fitness the authored/anchor blend never credited, the investigator's payoff.
  const blended = hasAnchor
    ? (1 - anchorWeight) * authoredQuality + anchorWeight * anchor * Math.max(authoredQuality, grounded || 1)
    : authoredQuality;
  const quality = blended + voidRespect;

  const energy = typeof energyOf === 'function' ? energyOf(outcome.spend || {}) : rawEnergy(outcome.spend);
  // fitness = quality / resource. The +1 keeps a zero-spend turn finite (a mechanical
  // answer that grounds is near-infinitely efficient — exactly the pathway scarcity
  // is trying to reward), without dividing by zero.
  const fitness = quality / (energy + 1);

  return Object.freeze({
    fitness: round(fitness),
    quality: round(quality),
    authoredQuality: round(authoredQuality),
    energy: round(energy),
    bindFraction: round(bindFraction),
    coverage: round(covered),
    coherence: round(coherence),
    anchor: hasAnchor ? round(anchor) : null,
    anchored: hasAnchor,           // false → fitness is a self-reported hypothesis
    anchoredBy,                    // 'human' | 'prediction' | 'judge' | 'delayed-binding' | 'corrections' | null
    provisional: !hasAnchor,       // the Goodhart honesty flag, carried forward to the surface
    held,                          // threads held open this turn (Void-respect posture — unrewarded)
    boundLater,                    // held threads that grounded this turn (the retroactive reward)
    voidRespect: round(voidRespect),
    voidValue: round(Number.isFinite(+voidValue) ? +voidValue : 1),   // the measured exchange rate applied
    precision: round(precision),   // held→bound precision — the false-vigil falsifier's lift term
    viable: outcome.viable !== false && outcome.delivered !== false,
  });
};

// createFitness — a running fitness meter with a γ-decayed memory, so the selection
// engine compares recent efficiency, not lifetime average (the organism's condition
// now, which is what its viability turns on). `anchorRate` reports how much of the
// recent record was externally anchored vs self-reported — the honesty gauge.
export const createFitness = ({
  energyOf, anchorWeight = 0.6, gamma = 0.8,
  bornVoidValue = TRANSFER_FLOOR,   // the born PRIOR is the TRANSFER FLOOR (lift.js): a held thread is
                            // worth, a priori, the worst-case transferable minimum — nothing beyond it
                            // until measured. Not a free 1.0; the one prior, tied to the transfer discipline.
  voidCap = 4,              // the transfer ceiling — the measured exchange rate cannot self-inflate past this.
  voidCalibration = 0.15,   // EMA weight: how fast the measured lift pulls voidValue off the born prior.
} = {}) => {
  let mass = 0, wfit = 0, wqual = 0, wenergy = 0, anchoredMass = 0, wvoid = 0, boundTotal = 0, humanMass = 0;
  // the MEASURED exchange rate for Void-respect, and how far off the born prior it has been pulled.
  let voidValue = bornVoidValue, voidObs = 0;
  const history = [];
  return Object.freeze({
    observe(outcome) {
      // CALIBRATE the magnitude from the world, not a constant. The signal is the WORST-CASE
      // transferable lift — `keptFitness` = min(liftA, liftB) across TWO frozen models (lift.js),
      // so the exchange rate is what a held thread is worth when the leaf is swapped, never a
      // gain overfit to one model. Only this un-authored lift moves voidValue; the population
      // cannot author the weight of its own reward. A single `lift` is used but is not
      // transfer-verified. Absent lift, the rate stays at the transfer-floor prior and says so.
      const kept = (outcome.liftA != null && outcome.liftB != null)
        ? keptFitness(+outcome.liftA, +outcome.liftB)
        : (outcome.lift != null && Number.isFinite(+outcome.lift) ? +outcome.lift : null);
      if (kept != null && Number.isFinite(kept) && num(outcome.groundedOnDelay) > 0) {
        const observed = Math.max(0, Math.min(voidCap, kept));
        voidValue = round((1 - voidCalibration) * voidValue + voidCalibration * observed);
        voidObs += 1;
      }
      const s = score(outcome, { energyOf, anchorWeight, voidValue });
      mass = gamma * mass + 1;
      wfit = gamma * wfit + s.fitness;
      wqual = gamma * wqual + s.quality;
      wenergy = gamma * wenergy + s.energy;
      anchoredMass = gamma * anchoredMass + (s.anchored ? 1 : 0);
      wvoid = gamma * wvoid + s.voidRespect;
      humanMass = gamma * humanMass + (s.anchoredBy === 'human' ? 1 : 0);
      boundTotal += s.boundLater;                 // lifetime realized delayed bindings — the investigator's tally
      history.push(s);
      if (history.length > 256) history.shift();
      return s;
    },
    // the recent metabolic condition: efficiency, and how tethered it is to reality.
    condition() {
      return Object.freeze({
        fitness: mass > 0 ? round(wfit / mass) : 0,
        quality: mass > 0 ? round(wqual / mass) : 0,
        energy:  mass > 0 ? round(wenergy / mass) : 0,
        anchorRate: mass > 0 ? round(anchoredMass / mass) : 0,   // 1 = fully anchored; 0 = all self-reported
        humanRate: mass > 0 ? round(humanMass / mass) : 0,       // how much of the recent record a human evolved
        voidRespect: mass > 0 ? round(wvoid / mass) : 0,         // recent retroactive credit — the investigator's payoff
        boundLater: boundTotal,                                  // lifetime held threads that grounded
        // the Void-respect MAGNITUDE, and how much of it is measured signal vs the born prior. This is
        // the honest answer to "how much weighting is actual contextual signal?" — 1 - bornRate.
        voidValue: round(voidValue),
        voidObs,
        bornRate: round(Math.pow(1 - voidCalibration, voidObs)),   // residual weight of the born prior (1 = all prior, 0 = all measured)
        signalRate: round(1 - Math.pow(1 - voidCalibration, voidObs)),
        samples: history.length,
      });
    },
    last: () => history[history.length - 1] || null,
    history: () => history.slice(),
  });
};

const num = (x) => (Number.isFinite(+x) ? +x : 0);
const clamp01 = (x, d = 0) => (Number.isFinite(+x) ? Math.max(0, Math.min(1, +x)) : d);
const rawEnergy = (spend = {}) => (num(spend?.model) * 100) + (num(spend?.tokens) * 0.02) + (num(spend?.time) * 0.5) + (num(spend?.fetch) * 3);
const round = (x) => Math.round(x * 1000) / 1000;
