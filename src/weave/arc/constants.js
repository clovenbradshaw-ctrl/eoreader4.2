// EO: NUL(Atmosphere → Atmosphere, Clearing) — arc thresholds and priors
// The arc's constants. Length is emergent — these set the GRAIN at which
// evidence is read (what counts as bindable, what counts as a cluster) and the
// GUARDS that catch a runaway. None of them is a token target; the only genuine
// length knob is the three-valued `coverage` policy the caller passes.
//
// Every threshold here is a prior the audit can read off: when an arc surprises
// you with its length, the length-decision trace names which of these bound it.

// SUPPLY — what evidence is bindable, and how it clusters.
//
// BIND_THRESHOLD — the fused-retrieval score below which a span is too weak to
// found a section on. The same noisy-OR posterior the retrieve holon emits, so
// this is "the reader found at least this much concordant evidence for it."
export const BIND_THRESHOLD = 0.15;
// CLUSTER_COS — leader-clustering radius (§11.1: the fixed-cosine-threshold
// option). A bindable span joins an existing cluster when its embedding's
// cosine to that cluster's centroid clears this; otherwise it seeds a new one.
// Each cluster is a candidate section; its spans are disjoint from every other
// cluster's, so sections never re-bind each other's evidence by construction.
export const CLUSTER_COS = 0.5;

// DEMAND × SUPPLY — how much of the evidence the plan must cover.
//
// COVERAGE_CUT — `standard` stops adding clusters once their cumulative mass
// clears this fraction of the total. `terse` takes the single strongest;
// `exhaustive` takes every cluster above BIND_THRESHOLD.
export const COVERAGE_CUT = 0.8;

// PER-SECTION BUDGET — floor and ceiling, in tokens.
//
// FLOOR_TOKENS — the minimum to state one claim plus its citation. The fix for
// the SFT-bound premature-stop: a small model left alone ends a section after a
// fragment, so the floor makes it commit at least one full grounded statement.
// Advisory at this (orchestration) layer; the model holon's min_tokens logit
// processor enforces it when the backend exposes one (spec-the-lens-port).
export const FLOOR_TOKENS = 40;
// ceilingFor — monotone in the cluster's bindable mass AND its span count. You
// cannot faithfully say more than your spans support, so the ceiling scales
// with the evidence, never with a global target.
const CEIL_BASE = 48, CEIL_PER_SPAN = 40, CEIL_PER_MASS = 24, CEIL_MAX = 512;
export const ceilingFor = ({ mass = 0, spans = [] } = {}) =>
  Math.min(CEIL_MAX,
    Math.max(FLOOR_TOKENS,
      Math.round(CEIL_BASE + CEIL_PER_SPAN * spans.length + CEIL_PER_MASS * mass)));

// FAITHFULNESS GATE — how much of a generated section must bind.
//
// REBIND_THRESHOLD — at or above this bound fraction a drifting section is
// truncated to its bound prefix and kept; below it the section is regenerated
// once with the unbound claims stripped, and dropped if it still cannot bind.
export const REBIND_THRESHOLD = 0.5;

// SATURATION (EVA → NUL) — the actual stop condition.
//
// EPSILON — terminate when the un-covered mass falls below this fraction of the
// total: the budget is spent.
export const EPSILON = 0.05;
// NOVELTY_FLOOR — terminate when the next section's spans are this overlapped
// with what is already covered: it would only re-cite, not add coverage.
export const NOVELTY_FLOOR = 0.15;

// BACKSTOPS — runaway guards, not policy (§5.7). If saturation is working they
// never bind; a trace that shows one firing is a signal worth reading, not a
// normal stop.
export const MAX_SECTIONS = 12;
export const MAX_TOTAL_TOKENS = 4096;
