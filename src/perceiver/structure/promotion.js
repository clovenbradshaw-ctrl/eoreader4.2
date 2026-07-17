// EO: REC·EVA·DEF(Network,Lens → Paradigm,Lens, Composing,Tracing,Unraveling) — pattern promotion/demotion (§4)
// The pipeline that turns a proposed shape into structural memory — and, symmetrically, retires a
// shape that stops holding. It reuses the-work-v3-spec's three sub-cuts (presence@NUL/SIG,
// argument@INS, predicate@residual) applied to PATTERN-candidates instead of reference-binding, and
// adds nothing new: a promotion is a REC (learn rule), a demotion is a REC (revise/retire), a
// conflict between two promoted patterns for one zone is an ordinary DEF-conflict adjudicated by EVA.
//
// Two rules carry the weight, both from the spec:
//   · CROSS-DOCUMENT corroboration only (§4.2). Recurrence WITHIN one document is one witness
//     repeated, not many witnesses. The count that decides promotion is the number of DISTINCT
//     source docs, never the raw corroboration length — so a pattern cannot bootstrap itself off one
//     verbose file.
//   · a MANDATORY ruled-out-other on every corroborating instance (§4.3). A witness that records
//     only the shape it matched is discarded from the count; the strongest excluded near-miss is the
//     price of admission (core/cut.js makeRuledOut is the currency).
//
// Pure and model-free. The clock/id a REC needs is INJECTED by the caller (index.js); this module
// only DECIDES — it returns the REC/EVA tuples, it never appends them.

import { VERDICTS } from '../../core/index.js';
import { PATTERN_STATUS } from './pattern.js';

// A corroboration counts toward promotion only if it is a SUPPORTING witness — it names a distinct
// source doc AND carries a ruled-out-other (§4.3). This is the filter every count below runs first.
const isSupporting = (c) => !!c && c.source_doc != null && c.ruled_out_other != null;

// distinctWitnessDocs(corroboration) → the number of DISTINCT source docs among the supporting
// witnesses (§4.2). The integer that decides promotion. Two witnesses on doc:A are one; a witness
// with no ruled-out-other is zero. Also returns the doc set for the audit trail.
export const distinctWitnessDocs = (corroboration = []) => {
  const docs = new Set();
  for (const c of corroboration) if (isSupporting(c)) docs.add(c.source_doc);
  return { count: docs.size, docs: Object.freeze([...docs]) };
};

// evaluatePromotion(pattern) → { fires, status, distinct, threshold, reason }
//   fires    a REC tuple (op:'REC', kind:'promote-pattern', …) when the pattern crosses threshold
//            from candidate → promoted, else null. The tuple is what index.js appends.
//   status   the status the pattern SHOULD hold after this evaluation (unchanged unless it fires).
// The threshold is read off the pattern's OWN def (a DEF, §2), never a code constant — so a pattern
// carrying a revised threshold is judged by it. A demoted pattern is not re-promoted here (that is a
// fresh candidacy, an explicit re-instatement, not an automatic bounce-back).
export const evaluatePromotion = (pattern) => {
  const threshold = pattern?.def?.promotion_threshold ?? Infinity;
  const { count, docs } = distinctWitnessDocs(pattern?.corroboration || []);
  const status = pattern?.def?.status ?? PATTERN_STATUS.CANDIDATE;
  const crosses = status === PATTERN_STATUS.CANDIDATE && count >= threshold;
  if (!crosses) {
    return Object.freeze({
      fires: null, status, distinct: count, threshold, docs,
      reason: status === PATTERN_STATUS.PROMOTED ? 'already-promoted'
        : status === PATTERN_STATUS.DEMOTED ? 'demoted-not-auto-repromoted'
        : `below-threshold:${count}/${threshold}`,
    });
  }
  return Object.freeze({
    fires: Object.freeze({
      op: 'REC', kind: 'promote-pattern', pattern: pattern.record_id,
      from: PATTERN_STATUS.CANDIDATE, to: PATTERN_STATUS.PROMOTED,
      distinct: count, threshold, witnessDocs: docs,
      reason: `corroboration ${count} crossed threshold ${threshold} across distinct documents`,
    }),
    status: PATTERN_STATUS.PROMOTED, distinct: count, threshold, docs,
    reason: 'promoted',
  });
};

// ── demotion (mandatory, symmetric) ──────────────────────────────────────────────────────────────
// A promoted pattern is NOT immune to revision (the Newton/Mercury precedent for DEF/EVA generally).
// If new instances fail EVA against its detection_params at a rate exceeding NOISE, that is grounds
// for a REC that revises or retires the pattern. Without this path a promoted pattern calcifies —
// the same failure the wiki documents under "what goes wrong without REC", relocated to the pattern
// layer.
//
// `evaResults` is a list of per-instance EVA verdicts against the pattern (each { verdict } from
// core/verdicts.js). The FAILURE RATE is the fraction that CONTRADICTED — an instance the pattern
// was matched to but that the fold rejected. `noiseRate` is the tolerated background of honest
// misfires (a policy, like alpha, not a magic constant); above it the pattern is no longer earning
// its promotion.
//
// The decision is graded, not binary:
//   · retire  — failure rate ≥ 2× noise AND the surviving support is thin (≤ threshold): the shape
//     stopped being a shape. REC to demoted.
//   · revise  — failure rate exceeds noise but real support remains: the shape drifted; REC to
//     re-derive detection_params (kept candidate-of-a-revision, not retired).
//   · keep    — failure rate within noise.
export const evaluateDemotion = (pattern, evaResults = [], { noiseRate = 0.1 } = {}) => {
  const status = pattern?.def?.status ?? PATTERN_STATUS.CANDIDATE;
  const results = (evaResults || []).filter(Boolean);
  const n = results.length;
  const failures = results.filter((r) => r.verdict === VERDICTS.CONTRADICTED).length;
  const rate = n ? failures / n : 0;
  const { count: support } = distinctWitnessDocs(pattern?.corroboration || []);
  const threshold = pattern?.def?.promotion_threshold ?? Infinity;

  // Demotion only applies to a promoted pattern; a candidate that fails just doesn't get promoted.
  if (status !== PATTERN_STATUS.PROMOTED || n === 0)
    return Object.freeze({ fires: null, action: 'keep', rate, failures, n, reason: status !== PATTERN_STATUS.PROMOTED ? 'not-promoted' : 'no-instances' });

  if (rate <= noiseRate)
    return Object.freeze({ fires: null, action: 'keep', rate, failures, n, reason: `within-noise:${rate.toFixed(2)}<=${noiseRate}` });

  const retire = rate >= 2 * noiseRate && support <= threshold;
  const action = retire ? 'retire' : 'revise';
  return Object.freeze({
    fires: Object.freeze({
      op: 'REC', kind: retire ? 'retire-pattern' : 'revise-pattern',
      pattern: pattern.record_id, from: PATTERN_STATUS.PROMOTED,
      to: retire ? PATTERN_STATUS.DEMOTED : PATTERN_STATUS.CANDIDATE,
      failureRate: rate, failures, instances: n, support,
      reason: retire
        ? `failure rate ${rate.toFixed(2)} ≥ 2×noise and support ${support} ≤ threshold ${threshold} — retire`
        : `failure rate ${rate.toFixed(2)} > noise ${noiseRate} with support ${support} — revise detection_params`,
    }),
    action, rate, failures, n, support, reason: action,
  });
};

// ── conflict adjudication (§4) ───────────────────────────────────────────────────────────────────
// Two promoted patterns both plausible for ONE zone (email-header-block vs chat-log-header) is NOT a
// special case: it is an ordinary DEF-conflict, adjudicated by EVA. This returns the EVA tuple that
// picks a winner by the evidence — the candidate whose detection_params the zone scores highest
// against, with a mandatory ruled-out-other naming the loser. When the scores tie within tolerance
// the verdict is INDETERMINATE and NOTHING is committed (the zone stays a superposition, resolved
// later by more evidence — never forced at ingest).
export const adjudicatePatternConflict = (zone, candidates = [], { score, tol = 1e-6 } = {}) => {
  const scored = (candidates || [])
    .map((p) => ({ pattern: p, score: typeof score === 'function' ? score(zone, p) : 0 }))
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return Object.freeze({ verdict: VERDICTS.UNSUPPORTED, winner: null, reason: 'no-candidates' });
  if (scored.length === 1)
    return Object.freeze({
      op: 'EVA', site: 'pattern-conflict', verdict: VERDICTS.CORROBORATED,
      winner: scored[0].pattern.record_id, ruled_out_other: null, scores: Object.freeze(scored.map((s) => ({ pattern: s.pattern.record_id, score: s.score }))),
      reason: 'single-candidate',
    });
  const [top, next] = scored;
  if (top.score - next.score <= tol)
    return Object.freeze({
      op: 'EVA', site: 'pattern-conflict', verdict: VERDICTS.INDETERMINATE,
      winner: null, ruled_out_other: null,
      scores: Object.freeze(scored.map((s) => ({ pattern: s.pattern.record_id, score: s.score }))),
      reason: 'tie-within-tolerance — held as superposition, not forced',
    });
  return Object.freeze({
    op: 'EVA', site: 'pattern-conflict', verdict: VERDICTS.CORROBORATED,
    winner: top.pattern.record_id, ruled_out_other: next.pattern.record_id,
    margin: top.score - next.score,
    scores: Object.freeze(scored.map((s) => ({ pattern: s.pattern.record_id, score: s.score }))),
    reason: `${top.pattern.record_id} beats ${next.pattern.record_id} by ${(top.score - next.score).toFixed(3)}`,
  });
};
