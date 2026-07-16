// EO: EVA(Network → Entity, Tracing) — identity evaluation (convergence vs conflict)
// Before two referents are asserted one, the proposal is checked against NEGATIVE evidence. This
// is the discipline the spec names: "Conflict defeats convergence. Insufficient evidence remains
// held … it does not silently create a merge." Lexical overlap is NOT identity (invariant 5) — it
// may license a PROPOSAL, but a conflicting functional attribute, a contested shared surname, an
// explicit split, or coordinated distinctness defeats it regardless of how many tokens two
// surfaces share. This module is pure over precomputed facts; index.js gathers the facts (it holds
// admission and the attribute ledger) and this decides.
//
// facts (per referent): { bornOn: string[], surname: string|null, surnameContested: bool,
//                         coactors: Set<refId> (referents it stands beside as a distinct participant) }

import { attributesConflict } from '../../core/index.js';

// evaluateConvergence(a, b, factsA, factsB, { isSplit }) → { verdict, reason, evidence }
//   verdict: 'converge' | 'conflict' | 'held'
export const evaluateConvergence = (a, b, factsA = {}, factsB = {}, { isSplit } = {}) => {
  // An explicit split is the heaviest signal (a reader/model asserted distinctness). It dominates
  // any convergence a proposer could offer — the same "conflict dominates convergence" rule the
  // ontological asterisk uses in projection.
  if (typeof isSplit === 'function' && isSplit(a, b))
    return { verdict: 'conflict', reason: 'asserted-distinct', evidence: ['user-split'] };

  // A functional identity key (a birth date) takes one value per referent. Two referents bearing
  // CONFLICTING values are two people — this defeats an otherwise strong proposal (acceptance 6).
  const ba = factsA.bornOn || [], bb = factsB.bornOn || [];
  if (ba.length && bb.length && attributesConflict('bornOn', ba, bb, { functional: true }).conflict > 0)
    return { verdict: 'conflict', reason: 'functional-key-conflict', evidence: ['bornOn', ...ba, ...bb] };

  // A surname simultaneously borne by distinct active referents does not license their merge —
  // "Armstrong" names Neil and Louis at once (acceptance 5). If both sides are keyed to the SAME
  // contested surname yet are proposed as one only on that surname, refuse.
  if (factsA.surname && factsA.surname === factsB.surname && factsA.surnameContested && factsB.surnameContested)
    return { verdict: 'conflict', reason: 'contested-surname', evidence: ['surname', factsA.surname] };

  // Coordinated as distinct participants — "the plaintiff and the defendant", "Delgado and Reyes"
  // standing beside each other in one clause — are two figures on stage, not one.
  if (factsA.coactors instanceof Set && factsA.coactors.has(b))
    return { verdict: 'conflict', reason: 'coordinated-distinct', evidence: ['co-participant'] };

  // No negative evidence. The proposer supplied the positive warrant, so convergence stands —
  // defeasibly, and auditable by its warrant/evidence on the emitted assertion.
  return { verdict: 'converge', reason: 'no-conflict', evidence: [] };
};
