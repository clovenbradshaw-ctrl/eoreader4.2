// EO: EVA·CON(Lens,Network → Paradigm,Link, Tracing,Binding) — metacognition + cross-connections
// fold/weave.js — METACOGNITION and CROSS-CONNECTIONS: loops on loops of deep reading.
//
// deep-reading.js is loop 1: when not otherwise busy, the reading surfs to the place of most
// interest, folds it, and deposits a reflection (an enacted EVA, band void, reafferent —
// canWitness false, the firewall). This module adds the two things that make it a NEST rather
// than a single pass:
//
//   METACOGNITION (loop 2) — the reflection ABOUT the reflections. Where deep reading folds the
//     DOCUMENT at its peak, metaReflect folds the reading's OWN reflections (readReflections)
//     and evaluates their pattern: a focus it keeps returning to, a strain it never settles.
//     It is the same EVA operator one grain up — a pattern (SYN grain) over layer:'reflection'
//     events — and it rides the identical firewall (reafferent, band void, canWitness false).
//     Self-terminating and habituating on the PATTERN signature, so it never re-notices the same
//     pattern (the cure for meta-rumination, mirroring deep reading's `visited` on the place).
//
//   CROSS-CONNECTIONS — the CON bond (Relate × Structure, the central operator) between two held
//     interpretations, carried at band void, reafferent, sourced to BOTH endpoints (claim-src on
//     each side), and NEVER upgraded (the no-upgrade discipline of dag/stance.js). Three kinds:
//       • echo     — two reflections that are the SAME proposition (perceiver/proposition-
//                    equivalence, Born-rule gated — no hand threshold). Cross-document echoes are
//                    genuine cross-CORPUS connections: the reading found the same idea in two texts.
//       • bears-on — a reflection whose focus touches a held eo:Tension or eo:Reframing (pure).
//       • analogy  — SAME relational structure, DIFFERENT surface entities (structure-mapping).
//                    The relational-signature seam is defined below; the first cut ships echo +
//                    bears-on, and analogy is the documented next layer.
//
// EPISTEMICS — a meta-reflection and a connection are BOTH reafference (fromEnactor,
// canWitness false). A meta-reflection reads the reading's own prior EVAs but never promotes
// them; a connection links two void nodes and is itself void. Neither can ever witness world,
// and projectGraph skips EVA/CON-at-void — so, exactly like a first-order reflection, they can
// only ever surface as substrate nodes (eo:MetaReflection, eo:Connection), never as depicted facts.
//
// Deterministic, timer-free, DOM-free — the embedder and the surf/structure are injected — so it
// is testable and any product surface (an idle tick) is pure presentation over this state.

import { fromEnactor, canWitness } from '../../core/index.js';
import { attestEquivalenceFrom, structureSurface } from '../../perceiver/index.js';
import { readReflections, buildSubstrate } from './substrate.js';
import { createDeepReader, RESTING, READING } from './deep-reading.js';

export const METACOGNITION = 'metacognition';
export const CONNECTION = 'connection';

const round = (x) => (Number.isFinite(x) ? Math.round(x * 1e4) / 1e4 : x);
const normFocus = (f) => String(f || '').trim().toLowerCase().replace(/\s+/g, ' ');
const logEvents = (doc) =>
  typeof doc?.log?.snapshot === 'function' ? doc.log.snapshot() : (doc?.log?.events || []);

// ── METACOGNITION ────────────────────────────────────────────────────────────────

// buildMetaReflection — the ONE append-only event a metacognitive pass deposits. An EVA (the
// evaluate operator) at the enacted register, one order up (order:2, layer:'metacognition'),
// reafferent (canWitness false — the firewall), band void, grounded false. It is NOT tagged
// reflection:true, so readReflections never folds it back in — loop 2 reads loop 1 only, and
// never itself (no runaway meta-of-meta).
export const buildMetaReflection = ({
  cursor = null, focus = null, pattern, particular = null, verdict = null,
  surprise = null, body = '', sources = [], enactment = METACOGNITION,
} = {}) => {
  const prov = fromEnactor(enactment);
  return Object.freeze({
    op: 'EVA', register: 'enacted', meta: true, order: 2, layer: 'metacognition',
    cursor, sentIdx: cursor, focus, pattern, particular: particular ?? focus,
    verdict, surprise, body: String(body ?? ''),
    sources: Object.freeze([...sources]),
    band: 'void', grounded: false, prov, door: 'enactor',
  });
};

// detectPatterns — the model-free read over the reading's own reflections ("thinking needs no
// model"). Two patterns, both derivable straight off the log:
//   recurring-focus — the reading returned to the same figure ≥ minRecur times.
//   standing-strain — a focus that ONLY ever strained, never confirmed: an open question, or a
//                     place the reading cannot resolve (also the honest rumination tell).
// Each pattern carries a `sig` (its signature) so the loop habituates on the pattern, not the place.
const detectPatterns = (reflections, { minRecur = 2 } = {}) => {
  const byFocus = new Map();
  for (const r of reflections) {
    const f = normFocus(r.focus);
    if (!f) continue;
    if (!byFocus.has(f)) byFocus.set(f, []);
    byFocus.get(f).push(r);
  }
  const out = [];
  for (const [f, group] of byFocus) {
    if (group.length < minRecur) continue;
    const label = group[0].focus;
    const cursors = group.map((r) => r.cursor ?? r.sentIdx).filter(Number.isInteger);
    const strains = group.filter((r) => r.verdict === 'strain').length;
    const confirms = group.filter((r) => r.verdict === 'confirm').length;

    const tail = (strains && !confirms) ? ' and never settled'
      : strains ? `, straining ${strains}× and settling ${confirms}×` : '';
    out.push({
      pattern: 'recurring-focus', sig: `recurring-focus:${f}`, focus: label,
      cursor: cursors[0] ?? null, sources: cursors, strength: round(group.length),
      verdict: strains > confirms ? 'strain' : 'confirm',
      body: `${label}: the reading returned here ${group.length} times${tail}.`,
    });

    if (strains >= minRecur && confirms === 0) {
      out.push({
        pattern: 'standing-strain', sig: `standing-strain:${f}`, focus: label,
        cursor: cursors[0] ?? null, sources: cursors, strength: round(strains + 0.5),
        verdict: 'strain',
        body: `${label}: the reading strains here and never settles (${strains} strains, no confirmation) — an open question, or a place it cannot resolve.`,
      });
    }
  }
  return out;
};

// metaReflect — ONE metacognitive pass. Fold the reading's own reflections, find the strongest
// pattern not already noticed, and (by default) deposit it. Returns null when there is no fresh
// pattern — nothing worth a second-order note → quiesce.
export const metaReflect = (doc, {
  visited = null, minRecur = 2, commit = true, enactment = METACOGNITION,
} = {}) => {
  if (!doc || !doc.log) return null;
  const reflections = readReflections(doc);
  if (reflections.length < minRecur) return null;

  const seen = visited instanceof Set ? visited : new Set(visited || []);
  const fresh = detectPatterns(reflections, { minRecur }).filter((p) => !seen.has(p.sig));
  if (!fresh.length) return null;
  fresh.sort((a, b) => b.strength - a.strength);
  const p = fresh[0];

  const event = buildMetaReflection({
    cursor: p.cursor, focus: p.focus, pattern: p.pattern, verdict: p.verdict,
    surprise: p.strength, body: p.body, sources: p.sources, enactment,
  });
  const appended = commit ? doc.log.append(event) : null;
  return Object.freeze({
    ...p, event: appended || event, committed: !!appended,
    canWitness: canWitness((appended || event).prov),   // false — the firewall, surfaced
  });
};

// createMetaReader — the governed loop over the reading's own reflections, the metacognitive
// sibling of createDeepReader. arrive() runs passes until no fresh pattern remains, habituating
// on the pattern signature so each pattern is noticed at most once. It never spins.
export const createMetaReader = ({ doc, minRecur = 2, enactment = METACOGNITION, maxPasses = 32 } = {}) => {
  if (!doc || !doc.log) throw new Error('createMetaReader: a doc with a log is required');
  let state = RESTING;
  const visited = new Set();
  const metas = [];

  const arrive = () => {
    state = READING;
    const before = metas.length;
    let passes = 0;
    while (state === READING && passes < maxPasses) {
      passes++;
      const r = metaReflect(doc, { visited, minRecur, commit: true, enactment });
      if (!r) { state = RESTING; break; }        // nothing fresh → rest
      visited.add(r.sig);
      metas.push(r);
    }
    if (passes >= maxPasses) state = RESTING;     // never spin
    return { state, passes, metaReflections: metas.slice(before), quiesced: state === RESTING };
  };

  return {
    get state() { return state; },
    get metaReflections() { return metas.slice(); },
    arrive,
    // the firewall as a predicate: a meta-reflection can never ground itself — reafferent by type.
    canGround: (r) => canWitness(r?.event?.prov ?? null),
    isResting: () => state === RESTING,
  };
};

// ── CROSS-CONNECTIONS ──────────────────────────────────────────────────────────────

// buildConnection — the ONE append-only event a cross-connection deposits. A CON (the bond at
// Relate × Structure, the central operator) at the enacted register, reafferent, band void,
// grounded false, sourced to both endpoints. Never firm, never upgraded.
export const buildConnection = ({
  kind, a = null, b = null, aCursor = null, bCursor = null, aDoc = null, bDoc = null,
  sameness = null, boundary = null, body = '', sources = [], enactment = CONNECTION,
} = {}) => {
  const prov = fromEnactor(enactment);
  return Object.freeze({
    op: 'CON', register: 'enacted', connection: true, layer: 'connection',
    kind, a, b, aCursor, bCursor, aDoc, bDoc,
    sameness, boundary, body: String(body ?? ''),
    sources: Object.freeze([...sources]),
    band: 'void', grounded: false, prov, door: 'enactor',
  });
};

// connect — a single fold over the existing reflections (across ONE or MANY documents), emitting
// cross-connections. Naturally terminating: it links what is already on the log, it does not loop.
//   docsIn    a doc, or an array of docs (a corpus). Cross-doc echoes are cross-corpus connections.
//   embedder  INJECTED — must measure meaning (warm MiniLM); a spelling-space embedder holds all
//             (the firewall: a cosine in spelling space measures nothing → no echo asserted).
//   substrate OPTIONAL — the built substrate, so bears-on can link reflections to tensions/reframings.
//   alpha     derive the echo boundary online from the field's own cosines (the Born rule). Or
//   minSim    pass an explicit boundary (the n<4 fallback — a chosen number, honest about it).
//   log/commit  where echoes land: an injected log, else (single doc) that doc's log. commit:false
//               returns the built events without appending.
export const connect = async (docsIn, {
  embedder = null, substrate = null, alpha = 0.01, minSim = null,
  log = null, commit = true, enactment = CONNECTION,
} = {}) => {
  const docs = Array.isArray(docsIn) ? docsIn : [docsIn];
  const single = !Array.isArray(docsIn) || docs.length === 1;

  const items = [];
  for (const d of docs) {
    const docId = d?.docId || d?.id || null;
    for (const r of readReflections(d)) {
      items.push({ docId, cursor: r.cursor ?? r.sentIdx ?? null, focus: r.focus ?? null, body: String(r.body ?? '') });
    }
  }

  const connections = [];
  const home = log || (single ? docs[0]?.log : null);
  const emit = (evt) => {
    const appended = (commit && home && typeof home.append === 'function') ? home.append(evt) : null;
    connections.push(appended || evt);
  };

  // ECHO — reflections that are the same proposition, Born-gated. Cross-doc = cross-corpus.
  let live = false;
  if (items.length >= 2 && embedder?.measuresMeaning) {
    live = true;
    const vectors = [];
    for (const it of items) vectors.push(await embedder.embed(it.body));
    const polarities = items.map(() => '+');
    const { pairs } = attestEquivalenceFrom(vectors, polarities, { minSim, alpha });
    for (const c of pairs) {
      const A = items[c.i], B = items[c.j];
      const crossDoc = A.docId !== B.docId;
      emit(buildConnection({
        kind: 'echo', a: A.cursor, b: B.cursor, aCursor: A.cursor, bCursor: B.cursor,
        aDoc: A.docId, bDoc: B.docId, sameness: round(c.sim), boundary: round(c.boundary),
        body: `the reading found the same idea at ${A.focus || '?'} and ${B.focus || '?'}${crossDoc ? ' across two documents' : ''}.`,
        sources: [A.cursor, B.cursor].filter(Number.isInteger), enactment,
      }));
    }
  }

  // BEARS-ON — a reflection whose focus touches a held tension or a prior reframing (pure).
  if (substrate) {
    for (const it of items) {
      const f = normFocus(it.focus);
      if (!f) continue;
      for (const t of (substrate.tensions || [])) {
        if (normFocus(t.label).includes(f)) {
          emit(buildConnection({
            kind: 'bears-on', a: it.cursor, b: t.id, aCursor: it.cursor, aDoc: it.docId,
            body: `the reflection on ${it.focus} bears on the held tension: ${t.label}`,
            sources: [it.cursor].filter(Number.isInteger), enactment,
          }));
        }
      }
      for (const rf of (substrate.reframings || [])) {
        const touched = (rf.alongAxis || []).some((ax) => normFocus(ax).includes(f));
        if (touched && rf.atSentence != null && it.cursor != null && rf.atSentence <= it.cursor) {
          emit(buildConnection({
            kind: 'bears-on', a: it.cursor, b: rf.id, aCursor: it.cursor, aDoc: it.docId,
            body: `the reflection on ${it.focus} was shaped by the earlier reframing at ${rf.atSentence}.`,
            sources: [it.cursor].filter(Number.isInteger), enactment,
          }));
        }
      }
    }
  }

  return Object.freeze({ connections, live, items: items.length });
};

// ── ANALOGY — structure-mapping across the corpus (the third connection kind) ───────────
//
// Echo connects reflections that are the SAME proposition (content). Analogy is its complement:
// the SAME relational STRUCTURE with DIFFERENT surface entities. "Acme employs Bob, partners Corp,
// … " and "Umbra hires Kane, allies Vortex, … " share no words, but their relation graphs are
// isomorphic — Acme↔Umbra, Bob↔Kane. Gentner's structure-mapping: map by the RELATIONS, ignore the
// objects. So the signal is graph TOPOLOGY, not the edge labels (which are the surface that differs).
//
// The role signature is a label-abstracted Weisfeiler–Lehman refinement: a node's colour starts as
// its directed-degree/polarity profile (labels stripped), then is refined k rounds by the multiset
// of its neighbours' colours. Two nodes with the same refined colour occupy the same structural role.
// A correspondence is asserted only when it is SYSTEMATIC (Gentner) — it participates in a preserved
// relational structure (≥ minSystematic incident edges of A map to real edges of B), never an
// isolated same-degree coincidence. Every analogy is a CON at band void, reafferent, sourced to the
// passages on both sides, and — like every stance in dag/ — never upgraded.

const djb2 = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };

// relationGraph — the directed, polarity-typed relation graph of a document, read off the level-2
// structure surface (the CON/SIG arrows the parser admitted). Labels are kept for display only.
export const relationGraph = (doc) => {
  const idxs = (doc?.units || doc?.sentences || []).map((_, i) => i);
  const s = idxs.length ? structureSurface(doc, idxs) : { relations: [] };
  const nodes = new Map();
  const edges = [];
  for (const r of (s.relations || [])) {
    const sid = r.src?.id, tid = r.tgt?.id;
    if (!sid || !tid) continue;
    if (!nodes.has(sid)) nodes.set(sid, { id: sid, label: r.src.label ?? sid });
    if (!nodes.has(tid)) nodes.set(tid, { id: tid, label: r.tgt.label ?? tid });
    edges.push({ src: sid, tgt: tid, pol: r.polarity === '−' ? '−' : '+', via: r.via ?? null, idx: r.idx ?? null });
  }
  return { nodes, edges };
};

// incidenceOf — each node's incident half-edges (direction + polarity + the other endpoint).
const incidenceOf = ({ nodes, edges }) => {
  const inc = new Map();
  for (const id of nodes.keys()) inc.set(id, []);
  for (const e of edges) {
    inc.get(e.src).push({ dir: 'o', pol: e.pol, other: e.tgt });
    inc.get(e.tgt).push({ dir: 'i', pol: e.pol, other: e.src });
  }
  return inc;
};

// wlColors — the label-abstracted WL role signature per node. Round 0 is the directed-degree/polarity
// profile (surface labels stripped); each further round refines by the sorted multiset of neighbour
// colours. `rounds` deeper than the graph's radius is a no-op, so k=2 covers small relation graphs.
export const wlColors = (graph, rounds = 2) => {
  const inc = incidenceOf(graph);
  const profile = (id) => {
    const prof = {};
    for (const x of inc.get(id)) { const k = x.dir + x.pol; prof[k] = (prof[k] || 0) + 1; }
    return Object.keys(prof).sort().map((k) => `${k}${prof[k]}`).join(',') || '·';
  };
  let color = new Map([...graph.nodes.keys()].map((id) => [id, profile(id)]));
  for (let r = 0; r < rounds; r++) {
    const next = new Map();
    for (const id of graph.nodes.keys()) {
      const nbr = inc.get(id).map((x) => `${x.dir}${x.pol}:${color.get(x.other)}`).sort().join('|');
      next.set(id, djb2(`${color.get(id)}#${nbr}`));
    }
    color = next;
  }
  return color;   // id -> refined WL colour (the structural role)
};

// A short, human role description from a node's round-0 profile — what the shared role IS.
const roleDescOf = (graph, id) => {
  const inc = incidenceOf(graph).get(id) || [];
  const out = inc.filter((x) => x.dir === 'o').length;
  const inn = inc.filter((x) => x.dir === 'i').length;
  const part = (n, verb) => n ? `${verb} ${n}` : '';
  return [part(out, 'relates to'), part(inn, 'is related to by')].filter(Boolean).join(', ') || 'isolated';
};

// analogize — structure-mapping across a corpus. Build each document's relation graph and its WL role
// signatures, pair cross-document nodes that share a role, keep only the SYSTEMATIC correspondences
// (those embedded in a preserved relational structure), and emit an analogy CON for each — band void,
// reafferent, sourced to both sides. Returns the connections and the per-pair correspondence map.
export const analogize = (docsIn, {
  minSystematic = 1, log = null, commit = true, enactment = CONNECTION,
} = {}) => {
  const docs = Array.isArray(docsIn) ? docsIn : [docsIn];
  const single = !Array.isArray(docsIn) || docs.length === 1;
  const graphs = docs.map((d) => {
    const g = relationGraph(d);
    return { docId: d?.docId || d?.id || null, doc: d, ...g, color: wlColors(g) };
  });

  const connections = [];
  const home = log || (single ? docs[0]?.log : null);
  const emit = (evt) => {
    const appended = (commit && home && typeof home.append === 'function') ? home.append(evt) : null;
    connections.push(appended || evt);
  };

  // an edge lookup per graph: does B hold src→tgt with this polarity?
  const edgeSet = (g) => new Set(g.edges.map((e) => `${e.src}>${e.tgt}${e.pol}`));
  // an incident-idx lookup so a correspondence can cite the passage that proposed one of its edges.
  const anyIdx = (g, id) => (g.edges.find((e) => e.src === id || e.tgt === id) || {}).idx ?? null;

  // Every unordered pair of distinct documents (A, B): build φ from role-matched nodes, greedily
  // choosing, within each shared-role class, the B-node that preserves the most of A's edges. One
  // direction suffices — for isomorphic graphs the reverse map is its inverse.
  for (let ai = 0; ai < graphs.length; ai++) {
    for (let bi = ai + 1; bi < graphs.length; bi++) {
      const A = graphs[ai], B = graphs[bi];
      const bByColor = new Map();
      for (const [id, c] of B.color) { if (!bByColor.has(c)) bByColor.set(c, []); bByColor.get(c).push(id); }

      const phi = new Map();               // A.id -> B.id
      const usedB = new Set();
      const bEdges = edgeSet(B);
      const preservedCount = (aId, bId, phiSoFar) => {
        let n = 0;
        for (const e of A.edges) {
          const other = e.src === aId ? e.tgt : e.tgt === aId ? e.src : null;
          if (other == null) continue;
          const bOther = other === aId ? bId : phiSoFar.get(other);   // self-loops aside
          if (!bOther) continue;
          const bSrc = e.src === aId ? bId : phiSoFar.get(e.src);
          const bTgt = e.tgt === aId ? bId : phiSoFar.get(e.tgt);
          if (bSrc && bTgt && bEdges.has(`${bSrc}>${bTgt}${e.pol}`)) n++;
        }
        return n;
      };
      // Assign the highest-degree A-nodes first (they anchor the mapping), unambiguous classes resolve
      // trivially; ambiguous ones pick the B-node maximizing preserved edges given φ so far.
      const aOrder = [...A.nodes.keys()].sort((x, y) =>
        (A.edges.filter((e) => e.src === y || e.tgt === y).length) - (A.edges.filter((e) => e.src === x || e.tgt === x).length));
      for (const aId of aOrder) {
        const cands = (bByColor.get(A.color.get(aId)) || []).filter((b) => !usedB.has(b));
        if (!cands.length) continue;
        let best = cands[0], bestN = -1;
        for (const b of cands) { const n = preservedCount(aId, b, phi); if (n > bestN) { bestN = n; best = b; } }
        phi.set(aId, best); usedB.add(best);
      }

      // Emit the systematic correspondences (those embedded in a preserved structure).
      for (const [aId, bId] of phi) {
        const preserved = preservedCount(aId, bId, phi);
        if (preserved < minSystematic) continue;
        const aNode = A.nodes.get(aId), bNode = B.nodes.get(bId);
        const aEdges = A.edges.filter((e) => e.src === aId || e.tgt === aId).length || 1;
        emit(buildConnection({
          kind: 'analogy', a: aNode.label, b: bNode.label,
          aCursor: anyIdx(A, aId), bCursor: anyIdx(B, bId), aDoc: A.docId, bDoc: B.docId,
          sameness: Math.round((preserved / aEdges) * 1e4) / 1e4,   // the systematicity fraction
          body: `${aNode.label} maps to ${bNode.label} — same relational role (${roleDescOf(A, aId)}); ${preserved} shared relation(s) preserved${A.docId !== B.docId ? ` across ${A.docId} ↔ ${B.docId}` : ''}.`,
          sources: [anyIdx(A, aId), anyIdx(B, bId)].filter((x) => Number.isInteger(x)), enactment,
        }));
      }
    }
  }

  return Object.freeze({ connections, mappings: graphs.length });
};

// ── THE COMPOSED NEST — loops on loops ──────────────────────────────────────────────

// weaveReading — the whole nest in one call: loop 1 (deep reading over the document) → loop 2
// (metacognition over its reflections) → the cross-connections over both. Every product is
// reafferent and held void; the firewall is intact at every level. surf + embedder are injected.
//   corpus  OPTIONAL — the other documents this one sits among. When given, analogy (structure-
//           mapping) runs over the whole corpus and its connections are folded in; without it the
//           nest is single-document (echo/analogy have nothing cross-corpus to find).
export const weaveReading = async (doc, { surf, embedder = null, thread = null, structure = null, corpus = null } = {}) => {
  const deep = createDeepReader({ doc, surf, thread }).arrive({ anchor: 0 });   // loop 1
  const meta = createMetaReader({ doc }).arrive();                              // loop 2
  const reflections = readReflections(doc);
  const substrate = buildSubstrate({ structure: structure || { relations: [], defs: [] }, reflections });
  const woven = await connect(doc, { embedder, substrate });                    // echo + bears-on
  const docs = Array.isArray(corpus) && corpus.length ? corpus : [doc];
  const analogies = analogize(docs, { commit: false });                        // structure-mapping
  return Object.freeze({
    reflections: deep.reflections,
    metaReflections: meta.metaReflections,
    connections: [...woven.connections, ...analogies.connections],
    quiesced: deep.quiesced && meta.quiesced,
  });
};
