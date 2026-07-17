// EO: NUL·DEF(Lens → Lens, Dissecting·Clearing) — the Cut, the atomic same/other judgment
// The typed cut (The Work v3, #2–#4). Every same/other verdict a DEF carries DECOMPOSES into
// Cuts. A Cut is the atomic judgment "same or other, HERE" — it is not new event grammar, it is
// the internal structure of a DEF's `witness` (core/def.js). The one question the system asks —
// SAME or OTHER — is asked at three kinds of place, and each grounds out (or refuses to) at a
// different floor:
//
//   presence  (NULSIG)   — is there a signal of correspondence at this grain, or nothing? The
//                          base case, unfakeable: a mark exists or it does not. CORROBORATED
//                          (signal) or UNSUPPORTED (void), NEVER indeterminate — presence is
//                          decidable by definition.
//   argument  (INS)      — does this mention resolve to that entity? Grounds out at the minted
//                          anchor: same anchor → CORROBORATED, different → CONTRADICTED,
//                          unresolved → INDETERMINATE (the honest suspension).
//   predicate (residual) — is the span's relation the SAME AS or STRONGER THAN the claimed one?
//                          The ONLY cut that does not ground out; it stays authored/contestable.
//                          Its witness is the two predicates and the relation asserted between
//                          them (equal / stronger / weaker / unrelated / contrary). When the
//                          judge cannot establish "same-or-stronger" with the evidence at hand,
//                          the verdict is INDETERMINATE and the witness records why — never a
//                          thresholded number.
//
// The Cut kinds are organ-independent (§8): only the witness payload differs — spans for text,
// cell coordinates for a table, time-spans for audio. The same foldCuts / B1 check that judges a
// text binding judges a table-cell witness with no retraining. If an organ needs its own fold,
// the tuple was never consilient.

import { VERDICTS } from './verdicts.js';

// The three kinds of atomic cut.
export const CUT_KINDS = Object.freeze({
  PRESENCE:  'presence',
  ARGUMENT:  'argument',
  PREDICATE: 'predicate',
});

// Where a cut BOTTOMS OUT. NUL/SIG is presence, INS is identity, 'residual' is the comparative
// cut that never grounds out on its own — it must resolve to a witnessed CORROBORATED to count.
export const GROUNDS = Object.freeze({
  NULSIG:   'NULSIG',
  INS:      'INS',
  RESIDUAL: 'residual',
});

// The floor each kind is expected to ground at — defaulted when a cut omits `grounds`.
const KIND_GROUNDS = Object.freeze({
  [CUT_KINDS.PRESENCE]:  GROUNDS.NULSIG,
  [CUT_KINDS.ARGUMENT]:  GROUNDS.INS,
  [CUT_KINDS.PREDICATE]: GROUNDS.RESIDUAL,
});

const KIND_SET   = new Set(Object.values(CUT_KINDS));
const GROUNDS_SET = new Set(Object.values(GROUNDS));
// A cut's verdict is one of the grounding verdicts — OFF_DIAGONAL is the diagonal guard's,
// orthogonal to a same/other cut and never a cut verdict. SILENT joins the presence cut's
// legal outcomes (core/resolution-face.js Generate×Ground): a presence cut answers "is there a
// mark, or not" — SILENT is the "not", read at Ground rather than folded into UNSUPPORTED's
// Figure-grade "material exists, does not support" (turn/judgments.js `recordVoidDef`). The
// other three reserved verdicts (CONSONANT/CIRCUMSTANTIAL/UNDERMINED) are not yet produced by
// any cut, so they stay out of this set until a call site actually needs them.
const CUT_VERDICTS = new Set([
  VERDICTS.CORROBORATED, VERDICTS.UNSUPPORTED, VERDICTS.CONTRADICTED, VERDICTS.INDETERMINATE,
  VERDICTS.SILENT,
]);

export const isCutKind    = (k) => KIND_SET.has(k);
export const isCutVerdict = (v) => CUT_VERDICTS.has(v);

// makeCut — one atomic same/other judgment. Never throws: a bad kind/verdict/grounds, a
// witness-less cut, or an INDETERMINATE presence (presence is decidable by definition, so a
// suspended presence is malformed) is recorded on the cut (`malformed`), mirroring makeDef's
// oracle trap, so a turn is never crashed by decomposing its witness.
export const makeCut = ({ kind, of = null, verdict, grounds = null, witness = null } = {}) => {
  const malformed = [];
  if (!isCutKind(kind)) malformed.push(`unknown-kind:${String(kind)}`);
  if (!isCutVerdict(verdict)) malformed.push(`unknown-verdict:${String(verdict)}`);
  const g = grounds ?? KIND_GROUNDS[kind] ?? null;
  if (g != null && !GROUNDS_SET.has(g)) malformed.push(`unknown-grounds:${String(g)}`);
  if (kind === CUT_KINDS.PRESENCE && verdict === VERDICTS.INDETERMINATE) malformed.push('presence-indeterminate');
  if (witness == null) malformed.push('no-witness');   // a cut without evidence is an oracle too
  return Object.freeze({
    kind, of, verdict, grounds: g, witness,
    ...(malformed.length ? { malformed: Object.freeze(malformed) } : {}),
  });
};

const isRequired = (c) => c && (c.kind === CUT_KINDS.ARGUMENT || c.kind === CUT_KINDS.PRESENCE);
const isPredicate = (c) => c && c.kind === CUT_KINDS.PREDICATE;

// foldCuts — §2, how the Cuts of ONE binding compose to the DEF verdict. Deterministic, no model.
// The precedence is exact and each clause reports the absence for what it is:
//   1. any required (argument/presence) cut UNSUPPORTED → UNSUPPORTED (nothing to seat)
//   2. else any cut CONTRADICTED (wrong anchor, or a contrary predicate) → CONTRADICTED
//   3. else all argument+presence CORROBORATED and the predicate CORROBORATED → CORROBORATED
//   4. else (some cut — in practice the predicate — is INDETERMINATE) → INDETERMINATE
// A binding with no cuts, or with no predicate cut, cannot be affirmed → INDETERMINATE: an
// affirmation with nothing comparative behind it is exactly the about≠says failure B1 forbids.
export const foldCuts = (cuts = []) => {
  const list = (Array.isArray(cuts) ? cuts : []).filter(Boolean);
  if (!list.length) return VERDICTS.INDETERMINATE;
  if (list.some((c) => isRequired(c) && c.verdict === VERDICTS.UNSUPPORTED)) return VERDICTS.UNSUPPORTED;
  if (list.some((c) => c.verdict === VERDICTS.CONTRADICTED)) return VERDICTS.CONTRADICTED;
  const reqs  = list.filter(isRequired);
  const preds = list.filter(isPredicate);
  const allReqCorro = reqs.length > 0 && reqs.every((c) => c.verdict === VERDICTS.CORROBORATED);
  const predCorro   = preds.length > 0 && preds.every((c) => c.verdict === VERDICTS.CORROBORATED);
  if (allReqCorro && predCorro) return VERDICTS.CORROBORATED;
  return VERDICTS.INDETERMINATE;
};

// groundsOut — does this cut actually bottom out? A presence (NULSIG) or argument (INS) cut
// grounds out by kind. A residual (predicate) cut grounds out ONLY when it itself resolved to a
// witnessed CORROBORATED — a comparative cut that never grounded out cannot count as grounded.
export const groundsOut = (cut) => {
  if (!cut) return false;
  if (cut.grounds === GROUNDS.NULSIG || cut.grounds === GROUNDS.INS) return true;
  if (cut.grounds === GROUNDS.RESIDUAL) return cut.verdict === VERDICTS.CORROBORATED && cut.witness != null;
  return false;
};

// violatesB1 — Invariant B1, the base case made a rule: no DEF may be CORROBORATED unless EVERY
// one of its cuts grounds out (NULSIG/INS) or is a residual cut that itself resolved to
// CORROBORATED with a witness. Equivalently: a comparative cut that never grounded out cannot
// ship as CORROBORATED. Checkable at the seam; returns the offending tag, or null when clean.
// Only CORROBORATED is constrained — INDETERMINATE/UNSUPPORTED/CONTRADICTED carry no such bar.
export const violatesB1 = (verdict, cuts = []) => {
  if (verdict !== VERDICTS.CORROBORATED) return null;
  const list = (Array.isArray(cuts) ? cuts : []).filter(Boolean);
  if (!list.length) return 'no-cuts';
  const bad = list.find((c) => !groundsOut(c));
  return bad ? `ungrounded-cut:${bad.kind}` : null;
};

// makeRuledOut — §3, the Sophist requirement's witness. You affirm "X is F" only by holding "X
// is not the relevant others"; a witness that records only the match it found is an ABOUT
// witness, one that also records the difference it EXCLUDED is a SUPPORTING witness. Bounded to
// ONE near-miss — the strongest rejected other — so it is cheap. `other` may be null only for a
// genuinely uncontested affirmation (a lone candidate, nothing to exclude).
export const makeRuledOut = ({ other = null, cut = null, margin = null } = {}) =>
  Object.freeze({ other, cut, margin });
