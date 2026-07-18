// EO: INS·DEF(Void → Entity, Making,Tending) — the Poincaré scrubber (docs/coil-surfaces.md §2)
// One cursor. Not one per surface. Every projection of the coil (waveform,
// operator-clock, and every later surface in docs/coil-surfaces.md §3) subscribes
// to this; none owns it. `pos` is a cutting plane by construction: dragging it
// sweeps every subscriber in lock-step because they all key off the same room —
// there is no per-surface animation timeline to keep in sync by hand.
//
// A standalone holon rather than reader-app state on purpose: the spec frames the
// scrubber as shared by every coil surface, not owned by the reader room, so any
// surface (or a future non-reader host) can import it without pulling in the
// reader app's own engine wiring (rooms/reader/boot.js).
//
// `pos` shares units with FoldTrace's `pos_start`/`pos_end` (src/core/fold-trace.js)
// — today that is the reading-unit ordinal (docs/fold-trace-spec.md §"pos units":
// no perceiver in this tree exposes byte/char offsets yet). When binviz (docs/coil-
// surfaces.md §6) lands with a real byte_offset, the CON is on THIS room's `pos`,
// never a second cursor — extend the unit, don't fork the mechanism.
//
// Mirrors core/log.js's subscribe/unsubscribe pattern (a Set of best-effort
// listeners) so a scrubber reads the same as every other pub-sub room in the tree.

import { nearestFoldIndex } from '../../core/index.js';

// createScrubber({readingId, foldTrace}) — the shared cursor. `setPos` clamps to the
// trace's own range, resolves the nearest fold (core/fold-trace.js's own lookup,
// reused rather than re-derived, so the scrubber and every surface reading it agree
// on "nearest"), and notifies every subscriber with the fresh snapshot; `subscribe`
// returns its own unsubscribe, same shape as core/log.js's `subscribe`. `foldTrace`
// may be swapped later (a new document, or FoldTrace re-extended) via
// `setFoldTrace`, without re-creating the scrubber or dropping its subscribers.
export const createScrubber = ({ readingId = null, foldTrace = [] } = {}) => {
  let trace = foldTrace;
  let pos = trace.length ? trace[0].pos_start : 0;
  let foldIndex = trace.length ? 0 : -1;
  const subscribers = new Set();

  const snapshot = () => Object.freeze({ reading_id: readingId, pos, fold_index: foldIndex });

  const notify = () => {
    const snap = snapshot();
    for (const fn of subscribers) {
      try { fn(snap); } catch { /* subscribers are best-effort */ }
    }
    return snap;
  };

  const clamp = (p) => {
    if (!trace.length) return p;
    const first = trace[0].pos_start, last = trace[trace.length - 1].pos_end - 1;
    return Math.min(Math.max(p, first), last);
  };

  const setPos = (p) => {
    pos = clamp(p);
    foldIndex = nearestFoldIndex(trace, pos);
    return notify();
  };

  const setFoldTrace = (nextTrace) => {
    trace = nextTrace || [];
    foldIndex = nearestFoldIndex(trace, pos);
    return notify();
  };

  const subscribe = (fn) => {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  };

  return {
    get pos() { return pos; },
    get foldIndex() { return foldIndex; },
    get foldTrace() { return trace; },
    setPos,
    setFoldTrace,
    subscribe,
    snapshot,
  };
};

export const isScrubber = (x) =>
  !!x && typeof x.setPos === 'function' && typeof x.subscribe === 'function';
