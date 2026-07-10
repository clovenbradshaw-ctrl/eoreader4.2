// EO: INS(Void → Entity, Making) — TaskEvent constructors (re-export)
// tasks/events.js — the append-only TaskEvent log (the generation side's spine,
// one level deeper than the arc).
//
// The document is a fold of its event log; the turn is a fold of its stage list;
// the arc is a fold of its FLAT section plan. A flat plan is one level of
// decomposition — question → sections — and a small model still has to draft a
// whole section in one bite. The task graph adds the missing axis: a goal that
// is too big to draft is DECOMPOSED into sub-goals, each of which may decompose
// again, until every leaf is small enough that a small LLM can produce it in one
// bite. The whole nested structure is PROJECTED from these events (project.js),
// never stored — re-folding the same log yields the identical graph (replay-
// stable), exactly as the parse graph is.
//
// The events themselves are the interior frame holon's (frame/events.js,
// docs/frame-holon.md), re-exported: the five kinds the generation side uses —
// open · decompose · step · complete · fail — are the shared holon's five, and
// the sixth (`bind`, the reactive side's) simply never appears in a task log,
// because the planner declares the tree top-down instead of discovering it.
// Ids are PATHS, minted by the runner as `${parentId}.${childIndex}` off a root.

export { KIND, openEvent, decomposeEvent, stepEvent, completeEvent, failEvent } from '../events.js';
