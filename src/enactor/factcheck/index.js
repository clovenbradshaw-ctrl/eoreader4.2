// EO: CON·EVA·SYN(Field,Link,Network → Lens,Link, Binding,Composing) — barrel
// The factcheck holon: the edge-grounding veto — the fact-checker.
//
// Translate the talker's output into EO notation and compare it against the
// graph. Parse the talker's prose into propositions, type each one the way the
// page is typed, and check each claimed edge against the document reading the
// fold built. A claimed edge with no corresponding document edge is unbound in
// the LINK sense, the way an uncited claim is unbound in the NODE sense — the
// veto the invented-location claim slipped past, because the node check looked at
// nodes and the lie was shaped like a link.
//
// The check is a correspondence between two Meant structures: it makes the talker
// faithful to the graph, never the graph faithful to the world. It reuses the SVO
// clause parser, the document referent table, and the centroid classifier, and
// adds the four-way verdict, the geometric relation comparison, and the
// coref-as-proposal mechanism — the talker proposes bindings; document-side
// readers dispose.

export {
  VERDICTS, documentFieldAt, claimedEdges, equativeKinEdges, checkClaim, factCheck,
  CONTRADICTION_REFUSE_FLOOR, contradictionRefuses,
} from './correspond.js';
export {
  NEARNESS_FLOOR, proposeCoref, geometricSecond, corroborateCoref,
} from './coref.js';
// The proposition channel — the DEF/claim-grain veto (the P2 sibling of the edge
// veto). Every proposition the answer asserts is evaluated against the sources'
// own DEF propositions read at the cursor where each sits; a stale exclusive
// office (O'Connell "is a council member" against "Mayor O'Connell") is caught as
// superseded/stale and surfaced, never refused.
export {
  auditPropositions, personClusters, readOffice, personKey, meaningfulSupport,
} from './propositions.js';
// The cross-source veto (P3) — the source-vs-source pass. Where the edge and DEF
// vetoes grade the ANSWER against the sources, this asks whether the SOURCES agree
// with EACH OTHER: two documents that put a different magnitude on the same measure
// of the same subject ("18,000 homes" vs "9,000") are a contradiction the record
// holds within itself, surfaced (never refused) so a "no conflicts" banner can no
// longer assert a consistency nothing checked.
export {
  crossSourceConflicts, extractQuantities, unpackComposite,
  subjectsCompatible, subjectOf, measureTol,
} from './crosscheck.js';
// Text-reading half of the pass — magnitudes and legibility (crosscheck.js splits under
// the god-module ratchet). Re-exported here so the holon's public surface is unchanged.
export {
  readQuantities, readMeasures, readScheduleYears, readMeasuresFlat,
  measureLabel, boundBefore, isLegibleProse, replacementRatio,
} from './quantities.js';
// The cross-source comparison matrix — the whole grid behind the conflict yes/no: one row
// per measured thing, one column per source, each cell opening to the sentence it was read
// from, with a deterministic reading of the spread. Built on the same bound records.
export {
  comparisonMatrix, cellDisplay,
} from './comparison.js';
