// EO: SYN·NUL(Network → Field,Network, Composing,Clearing) — status rollup + output fold (re-export)
// tasks/node.js — the node's status and how a branch rolls up from its children.
//
// The vocabulary is the interior frame holon's (frame/node.js,
// docs/frame-holon.md), re-exported: a leaf's status is read straight off its
// own terminal event; a branch's status is a pure ROLLUP of its children — it
// never has a status of its own to set. This is the holon principle on the
// generation side: the high (a branch) is wholly a function of the low (its
// leaves). When a leaf completes, its status flips and every ancestor's rollup
// recomputes — the graph "updates as each step is completed" without any node
// being told to update. The long output and the cited sources are folds of the
// leaves (assembleOutput / assembleSources), re-runnable by any caller.

export {
  STATUS, rollupStatus, isTerminal, assembleOutput, assembleSources, progressOf,
} from '../node.js';
