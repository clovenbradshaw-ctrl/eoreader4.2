// EO: EVA·NUL·DEF(Lens,Network → Lens,Void, Binding,Clearing,Tracing) — the web-fetch scope boundary (§9)
// Fetching is legitimate in EXACTLY ONE place: resolving `external-unresolved` references (§7). It is
// explicitly NOT a structure-discovery mechanism. This module is the guard that keeps that boundary,
// worth a code-level comment at every call site:
//
//   · A fetched result MAY be logged as one more UNTRUSTED witness/CON, folded into EVA's
//     adjudication of a genuinely tied pattern-conflict.
//   · A fetched result CANNOT supply a ruled-out-other and CANNOT count toward a pattern's
//     corroboration threshold. Corroboration must come from independent INTERNAL instances only.
//
// The tell for scope creep, made a function: does the fetch resolve a SPECIFIC external target
// (fine), or does it substitute for corroboration the system was supposed to EARN on its own (not
// fine, revert)? `mayFetch` answers the first; `guardCorroboration` / `guardRuledOut` enforce the
// second. Pure — no network here; this decides whether a fetch is IN SCOPE and how its result may be
// used, never performs one.

import { REF_STATES } from './reference.js';
import { VERDICTS } from '../../core/index.js';

// mayFetch(ref) → { allowed, reason }. A fetch is in scope ONLY to resolve an external-unresolved
// reference to a specific target. Every other state (internal-anchor, live-mutable, transclusion,
// quotation, cycle, already-resolved) resolves without a fetch, and — crucially — a fetch is NEVER in
// scope for structure discovery, so a call with no specific `target` is refused even in the right
// state.
export const mayFetch = (ref = {}) => {
  const state = ref.state ?? null;
  if (ref.purpose && ref.purpose !== 'resolve-reference')
    return Object.freeze({ allowed: false, reason: `out-of-scope-purpose:${ref.purpose} — a fetch resolves a target, it does not discover structure` });
  if (state !== REF_STATES.EXTERNAL_UNRESOLVED)
    return Object.freeze({ allowed: false, reason: `state:${state} resolves without a fetch` });
  if (ref.target == null)
    return Object.freeze({ allowed: false, reason: 'no specific external target — a fetch must resolve a target, never substitute for corroboration' });
  return Object.freeze({ allowed: true, reason: 'resolving a specific external-unresolved target (§7)' });
};

// FETCHED — the provenance tag a fetched witness carries so the guards below can recognise it.
export const FETCHED = 'fetched';

// markFetchedWitness(witness) → the witness tagged as fetched + untrusted. Logged as one more CON
// witness, but recognisable so it can never sneak into a corroboration count or a ruled-out-other.
export const markFetchedWitness = (witness = {}) =>
  Object.freeze({ ...witness, origin: FETCHED, trusted: false });

const isFetched = (w) => !!w && (w.origin === FETCHED || w.trusted === false);

// guardCorroboration(corroboration) → { internal, dropped } — the corroboration list with every
// FETCHED witness removed from the count. Corroboration must come from independent internal instances
// only (§9); a fetched result folded into the count is exactly the scope creep this reverts. The
// dropped list is surfaced (never silently discarded) so the audit can see what was excluded.
export const guardCorroboration = (corroboration = []) => {
  const internal = [], dropped = [];
  for (const c of corroboration) (isFetched(c) ? dropped : internal).push(c);
  return Object.freeze({ internal: Object.freeze(internal), dropped: Object.freeze(dropped) });
};

// guardRuledOut(ruledOut) → the ruled-out-other, or null if it was sourced from a fetched witness. A
// fetched result cannot supply a ruled-out-other (§9): the exclusion the Sophist requirement demands
// must be EARNED against the system's own internal near-miss, not imported from the web.
export const guardRuledOut = (ruledOut = null) => {
  if (ruledOut && isFetched(ruledOut)) return null;
  if (ruledOut && ruledOut.other && isFetched(ruledOut.other)) return null;
  return ruledOut;
};

// foldFetchedIntoConflict(evaTie, fetchedWitness) → an EVA that folds a fetched witness into a
// GENUINELY TIED pattern-conflict adjudication (the one legitimate downstream use, §9). It only fires
// when the prior adjudication was INDETERMINATE (a real tie); on any decided conflict the fetch is
// refused, because there is no tie for it to break — using it there would be it substituting for
// corroboration. The witness rides as untrusted, tipping the tie without ever counting as
// corroboration.
export const foldFetchedIntoConflict = (evaTie, fetchedWitness, { favours = null } = {}) => {
  if (!evaTie || evaTie.verdict !== VERDICTS.INDETERMINATE)
    return Object.freeze({ op: 'EVA', site: 'pattern-conflict', verdict: evaTie?.verdict ?? VERDICTS.INDETERMINATE, refusedFetch: true, reason: 'no genuine tie to break — a fetch may not substitute for corroboration' });
  return Object.freeze({
    op: 'EVA', site: 'pattern-conflict', verdict: favours ? VERDICTS.CORROBORATED : VERDICTS.INDETERMINATE,
    winner: favours ?? null, witness: markFetchedWitness(fetchedWitness), trustedWitness: false,
    note: 'fetched witness folded into a genuinely tied conflict — untrusted, tips the tie, never counts toward corroboration (§9)',
  });
};
