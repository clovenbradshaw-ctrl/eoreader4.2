// EO: SYN·EVA(Network → Network,Field, Composing,Tracing) — statuses, rollups, leaf folds
// frame/node.js — the node's status and how a branch rolls up from its children.
// Factored out of tasks/node.js (which re-exports it unchanged): nothing here is
// a task or text fact — statuses, rollups, and the leaf folds read the tree only.
//
// A node is a graph object with ONE derived field that moves: `status`. A leaf's
// status is read straight off its own terminal event; a branch's status is a
// pure ROLLUP of its children — it never has a status of its own to set. This is
// the holon principle: the high (a branch) is wholly a function of the low (its
// leaves). When a leaf completes, its status flips and every ancestor's rollup
// recomputes — the tree "updates as each step is completed" without any node
// being told to update.

export const STATUS = Object.freeze({
  PENDING: 'pending',   // opened, nothing started
  ACTIVE:  'active',    // a step ran, or some-but-not-all children resolved
  DONE:    'done',      // a leaf completed, or every child is done
  BLOCKED: 'blocked',   // a leaf failed, or every child is blocked
});

const { PENDING, ACTIVE, DONE, BLOCKED } = STATUS;

// rollupStatus — a branch's status from its children's, with no policy knobs.
//
//   every child done            → done
//   every child blocked         → blocked   (nothing landed)
//   every child still pending   → pending   (the branch hasn't been entered)
//   anything in between         → active    (the walk is inside this branch)
//
// `done` and `blocked` are the two TERMINAL rollups; a branch with a mix of done
// and blocked children is still `done` (it landed something) — the blocked leaf
// survives in the trace, it just doesn't sink the branch, exactly as a dropped
// arc section doesn't sink the arc. The order of the tests below encodes that.
export const rollupStatus = (childStatuses = []) => {
  if (childStatuses.length === 0) return PENDING;
  const all = (s) => childStatuses.every((c) => c === s);
  if (all(PENDING)) return PENDING;
  if (all(BLOCKED)) return BLOCKED;
  const resolved = childStatuses.every((c) => c === DONE || c === BLOCKED);
  if (resolved) return DONE;   // mix of done/blocked, none pending/active → landed
  return ACTIVE;
};

// A node is finished when it can take no further work: a done or blocked leaf, or
// a branch whose rollup is terminal. The runner reads this to know an ancestor
// chain has quiesced; the UI reads it to stop the spinner.
export const isTerminal = (status) => status === DONE || status === BLOCKED;

// assembleOutput — the long output is a fold of the leaves, in tree order.
//
// Not stored: the final text is PROJECTED by an in-order (depth-first, left-to-
// right) walk that joins every leaf's output, the same join the arc does over its
// flat sections — only here the leaves come from arbitrary depth. A branch
// contributes nothing of its own; it is exactly the concatenation of what its
// leaves landed. Re-folding the same graph yields the identical text.
export const assembleOutput = (root, sep = '\n\n') => {
  const parts = [];
  const walk = (n) => {
    if (!n) return;
    if (n.children && n.children.length) { n.children.forEach(walk); return; }
    const text = String(n.output || '').trim();
    if (text) parts.push(text);
  };
  walk(root);
  return parts.join(sep);
};

// The cited sources, folded across every leaf, de-duped and ordered — the tree's
// `arcSources` equivalent.
export const assembleSources = (root) => {
  const acc = new Set();
  const walk = (n) => {
    if (!n) return;
    if (n.children && n.children.length) { n.children.forEach(walk); return; }
    for (const s of n.sources || []) acc.add(s);
  };
  walk(root);
  return [...acc].sort((a, b) => a - b);
};

// Progress — the fraction of leaves that have reached a terminal status. A pure
// read off the tree the UI can show as a bar; counts leaves, because only leaves
// carry real work (a branch is bookkeeping over them).
export const progressOf = (root) => {
  let total = 0, done = 0;
  const walk = (n) => {
    if (!n) return;
    if (n.children && n.children.length) { n.children.forEach(walk); return; }
    total += 1;
    if (isTerminal(n.status)) done += 1;
  };
  walk(root);
  return { total, done, fraction: total ? done / total : 0 };
};
