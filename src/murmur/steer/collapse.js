// EO: EVA·INS(Void,Atmosphere → Void,Atmosphere, Binding,Making) — the Born-rule collapse
// Most impressions stay in the audit stream and die there. An impression commits to the
// append-only log ONLY when it collapses under a Born-rule measurement — the mechanism that
// enforces "only if meaningful" (spec §4a). Treat the combined salience as an amplitude and
// let commit be the measurement:
//
//   s = surprise magnitude ∈ [0,1]   (semantic novelty, §7)
//   d = drift magnitude    ∈ [0,1]   (recession from anchor, §5)
//   ψ = √(s · d)                     (the amplitude)
//   P(commit) = |ψ|² = s · d         (the Born rule)
//   commit ⇐ sample(P) fires         (stochastic, not a hard threshold)
//
// Two load-bearing properties fall out:
//   · Squaring is a noise gate. A faint tremor (s=0.3, d=0.3) commits with p=0.09 — it stays
//     a private mutter and never reaches the log. Only high surprise AND high drift push p→1.
//     The conjunction is the product; no separate AND-gate needed.
//   · Sampling is a rumination guard (§8). A borderline hunch does not fire every turn, so the
//     same nag cannot machine-gun the log.

// amplitude(s, d) → ψ = √(s·d). Nulls read as 0 (no signal → no amplitude).
export const amplitude = (s, d) => {
  const ss = typeof s === 'number' && s > 0 ? Math.min(1, s) : 0;
  const dd = typeof d === 'number' && d > 0 ? Math.min(1, d) : 0;
  return Math.sqrt(ss * dd);
};

// commitProbability(s, d) → |ψ|² = s·d.
export const commitProbability = (s, d) => {
  const psi = amplitude(s, d);
  return psi * psi;
};

// bornCollapse({ surprise, drift }, rng) → { commit, p, psi }.
// `rng` is injectable (defaults to Math.random) so replay/tests can force or deny a collapse
// deterministically — the same seam the fold's deep-reader uses (seededRng).
export const bornCollapse = ({ surprise, drift } = {}, rng = Math.random) => {
  const psi = amplitude(surprise, drift);
  const p = psi * psi;
  const commit = p > 0 && rng() < p;
  return Object.freeze({ commit, p, psi });
};
