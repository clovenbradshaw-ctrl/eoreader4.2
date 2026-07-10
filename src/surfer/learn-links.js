// EO: REC·EVA(Link,Field → Kind,Paradigm, Composing,Binding) — grow link-types from labels
// Growing specific link-types from the links the closed vocabulary leaves untyped —
// label feedback (word → concept), the half the reading side never had.
//
// A link is its operator (structure-basis.js, first level). The shipped relation-class
// taxonomy (RELTYPES) is a fixed second level that types only the minority of links whose
// verb the conventions ledger already knows; the recurring REST stay untyped — the parse
// keeps meeting "became", "seemed", "tried", "made" and has no concept to file them under.
//
// Comprehension runs concept → word: a known concept lends its word. LEARNING runs the
// other way, word → concept: a label that keeps recurring is evidence of a distinction the
// frame is missing, and the label is what lets the distinction be grown. That is the move
// here. We take each recurring untyped link-verb as a CANDIDATE new specific type, scoped
// under its operator (`CON/became`, `SIG/seemed` — the operator is still the first level,
// this only makes it more specific), and then we ask the honest question:
//
//   does STRUCTURE ALONE carve this distinction, or does the label carry meaning the
//   structure can't see (so it would have to be pushed down from VOX)?
//
// We answer it by measurement, not assertion. Each link gets a STRUCTURAL feature vector —
// its operator, bond coupling, target kind, polarity, and the operator-profile of its
// sentence (its operational context). The verb itself is NEVER a feature (that would be
// circular). A candidate type is USABLE only if the links that share its verb cohere in
// that structural space BEYOND what random same-size groups of untyped links reach — the
// engine's own signal-from-noise line (deriveNull), the same rule that gates SYN. If a
// label's links cohere structurally, structure recovered the distinction the label names.
// If they don't, the label names something structure can't see — the empirical case that
// the semantic push from VOX is doing real work, not the structural basis.

import { deriveNull } from '../core/index.js';
import { OPS, operatorProfiles } from './structure-basis.js';

const OP_IDX = Object.fromEntries(OPS.map((o, i) => [o, i]));
const round = (x) => Math.round(x * 1e4) / 1e4;
const normVec = (v) => { const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1; return v.map(x => x / n); };
const cosine = (a, b) => {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d > 1e-12 ? dot / d : 0;
};
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// linkInventory(doc) — the edges between nodes, each typed by its operator (first level),
// carrying its verb (the label) and the closed-vocab relType when the ledger knew it.
export const linkInventory = (doc) => {
  const events = typeof doc?.log?.snapshot === 'function' ? doc.log.snapshot() : (doc?.log?.events || []);
  const profiles = operatorProfiles(doc);
  const links = [];
  for (const e of events) {
    if ((e.op !== 'CON' && e.op !== 'SIG') || !e.via) continue;
    const coupling = e.coupling != null ? e.coupling : (e.w != null ? e.w : 1);
    links.push({
      op: e.op,
      via: String(e.via).toLowerCase(),
      relType: e.relType || null,
      coupling: Math.max(0, Math.min(1, coupling)),
      tgtKind: e.tgtKind === 'np' ? 'np' : (e.tgt != null ? 'entity' : 'other'),
      polarity: e.polarity === '−' || e.polarity === '-' ? -1 : (e.polarity ? 1 : 0),
      sentIdx: e.sentIdx,
      ctx: e.sentIdx != null && e.sentIdx >= 0 && e.sentIdx < profiles.length ? profiles[e.sentIdx] : new Array(OPS.length).fill(0),
    });
  }
  const typed = links.filter(l => l.relType).length;
  return { links, total: links.length, typed, untyped: links.length - typed };
};

// the STRUCTURAL feature vector of a link — operator, coupling, target kind, polarity, and
// its sentence's operator-profile (its operational context). The verb is deliberately
// absent: we are testing whether structure can find the regularity the verb labels.
const featureOf = (l) => {
  const op = new Array(OPS.length).fill(0); op[OP_IDX[l.op]] = 1;
  const kind = [l.tgtKind === 'entity' ? 1 : 0, l.tgtKind === 'np' ? 1 : 0, l.tgtKind === 'other' ? 1 : 0];
  return [...op, l.coupling, ...kind, l.polarity, ...normVec(l.ctx)];
};

// within-group coherence: how tight a set of links sits in structural-feature space (mean
// pairwise cosine). High → these links ARE structurally alike, whatever their verb.
const coherence = (feats) => {
  if (feats.length < 2) return 0;
  let s = 0, n = 0;
  for (let i = 0; i < feats.length; i++) for (let j = i + 1; j < feats.length; j++) { s += cosine(feats[i], feats[j]); n++; }
  return n ? s / n : 0;
};

// the closed-vocab refinement only types a minority of links — count the recurring verbs
// it leaves untyped. These are the labels with no concept: the candidates for growth.
export const untypedVias = (doc, { minCount = 3 } = {}) => {
  const { links } = linkInventory(doc);
  const byVia = new Map();
  for (const l of links) if (!l.relType) { const a = byVia.get(l.via) || []; a.push(l); byVia.set(l.via, a); }
  return [...byVia.entries()]
    .filter(([, ls]) => ls.length >= minCount)
    .map(([via, ls]) => {
      const opCount = {}; for (const l of ls) opCount[l.op] = (opCount[l.op] || 0) + 1;
      const op = Object.entries(opCount).sort((a, b) => b[1] - a[1])[0][0];
      return { via, count: ls.length, op };
    })
    .sort((a, b) => b.count - a.count);
};

// growLinkTypes(doc, { minCount, alpha, samples }) — the label-feedback growth, measured.
//
// For each recurring untyped verb, propose a specific type scoped under its operator and
// test it: is the structural coherence of its links above the engine's signal-from-noise
// line, built from random same-size groups of untyped links? Returns each candidate with
// its coherence, the derived null line, and a USABLE verdict — plus `structureGrows`, the
// answer to whether structure alone grew any usable distinction (vs the labels carrying
// meaning only VOX could supply).
export const growLinkTypes = (doc, { minCount = 3, alpha = 0.05, samples = 200 } = {}) => {
  const { links, total, typed, untyped } = linkInventory(doc);
  const pool = links.filter(l => !l.relType);

  // a deterministic LCG so the null is reproducible (no Date/Math.random; resume-safe).
  let seed = (pool.length * 2654435761 + total * 40503 + 1) >>> 0;
  const rand = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 0x100000000; };
  const sampleFrom = (feats, k) => { if (feats.length < k) return null; const idx = []; const used = new Set(); let guard = 0; while (idx.length < k && guard++ < k * 20) { const i = (rand() * feats.length) | 0; if (!used.has(i)) { used.add(i); idx.push(i); } } return idx.map(i => feats[i]); };

  const cands = untypedVias(doc, { minCount });
  const family = Math.max(2, cands.length);   // multiple-comparison correction over the candidates
  const grown = cands.map(({ via, count, op }) => {
    const feats = pool.filter(l => l.via === via).map(featureOf);
    const coh = coherence(feats);
    // The fair null: random same-size groups drawn from links of the SAME OPERATOR. The
    // operator one-hot is then constant across the candidate and the null, so the test
    // isolates the question that matters — do these verb-sharing links cohere on the FINER
    // structure (coupling, target kind, polarity, operational context) beyond chance,
    // WITHIN their operator. That is what "growing a more specific type" has to earn.
    const opFeats = pool.filter(l => l.op === op).map(featureOf);
    const bg = [];
    for (let s = 0; s < samples; s++) { const grp = sampleFrom(opFeats, count); if (grp) bg.push(coherence(grp)); }
    const line = deriveNull(bg, { scale: 'linear', alpha, N: family });
    const usable = Number.isFinite(line) && coh > line;
    return Object.freeze({
      key: `${op}/${via}`,            // the operator stays first; this only makes it specific
      via, op, count,
      coherence: round(coh),
      nullLine: Number.isFinite(line) ? round(line) : null,
      usable,
    });
  });

  const usableTypes = grown.filter(g => g.usable);
  return Object.freeze({
    total, typed, untyped,
    typedFraction: total ? round(typed / total) : 0,
    candidates: grown.length,
    grown,
    usableCount: usableTypes.length,
    // the measured verdict on the structural-vs-distributional question. TRUE: at least one
    // recurring untyped label names a regularity STRUCTURE alone recovers — the basis grows
    // a usable specific type on its own. FALSE: the recurring labels carry distinctions the
    // structural features can't separate — evidence the semantic push from VOX does real work.
    structureGrows: usableTypes.length > 0,
  });
};

// ── The persistent learner — the learning lives INSIDE the engine ──────────────────────
//
// growLinkTypes answers the question for ONE document and forgets. But learning is
// accumulation: a label that does not yet have enough evidence to beat its null in one book
// may earn it across several. createLinkLearner is the in-process memory that makes that
// real. It is fed documents one at a time, keeps the structural features of every untyped
// link it has ever seen (per verb, and per operator for the null), and after each document
// re-asks whether any verb's links now cohere beyond a same-operator null. When one does,
// the verb is PROMOTED to a learned link-type — a new, more-specific second level, GROWN
// from evidence rather than shipped. Promotions are sticky: once the evidence cleared the
// bar, the distinction is part of the engine's vocabulary.
//
// The payoff is `activationsFor(doc)`: the structural basis GROWN with one dimension per
// learned type, so a later reading is constituted through distinctions the engine taught
// itself. That is the loop the critique said was missing — word → concept → changed
// reading — closed in-process, with no embedder and nothing posted out. `snapshot()` makes
// the learned vocabulary serialisable so it can persist across runs; `restore` re-seeds it.

const hashStr = (s) => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

export const createLinkLearner = ({ minEvidence = 6, alpha = 0.05, samples = 200, cap = 4000, restore = null } = {}) => {
  const byVia = new Map();      // via → { ops: {op:count}, feats: [] }
  const opPool = new Map();     // op → feats[]   (the same-operator null background)
  const learned = new Map();    // via → { key, via, op, count, coherence, nullLine, since }
  let docsSeen = 0, linksSeen = 0;

  if (restore?.learned) { for (const r of restore.learned) learned.set(r.via, Object.freeze({ ...r })); docsSeen = restore.docsSeen || 0; linksSeen = restore.linksSeen || 0; }

  const topOp = (ops) => Object.entries(ops).sort((a, b) => b[1] - a[1])[0][0];

  // the cumulative same-operator null: random same-size groups drawn from every untyped
  // link of that operator the learner has accumulated. Seeded from the verb so it is
  // deterministic and reproducible across runs (no Date/Math.random).
  // N is the family size — the number of candidate verbs being tested at once. deriveNull's
  // bound is then "what the LUCKIEST of N chance draws reaches", the engine's own multiple-
  // comparison correction: at corpus scale thousands of verbs are tested, and without this a
  // 0.05 line lets ~5% through as noise. Tying N to the family means only a verb that towers
  // over what the luckiest random group would reach is promoted.
  const nullLineFor = (op, k, N) => {
    const pool = opPool.get(op) || [];
    if (pool.length < k + 2) return Infinity;
    let seed = (hashStr(op) ^ Math.imul(k, 2654435761) ^ linksSeen) >>> 0;
    const rand = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 0x100000000; };
    const bg = [];
    for (let s = 0; s < samples; s++) {
      const idx = []; const used = new Set(); let guard = 0;
      while (idx.length < k && guard++ < k * 20) { const i = (rand() * pool.length) | 0; if (!used.has(i)) { used.add(i); idx.push(i); } }
      bg.push(coherence(idx.map(i => pool[i])));
    }
    return deriveNull(bg, { scale: 'linear', alpha, N });
  };

  // re-evaluate every not-yet-learned verb against its cumulative same-operator null, and
  // promote those that beat it. Cheap accumulation and (quadratic) evaluation are split so
  // a corpus-scale harvest can accumulate every book and evaluate once at the end.
  const evaluate = () => {
    const newlyLearned = [];
    // the family being tested this round — every not-yet-learned verb with enough evidence.
    // deriveNull is corrected against this count, so a big vocabulary does not leak noise.
    const family = Math.max(2, [...byVia.values()].filter(v => v.feats.length >= minEvidence).length);
    for (const [via, v] of byVia) {
      if (learned.has(via) || v.feats.length < minEvidence) continue;
      const op = topOp(v.ops);
      const coh = coherence(v.feats);
      const line = nullLineFor(op, v.feats.length, family);
      if (Number.isFinite(line) && coh > line) {
        const rec = Object.freeze({ key: `${op}/${via}`, via, op, count: v.feats.length, coherence: round(coh), nullLine: round(line), since: docsSeen });
        learned.set(via, rec); newlyLearned.push(rec.key);
      }
    }
    return newlyLearned;
  };

  // ingest a batch of links directly (the learner is a link consumer; a parsed document is
  // just one source). Links are { op, via, relType?, coupling, tgtKind, polarity, ctx? };
  // ctx (the sentence operator-profile) defaults to zeros when a non-document source has none.
  // Pass { evaluate:false } to only accumulate (then call evaluate() yourself) — for scale.
  const observeLinks = (links, { evaluate: doEval = true } = {}) => {
    docsSeen++;
    for (const raw of links) {
      const l = { coupling: 1, tgtKind: 'other', polarity: 0, ctx: new Array(OPS.length).fill(0), ...raw, via: String(raw.via || '').toLowerCase() };
      if (!l.op || !l.via || l.relType) continue;     // need a link; skip what the shipped vocabulary already typed
      linksSeen++;
      const f = featureOf(l);
      let v = byVia.get(l.via); if (!v) byVia.set(l.via, v = { ops: {}, feats: [] });
      v.ops[l.op] = (v.ops[l.op] || 0) + 1;
      v.feats.push(f); if (v.feats.length > cap) v.feats.shift();
      let p = opPool.get(l.op); if (!p) opPool.set(l.op, p = []);
      p.push(f); if (p.length > cap) p.shift();
    }
    const newlyLearned = doEval ? evaluate() : [];
    return Object.freeze({ docsSeen, linksSeen, learnedCount: learned.size, pending: byVia.size - learned.size, newlyLearned });
  };

  // ingest one parsed document — its untyped links feed the same accumulation.
  const observe = (doc, opts) => observeLinks(linkInventory(doc).links, opts);

  const learnedTypes = () => [...learned.values()].sort((a, b) => b.count - a.count);

  return Object.freeze({
    observe, observeLinks, evaluate,
    learnedTypes,
    vocabulary: () => learnedTypes().map(r => r.key),
    // type one link: its operator (first level) and any learned type that now applies (second).
    typeLink: (link) => { const via = String(link.via || '').toLowerCase(); const rec = learned.get(via); return { op: link.op, learnedType: rec ? rec.key : null }; },
    // the GROWN basis: operators (the first level) + one dimension per learned type. A later
    // reading constituted through this is read partly through distinctions the engine grew.
    activationsFor: (doc) => {
      const keys = learnedTypes().map(r => r.key);
      const ltIdx = Object.fromEntries(keys.map((k, i) => [k, i]));
      const prof = operatorProfiles(doc);
      const acts = prof.map(p => [...p, ...new Array(keys.length).fill(0)]);
      const { links } = linkInventory(doc);
      for (const l of links) {
        if (l.relType) continue;
        const rec = learned.get(l.via);
        if (rec && l.sentIdx >= 0 && l.sentIdx < acts.length) acts[l.sentIdx][OPS.length + ltIdx[rec.key]] += 1;
      }
      return { dims: [...OPS, ...keys], activations: acts };
    },
    get docsSeen() { return docsSeen; },
    get linksSeen() { return linksSeen; },
    snapshot: () => ({ docsSeen, linksSeen, learned: learnedTypes() }),
  });
};
