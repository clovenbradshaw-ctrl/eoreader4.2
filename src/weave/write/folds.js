// EO: EVA·DEF·NUL(Network,Field → Lens,Paradigm, Binding,Tracing,Tending) — Map<Holder,Fold>; beliefOf/modelOf (§3,§9,§20)
// write/folds.js — Map<Holder, Fold>; beliefOf; modelOf. (SPEC §3, §9, §20)
//
// §1: the Given-Log is the only non-perspectival object. Everything else is a
// Horizon — a projection computed at read time from some holder's routed subset of
// the log. The instant a second mind exists in the content, the log stops having one
// fold over it and starts having a family, one per holder. This module is that family.
//
// Belief is a fold from a point of view, time-indexed by the cursor (§3):
//
//   beliefOf(holder, fact, t) = the latest value of `fact` among events that holder
//                               WITNESSED, up to t (null means no information: void —
//                               the holder does not know).
//
// Higher-order belief is a fold containing a model of another fold (§3):
//
//   modelOf(A, B, fact, t) = the latest value among events e (e ≤ t) where A witnessed
//                            e AND B witnessed e. Events where A saw B ABSENT do NOT
//                            update A's model of B — which is what produces correct
//                            second-order false belief (belief.mjs / §9).
//
// THE NESTED ROOT (Update 4, §20). The system never holds another holder's belief; it
// holds its belief ABOUT another's. So every value this module reports about a non-self
// holder is wrapped in the outer instrument root (core/holder.js): `beliefOf` returns a
// `modeledBy: instrument` Belief, and `modelOf(A,B)` is the convenience name for
// `instrument-models( A-models-B )` — the outer instrument root always present (§20b).
// That outer root is reafferent, so by the type law it cannot anchor (§20a): the §9
// honesty rule is a CONSEQUENCE here, not a separate guard.
//
// WITNESSING IS HAND-LABELLED HERE. Who-witnessed-what (and especially who was absent)
// is supplied per event. Reading it from the prose is itself a perceiver pass and the
// highest-leverage, highest-risk component (open question §17.6) — out of this module.

import { createFold } from './fold.js';
import {
  INSTRUMENT, READER, isSelf,
  STATUS, makeBelief, selfBelief, beliefNotation, isModeled, canAnchor, beliefValue,
} from '../../core/holder.js';
import { fromPerceiver } from '../../core/provenance.js';

export { INSTRUMENT, READER, STATUS, beliefNotation, isModeled, canAnchor, beliefValue };

const asSet = (xs) => (xs instanceof Set ? xs : new Set(xs || []));

// createFolds — the family of Horizons over one shared, append-only log of witnessed
// events. Each entry is `{ key, value, t, witnesses, absent, status }`: a fact and the
// routing (§9) that says which holders it reached and which were seen to be away.
export const createFolds = () => {
  const log = [];                       // the shared, append-only witnessed-event log
  const folds = new Map();              // holder → its own createFold() (per-holder POV, §6)

  // record — append a witnessed event. `witnesses` is the set of holders the event
  // reached; `absent` the holders observed to be away (the routing of §9). `status`
  // marks whether the believers' standing is STATED by the source or INFERRED (§20e).
  // The instrument is the maximal-witnessing fold (§1): it read the text, so it
  // witnesses every recorded event unless explicitly listed absent.
  const record = ({ key, value = null, t = log.length, witnesses = [], absent = [], status = STATUS.INFERRED } = {}) => {
    if (key == null) throw new TypeError('folds.record: an event needs a `key` (the fact it sets)');
    const entry = Object.freeze({
      key, value, t,
      witnesses: asSet(witnesses),
      absent: asSet(absent),
      status,
    });
    log.push(entry);
    return entry;
  };

  // witnessed — did `holder` witness event `e`? The instrument witnessed everything it
  // read (§1, §20c) unless explicitly absent; any other holder must be in the event's
  // witnessing set and not in its absent set.
  const witnessed = (holder, e) =>
    !e.absent.has(holder) && (isSelf(holder) ? !e.absent.has(INSTRUMENT) : e.witnesses.has(holder));

  // latestFor — the latest value of `key` among events `holder` witnessed up to `t`.
  // null when the holder witnessed no setting of it (void: it does not know). Returns
  // the contributing entry so callers can read its status.
  const latestFor = (holder, key, t = Infinity, gate = witnessed) => {
    let hit = null;
    for (const e of log) {
      if (e.t > t || e.key !== key) continue;
      if (gate(holder, e)) hit = e;             // append-only: the last surviving wins
    }
    return hit;
  };

  // beliefOf — the §3 query, returning a Belief stamped with its outer root (§20).
  //   • the instrument's own fold is first-class (§20c): a self-belief, exafferent
  //     (it read the doc), so it may anchor.
  //   • any other holder's belief is the instrument's MODEL of it: `modeledBy:
  //     instrument`, reafferent, never anchoring (§20a). A null value is void — the
  //     holder does not know — and is reported as such, not as silence.
  const beliefOf = (holder, key, t = Infinity) => {
    const hit = latestFor(holder, key, t);
    const content = hit ? { key, value: hit.value } : { key, value: null };
    if (isSelf(holder)) {
      return selfBelief({ content, status: hit ? hit.status : STATUS.INFERRED, prov: fromPerceiver('doc') });
    }
    return makeBelief({ believer: holder, content, status: hit ? hit.status : STATUS.INFERRED });
  };

  // truth — the maximal-witnessing fold (§1): belief at the limit of witnessing, the
  // holder who saw everything. It is the instrument's own first-class fold. Drop one
  // event from its routing and it becomes a belief like any other.
  const truth = (key, t = Infinity) => beliefOf(INSTRUMENT, key, t);

  // modelOf — A's model of B's belief, as the instrument models it: the nested
  // `instrument · models( A · models( B · value ) )` (§20b). The value is the latest
  // setting of `key` that BOTH A and B witnessed (and that A did not see B miss):
  // events where A saw B absent do not update A's model of B (§3), which keeps a stale
  // value across a change B missed — second-order false belief.
  const modelOf = (A, B, key, t = Infinity) => {
    const hit = latestFor(B, key, t, (b, e) => witnessed(A, e) && witnessed(b, e) && !e.absent.has(B));
    const status = hit ? hit.status : STATUS.INFERRED;
    // the inner node: B's belief as modeled BY A (the second-order root, §20b)
    const inner = makeBelief({ believer: B, modeledBy: A, content: { key, value: hit ? hit.value : null }, status });
    // the outer node: A's model, rooted — always — at the instrument (§20f)
    return makeBelief({ believer: A, modeledBy: INSTRUMENT, content: inner, status });
  };

  // foldFor — a holder's own per-Horizon createFold() (frontier + γ-decayed integral),
  // lazily minted, for per-holder POV / focalization (§6): hand the renderer THIS
  // holder's integral, not the truth-fold's. Descriptor feeding is the caller's
  // (perceiver's) job, exactly as the single-holder fold.js documents.
  const foldFor = (holder) => {
    if (!folds.has(holder)) folds.set(holder, createFold());
    return folds.get(holder);
  };

  // ── Divergence across folds — the literary phenomena are operator events per fold
  // (§9). Dramatic irony is a fact known in the reader's fold and not yet in a
  // character's; suspense is the mirror (the character knows, the reader does not).
  const divergence = (key, { reader = INSTRUMENT, character, t = Infinity } = {}) => {
    if (!character) throw new TypeError('folds.divergence: needs a `character` holder to compare');
    const readerBelief = beliefOf(reader, key, t);
    const charBelief   = beliefOf(character, key, t);
    const r = beliefValue(readerBelief);
    const c = beliefValue(charBelief);
    let kind;
    if (r != null && c == null) kind = 'dramatic-irony';        // reader knows, character does not (§9)
    else if (r == null && c != null) kind = 'suspense';         // character knows, reader does not (§9 mirror)
    else if (r != null && c != null && r !== c) kind = 'divergent-belief';   // both committed, they disagree
    else kind = 'aligned';
    return Object.freeze({ kind, key, reader: r, character: c, readerBelief, charBelief });
  };

  return {
    record, beliefOf, truth, modelOf, foldFor, divergence,
    get log() { return log.slice(); },
    holders: () => [...folds.keys()],
  };
};
