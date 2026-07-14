// EO: CON(Network → Field, Binding,Tracing) — reciprocal rank fusion
// Reciprocal Rank Fusion — the cross-channel fuse the retrieval spec mandates
// (docs/retrieval-spec.md §4). It takes N ranked lists of span IDs — a lexical
// (BM25) ranking and a dense (embedding) ranking, each returning its own top-k —
// and folds them into ONE ranking by rank, not by score.
//
// Why rank, not score. Lexical and dense channels do not share a scale: a BM25
// sum and a cosine live in different units, so blending their raw scores needs a
// per-corpus calibration nobody will keep honest. RRF sidesteps that entirely —
// it reads only the POSITION a span took in each channel, so it needs no score
// normalization, no weight, and no hyperparameter anyone is tempted to tune on a
// hunch. It is robust to one channel returning garbage: a span the other channel
// ranks well still surfaces. k=60 is the standard constant from the RRF paper
// (Cormack et al.); it is not sensitive and is not a knob to tune.
//
// This is DELIBERATELY separate from hybrid.js's noisy-OR. That fuses two per-
// document channels' SCORES for a single loaded doc, where both channels read the
// same sentence index and a concordance posterior is the right instrument. RRF is
// the INDEX-LAYER fuse across a pinned, cross-corpus span index (spec §9 step 5),
// where the two channels rank disjoint span-ID spaces and only their ranks are
// comparable. One rule per problem; they do not replace each other.
//
// The score RRF computes is an ORDERING device and nothing more. Per spec §9 step
// 7 it is discarded at the retrieval boundary: `rrf` returns bare span IDs. A
// search UI that wants to show a number may call `rrfScored`, but that number must
// never cross into the tape (spec §10) — it is an attribute of a query→span link
// at most, never of a claim.

// The standard RRF constant. Not sensitive; not a tuning knob (spec §4).
export const RRF_K = 60;

// rrf(rankings, k?) → span IDs in fused order.
//   rankings  an array of rankings; each ranking is an array of span IDs, best
//             first (index 0 is rank 1). A span may appear in any subset of them.
// A span's fused weight is the sum over channels of 1 / (k + rank). Appearing high
// in one channel, or middling in several, both lift it. Absent from a channel just
// contributes nothing from that channel — never a penalty. Ties resolve by first
// appearance (Map insertion order + a stable sort), so the fuse is deterministic:
// the same inputs always yield the same order, which the replay bundle (spec §6)
// depends on.
export const rrf = (rankings = [], k = RRF_K) => {
  const scores = new Map();
  for (const ranking of rankings) {
    if (!Array.isArray(ranking)) continue;
    ranking.forEach((spanId, i) => {
      if (spanId == null) return;
      scores.set(spanId, (scores.get(spanId) ?? 0) + 1 / (k + i + 1));
    });
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([spanId]) => spanId);
};

// rrfScored(rankings, k?) → [{ spanId, score }] in fused order — the same fuse,
// keeping the score for a SEARCH UI only. The score orders a results list a human
// scans; it is not a warrant (spec §1) and must not travel with the span into the
// fold. Kept a separate export so the tape-facing path (`rrf`) cannot leak it by
// accident: to get a score you must ask for it, in a function whose name says UI.
export const rrfScored = (rankings = [], k = RRF_K) => {
  const scores = new Map();
  for (const ranking of rankings) {
    if (!Array.isArray(ranking)) continue;
    ranking.forEach((spanId, i) => {
      if (spanId == null) return;
      scores.set(spanId, (scores.get(spanId) ?? 0) + 1 / (k + i + 1));
    });
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([spanId, score]) => ({ spanId, score }));
};
