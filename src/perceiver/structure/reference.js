// EO: CON·DEF·EVA·SEG(Link,Network → Link,Lens, Binding,Dissecting,Tracing) — the reference state machine (§7)
// Explicit typed states for any cross-source reference, replacing an implicit resolved/unresolved
// boolean. A reference is a CON (the bond at Relate × Structure) whose HANDLING depends on which of
// seven states it is in — and one of those states, `cycle`, is a required PRECONDITION for the safe
// indefinite recursion of §8: without a typed, detected cycle state, unbounded depth is an
// infinite-loop risk, not merely a design gap.
//
// This module is pure: it classifies a reference into a state, names the handling that state
// demands, drives transitions as evidence arrives, and detects reference cycles. It appends nothing;
// index.js logs the CON / DEF / EVA tuples it returns.

import { VERDICTS } from '../../core/index.js';

// The seven typed states (§7). Each names a DIFFERENT handling, so the boolean it replaces would
// have collapsed genuinely distinct cases (a live-mutable target and an unresolved one are not the
// same "false").
export const REF_STATES = Object.freeze({
  INTERNAL_ANCHOR:     'internal-anchor',      // footnote within same doc — resolve immediately, no fetch
  EXTERNAL_RESOLVED:   'external-resolved',    // target already INS'd in log — sign→anchor, a real CON
  EXTERNAL_UNRESOLVED: 'external-unresolved',  // target not yet ingested — provisional CON, VOID-until-resolved
  LIVE_MUTABLE:        'live-mutable',         // a changing live source — OPEN question (§11), unresolved here
  TRANSCLUSION:        'transclusion',         // B's content embedded in A — a SYN (derived whole), not a CON
  QUOTATION:           'quotation',            // a fragment of B copied into A — needs a provenance chain to B
  CYCLE:               'cycle',                // A → B → A — a typed, detected state, never silent recursion
});

// The handling each state demands (§7's right column), as data so a caller reads it rather than
// re-deriving it. `op` is the operator the reference RESOLVES to; `fetch` says whether resolving it
// legitimately fetches (only external-unresolved does — the §9 scope boundary depends on this);
// `void` marks a state that resolves to a zone/binding VOID until more arrives; `open` marks the
// live-mutable question the spec flags rather than defaults (§11).
export const REF_HANDLING = Object.freeze({
  [REF_STATES.INTERNAL_ANCHOR]:     { op: 'CON', fetch: false, void: false, note: 'resolve immediately, no fetch' },
  [REF_STATES.EXTERNAL_RESOLVED]:   { op: 'CON', fetch: false, void: false, note: 'sign→anchor, becomes real CON' },
  [REF_STATES.EXTERNAL_UNRESOLVED]: { op: 'CON', fetch: true,  void: true,  note: 'provisional CON, VOID-until-resolved; the ONE place a fetch is legitimate (§9)' },
  [REF_STATES.LIVE_MUTABLE]:        { op: 'CON', fetch: false, void: true,  open: true, note: 'OPEN (§11): snapshot-bind vs re-resolve live — unresolved, flagged not defaulted' },
  [REF_STATES.TRANSCLUSION]:        { op: 'SYN', fetch: false, void: false, note: "B's content embedded in A — SYN (derived whole), NOT CON" },
  [REF_STATES.QUOTATION]:           { op: 'CON', fetch: false, void: false, note: 'requires a provenance chain to B’s anchor, or it is an orphaned string' },
  [REF_STATES.CYCLE]:               { op: 'SEG', fetch: false, void: false, note: 'typed, detected — not silent infinite recursion or truncation' },
});

// classifyReference(ref) → the state, from the reference's OWN facts (no fetch, no guess):
//   ref = { target, sameDoc?, resolved?, live?, mode?('transclude'|'quote'|'point'), provenance? }
// `mode` and the resolved/live/sameDoc flags are read off what ingest already knows about the
// reference; nothing here reaches out to the network to decide (that would be §9 scope creep).
export const classifyReference = (ref = {}) => {
  if (ref.mode === 'transclude') return REF_STATES.TRANSCLUSION;
  if (ref.mode === 'quote')      return REF_STATES.QUOTATION;
  if (ref.sameDoc)               return REF_STATES.INTERNAL_ANCHOR;
  if (ref.live)                  return REF_STATES.LIVE_MUTABLE;
  return ref.resolved ? REF_STATES.EXTERNAL_RESOLVED : REF_STATES.EXTERNAL_UNRESOLVED;
};

// resolveReference(ref, graph) → { state, handling, event } — the CON/SYN/SEG tuple the reference
// resolves to, given the current graph's known anchors. An external-unresolved reference whose target
// LATER appears in the graph transitions to external-resolved (sign→anchor) automatically; a
// quotation with no provenance chain is flagged an orphaned string rather than silently accepted.
export const resolveReference = (ref = {}, graph = {}) => {
  let state = classifyReference(ref);
  const hasAnchor = (id) => !!(graph.anchors && graph.anchors.has ? graph.anchors.has(id) : (graph.anchors || []).includes?.(id));

  // The one automatic transition: an unresolved external ref whose target is now INS'd is resolved.
  if (state === REF_STATES.EXTERNAL_UNRESOLVED && hasAnchor(ref.target)) state = REF_STATES.EXTERNAL_RESOLVED;

  const handling = REF_HANDLING[state];
  const base = { op: handling.op, kind: 'reference', state, target: ref.target ?? null };

  if (state === REF_STATES.QUOTATION && !ref.provenance)
    return Object.freeze({ state, handling, event: Object.freeze({ ...base, verdict: VERDICTS.UNSUPPORTED, orphaned: true, note: 'quotation with no provenance chain to an anchor — an orphaned string' }) });
  if (handling.void)
    return Object.freeze({ state, handling, event: Object.freeze({ ...base, verdict: VERDICTS.INDETERMINATE, void: true, note: handling.note }) });
  return Object.freeze({ state, handling, event: Object.freeze({ ...base, verdict: VERDICTS.CORROBORATED, note: handling.note }) });
};

// transition(ref, evidence) → the reference's new state as evidence arrives. Explicit so a
// resolved/unresolved boolean can never silently flip a live-mutable or transclusion into the wrong
// handling. Idempotent when the evidence changes nothing.
export const transition = (ref = {}, evidence = {}) => {
  const next = { ...ref };
  if (evidence.ingested) next.resolved = true;                    // the target was ingested
  if (evidence.snapshot) { next.live = false; next.resolved = true; }  // a live source pinned at capture (one §11 answer, chosen explicitly by the caller)
  if (evidence.mode) next.mode = evidence.mode;
  if (evidence.provenance) next.provenance = evidence.provenance;
  return Object.freeze({ ref: Object.freeze(next), state: classifyReference(next) });
};

// ── cycle detection (§7, §8) ─────────────────────────────────────────────────────────────────────
// detectCycles(edges) → the cycles in a reference graph, as a typed CYCLE state — NOT silent infinite
// recursion or silent truncation. `edges` is [{ from, to }]; a self-quoting forwarded email chain
// (A → B → A) surfaces here as a named cycle the recursion (§8) can stop AT, rather than descend into
// forever. Depth-first with a recursion stack; returns each cycle's node ring, deduplicated.
export const detectCycles = (edges = []) => {
  const adj = new Map();
  for (const e of edges) { if (!adj.has(e.from)) adj.set(e.from, []); adj.get(e.from).push(e.to); }
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map();
  const stack = [];
  const cycles = [];
  const seen = new Set();

  const record = (ring) => {
    // Canonicalise the ring (rotate to its smallest node) so A→B→A and B→A→B dedupe to one cycle.
    const min = ring.indexOf([...ring].sort()[0]);
    const canon = [...ring.slice(min), ...ring.slice(0, min)].join('→');
    if (!seen.has(canon)) { seen.add(canon); cycles.push(Object.freeze(ring)); }
  };

  const visit = (u) => {
    color.set(u, GRAY); stack.push(u);
    for (const v of adj.get(u) || []) {
      if ((color.get(v) ?? WHITE) === GRAY) {
        const i = stack.indexOf(v);
        record(stack.slice(i));                 // the ring from v back to u
      } else if ((color.get(v) ?? WHITE) === WHITE) {
        visit(v);
      }
    }
    stack.pop(); color.set(u, BLACK);
  };

  for (const n of adj.keys()) if ((color.get(n) ?? WHITE) === WHITE) visit(n);
  return Object.freeze(cycles);
};

// isCyclic(edges) → boolean, and typedCycleState(edges) → the SEG tuples a caller logs to mark each
// detected cycle as a typed state (the precondition §8 relies on for safe unbounded descent).
export const isCyclic = (edges = []) => detectCycles(edges).length > 0;

export const typedCycleStates = (edges = []) =>
  detectCycles(edges).map((ring) => Object.freeze({
    op: 'SEG', kind: 'reference', state: REF_STATES.CYCLE, ring,
    note: 'typed cycle state — recursion stops here (§8), not silent infinite descent or truncation',
  }));
