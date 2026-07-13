// EO: SYN·NUL(Entity → Network, Composing,Making) — name-variant coreference
// Surface forms of ONE referent — "Elvis", "Elvis Presley", "Elvis Aaron Presley",
// "Presley" — recognised as one, by CONTAINMENT, not by a name table.
//
// A person is named many ways: bare given name, bare surname, given+surname, the
// full given+middle+surname. Each fuller form CONTAINS the shorter as an
// order-preserving subsequence of its tokens. So the variants of one referent form a
// chain under ⊑ ("is a token-subsequence of"): elvis ⊑ elvis-presley ⊑
// elvis-aaron-presley, and presley ⊑ elvis-presley. The MOST SPECIFIC name (the
// chain's top) is the referent's canonical form; every shorter variant folds into it.
//
// The danger is a shorter form that fits TWO distinct fuller names — "George Bush" is
// a subsequence of both "George Herbert Bush" and "George Walker Bush" (father and
// son), and "Presley" of both "Elvis Presley" and "Lisa Marie Presley". There the
// short form is genuinely AMBIGUOUS, and the system's stance everywhere is the same:
// STICKY ABSTENTION — a name that could fold into more than one incomparable fuller
// name folds into NONE, held as its own referent rather than guessed into one. Two
// incomparable full names (neither a subsequence of the other) are never merged, so
// the two Bushes stay two.
//
// Pure and table-free: the only knowledge is the orthographic subsequence relation,
// the same containment the within-document alias uses (entities.js aliasOf), lifted to
// full multi-word forms and to the cross-source union.

// A name's tokens: lowercased, whitespace-split. The admitted label already carries
// its title joined ("Mr Samsa"), so a title is just another token — "Samsa" ⊑ "Mr
// Samsa" folds, which is the right reading.
export const nameTokens = (label) =>
  String(label || '').trim().toLowerCase().split(/\s+/).filter(Boolean);

// `a` is an order-preserving subsequence of `b` (every token of `a` appears in `b`,
// left to right). Reflexive-free at the call sites (we never compare a key to itself).
export const isSubsequence = (a, b) => {
  if (a.length > b.length) return false;
  let i = 0;
  for (const w of b) { if (i < a.length && a[i] === w) i++; if (i === a.length) break; }
  return i === a.length;
};

// Cluster a bag of surface labels into referents by containment. Returns a Map from
// each input label to its ANCHOR label — the most-specific name of its cluster, or the
// label itself when it is a chain head or abstains. Distinct labels that tokenise the
// same ("Elvis  Presley" vs "Elvis Presley") share one anchor.
//
// The rule per label A:
//   · supersequences of A among the others = the fuller names A could fold into.
//   · of those, the MAXIMAL ones (not themselves a subsequence of another super).
//   · exactly one maximal → A folds into it (chain upward to the top).
//   · zero → A is a chain head (its own anchor).
//   · two or more incomparable maximal → ABSTAIN (A is its own anchor; the null).
export const clusterAnchors = (labels) => {
  const uniqLabels = [...new Set((labels || []).filter(Boolean).map(String))];
  // Dedup to token-keys; keep the first-seen label as each key's representative.
  const keyToRep  = new Map();   // token-key → representative label
  const labelKey  = new Map();   // label → token-key
  for (const l of uniqLabels) {
    const k = nameTokens(l).join(' ');
    labelKey.set(l, k);
    if (!keyToRep.has(k)) keyToRep.set(k, l);
  }
  const keys  = [...keyToRep.keys()];
  const tokOf = new Map(keys.map(k => [k, k ? k.split(' ') : []]));

  // parent: each key → its single more-specific key, or null (head / abstained).
  const parent = new Map();
  for (const a of keys) {
    if (!tokOf.get(a).length) { parent.set(a, null); continue; }
    const supers = keys.filter(b => b !== a && isSubsequence(tokOf.get(a), tokOf.get(b)));
    if (!supers.length) { parent.set(a, null); continue; }
    const maximal = supers.filter(s =>
      !supers.some(t => t !== s && isSubsequence(tokOf.get(s), tokOf.get(t))));
    parent.set(a, maximal.length === 1 ? maximal[0] : null);   // one → fold; else abstain
  }

  // Follow the parent chain to the top. `parent` only ever points to a strictly longer
  // key, so the walk is acyclic; the seen-guard is belt-and-suspenders.
  const rootKey = (k) => {
    let r = k; const seen = new Set();
    while (parent.get(r) && !seen.has(r)) { seen.add(r); r = parent.get(r); }
    return r;
  };
  const anchor = new Map();
  for (const l of uniqLabels) anchor.set(l, keyToRep.get(rootKey(labelKey.get(l))));
  return anchor;
};

// How many DISTINCT referents do these labels name? The count of unique anchors after
// clustering. One person's variants ("Elvis Presley", "Elvis Aaron Presley") count
// once; a family sharing a surname ("Gregor Samsa", "Mr Samsa", "Mrs Samsa") — no one
// a subsequence of another — counts three.
export const distinctReferentCount = (labels) => {
  const anchor = clusterAnchors(labels);
  return new Set([...anchor.values()]).size;
};
