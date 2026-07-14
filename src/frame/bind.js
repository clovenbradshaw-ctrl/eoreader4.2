// EO: EVA·DEF·REC(Network,Link → Lens, Binding,Tracing) — decideBind — the bind decision
// frame/bind.js — decideBind: the one bind, generalized from frame-binding-route
// Phase 3's single-frame couplings to the whole active path (docs/frame-holon.md).
//
// With a stack there is one coupling PER NODE on the active path, plus the
// novelty channel, each NUL-gated, argmax:
//
//   c_leaf        EVA(e | current leaf)         → REC-refine   (repair/continue this frame)
//   c_subj[i]     EVA(e | subject_i of leaf)    → REC-elaborate (same subject, asked/developed)
//   c_anc[k]      EVA(e | ancestor frame k)     → REC-return    (pop the digression: "where were we")
//   c_new         novelty(e)                    → SEG a child   (push: digression / decomposition)
//   (all under NUL)                             → hold to the incumbent leaf
//
// Every coupling is EVA over PROPS (the floor of meaning), measured by the
// CALLER in its own term-space (lexical Born overlap for text, set/prefix
// overlap for notes, feature overlap for patches) and handed in as numbers — so
// this decision is interior and identical across modalities: it never sees a
// unit, only couplings. The relaxation is the incumbent-as-resting-potential one
// already in longgen/relax.js: a push (SEG a child) or a pop (REC to an
// ancestor) must OUT-COMPETE the current leaf's refine through lateral
// inhibition, not merely register. Ties hold to the incumbent (the leaf channel
// is first in the alphabet).
//
// "Continue this frame · return to a level · revise a frame" is not new
// machinery — it is DEF·EVA·REC, the core's existing loop, at the frame grain:
// hold is DEF (and NUL when nothing coheres), a refine is EVA reinforcing the
// frame, a return is REC reinstating a suspended one, a push is SEG opening a
// child. Termination is the shared guards (frame/constants.js) reused
// unchanged: a push past MAX_DEPTH or MAX_FANOUT degrades to a refine and the
// firing is returned as `guard` so the caller records it in `dropped` — never
// silent. The control is one measurement over logged objects, so it can neither
// out-vote itself nor fail to halt.

import { relax } from '../weave/longgen/index.js';
import { MAX_DEPTH, MAX_FANOUT } from './constants.js';

// The verdict vocabulary. `hold` is the abstention (NUL — nothing cleared, the
// incumbent leaf keeps the event); the other four are the argmax channels.
export const BIND_MOVES = Object.freeze(['hold', 'refine', 'elaborate', 'return', 'push']);

// The incumbent's resting potential — the same small tiebreaker weight
// relaxMove gives its prior (0.15): enough that a marginal challenger loses to
// the standing frame, small enough that a real digression or return wins.
const REST = 0.15;

// decideBind — pure. One call per incoming event; no recursion, no state.
//
//   path       the active path ids, root → leaf (projectFrameStack().path).
//   leaf       c_leaf: EVA(e | current leaf), a number.
//   subjects   c_subj: [{ subject, w }] over the LEAF's subject-set.
//   ancestors  c_anc:  [{ id, w }], one per PROPER ancestor on the path.
//   novelty    c_new:  novelty(e), a number.
//   nul        the NUL line (core/voidnull's derived floor, or a caller
//              constant): a coupling must EXCEED it to enter the competition.
//   depth      the leaf's depth (defaults to path.length - 1) — the push guard.
//   fanout     the leaf's current child count, if the caller tracks it — the
//              second push guard. null skips it.
//   rest       the incumbent resting potential; opts passes through to relax().
//
// Returns { move, target, channel, subject?, guard?, activations }:
//   hold      target = leaf (or null on an empty path — the cold/empty-stack
//             case, where the caller falls back to its baseline routing).
//   refine    target = leaf.
//   elaborate target = leaf, subject = the winning subject.
//   return    target = the bound ancestor (the pop).
//   push      target = leaf (the parent the caller opens the child under).
export const decideBind = ({
  path = [],
  leaf = 0,
  subjects = [],
  ancestors = [],
  novelty = 0,
  nul = 0,
  depth = null,
  fanout = null,
  maxDepth = MAX_DEPTH,
  maxFanout = MAX_FANOUT,
  rest = REST,
  opts = {},
} = {}) => {
  const leafId = path.length ? path[path.length - 1] : null;
  if (leafId == null) return { move: 'hold', target: null, channel: null };

  const gate = (w) => (Number.isFinite(w) && w > nul ? w : 0);

  const cLeaf = gate(leaf);
  const bestSubject = subjects.reduce(
    (m, s) => (s && gate(s.w) > m.w ? { subject: s.subject, w: gate(s.w) } : m),
    { subject: null, w: 0 },
  );
  const ancs = ancestors.map((a) => ({ id: a.id, w: gate(a.w) })).filter((a) => a.w > 0);
  const cNew = gate(novelty);

  // All under NUL → hold to the incumbent leaf. Not a routing: an abstention.
  if (cLeaf === 0 && bestSubject.w === 0 && !ancs.length && cNew === 0) {
    return { move: 'hold', target: leafId, channel: null };
  }

  // The competition: leaf first (ties hold to the incumbent), then the leaf's
  // subjects, the ancestors, the novelty channel. The incumbent's resting
  // potential rides on the leaf channel whether or not c_leaf cleared NUL —
  // a challenger must out-compete it, not merely register.
  const alphabet = ['leaf', 'subject', ...ancs.map((a) => `anc:${a.id}`), 'new'];
  const currents = { leaf: cLeaf + rest, subject: bestSubject.w, new: cNew };
  for (const a of ancs) currents[`anc:${a.id}`] = a.w;

  const settled = relax(currents, { ...opts, alphabet });
  const winner = settled.winner;

  let decision;
  if (winner === 'leaf') {
    // The incumbent won. If only its resting potential carried it (c_leaf under
    // NUL), that is a hold, not a measured refine.
    decision = cLeaf > 0
      ? { move: 'refine', target: leafId, channel: 'leaf' }
      : { move: 'hold', target: leafId, channel: null };
  } else if (winner === 'subject') {
    decision = { move: 'elaborate', target: leafId, channel: 'subject', subject: bestSubject.subject };
  } else if (winner === 'new') {
    decision = { move: 'push', target: leafId, channel: 'novelty' };
  } else {
    decision = { move: 'return', target: winner.slice(4), channel: 'ancestor' };
  }

  // The runaway guards, reused unchanged: a winning push at the depth or fanout
  // cap is forced down to a refine of the leaf, and the firing is returned so
  // the caller records it in `dropped` — a forced leaf is part of the trace.
  if (decision.move === 'push') {
    const d = depth == null ? path.length - 1 : depth;
    if (d >= maxDepth) {
      decision = { move: 'refine', target: leafId, channel: 'novelty', guard: { guard: 'depth', at: d, asked: 'push' } };
    } else if (fanout != null && fanout >= maxFanout) {
      decision = { move: 'refine', target: leafId, channel: 'novelty', guard: { guard: 'fanout', at: fanout, asked: 'push' } };
    }
  }

  decision.activations = settled.activations;
  return decision;
};
