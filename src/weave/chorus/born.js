// EO: SIG·EVA(Field,Lens → Field,Lens, Tending,Tracing) — the Born measure
// The Born measure — the reframe stated as arithmetic (docs/chorus.md, "The measure is Born").
//
// The geometric reader (src/classify/phasepost.js) scores a clause against the
// 27 cell centroids and then, per band, takes the argmax. That last step is a
// HARD measurement: it keeps one cell and discards the rest of the distribution.
// The chorus keeps the distribution instead. This module is the arithmetic that
// lets it.
//
// The cosine vector against the 27 centroids is a set of SIGNED amplitudes. The
// spec's two moves:
//
//   1. Square them, normalize to sum one → a distribution over the 27-cell ground.
//      Squaring suppresses the weak projections QUADRATICALLY. That is the
//      property argmax crudely approximated and a linear weighting cannot give:
//      the signal-from-noise step. It is why we say Born and not "use the scores".
//
//   2. A voice is a fold, not a generation — see fold.js. This module only makes
//      the measure; it emits no prose and touches no model. Deterministic.
//
// The amplitude is the signed cosine, kept signed all the way to the square, so
// that Probe B (interference across spans, probe.js) can see cross-span
// cancellation before the sign is lost. Callers that already hold a MiniLM query
// vector and the centroid bundle get their amplitudes from `cubeAmplitudes`;
// callers holding raw numbers use `bornWeights` directly.

// Signed cosine — identical to the classifier's, kept here so the measure module
// has no dependency on the classifier. The sign is load-bearing (Probe B), so it
// is never abs'd.
export const signedCosine = (a, b) => {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
};

// The signed projection of a query vector onto every cell centroid — the raw
// amplitudes, before squaring. `vectors` is the centroid bundle's { key: number[] }.
// Order follows the bundle's key order; a cell with no centroid is skipped (it is
// not measurable, exactly as the classifier skips it). Pure.
export const cubeAmplitudes = (qVec, vectors) => {
  const amps = [];
  if (!qVec || !vectors) return amps;
  for (const [key, vec] of Object.entries(vectors)) {
    if (!Array.isArray(vec) || !vec.length) continue;
    amps.push({ key, amp: signedCosine(qVec, vec) });
  }
  return amps;
};

// Center a set of amplitudes on their own mean — the signed residual each cell
// carries ABOVE (or below) the clause's average projection. The 27 cell centroids
// are highly correlated in MiniLM space (their pairwise cosines are all large and
// positive), so the RAW cosines against a clause are all large-and-positive too:
// squaring them does not concentrate, and Probe A reads a flat spread. Centering
// is the "fix the basis" candidate the spec's gate anticipates — it turns the raw
// cosines into genuinely SIGNED amplitudes (distinctively-near cells positive,
// distinctively-far cells negative) whose squares suppress the shared baseline and
// keep the discriminative structure. The margin the classifier already measures is
// the top of exactly this centered signal. Pure.
export const centeredAmplitudes = (amps) => {
  const list = Array.isArray(amps) ? amps : [];
  if (!list.length) return [];
  const mean = list.reduce((s, a) => s + (a.amp ?? 0), 0) / list.length;
  return list.map((a) => Object.freeze({ key: a.key, amp: (a.amp ?? 0) - mean }));
};

// Born-normalize a bare list of signed amplitudes: square, sum, divide. Returns
// the weights in the SAME order as the input. A degenerate all-zero (or empty)
// input returns all-zero weights — the honest "no mass", never a divide-by-zero
// that fabricates a uniform reading. Pure.
export const bornWeights = (amps) => {
  const sq = amps.map((a) => a * a);
  const total = sq.reduce((s, x) => s + x, 0);
  if (!(total > 0)) return sq.map(() => 0);
  return sq.map((x) => x / total);
};

// The primary measure: turn amplitudes into the distribution over the 27-cell
// ground. Input is `cubeAmplitudes`' output ({ key, amp }[]); output carries the
// key, the raw signed amp (kept for Probe B and for the fold's provenance), and
// the Born weight. The array is returned in input order; `sorted` gives it by
// descending weight for the governor. Pure and deterministic.
export const bornDistribution = (amps) => {
  const list = Array.isArray(amps) ? amps : [];
  const weights = bornWeights(list.map((a) => a.amp ?? 0));
  const cells = list.map((a, i) => Object.freeze({
    key: a.key,
    amp: a.amp ?? 0,
    weight: weights[i],
  }));
  return Object.freeze(cells);
};

// Descending-by-weight view of a distribution — the order the governor voices in.
// Stable on ties (input order breaks them) so the measure stays deterministic.
export const sortedByWeight = (cells) =>
  cells
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (b.c.weight - a.c.weight) || (a.i - b.i))
    .map((x) => x.c);

// Fraction of the total Born mass carried by the top-`k` cells — the raw datum
// Probe A averages over the corpus (probe.js). Defined on the distribution so the
// probe and the render read the same number.
export const topMass = (cells, k = 3) => {
  const sorted = sortedByWeight(cells);
  let s = 0;
  for (let i = 0; i < Math.min(k, sorted.length); i++) s += sorted[i].weight;
  return s;
};

// THE BORN PARTITION — split a reading's Born distribution into the mass ON the
// frame and the mass OFF it (docs "Born-measure frame breaking"). This is the
// measure that decides frame breaking in the enacted loop: a frame holds while the
// reading carries most of its squared amplitude on the cells its terms occupy, and
// breaks when the mass has moved off them — `offMass > onMass`, the self-normalized
// point where the reading is more about what the frame is NOT standing on than what
// it is. The 0.5 crossing is not a chosen bar: it is the point where the two shares
// of the SAME distribution cross, the reading's own mass deciding, not a constant.
//
// `readingAmps` is the reading's amplitudes at the cursor — `cubeAmplitudes(qVec,
// vectors)` after `centeredAmplitudes`, an { key, amp }[]. `frameCellSet` is the set
// of keys the frame's terms occupy (a Set, or anything iterable of keys). We
// Born-normalize over ALL the amps first — so `onMass` and `offMass` are shares of
// one distribution and sum to one — then sum the weights whose key is in the set
// against the rest.
//
// A degenerate all-zero (or empty) input returns { onMass: 0, offMass: 0 } — the
// honest no-mass, the same rule `bornWeights` keeps against fabricating a uniform
// reading: with no squared amplitude there is nothing to partition, and a frame
// cannot be said to hold or break on nothing (it falls out of bornWeights' zeros,
// no special case). Pure.
export const frameMassPartition = (readingAmps, frameCellSet) => {
  const list = Array.isArray(readingAmps) ? readingAmps : [];
  const inFrame = frameCellSet instanceof Set ? frameCellSet : new Set(frameCellSet || []);
  const weights = bornWeights(list.map((a) => a?.amp ?? 0));
  let onMass = 0, offMass = 0;
  for (let i = 0; i < list.length; i++) {
    if (inFrame.has(list[i]?.key)) onMass += weights[i];
    else offMass += weights[i];
  }
  return { onMass, offMass };
};
