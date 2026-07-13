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
export const recordBindingDefs = (log, bound) => {
  if (!log || !Array.isArray(bound)) return;
  for (const b of bound) {
    if (!b || typeof b.claim !== 'string') continue;
    const cited   = !!b.citation;
    const contact = (b.score || 0) > 0;
    const verdict = cited ? VERDICTS.CORROBORATED
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
      },
    });
  }
};

// The correspondence verdict → a DEF per proposition. factcheck/correspond.js already types
// each claim to one of the four grounding verdicts against the sources' own edges; this passes
// that verdict through at the PREDICATION grain, keeping the witness (the cited sentence, the
// reason a semantic check degraded). Untyped claims are skipped — a DEF must carry a verdict.
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
