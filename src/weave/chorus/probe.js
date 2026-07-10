// EO: EVA·SIG(Field,Network → Lens, Tracing,Binding) — gate-zero probes
// Gate zero — measure before building (docs/chorus.md, "Gate zero").
//
// Three read-only probes over the corpus we already have. Each can come back
// negative. Each gates a build. NONE touches a model — they operate on amplitudes
// (the signed cosine projections) and on the centroid geometry, both of which the
// caller supplies. Deterministic and pure.
//
//   Probe A — sparsification. Does the mass concentrate? Gates the whole spec.
//   Probe B — interference. Do signed spans cancel? Gates the "interference" word.
//   Probe C — non-commutativity. Do the faces fail to commute? Gates the physics
//             vocabulary, not the build.
//
// The honest position (docs/chorus.md): A is the near-term win and the only one
// the render depends on. B and C decide how much of the vocabulary we have
// earned. Do not weld the cheap win to the big claim.

import { bornWeights, bornDistribution, topMass } from './born.js';
import { cellCoords } from './marginals.js';

// ── Probe A — sparsification ─────────────────────────────────────────────────
//
// For each clause, take the 27-vector, square, normalize, sort descending, record
// the fraction of mass in the top-`k` cells. Average over the corpus. Pass is
// concentration — on the order of two thirds of the mass in three cells or fewer
// for most clauses. Fail is a flat spread: the basis is wrong and no renderer
// built on it will separate signal from noise. This probe gates the whole spec.
//
// `corpus` is an array of readings, each either a bare number[] of amplitudes or
// an { key, amp }[] (cubeAmplitudes output). `k` is the head size (3), `passLine`
// the mean-mass bar (2/3), `mostFrac` the fraction of clauses that must clear the
// per-clause bar for a pass.
export const probeA = (corpus, { k = 3, passLine = 2 / 3, mostFrac = 0.5 } = {}) => {
  const perClause = (corpus || []).map((reading) => {
    const cells = Array.isArray(reading) && typeof reading[0] === 'number'
      ? bornDistribution(reading.map((amp, i) => ({ key: String(i), amp })))
      : bornDistribution(reading);
    return topMass(cells, k);
  });
  const n = perClause.length;
  const mean = n ? perClause.reduce((s, x) => s + x, 0) / n : 0;
  const cleared = perClause.filter((m) => m >= passLine).length;
  const clearedFrac = n ? cleared / n : 0;
  return Object.freeze({
    probe: 'A', n, k, passLine, mostFrac,
    meanTopMass: mean,
    clearedFrac,
    // Pass needs BOTH the average concentrated and most clauses individually
    // concentrated — a high mean carried by a few very-sharp clauses is not the
    // "most clauses are sparse" the render depends on.
    pass: n > 0 && mean >= passLine && clearedFrac >= mostFrac,
    perClause: Object.freeze(perClause),
  });
};

// ── Probe B — interference ───────────────────────────────────────────────────
//
// Cosine projections are signed. For each cell, take every span that contributes
// and compute the cell's mass two ways: sum the signed amplitudes across spans and
// THEN square (coherent), against square each span and THEN sum (incoherent). If
// the two disagree there are cross-span cancellations — destructive interference —
// and the Born framing is carrying real structure. If they never disagree there is
// no interference and the measure is a probability weighting wearing borrowed
// vocabulary, still useful, but the word stays in quotes.
//
// `spans` is an array of readings (number[] or { key, amp }[]), one per span, all
// over the SAME cell basis. `tol` is the relative gap below which coherent and
// incoherent count as agreeing. Returns per-cell gaps and whether interference
// (any gap) and destructive interference (coherent < incoherent) are present.
export const probeB = (spans, { tol = 0.02 } = {}) => {
  // Normalize every span to a { key → amp } map so cells line up across spans.
  const asMap = (reading) => {
    const m = {};
    if (Array.isArray(reading) && typeof reading[0] === 'number')
      reading.forEach((amp, i) => { m[String(i)] = amp; });
    else for (const a of (reading || [])) m[a.key] = a.amp ?? 0;
    return m;
  };
  const maps = (spans || []).map(asMap);
  const keys = [...new Set(maps.flatMap((m) => Object.keys(m)))];

  const perCell = keys.map((key) => {
    let coherentSum = 0, incoherentSum = 0;
    for (const m of maps) {
      const amp = m[key] || 0;
      coherentSum += amp;       // sum THEN square
      incoherentSum += amp * amp;  // square THEN sum
    }
    const coherent = coherentSum * coherentSum;
    const incoherent = incoherentSum;
    const scale = Math.max(coherent, incoherent, 1e-12);
    const gap = (coherent - incoherent) / scale;   // <0 → cancellation
    return { key, coherent, incoherent, gap };
  });

  const maxGap = perCell.reduce((mx, c) => Math.max(mx, Math.abs(c.gap)), 0);
  const destructive = perCell.some((c) => c.gap < -tol);
  const interference = perCell.some((c) => Math.abs(c.gap) > tol);
  return Object.freeze({
    probe: 'B', tol,
    interference,     // any disagreement (constructive or destructive)
    destructive,      // the strong claim: signed spans actually cancel
    maxGap,
    perCell: Object.freeze(perCell),
  });
};

// ── Probe C — non-commutativity ──────────────────────────────────────────────
//
// The three faces are three marginals of the cube. Measure a reading in the Act
// marginal, condition on the result, then measure the Site marginal, and compare
// against the reverse order. If order changes the outcome the faces do not commute
// and there is something like complementarity across lenses. If order never matters
// the faces commute and the physics framing is decorative, though the polyphony
// still renders fine. This probe gates the strength of the claim, not the build.
//
// The measurement is projective, in the centroid space the reading lives in. An
// Act outcome is the op-subspace (the centroids sharing an operator); a Site
// outcome is the terrain-subspace (the centroids sharing a terrain). These
// subspaces OVERLAP — the 27 centroids are not orthogonal — so the two projector
// families need not commute. Sequential outcome probabilities are the squared
// norms of the projected state:  P(a then b) = ‖Π_b Π_a q‖²  (q unit-normalized).
// The probe compares the full joint table against its reverse.
//
// `q` is the reading's query vector; `vectors` the centroid bundle { key: number[] }.

// Orthonormalize a set of vectors (modified Gram–Schmidt) so a subspace projector
// is idempotent — an honest projective measurement, not a Gram-weighted smear.
const orthonormal = (vecs) => {
  const basis = [];
  for (const v0 of vecs) {
    let v = v0.slice();
    for (const e of basis) {
      let dot = 0; for (let i = 0; i < v.length; i++) dot += v[i] * e[i];
      for (let i = 0; i < v.length; i++) v[i] -= dot * e[i];
    }
    let norm = 0; for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
    norm = Math.sqrt(norm);
    if (norm > 1e-9) { for (let i = 0; i < v.length; i++) v[i] /= norm; basis.push(v); }
  }
  return basis;
};

// Project a vector onto a subspace given its orthonormal basis: Σ_e ⟨q|e⟩ e.
const project = (q, basis) => {
  const dim = q.length;
  const out = new Array(dim).fill(0);
  for (const e of basis) {
    let dot = 0; for (let i = 0; i < dim; i++) dot += q[i] * e[i];
    for (let i = 0; i < dim; i++) out[i] += dot * e[i];
  }
  return out;
};

const norm2 = (v) => v.reduce((s, x) => s + x * x, 0);

// Group cell keys into subspace bases by an axis (op → Act groups, site → Site
// groups). Returns a Map label → orthonormal basis.
const groupProjectors = (vectors, axis) => {
  const groups = new Map();
  for (const [key, vec] of Object.entries(vectors)) {
    if (!Array.isArray(vec) || !vec.length) continue;
    const coords = cellCoords(key);
    if (!coords) continue;
    const label = coords[axis];
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(vec);
  }
  const out = new Map();
  for (const [label, vecs] of groups) out.set(label, orthonormal(vecs));
  return out;
};

export const probeC = (q, vectors, { baseline = 1e-6 } = {}) => {
  if (!q || !vectors) return Object.freeze({ probe: 'C', measurable: false, commutes: true, tv: 0 });
  const qn = norm2(q);
  if (!(qn > 0)) return Object.freeze({ probe: 'C', measurable: false, commutes: true, tv: 0 });
  const unit = q.map((x) => x / Math.sqrt(qn));

  const actGroups = groupProjectors(vectors, 'op');
  const siteGroups = groupProjectors(vectors, 'site');
  if (!actGroups.size || !siteGroups.size)
    return Object.freeze({ probe: 'C', measurable: false, commutes: true, tv: 0 });

  // Joint P(a,b): measure axis-1 outcome a (project onto a's subspace), then
  // axis-2 outcome b. P = ‖Π_b Π_a q‖². Build both orderings.
  const joint = (firstGroups, secondGroups) => {
    const table = {};
    for (const [a, basisA] of firstGroups) {
      const pa = project(unit, basisA);
      for (const [b, basisB] of secondGroups) {
        const pba = project(pa, basisB);
        table[`${a}|${b}`] = norm2(pba);
      }
    }
    return table;
  };
  const actThenSite = joint(actGroups, siteGroups);
  // Reverse ordering, re-keyed as `${a}|${b}` (a=Act, b=Site) so the two tables align.
  const siteThenAct = {};
  for (const [b, basisB] of siteGroups) {
    const pb = project(unit, basisB);
    for (const [a, basisA] of actGroups) {
      const pab = project(pb, basisA);
      siteThenAct[`${a}|${b}`] = norm2(pab);
    }
  }

  // Total-variation distance between the two joint tables. Zero (within baseline)
  // → the faces commute and the physics framing is decorative.
  const cellKeys = [...new Set([...Object.keys(actThenSite), ...Object.keys(siteThenAct)])];
  let tv = 0;
  for (const key of cellKeys) tv += Math.abs((actThenSite[key] || 0) - (siteThenAct[key] || 0));
  tv /= 2;

  return Object.freeze({
    probe: 'C', measurable: true,
    tv,
    commutes: tv <= baseline,
    baseline,
    actThenSite: Object.freeze(actThenSite),
    siteThenAct: Object.freeze(siteThenAct),
  });
};

// Re-export bornWeights for probe-side callers that hold raw amplitudes.
export { bornWeights };
