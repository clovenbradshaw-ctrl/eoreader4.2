// EO: SYN·DEF·EVA(Entity → Kind, Composing,Dissecting,Tracing) — Kind formation via hoisting
// A Kind is a DEF whose subject is a set: given a candidate group of members (each a
// {id, slots} record over a shared slot space — cheap for structured/tabular data, where
// field extraction already puts every record in one alignment; prose is a harder, separate
// problem this module does not attempt), decide which slots are constant enough across the
// group to state ONCE, in the Kind's own header, and which vary enough that they stay
// per-member. The hoisted slots ARE the similarity parameters — nobody names "compare on
// vendor and payment terms" up front; the encoder discovers those were the constants.
//
// The mechanism is a two-part MDL code, the same shape as every other Born decision in this
// tree: a proposed structure (the header) earns its keep only if it costs fewer bits than
// paying for every member's value independently.
//
//   gain = Σ DL(hᵢ)  −  [ DL(Kind)  +  Σ DL(hᵢ | Kind) ]
//
// Σ DL(hᵢ) is what each member's slot value costs to state under the POPULATION's own
// marginal distribution (the "if these members were never grouped" baseline — never the
// candidate set's own empirical distribution, which would make an already-constant column
// look like it gains nothing simply because it fit itself perfectly). DL(Kind) is the small
// one-time cost of naming the header value. Σ DL(hᵢ|Kind) is what each member costs once the
// header is known — cheap for a member that conforms, no cheaper than baseline for one that
// doesn't (a Kind never helps you encode its own outliers, which is why the deviant terms
// cancel out of the categorical derivation below).
//
// Whether the WHOLE set is a real Kind, not an artifact of which members happened to be
// handed in, is a second Born decision, at the set level (voidnull.js's deriveNull, one grain
// up): shuffle membership — draw random same-size groups from the population — and see
// whether this group's total gain beats what a random group of the same size would score.
// Below that line the grouping is VOID: real bits saved, but bits a random group would save
// too, so the coherence is chance, not structure.
//
// The trap this guards against (found analysing the real invoice case): fifty documents
// uploaded together share provenance — same export, same folder, same date range — and the
// hoister will truthfully find that and report it as a similarity parameter. `provenanceSlots`
// (opts.provenanceSlots to formKind) holds those slots OUT of the constitutive header; they
// still hoist (the compression is real) but land in `incidental`, a class the surface must
// label as "how you got these," never "why these belong together."
//
// Split detection (docs precedent: DEF's own gap-elbow, applied here to a slot's own value
// spectrum instead of an eigenvalue spectrum) answers the complementary question: a residual
// distribution with a real internal gap is two Kinds wearing one coat, not noise around one.

import { deriveNull, DEF } from '../../core/index.js';
import { deriveClusterRadius, clusterUnits } from './cluster.js';

const LN2 = Math.LN2;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const std = (xs) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };

// A small mulberry32 PRNG (the same idiom as weave/write/idle.js's seededRng) so the
// permutation null is reproducible under a caller-supplied seed, never a hidden Math.random.
const mulberry32 = (seed = 1) => {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const sampleWithoutReplacement = (pool, k, rng) => {
  const arr = pool.slice();
  const take = Math.min(k, arr.length);
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(rng() * (arr.length - i));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, take);
};

const slotKeysOf = (members) => {
  const keys = new Set();
  for (const m of members) for (const k of Object.keys(m.slots || {})) keys.add(k);
  return [...keys];
};

// Every member that actually carries this slot — missing/null slots simply do not
// participate, on either side of the gain calculation (no imputation, ever).
const valuesOf = (members, key) => {
  const out = [];
  for (const m of members) {
    const v = m.slots ? m.slots[key] : undefined;
    if (v !== undefined && v !== null) out.push({ id: m.id, value: v });
  }
  return out;
};

const countsOf = (values) => {
  const c = new Map();
  for (const v of values) c.set(v, (c.get(v) || 0) + 1);
  return c;
};

// Gaussian code length in bits (−log2 pdf). `s` is floored so a candidate set whose
// members happen to share one exact numeric value never divides by zero — the floor is
// derived from the population's own spread (a fraction of it), never an invented constant.
const gaussianBits = (v, m, s) => Math.log2(s * Math.sqrt(2 * Math.PI)) + ((v - m) ** 2) / (2 * s * s * LN2);

// ── the per-slot model: fit population + local (candidate-set) statistics, and the two
// code lengths every member's value costs under each — the raw material the gain formula
// reads (§ header comment). Returns null when either side has too little signal (<2 values)
// to fit anything — the slot then simply stays un-modelled (formKind reports it as varying,
// the honest "no signal" outcome, never a fabricated zero).
const buildSlotModel = (key, members, population) => {
  const local = valuesOf(members, key);
  const pop = valuesOf(population, key);
  if (local.length < 2 || pop.length < 2) return null;

  const isNum = (e) => typeof e.value === 'number' && Number.isFinite(e.value);
  if (local.every(isNum) && pop.every(isNum)) {
    const popVals = pop.map((e) => e.value), locVals = local.map((e) => e.value);
    const popMean = mean(popVals), popStd = Math.max(std(popVals), 1e-9);
    const locMean = mean(locVals);
    const locStd = Math.max(std(locVals), popStd * 1e-6, 1e-9);
    // Two real parameters (mean, std) named in the header — the standard MDL per-
    // parameter cost, ~ log2(n), not an invented flat fee.
    const headerBits = Math.log2(Math.max(2, local.length));
    let popBits = 0, locBits = 0;
    for (const e of local) {
      popBits += gaussianBits(e.value, popMean, popStd);
      locBits += gaussianBits(e.value, locMean, locStd);
    }
    return {
      type: 'numeric', gain: popBits - headerBits - locBits,
      headerValue: locMean, headerSpread: locStd, popMean, popStd, n: local.length,
      residualOf: (v) => (v - locMean) / locStd,
    };
  }

  // Categorical: the header names ONE population value (the local mode); a member's
  // conditional cost is the Bernoulli "did it conform" code (−log2 q for a match) plus,
  // for a deviant, the SAME population code its unconditional cost already used — which
  // is exactly why the deviant terms cancel algebraically and a Kind never discounts its
  // own outliers, only its conforming majority.
  const popCounts = countsOf(pop.map((e) => e.value));
  const popTotal = pop.length, popAlphabet = popCounts.size;
  const pPop = (v) => ((popCounts.get(v) || 0) + 1) / (popTotal + popAlphabet + 1);   // Laplace-smoothed
  const locCounts = countsOf(local.map((e) => e.value));
  let mode = null, modeCount = -1;
  for (const [v, c] of locCounts) if (c > modeCount) { modeCount = c; mode = v; }
  const q = modeCount / local.length;
  const headerBits = -Math.log2(pPop(mode));
  const missRate = Math.max(1 - q, 1 / (local.length + 1));                           // floors the −log2(0) case
  let popBits = 0, locBits = 0;
  for (const e of local) {
    popBits += -Math.log2(pPop(e.value));
    locBits += e.value === mode ? -Math.log2(q) : -Math.log2(missRate) - Math.log2(pPop(e.value));
  }
  return {
    type: 'categorical', gain: popBits - headerBits - locBits,
    headerValue: mode, matchRate: q, n: local.length,
    residualOf: (v) => (v === mode ? null : v),
  };
};

// slotGain — the single-slot MDL model, exposed so a caller can inspect one slot's
// candidacy without paying for the whole set (formKind runs this over every slot key).
export const slotGain = (members, population, key) => buildSlotModel(key, members, population);

// kindGain — total compression this candidate set achieves, summed over every slot whose
// OWN gain is positive (a non-hoisting slot contributes nothing either way — hoisting it
// would cost more than it saves, so it is simply left out of the total, never subtracted).
export const kindGain = (members, population, keys) => {
  let total = 0;
  const perSlot = {};
  for (const key of keys) {
    const m = buildSlotModel(key, members, population);
    if (!m) continue;
    perSlot[key] = m;
    if (m.gain > 0) total += m.gain;
  }
  return { total, perSlot };
};

// deriveKindNull — the set-level Born line (§ header comment): draw `trials` random
// same-size groups from the population, score each one's total gain the SAME way the real
// candidate is scored, and derive the noise floor those scores would produce by chance
// (voidnull.js's deriveNull — the one Born rule, pointed at group-gain instead of a signal
// amplitude). Returns Infinity — abstain, never force a verdict — when the population is
// too thin to sample groupSize members at all.
export const deriveKindNull = (population, groupSize, keys, opts = {}) => {
  const { alpha = 0.05, trials = 200, rng = mulberry32(1) } = opts;
  if (population.length < groupSize || population.length < 2) return Infinity;
  const background = [];
  for (let t = 0; t < trials; t++) {
    const sample = sampleWithoutReplacement(population, groupSize, rng);
    background.push(kindGain(sample, population, keys).total);
  }
  return deriveNull(background, { scale: 'linear', alpha });
};

// formKind — the whole assembly: fit every slot, hoist the ones that pay for themselves,
// derive the set-level null, and render the verdict.
//
//   members           the candidate group, each { id, slots: { key: value, ... } }.
//   opts.population    the background pool slotGain's population-marginal and the
//                       permutation null are drawn from. Defaults to `members` itself — a
//                       usable but weak fallback (a self-referential baseline discounts an
//                       already-constant column, understating gain; see the header comment);
//                       real callers should pass the wider corpus the members were drawn from.
//   opts.provenanceSlots  slot names to hold OUT of the constitutive header (still hoisted —
//                       the compression is real — but filed under `incidental`, never
//                       `header`) — the source-family-holdout guard against the "arrived in
//                       the same zip file" trap.
//   opts.alpha, opts.trials, opts.rng  passed through to deriveKindNull.
//
// Returns { holds, gain, threshold, header, incidental, varying, residual, n }. `holds` is
// the SYN/VOID verdict (gain clears the permutation line); a Kind that does not hold still
// reports its header/varying split — the caller decides whether to render a VOID Kind as a
// declined proposal or suppress it entirely.
export const formKind = (members, opts = {}) => {
  const {
    population = members,
    provenanceSlots = [],
    alpha = 0.05,
    trials = 200,
    rng = mulberry32(1),
  } = opts;

  const keys = slotKeysOf(members);
  const provSet = new Set(provenanceSlots);
  const { total, perSlot } = kindGain(members, population, keys);
  const threshold = deriveKindNull(population, members.length, keys, { alpha, trials, rng });
  const holds = Number.isFinite(threshold) && total > threshold;

  const header = {}, incidental = {}, varying = [];
  for (const key of keys) {
    const m = perSlot[key];
    if (!m || m.gain <= 0) { varying.push(key); continue; }
    const bucket = provSet.has(key) ? incidental : header;
    bucket[key] = Object.freeze({ value: m.headerValue, gain: m.gain, type: m.type });
  }

  const residual = {};
  for (const member of members) {
    const r = {};
    for (const key of varying) {
      const v = member.slots ? member.slots[key] : undefined;
      if (v === undefined || v === null) continue;
      const m = perSlot[key];
      r[key] = m ? m.residualOf(v) : v;
    }
    residual[member.id] = Object.freeze(r);
  }

  return Object.freeze({
    holds, gain: total, threshold,
    header: Object.freeze(header), incidental: Object.freeze(incidental),
    varying: Object.freeze(varying), residual: Object.freeze(residual),
    n: members.length,
  });
};

// detectSplit — is a slot's own distribution across the group secretly two Kinds? Reuses
// existing machinery rather than a bespoke bimodality test: a numeric slot is 1-D clustered
// the same way cluster.js already clusters a field vector (radius derived from the slot's
// own consecutive-value spacing); a categorical slot's frequency spectrum is fed to DEF, the
// same gap-elbow voidnull.js already uses to count how many readings an eigenvalue spectrum
// holds — here counting how many top categories sit above a real gap instead of one.
export const detectSplit = (members, key, opts = {}) => {
  const values = valuesOf(members, key);
  if (values.length < 4) return { split: false };

  if (values.every((e) => typeof e.value === 'number' && Number.isFinite(e.value))) {
    const units = values.map((e, i) => ({ id: e.id, ordinal: i, field: [e.value] }));
    const metric = (a, b) => Math.abs(a[0] - b[0]);
    const radius = deriveClusterRadius(units, metric, opts);
    const clusters = clusterUnits(units, metric, radius, { minMembers: opts.minMembers ?? 2 });
    if (clusters.length < 2) return { split: false };
    return { split: true, groups: clusters.map((c) => c.members.map((i) => units[i].id)), radius };
  }

  const counts = countsOf(values.map((e) => e.value));
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const { idx, abstain } = DEF(ranked.map(([, c]) => c), opts);
  if (abstain || idx < 2) return { split: false };
  const topValues = new Set(ranked.slice(0, idx).map(([v]) => v));
  const groupA = values.filter((e) => topValues.has(e.value)).map((e) => e.id);
  const groupB = values.filter((e) => !topValues.has(e.value)).map((e) => e.id);
  if (!groupA.length || !groupB.length) return { split: false };
  return { split: true, groups: [groupA, groupB], topValues: [...topValues] };
};
