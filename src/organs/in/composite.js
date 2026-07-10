// EO: SYN·SEG(Network,Entity → Network,Link, Composing,Unraveling) — composite document (multi-doc)
// Composite document — several parsed docs presented as ONE doc on the universal
// contract, so the turn pipeline grounds across a selected SET of documents without
// any stage knowing there is more than one (organs/in/index.js: "docs → a doc").
//
// The design follows the user's two rules for multi-document reading:
//
//   1. Referents are DISTINCT across documents by default. Every entity id is
//      NAMESPACED by its source document (`docId⟟gregor-samsa`), so "Gregor" in one
//      file and "Gregor" in another are two referents until something says otherwise.
//      Within a single document nothing changes — a one-document selection is passed
//      through verbatim (createCompositeDoc returns it untouched).
//
//   2. Cross-document identity is a PROACTIVE, DEFEASIBLE merge. We *try* to merge
//      same-named referents across documents, but the merge is marked `crossDoc` —
//      an ontologically weaker join than a within-document SYN — and `defeasible`,
//      so a later SEG (new data) can split them again. Even merged, PROVENANCE is
//      retained: each member keeps its namespaced id, so `provenanceOf` can always
//      say which document each mention came from.
//
// Everything is a fold over the same append-only logs the single-doc path uses: the
// composite log is the per-document events, namespaced and re-indexed onto a shared
// sentence axis, followed by the cross-document SYN merges. projectGraph folds it
// exactly as before; its union-find performs the merges; a SEG retract undoes one.

import { projectGraph, fromEnactor } from '../../core/index.js';

// The held-identity gate — the same revision flag the rest of the system ships
// experiments behind (speech/index.js RULES_REV). OFF (the default) keeps the
// cross-source binder emitting a hard SYN kind:'merge', byte-identical to today and
// golden-gated. ON, the cross-source same-label case becomes a HELD same_as?
// candidate (core/asterisk.js) — never a union — promoted to a real merge only by
// discriminator CONVERGENCE at projection time, forked to a split by conflict, and
// otherwise left as an asterisk with the identity held as a void. Read once at
// module load, exactly like RULES_REV; overridable per-call for tests and benches.
const HELD_IDENTITY = (typeof process !== 'undefined' && process.env
  && /^(1|true|on)$/i.test(process.env.RULES_REV || '')) || false;

// The namespace separator — U+241F (SYMBOL FOR UNIT SEPARATOR). Outside the entity-id
// charset ([a-z0-9-], see perceiver/parse/entities.js) and outside any filename, so
// `${docId}⟟${id}` round-trips cleanly back to (docId, id) for provenance.
const NS = '␟';
const nsId   = (docId, id) => (id == null ? id : `${docId}${NS}${id}`);
const unNs   = (s) => {
  const i = String(s).indexOf(NS);
  return i < 0 ? { docId: null, id: s } : { docId: String(s).slice(0, i), id: String(s).slice(i + 1) };
};
export const compositeDocIdOf = (namespacedId) => unNs(namespacedId).docId;

// The event fields that carry an entity id and must be namespaced.
const ID_FIELDS = ['id', 'src', 'tgt', 'node', 'from', 'to'];

// Build the namespaced, re-indexed composite event stream for one document, appending
// onto `events`. Returns the per-document localSeq → compositeSeq map so a SEG's
// refSeq can be re-pointed, and the sentence offset is folded into every sentIdx.
const foldDocEvents = (doc, sentOffset, events) => {
  const seqMap = new Map();
  for (const e of doc.log.snapshot()) {
    const copy = { ...e };
    for (const f of ID_FIELDS) if (copy[f] != null) copy[f] = nsId(doc.docId, copy[f]);
    if (copy.sentIdx != null) copy.sentIdx = sentOffset + copy.sentIdx;
    if (copy.refSeq != null && seqMap.has(copy.refSeq)) copy.refSeq = seqMap.get(copy.refSeq);
    copy.docId = doc.docId;            // stamp provenance on every event (the log only had it once)
    copy.seq = events.length;          // re-number onto the composite axis
    seqMap.set(e.seq, copy.seq);
    events.push(copy);
  }
  return seqMap;
};

// Propose cross-document identity across a shared admitted label. Conservative on
// purpose (surface-name match only). With `held` OFF (default) this emits the legacy
// defeasible crossDoc SYN kind:'merge' — a hard union the projection collapses,
// revisable only by a later SEG. With `held` ON it emits the asterisk's held
// SYN kind:'same_as?' instead: a REAFFERENCE proposal (the READER is the one saying
// these two are one) that NEVER enters union-find. The projection holds it as a
// candidate and earns the merge only by discriminator convergence — the fix for a
// binder that rewarded verbatim label echo over relational correspondence. Returns
// the SYN events (not yet sealed onto the log).
export const proposeCrossDocSyn = (parts, { held = HELD_IDENTITY } = {}) => {
  const byLabel = new Map();   // lowercased label → [{ docId, id }]
  for (const { doc } of parts) {
    const admitted = doc.admission?.admitted;
    if (!admitted) continue;
    for (const [label, id] of admitted) {
      const key = String(label).toLowerCase();
      (byLabel.get(key) || byLabel.set(key, []).get(key)).push({ docId: doc.docId, id, label });
    }
  }
  const out = [];
  for (const [, members] of byLabel) {
    // Only across DIFFERENT documents, and only when the name is shared.
    const docs = new Set(members.map(m => m.docId));
    if (docs.size < 2) continue;
    // Chain every later member to the first — the first document's referent is the
    // representative, so its provenance leads and the others fold into it.
    const anchor = members[0];
    for (let i = 1; i < members.length; i++) {
      const m = members[i];
      if (m.docId === anchor.docId) continue;   // within-doc duplicates are the parser's job
      const base = {
        from: nsId(m.docId, m.id), to: nsId(anchor.docId, anchor.id),
        warrant: 'cross-doc-name', crossDoc: true, defeasible: true,
        rebutter: 'distinct-entity-shares-name', label: anchor.label, sentIdx: null,
      };
      out.push(held
        // The held candidate: REAFFERENCE — the reader's proposal, not the world's
        // witness — so the type law itself bars it from witnessing the merge it asks
        // for (core/provenance.js). It is earned by convergence or it is nothing.
        ? { op: 'SYN', kind: 'same_as?', ...base, prov: fromEnactor('cross-doc-identity') }
        : { op: 'SYN', kind: 'merge', ...base });
    }
  }
  return out;
};

// A log-like view over a fixed event array — the read surface projectGraph and the
// retrieval/site passes need (snapshot/length/filter/events/docId), plus append +
// retract so a cross-document merge can be revised (a SEG appended at the end).
const compositeLog = (events, docId) => ({
  id: -1,
  docId,
  get events() { return events; },
  get length() { return events.length; },
  snapshot() { return events.slice(); },
  filter(pred) { return events.filter(pred); },
  last(n = 1) { return events.slice(-n); },
  append(event) {
    const sealed = { ...event, seq: events.length, t: event.t ?? Date.now() };
    events.push(sealed);
    return sealed;
  },
  retract(refSeq, reason) {
    return this.append({ op: 'SEG', kind: 'retract', refSeq, reason });
  },
});

// Combine the per-document conventions: a verb is attributional/copular/etc. if ANY
// source document learned it so (a union of learned norms), relationType by first hit.
const compositeConventions = (parts) => {
  const anyTrue = (method) => (v) => parts.some(p => p.doc.conventions?.[method]?.(v));
  return {
    isAttributionVerb: anyTrue('isAttributionVerb'),
    isAbbreviation:    anyTrue('isAbbreviation'),
    isCopula:          anyTrue('isCopula'),
    isModifier:        anyTrue('isModifier'),
    isPreposition:     anyTrue('isPreposition'),
    isAuxiliary:       anyTrue('isAuxiliary'),
    isRole:            anyTrue('isRole'),
    isFunction:        anyTrue('isFunction'),
    isStarter:         anyTrue('isStarter'),
    relationType: (v) => {
      for (const p of parts) { const t = p.doc.conventions?.relationType?.(v); if (t) return t; }
      return null;
    },
    rules: parts.flatMap(p => p.doc.conventions?.rules || []),
  };
};

// Combine admissions: namespaced ids throughout. `admitted` and `mentions` are unioned
// (mentions re-indexed onto the composite sentence axis); lookups namespace their
// result; reverse lookups (labelOf) strip the namespace and delegate to the owner.
const compositeAdmission = (parts) => {
  const admitted = new Map();   // label → nsId (first document wins a label collision)
  const mentions = new Map();   // nsId → compositeIdx[]
  for (const { doc, offset } of parts) {
    for (const [label, id] of (doc.admission?.admitted || [])) {
      if (!admitted.has(label)) admitted.set(label, nsId(doc.docId, id));
    }
    for (const [id, idxs] of (doc.mentions || doc.admission?.mentions || [])) {
      mentions.set(nsId(doc.docId, id), idxs.map(i => offset + i));
    }
  }
  const ownerOf = (nid) => {
    const { docId } = unNs(nid);
    return parts.find(p => p.doc.docId === docId)?.doc || null;
  };
  return {
    admitted,
    mentions,
    isAdmitted: (label) => parts.some(p => p.doc.admission?.isAdmitted?.(label)),
    idOf: (label) => {
      for (const p of parts) if (p.doc.admission?.isAdmitted?.(label)) return nsId(p.doc.docId, p.doc.admission.idOf(label));
      return undefined;
    },
    labelOf: (nid) => { const { id } = unNs(nid); return ownerOf(nid)?.admission?.labelOf?.(id); },
  };
};

// Combine coref fields by PROVENANCE: a cursor belongs to exactly one source document
// (the composite sentence axis is a concatenation), so read that document's field at
// the local index and namespace the ids. Only fieldGrounded/field are exercised by the
// turn pipeline (the fold's referential confidence); the rest are inert no-ops.
const compositeCoref = (originAt) => {
  const delegate = (method) => (compositeIdx) => {
    const o = originAt(compositeIdx);
    const f = o?.doc.corefField?.[method]?.(o.localIdx);
    return Array.isArray(f) ? f.map(c => ({ ...c, id: nsId(o.doc.docId, c.id) })) : [];
  };
  return {
    field: delegate('field'),
    fieldGrounded: delegate('fieldGrounded'),
    note() {}, noteConversational() {}, reinforce() {},
    noteDescriptor() {}, descriptorState() { return null; },
    unifyDescriptor() { return null; }, bindDescriptorsByElimination() { return []; },
    survivesSubtraction() { return false; },
  };
};

// Build a composite document from several parsed docs. A single document is returned
// untouched (the one-doc path is byte-identical to today). Two or more are folded into
// one doc on the universal contract, with namespaced referents and, by default, the
// cross-document SYN proposals appended.
export const createCompositeDoc = (docs, { crossDocSyn = true, heldIdentity = HELD_IDENTITY } = {}) => {
  const list = (docs || []).filter(Boolean);
  if (list.length === 0) return null;
  if (list.length === 1) return list[0];

  // Per-document placement on the shared sentence axis.
  const parts = [];
  let offset = 0;
  for (const doc of list) {
    const sentences = doc.units || doc.sentences || [];
    parts.push({ doc, docId: doc.docId, offset, count: sentences.length });
    offset += sentences.length;
  }
  const totalUnits = offset;

  // The shared sentence axis + the provenance back-map (compositeIdx → source).
  const sentences = [];
  const tokensBySentence = [];
  const origin = new Array(totalUnits);
  for (const part of parts) {
    const units = part.doc.units || part.doc.sentences || [];
    const toks  = part.doc.tokensBySentence || [];
    for (let i = 0; i < units.length; i++) {
      const ci = part.offset + i;
      sentences[ci] = units[i];
      tokensBySentence[ci] = toks[i] || new Set();
      origin[ci] = { docId: part.doc.docId, localIdx: i, doc: part.doc };
    }
  }
  const originAt = (compositeIdx) =>
    (compositeIdx != null && compositeIdx >= 0 && compositeIdx < origin.length) ? origin[compositeIdx] : null;

  // The composite event stream: namespaced per-doc events, then the cross-doc merges.
  const events = [];
  for (const part of parts) foldDocEvents(part.doc, part.offset, events);
  const crossSyn = crossDocSyn ? proposeCrossDocSyn(parts, { held: heldIdentity }) : [];
  for (const syn of crossSyn) events.push({ ...syn, seq: events.length, t: Date.now() });

  const log = compositeLog(events, parts.map(p => p.docId).join(' + '));

  // Lazy, cached concatenation of each document's sentence embeddings, in axis order.
  // Keyed per embedder organ so the hash→MiniLM retrieval upgrade is not masked by a
  // stale hash-space concatenation (see organs/in/text.js).
  const embByOrgan = new Map();
  const sentenceEmbeddings = async (embedder) => {
    const key = embedder?.id || 'default';
    if (!embByOrgan.has(key)) embByOrgan.set(key, (async () => {
      const out = [];
      for (const part of parts) {
        const vecs = part.doc.sentenceEmbeddings ? await part.doc.sentenceEmbeddings(embedder) : [];
        for (const v of vecs) out.push(v);
      }
      return out;
    })());
    return embByOrgan.get(key);
  };

  const admission = compositeAdmission(parts);

  const doc = {
    isComposite: true,
    docId: parts.map(p => p.docId).join(' + '),
    docIds: parts.map(p => p.docId),
    modality: 'text',
    text: parts.map(p => p.doc.text || '').join('\n\n'),
    sentences,
    units: sentences,
    tokensBySentence,
    log,
    admission,
    mentions: admission.mentions,
    conventions: compositeConventions(parts),
    // Metadata is NOT merged across documents. A shared title or author is a THEORY,
    // not a fact — the same rule the referents follow (Mr. Darcy in one document is not
    // necessarily Mr. Darcy in another). So provenance is RETAINED: each document keeps
    // its own front matter under its docId in `metadataByDoc`, and the flat slot stays
    // EMPTY, asserting no collapsed cross-document metadata. A later proof — a cross-doc
    // SYN, as `proposeCrossDocSyn` does for referents — could unify two documents'
    // metadata, defeasibly; until that proof collapses, they are held apart, and the
    // namespaced holon addresses (`A␟…` vs `B␟…`) show it.
    metadata: {},
    metadataByDoc: parts.map(p => ({ docId: p.doc.docId, metadata: p.doc.metadata || {} })),
    corefField: compositeCoref(originAt),
    sentenceEmbeddings,
    projectGraph: (frame = {}) => projectGraph(log, frame),

    // --- multi-document extras (not part of the single-doc contract) ----------
    // Map a composite sentence index back to its source document + local index, so
    // the UI can highlight a citation in the document it actually came from.
    origin: originAt,
    // The cross-document merges that were proposed (for inspection / the audit).
    crossDocSyn: crossSyn,
    // Provenance of a (possibly merged) referent: every member id with its document,
    // grouped under the graph's representative. Retained THROUGH a merge — the whole
    // point of namespacing. Pass a projected graph to resolve the representative.
    provenanceOf: (representativeId, graph) => {
      const rep = graph?.representative ? graph.representative(representativeId) : representativeId;
      const members = [];
      for (const e of events) {
        if (e.op !== 'INS' || e.id == null) continue;
        const r = graph?.representative ? graph.representative(e.id) : e.id;
        if (r !== rep) continue;
        const { docId, id } = unNs(e.id);
        if (!members.some(m => m.nsId === e.id)) members.push({ nsId: e.id, docId, id, label: e.label });
      }
      return members;
    },
  };
  return doc;
};
