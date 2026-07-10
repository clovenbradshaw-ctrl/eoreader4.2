// EO: EVA·SEG(Network,Field → Lens,Network, Tracing,Dissecting) — the subject-sense-collision gate (Stage 1)
// sense.js — Stage 1 of the disambiguated-query pipeline (docs/response-demand.md, the sense gate).
//
// BEFORE a query is generated, ask the cheap, model-free question: does the SUBJECT term itself
// collide across senses in the recorded corpus? "dolphins" resolves to several strong basins — the
// animal, the Miami Dolphins, the NRL Dolphins — while "photosynthesis" resolves to one. The gate
// reads the recorded entity graph (nothing external, no model) and returns one of three exits:
//
//   shortcut  one real sense → generate a trivial query, skip the steer (the photosynthesis path).
//   steer     several senses but the caller's senseHints resolve one → hand back a discriminating
//             ANCHOR (a term that co-occurs with the target sense and NOT the collision) to tilt
//             the query. The anchor is chosen, never generated — model-free.
//   ask       several senses and nothing resolves them → a CHOICE question the caller poses; the
//             reply is scored by conversation-fold.answersAwaited (a reafferent choice answer), so
//             "the animal" resolves as a cheap continuation. This is the branch the dolphins turn
//             skipped — it silently bound one basin instead of asking.
//
// Why the ambiguity test is NOT a margin. The reader already has a POST-retrieval confidence
// (perceiver/referent.js: the winner leads by 0.15) — and in the dolphins audit it fired
// concentrated:true at margin 0.56 AFTER retrieval had committed to a basin. That is the wrong
// signal here: a corpus can be football-heavy so the TEAM dominates salience, yet the animal is
// still a real sense (51 mentions is not noise). Collision is "≥ 2 basins each clear a real-sense
// floor", not "no clear winner" — so a salience-dominant sense that co-exists with another strong
// one is still ambiguous, and still gets asked. The floor is the null discipline the rest of the
// engine keeps: a basin counts as a sense only when it holds real mass, never a one-mention alias.

import { tok } from '../perceiver/parse/index.js';
import { projectGraph } from '../core/index.js';

// A basin holds at least this share of the subject's matched mass to count as a real sense (not a
// stray alias). The same 0.15 the referential margin uses — one knob, the null, not a hand rule.
export const SENSE_FLOOR = 0.15;

// possessive- and plural-tolerant term normal: "dolphin's" / "Dolphins" → "dolphin".
const stem = (t) => String(t).toLowerCase().replace(/['’]s$/, '').replace(/s$/, '');
const labelTokens = (label) => tok(String(label || '')).map(stem);

// senseBasins(subject, entities) → the recorded senses of the subject, MERGED by normalized label
// (the same sense recorded across several docs is one basin), weighted by salience and normalized
// so the weights sum to 1, heaviest first. `entities` are {id, label, weight, neighbors[]} — the
// explorer's rows plus each entity's co-occurring neighbor terms (senseEntities builds them).
export const senseBasins = (subject, entities = []) => {
  const s = stem(subject);
  const byKey = new Map();
  for (const e of entities) {
    const toks = labelTokens(e.label);
    if (!toks.includes(s)) continue;                 // not a sense of THIS subject
    const key = toks.join(' ');
    const cur = byKey.get(key) || { id: e.id, label: e.label, weight: 0, neighbors: new Set() };
    cur.weight += Math.max(0, e.weight || 0);
    for (const n of e.neighbors || []) { const k = stem(n); if (k && !toks.includes(k)) cur.neighbors.add(k); }
    byKey.set(key, cur);
  }
  const total = [...byKey.values()].reduce((z, e) => z + e.weight, 0) || 1;
  return [...byKey.values()]
    .map((e) => ({ id: e.id, label: e.label, weight: e.weight / total, neighbors: [...e.neighbors] }))
    .sort((a, b) => b.weight - a.weight);
};

// discriminatingAnchor(target, others) → the target basin's most-salient neighbor term that appears
// in NONE of the collision basins — co-occurs with the target sense, not the collision ("cetacean"
// for the animal, never the team). '' when nothing discriminates cleanly (every shared → a weak
// signal, so the caller leans on the ask instead). The pick is a scored lookup, never generated.
export const discriminatingAnchor = (target, others = []) => {
  if (!target) return '';
  const collision = new Set();
  for (const o of others) for (const n of o.neighbors || []) collision.add(n);
  for (const n of target.neighbors || []) if (!collision.has(n)) return n;   // neighbors are salience-ordered
  return '';
};

// resolveByHints(basins, hints) → the basin the caller's senseHints point to, or null. A hint
// resolves a basin when it overlaps the basin's neighbor/label vocabulary (concrete, corpus-grounded
// hints — "marine", "nfl" — land; an abstract "animal" with no corpus token to match does not, and
// falls through to the ask, which is the safe direction). Null on no hit or a tie (hints that do not
// discriminate must not force a guess).
export const resolveByHints = (basins = [], hints = []) => {
  const hs = (hints || []).map(stem).filter(Boolean);
  if (!hs.length) return null;
  const score = (b) => {
    const bag = new Set([...labelTokens(b.label), ...(b.neighbors || [])]);
    let n = 0;
    for (const h of hs) if (bag.has(h) || [...bag].some((x) => x.includes(h) || h.includes(x))) n++;
    return n;
  };
  const scored = basins.map((b) => ({ b, s: score(b) })).sort((a, b) => b.s - a.s);
  if (!scored.length || scored[0].s === 0) return null;
  if (scored.length > 1 && scored[0].s === scored[1].s) return null;   // ambiguous hints → don't force it
  return scored[0].b;
};

// The choice question the caller poses. Each option carries its discriminating anchor as a
// parenthetical — "Miami Dolphins (nfl)", "Dolphin (cetacean)" — so the question reads clearly AND
// the anchor lands in conversation-fold.outstandingQuestion's answer-space, so a reply that echoes
// either the label or the anchor ("the cetacean one", "nfl") resolves as a choice answer.
const askQuestion = (subject, opts) => {
  const parts = opts.map((o) => (o.anchor ? `${o.label} (${o.anchor})` : o.label));
  if (parts.length < 2) return `Which ${subject} do you mean?`;
  const list = parts.length === 2
    ? `${parts[0]} or ${parts[1]}`
    : `${parts.slice(0, -1).join(', ')}, or ${parts[parts.length - 1]}`;
  return `Which ${subject} do you mean — ${list}?`;
};

// senseCollision(subject, entities, { hints, floor }) → the Stage-1 verdict:
//   { subject, resolution: 'shortcut'|'steer'|'ask', ambiguous, basins, target, anchor, ask }
//     target  the basin to generate from (shortcut/steer) — {id, label, weight, neighbors} | null
//     anchor  the discriminating term to tilt the query (Stage 2) — '' when none is needed/clean
//     ask     { question, options } when the caller must pose a choice (feeds fold.awaiting) | null
export const senseCollision = (subject, entities = [], { hints = [], floor = SENSE_FLOOR } = {}) => {
  const basins = senseBasins(subject, entities);
  const real = basins.filter((b) => b.weight >= floor);
  const dominant = basins[0] || null;

  if (real.length <= 1) {
    // one real sense (or none matched) → unambiguous. A hint may still redirect to a minor sense
    // the caller knows they meant; otherwise generate from the dominant basin.
    const hinted = resolveByHints(basins, hints);
    const target = hinted || dominant;
    const anchor = target ? discriminatingAnchor(target, basins.filter((b) => b.id !== target.id)) : '';
    return { subject, resolution: 'shortcut', ambiguous: false, basins, target: target || null, anchor, ask: null };
  }

  // ≥ 2 real senses → genuinely ambiguous. Try the hints; else ask.
  const hinted = resolveByHints(real, hints);
  if (hinted) {
    const anchor = discriminatingAnchor(hinted, real.filter((b) => b.id !== hinted.id));
    return { subject, resolution: 'steer', ambiguous: true, basins, target: hinted, anchor, ask: null };
  }
  const top = real.slice(0, 3);
  const opts = top.map((b) => ({ label: b.label, anchor: discriminatingAnchor(b, top.filter((x) => x.id !== b.id)) }));
  return { subject, resolution: 'ask', ambiguous: true, basins, target: null, anchor: '', ask: { question: askQuestion(subject, opts), options: opts.map((o) => o.label), anchors: opts.map((o) => o.anchor).filter(Boolean) } };
};

// senseEntities(docs) → the {id, label, weight, neighbors[]} rows senseCollision reads, built from
// the recorded graph exactly as the reader's explorer does (projectGraph → representative → labelOf,
// weight = sightings + link degree) PLUS each entity's co-occurring neighbor terms (the labels it
// shares an edge with, tokenized). Pure over the docs; a doc without a log is skipped. This is the
// only part that touches the graph — senseCollision itself is a pure function of the rows.
export const senseEntities = (docs = []) => {
  const out = [];
  for (const doc of docs || []) {
    if (!doc || !doc.log) continue;
    let g; try { g = projectGraph(doc.log); } catch (_) { continue; }
    const rep = g.representative || ((x) => x);
    const labelOf = (r) => (doc.admission && doc.admission.labelOf && doc.admission.labelOf(r)) || (g.entities && g.entities.get(r) && g.entities.get(r).label) || r;
    const neigh = new Map();
    const degree = new Map();
    for (const e of g.edges || []) {
      const a = rep(e.from), b = rep(e.to);
      degree.set(a, (degree.get(a) || 0) + 1); degree.set(b, (degree.get(b) || 0) + 1);
      if (!neigh.has(a)) neigh.set(a, new Set());
      if (!neigh.has(b)) neigh.set(b, new Set());
      neigh.get(a).add(b); neigh.get(b).add(a);
    }
    const seen = new Set();
    for (const [id, ent] of g.entities || []) {
      const r = rep(id);
      if (seen.has(r)) continue;
      seen.add(r);
      const neighbors = [...(neigh.get(r) || [])].flatMap((nr) => tok(String(labelOf(nr) || '')));
      out.push({ id: `${doc.docId || ''}#${r}`, label: labelOf(r), weight: (ent.sightings || 0) + (degree.get(r) || 0), neighbors });
    }
  }
  return out;
};
