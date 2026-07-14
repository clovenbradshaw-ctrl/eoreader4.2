// EO: SYN·CON(Field → Network, Composing,Tracing) — log->graph projection (re-export)
// tasks/project.js — projectTaskGraph: a pure fold of the TaskEvent log into the
// nested graph object.
//
// THIS is the object the request asks for: "a graph object that updates as each
// step is completed." It is never mutated in place — every time an event is
// appended, you re-project and get a fresh tree with the statuses recomputed.
// The runner does exactly that and hands each fresh projection to `onUpdate`, so
// a subscriber (a UI, a log, a test) watches the graph fill in live.
//
// The projection IS the interior frame holon's (frame/project.js,
// docs/frame-holon.md) — not a copy, the same function. A task log contains no
// `bind` events, so the stack fields it also returns (activeId, path, suspended)
// just trace the runner's depth-first walk; the tree, statuses, folds, memo, and
// cube annotation are byte-identical to what this module computed before the
// factoring. tests/tasks.test.js is the parity pin.

export { projectFrameStack as projectTaskGraph } from '../index.js';
