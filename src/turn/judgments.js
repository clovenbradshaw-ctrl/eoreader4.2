// EO: DEF·SEG(Field,Lens → Lens,Paradigm, Dissecting,Clearing) — route the turn's same-vs-other verdicts onto the judgment log as DEFs
// The four gates of the turn each ALREADY make a same-vs-other judgment and hand it on as an
// ephemeral flag: the binder decides whether a claim cites (ground/bind.js), the fact-checker
// types a proposition against the sources (factcheck/correspond.js), the fold reads who a
// passage is about (perceiver/referent.js), the answerability gate measures an absence
// (enactor/answer/void.js). This module SURFACES those judgments as logged DEFs — a typed
// verdict carrying its witness — WITHOUT changing how any of them is computed. The retyping of
// the binder and the reference resolver (making the cut itself sharper) is later work; this is
// the substrate: the DEFs must exist on the log before anything can score or revise them.
//
// Each recorder is pure and best-effort: it appends to the log if one is present and returns
// quietly otherwise, so a turn without a judgment log — or a malformed input — is never
// broken by the logging. The witness is the judge's own derivation; a DEF without one would
// be an oracle, and core/def.js records that as malformed.

import { VERDICTS } from '../core/verdicts.js';
import { GRAINS, isVerdict } from '../core/def.js';

// The binding verdict → a DEF per claim. bind.js cuts same-from-other at the claim grain
// (`cited` — born from signal, not read lexically). A cited claim CORROBORATES; a claim that
// made lexical contact but was not born is INDETERMINATE (a witness that could not decide —
// the honest suspended DEF, not a false negative); a claim from nowhere (no citation, no
// contact) is UNSUPPORTED. The witness is bind's own derivation (the citation and its score).
//
// A TYPED row (The Work v2 #2 — bind.js ran the predication aligner) carries the sharper cut:
// the verdict comes from the predication (supported / unsupported / the tables' silence →
// INDETERMINATE, the underconfidence residue), lexical contact notwithstanding — sharing the
// subject's words is not support. The typed row ALSO seeds a PREDICATION-grain DEF under the
// same key the fact-checker judges (`predication:<sentence>`), witness = the full replay
// inputs, so the factcheck stage's later verdict lands as a REVISION of this one — the two
// readings of one predication chained on the log, not two strangers.
const TYPED_VERDICT = Object.freeze({
  supported: VERDICTS.CORROBORATED,
  unsupported: VERDICTS.UNSUPPORTED,
  indeterminate: VERDICTS.INDETERMINATE,
});

export const recordBindingDefs = (log, bound) => {
  if (!log || !Array.isArray(bound)) return;
  for (const b of bound) {
    if (!b || typeof b.claim !== 'string') continue;
    const cited   = !!b.citation;
    const contact = (b.score || 0) > 0;
    const verdict = b.typed
      ? (TYPED_VERDICT[b.typed.verdict] ?? VERDICTS.INDETERMINATE)
      : cited ? VERDICTS.CORROBORATED
      : contact ? VERDICTS.INDETERMINATE
      : VERDICTS.UNSUPPORTED;
    log.judge({
      verdict,
      grain: GRAINS.CLAIM,
      of: `claim:${b.claim}`,
      witness: {
        claim: b.claim,
        citation: b.citation || null,
        score: b.score || 0,
        edgeGrounded: !!b.edgeGrounded,
        ...(b.typed ? { typed: { op: b.typed.op, reason: b.typed.reason, of: `predication:${b.claim}` } } : {}),
      },
    });
    if (b.typed) {
      log.judge({
        verdict: TYPED_VERDICT[b.typed.verdict] ?? VERDICTS.INDETERMINATE,
        grain: GRAINS.PREDICATION,
        of: `predication:${b.claim}`,
        witness: {
          sentence: b.claim,
          op: b.typed.op,
          reason: b.typed.reason,
          spanIdx: b.typed.spanIdx ?? null,
          ...(b.typed.alignment ? { alignment: b.typed.alignment } : {}),
          ...(b.typed.strength ? { strength: b.typed.strength } : {}),
          ...(b.typed.eval ? { eval: b.typed.eval } : {}),
          gate: 'predication',
        },
      });
    }
  }
};

// The correspondence verdict → a DEF per proposition. factcheck/correspond.js already types
// each claim to one of the four grounding verdicts against the sources' own edges; this passes
// that verdict through at the PREDICATION grain, keeping the witness (the cited sentence, the
// reason a semantic check degraded). Untyped claims are skipped — a DEF must carry a verdict.
// When the binder's predication aligner already judged this sentence (v2 #2), the fact-check
// lands as a REVISION — a counter-DEF chained by `revises`, the second reading of the same
// predication on one audit chain, never a silent projection supersession.
export const recordCorrespondenceDefs = (log, claims) => {
  if (!log || !Array.isArray(claims)) return;
  for (const c of claims) {
    if (!c || !isVerdict(c.verdict)) continue;
    const of = `predication:${c.sentence || c.text || ''}`;
    const witness = {
      sentence: c.sentence || null,
      citation: c.citation || null,
      ...(c.reason ? { reason: c.reason } : {}),
    };
    if (log.latestOf(of)) log.revise(of, { verdict: c.verdict, witness });
    else log.judge({ verdict: c.verdict, grain: GRAINS.PREDICATION, of, witness });
  }
};

// The per-mention reference verdicts → one DEF per typed question mention (The Work v2 #3,
// turn/reference.js). This is the INPUT side of the reference cut, upstream of retrieval: a
// mention that resolved to one recorded sense CORROBORATES (carrying which sense and what
// discriminated it); a collision nothing cut is INDETERMINATE (carrying the ask it should
// pose) — the honest per-mention abstention that replaces the all-or-nothing diffuse veto.
// The witness is the full derivation — term, basins with weights, floor, hints, resolver —
// so a later reader re-derives the verdict from the witness alone, and the fold's evidence
// can revise it on the log (reference.js reviseMentionsWithEvidence).
export const recordMentionReferenceDefs = (log, mentions) => {
  if (!log || !Array.isArray(mentions)) return;
  for (const m of mentions) {
    if (!m || typeof m.term !== 'string' || !isVerdict(m.verdict)) continue;
    log.judge({
      verdict: m.verdict,
      grain: GRAINS.REFERENT,
      of: `referent:mention:${m.term}`,
      witness: {
        term: m.term,
        sense: m.sense?.label ?? null,
        senseId: m.sense?.id ?? null,
        margin: m.margin ?? 0,
        basins: m.basins || [],
        anchor: m.anchor || '',
        resolvedBy: m.resolvedBy || null,
        floor: m.floor ?? null,
        hints: m.hints || [],
      },
    });
  }
};

// The reference verdict → a DEF at the referent grain. referentialConfidence reads WHO a
// passage concerns off the γ-decayed coref posterior; a CONCENTRATED field settles the
// referent (CORROBORATED — this mention is the same referent as the anchor), a split field
// does not (INDETERMINATE — the witness cannot cut same-from-other, the honest abstention the
// Elvis diffusion should have produced). The witness is the posterior itself (the top id, its
// mass, the margin to the runner-up).
export const recordReferenceDef = (log, referential) => {
  if (!log || !referential) return;
  const verdict = referential.concentrated ? VERDICTS.CORROBORATED : VERDICTS.INDETERMINATE;
  log.judge({
    verdict,
    grain: GRAINS.REFERENT,
    of: `referent:${referential.id ?? '∅'}`,
    witness: {
      id: referential.id ?? null,
      w: referential.w ?? 0,
      margin: referential.margin ?? 0,
      concentrated: !!referential.concentrated,
    },
  });
};

// The void verdict → a DEF of absence at the field grain. A DEF of absence is still a DEF: the
// field cannot support the claim (UNSUPPORTED), and the witness carries WHICH absence — the
// measured kind, its scan receipt, and how far the reading rode. (The typing of distinct void
// CAUSES — reference-void vs unstated-evaluation vs not-in-corpus — is later work; here the
// absence is logged with the cause it already measured.)
export const recordVoidDef = (log, voidMeasure) => {
  if (!log || !voidMeasure) return;
  log.judge({
    verdict: VERDICTS.UNSUPPORTED,
    grain: GRAINS.FIELD,
    of: `field:${voidMeasure.kind || 'void'}`,
    witness: {
      kind: voidMeasure.kind || null,
      receipt: voidMeasure.receipt || null,
      rode: voidMeasure.rode ?? null,
    },
  });
};
