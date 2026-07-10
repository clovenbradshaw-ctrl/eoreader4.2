// EO: SYN·CON(Field → Network, Composing,Tracing) — projectFrameStack — the read/fold
// frame/project.js — projectFrameStack: a pure fold of the event log into the
// nested tree PLUS the active path (docs/frame-holon.md).
//
// This is tasks/project.js's projection, factored out unchanged and taught one
// more thing the generation side never needed: the STACK. The generation side is
// eager and top-down — a planner decomposes a known goal to leaves, so the walk
// always knows where it is. The discourse side is lazy and reactive — frames
// push and pop as the stream arrives — so "where are we" must itself be a
// projection. It is: the ACTIVE PATH (root → current-open-leaf) is a pure fold
// of the open and bind events, which *is* what "in scope" means, and replaying
// the log recovers the stack for free (docs/persistence.md).
//
// The tree is never mutated in place — every time an event is appended, you
// re-project and get a fresh tree with the statuses recomputed. Pure on the log
// alone (no frame, no module state), memoized by (log, length) the same way
// core/project.js memoizes the parse graph — safe because the log is append-only,
// so a longer log is a strict extension and the cache key is total.
//
// The active-path rules, all from the log (no explicit pop event exists):
//
//   open      the newly opened frame is entered: it becomes the active leaf.
//   bind      the active leaf moves to the bound frame. A bind to an ancestor is
//             the pop; the open frames left off the new path are marked
//             SUSPENDED (a digression parked, not closed). A bind back into a
//             suspended frame resumes it (REC reinstates — the frames on the new
//             path are unsuspended). A bind to a never-opened id is a malformed
//             log entry and is ignored (the projection stays total).
//   complete / fail
//             a terminal event on the active leaf returns the walk to its
//             parent. A closed frame is terminal, never suspended.

import { KIND } from './events.js';
import { STATUS, rollupStatus, assembleOutput, assembleSources } from './node.js';
import { annotateGrain } from './grain.js';

const memo = new WeakMap(); // log → { length, result }

// computeProjection — the actual fold. Single pass to gather each node's events
// and walk the active leaf, then a recursive build from the root that derives
// status bottom-up (a branch's rollup needs its children's statuses, so the
// build returns the status as it goes). Leaves carry their own output/sources;
// branches carry the folded ones.
const computeProjection = (log) => {
  const meta = new Map();   // id → { id, parentId, goal, depth, childIds, note, output, sources, failed, stepped, completed, ... }
  const order = [];         // ids in first-appearance order (open order = tree order)

  const ensure = (id) => {
    let m = meta.get(id);
    if (!m) {
      m = { id, parentId: null, goal: '', depth: 0, childIds: null, kids: [],
            note: '', output: '', sources: [], failed: false, stepped: false, completed: false,
            grain: null, forced: false, act: null, subject: [], opened: false };
      meta.set(id, m);
    }
    return m;
  };

  // ---- the active path, folded alongside the tree ---------------------------
  let activeId = null;
  const suspendedSet = new Set();

  // The parent chain root→id, off the meta gathered so far. Hop-capped so a
  // malformed log (a parent cycle) cannot hang the projection.
  const pathTo = (id) => {
    const path = [];
    let cur = id;
    for (let hops = 0; cur != null && hops <= meta.size; hops++) {
      path.unshift(cur);
      cur = meta.get(cur)?.parentId ?? null;
    }
    return path;
  };

  // Move the active leaf. `suspendLeft` is true only for a bind — the pop parks
  // the frames it leaves behind; an open or a complete/fail return does not.
  // Every frame on the NEW path is unsuspended (resuming a parked digression
  // reinstates its whole chain).
  const moveActive = (toId, suspendLeft) => {
    const newPath = pathTo(toId);
    if (suspendLeft && activeId != null) {
      const keep = new Set(newPath);
      for (const id of pathTo(activeId)) if (!keep.has(id)) suspendedSet.add(id);
    }
    for (const id of newPath) suspendedSet.delete(id);
    activeId = toId;
  };

  for (const e of log) {
    switch (e.kind) {
      case KIND.OPEN: {
        const m = ensure(e.id);
        m.parentId = e.parentId ?? null;
        m.goal = e.goal;
        m.depth = e.depth | 0;
        m.grain = e.grain ?? null;
        m.forced = !!e.forced;
        m.act = e.act ?? null;
        m.subject = [...(e.subject || [])];
        m.opened = true;
        if (!order.includes(e.id)) order.push(e.id);
        // The reactive edge: an opened child attaches itself to its parent. The
        // eager side declares the same edge top-down via `decompose` before the
        // child opens; the build unions the two (declared order first), so a
        // planner-declared tree and a push-discovered tree project identically.
        if (m.parentId != null) {
          const p = ensure(m.parentId);
          if (!p.kids.includes(e.id)) p.kids.push(e.id);
        }
        moveActive(e.id, false);
        break;
      }
      case KIND.DECOMPOSE:
        ensure(e.id).childIds = [...(e.childIds || [])];
        break;
      case KIND.STEP: {
        const m = ensure(e.id);
        m.stepped = true;
        m.note = e.note;
        break;
      }
      case KIND.COMPLETE: {
        const m = ensure(e.id);
        m.completed = true;
        m.output = e.output;
        m.sources = [...(e.sources || [])];
        if (e.id === activeId) moveActive(m.parentId ?? null, false);
        break;
      }
      case KIND.FAIL: {
        const m = ensure(e.id);
        m.failed = true;
        m.note = e.error || m.note;
        if (e.id === activeId) moveActive(m.parentId ?? null, false);
        break;
      }
      case KIND.BIND: {
        const m = meta.get(e.id);
        if (m && m.opened) moveActive(e.id, true);
        break;
      }
      default:
        break;
    }
  }

  // The roots: opened nodes with no parent. Usually exactly one (the goal).
  const roots = order.filter((id) => (meta.get(id)?.parentId ?? null) === null);

  const build = (id) => {
    const m = meta.get(id);
    if (!m) return null;
    const declared = m.childIds || [];
    const childIds = declared.concat(m.kids.filter((k) => !declared.includes(k)));
    const children = childIds.map(build).filter(Boolean);

    let status;
    if (children.length) {
      status = rollupStatus(children.map((c) => c.status));
    } else if (m.failed) {
      status = STATUS.BLOCKED;
    } else if (m.completed) {
      status = STATUS.DONE;
    } else if (m.stepped) {
      status = STATUS.ACTIVE;
    } else {
      status = STATUS.PENDING;
    }

    const node = {
      id: m.id,
      parentId: m.parentId,
      goal: m.goal,
      depth: m.depth,
      status,
      note: m.note,
      act: m.act,
      subject: [...m.subject],
      children,
    };
    if (children.length) {
      // Branch: output and sources are FOLDED from the leaves, not its own.
      node.output = assembleOutput(node);
      node.sources = assembleSources(node);
    } else {
      node.output = m.output;
      node.sources = m.sources;
    }

    // The cube reading — object grain, holonic grain, the cell, coherence. A
    // forced leaf carries a declared Pattern grain (it wanted to keep splitting),
    // so the confab guard flags the Figure-maker that swallowed a Pattern goal.
    const declaredGrain = m.forced ? 'Pattern' : m.grain;
    annotateGrain(node, declaredGrain);
    return node;
  };

  const builtRoots = roots.map(build).filter(Boolean);
  let root;
  if (builtRoots.length === 1) {
    root = builtRoots[0];
  } else {
    root = {
      id: 'forest', goal: '', depth: -1, parentId: null, note: '',
      status: rollupStatus(builtRoots.map((r) => r.status)),
      children: builtRoots,
      output: assembleOutput({ children: builtRoots }),
      sources: assembleSources({ children: builtRoots }),
    };
    annotateGrain(root, null);   // a forest of roots is itself a Pattern over them
  }

  // A flat id→node index over the built tree, for callers that want random access
  // (the UI keys its rendered rows on it) without re-walking.
  const byId = new Map();
  const index = (n) => { if (!n) return; if (n.id) byId.set(n.id, n); (n.children || []).forEach(index); };
  index(root);

  // The stack, as data: the active path (root → current leaf, built ids only)
  // and the parked digressions — open, non-terminal frames a bind popped off the
  // path. Both are pure reads of the fold above; `suspended` keeps `order`'s
  // first-appearance order so the projection stays replay-stable to deepEqual.
  const path = activeId == null ? [] : pathTo(activeId).filter((id) => byId.has(id));
  const suspended = order.filter((id) => {
    if (!suspendedSet.has(id) || !byId.has(id)) return false;
    const m = meta.get(id);
    return m && m.opened && !m.completed && !m.failed;
  });

  return { root, byId, order: order.slice(), activeId, path, suspended };
};

export const projectFrameStack = (log = []) => {
  const cached = memo.get(log);
  if (cached && cached.length === log.length) return cached.result;
  const result = computeProjection(log);
  memo.set(log, { length: log.length, result });
  return result;
};
