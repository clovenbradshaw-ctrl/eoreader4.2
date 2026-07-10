// EO: SIG·SEG·EVA(Field,Lens → Atmosphere,Lens, Tracing,Unraveling,Binding) — projectCredence, read side
// projectCredence — the second projection over the one append-only log
// (source-trajectory spec §7).
//
// This mirrors projectGraph exactly: pure on (log, frame), memoized on
// (log.length, frameSig), the rules arriving through frame.rules.credence with
// DEFAULT_CREDENCE_RULES as the fallback so the memo key serializes them. Same
// key, same result. The state is never stored — it is the fold of the credence
// events at a cursor, the same way the document graph is the fold of parse
// events. Lose it and rebuild by replay (§7, conformance §7).
//
// The fold reads only the five credence event kinds and is blind to everything
// else on the log, so projectGraph and projectCredence are two independent
// readings of one trail. A credence event carries op ∈ {EVA, SEG, NUL} (§8), all
// of which projectGraph already ignores — that is the golden-parity guarantee:
// with the channels OFF no credence event is ever written, and even when they ARE
// present the graph projection is byte-identical (tests/credence-parity).

import { createBetaFilter, createEwFilter } from './filters.js';

// The five writes, the only credence inputs (§3). A DEF credence verdict (§8) is
// an OUTPUT the book asserts, not an input channel, so it is deliberately absent.
export const CREDENCE_KINDS = new Set([
  'coherence_obs',      // EVA — internal coherence, the cheap bullshitter detector
  'corroboration_obs',  // EVA — independence-weighted survival, the slow alignment stand-in
  'revision_obs',       // EVA — signed response at a disconfirmation
  'changepoint',        // SEG — a regime boundary the detector named
  'credence_init',      // NUL — marks a (source, domain) never-set, distinct from low
]);

// The classifications (§5). NUL and CLEARED are the two void states held distinct
// from INDETERMINATE (observed-but-uncertain) — three states that never collapse
// to one (conformance §10).
export const CLASS = Object.freeze({
  NUL: 'NUL',                                   // never-probed (the void, never-set)
  CLEARED: 'CLEARED',                            // probed then reset; awaiting the new regime
  INDETERMINATE: 'INDETERMINATE',                // observed, coherence too thin to call
  BULLSHITTER: 'BULLSHITTER',                    // M confidently low — DEF-assertable, no truth needed
  SEEKER: 'SEEKER',                              // modelful, oriented toward the record — an interval, never DEF
  LIAR: 'LIAR',                                  // modelful, anti-aligned — flagged, recoverable under inversion
  MODELFUL_UNRESOLVED: 'MODELFUL_UNRESOLVED',    // modelful, O interval spans — await more independent probes
});

// O is NUL until M is high — there is no orientation without a model to orient
// (§5). A single frozen sentinel so callers can test `O === NUL_O` cheaply.
export const NUL_O = Object.freeze({ nul: true });

export const DEFAULT_CREDENCE_RULES = Object.freeze({
  // Forgetting rates (§4). Coherence forgets faster than corroboration because
  // behaviour can flip quickly and a track record is more stable; revision turns
  // over fastest of all, on the scale of disconfirmation events.
  lambda_C: 0.95,   // effective memory ≈ 20 observations
  lambda_K: 0.99,   // effective memory ≈ 100 observations
  lambda_R: 0.9167, // effective memory ≈ 12 disconfirmation events

  // Beta priors — uniform, so a cold cell sits at 0.5 with a wide interval and is
  // pulled to a verdict only by evidence. Never-set is held separately (the NUL
  // marker), so this prior is never mistaken for a low score.
  C_alpha0: 1, C_beta0: 1,
  K_alpha0: 1, K_beta0: 1,

  // M: modelfulness (§5). The convergence gate needs this many coherence probes
  // before it credits any model, and collapses when per-probe coherence varies
  // more than this (the "washes out under resampling" bullshitter signal).
  tomographic_min_n: 4,
  tomographic_var_max: 0.06,
  // The rigid-but-modelful credit: a source whose revision holds its shape (low
  // variance) is modelful even at low coherence — but only once R has evidence.
  Rvar_max: 0.2,
  rev_min_obs: 3,

  // The credible-interval tails (§4) and the matching z for O's revision side.
  cred_lo_p: 0.05,
  cred_hi_p: 0.95,
  interval_z: 1.6448536269514722,   // Φ⁻¹(0.95)

  // O: orientation (§5). g(K, R) — weight on independence-weighted survival vs
  // the sign of revision. Survival is mapped (2K−1) onto [−1, 1] so K = 0.5
  // (chance) is zero orientation.
  o_weight_k: 0.6,
  o_weight_r: 0.4,

  // Classification thresholds (§5). m_lo < m_hi and o_lo < o_hi; the asymmetry is
  // the cost structure — BULLSHITTER is the confident-low-M call the system
  // asserts, SEEKER/LIAR are confident-O calls that ship as intervals.
  m_lo: 0.35, m_hi: 0.55,
  o_lo: -0.15, o_hi: 0.15,

  // Page-Hinkley changepoint sensitivity (§6), used at write time by the book.
  // On the bounded channels, delta is an absolute tolerance: above within-regime
  // jitter, below a real regime shift. Stationary noise (erratic or tight) never
  // accumulates; a sustained mean shift trips the threshold within a step or two.
  ph_delta: 0.3,
  ph_threshold: 0.5,
  ph_warmup: 5,
  // Which channels carry a regime boundary. Coherence and corroboration are
  // bounded in [0,1], where the absolute delta above is calibrated; a break in
  // them is degradation or reform. Revision is signed in [−1,1] and its regime
  // signal is its VARIANCE (which feeds M directly) — a high-variance revision
  // stream is the bullshitter seen in motion, not a sequence of regimes — so it
  // is left off the segmenter and never fragments a stationary source.
  ph_channels: ['coherence', 'corroboration'],
});

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// ── The cell: one (source, domain, regime) of state (§2) ──────────────────────
// Three filtered estimators, the derived coordinates with their intervals, the
// classification, the velocity inside the regime, and the summary of the regime
// before the last break. Built fresh inside a fold and never shared.
const makeCell = (source_id, domain, rules) => {
  const cell = {
    source_id, domain,
    regime_start_cursor: null,
    C: createBetaFilter(rules.C_alpha0, rules.C_beta0, rules.lambda_C),
    Cstab: createEwFilter(rules.lambda_C),   // per-probe coherence variance → tomographic convergence
    K: createBetaFilter(rules.K_alpha0, rules.K_beta0, rules.lambda_K),
    R: createEwFilter(rules.lambda_R),
    M: { mean: 0, lo: 0, hi: 0 },
    O: NUL_O,
    classification: CLASS.NUL,
    velocity: { dM: 0, dO: 0 },
    prior_regime: null,
    // Bookkeeping the fold needs but the public read does not expose raw.
    _obs: 0,            // observations in the CURRENT regime
    _regimeStart0: null, // M/O snapshot at the regime's first recompute, for velocity
  };

  cell.observeCoherence = (x, w = 1) => {
    cell.C.update(x, w);
    cell.Cstab.update(x);
    cell._obs += 1;
  };
  cell.observeCorroboration = (x, w) => {
    cell.K.update(x, w);
    cell._obs += 1;
  };
  cell.observeRevision = (r) => {
    cell.R.update(clamp(r, -1, 1));
    cell._obs += 1;
  };

  // SEG: a regime boundary. Summarise the regime that just ended, then start the
  // next one on fresh estimators. The sharp down-weighting of pre-break evidence
  // the run-length posterior would do, made mechanical (§6).
  cell.resplit = (cursor) => {
    cell.prior_regime = Object.freeze({
      M: cell.M, O: cell.O === NUL_O ? null : cell.O,
      classification: cell.classification,
      regime_start: cell.regime_start_cursor,
      regime_end: cursor,
    });
    cell.C = createBetaFilter(rules.C_alpha0, rules.C_beta0, rules.lambda_C);
    cell.Cstab = createEwFilter(rules.lambda_C);
    cell.K = createBetaFilter(rules.K_alpha0, rules.K_beta0, rules.lambda_K);
    cell.R = createEwFilter(rules.lambda_R);
    cell._obs = 0;
    cell._regimeStart0 = null;
    cell.regime_start_cursor = cursor;
  };

  // REC: recompute the derived coordinates from the filters after every event.
  cell.recompute = () => {
    // ── M: modelfulness ──
    const Cmean = cell.C.mean;
    const [Clo, Chi] = cell.C.interval(rules.cred_lo_p, rules.cred_hi_p);
    // Tomographic convergence: stability of per-probe coherence, ramped by how
    // many probes we have. A bullshitter's coherence both sits low AND washes
    // out under resampling (high per-probe variance) → low convergence → low M.
    const probeRamp = Math.min(1, cell.C.effN / rules.tomographic_min_n);
    const stability = 1 - Math.min(1, cell.Cstab.var / rules.tomographic_var_max);
    const conv = probeRamp * stability;
    // The truth-seeker and the rigid liar both have a model: coherent claims, or
    // claims that hold their shape under pressure (low revision variance).
    const revModel = cell.R.n >= rules.rev_min_obs
      ? 1 - Math.min(1, cell.R.var / rules.Rvar_max)
      : 0;
    const Mmean = conv * Math.max(Cmean, revModel);
    const Mlo   = conv * Math.max(Clo, revModel);
    const Mhi   = conv * Math.max(Chi, revModel);
    cell.M = { mean: Mmean, lo: Mlo, hi: Mhi };

    // ── O: orientation, meaningful only where M is high ──
    if (Mlo <= rules.m_hi) {
      cell.O = NUL_O;
    } else {
      const z = rules.interval_z;
      const Kmean = cell.K.mean;
      const [Klo, Khi] = cell.K.interval(rules.cred_lo_p, rules.cred_hi_p);
      const wk = rules.o_weight_k, wr = rules.o_weight_r;
      const Rsd = Math.sqrt(Math.max(0, cell.R.var));
      const g = (kv, rv) => clamp(wk * (2 * kv - 1) + wr * rv, -1, 1);
      cell.O = {
        mean: g(Kmean, cell.R.mean),
        lo:   g(Klo, cell.R.mean - z * Rsd),
        hi:   g(Khi, cell.R.mean + z * Rsd),
      };
    }

    // ── classification ──
    cell.classification = classify(cell, rules);

    // ── velocity: the heading inside the current regime (§6) ──
    if (cell._regimeStart0 == null) {
      cell._regimeStart0 = { M: Mmean, O: cell.O === NUL_O ? null : cell.O.mean };
    }
    cell.velocity = {
      dM: Mmean - cell._regimeStart0.M,
      dO: cell.O === NUL_O || cell._regimeStart0.O == null
        ? 0
        : cell.O.mean - cell._regimeStart0.O,
    };
  };

  return cell;
};

// The classification, with the asymmetry the cost structure forces (§5), and the
// three void states held distinct (§10).
const classify = (cell, rules) => {
  if (cell._obs === 0) return cell.prior_regime ? CLASS.CLEARED : CLASS.NUL;
  const { M, O } = cell;
  // The confident-low-M call must rest on ACTUAL coherence probes — never on the
  // convergence gate reading zero merely because the channel was never run. A cell
  // with corroboration but no coherence has M = 0 by absence, not by measurement;
  // that is observed-but-uncertain, not an assertable bullshitter.
  if (M.hi < rules.m_lo) {
    return cell.C.effN >= rules.tomographic_min_n ? CLASS.BULLSHITTER : CLASS.INDETERMINATE;
  }
  if (M.lo > rules.m_hi) {                                // confidently high M — O is meaningful
    if (O === NUL_O) return CLASS.MODELFUL_UNRESOLVED;
    if (O.lo > rules.o_hi) return CLASS.SEEKER;           // oriented toward the record — an interval
    if (O.hi < rules.o_lo) return CLASS.LIAR;             // anti-aligned — recoverable under inversion
    return CLASS.MODELFUL_UNRESOLVED;                     // O interval spans zero — await more probes
  }
  return CLASS.INDETERMINATE;                              // need more coherence probes
};

// Independence combine (§10): the effective number of INDEPENDENT corroborators.
// A sock-puppet cluster (shared author/feed/template → w_indep ≈ 0) collapses to
// ≈ one effective source, so it cannot inflate K the way a like-sized independent
// set does. This is the soft spot the spec names; it lives behind a weight, not a
// fraction, so the raw survival stays auditable in the event payload.
export const weightByIndep = (corroborators) => {
  if (!Array.isArray(corroborators) || corroborators.length === 0) return 1;
  let w = 0;
  for (const c of corroborators) w += clamp(Number(c && c.w_indep), 0, 1) || 0;
  return Math.max(0, w);
};

// Deterministic canonical serialization of the relevant frame, mirroring
// project.js canonicalFrame — sorted keys, recursive on plain objects — so the
// memo key is stable and a replay hits the same cache (conformance §7).
const canonical = (v) => {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return '{' + Object.keys(v).sort()
      .map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
};

const memo = new WeakMap();   // log → { length, frameSig, result }

// eventsUpTo — the cursor bound. The credence cursor is the trajectory's own time
// index (each event carries its `cursor`); where absent we fall back to the log
// seq. A null frame.cursor folds the whole log. Implemented here rather than on
// the core log so the genome (the append-only log) stays untouched.
const eventsUpTo = (events, cursor) =>
  cursor == null
    ? events
    : events.filter(e => (e.cursor != null ? e.cursor : e.seq) <= cursor);

export const projectCredence = (log, frame = {}) => {
  const rules = { ...DEFAULT_CREDENCE_RULES, ...((frame.rules && frame.rules.credence) || {}) };
  const frameSig = canonical({ cursor: frame.cursor ?? null, rules });
  const cached = memo.get(log);
  if (cached && cached.length === log.length && cached.frameSig === frameSig) {
    return cached.result;
  }
  const result = compute(log, frame, rules);
  memo.set(log, { length: log.length, frameSig, result });
  return result;
};

export const credenceStats = (log) => {
  const c = memo.get(log);
  return c ? { cached: true, atLength: c.length, frameSig: c.frameSig } : { cached: false };
};

const compute = (log, frame, rules) => {
  const events = eventsUpTo(log.snapshot(), frame.cursor);
  const book = new Map();   // source_id → Map<domain, cell>

  const getCell = (source_id, domain) => {
    let byDomain = book.get(source_id);
    if (!byDomain) { byDomain = new Map(); book.set(source_id, byDomain); }
    let cell = byDomain.get(domain);
    if (!cell) {
      cell = makeCell(source_id, domain, rules);
      cell.regime_start_cursor = null;
      byDomain.set(domain, cell);
    }
    return cell;
  };

  for (const ev of events) {
    if (!CREDENCE_KINDS.has(ev.kind)) continue;
    const cell = getCell(ev.source_id, ev.domain);
    const at = ev.cursor != null ? ev.cursor : ev.seq;
    if (cell.regime_start_cursor == null) cell.regime_start_cursor = at;
    switch (ev.kind) {
      case 'coherence_obs':     cell.observeCoherence(ev.x, ev.weight == null ? 1 : ev.weight); break;
      // The independence-weighted survival rides on the event as `indep_weight`
      // (the book computes the effective-independent count at write time, §10);
      // fall back to a plain independence sum if an event predates it.
      case 'corroboration_obs': cell.observeCorroboration(ev.x, ev.indep_weight != null ? ev.indep_weight : weightByIndep(ev.corroborators)); break;
      case 'revision_obs':      cell.observeRevision(ev.r); break;
      case 'changepoint':       cell.resplit(at); break;       // SEG
      case 'credence_init':     break;                          // NUL — cell now exists as never-set
    }
    cell.recompute();
  }

  return freezeBook(book);
};

// The public, read-only shape: Map<source_id, Map<domain, state>>, each state the
// spec's credence(source, domain, cursor) record (§6). Frozen so a caller cannot
// mutate the projection.
const freezeBook = (book) => {
  const out = new Map();
  for (const [source_id, byDomain] of book) {
    const od = new Map();
    for (const [domain, cell] of byDomain) {
      od.set(domain, Object.freeze({
        source_id, domain,
        M: Object.freeze({ ...cell.M }),
        O: cell.O === NUL_O ? NUL_O : Object.freeze({ ...cell.O }),
        classification: cell.classification,
        regime_start: cell.regime_start_cursor,
        velocity: Object.freeze({ ...cell.velocity }),
        prior_regime: cell.prior_regime,
        // The effective sample sizes, so a reader can see how far from the
        // asymptote a SEEKER/LIAR interval still is (it never closes — §13).
        evidence: Object.freeze({
          coherence_n: cell.C.effN,
          corroboration_n: cell.K.effN,
          revision_n: cell.R.n,
        }),
      }));
    }
    out.set(source_id, od);
  }
  return out;
};

// credence(book, source, domain) — the point lookup the spec's signature names.
// Returns the frozen state, or a NUL-never-set state when the (source, domain)
// has no observations at all (held distinct from a low score — §2, §10).
export const credence = (book, source_id, domain) => {
  const state = book.get(source_id)?.get(domain);
  if (state) return state;
  return Object.freeze({
    source_id, domain,
    M: Object.freeze({ mean: 0, lo: 0, hi: 0 }),
    O: NUL_O,
    classification: CLASS.NUL,
    regime_start: null,
    velocity: Object.freeze({ dM: 0, dO: 0 }),
    prior_regime: null,
    evidence: Object.freeze({ coherence_n: 0, corroboration_n: 0, revision_n: 0 }),
  });
};
