// EO: NUL(Network → Network, Clearing) — runaway guards (re-export)
// tasks/constants.js — the task graph's guards, shared with the interior frame
// holon (frame/constants.js, docs/frame-holon.md) and re-exported unchanged.
//
// Like the arc's constants, none of these is a length target. Length and shape
// are emergent: the graph is as deep and as wide as `decompose` chooses to make
// it, and `decompose` should split only while a goal is genuinely too big for one
// reach. These are the RUNAWAY guards — if `decompose` never quiesces, depth and
// fanout cap the tree so a confused decomposer cannot fork forever. A trace that
// shows one of these firing is a signal worth reading, not a normal stop.

export { MAX_DEPTH, MAX_FANOUT, MAX_NODES } from '../index.js';
