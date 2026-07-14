// EO: DEF·EVA(Kind → Lens,Paradigm, Dissecting,Binding) — the cast, on the nine-operator basis
// lineup/temperaments.js — the cast of the chorus (docs/cooperative-graph-surfers.md).
//
// NOT a bag of hand-tuned archetypes. The generative matrix is the operator set itself: the
// nine operators are Domain × Mode (three phases of a reasoning line × three characters of a
// move), and because that set is complete (every transformation decomposes into the nine) and
// minimal (none removable), the nine PURE operator-biases span the whole taste space. Every
// temperament — including the folk ones below — is a convex mixture over the nine. So a
// temperament is a simplex weight `w` over the operators, and everything else is DERIVED:
//
//                  DIFFERENTIATING   RELATING        GENERATING
//                  (cut / commit)    (link / test)   (mint / reframe)
//   EXISTENCE        NUL (voider)      SIG (spotter)   INS (seeder)
//   STRUCTURE        SEG (splitter)    CON (weaver)    SYN (synthesist)
//   SIGNIFICANCE     DEF (recorder)    EVA (auditor)   REC (reframer)
//
//   Domain = phase in a line: Existence opens (is there something?), Structure builds
//     (organize it), Significance closes (commit / judge / reframe). A cast missing a phase
//     cannot complete a line — no openers → stagnation, no closers → no committed signal.
//   Mode = character of the move: Differentiating reduces, Relating bridges, Generating mints.
//     Mode imbalance is the Goodhart axis — all-Generator is novelty with no ground, all-
//     Differentiator is premature commitment, all-Relator connects without cutting or creating.
//
// The knobs the walk consumes (gamma, epsilon, selfReachBudget, maxSteps) are NOT given by the
// spec — this module reads them off the operator semantics, anchored on the two presets we were
// handed (Type A ≈ pure DEF at selfReach 1; daydreamer ≈ pure REC at deep selfReach). Flagged as
// this holon's inference, not doctrine:
//   epsilon  ∝ myopia + novelty     — openers (Existence) and generators quit a line for the
//                                     next surprising thing; sustainers/closers hold it.
//   gamma    ∝ Structure+Significance — builders and closers must sustain a line to connect and
//                                     commit; Existence openers can be myopic (low gamma).
//   selfReach∝ Generating×Significance, PEAKING AT REC — reframing operates on one's own prior
//                                     operations (the spiral jump); DEF/EVA are frame-internal → shallow.
//
// The diversity floor (reward.js) operates on these NINE pure shares, not on any named cast —
// that is what actually keeps a voice from going extinct, and it is the precise form of "the
// openers feed the builders feed the closers": Existence mints the distinctions Structure weaves
// and Significance commits and reframes. The chorus is complete iff it spans all three phases and
// all three characters.

import { surpriseAt } from '../../core/index.js';

// The nine operators, by grid coordinate — the basis every temperament is a mixture over.
export const OPERATORS = Object.freeze(['NUL', 'SIG', 'INS', 'SEG', 'CON', 'SYN', 'DEF', 'EVA', 'REC']);
export const DOMAIN = Object.freeze({ NUL: 'Existence', SIG: 'Existence', INS: 'Existence', SEG: 'Structure', CON: 'Structure', SYN: 'Structure', DEF: 'Significance', EVA: 'Significance', REC: 'Significance' });
export const MODE = Object.freeze({ NUL: 'Differentiating', SEG: 'Differentiating', DEF: 'Differentiating', SIG: 'Relating', CON: 'Relating', EVA: 'Relating', INS: 'Generating', SYN: 'Generating', REC: 'Generating' });

// The PURE profiles — each operator as a temperament on its own, knobs read off its semantics
// (see the header; anchored on DEF and REC). `note` names the role, not a diagnosis.
export const PURE = Object.freeze({
  // Existence — the openers. Myopic (low gamma), quick to move on (high epsilon), short span.
  NUL: { note: 'voider — reaches for absence, the missing edge; feeds the lineup negative space', gamma: 0.35, epsilon: 0.06, selfReach: 0, maxSteps: 6 },
  SIG: { note: 'spotter — pure salience, "this matters now", no structure committed', gamma: 0.40, epsilon: 0.06, selfReach: 1, maxSteps: 6 },
  INS: { note: 'seeder — the only anchor-minter; introduces new grounded entities (the forage channel)', gamma: 0.55, epsilon: 0.03, selfReach: 3, maxSteps: 12 },
  // Structure — the builders. Sustain a line (higher gamma), medium span.
  SEG: { note: 'splitter — draws boundaries, partitions, filters', gamma: 0.60, epsilon: 0.03, selfReach: 1, maxSteps: 14 },
  CON: { note: 'weaver — relates admitted entities, builds edges', gamma: 0.80, epsilon: 0.02, selfReach: 2, maxSteps: 18 },
  SYN: { note: 'synthesist — derives wholes not reducible to their parts', gamma: 0.70, epsilon: 0.05, selfReach: 4, maxSteps: 14 },
  // Significance — the closers. Hold the frame (DEF/EVA) or transform it (REC).
  DEF: { note: 'recorder — establishes what holds within a stable frame (Type A)', gamma: 0.85, epsilon: 0.01, selfReach: 1, maxSteps: 24 },
  EVA: { note: 'auditor — tests particular against general, adjudicates competing records', gamma: 0.80, epsilon: 0.015, selfReach: 0, maxSteps: 20 },
  REC: { note: 'reframer — transforms the frame itself; bends the helix into a spiral (daydreamer)', gamma: 0.55, epsilon: 0.05, selfReach: 6, maxSteps: 12 },
});

// The menu operators — the only ops that appear as walk candidates (reason/walk.js menu()).
// A temperament's weight on these directly biases its move choice; its weight on the other
// six (NUL/SIG/INS/SEG/DEF/EVA) shapes the knobs and — for INS — how much it forages.
const MENU_OPS = Object.freeze(['CON', 'SYN', 'REC']);

const normalize = (w) => {
  const out = {}; let s = 0;
  for (const op of OPERATORS) { const v = Math.max(0, Number(w?.[op]) || 0); out[op] = v; s += v; }
  if (s <= 0) { for (const op of OPERATORS) out[op] = 1 / OPERATORS.length; return out; }
  for (const op of OPERATORS) out[op] /= s;
  return out;
};

// knobsFromWeights — the convex combination of the pure profiles. A mixture's knobs are the
// weighted average of its constituents' — so a temperament that is 70% DEF and 20% EVA sits
// where those two closers sit, and adding a dash of REC pulls its reach outward.
export const knobsFromWeights = (weights) => {
  const w = normalize(weights);
  let gamma = 0, epsilon = 0, selfReach = 0, maxSteps = 0;
  for (const op of OPERATORS) {
    const p = PURE[op];
    gamma += w[op] * p.gamma; epsilon += w[op] * p.epsilon;
    selfReach += w[op] * p.selfReach; maxSteps += w[op] * p.maxSteps;
  }
  return {
    gamma: round(gamma), epsilon: round(epsilon),
    selfReachBudget: Math.round(selfReach), maxSteps: Math.max(3, Math.round(maxSteps)),
  };
};

// fetchNFromWeights — the anchor-minting channel. INS is the only operator that introduces new
// grounded entities, and in this engine foraging the web IS that mint (admitSources seeds new
// grounded figures). So a Seeder-heavy temperament brings back more sources when it does forage;
// everyone else fetches the base. Foraging is still GATED by a measured void (sources.js) — this
// sets the QUANTITY of a warranted forage, never whether one fires.
export const fetchNFromWeights = (weights) => {
  const w = normalize(weights);
  return Math.max(1, Math.round(2 + 4 * w.INS));
};

// taste — a bias over a menu candidate, built from the weights. The candidate's own-operator
// weight leads (for the menu ops CON/SYN/REC), a small floor keeps the rest choosing by surprise,
// a Generating temperament prefers the reaching move (lower exaFrac), and a Differentiating/closer
// temperament prefers the grounded move. Reads only the candidate's shape — it composes with the
// walk's surprise ranking (proposeFrom), it does not replace it.
const reach = (c) => 2 - (c?.exaFrac ?? 1);            // 1 (grounded) … 2 (a full reach)
const grounded = (c) => (c?.exaFrac ?? 1) >= 1;
export const tasteFromWeights = (weights) => {
  const w = normalize(weights);
  const genW = w.INS + w.SYN + w.REC;                  // Generating character
  const diffW = w.NUL + w.SEG + w.DEF;                 // Differentiating character
  const closerW = w.DEF + w.EVA;                       // frame-internal closers — commit on ground
  return (c) => {
    const base = 0.1 + (MENU_OPS.includes(c.op) ? w[c.op] : 0);
    const reachF = 1 + genW * (reach(c) - 1);
    const groundF = grounded(c) ? (1 + diffW + closerW) : 1;
    return base * reachF * groundF;
  };
};

// makeTemperament — assemble a temperament from a simplex weight and a name. Everything is
// derived: the knobs, the fetch size, and the taste. `weights` need not sum to 1 (normalized).
export const makeTemperament = (name, weights) => {
  const w = normalize(weights);
  const knobs = knobsFromWeights(w);
  const dominant = OPERATORS.slice().sort((a, b) => w[b] - w[a])[0];
  return Object.freeze({
    name,
    weights: Object.freeze(w),
    note: PURE[dominant]?.note || 'a mixture',
    knobs: Object.freeze(knobs),
    fetchN: fetchNFromWeights(w),
    taste: tasteFromWeights(w),
    domain: DOMAIN[dominant], mode: MODE[dominant],
  });
};

// pureTemperament — one operator as a whole temperament (weight 1 on itself). These nine are
// the runtime basis of the default lineup, and the diversity floor is on their shares.
export const pureTemperament = (op) => {
  if (!PURE[op]) throw new Error(`lineup: unknown operator "${op}" (have: ${OPERATORS.join(', ')})`);
  return makeTemperament(op, { [op]: 1 });
};

// The FOLK archetypes — kept only as labeled mixtures over the nine (the vocabulary "some have
// ADHD, some are Type A" maps here), documented so the folk cast is legible as convex weights,
// never as a privileged basis. Note the two gaps the matrix exposed are now first-class pure
// voices (INS seeder, SEG splitter), not folded into the weaver.
export const ARCHETYPES = Object.freeze({
  adhd:       { SIG: 0.6, SYN: 0.25, NUL: 0.15 },   // salience-hopping with novel-synthesis excursions
  typeA:      { DEF: 0.7, EVA: 0.2, CON: 0.1 },     // records within a stable frame, some audit
  weaver:     { CON: 0.5, SYN: 0.35, SEG: 0.15 },   // relates and promotes, a little boundary
  auditor:    { EVA: 0.6, DEF: 0.25, SEG: 0.15 },   // tests particular against general
  daydreamer: { REC: 0.7, INS: 0.2, SYN: 0.1 },     // reframes, seeds, synthesizes — the far lead
  seeder:     { INS: 0.7, SIG: 0.2, SYN: 0.1 },     // mints new grounded anchors (closes the INS gap)
  splitter:   { SEG: 0.7, NUL: 0.2, DEF: 0.1 },     // draws boundaries (closes the SEG gap)
});
export const archetype = (name) => {
  if (!ARCHETYPES[name]) throw new Error(`lineup: unknown archetype "${name}" (have: ${Object.keys(ARCHETYPES).join(', ')})`);
  return makeTemperament(name, ARCHETYPES[name]);
};

// temperamentOf — resolve a runtime cast key to a temperament. The default cast keys are the
// nine operator codes (the basis); a named archetype resolves too, for a folk-labeled cast.
export const temperamentOf = (key) => {
  if (PURE[key]) return pureTemperament(key);
  if (ARCHETYPES[key]) return archetype(key);
  throw new Error(`lineup: unknown temperament "${key}" (operators: ${OPERATORS.join(', ')}; archetypes: ${Object.keys(ARCHETYPES).join(', ')})`);
};

// defaultCast — the whole basis at equal shares: one voice per pure operator. This is the cast
// the diversity floor protects (nine pure shares), so the chorus spans every phase and character
// from the start. Returned fresh so reward.js can evolve it without mutating module data.
export const defaultCast = (keys = OPERATORS) => {
  const n = keys.length || 1;
  return new Map(keys.map((k) => [k, 1 / n]));
};

// castFromArchetypes — a folk-labeled cast (equal shares) for callers who want the named voices
// instead of the pure basis. The floor then operates on the names, not the nine — legible, but
// not taxonomically complete; the pure-basis default is the recommended one.
export const castFromArchetypes = (names = Object.keys(ARCHETYPES)) => {
  const n = names.length || 1;
  return new Map(names.map((k) => [k, 1 / n]));
};

// The frontier a temperament's taste may choose within — the walk ranks by surprise; taste
// only reorders AMONG moves that clear the quit-threshold, so it never steers the walk into a
// spurious saturation on a boring move while a surprising one is on offer.
const TASTE_WINDOW = 6;

// proposeFrom — the walk's `propose` backend. The walk hands it the live candidates AND the
// running profile, so it computes each candidate's real surprise (surpriseAt) and lets taste
// choose only among the moves that clear `epsilon`. If none clear it, it returns the single most
// surprising move so the walk saturates HONESTLY on the best available, never on taste's whim.
export const proposeFrom = (temperament, { gamma = 0.7, epsilon = 0.02 } = {}) => {
  const taste = temperament?.taste || (() => 1);
  return async (cands, ctx = {}) => {
    if (!Array.isArray(cands) || cands.length === 0) return null;
    const profile = ctx.profile || new Map();
    const scored = cands.map((c) => ({ c, bits: surpriseAt(profile, c.arrival, { gamma }).bayesBits }))
      .sort((a, b) => b.bits - a.bits);
    const eligible = scored.filter((x) => x.bits >= epsilon).slice(0, TASTE_WINDOW);
    if (!eligible.length) return scored[0].c;          // nothing clears the bar → let the walk saturate honestly
    let best = eligible[0], bestW = -Infinity;
    for (const x of eligible) {
      const w = Number(taste(x.c)) || 0;
      if (w > bestW) { bestW = w; best = x; }          // strict > keeps the surprise-order tie-break
    }
    return best.c;
  };
};

const round = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : x);
