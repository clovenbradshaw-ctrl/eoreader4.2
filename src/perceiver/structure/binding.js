// EO: SIG·INS·EVA·DEF(Entity,Network → Entity,Network,Lens, Binding,Making,Tracing) — cross-source entity binding (§6)
// The "Mr. Smith in two documents inside one file inside another container" problem. It extends
// the-work-v3-spec's cut abstraction ACROSS frames instead of within one — the argument set of each
// sub-cut is drawn from each document's OWN frame, and the anchor that grounds the argument cut is
// depth-invariant (§8), which is exactly what lets a binding at depth 7 be ontologically identical to
// one at depth 1.
//
// The discipline the spec insists on, made mechanical:
//   · A first mention mints a SIG (a sign), NOT an anchor. Anchors are minted by INS only once an
//     entity is committed as real and singular. Premature INS on a bare name produces either false
//     merges (two Smiths, one anchor) or anchor sprawl (one Smith, many anchors).
//   · Cross-document match runs the SAME three sub-cuts as within-document binding (core/cut.js):
//       presence@NUL/SIG   — a plausible candidate exists in the other frame (decidable, never held)
//       argument@INS       — which specific mention is proposed as referent; grounds at the anchor
//       predicate@residual — attached predicates compared across frames (employer, dates, co-refs)
//   · ruled-out-other is MANDATORY here specifically because common names make lexical match alone
//     worthless — this is the exact case the requirement was built for (§6).
//   · Undecidable cases become DEF-SUPERPOSITION on identity (mention ∥ @A, mention ∥ @B), resolved
//     later by EVA when evidence arrives — NEVER a forced merge/split at ingest.
//
// Pure and model-free. The clock/id an INS needs is injected by index.js; this module decides.

import { makeCut, foldCuts, makeRuledOut, CUT_KINDS, GROUNDS, VERDICTS } from '../../core/index.js';

// ── the registry (§6) — §5.3's anchor/sign split made a concrete data structure ──────────────────
// A first mention is a SIGN. An anchor, once committed, gathers the signs that denote it, the
// predicates that corroborate it across frames, and any pending candidates it is held in
// superposition with. This is not a new concept — it is the wiki's anchor/sign split made literal.
export const makeRegistryEntry = ({ anchor, signs = [], corroborating_predicates = [], pending_candidates = [] } = {}) =>
  Object.freeze({
    anchor,
    signs: Object.freeze(signs.map((s) => Object.freeze({ ...s }))),
    corroborating_predicates: Object.freeze([...new Set(corroborating_predicates)]),
    pending_candidates: Object.freeze([...new Set(pending_candidates)]),
  });

// makeSign — the SIG a first mention mints. NOT an anchor. `text` is the surface form (its
// spelling), `source_doc` the frame it was seen in, `span` the exact occurrence, `ts` injected.
export const makeSign = ({ text, source_doc, span = null, ts = null } = {}) =>
  Object.freeze({ text: String(text ?? ''), source_doc, span, ts });

const tokensOf = (s) => String(s || '').toLowerCase().match(/[a-z0-9]+/g) || [];

// Keys whose values are single-valued within one identity — a mismatch on one of these is positive
// evidence of TWO entities (the functional-clash cut, mirrored from relation-types). Everything else
// (employer, title, city) is SOFT: a match corroborates, a mismatch does NOT contradict (people
// change jobs). Injected-overridable via opts.functionalKeys.
const DEFAULT_FUNCTIONAL_KEYS = new Set(['bornon', 'birthdate', 'dob', 'spouse', 'ssn', 'licence', 'license', 'qid', 'passport']);

const splitPred = (p) => { const i = String(p).indexOf(':'); return i < 0 ? [String(p).toLowerCase(), ''] : [String(p).slice(0, i).toLowerCase(), String(p).slice(i + 1).toLowerCase()]; };

// ── the three sub-cuts, across frames ────────────────────────────────────────────────────────────

// presence@NUL/SIG — is there a signal of correspondence at this grain, or nothing? Decidable by
// definition (a shared token is a mark that exists or does not), so NEVER indeterminate. Common
// names make this cut WEAK on its own — a shared "smith" is presence, not identity — which is exactly
// why the predicate cut has to carry the real weight.
const presenceCut = (mention, candidate) => {
  const mt = new Set(tokensOf(mention.text));
  const shared = [];
  for (const s of candidate.signs || []) for (const t of tokensOf(s.text)) if (mt.has(t)) shared.push(t);
  const uniq = [...new Set(shared)];
  return makeCut({
    kind: CUT_KINDS.PRESENCE, grounds: GROUNDS.NULSIG,
    verdict: uniq.length ? VERDICTS.CORROBORATED : VERDICTS.UNSUPPORTED,
    witness: { sharedTokens: uniq, mention: mention.text, candidate: candidate.anchor },
  });
};

// argument@INS — which specific mention is being proposed as referent? Grounds at the minted anchor:
// the candidate carries a committed anchor (something specific to propose) → CORROBORATED; the
// mention is ALREADY bound to a DIFFERENT anchor → CONTRADICTED; the candidate is only a sign, no
// anchor yet → INDETERMINATE (the honest suspension). `boundAnchor` is the mention's current
// binding, if any.
const argumentCut = (mention, candidate, boundAnchor) => {
  let verdict;
  if (boundAnchor != null && candidate.anchor != null && boundAnchor !== candidate.anchor) verdict = VERDICTS.CONTRADICTED;
  else if (candidate.anchor != null) verdict = VERDICTS.CORROBORATED;
  else verdict = VERDICTS.INDETERMINATE;
  return makeCut({
    kind: CUT_KINDS.ARGUMENT, grounds: GROUNDS.INS, verdict,
    witness: { proposedAnchor: candidate.anchor, boundAnchor: boundAnchor ?? null, mentionSpan: mention.span ?? null },
  });
};

// predicate@residual — the comparative cut. The mention's attached predicates vs the candidate's,
// across frames. A SHARED predicate (employer:acme on both) → CORROBORATED with that as witness. A
// FUNCTIONAL key filled by different values (two different bornOn) → CONTRADICTED. No comparable
// predicate at all → INDETERMINATE — never a thresholded number, the honest suspension the residual
// cut is the only one allowed to return.
const predicateCut = (minePreds = [], theirPreds = [], { functionalKeys = DEFAULT_FUNCTIONAL_KEYS } = {}) => {
  const mine = new Set(minePreds.map((p) => String(p).toLowerCase()));
  const theirs = new Set(theirPreds.map((p) => String(p).toLowerCase()));
  const shared = [...mine].filter((p) => theirs.has(p));
  if (shared.length)
    return makeCut({ kind: CUT_KINDS.PREDICATE, grounds: GROUNDS.RESIDUAL, verdict: VERDICTS.CORROBORATED,
      witness: { shared, relation: 'equal' } });
  // functional conflict — same functional key, different value → two entities
  const byKeyMine = new Map(); for (const p of mine) { const [k, v] = splitPred(p); if (!byKeyMine.has(k)) byKeyMine.set(k, new Set()); byKeyMine.get(k).add(v); }
  for (const p of theirs) {
    const [k, v] = splitPred(p);
    if (functionalKeys.has(k) && byKeyMine.has(k) && !byKeyMine.get(k).has(v))
      return makeCut({ kind: CUT_KINDS.PREDICATE, grounds: GROUNDS.RESIDUAL, verdict: VERDICTS.CONTRADICTED,
        witness: { key: k, mine: [...byKeyMine.get(k)], theirs: v, relation: 'contrary' } });
  }
  return makeCut({ kind: CUT_KINDS.PREDICATE, grounds: GROUNDS.RESIDUAL, verdict: VERDICTS.INDETERMINATE,
    witness: { shared: [], relation: 'no-comparable-predicate' } });
};

// crossSourceCut(mention, candidate, opts) → { verdict, cuts } for ONE (mention, candidate) pair.
// The three sub-cuts folded by the SAME foldCuts the within-document binder uses (organ-independent,
// core/cut.js §8) — no retraining, no per-organ fold.
export const crossSourceCut = (mention, candidate, { predicates = [], boundAnchor = null, functionalKeys } = {}) => {
  const cuts = [
    presenceCut(mention, candidate),
    argumentCut(mention, candidate, boundAnchor),
    predicateCut(predicates, candidate.corroborating_predicates || [], { functionalKeys }),
  ];
  return Object.freeze({ verdict: foldCuts(cuts), cuts: Object.freeze(cuts), candidateAnchor: candidate.anchor });
};

// ── the binder ───────────────────────────────────────────────────────────────────────────────────
// bindAcrossSources(mention, candidates, opts) → a decision, never a mutation:
//   { verdict, binding, superposition, sign, cuts, ruled_out_other }
//
//   binding        an INS proposal (mention → the one anchor that CORROBORATED) — set ONLY when
//                  EXACTLY ONE candidate corroborates. Carries the mandatory ruled-out-other.
//   superposition  a DEF-superposition (mention ∥ @A, mention ∥ @B) — set when TWO OR MORE candidates
//                  remain plausible (corroborated, or held-indeterminate on a shared token). Resolved
//                  later by EVA; NEVER forced at ingest.
//   sign           a fresh SIG — set when NO candidate corresponds at all: the mention is a new
//                  entity's first mark, an anchor is NOT minted (§6).
//   ruled_out_other the strongest excluded near-miss (core/cut.js makeRuledOut), mandatory whenever a
//                  competitor exists — because a common name makes lexical match alone worthless.
export const bindAcrossSources = (mention, candidates = [], { predicatesByCandidate = null, predicates = [], boundAnchor = null, functionalKeys } = {}) => {
  const evals = (candidates || []).map((c) => ({
    candidate: c,
    ...crossSourceCut(mention, c, {
      predicates: predicatesByCandidate ? (predicatesByCandidate.get?.(c.anchor) ?? predicates) : predicates,
      boundAnchor, functionalKeys,
    }),
  }));

  const corroborated = evals.filter((e) => e.verdict === VERDICTS.CORROBORATED);
  const contradicted = evals.filter((e) => e.verdict === VERDICTS.CONTRADICTED);
  // A plausible-but-undecided candidate: shares a token (presence corroborated) but the predicate cut
  // could not settle it — merely LEXICAL. A common name makes this WORTHLESS on its own, so it is a
  // candidate to be RULED OUT when a predicate-backed winner exists, and only a superposition
  // candidate when NOTHING is predicate-backed. It is NEVER, by itself, a silent merge.
  const heldPlausible = evals.filter((e) =>
    e.verdict === VERDICTS.INDETERMINATE &&
    e.cuts.some((c) => c.kind === CUT_KINDS.PRESENCE && c.verdict === VERDICTS.CORROBORATED));

  // The strongest excluded near-miss among everyone we did NOT bind to — mandatory when a competitor
  // exists (§6: common names make lexical match alone worthless, so the exclusion is the real work).
  // Ranked by how many cuts it cleared, so the near-miss is the strongest rejected other.
  const strength = (e) => e.cuts.filter((c) => c.verdict === VERDICTS.CORROBORATED).length;
  const nearMiss = (winner) => {
    const others = evals.filter((e) => e !== winner).sort((a, b) => strength(b) - strength(a));
    return others.length
      ? makeRuledOut({ other: others[0].candidate.anchor, cut: others[0].cuts, margin: strength(winner || { cuts: [] }) - strength(others[0]) })
      : makeRuledOut({});
  };

  // EXACTLY ONE predicate-backed corroboration → an INS binding, with every merely-lexical competitor
  // RULED OUT. This is the case the ruled-out-other requirement was built for: the shared predicate
  // decides it; the other Smith is excluded, not held.
  if (corroborated.length === 1) {
    const winner = corroborated[0];
    return Object.freeze({
      verdict: VERDICTS.CORROBORATED,
      binding: Object.freeze({ op: 'INS', kind: 'cross-source-bind', from: mention.span ?? mention.text, to: winner.candidate.anchor, mention: makeSign(mention), cuts: winner.cuts }),
      superposition: null, sign: null,
      ruled_out_other: nearMiss(winner),
      cuts: winner.cuts,
    });
  }

  // TWO OR MORE predicate-backed corroborations (a genuine tie), OR — with nothing predicate-backed —
  // two or more merely-lexical candidates: DEF-superposition on identity. Held ∥, resolved later by
  // EVA; NEVER a forced merge/split at ingest.
  const live = corroborated.length >= 2 ? corroborated : (corroborated.length === 0 ? heldPlausible : []);
  if (live.length >= 2) {
    return Object.freeze({
      verdict: VERDICTS.INDETERMINATE,
      binding: null,
      superposition: Object.freeze({
        op: 'DEF', kind: 'identity-superposition', mention: mention.span ?? mention.text,
        candidates: Object.freeze(live.map((e) => e.candidate.anchor)),
        note: 'undecidable — held ∥ across candidates, resolved later by EVA; never a forced merge/split',
      }),
      sign: makeSign(mention),
      ruled_out_other: null,   // a superposition rules NOTHING out — that is the point
      cuts: Object.freeze(live.flatMap((e) => e.cuts)),
    });
  }

  // A single merely-lexical candidate, or a lone contradiction, or nothing corresponding → a fresh
  // SIG, an identity void. NO anchor minted on a bare name (§6: premature INS = false merge). A lone
  // lexical candidate rides as a pending candidate, not a binding.
  const pending = heldPlausible.length === 1 ? [heldPlausible[0].candidate.anchor] : [];
  return Object.freeze({
    verdict: contradicted.length ? VERDICTS.CONTRADICTED : VERDICTS.INDETERMINATE,
    binding: null, superposition: null,
    sign: makeSign(mention),
    pending_candidates: Object.freeze(pending),
    ruled_out_other: contradicted.length ? nearMiss(null) : makeRuledOut({}),
    cuts: Object.freeze(evals.flatMap((e) => e.cuts)),
  });
};

// resolveSuperposition(superposition, evidence) → an EVA that collapses a held identity when new
// evidence arrives (§6). `evidence.corroborates` names the surviving anchor; the others are ruled
// out. Returns the EVA tuple + the resolved binding, or an INDETERMINATE EVA when the evidence still
// does not decide (it stays a superposition — evidence that does not decide is not a decision).
export const resolveSuperposition = (superposition, { corroborates = null, predicate = null } = {}) => {
  const cands = superposition?.candidates || [];
  if (corroborates == null || !cands.includes(corroborates))
    return Object.freeze({ op: 'EVA', site: 'identity-superposition', verdict: VERDICTS.INDETERMINATE, reason: 'evidence-does-not-decide', candidates: cands });
  const ruledOut = cands.filter((c) => c !== corroborates);
  return Object.freeze({
    op: 'EVA', site: 'identity-superposition', verdict: VERDICTS.CORROBORATED,
    winner: corroborates, ruled_out_other: ruledOut[0] ?? null, allRuledOut: ruledOut,
    binding: Object.freeze({ op: 'INS', kind: 'cross-source-bind', from: superposition.mention, to: corroborates, predicate }),
    reason: predicate ? `resolved by ${predicate}` : 'resolved by later evidence',
  });
};
