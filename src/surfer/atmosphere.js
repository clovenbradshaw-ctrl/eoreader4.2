// EO: SIG·EVA(Field,Atmosphere → Atmosphere, Tending,Tracing) — the Atmosphere pass
// The Atmosphere pass — the Significance row's Ground terrain (cube.md #5, Track B).
//
// Beneath the Lens, at the Ground grain. The atmosphere is the ambient interpretive
// weather the reading rides — the medium that makes certain readings obvious and
// others strange. It is the metric the Lens pass diagonalises IN. cube.md #5 calls the
// significance-tone field "the highest-value hole the cube exposes"; this is the first
// instrument pointed at it.
//
// Two readings off the one density operator ρ (core/spectral.js), no figure committed:
//
//   1. DEPARTURE — S(ρ_doc ‖ σ_corpus), the Umegaki relative entropy of the document's
//      interpretive weather against the corpus prior σ. A single scalar: how far this
//      document reads in its own key. σ is built once from the 27 cell centroids (the
//      ambient geometry every document is read against).
//   2. TONE, not clause — the dominant Ground-grain (Atmosphere-terrain) cell of ρ,
//      reported as a tone ("reads as evaluative") BEFORE any clause is named. A field,
//      not a figure: the only stances legal here are Ground-grain (Tending / Clearing /
//      Cultivating), enforced through cellAt; a Figure stance routed here is dropped.
//
// The pass is a MEASUREMENT, so it gets a null: the atmosphere is *anomalous* only when
// a window's departure beats deriveNull over the per-window KL the document throws up
// (the same extreme-value Born discipline the cursor axis runs). Below the null the
// atmosphere is the ordinary corpus weather and the surf SAYS so — a record, not a
// silence, exactly as the cursor axis records SYN/NUL.
//
// ACYCLIC: this leaf never imports classify. The corpus prior is INJECTED (`prior`,
// the centroid bundle the caller loads), so the surfer does not reach into the
// classifier. Pure on vectors past the projection, so it is omnimodal for free —
// Atmosphere is the most portable terrain across modalities (cube.md #9, Track E).
//
// MEASUREMENT FIRST (can come back negative): whether `departure` separates a
// human-labelled "neutral" corpus from a "loaded" one above its null is an open
// measurement on real material. Until that lands, the pass ships behind opts and the
// verdict defaults to the conservative 'corpus-weather' (the ordinary reading).

import { buildDensity, relEntropy, vonNeumann, eigenLenses } from '../core/index.js';
import { deriveNull, cellAt, OPERATORS } from '../core/index.js';

// ── projection: a unit's significance activation over the 27 cells ──────────────
//
// The load-bearing basis (Track A): a unit's vector vₖ is NOT its raw MiniLM
// embedding but its activation over the 27 cell centroids — its cosine against each.
// Built in significance coordinates, ρ's eigenvectors are FRAMES, not topic clusters.

const cosine = (a, b) => {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d > 1e-12 ? dot / d : 0;
};

// The ordered centroid basis from an injected prior bundle ({ vectors: { key: [...] } }).
// Stable key order so every unit projects into the SAME coordinates — what makes the
// readings commensurable (and omnimodal: every modality maps into one basis).
export const centroidBasis = (prior) => {
  const vectors = prior?.vectors;
  if (!vectors || typeof vectors !== 'object') return null;
  const keys = Object.keys(vectors).sort();
  const vecs = keys.map(k => vectors[k]);
  if (!keys.length || !Array.isArray(vecs[0])) return null;
  return { keys, vecs };
};

// Project one raw embedding onto the significance basis → a 27-vector of cosines.
export const projectUnit = (vec, basis) =>
  (basis?.vecs || []).map(c => cosine(vec, c));

// Project many.
export const projectUnits = (vectors, basis) =>
  (vectors || []).map(v => projectUnit(v, basis));

// ── σ_corpus: the prior interpretive geometry ──────────────────────────────
//
// The corpus prior density — built once from the centroids themselves. Each centroid's
// own significance activation (its cosines against all 27, i.e. a Gram row) is a
// "reading" the corpus geometry affords; ρ over those, equal-weighted, is the ambient
// weather every document is read against. Memoised on the basis object.
const sigmaCache = new WeakMap();
export const corpusSigma = (basis) => {
  if (!basis) return null;
  if (sigmaCache.has(basis)) return sigmaCache.get(basis);
  const activations = basis.vecs.map(c => projectUnit(c, basis));
  const sigma = buildDensity(activations);
  sigmaCache.set(basis, sigma);
  return sigma;
};

// ── centering: expose the deviation, not the common offset ────────────────
//
// MEASURED (scripts/measure-significance.mjs, on 19,764 labelled clauses): a cosine
// projection onto the 27 cell centroids is dominated by a large common component —
// every activation reads ~0.95 against every centroid — so the bare KL departure
// collapses to ~0 and a raw-vs-projected lens margin NARROWS. Subtracting the basis
// mean activation (the corpus prior's own mean reading, basis-derived and fixed)
// exposes the deviation that carries the frame: centered, an interpretive document
// departs the prior further than a factual one (0.48 vs 0.40) and the frame margin
// widens 4× over the raw embedding. So the SPREAD reads (departure) are taken on the
// centered activations; the MASS reads (tone) stay on the uncentered ρ, where the
// diagonal is a genuine Born mass and the simplex/prediction story holds.
const meanCache = new WeakMap();
const basisMean = (basis) => {
  if (meanCache.has(basis)) return meanCache.get(basis);
  const acts = basis.vecs.map(c => projectUnit(c, basis));
  const m = new Array(basis.keys.length).fill(0);
  for (const a of acts) for (let j = 0; j < m.length; j++) m[j] += a[j] / acts.length;
  meanCache.set(basis, m);
  return m;
};
const centerBy = (acts, m) => acts.map(a => a.map((x, j) => x - (m[j] || 0)));

const sigmaCenteredCache = new WeakMap();
const corpusSigmaCentered = (basis) => {
  if (sigmaCenteredCache.has(basis)) return sigmaCenteredCache.get(basis);
  const m = basisMean(basis);
  const sigma = buildDensity(centerBy(basis.vecs.map(c => projectUnit(c, basis)), m));
  sigmaCenteredCache.set(basis, sigma);
  return sigma;
};

// ── the tone: dominant Ground-grain (Atmosphere) cell of ρ ────────────────
//
// The Ground-grain output. The Atmosphere-terrain cells are the three keyed *_Atmosphere
// (DEF/EVA/REC at Ground grain). The dominant one is the argmax of ρ's diagonal mass
// over their basis indices. Routed through cellAt(op, { site:'Atmosphere', stance }) so
// a non-Ground stance is rejected — the grain guard, not a comment.
const TONE_WORD = Object.freeze({
  EVA: 'evaluative',   // EVA_Tending_Atmosphere — a held, loaded weather
  DEF: 'clearing',     // DEF_Clearing_Atmosphere — a neutralising / dismissive weather
  REC: 'unsettled',    // REC_Cultivating_Atmosphere — a reframing / emergent weather
});

const toneOf = (rho, basis) => {
  if (!rho?.length || !basis) return null;
  let bestIdx = -1, bestMass = -Infinity;
  for (let i = 0; i < basis.keys.length; i++) {
    if (!basis.keys[i].endsWith('_Atmosphere')) continue;
    const mass = rho[i]?.[i] ?? 0;
    if (mass > bestMass) { bestMass = mass; bestIdx = i; }
  }
  if (bestIdx < 0) return null;
  const key = basis.keys[bestIdx];
  const [op, stance] = key.split('_');
  // Grain guard: the cell must be Ground-grain at the Atmosphere terrain, or it is
  // not a tone — drop it rather than ship a figure where a field belongs.
  const cell = OPERATORS[op] ? cellAt(op, { site: 'Atmosphere', stance }) : null;
  if (!cell) return null;
  return Object.freeze({
    terrain: 'Atmosphere', cell: cell.key, op, stance,
    mass: round(bestMass), label: `reads as ${TONE_WORD[op] || 'ambient'}`,
  });
};

// ── the verdict: per-window KL against the document's own noise null ──────────
//
// Slide a window over the units; each window's ρ has a departure S(ρ_window ‖ σ). The
// most-departed window is anomalous only when it beats the extreme-value null the rest
// of the windows throw up by chance (deriveNull, leave-one-out, alpha the budget). This
// is "a passage whose tone departs the corpus prior past the null."
const WINDOW = 5;
const windowDepartures = (centered, sigma) => {
  const W = Math.min(WINDOW, centered.length);
  const out = [];
  if (W < 1) return out;
  for (let i = 0; i + W <= centered.length; i++) {
    const win = centered.slice(i, i + W);
    const { rho } = buildDensity(win);
    out.push({ at: i, departure: relEntropy(rho, sigma) });
  }
  return out;
};

// ── atmosphereFromActivations: the sync core (no embedder) ────────────────
//
// Given per-unit activations and an injected basis, do everything synchronously — so
// the surfer can call it inside its (sync) surf without awaiting embeddings (the caller
// computed them once). `prior`/`basis` is the injected centroid bundle or a pre-built
// basis; `alpha` the hallucination budget.
export const atmosphereFromActivations = (activations, basisOrPrior, { alpha = 0.05 } = {}) => {
  const basis = basisOrPrior?.keys ? basisOrPrior : centroidBasis(basisOrPrior);
  const blank = { departure: 0, tone: null, verdict: 'unmeasured', anomalousWindows: [], rode: 'atmosphere-kl' };
  if (!basis || !activations?.length) return blank;
  const sigma = corpusSigma(basis);
  if (!sigma?.dim) return blank;

  // MASS read — tone, on the uncentered ρ (the Born/simplex object).
  const { rho } = buildDensity(activations);
  const tone = toneOf(rho, basis);

  // SPREAD read — departure, on the CENTERED activations against the centered prior
  // (measurement first: centering is what makes the KL discriminate loaded from
  // neutral; see the note above corpusSigmaCentered).
  const centered = centerBy(activations, basisMean(basis));
  const sigmaC = corpusSigmaCentered(basis);
  const departure = relEntropy(buildDensity(centered).rho, sigmaC);

  // The per-window null: which windows read in a departed key past chance.
  const windows = windowDepartures(centered, sigmaC);
  const deps = windows.map(w => w.departure);
  let verdict = 'corpus-weather';
  const anomalousWindows = [];
  if (deps.length >= 4) {
    for (const w of windows) {
      const nul = deriveNull(deps, { scale: 'linear', alpha, leaveOut: w.departure });
      if (Number.isFinite(nul) && w.departure > nul) anomalousWindows.push({ at: w.at, departure: round(w.departure) });
    }
    verdict = anomalousWindows.length ? 'anomalous' : 'corpus-weather';
  } else {
    verdict = 'unmeasured';   // too short to measure a per-window null — abstain honestly
  }

  return Object.freeze({
    departure: round(departure), tone, verdict, anomalousWindows, rode: 'atmosphere-kl',
    // The two numbers live in different frames: departure is the KL on the CENTERED
    // activations (the common offset removed — measurement first, see corpusSigmaCentered),
    // tone is the dominant Ground cell of the UNCENTERED mass-ρ (where the diagonal is a
    // genuine Born mass). Recorded so a later reader does not read them as co-spatial.
    frame: Object.freeze({ departure: 'centered', tone: 'uncentered-mass' }),
  });
};

// ── atmosphereOf: the async organ-facing interface ───────────────────────────
//
//   atmosphereOf(doc, { embedder, prior, alpha }) → { departure, tone, verdict, rode }
//
// Computes the unit embeddings (doc.sentenceEmbeddings(embedder)), projects them onto
// the injected prior's basis, and reads the atmosphere off ρ. Inert under a non-meaning
// embedder (the firewall the geometric classifier already runs): a cosine between a
// spelling-space vector and a MiniLM-space centroid measures nothing, so we abstain.
export const atmosphereOf = async (doc, { embedder, prior, alpha = 0.05, activations: pre } = {}) => {
  const basis = prior?.keys ? prior : centroidBasis(prior);
  if (!basis) return { departure: 0, tone: null, verdict: 'unmeasured', rode: 'atmosphere-kl' };
  let activations = pre;
  if (!activations) {
    // CLAUSE GRAIN when the doc carries a clause layer: the atmosphere is a read of the
    // activation DISTRIBUTION (KL departure + dominant tone), index-free, so scoring
    // clauses rather than pooled sentences only sharpens it — a compound sentence's two
    // tones become two samples instead of one blurred average. Falls back to the
    // sentence vectors for a non-text organ (a melody has no clauses), byte-identical.
    const clauseGrain = Array.isArray(doc?.clauses) && doc.clauses.length && typeof doc?.clauseEmbeddings === 'function';
    if (!embedder?.measuresMeaning || (!clauseGrain && typeof doc?.sentenceEmbeddings !== 'function'))
      return { departure: 0, tone: null, verdict: 'unmeasured', rode: 'atmosphere-kl' };
    const vectors = clauseGrain ? await doc.clauseEmbeddings(embedder) : await doc.sentenceEmbeddings(embedder);
    activations = projectUnits(vectors, basis);
  }
  return atmosphereFromActivations(activations, basis, { alpha });
};

const round = (x) => Math.round(x * 1e4) / 1e4;
