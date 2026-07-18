// EO — the Cross-Source Crosswalk Surface (docs/coreference-timeline.md). The ONE new fold the
// spec asks for: composing the reading cursor (position within one document's own telling order,
// `perceiver/referents/index.js`'s log replayed up to a sentence) with the corpus cursor (position
// within the corpus's own ingestion order, generalising `rooms/reader/app/wiki.js`'s
// `topicTieredData()` cross-source label merge into an incremental, per-source fold). Nothing here
// is a new resolution engine — every field on the `Trajectory` this module returns already exists
// on `perceiver/referents/field.js`'s quotient or a document's own referent API; this module is the
// composition of two existing folds that today never run together.
import { foldReferents, referentApiFor } from '../../../perceiver/referents/index.js';
import { TIER } from '../../../core/index.js';
import { createSynonymPromotion } from '../../../enactor/ground/index.js';

const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
const snapshotOf = (doc) => (doc.log.snapshot ? doc.log.snapshot() : doc.log.events);

// Warrants that are authoritative (the reader/model channel) render RESOLVED — settled by an
// explicit assertion, never a mechanical guess. Everything else defaults to MODEL (needs the
// witness channel) unless a promoted synonym pair moves it to ENGINE (§ synonym-promotion.js).
const RESOLVED_WARRANTS = new Set(['reader-assertion', 'reader-distinction', 'user-split']);

// seqCeilingForSentence(doc, sentIdx) → the reading-cursor's seq ceiling: the latest `denotes`
// event whose surface mention lies at or before `sentIdx` in the document's own telling order.
// Merge/split assertions made by the reader/model channel after the seed pass naturally land
// beyond every sentence's ceiling except the whole-document one (sentIdx === Infinity) — exactly
// the "as of reading position" replay `surfer/reason/cursor.js`'s `readGraph(log, { upto })`
// generalises, specialised here to a sentence-indexed position.
export const seqCeilingForSentence = (doc, sentIdx) => {
  if (sentIdx == null || sentIdx === Infinity) return Infinity;
  let ceiling = -1;
  const mentionById = new Map(doc.surfaceMentions().map((m) => [m.id, m]));
  for (const e of snapshotOf(doc)) {
    if (e.op !== 'SYN' || e.kind !== 'denotes') continue;
    const m = mentionById.get(e.from);
    if (m && m.sentIdx <= sentIdx && e.seq > ceiling) ceiling = e.seq;
  }
  return ceiling;
};

// foldReferentsAsOf(doc, upto) → the referent quotient as of a seq ceiling — a plain slice of the
// log handed to the SAME fold (field.js's foldReferents) the live API already uses at "now".
// Memory is a fold, not a stored table (perceiver/referents/index.js's own invariant 6).
export const foldReferentsAsOf = (doc, upto = Infinity) =>
  foldReferents(snapshotOf(doc).filter((e) => e.seq <= upto));

const displayFor = (doc, surfaceIds) => {
  const mentionById = new Map(doc.surfaceMentions().map((m) => [m.id, m]));
  const names = [], others = [];
  for (const sid of surfaceIds) {
    const m = mentionById.get(sid); if (!m) continue;
    (m.form === 'name' ? names : others).push(m.text);
  }
  const uniq = [...new Set(names.length ? names : others)];
  return uniq.slice(0, 3).join(' / ') || '(unnamed referent)';
};

// synonymEdgesAt(doc, refId, upto, { promotion }) — every SynonymEdge (signal model, § the doc)
// touching refId's cluster at the reading-cursor position `upto`. A ref-merge born of a mechanical
// proposal renders MODEL tier unless its label pair has been promoted to a standing ENGINE-tier
// candidate (synonym-promotion.js); a reader/model assertion renders RESOLVED. `contested` is true
// when a later EVA CONTRADICTED stands against the pair without retracting the edge — rendered,
// never hidden (the doc's own "a floor, not a ceiling" discipline).
const synonymEdgesAt = (doc, refId, upto, { promotion } = {}) => {
  const events = snapshotOf(doc).filter((e) => e.seq <= upto);
  const retracted = new Set();
  for (const e of events) if (e.op === 'SEG' && e.kind === 'retract' && e.refSeq != null) retracted.add(e.refSeq);
  const f = foldReferents(events);
  const root = f.rootOf(refId);
  const edges = [];
  for (const e of events) {
    if (e.op !== 'SYN' || (e.kind !== 'ref-merge' && e.kind !== 'ref-split')) continue;
    if (retracted.has(e.seq)) continue;
    const a = f.rootOf(e.from), b = f.rootOf(e.to);
    if (a !== root && b !== root) continue;
    const warrant = e.warrant || (e.kind === 'ref-merge' ? 'proposed-coreference' : 'reader-distinction');
    let tier = RESOLVED_WARRANTS.has(warrant) ? TIER.RESOLVED : TIER.MODEL;
    if (e.kind === 'ref-merge' && tier === TIER.MODEL && promotion?.isPromoted(e.from, e.to)) tier = TIER.ENGINE;
    const contested = events.some((c) => c.op === 'EVA' && c.verdict === 'CONTRADICTED' && c.seq > e.seq &&
      ((c.a === e.from && c.b === e.to) || (c.a === e.to && c.b === e.from)));
    edges.push({ a: e.from, b: e.to, kind: e.kind, tier, warrant,
                 confidence: e.confidence ?? null, seq: e.seq, sourceId: doc.docId, contested });
  }
  return edges;
};

// trajectoryWithinDoc(doc, refId, { reading }) — the READING-CURSOR axis: "as of sentence N, what
// did this document's own telling believe this referent was called and merged with." Scrubbing
// `reading` back un-grows the graph to exactly what the document alone had established by that
// sentence (docs/coreference-timeline.md's Validation § point 3).
export const trajectoryWithinDoc = (doc, refId, { reading = Infinity, promotion } = {}) => {
  const upto = seqCeilingForSentence(doc, reading);
  const f = foldReferentsAsOf(doc, upto);
  const root = f.rootOf(refId);
  const surfaceIds = f.surfacesOf(root);
  const mentionById = new Map(doc.surfaceMentions().map((m) => [m.id, m]));
  const state = {
    id: root,
    display: displayFor(doc, surfaceIds),
    surfaces: surfaceIds.map((sid) => {
      const m = mentionById.get(sid);
      return m ? { id: sid, text: m.text, sentIdx: m.sentIdx, sourceId: doc.docId } : { id: sid, sourceId: doc.docId };
    }),
    status: surfaceIds.length ? 'firm' : 'held',
  };
  const edges = synonymEdgesAt(doc, refId, upto, { promotion });
  return { refId, at: { reading, corpus: doc.docId }, state, edges };
};

// crosswalkCorpus(sources, opts) — the CORPUS-CURSOR axis: generalises topicTieredData()'s
// per-source cross-label merge into an incremental fold over an ORDERED source list, folded up to
// `corpus` sources (Infinity for the whole corpus). `sameReferent(labelA, labelB)` is the witness
// channel this needs when two labels are NOT the same spelling ("the housing trust" vs "the
// Barnes Fund") — injected rather than hard-coded, exactly as resolution-spectrum.js's MODEL tier
// requires meaning, not a lexical-similarity threshold (a non-goal, § the doc). A promoted pair
// (synonym-promotion.js) short-circuits the witness call — the engine tier checking deterministically
// what the model tier had to read meaning for the first time.
//
// sources: [{ id, doc, t }], doc built with referentIdentity:'mention', in ingestion order.
// Returns { nodes, labelShifts, promotion } — nodes carry the crosswalk's opaque `xref-N` ids
// (never a slug of a label, the same discipline referents/index.js's invariant 2 keeps for a
// single document); labelShifts are the discrete "dominant label changed" ticks (§ the doc's
// "The label-shift signal") — a marker layered on the trace, never folded into it.
export const crosswalkCorpus = (sources, { corpus = Infinity, sameReferent = (a, b) => norm(a) === norm(b),
                                            promotion = createSynonymPromotion() } = {}) => {
  const n = Math.max(0, Math.min(corpus, sources.length));
  const nodes = [];
  const labelShifts = [];
  let minted = 0;
  const mint = () => `xref-${++minted}`;

  for (let i = 0; i < n; i++) {
    const { id: sourceId, doc, t = 0 } = sources[i];
    // referentApiFor builds the referent quotient LAZILY when the parse-time flag never ran
    // (the normal case for an app-ingested doc) — the same shared entry point entities.js's
    // explorer reads, so the crosswalk stops silently reading [] for a doc no caller has ever
    // asked to build the quotient for yet (was: `doc.referents ? doc.referents() : []`).
    const api = referentApiFor(doc);
    const refs = (api ? api.referents() : []).filter((r) => r.status === 'firm');
    for (const r of refs) {
      const label = r.display;
      const mentions = r.surfaces.length;
      let hit = null;
      for (const node of nodes) {
        if (norm(node.rootLabel) === norm(label) || node.bySource.has(`${sourceId}#${norm(label)}`)) { hit = node; break; }
        if (promotion.isPromoted(node.rootLabel, label) || sameReferent(node.rootLabel, label)) { hit = node; break; }
      }
      if (!hit) {
        hit = { id: mint(), rootLabel: label, dominant: label, mentions: 0, t: 0,
                sourceIds: new Set(), bySource: new Map() };
        nodes.push(hit);
      } else if (norm(hit.rootLabel) !== norm(label)) {
        promotion.corroborate(hit.rootLabel, label, { id: sourceId, host: sourceId });
      }
      hit.mentions += mentions;
      hit.sourceIds.add(sourceId);
      hit.bySource.set(`${sourceId}#${norm(label)}`, { label, mentions, sourceId });
      hit.t = hit.t > 0 ? Math.min(hit.t, t) : t;

      // The label-shift signal: the dominant label (plurality of cumulative mentions, per
      // "The label-shift signal" §) diffed as the corpus cursor advances one source at a time.
      let best = null;
      for (const v of hit.bySource.values()) if (!best || v.mentions > best.mentions) best = v;
      if (best.label !== hit.dominant) {
        labelShifts.push({ corpus: i, refId: hit.id, from: hit.dominant, to: best.label, sourceId });
        hit.dominant = best.label;
      }
    }
  }
  return {
    nodes: nodes.map((n2) => ({ id: n2.id, label: n2.dominant, mentions: n2.mentions,
                                 t: n2.t, sourceIds: [...n2.sourceIds] })),
    labelShifts,
    promotion,
  };
};

// installTrajectory(appCtx) — wires the fold into the reader app's session, the same install(ctx)
// shape every rooms/reader/app/*.js section uses. `crosswalk()` keeps ONE synonym-promotion ledger
// for the session's lifetime (a corpus-scoped, learned register — not a per-call, per-document one).
export const installTrajectory = (appCtx) => {
  const promotion = createSynonymPromotion();

  const trajectory = (docId, refId, { reading = Infinity } = {}) => {
    const doc = appCtx.docFor ? appCtx.docFor(appCtx.sourceBySn ? appCtx.sourceBySn(docId) : docId) : null;
    if (!doc) return null;
    return trajectoryWithinDoc(doc, refId, { reading, promotion });
  };

  // orderedSources(srcsOverride) — the corpus's own ingestion order, each carrying its doc and
  // its "earliest recording" time (the SAME reading topicTieredData's node.t already uses, via
  // appCtx.srcTimeMs — never a second copy of that clock).
  const orderedSources = (srcsOverride) => {
    const srcs = srcsOverride || (appCtx.topicSources ? appCtx.topicSources() : []);
    return srcs.map((src) => {
      const doc = appCtx.docFor ? appCtx.docFor(src) : null;
      return doc ? { id: src.sn ?? src.docId, doc, t: appCtx.srcTimeMs ? appCtx.srcTimeMs(src) : 0, src } : null;
    }).filter(Boolean);
  };

  const crosswalk = (srcsOverride, { corpus = Infinity, sameReferent } = {}) =>
    crosswalkCorpus(orderedSources(srcsOverride), { corpus, sameReferent, promotion });

  // crosswalkTieredData(srcsOverride) — the crosswalk shaped for mountTieredGraph, reusing the
  // EXACT node/edge vocabulary topicTieredData() already draws (tier 0 source, tier 1 merged
  // referent, tier 2 claim) so tiered-graph.js needs no new primitive, per the spec's Rendering §.
  // Its two ALREADY-EXISTING scrub axes carry the spec's two cursors with no code change there:
  // the fold cursor (state.cursor) is the corpus's own discovery order; the time axis, folded at
  // the 'sequence' grain over each node's earliest-recording `t`, unfolds one band per source in
  // ingestion order — literally the corpus cursor `surfer/fold/time-axis.js` already generalises.
  // Each label-shift tick (§ "The label-shift signal") renders as a tier-2 claim off the referent
  // it belongs to, the same "ranked/witnessed" reuse the spec asks the defs panel to make.
  const crosswalkTieredData = (srcsOverride, { sameReferent } = {}) => {
    const sources = orderedSources(srcsOverride);
    const { nodes: xnodes, labelShifts } = crosswalkCorpus(sources, { sameReferent, promotion });
    const srcById = new Map(sources.map((s) => [s.id, s]));
    const nodes = [], edges = [], seen = new Set();
    const push = (id, tier, label, kind, t = 0) => { if (!seen.has(id)) { seen.add(id); nodes.push({ id, tier, label, kind, terrain: 'Entity', t }); } };
    for (const n of xnodes) {
      push(n.id, 1, n.label, 'entity', n.t);
      for (const sid of n.sourceIds) {
        const s = srcById.get(sid);
        const srcNodeId = `src:${sid}`;
        push(srcNodeId, 0, (s?.src?.title || s?.src?.reg || String(sid)), 'source', s ? s.t : 0);
        edges.push({ a: srcNodeId, b: n.id, tier: 0, gl: '●', code: 'INS' });
      }
    }
    const shiftsByRef = new Map();
    for (const s of labelShifts) { const arr = shiftsByRef.get(s.refId) || []; shiftsByRef.set(s.refId, arr); arr.push(s); }
    for (const [refId, shifts] of shiftsByRef) shifts.forEach((s, i) => {
      const cid = `shift:${refId}:${i}`, srcNode = srcById.get(s.sourceId);
      push(cid, 2, `"${s.from}" → "${s.to}"`, 'claim', srcNode ? srcNode.t : 0);
      edges.push({ a: refId, b: cid, tier: 2, gl: '⊢', code: 'DEF' });
    });
    return { nodes, edges };
  };

  Object.assign(appCtx, { trajectory, crosswalk, crosswalkTieredData, synonymPromotion: promotion });
};
