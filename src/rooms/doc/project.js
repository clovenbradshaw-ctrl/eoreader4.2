// EO: SYN(Field → Network, Composing) — document = fold of log
// doc/project.js — the document as a fold of its edit log.
//
// projectDoc(log) replays the events into the current document: the committed
// blocks in order, the pending changes still awaiting review, and the honesty
// stats (how many blocks are grounded to the Record vs. the writer's own void).
// Pure and replay-stable — the same log always folds to the same document — so
// the document is never stored, only projected, exactly like the reader's graph
// and the deep-research report.

import { DKIND } from './events.js';
import { blockGrounding } from './ground.js';

// Fold the events [0 .. limit) into working state. Split out from projectDoc so
// a DOC_REVERT can re-fold its own prefix: a revert at position p with toIndex=k
// (k < p) rebuilds the state from foldTo(events, k+1), which — because k < p —
// never re-enters this same revert, so the recursion always terminates. Logs are
// short (one document's edits), so the re-fold on revert is cheap.
const foldTo = (events, limit) => {
  let id = null, title = 'Untitled document', author = 'you';
  const blocks = [];                 // committed blocks, in document order
  const changeMap = new Map();       // changeId → pending change
  const order = [];                  // change proposal order (stable listing)

  const indexOfBlock = (bid) => blocks.findIndex((b) => b.id === bid);

  const foldAccept = (ch) => {
    const grounding = blockGrounding(ch.grounding);
    if (ch.kind === 'insert') {
      const at = ch.afterId ? indexOfBlock(ch.afterId) + 1 : blocks.length;
      const i = at > 0 ? at : blocks.length;
      blocks.splice(i, 0, { id: ch.blockId, text: ch.text, html: ch.html || '', type: ch.type || 'p', grounding, author: ch.author });
    } else if (ch.kind === 'replace') {
      const b = blocks.find((x) => x.id === ch.targetId);
      if (b) { b.text = ch.text; b.html = ch.html || ''; b.type = ch.type || b.type || 'p'; b.grounding = grounding; }
    } else if (ch.kind === 'delete') {
      const i = indexOfBlock(ch.targetId);
      if (i >= 0) blocks.splice(i, 1);
    }
  };

  const n = Math.max(0, Math.min(limit | 0, events.length));
  for (let i = 0; i < n; i++) {
    const e = events[i];
    switch (e.kind) {
      case DKIND.CREATE:
        id = e.docId; title = e.title; author = e.author; break;
      case DKIND.BLOCK:
        blocks.push({ id: e.blockId, text: e.text, html: e.html || '', type: e.type || 'p', grounding: e.grounding || { kind: 'void' }, author: e.author }); break;
      case DKIND.EDIT: {
        // A fine committed edit (one typing burst). Fold it exactly like an
        // accepted replace: the block's text/html/type change and it re-grounds.
        const b = blocks.find((x) => x.id === e.blockId);
        if (b) { b.text = e.text; b.html = e.html || ''; b.type = e.type || b.type || 'p'; b.grounding = blockGrounding(e.grounding); }
        break;
      }
      case DKIND.PROPOSE:
        changeMap.set(e.changeId, {
          id: e.changeId, kind: e.op, targetId: e.targetId, afterId: e.afterId, blockId: e.blockId,
          text: e.text, html: e.html || '', type: e.type || 'p', before: e.before, grounding: e.grounding || { grounded: false },
          author: e.author, when: e.when, status: 'pending',
        });
        order.push(e.changeId);
        break;
      case DKIND.ACCEPT: {
        const ch = changeMap.get(e.changeId);
        if (ch) { foldAccept(ch); changeMap.delete(e.changeId); const k = order.indexOf(e.changeId); if (k >= 0) order.splice(k, 1); }
        break;
      }
      case DKIND.REJECT: {
        changeMap.delete(e.changeId);
        const k = order.indexOf(e.changeId); if (k >= 0) order.splice(k, 1);
        break;
      }
      case DKIND.REVERT: {
        // Restore to an earlier point: rebuild state from the prefix it names,
        // then keep folding whatever follows this revert onto the restored state.
        const sub = foldTo(events, (e.toIndex | 0) + 1);
        id = sub.id; title = sub.title; author = sub.author;
        blocks.length = 0; for (const b of sub.blocks) blocks.push(b);
        changeMap.clear(); for (const [k, v] of sub.changeMap) changeMap.set(k, v);
        order.length = 0; for (const k of sub.order) order.push(k);
        break;
      }
      default: break;
    }
  }
  return { id, title, author, blocks, changeMap, order };
};

export const projectDoc = (log) => {
  const events = log || [];
  const { id, title, author, blocks, changeMap, order } = foldTo(events, events.length);

  const changes = order.map((cid) => changeMap.get(cid)).filter(Boolean);
  const grounded = blocks.filter((b) => b.grounding && b.grounding.kind === 'source').length;
  const stats = {
    blocks: blocks.length,
    grounded,
    void: blocks.length - grounded,
    pending: changes.length,
    // how much of the document stands on the Record (0..1)
    boundFrac: blocks.length ? grounded / blocks.length : 0,
  };
  return deepFreeze({ id, title, author, blocks, changes, stats });
};

// Freeze the projection so no consumer can mutate what a re-projection would not
// reproduce (same discipline as research/project.js).
const deepFreeze = (x) => {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const k of Object.keys(x)) deepFreeze(x[k]);
  }
  return x;
};
