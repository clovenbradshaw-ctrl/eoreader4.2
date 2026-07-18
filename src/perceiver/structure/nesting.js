// EO: REC·CON·EVA·NUL(Network,Lens → Network,Lens,Void, Composing,Tracing,Binding,Clearing) — recursive nesting & termination (§8)
// Nesting is NOT a feature to build — it falls out of primitives already defined recursively
// (addressing has no depth limit; composability is scope-containment, recursive by definition;
// container segmentation re-enters itself; patterns nest into meta-patterns via the identical
// promotion pipeline). What HAS to be made explicit is the termination condition and the guardrail,
// and that is all this module does.
//
//   · Addressing is depth-invariant. `container:F.doc:2.section:3.mention:M2` is one more segment,
//     not a different kind of address — so an anchor minted at depth 7 is ontologically identical to
//     one at depth 1, which is what makes cross-depth CON edges (and cross-document Mr. Smith
//     binding, §6) ordinary rather than special-cased.
//   · TERMINATION is VOID, not a hardcoded base case. A frame where the pre-SEG detector finds no
//     further discontinuity, or a pattern-match pass returns no corroborating candidate, is a leaf.
//     The SAME signal at depth 1 and depth 40.
//   · REC is the formal name for "one more turn". Each additional level is another REC turn, with no
//     cap written into the operator itself.
//   · The GUARDRAIL is ECONOMIC, not structural. Re-running full pattern detection on a trivially
//     shallow container grades as IDLE per lineup's precedence, so descent stops via cost incentive
//     as corroboration density drops — NOT a hardcoded max-depth. Depth-reached is logged as a
//     queryable fact so the cutoff can be tuned empirically (§11, open question).

import { VERDICTS } from '../../core/index.js';

// ── depth-invariant addressing ───────────────────────────────────────────────────────────────────
const SEP = '.';

// childAddress(parent, segment) → one more address segment. No depth limit — the whole point.
export const childAddress = (parent, segment) =>
  parent == null || parent === '' ? String(segment) : `${parent}${SEP}${segment}`;

// addressDepth(address) → how many segments deep the address is (1-based; a bare id is depth 1).
export const addressDepth = (address) =>
  String(address || '').split(SEP).filter(Boolean).length;

// addressSegments(address) → the segments, so a caller can walk a nested address without re-parsing.
export const addressSegments = (address) => Object.freeze(String(address || '').split(SEP).filter(Boolean));

// ── termination: a leaf is a VOID, not a base case ───────────────────────────────────────────────
// isLeafFrame({ detection, matches }) → true when descent should stop HERE — because the detector
// VOIDed (no further discontinuity) OR the pattern-match pass returned no corroborating candidate.
// The identical test at every depth (§8): nothing about depth 40 differs from depth 1.
export const isLeafFrame = ({ detection = null, matches = null } = {}) => {
  const detectorVoid = !detection || detection.void === true || (Array.isArray(detection.clms) && detection.clms.length === 0);
  const noMatch = matches != null && Array.isArray(matches) && matches.length === 0;
  return detectorVoid || noMatch;
};

// ── the economic guardrail (§8) — descent stops via cost, not a max-depth ─────────────────────────
// corroborationDensity(zoneCount, corroboratingCount) → the fraction of a frame's zones that yielded
// a corroborating pattern candidate. As this drops, further descent is buying less and less structure
// per unit of work — the signal the grade reads.
export const corroborationDensity = (zoneCount, corroboratingCount) =>
  zoneCount > 0 ? Math.max(0, Math.min(1, corroboratingCount / zoneCount)) : 0;

// descentGrade({ density, depth, priorDensity }) → 'grounded' | 'warranted' | 'idle' — the SAME grade
// vocabulary lineup's surfers read (surfer/lineup/surfer.js: grounded > warranted > idle). An IDLE
// descent is one whose corroboration density has collapsed: re-running full detection on it grades as
// idle per lineup's precedence, so the descent is not worth its cost and stops — WITHOUT a hardcoded
// cap. `priorDensity` (the parent frame's density) lets a SHARP drop count against a level even when
// its absolute density is not yet zero — the marginal read the guardrail actually wants.
export const descentGrade = ({ density = 0, depth = 1, priorDensity = null } = {}) => {
  // A frame that corroborates most of its zones is grounded structure — keep descending.
  if (density >= 0.5) return 'grounded';
  // A frame still finding SOME structure, and not collapsing relative to its parent, is warranted.
  const collapsing = priorDensity != null && priorDensity > 0 && density <= priorDensity * 0.25;
  if (density > 0 && !collapsing) return 'warranted';
  // No structure, or a collapse from the parent → idle: descent buys nothing, stop by cost.
  return 'idle';
};

// shouldDescend(grade) → the boolean the segmenter reads. Only a NON-idle grade descends — the cost
// incentive, not a structural cap. Kept as its own function so the grade stays queryable/loggable.
export const shouldDescend = (grade) => grade !== 'idle';

// ── one recursive turn (§8) ──────────────────────────────────────────────────────────────────────
// nestTurn(frame, { detect, priorDensity, depth }) → { leaf, grade, descend, density, event }
// A single REC "one more turn". It does NOT recurse itself — the caller (segment.js) drives the loop,
// so the descent is visible and cancellable — but it decides, for THIS frame, whether the next turn
// is worth taking. `detect` is injected (the §3 detector) so this module stays pure and testable.
//   frame  the zone/blob to consider descending into
//   detect (blob) → { clms, void } — the pre-SEG detector
// Returns the REC event (op:'REC') that names this turn and logs depth-reached as a queryable fact.
export const nestTurn = (frame, { detect, priorDensity = null, depth = 1, matches = null } = {}) => {
  const detection = typeof detect === 'function' ? detect(frame?.blob ?? frame) : (frame?.detection ?? null);
  const leaf = isLeafFrame({ detection, matches });
  const zoneCount = detection?.clms?.length ?? 0;
  const corroborating = matches ? matches.filter(Boolean).length : zoneCount;
  const density = corroborationDensity(Math.max(zoneCount, corroborating, leaf ? 0 : 1), corroborating);
  const grade = leaf ? 'idle' : descentGrade({ density, depth, priorDensity });
  const descend = !leaf && shouldDescend(grade);
  return Object.freeze({
    leaf, grade, descend, density, depth,
    event: Object.freeze({
      op: leaf ? 'NUL' : 'REC', kind: 'nest-turn', depth, grade, density,
      ...(leaf ? { verdict: VERDICTS.UNSUPPORTED, void: true, note: 'leaf — detector VOID / no corroborating candidate; termination by VOID, not a base case' }
               : { note: descend ? 'one more REC turn — corroboration density warrants descent' : 'descent graded idle — stop by cost, not by a max-depth cap' }),
    }),
  });
};
