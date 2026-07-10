// EO: SEG·SYN(Field → Network, Unraveling,Composing) — version-history timeline (audit)
// doc/history.js — the edit log read as a version timeline.
//
// The log is already the whole history; this projection reads it the way Google
// Docs' version history reads a document's revisions — newest first, each a point
// you can restore to or fork from. Two things make it more than a flat list:
//
//   1. CHARACTER-LEVEL, THEN COARSER.  Recent edits are shown at the finest grain
//      the log holds — one typing burst per revision, with the exact characters
//      inserted and deleted (charDiff). As an edit ages, it coalesces: minute-old
//      edits group per minute, hour-old edits per five minutes, older still per
//      half hour. So the timeline is fine "for a while" and turns into longer
//      chunks with age — the same way memory keeps yesterday by the hour and last
//      year by the season. Age is measured against the log's own latest timestamp,
//      not the wall clock, so the timeline is replay-stable: same log → same view.
//
//   2. EVERY POINT IS AN ANCHOR.  Each revision carries `anchorIdx`, the log index
//      whose prefix reproduces the document at that point (projectDoc(log.slice(0,
//      anchorIdx+1))). Restore appends a DOC_REVERT to that index; fork copies that
//      state into a new document. Nothing is destroyed either way — the log only
//      ever grows.
//
// Pure over the log (given the same timestamps): render it twice, get the same
// timeline. The surface owns interaction; render.js owns the HTML.

import { DKIND } from './events.js';
import { projectDoc } from './project.js';

// A character-level diff of two strings by common prefix + common suffix: the
// middle is what changed. O(n) and it reads exactly as a keystroke burst does —
// "these characters went in here, those came out" — which is why it is right for
// the finest grain of the timeline. (Not a full LCS: a burst is a contiguous
// edit at one spot, so prefix/suffix captures it faithfully and cheaply.)
export const charDiff = (a, b) => {
  a = String(a ?? ''); b = String(b ?? '');
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let e = 0;
  while (e < a.length - s && e < b.length - s && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
  const del = a.slice(s, a.length - e);
  const ins = b.slice(s, b.length - e);
  return { pre: a.slice(0, s), del, ins, suf: a.slice(a.length - e), insN: ins.length, delN: del.length };
};

// Age buckets: how wide a time window collapses into one revision, as a function
// of how old the edit is (ms). Below FINE, nothing collapses — each burst stands
// alone (character-level). Older edits fold into progressively wider windows.
const FINE = 120000;                     // < 2 min: every burst is its own revision
const bucketWidth = (age) =>
  age < FINE       ? 0        :          // finest — one revision per burst
  age < 1200000    ? 60000    :          // < 20 min: per minute
  age < 7200000    ? 300000   :          // <  2 h : per five minutes
                     1800000;            //   older : per half hour

// Fold the log into ordered entries (oldest→newest), one per COMMITTED mutation:
// the seed (create + its lines, collapsed), each accepted change, each committed
// burst edit, each restore. Pending suggestions and rejected changes are not
// versions, so they don't appear — the timeline is the document's actual states.
const entriesOf = (events) => {
  const out = [];
  const cur = new Map();                 // blockId → current text (to derive before/after)
  const changeMap = new Map();           // changeId → proposed change (until accepted)
  let seedIdx = -1, seedAdds = 0, seedChars = 0, created = false, seeding = false, author = 'you', ts0 = 0;

  const flushSeed = () => {
    if (!created) return;
    out.push({ idx: seedIdx, ts: ts0, kind: 'create', author, blockId: null,
      before: '', after: '', lines: seedAdds, insN: seedChars, delN: 0 });
    created = false;
  };

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    switch (e.kind) {
      case DKIND.CREATE:
        created = true; seeding = true; seedIdx = i; seedAdds = 0; seedChars = 0; author = e.author || 'you'; ts0 = e.ts || 0;
        break;
      case DKIND.BLOCK:
        cur.set(e.blockId, e.text);
        if (seeding) { seedAdds++; seedChars += (e.text || '').length; seedIdx = i; }
        else out.push({ idx: i, ts: e.ts || 0, kind: 'add', author: e.author || author, blockId: e.blockId, before: '', after: e.text, insN: (e.text || '').length, delN: 0 });
        break;
      case DKIND.EDIT: {
        if (seeding) { flushSeed(); seeding = false; }
        const before = e.before != null && e.before !== '' ? e.before : (cur.get(e.blockId) || '');
        const d = charDiff(before, e.text);
        cur.set(e.blockId, e.text);
        out.push({ idx: i, ts: e.ts || 0, kind: 'edit', author: e.author || author, blockId: e.blockId, before, after: e.text, diff: d, insN: d.insN, delN: d.delN });
        break;
      }
      case DKIND.PROPOSE:
        changeMap.set(e.changeId, { op: e.op, targetId: e.targetId, blockId: e.blockId, text: e.text, before: e.before, author: e.author });
        break;
      case DKIND.ACCEPT: {
        if (seeding) { flushSeed(); seeding = false; }
        const ch = changeMap.get(e.changeId); changeMap.delete(e.changeId);
        if (!ch) break;
        if (ch.op === 'insert') {
          cur.set(ch.blockId, ch.text);
          out.push({ idx: i, ts: e.ts || 0, kind: 'add', author: ch.author || author, blockId: ch.blockId, before: '', after: ch.text, insN: (ch.text || '').length, delN: 0 });
        } else if (ch.op === 'replace') {
          const before = ch.before != null && ch.before !== '' ? ch.before : (cur.get(ch.targetId) || '');
          const d = charDiff(before, ch.text); cur.set(ch.targetId, ch.text);
          out.push({ idx: i, ts: e.ts || 0, kind: 'edit', author: ch.author || author, blockId: ch.targetId, before, after: ch.text, diff: d, insN: d.insN, delN: d.delN });
        } else if (ch.op === 'delete') {
          const before = cur.get(ch.targetId) || ch.before || ''; cur.delete(ch.targetId);
          out.push({ idx: i, ts: e.ts || 0, kind: 'delete', author: ch.author || author, blockId: ch.targetId, before, after: '', insN: 0, delN: (before || '').length });
        }
        break;
      }
      case DKIND.REJECT:
        changeMap.delete(e.changeId);
        break;
      case DKIND.REVERT: {
        if (seeding) { flushSeed(); seeding = false; }
        // Restore rewrites the whole document; re-derive the running texts from the
        // restored state so later diffs stay honest.
        const restored = projectDoc(events.slice(0, (e.toIndex | 0) + 1));
        cur.clear(); for (const b of restored.blocks) cur.set(b.id, b.text);
        out.push({ idx: i, ts: e.ts || 0, kind: 'revert', author: e.author || author, blockId: null,
          before: '', after: '', label: e.label || '', lines: restored.blocks.length, insN: 0, delN: 0 });
        break;
      }
      default: break;
    }
  }
  if (seeding && created) flushSeed();
  return out;
};

// The timeline: revisions newest-first, each coalescing entries that fall in the
// same age bucket. `create` and `revert` always stand alone (they are landmarks,
// not keystrokes). Returns { revisions, count } where each revision is:
//   { anchorIdx, ts, tsStart, kind, author, count, lines, insN, delN, blocks,
//     entries, diff?, snippet, current }
export const projectHistory = (log) => {
  const events = log || [];
  const entries = entriesOf(events);
  if (!entries.length) return { revisions: [], count: 0 };

  const latest = entries.reduce((m, x) => Math.max(m, x.ts || 0), 0);
  const lastIdx = events.length - 1;

  // group consecutive entries by age-bucket key
  const keyOf = (x) => {
    if (x.kind === 'create' || x.kind === 'revert') return 'solo:' + x.idx;
    const w = bucketWidth(Math.max(0, latest - (x.ts || 0)));
    return w === 0 ? 'solo:' + x.idx : w + ':' + Math.floor((x.ts || 0) / w);
  };
  const groups = [];
  for (const x of entries) {
    const k = keyOf(x);
    const g = groups[groups.length - 1];
    if (g && g.key === k) g.items.push(x);
    else groups.push({ key: k, items: [x] });
  }

  const summarize = (g) => {
    const items = g.items;
    const last = items[items.length - 1];
    const insN = items.reduce((n, x) => n + (x.insN || 0), 0);
    const delN = items.reduce((n, x) => n + (x.delN || 0), 0);
    const blocks = new Set(items.map((x) => x.blockId).filter(Boolean)).size;
    const single = items.length === 1 ? items[0] : null;
    const snippet = single ? snippetOf(single) : '';
    return {
      anchorIdx: last.idx,
      ts: last.ts || 0,
      tsStart: items[0].ts || 0,
      kind: single ? single.kind : 'session',
      author: last.author || 'you',
      count: items.length,
      lines: single && single.lines != null ? single.lines : blocks,
      insN, delN, blocks,
      entries: items,
      diff: single && single.diff ? single.diff : null,
      label: single && single.label ? single.label : '',
      snippet,
      current: last.idx === lastIdx,
    };
  };

  const revisions = groups.map(summarize).reverse();     // newest first
  return { revisions, count: entries.length };
};

// A short, human snippet of what one entry changed — the characters that went in
// (a burst you typed), or the line added, or what was removed.
const snippetOf = (x) => {
  if (x.kind === 'create') return '';
  if (x.kind === 'revert') return x.label || '';
  if (x.kind === 'add') return x.after || '';
  if (x.kind === 'delete') return x.before || '';
  const d = x.diff || charDiff(x.before, x.after);
  if (d.insN && !d.delN) return d.ins;
  if (d.delN && !d.insN) return d.del;
  return d.ins || d.del || x.after || '';
};
