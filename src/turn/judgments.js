// EO: DEF·SEG(Field,Lens → Lens,Paradigm, Dissecting,Clearing) — route the turn's same-vs-other verdicts onto the judgment log as DEFs
// The four gates of the turn each make a same-vs-other judgment: the binder decides whether a
// claim's witness ENTAILS it (ground/bind.js), the fact-checker types a proposition against the
// sources (factcheck/correspond.js), the fold reads who a passage is about (perceiver/referent.js),
// the answerability gate measures an absence (enactor/answer/void.js). This module SURFACES those
// judgments as logged DEFs — a typed verdict carrying its witness.
//
// The witness is no longer a lexical scalar. The binding, reference, and void verdicts each
// DECOMPOSE into Cuts (core/cut.js): presence (NULSIG), argument (INS), predicate (residual). A
// DEF's witness is the decomposition tree — the list of cuts that produced its verdict, plus the
// ruled-out other (§3) for an affirmation. The DEF verdict is the deterministic FOLD of its cuts
// (foldCuts, §2), never a guess: any cut that cannot ground out routes the DEF to INDETERMINATE
// rather than shipping an ungrounded CORROBORATED (Invariant B1). The correspondence verdict
// already grounds out at the predication grain, so it passes through as before.
//
// Each recorder is pure and best-effort: it appends to the log if one is present and returns
// quietly otherwise, so a turn without a judgment log — or a malformed input — is never broken by
// the logging. A DEF without a witness would be an oracle, and core/def.js records that as malformed.

import { VERDICTS } from '../core/verdicts.js';
import { GRAINS, isVerdict } from '../core/def.js';
import { CUT_KINDS, GROUNDS, makeCut, foldCuts, violatesB1, makeRuledOut } from '../core/cut.js';

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

// The correspondence verdict for a claim, matched by sentence containment (the same match the
// factcheck stage uses to fold an edge citation back into a bound claim). Null when the
// proposition channel typed nothing for this claim — the predicate cut then cannot ground out.
const corrFor = (claimText, correspondence) => {
  if (!Array.isArray(correspondence)) return null;
  const bc = norm(claimText);
  if (!bc) return null;
  return correspondence.find((c) => {
    const cs = norm(c && (c.sentence || c.text));
    return cs && (bc.includes(cs) || cs.includes(bc)) && isVerdict(c.verdict);
  }) || null;
};

// bindingCuts — decompose ONE bound claim into its presence / argument / predicate cuts. This is
// the typed cut that replaces the idf-overlap/BORN scalar: the old overlap survives only as the
// PRESENCE test (is there lexical contact at all), never as the verdict.
export const bindingCuts = (b, { referential = null, correspondence = null } = {}) => {
  const of = `claim:${b.claim}`;
  const cuts = [];

  // presence (NULSIG) — is there a signal of correspondence at this grain at all? Decidable by
  // definition: a mark exists (contact, a citation, an edge) or it does not.
  const hasContact = (b.score || 0) > 0 || !!b.citation || !!b.edgeGrounded;
  cuts.push(makeCut({
    kind: CUT_KINDS.PRESENCE, of, grounds: GROUNDS.NULSIG,
    verdict: hasContact ? VERDICTS.CORROBORATED : VERDICTS.UNSUPPORTED,
    witness: { score: b.score || 0, citation: b.citation || null },
  }));

  // argument (INS) — does the claim's mention resolve to a settled entity? When the fold MEASURED
  // the subject as diffuse (referential.concentrated === false with a landed id), the naming did
  // not concentrate to one sense — the reference is itself INDETERMINATE, so the argument cut
  // inherits that suspension (the Elvis "which Elvis" case: an unresolved anchor, never guessed).
  // Otherwise each discriminating referent the claim named grounds out at its anchor id.
  const diffuse = referential && referential.concentrated === false && referential.id != null;
  if (diffuse) {
    cuts.push(makeCut({
      kind: CUT_KINDS.ARGUMENT, of, grounds: GROUNDS.INS,
      verdict: VERDICTS.INDETERMINATE,
      witness: { reason: 'referent-diffuse', anchor: null, of: referential.id, margin: referential.margin ?? 0 },
    }));
  } else if (Array.isArray(b.refs) && b.refs.length) {
    for (const anchor of b.refs) cuts.push(makeCut({
      kind: CUT_KINDS.ARGUMENT, of, grounds: GROUNDS.INS,
      verdict: VERDICTS.CORROBORATED, witness: { anchor },
    }));
  }

  // predicate (residual) — is the span's relation the SAME AS or STRONGER THAN the claimed one?
  // The only cut that does not ground out on its own. It is CORROBORATED only when established:
  //   · a verbatim lift — the surface IS the passage's own words, so same-or-stronger holds
  //     trivially (the equal relation, witnessed by the citation);
  //   · a correspondence verdict typed it CORROBORATED against a document edge.
  // A contrary correspondence is CONTRADICTED. Everything else — a paraphrase whose relation the
  // reading could not type, a superlative no source ranks — is INDETERMINATE: the judge could not
  // establish same-or-stronger with the evidence at hand. NEVER a thresholded aboutness number.
  const corr = corrFor(b.claim, correspondence);
  let predicate;
  if (b.verbatim) {
    predicate = { verdict: VERDICTS.CORROBORATED, witness: { relation: 'equal', reason: 'verbatim-lift', citation: b.citation || null } };
  } else if (corr && corr.verdict === VERDICTS.CORROBORATED) {
    predicate = { verdict: VERDICTS.CORROBORATED, witness: { relation: 'same-or-stronger', reason: corr.reason || 'edge-corresponds', citation: corr.citation || b.citation || null } };
  } else if (corr && corr.verdict === VERDICTS.CONTRADICTED) {
    predicate = { verdict: VERDICTS.CONTRADICTED, witness: { relation: 'contrary', reason: corr.reason || 'denied', citation: corr.citation || null } };
  } else {
    predicate = { verdict: VERDICTS.INDETERMINATE, witness: { relation: 'unestablished', reason: corr ? (corr.reason || 'held') : 'no-typed-relation' } };
  }
  cuts.push(makeCut({ kind: CUT_KINDS.PREDICATE, of, grounds: GROUNDS.RESIDUAL, ...predicate }));

  return cuts;
};

// The binding verdict → a DEF per claim, at the CLAIM grain. bind.js's lexical overlap becomes
// the PRESENCE cut only; the verdict is the deterministic FOLD (§2) of the presence/argument/
// predicate cuts. A claim ships CORROBORATED only when its witness ENTAILS it — every cut grounds
// out and the predicate is established (Invariant B1, asserted at the seam). The witness is the
// decomposition tree plus the ruled-out other (§3): a CORROBORATED affirmation must name the one
// near-miss it excluded, or the affirmation is unearned → downgraded to INDETERMINATE.
export const recordBindingDefs = (log, bound, { referential = null, correspondence = null } = {}) => {
  if (!log || !Array.isArray(bound)) return;
  for (const b of bound) {
    if (!b || typeof b.claim !== 'string') continue;
    const cuts = bindingCuts(b, { referential, correspondence });
    let verdict = foldCuts(cuts);
    let ruledOut = null;
    if (verdict === VERDICTS.CORROBORATED) {
      // Belt-and-suspenders on B1: an ungrounded comparative cut can never ship CORROBORATED.
      const b1 = violatesB1(verdict, cuts);
      if (b1) {
        verdict = VERDICTS.INDETERMINATE;
      } else if (b.ruledOut && b.ruledOut.other) {
        ruledOut = makeRuledOut(b.ruledOut);
      } else {
        // The affirmation named no near-miss it ruled out. A verbatim lift over a lone candidate
        // is genuinely uncontested (nothing to exclude); anything else is an unearned affirmation
        // and downgrades to INDETERMINATE — the contrastive test, folded into the live witness.
        if (b.verbatim) ruledOut = makeRuledOut({ other: null, cut: CUT_KINDS.PREDICATE, margin: null });
        else verdict = VERDICTS.INDETERMINATE;
      }
    }
    log.judge({
      verdict,
      grain: GRAINS.CLAIM,
      of: `claim:${b.claim}`,
      witness: {
        claim: b.claim,
        cuts,
        ...(ruledOut ? { ruledOut } : {}),
      },
    });
  }
};

// The correspondence verdict → a DEF per proposition. factcheck/correspond.js already types each
// claim to one of the four grounding verdicts against the sources' own edges; this passes that
// verdict through at the PREDICATION grain, keeping the witness (the cited sentence, the reason a
// semantic check degraded). This is the standard the binding predicate cut reaches for. Untyped
// claims are skipped — a DEF must carry a verdict.
export const recordCorrespondenceDefs = (log, claims) => {
  if (!log || !Array.isArray(claims)) return;
  for (const c of claims) {
    if (!c || !isVerdict(c.verdict)) continue;
    log.judge({
      verdict: c.verdict,
      grain: GRAINS.PREDICATION,
      of: `predication:${c.sentence || c.text || ''}`,
      witness: {
        sentence: c.sentence || null,
        citation: c.citation || null,
        ...(c.reason ? { reason: c.reason } : {}),
      },
    });
  }
};

// The reference verdict → a DEF at the referent grain, as a typed cut (#3). Reference resolution
// is a same/other DEF too — is this mention the same referent (and same sense) as that anchor? —
// and it grounds out at INS. A CONCENTRATED field settles the referent: the argument cut
// CORROBORATES against the winning anchor, and the witness names the runner-up sense the reading
// RULED OUT (§3, the ruled-out other applies to reference too). A SPLIT field does not settle: the
// argument cut is INDETERMINATE (the honest abstention the Elvis diffusion should have produced),
// and the witness records the competing senses that could not be separated. The DEF verdict is the
// fold of that single argument cut.
export const recordReferenceDef = (log, referential) => {
  if (!log || !referential) return;
  const of = `referent:${referential.id ?? '∅'}`;
  const concentrated = !!referential.concentrated;
  const cut = makeCut({
    kind: CUT_KINDS.ARGUMENT, of, grounds: GROUNDS.INS,
    verdict: concentrated ? VERDICTS.CORROBORATED : VERDICTS.INDETERMINATE,
    witness: concentrated
      ? { anchor: referential.id ?? null, w: referential.w ?? 0, margin: referential.margin ?? 0 }
      : { reason: 'senses-unseparated', anchor: null, w: referential.w ?? 0, margin: referential.margin ?? 0 },
  });
  // A settled reference excluded the runner-up sense; a split one names the tie it could not cut.
  const ruledOut = referential.runnerUp != null
    ? makeRuledOut({ other: referential.runnerUp, cut: CUT_KINDS.ARGUMENT, margin: referential.margin ?? 0 })
    : null;
  // A reference DEF is a single argument cut — its verdict IS the cut's (the binding fold, which
  // requires a predicate cut, does not apply to a pure identity judgment).
  log.judge({
    verdict: cut.verdict,
    grain: GRAINS.REFERENT,
    of,
    witness: {
      id: referential.id ?? null,
      w: referential.w ?? 0,
      margin: referential.margin ?? 0,
      concentrated,
      cuts: [cut],
      ...(concentrated && ruledOut ? { ruledOut } : {}),
    },
  });
};

// The void verdict → a DEF of absence at the field grain, with a LOCATED reason (#4). Absence has
// an address: the DEF names WHICH cut stalled, not a single "diffuse" verdict.
//   · presence cut UNSUPPORTED   → not in corpus (a true gap — UNSUPPORTED).
//   · argument cut INDETERMINATE → reference void (the referent won't resolve/concentrate —
//                                  the Elvis "which Elvis" case; INDETERMINATE, located).
//   · predicate cut INDETERMINATE with arguments resolved → unstated relation (the "best is
//                                  unstated / no source ranks these" case; INDETERMINATE, located).
// The witness names the stalled cut and carries the measure's own receipt; the user-facing decline
// is generated from that located reason. `located` may be passed explicitly (the decline path that
// already knows why it stalled) or inferred from the void measure's `kind`.
const VOID_LOCATION = Object.freeze({
  // a scan of the corpus turned up nothing on the entity — the presence cut is void
  'elsewhere':   { cut: CUT_KINDS.PRESENCE,  grounds: GROUNDS.NULSIG, verdict: VERDICTS.UNSUPPORTED,   located: 'not-in-corpus' },
  'never-set':   { cut: CUT_KINDS.PRESENCE,  grounds: GROUNDS.NULSIG, verdict: VERDICTS.UNSUPPORTED,   located: 'not-in-corpus' },
  'not-in-corpus': { cut: CUT_KINDS.PRESENCE, grounds: GROUNDS.NULSIG, verdict: VERDICTS.UNSUPPORTED,  located: 'not-in-corpus' },
  // the reference would not resolve/concentrate — the argument cut is suspended
  'reference':   { cut: CUT_KINDS.ARGUMENT,  grounds: GROUNDS.INS,     verdict: VERDICTS.INDETERMINATE, located: 'reference-void' },
  'referent-diffuse': { cut: CUT_KINDS.ARGUMENT, grounds: GROUNDS.INS, verdict: VERDICTS.INDETERMINATE, located: 'reference-void' },
  // arguments resolved but the relation is unstated — the predicate cut is suspended
  'unstated':    { cut: CUT_KINDS.PREDICATE, grounds: GROUNDS.RESIDUAL, verdict: VERDICTS.INDETERMINATE, located: 'unstated-relation' },
  'evaluation':  { cut: CUT_KINDS.PREDICATE, grounds: GROUNDS.RESIDUAL, verdict: VERDICTS.INDETERMINATE, located: 'unstated-relation' },
  // the located NAMES themselves are also keys, so a caller that already knows the address can
  // pass it directly (the decline path that stalled at a known cut).
  'not-in-corpus':     { cut: CUT_KINDS.PRESENCE,  grounds: GROUNDS.NULSIG,   verdict: VERDICTS.UNSUPPORTED,   located: 'not-in-corpus' },
  'reference-void':    { cut: CUT_KINDS.ARGUMENT,  grounds: GROUNDS.INS,      verdict: VERDICTS.INDETERMINATE, located: 'reference-void' },
  'unstated-relation': { cut: CUT_KINDS.PREDICATE, grounds: GROUNDS.RESIDUAL, verdict: VERDICTS.INDETERMINATE, located: 'unstated-relation' },
});
// The default location when a void measure's kind is unrecognised: a true gap (a presence void).
// UNSUPPORTED, so today's not-in-corpus behaviour is byte-identical for the kinds it already emits.
const DEFAULT_LOCATION = Object.freeze({ cut: CUT_KINDS.PRESENCE, grounds: GROUNDS.NULSIG, verdict: VERDICTS.UNSUPPORTED, located: 'not-in-corpus' });

export const recordVoidDef = (log, voidMeasure, { located = null } = {}) => {
  if (!log || !voidMeasure) return;
  const kind = voidMeasure.kind || 'void';
  const loc = located ? (VOID_LOCATION[located] || VOID_LOCATION[kind] || DEFAULT_LOCATION)
                      : (VOID_LOCATION[kind] || DEFAULT_LOCATION);
  // The stalled cut — the located address of the absence. A presence void grounds at NULSIG
  // (a mark that does not exist is decidable); a reference/predicate void is a suspension.
  const cut = makeCut({
    kind: loc.cut, of: `field:${kind}`, grounds: loc.grounds,
    verdict: loc.verdict === VERDICTS.UNSUPPORTED ? VERDICTS.UNSUPPORTED : VERDICTS.INDETERMINATE,
    witness: { kind, located: loc.located, receipt: voidMeasure.receipt || null, rode: voidMeasure.rode ?? null },
  });
  log.judge({
    verdict: cut.verdict,
    grain: GRAINS.FIELD,
    of: `field:${kind}`,
    witness: {
      kind,
      located: loc.located,
      stalledCut: loc.cut,
      receipt: voidMeasure.receipt || null,
      rode: voidMeasure.rode ?? null,
      cuts: [cut],
    },
  });
};
