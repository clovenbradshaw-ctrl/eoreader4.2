// EO: EVA(Network → Network,Lens, Tracing) — the four complexities
// The four complexities — what makes a causal question hard, and where the engine lives.
//
// The difficulty of "does X cause Y" is not the effect size (that is a counterfactual, out
// of the text's reach). It is four structural things, and THREE of them are textual — they
// live in the entity-and-relation structure a corpus states, exactly the material this holon
// reads. The engine cannot REMOVE any of them (only a design can), but it can FIND and SOURCE
// them, which is most of what a causal critique needs.
//
//   • CONFOUNDING      — a common cause. The node warm from BOTH trails: Z with an asserted
//                        edge into X and into Y. This is the wave-fold convergence applied to
//                        causation — the same node lit from the treatment trail and the outcome
//                        trail. Surfaced per edge, each Z sourced to the passages proposing Z→X
//                        and Z→Y. The engine cannot subtract it; it names it.
//   • REVERSE          — direction. Both X→Y and Y→X asserted (often by different sources):
//                        does the library make the neighborhood safe, or do safe neighborhoods
//                        get libraries? Flagged with both readings.
//   • MECHANISM        — a generative pathway. A directed causal path X→M→…→Y through an
//                        intermediary: the "through what" a bare edge omits. Surfaced with every
//                        hop sourced; it is the one thing besides a design that can license the
//                        essential/generative reading (stance.js).
//   • CONSTRUCT        — validity. The same outcome NODE measured as different CONSTRUCTS across
//                        sources ("reported crime" vs "actual crime" / "victimization"): two
//                        readings that seem to agree may be measuring different things. Surfaced
//                        ONLY when the corpus itself carries the distinguishing qualifiers —
//                        witness-first, never invented.
//
// Every structure returned traces to the passage that proposed it. The one thing worse than
// missing a cause is inventing one, so nothing here is emitted without its witness.

// Build a directed adjacency (from → Set(to)) and a reverse index for the trail walks.
const adjacency = (edges) => {
  const out = new Map();
  for (const e of edges) {
    if (!out.has(e.from)) out.set(e.from, new Set());
    out.get(e.from).add(e.to);
  }
  return out;
};

// The claims on the edge a → b (or []), so a surfaced structure can cite them.
const claimsOn = (edges, a, b) => {
  const e = edges.find((x) => x.from === a && x.to === b);
  return e ? e.claims : [];
};
const srcsOf = (claims) => claims.map((c) => c.src);

// CONFOUNDING — for each edge X→Y, the nodes Z with an asserted edge into BOTH X and Y.
// "Warm from both trails." Z is a CANDIDATE common cause of the X→Y reading; the engine
// surfaces it, sourced, and explicitly does not decide whether it explains the edge away —
// only a design (intervention data) can, and that is not in the text.
export const confounders = (edges) => {
  const adj = adjacency(edges);
  const into = (node) => [...adj.keys()].filter((z) => adj.get(z).has(node) && z !== node);
  const out = [];
  for (const e of edges) {
    const intoX = new Set(into(e.from));
    const commons = into(e.to).filter((z) => intoX.has(z) && z !== e.from);
    for (const z of commons) {
      out.push(Object.freeze({
        edge: `${e.from}→${e.to}`, confounder: z,
        // the two arms of the fork, each traced to its witnessing passages.
        zToCause: Object.freeze(srcsOf(claimsOn(edges, z, e.from))),
        zToEffect: Object.freeze(srcsOf(claimsOn(edges, z, e.to))),
        note: `'${z}' is read as a cause of both '${e.from}' and '${e.to}' — a candidate common cause of the ${e.from}→${e.to} reading. The corpus cannot rule it out; only a design can.`,
      }));
    }
  }
  return Object.freeze(out);
};

// REVERSE — edges X→Y for which Y→X is also asserted. Direction is undecided in the corpus.
export const reversePairs = (edges) => {
  const seen = new Set();
  const out = [];
  for (const e of edges) {
    const back = edges.find((x) => x.from === e.to && x.to === e.from);
    if (!back) continue;
    const key = [e.from, e.to].sort().join('␟');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(Object.freeze({
      pair: `${e.from}⇄${e.to}`,
      forward: Object.freeze(srcsOf(e.claims)),
      backward: Object.freeze(srcsOf(back.claims)),
      note: `Direction is undecided in the corpus: '${e.from}→${e.to}' and '${e.to}→${e.from}' are both read as asserted.`,
    }));
  }
  return Object.freeze(out);
};

// MECHANISM — for each direct edge X→Y, a directed causal PATH X→M→…→Y of length ≥2 through
// intermediaries. The pathway the bare edge omits; each hop sourced. Bounded DFS (paths up
// to `maxLen` hops), no revisits, so a cyclic corpus cannot loop the walk.
export const mechanisms = (edges, { maxLen = 4 } = {}) => {
  const adj = adjacency(edges);
  const out = [];
  const walk = (node, target, path, seen) => {
    if (path.length > maxLen) return;
    for (const nxt of adj.get(node) || []) {
      if (seen.has(nxt)) continue;
      if (nxt === target) {
        if (path.length >= 2) out.push([...path, nxt]);      // ≥2 hops = a real intermediary
        continue;
      }
      walk(nxt, target, [...path, nxt], new Set(seen).add(nxt));
    }
  };
  const found = [];
  for (const e of edges) {
    const paths = [];
    // temporarily collect into a fresh out for this edge
    const before = out.length;
    walk(e.from, e.to, [e.from], new Set([e.from]));
    for (let i = before; i < out.length; i++) paths.push(out[i]);
    out.length = before;
    for (const p of paths) {
      const hops = [];
      for (let i = 0; i < p.length - 1; i++)
        hops.push({ from: p[i], to: p[i + 1], src: Object.freeze(srcsOf(claimsOn(edges, p[i], p[i + 1]))) });
      found.push(Object.freeze({
        edge: `${e.from}→${e.to}`, path: Object.freeze(p), hops: Object.freeze(hops),
        note: `A mechanism the corpus articulates for ${e.from}→${e.to}: ${p.join(' → ')}.`,
      }));
    }
  }
  return Object.freeze(found);
};

// CONSTRUCT — nodes measured as different constructs across DIFFERENT sources. Witness-first:
// fires only when the corpus itself attaches ≥2 distinct qualifiers to the same head noun,
// from ≥2 sources — e.g. "reported crime" (one source) vs "actual crime" (another). Two
// readings that agree on the node may be measuring different things.
export const constructConcerns = (nodes) => {
  const out = [];
  for (const n of nodes) {
    // qualifiers carry their source: [{ q, docId }]
    const byQual = new Map();
    for (const { q, docId } of n.qualifiedBy || []) {
      if (!byQual.has(q)) byQual.set(q, new Set());
      byQual.get(q).add(docId);
    }
    const quals = [...byQual.keys()];
    const sources = new Set([...byQual.values()].flatMap((s) => [...s]));
    if (quals.length >= 2 && sources.size >= 2) {
      out.push(Object.freeze({
        node: n.key,
        constructs: Object.freeze(quals.map((q) => Object.freeze({ qualifier: q, sources: Object.freeze([...byQual.get(q)]) }))),
        note: `'${n.key}' is measured as different constructs across sources (${quals.join(', ')}) — readings that agree on '${n.key}' may not be measuring the same thing.`,
      }));
    }
  }
  return Object.freeze(out);
};
