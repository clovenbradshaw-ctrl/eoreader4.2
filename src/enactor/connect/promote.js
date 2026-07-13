// EO: CON·EVA·INS(Field,Link,Network → Link,Lens,Entity, Binding,Tracing,Making) — the promotion gate
// The VERIFY half of the connective loop (murmur/link is the POINT half). murmur nominates a
// candidate connection between two reading loci; this module decides what — if anything — the graph
// should learn from it, and produces the event to append. It is PURE (a doc resolver + the candidate
// in, an event out) so it is testable without the DOM idle governor that drives it (app.js).
//
// The one rule (spec §9 firewall, restated as the §8 provenance type law): murmur POINTS, the
// DOCUMENT witnesses. A candidate is reafferent (canWitness===false); it can never assert a fact on
// its own say-so. Two outcomes:
//
//   Tier 2 — a document-CORROBORATED connection. A relation the reader already extracted at the
//            `from` locus, whose entity RECURS at the `to` locus, and which checkClaim confirms
//            against the EXAFFERENT witness set. Written as a real CON edge, carrying the earned
//            citation + `nominatedBy:'murmur'`. Reafferent-doored (grounded by CITATION, never a
//            self-witness), so it enters the graph as a fact but can never launder itself into the
//            witness set of a later claim — exactly as factCheck's exafferent split guarantees.
//   Tier 1 — the echo, held OPEN. A firewalled EVA/void margin note (buildReflection, the same
//            template a deep-reading reflection uses): grounded:false, canWitness:false, and
//            projectGraph deliberately skips EVA so it can never be mistaken for a fact. This is
//            "the app murmuring as it reads" — surfaced in the monologue, asserted nowhere.
//
// checkClaim's symbolic corroboration (checkRelationAgree) is embedder-free, so Tier 2 works at
// idle with NO live classifier — a typed relation (kinship/motion/possession/…) corroborates
// deterministically. A CONTRADICTED relation is never promoted, even to Tier 1's note's exclusion:
// the note still fires (the reading DID echo), but no CON is written.

import { checkClaim } from '../factcheck/correspond.js';
import { VERDICTS, projectGraph } from '../../core/index.js';
import { canWitness, fromEnactor } from '../../core/provenance.js';
import { buildReflection } from '../../surfer/fold/deep-reading.js';

export const CONNECT_ENACTMENT = 'murmur-connect';
const WINDOW = 2;   // sentences either side of a locus counted as "at" it (loci are fold assemblies)

const within = (idx, sentIdxs, w = WINDOW) => {
  if (!Number.isInteger(idx) || !Array.isArray(sentIdxs)) return false;
  for (const s of sentIdxs) if (Number.isInteger(s) && Math.abs(idx - s) <= w) return true;
  return false;
};

// The exafferent-only witness view (core/provenance §8), mirroring factCheck's split: a reafferent
// edge — a prior murmur-connective, or the reasoning walk's reach — can ORIENT but never WITNESS.
// This is what stops a murmur edge self-corroborating a later murmur claim.
const witnessView = (graph) => {
  if (!graph) return graph;
  const all = graph.edges || [];
  const ex = all.filter((e) => canWitness(e.prov ?? null));
  return ex.length === all.length ? graph : Object.freeze({ ...graph, edges: Object.freeze(ex) });
};

const labelOf = (graph, id) => graph?.entities?.get?.(id)?.label ?? id;

// A doc may carry its own memoised `projectGraph` (organs/in/text.js) or just a `.log` (the raw
// parser doc). Resolve the graph either way so the gate works against whatever the idle governor holds.
const graphOf = (doc, frame) =>
  (typeof doc?.projectGraph === 'function') ? doc.projectGraph(frame)
  : (doc?.log ? projectGraph(doc.log, frame) : null);

// promoteConnection(candidate, { docFor, classifier?, adjacency?, enactment? })
//   docFor(docId) → the doc (with .projectGraph / .sentences / .log) for a locus, or null
// Returns { tier, event?, docId?, verdict?, reason }. `event` is READY for docFor(docId).log.append.
//   tier 2 → a CON connection edge (append it; it becomes graph + prosifiable content)
//   tier 1 → an EVA/void reflection (append it; it surfaces in the monologue, asserts nothing)
//   tier 0 → nothing to write (from-doc unavailable, or a locus points at itself)
export const promoteConnection = async (
  candidate,
  { docFor, classifier = null, adjacency = null, enactment = CONNECT_ENACTMENT } = {},
) => {
  const from = candidate?.from, to = candidate?.to;
  if (!from || !to || typeof docFor !== 'function') return { tier: 0, reason: 'no-loci' };
  // A locus that recognizes ITSELF (same doc + same cursor) is noise, not a connection.
  if (from.docId === to.docId && from.cursor != null && from.cursor === to.cursor) return { tier: 0, reason: 'self-loop' };

  const docFrom = docFor(from.docId);
  if (!docFrom || (typeof docFrom.projectGraph !== 'function' && !docFrom.log)) return { tier: 0, reason: 'from-doc-unavailable' };

  const cursor = Number.isInteger(from.cursor) ? from.cursor : (Array.isArray(from.sentIdxs) ? from.sentIdxs[0] : Infinity);
  const graph = graphOf(docFrom, { cursor });
  if (!graph) return { tier: 0, reason: 'no-graph' };
  const witnessed = witnessView(graph);
  const rep = graph.representative || ((id) => id);

  // The connection is checkable when a WITNESSED entity is shared across the two loci — the reader
  // admitted the same figure at both. Cross-doc echoes (different graphs, non-comparable ids) can't
  // be verified this way yet, so they fall to Tier 1 (a documented first-cut limit).
  const sameDoc = !!from.docId && from.docId === to.docId;
  // Edges STRICTLY at one locus — at it, and NOT in the other locus's window. Two nearby loci whose
  // windows overlap are the same reading, not a connection between passages; excluding the overlap
  // zone means an edge can never evidence a "connection" to itself.
  const atFrom = (idx) => within(idx, from.sentIdxs) && !(sameDoc && within(idx, to.sentIdxs));
  const atTo   = (idx) => within(idx, to.sentIdxs) && !(sameDoc && within(idx, from.sentIdxs));
  const witnessedEdges = (graph.edges || []).filter((e) => canWitness(e.prov ?? null));
  const fromEdges = witnessedEdges.filter((e) => atFrom(e.sentIdx));
  const toEdges   = sameDoc ? witnessedEdges.filter((e) => atTo(e.sentIdx)) : [];
  const toEntities = new Set(toEdges.flatMap((e) => [rep(e.from), rep(e.to)]));

  // The Tier-2 write is a CON that says: this relation, read here, connects back to the earlier
  // passage — witnessed by the document, nominated by murmur. Two witness paths, both requiring the
  // shared subject to actually appear at BOTH loci (that is what makes it a CONNECTION, not a lone
  // edge). checkClaim is the contradiction guard on either: a relation the document also DENIES
  // (a VOID, a disjoint kinship axiom) is never promoted.
  if (sameDoc && fromEdges.length && toEdges.length) {
    const via = (e) => String(e.via || '').toLowerCase();
    const pair = (e) => [rep(e.from), rep(e.to)];
    const unordered = (a, b) => (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);
    // Primary: a VERBATIM recurrence — the same relation between the same figures at both loci. The
    // strongest, embedder-free witness of an echo; no relation typing needed.
    // Fallback: a from-edge whose subject recurs at the to-locus AND checkClaim corroborates the
    // relation against the document (the kinship/social algebra, or a live classifier if present).
    for (const e of fromEdges) {
      const pe = pair(e);
      const recurs = toEdges.find((te) => unordered(pair(te), pe) && via(te) === via(e));
      const shared = toEntities.has(pe[0]) ? pe[0] : (toEntities.has(pe[1]) ? pe[1] : null);
      if (!recurs && !shared) continue;
      const claim = {
        sentence: docFrom.sentences?.[e.sentIdx] ?? '',
        op: 'CON', src: e.from, tgt: e.to, via: e.via || null, resolved: true,
      };
      const v = await checkClaim(claim, { doc: docFrom, graph: witnessed, classifier, adjacency });
      if (v.verdict === VERDICTS.CONTRADICTED) continue;                   // never promote a denied relation
      const grounded = !!recurs || v.verdict === VERDICTS.CORROBORATED;    // recurrence, or the algebra agrees
      if (!grounded) continue;
      const witnessIdx = recurs ? recurs.sentIdx : (v.sentIdx ?? e.sentIdx);
      const event = Object.freeze({
        op: 'CON', src: e.from, tgt: e.to, via: e.via || null,
        sentIdx: e.sentIdx,
        citation: (witnessIdx != null) ? `s${witnessIdx}` : (v.citation || null),
        nominatedBy: 'murmur',                     // the new provenance field — WHAT pointed here
        connection: true,                          // a murmur connective edge (consumers may key on it)
        echoes: Object.freeze({ from, to, sharedLabel: labelOf(graph, shared ?? pe[0]), recurrence: !!recurs }),
        prov: fromEnactor(enactment),              // reafferent — grounded by CITATION, never a self-witness
      });
      return { tier: 2, event, docId: from.docId, verdict: v, shared: shared ?? pe[0] };
    }
  }

  // Tier 1: the echo, held open — a firewalled EVA/void margin note (buildReflection). It names the
  // figure the reading circled here and the earlier passage it echoes; asserts nothing.
  const focusLabel = fromEdges.length ? labelOf(graph, rep(fromEdges[0].from)) : null;
  const body = candidate.phrase
    || (focusLabel ? `${focusLabel} — reads like an earlier passage` : 'reads like an earlier passage');
  const cur = Number.isInteger(from.cursor) ? from.cursor : (Array.isArray(from.sentIdxs) ? (from.sentIdxs[0] ?? 0) : 0);
  const event = buildReflection({
    cursor: cur, focus: focusLabel, body,
    sources: [from, to].map((l) => ({ docId: l.docId ?? null, sentIdx: (l.cursor ?? (Array.isArray(l.sentIdxs) ? l.sentIdxs[0] : null)) })),
    enactment,
  });
  return { tier: 1, event, docId: from.docId };
};
