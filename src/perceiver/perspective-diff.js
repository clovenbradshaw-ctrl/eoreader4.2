// EO: EVA·SYN·REC(Network,Lens → Lens,Network, Composing,Binding,Tracing) — the Rashomon fold
// perspective-diff.js — the SAME events, read from two figures' folds, and the DIFFERENCE
// between those folds made a first-class object.
//
// perspective.js gives one figure's private universe: the claims ITS OWN words instantiate
// (perspectiveOf(doc, focusIds).fold.claims). This module takes TWO such universes and folds
// their difference: where they AGREE (both assert the same thing), where they CONFLICT (the
// same thing, opposite sign — Rashomon's core), where they merely DIVERGE (both speak of one
// figure but share no claim about it), and what each names that the other never does.
//
// It is a PURE fold on two perspective packets — no DOM, no state, no model in the default
// path — and it is built to GET SMARTER as the engine learns language, on two seams:
//
//   · IDENTITY.  Whether two claims are "about the same figure" is decided by a `norm`
//     function the caller injects. The floor is orthographic; a caller with the projection's
//     representative (coref + name-variants + the inflection folding the gutenberg pass added)
//     hands a norm that already knows "Reyes" ≡ "Councilmember Reyes" ≡ a declined form.
//   · SAMENESS.  Whether two claims are the same ASSERTION (vs. opposed, vs. unrelated) is the
//     lexical key at the floor, and — when a meaning embedder is warm — the learned
//     proposition-equivalence verdict (perceiver/proposition-equivalence.js): `same` → an
//     agreement, `opposed` → a conflict, everything else → each fold's own. The floor is never
//     worse; meaning only lifts it. As MiniLM (and the Born-rule null it rides) improve, so
//     does the diff — the model-free floor stays the honest output until the organ is warm.

import { attestEquivalenceFrom, propositionPolarity } from './proposition-equivalence.js';

// ── Reading one claim ────────────────────────────────────────────────────────────────
// A claim (perspective.js fold.claims) is an IS-A ({type:'is-a', subject, value}) or a LINK
// ({type:'link', subject, via, object}), each with an optional polarity. Its NEUTRAL clause
// (polarity stripped, the way proposition-equivalence wants it — "polarity is the parser's,
// not spelling's") feeds the embedder; its sign is read separately.
export const claimText = (c) => {
  if (!c) return '';
  if (c.type === 'is-a') return `${c.subject} is ${c.value}`.replace(/\s+/g, ' ').trim();
  if (c.type === 'link') return `${c.subject} ${c.via} ${c.object}`.replace(/\s+/g, ' ').trim();
  return String(c.text || '').trim();
};
export const claimPolarity = (c) => propositionPolarity(c);
// The phrase a surface shows — the neutral clause with its sign worn, "Fusus is not a tool".
export const claimPhrase = (c) => {
  const neg = claimPolarity(c) === '-';
  if (c?.type === 'is-a') return `${c.subject} is${neg ? ' not' : ''} ${c.value}`.replace(/\s+/g, ' ').trim();
  if (c?.type === 'link') return `${c.subject} ${neg ? 'does not ' : ''}${c.via} ${c.object}`.replace(/\s+/g, ' ').trim();
  return claimText(c);
};

const defaultNorm = (s) => String(s ?? '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/[.,;:!?]+$/, '');
const stem = (w) => defaultNorm(w).replace(/(?:ies|es|s)$/, '');
// The polarity-free TOPIC key of a claim under a norm — what it is about, ignoring sign, so
// "owns"/"does not own" share a key and read as a conflict rather than two unrelated claims.
export const claimTopicKey = (c, norm = defaultNorm) => {
  const n = (s) => stem(norm(s));
  if (c.type === 'is-a') return `isa|${n(c.subject)}|${n(c.value)}`;
  if (c.type === 'link') return `lnk|${n(c.subject)}|${n(c.via)}|${n(c.object)}`;
  return `raw|${n(claimText(c))}`;
};
const topicKey = claimTopicKey;
const signedKey = (c, norm) => `${topicKey(c, norm)}|${claimPolarity(c)}`;
const subjectKey = (c, norm) => stem(norm(c.subject || ''));

const pushTo = (map, key, val) => { const a = map.get(key); if (a) a.push(val); else map.set(key, [val]); };

// The cast a fold names — its figures, keyed by normalised label.
const castOf = (persp, norm) => {
  const m = new Map();
  for (const f of persp?.fold?.figures || []) {
    const k = stem(norm(f.label || ''));
    if (k && !m.has(k)) m.set(k, f.label);
  }
  return m;
};
const header = (p) => ({ label: p?.label ?? null, speaks: (p?.quotes || []).length, names: (p?.fold?.figures || []).length, isAgent: !!p?.isAgent });
const round = (x) => Math.round(x * 1000) / 1000;

// ── Merge (topic scope) — one figure's fold ACROSS several sources ─────────────────────
// Union of perspective packets for the SAME figure read from several docs: its voice is every
// source's quotes, its universe every source's claims (deduped by signed key), its cast the
// union of casts. This is what lets the Rashomon fold run at topic scope — two figures, each
// folded across the whole topic, then diffed. Referent discipline is the caller's: it passes
// packets it has already decided name one figure (the entity explorer's merged row).
export const mergePerspectives = (packets, { norm = defaultNorm, label = null } = {}) => {
  const live = (packets || []).filter((p) => p && p.fold);
  const quotes = [], attributions = [], figures = new Map();
  const claims = [], seen = new Set();
  let isAgent = false;
  for (const p of live) {
    isAgent = isAgent || !!p.isAgent;
    for (const q of p.quotes || []) quotes.push({ ...q, source: p.source ?? q.source ?? null });
    for (const a of p.attributions || []) attributions.push(a);
    for (const f of p.fold.figures || []) {
      const k = stem(norm(f.label || ''));
      const at = figures.get(k);
      if (at) at.count += (f.count || 0);
      else figures.set(k, { id: f.id, label: f.label, count: f.count || 0 });
    }
    for (const c of p.fold.claims || []) {
      const k = signedKey(c, norm);
      if (seen.has(k)) continue;
      seen.add(k);
      claims.push({ ...c, source: p.source ?? c.source ?? null });
    }
  }
  return {
    id: live[0]?.id ?? null,
    label: label || live.find((p) => p.label)?.label || null,
    isAgent,
    signals: { speaksQuotes: quotes.length > 0, speechSource: attributions.length > 0, personKey: live.some((p) => p.signals?.personKey) },
    quotes, attributions,
    fold: { text: live.map((p) => p.fold.text).filter(Boolean).join(' '), figures: [...figures.values()].sort((x, y) => y.count - x.count), claims },
    sources: live.map((p) => p.source).filter((s) => s != null),
  };
};

// ── The diff — the PURE lexical floor ──────────────────────────────────────────────────
// Two perspective packets → their agreement, conflict, divergence, and each fold's own. Every
// judgment here is orthographic (the injected norm resolves identity); the learned lift below
// upgrades it. Deterministic and model-free — the honest output when no embedder is warm.
export const diffPerspectives = (a, b, { norm = defaultNorm } = {}) => {
  const A = a?.fold?.claims || [], B = b?.fold?.claims || [];
  // topic key → { '+': claim, '-': claim } for each side (first claim of each sign wins)
  const slots = (claims) => {
    const m = new Map();
    for (const c of claims) { const s = m.get(topicKey(c, norm)) || {}; s[claimPolarity(c)] = s[claimPolarity(c)] || c; m.set(topicKey(c, norm), s); }
    return m;
  };
  const aSlots = slots(A), bSlots = slots(B);

  const shared = [], conflict = [];
  const sharedSubjects = new Set();
  for (const [t, aSlot] of aSlots) {
    const bSlot = bSlots.get(t);
    if (!bSlot) continue;
    const agreed = ['+', '-'].filter((p) => aSlot[p] && bSlot[p]);
    if (agreed.length) {
      for (const p of agreed) shared.push({ subject: aSlot[p].subject, claim: aSlot[p], text: claimPhrase(aSlot[p]) });
      sharedSubjects.add(subjectKey(aSlot[agreed[0]], norm));
    } else {                                        // topic in both, no shared sign ⇒ opposite signs: a conflict
      const ac = aSlot['+'] || aSlot['-'], bc = bSlot['+'] || bSlot['-'];
      conflict.push({ subject: ac.subject, a: { claim: ac, text: claimPhrase(ac) }, b: { claim: bc, text: claimPhrase(bc) } });
      sharedSubjects.add(subjectKey(ac, norm));
    }
  }
  // a claim is "each fold's own" when its topic appears in no slot of the other fold
  const onlyA = A.filter((c) => !bSlots.has(topicKey(c, norm))).map((c) => ({ claim: c, text: claimPhrase(c) }));
  const onlyB = B.filter((c) => !aSlots.has(topicKey(c, norm))).map((c) => ({ claim: c, text: claimPhrase(c) }));

  // divergent subjects: a figure BOTH folds speak of, yet share no claim about — the same
  // thing, seen through two lenses. (Excludes subjects already agreed-on or in conflict.)
  const bySubjA = new Map(), bySubjB = new Map(), subjLabel = new Map();
  for (const c of A) { pushTo(bySubjA, subjectKey(c, norm), claimPhrase(c)); if (!subjLabel.has(subjectKey(c, norm))) subjLabel.set(subjectKey(c, norm), c.subject); }
  for (const c of B) { pushTo(bySubjB, subjectKey(c, norm), claimPhrase(c)); if (!subjLabel.has(subjectKey(c, norm))) subjLabel.set(subjectKey(c, norm), c.subject); }
  const divergent = [];
  for (const [s, aLines] of bySubjA) {
    if (!s || !bySubjB.has(s) || sharedSubjects.has(s)) continue;
    divergent.push({ subject: subjLabel.get(s) || s, a: aLines, b: bySubjB.get(s) });
  }

  const castA = castOf(a, norm), castB = castOf(b, norm);
  const cast = { shared: [], onlyA: [], onlyB: [] };
  for (const [k, lab] of castA) (castB.has(k) ? cast.shared : cast.onlyA).push(lab);
  for (const [k, lab] of castB) if (!castA.has(k)) cast.onlyB.push(lab);

  const unionSigned = new Set([...A.map((c) => signedKey(c, norm)), ...B.map((c) => signedKey(c, norm))]).size || 1;
  const unionCast = new Set([...castA.keys(), ...castB.keys()]).size || 1;
  return {
    a: header(a), b: header(b),
    shared, conflict, divergent, onlyA, onlyB, cast,
    metric: {
      basis: 'lexical',
      shared: shared.length, conflicts: conflict.length, divergentSubjects: divergent.length,
      onlyA: onlyA.length, onlyB: onlyB.length,
      claimOverlap: round(shared.length / unionSigned),
      castOverlap: round(cast.shared.length / unionCast),
    },
  };
};

// ── The learned lift — proposition-equivalence over the two universes ──────────────────
// Start from the lexical floor, then — only under a meaning embedder — let the LEARNED
// same-assertion judgment find agreements and conflicts the spelling floor missed
// ("Fusus watches the city" ≡ "Fusus surveils the streets"). Cross-fold `same` pairs become
// shared, `opposed` pairs become conflicts, and the claims they consume leave onlyA/onlyB.
// Under a spelling-space embedder the firewall holds and this returns the floor unchanged.
export const learnedDiff = async (a, b, { norm = defaultNorm, embedder = null, alpha = 0.05, minSim = 0.5 } = {}) => {
  const floor = diffPerspectives(a, b, { norm });
  const A = a?.fold?.claims || [], B = b?.fold?.claims || [];
  if (!embedder?.measuresMeaning || !A.length || !B.length) return floor;

  const claims = [...A, ...B], nA = A.length;
  const vectors = [];
  for (const c of claims) vectors.push(await embedder.embed(claimText(c)));
  // Derive the VOID boundary from the field's own cosines when there is a field to derive it
  // from (proposition-equivalence §"the n<4 fallback"); below that, no null exists, so fall
  // back to the explicit constant boundary. As the corpus grows the derived null takes over.
  const out = attestEquivalenceFrom(vectors, claims.map(claimPolarity), claims.length < 4 ? { minSim } : { alpha });

  const cross = (pr) => (pr.i < nA) !== (pr.j < nA);
  const aOf = (pr) => (pr.i < nA ? pr.i : pr.j);
  const bOf = (pr) => (pr.i < nA ? pr.j : pr.i) - nA;
  const consumed = new Set();                       // claim OBJECT references consumed by the lift
  const liftedShared = [], liftedConflict = [];
  for (const pr of out.pairs) if (cross(pr)) {       // learned agreement (same assertion, agreeing signs)
    const ac = A[aOf(pr)], bc = B[bOf(pr)];
    liftedShared.push({ subject: ac.subject, claim: ac, text: claimPhrase(ac), also: claimPhrase(bc), sim: round(pr.sim), learned: true });
    consumed.add(ac); consumed.add(bc);
  }
  for (const pr of out.opposed) if (cross(pr)) {     // learned conflict (same assertion, clashing signs)
    const ac = A[aOf(pr)], bc = B[bOf(pr)];
    liftedConflict.push({ subject: ac.subject, a: { claim: ac, text: claimPhrase(ac) }, b: { claim: bc, text: claimPhrase(bc) }, sim: round(pr.sim), learned: true });
    consumed.add(ac); consumed.add(bc);
  }
  if (!consumed.size) return { ...floor, metric: { ...floor.metric, basis: 'meaning' } };

  const shared = [...floor.shared, ...liftedShared];
  const conflict = [...floor.conflict, ...liftedConflict];
  const onlyA = floor.onlyA.filter((x) => !consumed.has(x.claim));
  const onlyB = floor.onlyB.filter((x) => !consumed.has(x.claim));
  const unionSigned = shared.length + conflict.length + onlyA.length + onlyB.length || 1;
  return {
    ...floor, shared, conflict, onlyA, onlyB,
    metric: { ...floor.metric, basis: 'meaning', shared: shared.length, conflicts: conflict.length, onlyA: onlyA.length, onlyB: onlyB.length, claimOverlap: round(shared.length / unionSigned) },
  };
};
