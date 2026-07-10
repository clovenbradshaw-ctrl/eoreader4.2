// EO: SYN·CON·REC·SEG·EVA(Field,Network,Link → Network,Link,Paradigm,Lens, Composing,Binding,Tracing,Unraveling) — barrel
// reason/index.js — the reasoning-walk holon entrance.
//
// The walk over the append-only log: continuous, meaningful output as ACCUMULATION over
// committed steps, each voiced through the enactor door (canWitness false, by type), each
// graded (grounded / warranted-ungrounded / idle-ungrounded) off the log, terminating on
// surprise-saturation. See walk.js for the full account and docs/ungrounded-emitted.md for the
// resolution lattice it emits into.
//
// Depends on `core` only. No model. A `propose` backend may be injected to let a talker rank
// the confined menu; the loop, the firewall, the grade, and the termination are model-independent.

export { walkReasoning, seedCorpus, noStepLaunders, noScopeLaunders, pastMenu, readGraph, IDENTITY } from './walk.js';

// The cursor (reason/cursor.js, CURSOR_REV): the walk's fold generalized to
// readGraph(log, { upto, scope, grain, origin, door }) — memory, revision, standpoint,
// height, regret, the modal family, the enactor-DEF counterfactual, possibility/
// necessity, and reflection, all as specializations of one parameter. IDENTITY folds
// exactly what the ungeneralized function folded (the golden-parity anchor).
export {
  CURSOR_REV, replayState, scopesOf, openScopes, dischargeScope, buildDischarge,
  contradictionsIn, possible, necessary, reflect,
} from './cursor.js';
