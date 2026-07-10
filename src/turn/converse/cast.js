// EO: DEF·EVA·REC(Entity,Field → Entity,Paradigm, Dissecting,Binding,Composing) — conversation cast (source-activation memory)
// The conversation cast as a DEF→EVA→REC cycle (docs/operators.md, the Interpretation column;
// docs/source-activation.md, "landing on the referent").
//
// `referenceTarget` (reference.js) reads the turn's referent in ONE shot — the warmest figure
// the conversation holds — and keeps no memory. So a thin follow-up the live read cannot
// resolve ("no, the newest one") degrades to the loudest retrieval hit, and the reading wanders
// off the thing being discussed. The cast is the missing state: it remembers what the
// conversation has SETTLED on and carries it forward.
//
//   DEF (assert/define) — the referents under discussion are an explicit, persisted set, not a
//                         warmth ranking re-derived from scratch each turn.
//   EVA (evaluate frames)— which defined referent does THIS turn concern? The live read wins
//                         when it resolves; only when it resolves NOTHING does a settled
//                         referent the conversation is still holding carry forward, instead of
//                         the reading collapsing onto the loudest span.
//   REC (learn a rule)  — commit a referent as SETTLED only when the fold CONCENTRATED on the
//                         turn's target (referential.concentrated). A diffuse, wandering read
//                         commits nothing, so the carried state is never poisoned by it.
//
// Threaded through the session like the Horizon (surfer/horizon.js): one cast spans the
// conversation and accumulates. Null on a default turn → the fold is byte-identical and the
// read stays single-shot, exactly as before.

import { conversationCast, localeOf } from './reference.js';
import { namedReferents } from '../../perceiver/index.js';

export const createCast = () => {
  const settled = new Map();   // docId-space id → { id, label, locale, turn }
  let turn = 0;

  // The doc-space ids the conversation is still holding warm this turn (DEF, read fresh).
  const warmIds = (doc, history, question) => {
    const warm = new Set();
    if (!doc) return warm;
    for (const c of conversationCast(history, question)) {
      const id = namedReferents(doc, c.label)[0];
      if (id != null) warm.add(id);
    }
    return warm;
  };

  return {
    // EVA. Pure (no mutation): the live read (refTarget) wins when it resolves a referent; only
    // a NULL live read carries forward the most-recently-settled referent the conversation is
    // still holding (still warm AND still grounded in the doc). Returns { id, label, locale,
    // carried } or the original refTarget (possibly null) when nothing carries.
    evaluate({ doc, history = [], question = '', refTarget = null } = {}) {
      if (refTarget && refTarget.id != null) return { ...refTarget, carried: false };
      if (!doc || settled.size === 0) return refTarget || null;
      const warm = warmIds(doc, history, question);
      for (const s of [...settled.values()].sort((a, b) => b.turn - a.turn)) {
        if (!warm.has(s.id)) continue;                       // the topic moved on — do not carry a stale referent
        const locale = localeOf(doc, s.id) ?? s.locale ?? null;
        return { id: s.id, label: s.label, locale, carried: true };
      }
      return refTarget || null;
    },

    // REC. Advance the clock and, when the fold CONCENTRATED on the turn's target, settle it —
    // recording it as the thing the conversation has now established. A diffuse fold
    // (concentrated false/absent) commits nothing: the carried state only ever holds referents
    // a reading actually landed on.
    reconcile({ id = null, label = null, locale = null, concentrated = false } = {}) {
      turn += 1;
      if (concentrated && id != null) settled.set(id, { id, label: label ?? id, locale, turn });
      return { id, settled: concentrated && id != null };
    },

    // The cast as it stands — "the things we're talking about", for the audit / UI, most
    // recently settled first.
    snapshot() {
      return {
        turn,
        settled: [...settled.values()].sort((a, b) => b.turn - a.turn)
          .map(s => ({ id: s.id, label: s.label, turn: s.turn })),
      };
    },
  };
};
