// EO: CON·SYN(Network → Kind, Binding,Composing) — morphological variant folding (declension)
// One referent, many endings. A Russian name inflects for case — Наташа / Наташу / Наташе /
// Наташи, Ростов / Ростова / Ростову — and a reader that treats each surface form as its own
// figure fractures the cast. Folding them needs the CASE-SUFFIX SET, which is not a table to
// hardcode but a class to INDUCE, by the same move used everywhere else: a suffix that attaches
// to the same KIND of company — here, the tail that alternates on the same STEM across MANY
// distinct names — is an inflection. So:
//
//   1. over the admitted name forms, take every pair sharing a long common prefix (a STEM) and
//      differing only by a short tail; the tails are candidate suffixes.
//   2. a tail is INFLECTIONAL when it alternates on ≥ minStems distinct stems (it is the ending
//      of the language, not an accident of two names). This is the induced case-suffix set.
//   3. two forms are ONE referent when they share a stem and both their tails are inflectional.
//
// Pure and table-free (the endings are read off the document), and language-agnostic: it never
// names "genitive" or knows Russian — it only sees which tails the stems of this text alternate
// through. English, which barely inflects names, induces a tiny suffix set and folds almost
// nothing (safe); Russian induces its rich case set and folds the declensions.

// The longest common prefix length of two strings.
const lcp = (a, b) => { const m = Math.min(a.length, b.length); let i = 0; while (i < m && a[i] === b[i]) i++; return i; };

// induceInflections(forms, opts) → { suffixes, fold }
//   forms     an array of surface forms, or a Map(form → count) (count picks each cluster's
//             canonical — the most frequent form, usually the nominative).
//   suffixes  the induced inflectional tail set (the case endings, lowercased) incl. '' (bare stem).
//   fold      Map(form → canonical form) — every declension mapped to its referent's canonical.
//
//   minStem     a shared prefix must be this long to count as one stem (guards short collisions).
//   maxSuffix   a tail longer than this is a different word, not an ending (Ростов vs Ростопчин).
//   minStems    a tail must alternate on this many distinct stems to be judged an inflection.
//   nominatives OPTIONAL Set of the forms that behave as NOMINATIVES (a subject — the base of a
//     paradigm). When given, the fold is ANCHORED: two nominatives never merge (so Франц the
//     emperor and Франция the country, which share the stem "франц", stay apart), and each oblique
//     attaches to the nominative it shares the longest stem with (freq breaks ties). Without it,
//     the fold is the plain same-stem union — higher recall, but it collides two names on one stem.
export const induceInflections = (forms, { minStem = 4, maxSuffix = 3, minStems = 3, nominatives = null } = {}) => {
  const counts = forms instanceof Map ? forms
    : (() => { const m = new Map(); for (const f of forms || []) m.set(f, (m.get(f) || 0) + 1); return m; })();
  // Single-token forms only — a declension is a word's ending, not a phrase's.
  const list = [...counts.keys()].filter((f) => f && !/\s/.test(f) && f.length >= minStem);
  const low = new Map(list.map((f) => [f, f.toLowerCase()]));

  // Every same-stem pair and the tails it exposes.
  const pairs = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = low.get(list[i]), b = low.get(list[j]);
      const p = lcp(a, b);
      if (p < minStem) continue;
      const ta = a.slice(p), tb = b.slice(p);
      if (ta.length > maxSuffix || tb.length > maxSuffix) continue;
      pairs.push({ i, j, stem: a.slice(0, p), ta, tb });
    }
  }

  // 1) induce the inflectional suffix set: a tail alternating on ≥ minStems distinct stems.
  const suffixStems = new Map();   // tail → Set(stem)
  const note = (t, stem) => { let s = suffixStems.get(t); if (!s) suffixStems.set(t, s = new Set()); s.add(stem); };
  for (const { stem, ta, tb } of pairs) { note(ta, stem); note(tb, stem); }
  const suffixes = new Set(['']);
  for (const [t, stems] of suffixStems) if (t === '' || stems.size >= minStems) suffixes.add(t);

  // 2a) ANCHORED fold (when the nominatives are known): a nominative is its own referent and
  // never merges with another; each oblique joins the nominative it shares the longest inflectional
  // stem with (frequency breaks a tie). This is what keeps two names that happen to share a stem
  // apart — only the writing system's cases route the obliques, not raw prefix overlap.
  if (nominatives) {
    const anchors = list.filter((f) => nominatives.has(f));
    const anchorSet = new Set(anchors);
    const fold = new Map(anchors.map((a) => [a, a]));
    for (const f of list) {
      if (anchorSet.has(f)) continue;
      const lf = low.get(f);
      let best = null, bestP = 0, bestFreq = -1;
      for (const a of anchors) {
        const la = low.get(a);
        const p = lcp(lf, la);
        if (p < minStem) continue;
        const ta = lf.slice(p), tb = la.slice(p);
        if (ta.length > maxSuffix || tb.length > maxSuffix) continue;
        if (!suffixes.has(ta) || !suffixes.has(tb)) continue;
        const fr = counts.get(a) || 0;
        if (p > bestP || (p === bestP && fr > bestFreq)) { best = a; bestP = p; bestFreq = fr; }
      }
      fold.set(f, best || f);   // an oblique with no matching nominative stands as its own referent
    }
    return { suffixes, fold };
  }

  // 2b) plain same-stem union (no nominatives given): link two forms sharing a stem whose tails
  // are both inflectional. Higher recall; may collide two names that share a stem.
  const parent = new Map(list.map((f) => [f, f]));
  const find = (x) => { let r = x; while (parent.get(r) !== r) r = parent.get(r); while (parent.get(x) !== r) { const n = parent.get(x); parent.set(x, r); x = n; } return r; };
  const uni = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  for (const { i, j, ta, tb } of pairs) if (suffixes.has(ta) && suffixes.has(tb)) uni(list[i], list[j]);

  // canonical per cluster = the most frequent form (ties → the shorter, then alphabetical).
  const groups = new Map();
  for (const f of list) { const r = find(f); let g = groups.get(r); if (!g) groups.set(r, g = []); g.push(f); }
  const fold = new Map();
  for (const g of groups.values()) {
    const canon = g.slice().sort((x, y) =>
      (counts.get(y) || 0) - (counts.get(x) || 0) || x.length - y.length || (x < y ? -1 : 1))[0];
    for (const f of g) fold.set(f, canon);
  }
  return { suffixes, fold };
};
