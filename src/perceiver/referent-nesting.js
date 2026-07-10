// EO: CON·SYN(Network,Entity → Network, Tracing) — holonic containment address
// referentNesting — the holonic containment address a referent EARNS from its span.
//
// The address system (core/holon.js) can descend containment level by level —
// `customers.profiles.pets` is depth 3, and `containsHolon` walks the holarchy. But
// nothing ever hands a *referent* a nested path: admission mints a flat id
// ("pierre", "prince", "gregor-samsa"), so every referent parses to a depth-1 atom
// and the holonic depth the machinery is built for stays permanently 1. The nesting
// is real all the same — it lives in SPAN CONTAINMENT: a short-lived thread runs
// entirely inside the reading-span of a longer one (a minor figure who appears only
// across chapters the protagonist also spans). The referent-journey read of War and
// Peace measured this directly (docs/referent-journey.md): a median short thread sits
// inside ~58 longer ones, up to 185 deep — a genuinely holonic weave the flat
// addresses threw away.
//
// This is the read that recovers it. Pure over (log, graph): nothing is stamped on an
// event, the log stays the single source of truth, and the address is DERIVED — the
// same discipline as projectGraph and eoAddressOfEvent. For each merged referent it
// reads the span off the mention stream, ranks the referents whose span strictly
// contains it, picks the TIGHTEST enclosing thread as the holonic parent, and joins a
// real containment path so `parseHolon(address).depth` finally recovers the holon
// level the flat id hid. Two numbers ride alongside, because containment is a partial
// order (a DAG), not a tree:
//
//   depth            — the holon LEVEL: the length of the tightest-container chain
//                      (parent → grandparent → …). This is what the address encodes.
//   containedByCount — the FULL nesting: every longer thread this one sits inside,
//                      not just the chain. This is the 58-median / 185-max the read
//                      reported — the raw depth of the weave at this referent.

import { parseHolon } from '../core/holon.js';
import { projectGraph } from '../core/index.js';

// A referent id may carry ':'/'@' (a role referent "role:sister@gregor-samsa") — those
// survive a holon segment untouched. Only '.' is load-bearing to the path separator,
// so a defensive swap keeps one referent one segment however its id was minted.
const segmentOf = (id) => String(id).replace(/\./g, '·');

// B strictly contains A when B's span brackets A's AND is strictly longer — so equal
// spans are siblings (never a mutual-containment cycle), and the relation is a strict
// partial order the tightest-parent forest is read off.
const strictlyContains = (B, A) =>
  B.span[0] <= A.span[0] && B.span[1] >= A.span[1] && B.spanLen > A.spanLen;

export const referentNesting = (doc, graph = null) => {
  const g = graph || projectGraph(doc.log, {});
  const units = doc.units?.length ?? doc.sentences?.length ?? 0;

  // Fold every alias's mentions onto its merged (union-find) root, so a span is
  // measured on the referent of record — "Pierre" and a later "Bezúkhov" that merged
  // share one thread, not two half-threads.
  const mentionsByRoot = new Map();
  for (const [id, idxs] of (doc.mentions || new Map())) {
    const root = g.representative(id);
    let arr = mentionsByRoot.get(root);
    if (!arr) mentionsByRoot.set(root, arr = []);
    for (const i of idxs) if (i != null) arr.push(i);
  }

  // Incident-edge degree, on the same merged roots the projection already canonicalised
  // its endpoints to — how CONNECTED a thread is, the second robust per-referent signal.
  const degree = new Map();
  for (const e of g.edges) {
    if (e.from != null) degree.set(e.from, (degree.get(e.from) || 0) + 1);
    if (e.to   != null && e.to !== e.from) degree.set(e.to, (degree.get(e.to) || 0) + 1);
  }

  const refs = [];
  for (const [root, arr] of mentionsByRoot) {
    if (!arr.length) continue;
    const sorted = [...new Set(arr)].sort((a, b) => a - b);
    const first = sorted[0], last = sorted[sorted.length - 1];
    refs.push({
      id: root,
      label: g.entities.get(root)?.label ?? root,
      mentions: sorted,
      count: sorted.length,
      span: [first, last],
      spanLen: last - first + 1,
      introFraction: units > 0 ? first / units : 0,
      connections: degree.get(root) || 0,
    });
  }

  // Full containment (the DAG) and the tightest enclosing thread (the forest parent).
  // Tie-break the parent deterministically — smallest containing span, then the more-
  // connected thread, then the id — so the address is stable across runs (no clock, no
  // Map-order dependence leaking into the path).
  for (const a of refs) {
    const containers = refs.filter((b) => b !== a && strictlyContains(b, a));
    a.containedBy = containers.map((b) => b.id);
    a.containedByCount = containers.length;
    a.parent = containers.length
      ? containers.slice().sort((x, y) =>
          (x.spanLen - y.spanLen) || (y.count - x.count) || (x.id < y.id ? -1 : 1))[0].id
      : null;
  }

  // Address assembly. A parent's span is strictly longer than its child's, so ranking
  // outermost-first guarantees a parent's address is built before any child reads it —
  // one linear pass, no recursion needed.
  const byId = new Map(refs.map((r) => [r.id, r]));
  const order = refs.slice().sort((x, y) =>
    (y.spanLen - x.spanLen) || (y.count - x.count) || (x.id < y.id ? -1 : 1));
  const addressOf = new Map();
  for (const r of order) {
    const seg = segmentOf(r.id);
    const parentAddr = r.parent ? addressOf.get(r.parent) : null;
    addressOf.set(r.id, parentAddr ? `${parentAddr}.${seg}` : seg);
  }
  for (const r of refs) {
    r.address = addressOf.get(r.id);
    r.depth = parseHolon(r.address).depth;   // the holon LEVEL the flat id used to hide
  }

  // Stable output: reading order (span start), then the busier thread first on a tie.
  refs.sort((a, b) => (a.span[0] - b.span[0]) || (b.count - a.count) || (a.id < b.id ? -1 : 1));
  return { units, referents: refs };
};

// A compact scalar summary of the weave's depth — the numbers docs/referent-journey.md
// reports (median / max full nesting, and how many referents sit ≥3 deep). Pure over
// the projection above; a convenience for a harness, never load-bearing.
export const nestingSummary = (nesting) => {
  const refs = nesting.referents;
  const depths = refs.map((r) => r.containedByCount).sort((a, b) => a - b);
  const n = depths.length;
  const median = n ? depths[Math.floor((n - 1) / 2)] : 0;
  const max = n ? depths[n - 1] : 0;
  const nestedAtLeast3 = refs.filter((r) => r.containedByCount >= 3).length;
  const flatDepth1 = refs.filter((r) => r.depth === 1).length;
  const maxHolonDepth = refs.reduce((m, r) => Math.max(m, r.depth), 0);
  return { referents: n, median, max, nestedAtLeast3, flatDepth1, maxHolonDepth };
};
