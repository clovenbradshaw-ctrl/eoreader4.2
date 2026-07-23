// EO: EVA(Lens, Binding) — the provenance grade of a proposition
// Dependency order is CONSTRUCTIVE: it walks a fold that can be re-run and checked at
// every step. Classical results — excluded middle, double-negation elimination — cost
// a TOLL to get there from a constructive base (Glivenko's theorem: A is classically
// provable iff ¬¬A is intuitionistically provable). Nothing in this codebase, until
// now, distinguished a proposition a span WITNESSES from one merely NOT CONTRADICTED
// by anything read — enactor/ground/provenance.js classifyProvenance already produces
// almost exactly this shape per span (grounding: verbatim/grounded/fabricated; witness:
// exafference/reafference/void); this module names the three-grade LEDGER those
// dimensions collapse to, and the publish-time rule that keeps the toll honest.
import { classifyProvenance } from '../enactor/ground/provenance.js';

export const GRADE = Object.freeze({
  WITNESSED:  'witnessed',   // ⊢A       — a span grounds it. Constructive. Extractable.
  CONSISTENT: 'consistent',  // ⊬¬A      — nothing contradicts it. Classical. No witness.
  UNREAD:     'unread',      // ¬⊢A      — no reading either way. POLARITY.NULL's partner.
});

// gradeOf(prop) — reads a proposition already classified by classifyProvenance
// (`{ witness }`: 'exafference' | 'reafference' | 'void') OR one carrying Assembly 1's
// polarity trichotomy (`{ pol }`, propositionsOf's declared closure). The world
// witnessing it directly (exafference) is WITNESSED; the engine's own unwitnessed
// notes (reafference) or a claim grounded only to the model's training (void) are both
// CONSISTENT — present, nothing contradicts them, but nothing outside the reading
// backs them either; a base the declared closure marked NULL, or a proposition with
// neither signal, is UNREAD.
export const gradeOf = (prop) => {
  if (prop?.pol === '∅') return GRADE.UNREAD;
  if (prop?.witness === 'exafference') return GRADE.WITNESSED;
  if (prop?.witness === 'reafference' || prop?.witness === 'void') return GRADE.CONSISTENT;
  return GRADE.UNREAD;
};

// gradeProvenance(answer, source) — classifyProvenance, lifted: every proposition
// carries its grade alongside the existing grounding/ground/witness fields (additive;
// nothing already reading `.grounding`/`.witness` sees a different shape), plus a
// `grade` tally and `onlyConsistent` — the exact synthetic case the ledger rule below
// refuses: propositions exist, none is WITNESSED, and at least one is CONSISTENT.
export const gradeProvenance = (answer, source = []) => {
  const prov = classifyProvenance(answer, source);
  const propositions = prov.propositions.map((p) => Object.freeze({ ...p, grade: gradeOf(p) }));
  const grade = { [GRADE.WITNESSED]: 0, [GRADE.CONSISTENT]: 0, [GRADE.UNREAD]: 0 };
  for (const p of propositions) grade[p.grade] += 1;
  return Object.freeze({
    ...prov, propositions, grade,
    onlyConsistent: propositions.length > 0 && grade[GRADE.WITNESSED] === 0 && grade[GRADE.CONSISTENT] > 0,
  });
};

// ledgerAllows(grades) — the two-column ledger rule (Assembly 4): a WITNESSED grade
// anywhere in the support set clears a published claim (CONSISTENT support may ride
// alongside it, corroborating); with no WITNESSED grade present, CONSISTENT alone —
// however much of it — may NEVER be the sole support; UNREAD grounds nothing at all.
export const ledgerAllows = (grades) => {
  const gs = Array.isArray(grades) ? grades : [grades];
  return gs.some((g) => g === GRADE.WITNESSED);
};
