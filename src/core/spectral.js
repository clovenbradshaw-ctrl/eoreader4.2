// EO: SYN·DEF·EVA(Field,Lens → Lens,Paradigm, Composing,Dissecting,Tracing) — the density operator rho
// The density operator — the one interpretive object the Significance column reads.
//
// docs/cube.md #5/#6 and the significance-column spec: there is ONE interpretive
// object, a density operator
//
//     ρ(doc, frame) = Σₖ wₖ · sₖ · |vₖ⟩⟨vₖ| ,  trace-normalised,
//
// built purely from a document's cached unit vectors, salience-weighted by wₖ, with
// a SIGNED contribution sₖ from each unit's Resolution stance so an asserting reading
// and a defeating one of the same content INTERFERE rather than accumulate. ρ is the
// Horizon of the Significance row — the projection of the log into current
// interpretive state — and a mixture, not a vector, because a document is not one
// reading.
//
// This leaf is the linear algebra ONLY: it takes vectors, never an embedder and never
// a document, so it is testable with no corpus and the surfer stays acyclic (its only
// dependency is voidnull.js, the repo's Born rule, which the passes run their spectra
// against — not imported here, but this module is shaped to feed it). Three properties
// the column leans on, none bolted on:
//
//   • PURE ON VECTORS — never sees a modality, so the column runs unchanged on text,
//     audio, video (the cheap half of omnimodality, Track E).
//   • A PROBABILITY SIMPLEX — for an unsigned (PSD) build the eigenvalues are ≥0 and
//     sum to 1 (Born/Gleason), so ρ is at once the recognition object ("what readings
//     is this") and the prediction object ("what reading will the next unit fall
//     under, with what weight"). The signed build can leave the PSD cone; the spectrum
//     is then read by magnitude and the simplex claim is the unsigned default's.
//   • THE BASIS IS THE LOAD-BEARING CHOICE — ρ is meant to be built over the 27-cell
//     SIGNIFICANCE activations (classify/centroids.js), not raw embeddings, so its
//     eigenvectors are FRAMES (readings-under-a-frame), not TOPIC clusters. That
//     projection is the caller's job; this module is basis-agnostic and works in
//     whatever coordinates it is handed.
//
// The eigensolver is cyclic Jacobi for real symmetric matrices — exact to float
// tolerance, no dependency, trivially cheap at the 27-dim significance grain.

// ── matrix helpers (row-major arrays of arrays) ──────────────────────────────

const zeros = (n) => Array.from({ length: n }, () => new Array(n).fill(0));

const identity = (n) => {
  const I = zeros(n);
  for (let i = 0; i < n; i++) I[i][i] = 1;
  return I;
};

const matMul = (A, B) => {
  const n = A.length, m = B[0]?.length ?? 0, k = B.length;
  const C = Array.from({ length: n }, () => new Array(m).fill(0));
  for (let i = 0; i < n; i++)
    for (let p = 0; p < k; p++) {
      const a = A[i][p];
      if (a === 0) continue;
      for (let j = 0; j < m; j++) C[i][j] += a * B[p][j];
    }
  return C;
};

const transpose = (A) => {
  const n = A.length, m = A[0]?.length ?? 0;
  const T = Array.from({ length: m }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) T[j][i] = A[i][j];
  return T;
};

// Frobenius norm of a matrix — √Σ aᵢⱼ².
const frobenius = (A) => {
  let s = 0;
  for (const row of A) for (const x of row) s += x * x;
  return Math.sqrt(s);
};

// ── the symmetric eigensolver (cyclic Jacobi) ────────────────────────────────
//
// Diagonalise a real symmetric matrix A = V Λ Vᵀ. Returns eigenvalues (ascending is
// not guaranteed; the public eigenLenses sorts) and the eigenvectors as COLUMNS of V,
// surfaced as an array of unit row-vectors for convenience. Robust for the small
// (≤ a few hundred) symmetric matrices the significance basis produces.
export const symmetricEig = (Ain, { maxSweeps = 100, tol = 1e-14 } = {}) => {
  const n = Ain.length;
  if (n === 0) return { values: [], vectors: [] };
  const A = Ain.map(r => r.slice());
  const V = identity(n);

  const offDiagSq = () => {
    let s = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) s += A[p][q] * A[p][q];
    return s;
  };

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    if (offDiagSq() <= tol) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = A[p][q];
        if (Math.abs(apq) < 1e-300) continue;
        const app = A[p][p], aqq = A[q][q];
        // Rotation that zeroes A[p][q]: t = tan(θ) from the standard Jacobi formula.
        const theta = (aqq - app) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        // Apply the rotation to rows/cols p,q of A.
        for (let i = 0; i < n; i++) {
          const aip = A[i][p], aiq = A[i][q];
          A[i][p] = c * aip - s * aiq;
          A[i][q] = s * aip + c * aiq;
        }
        for (let i = 0; i < n; i++) {
          const api = A[p][i], aqi = A[q][i];
          A[p][i] = c * api - s * aqi;
          A[q][i] = s * api + c * aqi;
        }
        // Accumulate the eigenvectors.
        for (let i = 0; i < n; i++) {
          const vip = V[i][p], viq = V[i][q];
          V[i][p] = c * vip - s * viq;
          V[i][q] = s * vip + c * viq;
        }
      }
    }
  }

  const values = [];
  for (let i = 0; i < n; i++) values.push(A[i][i]);
  // Eigenvectors as rows (column j of V is the eigenvector for values[j]).
  const vectors = [];
  for (let j = 0; j < n; j++) {
    const v = new Array(n);
    for (let i = 0; i < n; i++) v[i] = V[i][j];
    vectors.push(v);
  }
  return { values, vectors };
};

// ── buildDensity ─────────────────────────────────────────────────────────────
//
// ρ = Σₖ wₖ sₖ |vₖ⟩⟨vₖ|, trace-normalised. `vectors` is an array of equal-length
// real vectors (the unit activations); `weights` the salience wₖ (default 1);
// `signs` the ±1 Resolution polarity (default +1 — asserting). The trace is
// Σₖ wₖ sₖ |vₖ|²; normalising by it makes Tr(ρ)=1. With all signs +1 and weights ≥0
// the result is PSD (a proper density matrix); a signed build can leave the cone,
// which is the documented research territory (signs let contradiction subtract).
export const buildDensity = (vectors, weights = null, signs = null) => {
  const vs = (vectors || []).filter(v => Array.isArray(v) && v.length);
  const dim = vs.length ? vs[0].length : 0;
  if (!dim) return { rho: [], dim: 0, trace: 0 };

  const rho = zeros(dim);
  let trace = 0;
  for (let k = 0; k < vs.length; k++) {
    const v = vs[k];
    if (v.length !== dim) continue;            // ragged input → skip, never crash
    const w = (weights && Number.isFinite(weights[k])) ? weights[k] : 1;
    const s = (signs && Number.isFinite(signs[k])) ? signs[k] : 1;
    const a = w * s;
    if (a === 0) continue;
    for (let i = 0; i < dim; i++) {
      const ai = a * v[i];
      if (ai === 0) continue;
      for (let j = 0; j < dim; j++) rho[i][j] += ai * v[j];
    }
    let norm2 = 0;
    for (let i = 0; i < dim; i++) norm2 += v[i] * v[i];
    trace += a * norm2;
  }
  if (Math.abs(trace) > 1e-300) {
    for (let i = 0; i < dim; i++) for (let j = 0; j < dim; j++) rho[i][j] /= trace;
  }
  return { rho, dim, trace };
};

// ── eigenLenses ──────────────────────────────────────────────────────────────
//
// The document's natural readings, ranked by Born weight. weight = eigenvalue; lens =
// the unit eigenvector. Ranked by eigenvalue (descending) — for a PSD ρ these are the
// Born probabilities and form a simplex; for a signed ρ they are ranked by signed
// magnitude so the dominant reading still leads. `k` caps the returned count.
export const eigenLenses = (rho, { k = Infinity } = {}) => {
  if (!rho?.length) return [];
  const { values, vectors } = symmetricEig(rho);
  const pairs = values.map((weight, i) => ({ weight, lens: vectors[i] }));
  pairs.sort((a, b) => b.weight - a.weight);
  return Number.isFinite(k) ? pairs.slice(0, Math.max(0, k | 0)) : pairs;
};

// ── SIG ───────────────────────────────────────────────────────────────
//
// Assign a direction to the reading it most belongs to under the Born rule — the
// measurement that turns a unit into a label, the atom every segmenter switches on.
//
// `signed = false` (default) ranks by |⟨u|lensᵢ⟩|² — the Born probability. This is
// SIGN-BLIND: a bipolar reading's two poles square to the same value, so when a
// BALANCED split is centred it collapses onto one axis (the two clusters become ±v of a
// single eigenvector) and both sides read as the SAME reading — no boundary. That silent
// failure is why a two-ball multiplicity, or the coarse level of a nested stream, reads
// as one reading under the squared rule.
//
// `signed = true` ranks by the SIGNED projection over the ± poles and returns a pole
// index (2i for +lensᵢ, 2i+1 for −lensᵢ), so the two sides of a balanced split land in
// different readings and the boundary appears. Unimodal readings are unaffected (every
// unit picks the same pole). Default stays squared, so existing callers are byte-identical.
//
//   dir     a (unit) direction vector.
//   lenses  eigenLenses output ({weight, lens}) or a bare array of lens vectors.
// Returns the reading index (squared) or pole index (signed). Pure.
export const SIG = (dir, lenses, { signed = false } = {}) => {
  let best = -Infinity, idx = 0;
  for (let i = 0; i < lenses.length; i++) {
    const lens = lenses[i]?.lens || lenses[i];
    let c = 0; for (let j = 0; j < dir.length; j++) c += dir[j] * lens[j];
    if (signed) {
      if (c > best) { best = c; idx = 2 * i; }
      if (-c > best) { best = -c; idx = 2 * i + 1; }
    } else {
      const v = c * c; if (v > best) { best = v; idx = i; }
    }
  }
  return idx;
};

// ── REC ────────────────────────────────────────────────────────────────
//
// The online reading decision — the branch point of the GENERATE operators. SIG
// always assigns a unit to its best reading; REC instead ABSTAINS to −1 when even
// the best reading only matches the unit at the chance `floor`. That −1 is where a new
// reading is born (INS); a non-negative return is a returning reading the unit merges
// into (SYN); and a reading set carried over from a prior context (REC) recognizes its
// known readings through exactly this call. It is the streaming complement to
// DEF's batch void: a per-unit novelty gate against a set of standing readings.
//
//   dir     a (unit) direction.
//   lenses  the standing readings (eigenLenses output or bare vectors).
//   floor   the chance-match ceiling; best |⟨dir|lens⟩|² must exceed it to count as a
//           match (0 = always match, i.e. plain SIG).
//   signed  pole-aware matching (see SIG).
// Returns the matched reading/pole index, or −1 for "novel" (no standing reading fits).
export const REC = (dir, lenses, { floor = 0, signed = false } = {}) => {
  if (!lenses?.length) return -1;
  const idx = SIG(dir, lenses, { signed });
  const lens = lenses[signed ? idx >> 1 : idx]?.lens || lenses[signed ? idx >> 1 : idx];
  let c = 0; for (let j = 0; j < dir.length; j++) c += dir[j] * lens[j];
  return (c * c > floor) ? idx : -1;
};

// ── EVA (EVA) ───────────────────────────────────────────────────────────
//
// The EVA operator — test a standing reading against the stream and reinforce or
// strain it. SIG/REC decide WHICH reading a unit belongs to; EVA scores
// how well the reading is HOLDING and, when it stops, defeats it. It is what makes a
// reading (or a carried REC prior) DEFEASIBLE rather than a fact: a fit at or above the
// expected membership `expect` reinforces (support ← γ·support + surplus, strain decays);
// a fit below it strains (strain ← γ·strain + shortfall, support decays); the reading is
// DEFEATED once strain overtakes support with enough evidence. The γ-decay makes both
// accumulators leaky, so a transient dip strains without defeating — only a SUSTAINED
// misfit (a genuine drift, a stale prior the world moved past) crosses over. This closes
// the DEF·EVA·REC loop: DEF asserts a reading, EVA tests it, REC revises on defeat.
//
//   ledger  the reading's running { support, strain } (missing → 0,0).
//   fit     how well this unit fits the reading (e.g. |⟨u|lens⟩|²), in [0,1].
//   gamma   the leak (default 0.85): lower forgets faster, higher holds a grudge longer.
//   expect  the membership a holding reading is expected to reach (the reinforce/strain
//           split point).
//   minEvidence  strain+support must exceed this before a defeat can fire (no defeat on
//           one or two units — a reading is given a chance to establish).
// Returns { support, strain, defeated }. Pure — a fold step, no state of its own.
export const EVA = (ledger, fit, { gamma = 0.85, expect = 0.3, minEvidence = 0.8 } = {}) => {
  const s0 = ledger?.support ?? 0, t0 = ledger?.strain ?? 0;
  let support, strain;
  if (fit >= expect) { support = gamma * s0 + (fit - expect); strain = gamma * t0; }
  else { strain = gamma * t0 + (expect - fit); support = gamma * s0; }
  const defeated = (support + strain > minEvidence) && strain > support;
  return { support, strain, defeated };
};

// ── NUL (NUL) ───────────────────────────────────────────────────────────────
//
// The NUL operator — non-transformation. A unit the reader neither lifts into a reading
// (SIG/SYN/INS) nor asserts absent (DEF to VOID) is HELD: appended to a reserve, untouched.
// This is the credence NUL — "never-probed → no opinion, return the prior": a held unit
// contributes NOTHING to the reading. In density terms it is the ADDITIVE IDENTITY — folded
// with weight 0 it leaves ρ exactly unchanged, so holding an ambiguous unit does not corrupt
// the standing readings the way forcing it into the nearest one would. NUL is held DISTINCT
// from VOID: the reserve is lossless and recoverable (INS may later lift it once it coheres),
// where VOID is a positive assertion that the slot is empty. Pure — returns a new reserve.
//
//   reserve  the current held reserve (array), or null/undefined to start one.
//   unit     the unit to NUL as-is (untransformed).
// Returns the reserve with `unit` appended. `NUL(r)` with no unit returns r unchanged
// (or []), so it composes as a fold.
export const NUL = (reserve, unit) => {
  const r = Array.isArray(reserve) ? reserve : [];
  return unit === undefined ? r.slice() : [...r, unit];
};

// ── CON ─────────────────────────────────────────────────────────────────
//
// The two-way holon CON, as one atom. Given a `part` signal and the `whole` it
// belongs to (a reference signal — a shared mode, a parent trajectory), decompose the
// part into the component the whole accounts for and the residual it does not:
//
//   part = k·whole + residual,   k = ⟨part|whole⟩ / ⟨whole|whole⟩   (the LS fit)
//
// `pull` = ⟨part|whole⟩² / (⟨part|part⟩⟨whole|whole⟩) is cos² = R², the fraction of the
// part's energy the whole sets — the regulative CON, "the high sets the probability
// of the low." `residual` is the part's OWN motion, its autonomy — and the input to the
// next holon level down (read the residual and its shared mode is the sub-whole). The
// SAME coefficient read the other way is how well the part reveals the whole — "the low
// sets the possibility of the high" — so one number carries both principles for a shared
// mode; only a separate STRUCTURAL reading (a rigid bond) tells constitution from pull.
//
//   part, whole   equal-length signal vectors.
// Returns { pull ∈ [0,1], k, residual }. Pure. pull=0 and residual=part when whole is null.
export const CON = (part, whole) => {
  let pw = 0, ww = 0, pp = 0;
  for (let i = 0; i < part.length; i++) { pw += part[i] * whole[i]; ww += whole[i] * whole[i]; pp += part[i] * part[i]; }
  const k = ww > 1e-12 ? pw / ww : 0;
  const residual = part.map((x, i) => x - k * whole[i]);
  const pull = (pp > 1e-12 && ww > 1e-12) ? (pw * pw) / (pp * ww) : 0;
  return { pull, k, residual };
};

// ── vonNeumann ───────────────────────────────────────────────────────────────
//
// S = −Σ λ ln λ over the eigenvalue spectrum — the concentration of readings (the
// NPOV scalar, and the predictive uncertainty of the next unit). 0 for a pure state
// (one eigenvalue 1), ln k for k equal eigenvalues (1/k each). Only positive
// eigenvalues contribute (0 ln 0 = 0; negative eigenvalues from a signed build are
// skipped — entropy is a property of the probability spectrum).
export const vonNeumann = (eigenvalues) => {
  let s = 0;
  for (const lambda of eigenvalues || []) {
    if (lambda > 1e-12) s -= lambda * Math.log(lambda);
  }
  return s;
};

// ── relEntropy (Umegaki, safe pseudo-log) ────────────────────────────────────
//
// S(ρ‖σ) = Tr(ρ ln ρ) − Tr(ρ ln σ), the quantum relative entropy — the Atmosphere
// pass's departure scalar (Track B). Computed through both spectra: with ρ = Σ λᵢ|i⟩⟨i|
// and σ = Σ μⱼ|j⟩⟨j|,
//     Tr(ρ ln ρ) = Σ λᵢ ln λᵢ,  Tr(ρ ln σ) = Σᵢⱼ λᵢ (ln μⱼ) |⟨i|j⟩|².
// The "safe pseudo-log" floors σ's eigenvalues at EPS so a σ near-null direction does
// not send the divergence to +∞ (which the exact Umegaki would, when ρ has support
// there). S(ρ‖ρ)=0 exactly: the overlaps collapse to δᵢⱼ and the two traces cancel.
const REL_EPS = 1e-12;
export const relEntropy = (rho, sigma) => {
  if (!rho?.length || !sigma?.length || rho.length !== sigma.length) return 0;
  const er = symmetricEig(rho);
  const es = symmetricEig(sigma);
  const n = rho.length;

  let trRlnR = 0;
  for (const lambda of er.values) if (lambda > REL_EPS) trRlnR += lambda * Math.log(lambda);

  let trRlnS = 0;
  for (let i = 0; i < n; i++) {
    const lambda = er.values[i];
    if (lambda <= REL_EPS) continue;
    const vi = er.vectors[i];
    for (let j = 0; j < n; j++) {
      const mu = es.values[j];
      const lnMu = Math.log(Math.max(mu, REL_EPS));   // pseudo-log floor
      const vj = es.vectors[j];
      let dot = 0;
      for (let p = 0; p < n; p++) dot += vi[p] * vj[p];
      trRlnS += lambda * lnMu * dot * dot;
    }
  }
  return Math.max(0, trRlnR - trRlnS);              // S(ρ‖σ) ≥ 0 (clamp float noise)
};

// ── projectorFrom / commutator ───────────────────────────────────────────────
//
// A projector onto a set of (unit) directions: Π = Σ |vᵢ⟩⟨vᵢ|. The Paradigm pass
// (Track D) compares the projectors of two competing bases.
export const projectorFrom = (vecs) => {
  const vs = (vecs || []).filter(v => Array.isArray(v) && v.length);
  const dim = vs.length ? vs[0].length : 0;
  const P = zeros(dim);
  for (const v of vs) {
    if (v.length !== dim) continue;
    for (let i = 0; i < dim; i++) {
      const vi = v[i];
      if (vi === 0) continue;
      for (let j = 0; j < dim; j++) P[i][j] += vi * v[j];
    }
  }
  return P;
};

// ‖[Π_A, Π_B]‖_F — the Frobenius norm of the commutator, the incommensurability
// scalar (Track D). Zero iff the two projectors share an eigenbasis (commute). Two
// bases learned from a corpus almost never commute exactly, so this is gated against
// a BASELINE, never against zero — the calibration the spec's "honest seam" demands.
export const commutator = (projA, projB) => {
  if (!projA?.length || !projB?.length || projA.length !== projB.length) return 0;
  const AB = matMul(projA, projB);
  const BA = matMul(projB, projA);
  const n = projA.length;
  const C = zeros(n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) C[i][j] = AB[i][j] - BA[i][j];
  return frobenius(C);
};

// ── applyStance — the nine moves on ρ, as four real-symmetric primitives ──────
//
// Track F (the Stance face). Tracks A–E READ ρ; this is what the surfer DOES to it.
// A real symmetric density operator admits only a few kinds of map, and they sort
// exactly into the three Modes of core/cube.js read as operations on ρ:
//
//   Differentiate (Clearing/Dissecting/Unraveling) — SHARPEN: project, dephase,
//     decompose. Lower entropy or remove a component.
//   Relate (Tending/Binding/Tracing) — SPECTRUM-PRESERVING: identity, rotation,
//     transport. Move the eigenvectors, conserve the eigenvalues.
//   Generate (Cultivating/Making/Composing) — PRODUCE: raise the floor, mint a
//     direction, build a basis. Raise rank or entropy.
//
// Crossed with the grain, the nine stances are nine specific moves — all expressible
// without leaving real symmetric matrices, by FOUR primitives: floor-shift, project,
// rank-1 update, rotate. (The honest seam: full CPTP / Lindblad open-system dynamics is
// far more than this needs and is deliberately resisted; this finite real-symmetric
// subset is the entire alphabet.) `firmness` ∈ (0,1] is the strength of the map — the
// Resolution-face spectrum as the third coordinate: a firm Dissecting is a sharp
// projector, a defeasible one a soft (POVM-like) partial measurement.

const renorm = (rho) => {
  const n = rho.length;
  let tr = 0;
  for (let i = 0; i < n; i++) tr += rho[i][i];
  if (Math.abs(tr) > 1e-300) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) rho[i][j] /= tr;
  return rho;
};
const clampPSD = (rho) => {
  // project to the PSD cone by zeroing negative eigenvalues, then renormalise — keeps a
  // floor-drop / signed move a valid density rather than letting it leave the cone.
  const { values, vectors } = symmetricEig(rho);
  const n = rho.length;
  const out = zeros(n);
  for (let m = 0; m < n; m++) {
    const lam = Math.max(0, values[m]);
    if (lam <= 0) continue;
    const v = vectors[m];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out[i][j] += lam * v[i] * v[j];
  }
  return renorm(out);
};

// rank-1 update: ρ ± f·|v⟩⟨v| — Making (+, mint a lens) and the signed Clearing of a
// defeated component (−, dephase it out). v is unit-normalised internally.
const rank1Update = (rho, v, f, sign = 1) => {
  const n = rho.length;
  let nv = 0; for (let i = 0; i < n; i++) nv += v[i] * v[i];
  nv = Math.sqrt(nv) || 1;
  const out = rho.map(r => r.slice());
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out[i][j] += sign * f * (v[i] / nv) * (v[j] / nv);
  return sign < 0 ? clampPSD(out) : renorm(out);
};
// floor-shift: ρ ± f·I/n — Cultivating (+, raise the floor uniformly, entropy up, no
// direction) and Clearing-the-floor (−, drop it). The Generate×Ground / Diff×Ground move.
const floorShift = (rho, f, sign = 1) => {
  const n = rho.length;
  const out = rho.map(r => r.slice());
  for (let i = 0; i < n; i++) out[i][i] += sign * f / n;
  return sign < 0 ? clampPSD(out) : renorm(out);
};
// soft projection onto a direction: (1−f)·ρ + f·(PρP)/tr — Dissecting (the sharp
// collapse at f=1, a partial measurement below it). Lowers entropy.
const projectOnto = (rho, v, f) => {
  const n = rho.length;
  let nv = 0; for (let i = 0; i < n; i++) nv += v[i] * v[i];
  nv = Math.sqrt(nv) || 1;
  const u = v.map(x => x / nv);
  let vRv = 0; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) vRv += u[i] * rho[i][j] * u[j];
  const out = zeros(n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++)
    out[i][j] = (1 - f) * rho[i][j] + f * vRv * u[i] * u[j];
  return renorm(out);
};
// Givens rotation of the (i,j) plane by f·θ — Binding (link two lenses), Tracing
// (transport the basis). Spectrum-preserving: ρ' = QρQᵀ.
const rotatePlane = (rho, i, j, theta) => {
  const n = rho.length;
  const c = Math.cos(theta), s = Math.sin(theta);
  const Q = identity(n);
  Q[i][i] = c; Q[i][j] = -s; Q[j][i] = s; Q[j][j] = c;
  return matMul(matMul(Q, rho), transpose(Q));
};

// The dispatch: (family, grain) → primitive. `lens` overrides the direction (else the
// top eigen-lens); `theta`/`amount` are the rotation angle / floor-mass scales.
export const applyStance = (rho, { family, grain, firmness = 1, lens = null, theta = Math.PI / 4, amount = 0.5 } = {}) => {
  if (!rho?.length) return rho;
  const f = Math.max(0, Math.min(1, firmness));
  const dir = () => lens || eigenLenses(rho, { k: 1 })[0]?.lens || null;
  const key = `${family}/${grain}`;
  switch (key) {
    case 'Generate/Figure':    { const v = dir(); return v ? rank1Update(rho, v, f * amount, +1) : rho; }   // Making
    case 'Differentiate/Figure': { const v = dir(); return v ? projectOnto(rho, v, f) : rho; }              // Dissecting
    case 'Differentiate/Ground': return floorShift(rho, f * amount, -1);                                    // Clearing
    case 'Generate/Ground':      return floorShift(rho, f * amount, +1);                                    // Cultivating
    case 'Generate/Pattern':     return floorShift(rho, f * amount, +1);                                    // Composing (basis-build)
    case 'Relate/Figure':        return rotatePlane(rho, 0, 1, f * theta);                                  // Binding
    case 'Relate/Pattern':       return rotatePlane(rho, 0, 1, f * theta);                                  // Tracing (transport)
    case 'Relate/Ground':        return rho.map(r => r.slice());                                            // Tending (identity)
    case 'Differentiate/Pattern': return rho.map(r => r.slice());                                           // Unraveling (decompose=read)
    default: return rho.map(r => r.slice());
  }
};

// matrix helpers exposed for the passes that assemble bases off ρ.
export { matMul, transpose, frobenius };
