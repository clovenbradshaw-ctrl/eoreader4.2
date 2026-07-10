// EO: SIG(Field → Atmosphere, Tending) — forgetting Beta/EW estimators
// The credence estimators (source-trajectory spec §4).
//
// Two filters, both forgetting, both deterministic — no RNG, so a projection
// of the same event stream is byte-identical on replay (conformance §7). A
// Beta forgetting filter for the two bounded channels (coherence C, corroboration
// survival K); an exponentially-weighted mean/variance for the signed revision
// channel R.
//
// Forgetting is the whole point: it keeps the effective sample size bounded so
// the estimate tracks the CURRENT regime rather than the all-time average. Old
// evidence fades; a source that reforms recovers; a source that degrades loses
// its prior standing. (§4, §6.)
//
// The filters are plain mutable objects, created fresh inside a single fold and
// never shared across projections — the same discipline projectGraph uses when
// it builds fresh Maps each pass. The state is never stored; it is the fold of
// the events (§7).

// ── The regularized incomplete Beta function and its inverse ──────────────────
// Beta_quantile(α, β, p) — the credible-interval endpoints the spec asks for
// (§4 `Beta_quantile(alpha, beta, [0.05, 0.95])`). Implemented from the
// continued-fraction I_x(a,b) (Numerical Recipes `betai`/`betacf`) plus a
// bisection inverse. Pure arithmetic, deterministic to ~1e-12 — the interval is
// the thing the seeker/liar call ships as (§5), so it must be reproducible.

// Lanczos log-Γ — the normaliser of I_x(a,b).
const logGamma = (x) => {
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
};

// Continued fraction for the incomplete Beta (Lentz's method).
const betacf = (a, b, x) => {
  const MAXIT = 300, EPS = 3e-14, FPMIN = 1e-300;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
};

// I_x(a,b) — the regularized incomplete Beta, i.e. the Beta(a,b) CDF at x.
export const betai = (a, b, x) => {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta = logGamma(a + b) - logGamma(a) - logGamma(b);
  const bt = Math.exp(lbeta + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2)
    ? (bt * betacf(a, b, x)) / a
    : 1 - (bt * betacf(b, a, 1 - x)) / b;
};

// Beta_quantile — the inverse CDF by bisection. 80 halvings ≈ 1e-24 in x, far
// below the filters' own resolution; deterministic and monotone.
export const betaInv = (p, a, b) => {
  if (!(p > 0)) return 0;
  if (p >= 1) return 1;
  let lo = 0, hi = 1;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (betai(a, b, mid) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
};

// ── The Beta forgetting filter (C, K) ─────────────────────────────────────────
// state (α, β), init (α0, β0). Each step decays toward the prior by λ, then the
// observation x∈[0,1] with weight w adds w·x to α and w·(1−x) to β. The decay is
// what bounds eff_n near w̄/(1−λ): the prior keeps leaking back in, so a finite
// window of evidence is all that ever accumulates.
export const createBetaFilter = (alpha0 = 1, beta0 = 1, lambda = 0.95) => {
  let alpha = alpha0, beta = beta0;

  const forget = (steps = 1) => {
    // λ^steps for an elapsed gap; the usual per-step decay when steps = 1.
    const l = Math.pow(lambda, steps);
    alpha = l * alpha + (1 - l) * alpha0;
    beta  = l * beta  + (1 - l) * beta0;
  };

  const update = (x, w = 1, steps = 1) => {
    forget(steps);
    const xx = Math.min(1, Math.max(0, x));
    alpha += w * xx;
    beta  += w * (1 - xx);
  };

  return {
    update,
    forget,
    get alpha() { return alpha; },
    get beta()  { return beta; },
    get mean()  { return alpha / (alpha + beta); },
    // Beta variance αβ / ((α+β)²(α+β+1)). Shrinks as evidence concentrates the
    // mass — the interval-tightening the asymptotic axis rides on (§5, §8).
    get var() {
      const s = alpha + beta;
      return (alpha * beta) / (s * s * (s + 1));
    },
    // The [0.05, 0.95] credible interval the classification reads as M.lo/M.hi
    // and feeds into O.lo/O.hi.
    interval(loP = 0.05, hiP = 0.95) {
      return [betaInv(loP, alpha, beta), betaInv(hiP, alpha, beta)];
    },
    // Effective sample size: evidence accumulated above the prior, bounded near
    // w̄/(1−λ) by the forgetting. The convergence gate ramps on this (§5).
    get effN() { return (alpha + beta) - (alpha0 + beta0); },
  };
};

// ── The exponentially-weighted mean/variance filter (R, and the coherence
// stability tracker) ──────────────────────────────────────────────────────────
// mean ← λ·mean + (1−λ)·r ; var ← λ·var + (1−λ)·(r−mean)². The spec writes the
// variance against the freshly-updated mean (§4), so we do the same — the order
// is part of the contract a replay must reproduce. `n` counts updates so a
// cold-start filter contributes nothing until it has evidence (§5 cold start).
//
// The first observation SEEDS the mean (and leaves the variance at zero) rather
// than dragging it up from a phantom zero: the standard EWMA initialization. Skip
// it and the warm-up transient — (x − 0)² on the first step — masquerades as
// dispersion for the filter's whole memory window, and the tomographic
// convergence gate (which reads this variance) would mistake every fresh source
// for an unstable one.
export const createEwFilter = (lambda = 0.9) => {
  let mean = 0, variance = 0, n = 0;
  return {
    update(r) {
      if (n === 0) { mean = r; n = 1; return; }
      mean = lambda * mean + (1 - lambda) * r;
      variance = lambda * variance + (1 - lambda) * (r - mean) * (r - mean);
      n += 1;
    },
    get mean() { return mean; },
    get var()  { return variance; },
    get n()    { return n; },
  };
};
