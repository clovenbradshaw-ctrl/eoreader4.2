// EO: EVA·SIG(Link,Entity → Atmosphere, Binding,Tending) — the one monitor
// enactor/monitor.js — the ONE monitor (add-on 3 §3, §4).
//
// THE HEADLINE: each output organ does NOT get its own feedback mechanism. There
// is one monitor, in the core, modality-blind, and it is where the self/world line
// is drawn. The efference copies for every modality are propositions; the
// sensed-back results are propositions; the comparator compares propositions and
// does not care which organ produced or sensed each. Talking while gesturing is
// two committed props and two efference copies flowing through ONE monitor, not
// two monitors — one loop, one self.
//
// The monitor holds the outstanding efference copies (cast by the gate at each
// commit, efference.js) and compares every sensed proposition against them (§3):
//
//   exact match (propKey)        → SELF · ATTENUATE · resolve the copy   (me-ness)
//   corresponds to a copy but    → SELF-MISMATCH · ERROR · world-interference ·
//     diverges (altered return)    correct the next commit · resolve the copy
//   matches no copy              → WORLD (news, unbidden — the not-me)
//
// The boundary is drawn HERE, by the comparison — not in any organ. The organs are
// dumb: the system perceives its own output through the ordinary senses, untagged,
// and me-ness is emergent in the core, the way structure is.

import { correspondProp, propKey } from './props.js';
import { SELF, WORLD, SELF_MISMATCH, createSelfModel } from '../core/self/index.js';

// A sensed proposition CORRESPONDS to an outstanding copy — same figures, possibly
// an altered relation — at or above this score → the (altered) return of that
// commit, not fresh world input. Below it (no shared endpoints) → the world.
// correspondProp scores endpoints at 0.7, so this floor catches a same-act,
// altered-consequence return while excluding an unrelated proposition.
export const MISMATCH_FLOOR = 0.5;

// createMonitor — the one comparator. Inject a shared self model to thread several
// turns through one self/world line; by default it owns one. There is exactly one
// monitor for all output organs.
export const createMonitor = ({ self = createSelfModel() } = {}) => {
  const outstanding = [];   // efference copies awaiting their sensed return
  const corrections = [];   // pending corrections to the enactor's next commit

  const hold = (copies) => { for (const c of copies || []) outstanding.push(c); };
  const resolve = (copy) => {
    const i = outstanding.indexOf(copy);
    if (i >= 0) outstanding.splice(i, 1);
  };
  const record = (obs) => self.record(Object.freeze(obs));

  // observe — draw the self/world line for one sensed proposition.
  const observe = (sensedProp, { modality = null } = {}) => {
    const key = propKey(sensedProp);

    // MATCH: a copy predicted exactly this → the system sensing its own output.
    // Me-ness, and attenuated (not processed as news). The copy is consumed: a
    // genuine later repeat from the world has no outstanding copy and reads as news.
    const exact = outstanding.find(c => c.predicted === key);
    if (exact) {
      resolve(exact);
      return record({ prop: sensedProp, tag: SELF, attenuated: true,
        commitId: exact.commitId, modality });
    }

    // SELF-PREDICTION MISMATCH: a copy is outstanding for the same act, but what
    // returned diverges (altered feedback). The monitor errors, pushes a correction
    // for the next commit (production is disrupted), and tags the return as
    // world-interference — news, not attenuated.
    let best = null;
    for (const c of outstanding) {
      const m = correspondProp(sensedProp, [c.prop]);
      if (m && m.score >= MISMATCH_FLOOR && (!best || m.score > best.score)) best = { copy: c, score: m.score };
    }
    if (best) {
      resolve(best.copy);
      corrections.push(Object.freeze({
        commitId: best.copy.commitId, expected: best.copy.predicted, sensed: key,
      }));
      return record({ prop: sensedProp, tag: SELF_MISMATCH, attenuated: false,
        error: true, interference: true, commitId: best.copy.commitId, modality });
    }

    // NO MATCH: nothing outstanding predicted this → the world, unbidden (news).
    return record({ prop: sensedProp, tag: WORLD, attenuated: false, modality });
  };

  return Object.freeze({
    hold, observe,
    outstanding: () => outstanding.slice(),
    corrections: () => corrections.slice(),
    self,
  });
};
