// EO: CON·EVA(Field,Network → Link,Network, Binding,Tracing) — inferred significance edges
// fold/significance.js — THE SIGNIFICANCE THE READER INFERS, promoted to the graph WITH its
// provenance. The connections that are not explicitly in the text — "the significance of it all".
//
// deep-reading.js has the reading VOICE a reflection (an EVA — a judgment) as a plain-text note.
// weave.js CONNECTS reflections across the corpus (echo · bears-on · analogy). Both are held only
// as substrate NODES: they never touch the physics, because a reflection is op EVA (projectGraph
// skips it) and a weave connection carries no src/tgt endpoints (so it projects no edge). They
// enrich the reading, but they cannot MOVE it — a claim can't become corroborated or contested by
// a thought that isn't on the graph.
//
// This is the other half: the significance read as a real EDGE. The reading looks across what it
// has witnessed and infers a relation the text never states —
//
//   CONTRADICTS  the same bond affirmed and denied (a polarity clash the text leaves unresolved) —
//                the tension that makes a claim CONTESTED.
//   CONNECTS     two figures that never meet in the text but both bear on a third (a shared
//                neighbour) — the latent link "in potential", made explicit.
//   CORROBORATES the same bond asserted from two places — the convergence that STRENGTHENS a claim.
//
// None of these is in any single sentence; each is the reader's own reading of how the witnessed
// facts relate. So each is promoted as a CON edge that is REAFFERENCE (fromEnactor, canWitness
// false — the §8 firewall), band VOID (held open), and tagged inferred:true. projectGraph depicts
// it BETWEEN THE REAL FIGURES (docs/monologue-significance.md) — so the surf, retrieval and the
// provenance graph read it and MOVE (impact) — while carrying its provenance onto the edge, so the
// witnessed record and the citable-facts grounder can tell it from world and never witness it.
// The firewall audit (fold/audit.js) confirms it: factsAdded 0 (no witnessed edge), inferredAdded
// N (the reader's overlay). Impact without laundering — the version that works.
//
// TWO READINGS, one firewall. There are two ways to reach a connection the text never states:
//
//   STRUCTURE-FED (inferSignificance) — read off the witnessed STRUCTURE (perceiver/structureSurface):
//     a shared neighbour, a polarity clash. This is what is LATENT IN THE STRUCTURE — cheap, total,
//     and blind to what the reading cared about. Every same-neighbour pair is proposed equally.
//
//   FOLD-FED (inferFoldSignificance) — read off the FOLD the reading takes at its places of most
//     interest (the surf's surprise peaks, fold/deep-reading.js). The connection is drawn between
//     the figures the reading STRAINED over together — where its own significance arrested, not
//     everywhere the graph happens to converge. This is "the significance of it all": the fold
//     carries the meaning in potential (the surprise, the held tension), and the connection is the
//     reading recognising its OWN recurring concern — Grete's care at the open and her relief at the
//     close bound as one arc, which no sentence asserts. Fed a fold, gated by significance, attention-
//     weighted. weaveSignificance runs both when a surf is supplied.
//
// Deterministic and MODEL-FREE, like the reader it extends: the significance is read, never authored.

import { fromEnactor, canWitness } from '../../core/index.js';
import { structureSurface } from '../../perceiver/index.js';
import { createDeepReader } from './deep-reading.js';

export const SIGNIFICANCE = 'significance';

// A light verb stem so "helped" and "did not help" are recognised as the SAME bond with opposite
// polarity (the parser inflects the negated form differently). Deliberately crude — the significance
// read tolerates a loose match; a false pair only ever proposes a VOID edge, never a fact.
const stem = (v) => String(v || '').toLowerCase().replace(/(?:ed|ing|es|s|d)$/, '') || String(v || '').toLowerCase();

// buildSignificanceEdge — the ONE append-only event a significance connection deposits: a CON (the
// bond at Relate × Structure) between two WITNESSED figures, carrying the reader's inference KIND
// and its provenance. Reafference (fromEnactor → canWitness false), band void (held open), tagged
// connection+inferred so the firewall attributes it to the reading and strips it from the record.
// It rides op CON with real src/tgt, so projectGraph DEPICTS it (the impact) carrying its prov (the
// safety) — the two facts the whole design turns on.
export const buildSignificanceEdge = ({
  kind, src, tgt, via, srcLabel = null, tgtLabel = null,
  body = '', sources = [], atSentence = null, strength = 0.5, enactment = SIGNIFICANCE,
} = {}) => {
  const prov = fromEnactor(enactment);
  return Object.freeze({
    op: 'CON', register: 'enacted', connection: true, inferred: true, layer: 'connection',
    kind, src, tgt, via, srcLabel, tgtLabel,
    w: strength, relType: 'inferred',
    body: String(body ?? ''), sources: Object.freeze([...sources]),
    sentIdx: atSentence, cursor: atSentence,
    band: 'void', grounded: false, prov, door: 'enactor',
  });
};

// inferSignificance — read the witnessed structure and surface the connections it IMPLIES but never
// states. Pure over (doc, structure); returns the connection events UNCOMMITTED (weaveSignificance
// commits). maxPerKind bounds the fan-out on a dense graph (a silent cap the caller can widen).
export const inferSignificance = (doc, { structure = null, maxPerKind = 12 } = {}) => {
  const idxs = (doc?.units || doc?.sentences || []).map((_, i) => i);
  const s = structure || (idxs.length ? structureSurface(doc, idxs) : { relations: [], defs: [] });
  // Connections are drawn BETWEEN WITNESSED FIGURES only: not into np/common-noun referents, reified
  // props, ALL-CAPS heading welds, a via that is itself a figure name (subject mis-parse), or off a
  // weak coref guess. structureSurface carries figure/kind/coupling; gate on them (unflagged = kept).
  const isHeading = (l) => { const s = String(l || '').trim(); return s.length > 2 && /\p{Lu}/u.test(s) && s === s.toUpperCase() && s !== s.toLowerCase(); };
  const isFigure = (e, k) => e?.figure !== false && k !== 'np' && k !== 'prop' && !isHeading(e?.label);
  const names = new Set();
  for (const r of (s.relations || [])) for (const [e, k] of [[r.src, r.srcKind], [r.tgt, r.tgtKind]]) if (isFigure(e, k)) names.add(String(e.label || '').toLowerCase());
  const relations = (s.relations || []).filter((r) => r.src?.id && r.tgt?.id && isFigure(r.src, r.srcKind) && isFigure(r.tgt, r.tgtKind)
    && !names.has(String(r.via || '').toLowerCase()) && !(r.coupling != null && r.coupling < 0.35));
  const labelOf = new Map();
  for (const r of relations) { labelOf.set(r.src.id, r.src.label ?? r.src.id); labelOf.set(r.tgt.id, r.tgt.label ?? r.tgt.id); }
  const L = (id) => labelOf.get(id) ?? id;
  const out = [];

  // ── CONTRADICTS and CORROBORATES — group the bonds by (src, stem(via), tgt). A group holding
  // both polarities is a contradiction the text never resolves; a group asserting the same
  // polarity at ≥2 distinct places is corroboration.
  const byBond = new Map();
  for (const r of relations) {
    const k = `${r.src.id}|${stem(r.via)}|${r.tgt.id}`;
    if (!byBond.has(k)) byBond.set(k, []);
    byBond.get(k).push(r);
  }
  let nContra = 0, nCorrob = 0;
  for (const group of byBond.values()) {
    const pos = group.filter((r) => r.polarity !== '−');
    const neg = group.filter((r) => r.polarity === '−');
    const r0 = group[0];
    if (pos.length && neg.length && nContra < maxPerKind) {
      nContra++;
      out.push(buildSignificanceEdge({
        kind: 'contradicts', src: r0.src.id, tgt: r0.tgt.id, via: 'contradicts',
        srcLabel: L(r0.src.id), tgtLabel: L(r0.tgt.id),
        body: `the reading holds a tension: the text both affirms and denies that ${L(r0.src.id)} ${r0.via} ${L(r0.tgt.id)} — a contradiction it never resolves.`,
        sources: group.map((r) => r.idx).filter(Number.isInteger), strength: 0.8,
        atSentence: Number.isInteger(r0.idx) ? r0.idx : null,
      }));
    } else if (pos.length >= 2 && !neg.length) {
      const idxsSeen = new Set(pos.map((r) => r.idx));
      if (idxsSeen.size >= 2 && nCorrob < maxPerKind) {
        nCorrob++;
        out.push(buildSignificanceEdge({
          kind: 'corroborates', src: r0.src.id, tgt: r0.tgt.id, via: 'corroborates',
          srcLabel: L(r0.src.id), tgtLabel: L(r0.tgt.id),
          body: `the reading finds ${L(r0.src.id)} ${r0.via} ${L(r0.tgt.id)} asserted from ${idxsSeen.size} places — a corroboration that strengthens it.`,
          sources: [...idxsSeen].filter(Number.isInteger), strength: 0.7,
          atSentence: Number.isInteger(r0.idx) ? r0.idx : null,
        }));
      }
    }
  }

  // ── CONNECTS — the common-neighbour latent link. Two subjects that both relate to a shared
  // target but are NEVER directly related in the text: the reading connects them "in potential".
  const targetsOf = new Map();          // subject id -> Set of target ids
  const direct = new Set();             // ordered pairs the text relates directly (either way)
  const bondIdx = new Map();            // "sub|tgt" -> a sentence idx that asserts it (for sourcing)
  for (const r of relations) {
    if (!targetsOf.has(r.src.id)) targetsOf.set(r.src.id, new Set());
    targetsOf.get(r.src.id).add(r.tgt.id);
    direct.add(`${r.src.id}|${r.tgt.id}`); direct.add(`${r.tgt.id}|${r.src.id}`);
    if (Number.isInteger(r.idx)) bondIdx.set(`${r.src.id}|${r.tgt.id}`, r.idx);
  }
  const subs = [...targetsOf.keys()];
  let nConnect = 0;
  for (let i = 0; i < subs.length && nConnect < maxPerKind; i++) {
    for (let j = i + 1; j < subs.length && nConnect < maxPerKind; j++) {
      const A = subs[i], B = subs[j];
      if (direct.has(`${A}|${B}`)) continue;            // the text already relates them — not latent
      const shared = [...targetsOf.get(A)].filter((x) => targetsOf.get(B).has(x) && x !== A && x !== B);
      if (!shared.length) continue;
      const X = shared[0];
      nConnect++;
      out.push(buildSignificanceEdge({
        kind: 'connects', src: A, tgt: B, via: 'bears-on',
        srcLabel: L(A), tgtLabel: L(B),
        body: `${L(A)} and ${L(B)} both bear on ${L(X)}${shared.length > 1 ? ` (and ${shared.length - 1} more)` : ''} — a connection the text implies but never states.`,
        sources: [bondIdx.get(`${A}|${X}`), bondIdx.get(`${B}|${X}`)].filter(Number.isInteger),
        strength: Math.min(0.4 + 0.15 * shared.length, 0.9),
        atSentence: bondIdx.get(`${A}|${X}`) ?? null,
      }));
    }
  }

  return out;
};

// ── FOLD-FED — the significance read off the reading's FOLDS at its places of most interest ──
//
// inferFoldSignificance — feed the connector the FOLD, not the raw structure. Run the deep reader
// (fold/deep-reading.js) so it surfs to its surprise peaks and folds each one; then connect the
// figures the reading STRAINED over TOGETHER — co-engaged in one strained fold, or engaged in two
// strained folds that share a figure (its recurring concern). The connection is drawn where the
// reading's own significance arrested, weighted by it — not everywhere the graph converges. It is
// still promoted only when the pair is NOT already directly witnessed (a genuine "in potential"
// link), carries the fold's own significance summary as its WHY, and rides the same firewall.
//   surf   INJECTED (surfFold) — required; without it there are no folds to read.
export const inferFoldSignificance = (doc, { surf, maxPerKind = 12 } = {}) => {
  if (typeof surf !== 'function') throw new Error('inferFoldSignificance: surf must be injected');
  const idxs = (doc?.units || doc?.sentences || []).map((_, i) => i);
  const full = idxs.length ? structureSurface(doc, idxs) : { relations: [] };
  const labelOf = new Map();
  const witnessed = new Set();          // ordered pairs the text directly relates
  for (const r of (full.relations || [])) {
    if (!r.src?.id || !r.tgt?.id) continue;
    labelOf.set(r.src.id, r.src.label ?? r.src.id); labelOf.set(r.tgt.id, r.tgt.label ?? r.tgt.id);
    witnessed.add(`${r.src.id}|${r.tgt.id}`); witnessed.add(`${r.tgt.id}|${r.src.id}`);
  }
  const L = (id) => labelOf.get(id) ?? id;

  // run the reader across the whole document (the surface/app walk), collecting its folds.
  const reader = createDeepReader({ doc, surf });
  const n = idxs.length || 1;
  let anchor = 0, guard = 0;
  while (anchor < n - 1 && guard++ < Math.max(8, n)) {
    const before = reader.reflections.length;
    const fresh = reader.arrive({ anchor }).reflections || [];
    if (fresh.length) anchor = Math.min(n - 1, fresh[fresh.length - 1].peak + 1);
    else if (reader.reflections.length === before) anchor += 8;
  }

  // the figures a fold ENGAGED at its peak: the focus, plus the endpoints of the relations sitting
  // under the fold's own sources (its little reach). This is what the reading actually held there.
  const engagedOf = (r) => {
    const set = new Set();
    if (r.focus) { const f = String(r.focus).toLowerCase(); set.add(f); if (!labelOf.has(f)) labelOf.set(f, String(r.focus)); }
    for (const rel of (structureSurface(doc, r.sources || []).relations || [])) {
      if (rel.src?.id) { set.add(rel.src.id); labelOf.set(rel.src.id, rel.src.label ?? rel.src.id); }
      if (rel.tgt?.id) { set.add(rel.tgt.id); labelOf.set(rel.tgt.id, rel.tgt.label ?? rel.tgt.id); }
    }
    return set;
  };
  const strained = reader.reflections.filter((r) => r.verdict === 'strain');
  const folds = strained.map((r) => ({ r, figs: engagedOf(r), summary: r.fold?.levels?.significance?.summary || r.body || '' }));

  const out = [];
  const seenPair = new Set();
  const emit = (a, b, atR, why) => {
    if (a === b || witnessed.has(`${a}|${b}`)) return;      // not a latent link if already related
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seenPair.has(key) || out.length >= maxPerKind) return;
    seenPair.add(key);
    out.push(buildSignificanceEdge({
      kind: 'connects', src: a, tgt: b, via: 'bears-on', srcLabel: L(a), tgtLabel: L(b),
      body: `${L(a)} and ${L(b)} are bound by the reading's recurring concern — ${why} — a significance the text never states.`,
      sources: Array.isArray(atR?.sources) ? atR.sources.filter(Number.isInteger) : [],
      strength: 0.6, atSentence: Number.isInteger(atR?.peak) ? atR.peak : null,
    }));
  };

  // within a single strained fold: bind the fold's FOCUS — the centre of the reading's concern —
  // to the other figures it engaged there but the text never directly linked to it. Anchored on
  // the focus (linear), not every co-engaged pair (quadratic), so a wide fold does not fan out.
  for (const { r, figs, summary } of folds) {
    const focus = String(r.focus ?? '').toLowerCase();
    if (!focus) continue;
    for (const other of figs) if (other !== focus) emit(focus, other, r, summary);
  }
  // across two strained folds that share a figure, the reading's concern RECURS — bind the two
  // peaks' FOCI (their centres), not the full cross-product: one edge per recurrence, the arc the
  // shared figure runs between, never a combinatorial fan-out of every co-engaged pair.
  for (let i = 0; i < folds.length; i++) {
    for (let j = i + 1; j < folds.length; j++) {
      const shared = [...folds[i].figs].filter((x) => folds[j].figs.has(x));
      if (!shared.length) continue;
      const fa = String(folds[i].r.focus ?? '').toLowerCase(), fb = String(folds[j].r.focus ?? '').toLowerCase();
      if (fa && fb && fa !== fb) {
        emit(fa, fb, folds[i].r, `it strains on ${shared.map(L).join(', ')} at §${folds[i].r.peak} and again at §${folds[j].r.peak}`);
      }
    }
  }
  return out;
};

// weaveSignificance — infer the connections and (by default) COMMIT them to the log as reafferent
// edges, so the reading MOVES: the surf, retrieval and the provenance graph now read them. Runs the
// STRUCTURE-FED reading always, and the FOLD-FED reading too when a `surf` is supplied (fed the
// reading's folds at its surprise peaks — "the significance of it all"). Returns the committed
// connections, a per-kind tally, and canWitness surfaced (false — the firewall).
//   surf          INJECTED surfFold — enables the fold-fed reading; omit for structure-fed only.
//   commit:false  returns the events without appending (peek, or hand to a provenance-aware view).
export const weaveSignificance = (doc, { surf = null, structure = null, maxPerKind = 12, commit = true, enactment = SIGNIFICANCE } = {}) => {
  if (!doc || !doc.log) throw new Error('weaveSignificance: a doc with a log is required');
  const events = inferSignificance(doc, { structure, maxPerKind });
  // fold-fed connections augment the structural ones; dedup by (kind, src, tgt) so a pair the
  // structure already linked is not re-proposed.
  if (typeof surf === 'function') {
    const have = new Set(events.map((e) => `${e.kind}|${e.src}|${e.tgt}`));
    for (const e of inferFoldSignificance(doc, { surf, maxPerKind })) {
      const k = `${e.kind}|${e.src}|${e.tgt}`, kr = `${e.kind}|${e.tgt}|${e.src}`;
      if (have.has(k) || have.has(kr)) continue;
      have.add(k); events.push(e);
    }
  }
  const connections = events.map((e) => (commit ? doc.log.append(e) : e));
  const kinds = { contradicts: 0, corroborates: 0, connects: 0 };
  for (const c of connections) if (kinds[c.kind] != null) kinds[c.kind]++;
  return Object.freeze({
    connections, count: connections.length, kinds,
    // every promoted edge is reafference — it can never witness world (surfaced for the caller's audit).
    reafferent: connections.every((c) => canWitness(c.prov) === false),
  });
};

// readSignificance — the connections a log already carries (read at read time, like readReflections).
export const readSignificance = (doc) => {
  const events = typeof doc?.log?.snapshot === 'function' ? doc.log.snapshot() : (doc?.log?.events || []);
  return events.filter((e) => e && e.op === 'CON' && e.inferred === true && e.layer === 'connection');
};
