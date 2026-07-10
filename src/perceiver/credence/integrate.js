// EO: EVA(Atmosphere,Lens,Field → Field,Lens, Tending,Binding) — reweight + flag, gated
// The two integration points (spec §9), implemented as PURE functions and held
// behind the gate. They are deliberately NOT yet spliced into the live retrieve
// or veto path: the spec's build discipline (§12) says the cheap read-only
// measurement comes first, and the reweighting turns on ONLY once the channels
// are shown to separate the seeker, the liar and the bullshitter on held-out
// sources. Until that gate passes (tests/credence-separation), these stay
// ready-to-wire and unit-tested, and the live paths are byte-identical (§12).
//
// When stage two turns them on, retrieve calls credenceReweight on its per-span
// prior and veto calls credenceFlag on each bound claim — both through
// frame.rules, changing the PRIOR, never the contract (§9).

import { CLASS, NUL_O } from './project.js';

// The gate. Off by default, read from rules so a frame (or a bench) can flip it
// without touching code, exactly as RULES_REV gates grounded speech. With it off,
// the reweight is the identity and the flag list is empty — nothing changes.
export const credenceEnabled = (rules) =>
  !!(rules && rules.credence && rules.credence.enabled);

// retrieve (§9): a source's current M and O bias retrieval scoring. A span from a
// low-M source in the relevant domain is down-weighted; a high-M source is left
// alone (and may be lifted slightly). This changes the prior the retriever
// operates under — the grounding-envelope reweighting the spine already allows —
// never the retrieve contract. Returns the prior unchanged when the gate is off,
// the state is NUL/never-set, or the domain does not match.
export const credenceReweight = (prior, state, rules = {}) => {
  if (!credenceEnabled(rules)) return prior;
  if (!state || state.classification === CLASS.NUL) return prior;   // never-probed → no opinion
  const r = rules.credence;
  const floor = r.reweight_floor ?? 0.25;   // a low-M source is never fully silenced — flag, don't gag
  const lift  = r.reweight_lift ?? 1.0;
  // Modelfulness scales the multiplier between the floor and the lift. A confident
  // bullshitter (M.hi low) lands near the floor; a confident model rides at lift.
  const m = Math.min(1, Math.max(0, state.M?.mean ?? 0));
  const factor = floor + (lift - floor) * m;
  return prior * factor;
};

// ground / veto (§9): a claim bound by CON to a source carries that source's
// current regime and classification. The veto ANNOTATES and never gags (the
// flag-and-tell rule shared with src/ground/veto.js). A low-M source draws a flag
// that the claim is unsupported by a coherent source in this domain; a high-M,
// low-O source (a LIAR) draws a flag that the source is modelful but anti-aligned,
// signal recoverable under inversion. Nothing is silently dropped.
//
// Returns a veto-shaped annotation { id, refuses, message, ... } or null. `refuses`
// is the display-severity marker the veto battery uses, never a gate.
export const credenceFlag = (state, rules = {}) => {
  if (!credenceEnabled(rules)) return null;
  if (!state || state.classification === CLASS.NUL || state.classification === CLASS.CLEARED) return null;

  const base = {
    source_id: state.source_id, domain: state.domain,
    classification: state.classification,
    M: state.M, O: state.O === NUL_O ? null : state.O,
    regime_start: state.regime_start,
  };

  switch (state.classification) {
    case CLASS.BULLSHITTER:
      return { id: 'credence-bullshitter', refuses: false, ...base,
        message: 'The cited source is not coherent in this domain — its claims have no model under them. The claim rides, flagged.' };
    case CLASS.LIAR:
      return { id: 'credence-anti-aligned', refuses: false, ...base,
        message: 'The cited source is modelful but anti-aligned in this domain — signal recoverable under inversion. The claim rides, flagged.' };
    case CLASS.MODELFUL_UNRESOLVED:
      return { id: 'credence-unresolved', refuses: false, ...base,
        message: 'The cited source is modelful but its orientation to the record is unresolved — the interval still spans. The claim rides, flagged.' };
    case CLASS.INDETERMINATE:
      return { id: 'credence-indeterminate', refuses: false, ...base,
        message: 'The cited source has too few coherence probes in this domain to call. The claim rides, flagged.' };
    case CLASS.SEEKER:
      return null;   // oriented toward the record — no flag, but the interval is reported elsewhere
    default:
      return null;
  }
};
