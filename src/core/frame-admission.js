// EO: EVA·DEF·REC(Lens,Paradigm → Lens,Paradigm, Binding,Dissecting,Composing) — frame admission (defeasibility)
// Frame admission — defeasibility as the entry fee a frame pays BEFORE it reaches the tape. A frame is
// what REC installs: a reorganization of the standing holons, a def other claims are measured under
// (supersede.js). DEF posits; EVA grants force. For a frame to be admissible EVA must get PURCHASE on
// it — there must exist a possible tape-state under which EVA would defeat it. A frame satisfiable
// under every observation leaves EVA a no-op: it is not strong, it is EMPTY, carrying force EVA never
// conferred. It asserted itself; it skipped the algebra.
//
// So the admission rule, prior to any compression credit: EVERY FRAME SHIPS ITS OWN DEFEATER SET —
// the observations that would unseat it — and a frame whose defeater set is empty, or self-sealing
// (every would-be defeater pre-read as confirmation), fails DEF/EVA and never reaches the tape. The
// conspiracy theory is not caught downstream by a forensic audit; it fails at the door. "Name what
// would prove you wrong" is the test, and the self-sealing frame structurally cannot answer it.
//
// This gate composes the audits in frame-audit.js (re-exported below), one per evidence channel —
// FUTURE (defeaters + the risk-capped retro refund), ABSENT (NUL→SIG), PRESENT (trust exogeneity) —
// and the guardrail that surprise may drop only by EXPLANATION, never suppression (supersede.js
// already holds half: RETRACTED is terminal and world-issued). An admitted frame installs as a def
// CARRYING its defeater set forward as data, so the standing EVA hook is mechanical: an arrival
// matching an installed defeater composes with σ and the frame is evicted the way every abandoned
// basis is — priced, unsettled, on the ledger.

import { supersedeEntries } from './supersede.js';
import { defeaterAudit, absenceAudit, poisonAudit, frameCompetence } from './frame-audit.js';

// the measures, re-exported so the whole algebra reaches through one entrance.
export {
  normWorld, defeaterAudit, riskedBitsPerSite, retroAudit, absenceAudit, poisonAudit,
  chanceFloor, frameCompetence,
} from './frame-audit.js';

// The failure vocabulary — each names a way a frame tried to carry force EVA never conferred.
export const INADMISSIBLE = Object.freeze({
  EMPTY_DEFEATERS: 'empty-defeater-set',   // names nothing that would unseat it
  SELF_SEALING: 'self-sealing',            // names defeaters, then reads each as confirmation
  INERT: 'inert-to-evidence',              // forbids no observation mass — EVA has no purchase
  ALREADY_DEFEATED: 'already-defeated',    // a named defeater is already on the tape — it IS there
  ABSENCE_MINING: 'absence-mining',        // derives a holon from a void (NUL cited as SIG)
  SOURCE_POISONING: 'source-poisoning',    // demotes a disagreeing voice on no independent ground
  SUPPRESSION: 'suppression',              // refunds surprise on a frozen site with no explaining span
});

// admitFrame(frame, world, opts) → the verdict, every audit run, every failure typed. Admission is
// prior to any compression credit: a frame failing here never reaches the tape, however much it
// claims to explain — its keepAmplitude is not low, it is void.
export const admitFrame = (frame, world, opts = {}) => {
  const defeaters = defeaterAudit(frame, world);
  const absence = absenceAudit(frame, world);
  const poison = poisonAudit(frame, world);
  const competence = frameCompetence(frame, world, opts);

  const failures = [];
  if (defeaters.declared.length === 0) failures.push(INADMISSIBLE.EMPTY_DEFEATERS);
  else if (defeaters.live.length === 0) failures.push(INADMISSIBLE.SELF_SEALING);
  if (!(defeaters.forbiddenMass > 0)) failures.push(INADMISSIBLE.INERT);
  if (defeaters.occurredHits.length > 0) failures.push(INADMISSIBLE.ALREADY_DEFEATED);
  if (absence.mined.length > 0) failures.push(INADMISSIBLE.ABSENCE_MINING);
  if (poison.poisoned.length > 0) failures.push(INADMISSIBLE.SOURCE_POISONING);
  if (competence.retro.suppressed.length > 0) failures.push(INADMISSIBLE.SUPPRESSION);

  return Object.freeze({
    id: frame?.id ?? null,
    admitted: failures.length === 0,
    failures: Object.freeze(failures),
    defeaters, absence, poison, competence,
  });
};

// frameDefEntry — the def entry an admitted frame becomes: serializable, append-only, carrying its
// OWN defeater set forward as data (the standing EVA hook). Minting is a promise (pin.js discipline):
// an unadmitted frame throws here, loudly, because the ledger must never hold a frame that skipped
// the algebra. Shaped for supersede.js — kind 'def', an id, an `under` edge — so it is priced,
// unsettled, and evicted by the same σ that governs every basis.
export const frameDefEntry = (frame, verdict, { under = null, turn = 0, seq = null } = {}) => {
  if (!verdict?.admitted) {
    throw new Error(`frame-admission: '${frame?.id}' is not admitted (${(verdict?.failures || []).join(', ') || 'no verdict'}) — an unadmissible frame never reaches the tape`);
  }
  return Object.freeze({
    kind: 'def', id: frame.id,
    ...(seq != null ? { seq } : {}),
    under, turn, provenance: 'rec',
    defeaters: Object.freeze([...verdict.defeaters.live]),
    forbiddenMass: verdict.defeaters.forbiddenMass,
  });
};

// An arrival defeats an installed frame when it matches the defeater set the frame itself shipped.
// Mechanical on purpose: the frame named the terms of its own defeat at admission, so no reading,
// no judgment, and no narrating happens here.
export const defeatedBy = (defEntry, atom) =>
  Array.isArray(defEntry?.defeaters) && atom != null && defEntry.defeaters.includes(atom);

// defeatEntriesOn — the eviction, composed with σ: a matching arrival supersedes the frame and
// unsettles everything measured under it (the bill supersede.js prices, paid on the same ledger).
// Not defeated → [] (append nothing; a log that repeats itself is noise, not memory).
export const defeatEntriesOn = (entries, defEntry, atom, { turn = 0, now = null } = {}) => {
  if (!defeatedBy(defEntry, atom)) return [];
  return supersedeEntries(entries, { was: defEntry.id, now, turn, why: `a named defeater arrived: ${String(atom)}` });
};

// inquiryExhausted — the stopping signal: a line of inquiry is done when new salient spans stop
// reducing the tape's surprise. `history` is the keepAmplitude sequence, in arrival order; `window`
// consecutive ≤ε amplitudes → exhausted. The residual that won't compress is the remaining story —
// or the thing you were wrong about. Either way, where to point next.
export const inquiryExhausted = (history = [], { window = 3, epsilon = 1e-9 } = {}) => {
  const xs = (history || []).filter(Number.isFinite);
  if (xs.length < window) return Object.freeze({ exhausted: false, streak: 0 });
  let streak = 0;
  for (let i = xs.length - 1; i >= 0 && xs[i] <= epsilon; i--) streak += 1;
  return Object.freeze({ exhausted: streak >= window, streak });
};
