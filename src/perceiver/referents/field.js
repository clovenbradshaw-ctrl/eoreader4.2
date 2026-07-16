// EO: SYN·SEG·EVA(Field → Network, Composing,Dissecting) — the referent quotient
// The referent field is the QUOTIENT of the surfaces by denotation: which mentions point to the
// same latent referent. It is a FOLD over append-only events, never a mutation of a stored table —
// so every assignment, merge, split, and retraction is auditable and reversible by appending
// (invariant 6). Three event shapes carry it, all on the ordinary log but in their OWN quotient,
// disjoint from the entity union-find (invariant: kind:'denotes' must not enter that union-find,
// and projectGraph's SYN handler already ignores every kind but 'merge', so it does not):
//
//   SYN kind:'denotes'   from: surfaceId  to: refId     — a mention denotes a referent
//   SYN kind:'ref-merge' from: refId      to: refId     — two referents are the same (assert/propose)
//   SYN kind:'ref-split' from: refId      to: refId     — two referents are DISTINCT (blocks merge)
//   SEG kind:'retract'   refSeq: <seq>                  — supersede a prior assertion by its seq
//
// A referent id is OPAQUE (`ref-N`) — never a slug of a name (invariant 2). Two equal strings may
// denote different referents (invariant 3); two disjoint strings may denote the same one
// (invariant 4). This fold is where that is made true: identity lives here, not in the spelling.

// A tiny union-find over opaque referent ids, with split pairs held OUT (a split blocks the union
// of the two roots it names). Pure — built fresh from the events on every fold.
const makeUF = () => {
  const parent = new Map();
  const find = (x) => { let r = x; while (parent.has(r) && parent.get(r) !== r) r = parent.get(r); parent.set(x, r); return r; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  return { find, union, parent };
};

// foldReferents(events) → { referentOf, surfacesOf, roots, denotations }
//   referentOf(surfaceId)  → the FIRM referent root a surface denotes, or null
//   surfacesOf(refId)      → surfaceId[] denoting that referent (root-resolved), source-ordered
//   roots                  → refRoot[] (every live referent), first-seen order
//   denotations            → the live (non-retracted) denotes records, for audit
export const foldReferents = (events = []) => {
  const evs = Array.isArray(events) ? events : [];
  // 1. Retractions supersede an assertion by its seq (append-only undo — invariant 6).
  const retracted = new Set();
  for (const e of evs) if (e.op === 'SEG' && e.kind === 'retract' && e.refSeq != null) retracted.add(e.refSeq);

  // 2. Splits are read first, so a ref-merge that a split forbids never unions.
  const splitPairs = new Set();
  const keyOf = (a, b) => (a < b ? `${a}␟${b}` : `${b}␟${a}`);
  for (const e of evs)
    if (e.op === 'SYN' && e.kind === 'ref-split' && !retracted.has(e.seq)) splitPairs.add(keyOf(e.from, e.to));

  // 3. denotes → surface→ref (last live assertion for a surface wins) and the live-ref set.
  const uf = makeUF();
  const surfToRef = new Map();          // surfaceId → refId (as asserted, pre-union)
  const denotBySeq = new Map();
  const rootsSeen = [];
  const seeRef = (r) => { uf.find(r); if (!rootsSeen.includes(r)) rootsSeen.push(r); };
  for (const e of evs) {
    if (e.op !== 'SYN' || e.kind !== 'denotes' || retracted.has(e.seq)) continue;
    surfToRef.set(e.from, e.to);
    denotBySeq.set(e.seq, e);
    seeRef(e.to);
  }

  // 4. ref-merge unions referents, unless a split forbids the pair (conflict dominates — the
  //    asserted distinctness wins over a proposed convergence).
  for (const e of evs) {
    if (e.op !== 'SYN' || e.kind !== 'ref-merge' || retracted.has(e.seq)) continue;
    seeRef(e.from); seeRef(e.to);
    if (splitPairs.has(keyOf(uf.find(e.from), uf.find(e.to)))) continue;
    uf.union(e.from, e.to);
  }

  const referentOf = (surfaceId) => {
    const r = surfToRef.get(surfaceId);
    return r == null ? null : uf.find(r);
  };
  const bySurfaceOrder = [];            // preserve first-seen surface order for stable display
  for (const e of evs) if (e.op === 'SYN' && e.kind === 'denotes' && !retracted.has(e.seq)) bySurfaceOrder.push(e.from);
  const surfacesOf = (refId) => {
    const root = uf.find(refId);
    return bySurfaceOrder.filter((sid) => referentOf(sid) === root);
  };
  const roots = [...new Set(rootsSeen.map((r) => uf.find(r)))];
  return { referentOf, surfacesOf, roots, rootOf: (refId) => uf.find(refId),
           denotations: [...denotBySeq.values()], isSplit: (a, b) => splitPairs.has(keyOf(uf.find(a), uf.find(b))) };
};

// A minter for opaque referent ids that CONTINUES past whatever ids already live in the log, so a
// rebuild never re-mints a colliding id. The number is a counter, not a name — invariant 2.
export const createMinter = (events = []) => {
  let max = 0;
  for (const e of (Array.isArray(events) ? events : [])) {
    for (const v of [e.to, e.from]) {
      const m = typeof v === 'string' && /^ref-(\d+)$/.exec(v);
      if (m) max = Math.max(max, Number(m[1]));
    }
  }
  return { mint: () => `ref-${++max}` };
};
