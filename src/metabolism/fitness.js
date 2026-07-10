// EO: EVA(Field,Network → Lens,Atmosphere, Binding·Tracing·Tending) — the metabolic ratio
// metabolism/fitness.js — fitness as quality per unit resource, anchored against the
// one exploit that would otherwise eat the whole design.
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
//     validated,             // EXTERNAL: an un-authored pass/verdict (0..1), or null
//     spend,                 // { model, tokens, time, fetch, storage } charged this turn
//   }
export const score = (outcome = {}, { energyOf, anchorWeight = 0.6 } = {}) => {
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

  // The UN-AUTHORED anchor. `validated` is a direct external verdict; `corrections`
  // penalize (each correction is the world pushing back on a claim that didn't hold).
  // null validated → unanchored → the reading is provisional.
  const hasAnchor = outcome.validated != null || outcome.corrections != null;
  const anchor = outcome.validated != null
    ? clamp01(outcome.validated)
    : Math.max(0, 1 - num(outcome.corrections) * 0.25);

  // Blend: when anchored, the un-authored signal carries `anchorWeight` of the quality,
  // so fitness is tethered to being right, not to looking thrifty. When unanchored,
  // quality is the authored estimate alone, and the reading is flagged provisional.
  const quality = hasAnchor
    ? (1 - anchorWeight) * authoredQuality + anchorWeight * anchor * Math.max(authoredQuality, grounded || 1)
    : authoredQuality;

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
    provisional: !hasAnchor,       // the Goodhart honesty flag, carried forward to the surface
    viable: outcome.viable !== false && outcome.delivered !== false,
  });
};

// createFitness — a running fitness meter with a γ-decayed memory, so the selection
// engine compares recent efficiency, not lifetime average (the organism's condition
// now, which is what its viability turns on). `anchorRate` reports how much of the
// recent record was externally anchored vs self-reported — the honesty gauge.
export const createFitness = ({ energyOf, anchorWeight = 0.6, gamma = 0.8 } = {}) => {
  let mass = 0, wfit = 0, wqual = 0, wenergy = 0, anchoredMass = 0;
  const history = [];
  return Object.freeze({
    observe(outcome) {
      const s = score(outcome, { energyOf, anchorWeight });
      mass = gamma * mass + 1;
      wfit = gamma * wfit + s.fitness;
      wqual = gamma * wqual + s.quality;
      wenergy = gamma * wenergy + s.energy;
      anchoredMass = gamma * anchoredMass + (s.anchored ? 1 : 0);
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
