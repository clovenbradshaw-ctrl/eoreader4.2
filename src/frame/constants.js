// EO: NUL(Void → Void, Clearing) — runaway guards (depth/fanout/nodes)
// frame/constants.js — the interior holon's runaway guards (docs/frame-holon.md).
//
// Factored out of tasks/constants.js (which re-exports them unchanged) so the
// generation runner and the frame stack read ONE set of guards. None of these is
// a length target. Depth and shape are emergent: the tree is as deep and as wide
// as `decompose` (generation) or the bind's pushes (discourse) choose to make it.
// These are the RUNAWAY guards — if a decomposer never quiesces, or a router
// pushes a digression inside a digression forever, depth and fanout cap the tree
// so a confused controller cannot fork without bound. A trace that shows one of
// these firing is a signal worth reading, not a normal stop.

// MAX_DEPTH — the deepest a node may nest. At this depth a goal is forced to be a
// leaf (the runner stops asking `decompose`; the bind degrades a push to a refine
// and records the firing). Three levels — goal → section → point — already covers
// the document-chat shapes; the guard sits above that so real plans never touch it.
export const MAX_DEPTH = 4;

// MAX_FANOUT — the most children one node may own. Demand caps supply the way the
// arc's reconcile does: a decomposer that returns more sub-goals than this is
// truncated, a leaf that would push one more digression is refused, and the drop
// is recorded in the trace.
export const MAX_FANOUT = 8;

// MAX_NODES — the total node backstop across the whole tree, the last line of
// defence against a controller that keeps splitting just under the depth and
// fanout caps. Generous; if saturation is working it never binds.
export const MAX_NODES = 256;
