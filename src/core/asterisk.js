// EO: DEF·EVA·REC(Network,Link → Entity,Void, Dissecting,Binding,Composing) — the ontological asterisk (identity)
// core/asterisk.js — the ontological asterisk: identity held open as a question.
//
// projectGraph has one identity primitive and it is binary: find() puts two ids in
// the same cluster or it does not, and a SYN kind:'merge' collapses them at
// projection time with no record that the collapse was earned, attested, or merely
// guessed. There is no object for the state a reader is in most of the time — these
// two names look like one person and nothing has established that they are. The
// engine already carries a VOID as a first-class event; it is not yet honest about
// identity. The asterisk is the missing object.
//
//   A resolved individual is a Figure         tom-turner.1
//   A name shared across unlinked sources is   tom-turner*   — the relational space
//   across instances bearing that label, identity UNESTABLISHED. The asterisk is the
//   correct EO construal of an unresolved name, not a UI decoration bolted onto it.
//
// Disambiguation is the move from `*` toward Figure, and it has TWO legal outcomes,
// not one: resolve to a single Figure (merge earned) or fork into two Figures (split
// earned). The binder today only knows how to merge, so it rewards verbatim label
// echo over relational correspondence and never produces the split. This module is
// the relational test that replaces the echo.
//
// The disambiguation loop is DEF · EVA · REC run on identity instead of on a fact:
//   DEF  the terms — discriminators that travel with a person (employer, geography,
//        tenure, a co-attesting source). NOT the name; the name is the thing in
//        question and cannot also be the evidence.
//   EVA  test the two clusters against the terms. Each shared discriminator is a CON
//        edge; the merge is licensed by CONVERGENCE of CON edges, never by the label.
//        Conflicting discriminators are positive evidence of two people.
//   REC  restructure on the outcome: collapse `*` to one Figure (convergence), fork
//        it into two (conflict), or do nothing and let the identity void stand as a
//        finding — no source establishes whether these are the same person.
//
// This module is core: it depends on nothing outside core. The relation algebra
// (relation-types.js) is core; the perceiver's idFor is NOT imported — the one-line
// label normalization is duplicated below rather than reaching up into a faculty.

import { attributesConflict } from './relation-types.js';

// normLabel — the identity key (the doc's `norm2`). Deliberately mirrors the
// perceiver's idFor (perceiver/parse/entities.js): lowercase, spaces→'-', strip to
// [a-z0-9-]. Two ids whose human labels normalize to the same form are candidate
// instances of one name; whether they are one PERSON is the question this module
// holds open. Duplicated, not imported, so the core stays dependency-free.
export const normLabel = (label) =>
  String(label ?? '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

// Naming/identity relations are NOT discriminators: the label is the thing in
// question and cannot be its own evidence (directive: "label excluded from the
// count"). An edge on one of these vias is skipped when building the fingerprint.
const NAME_VIAS = new Set(['name', 'alias', 'aka', 'called', 'named', 'is', 'same_as']);

// ── Directive #1 — MEASURE BEFORE BUILDING ───────────────────────────────────
//
// A cheap, read-only pass over a master log: count human labels whose norm2 form is
// borne by ≥2 distinct ids that the FIRM union-find does not already unite. That
// count is the population of latent asterisks the engine renders today as accidental
// separation (namespaced-but-same name across sources) plus accidental paint-
// collision (one id standing in for two people). Build nothing until it is real.
//
// "Firm" means within-source EXAFFERENCE merges only — the same kind:'merge' the
// projection's find() unions — with the cross-source SPECULATION excluded, because
// the speculation is exactly what is being measured. `includeSpeculative:true` folds
// the crossDoc/same_as joins in too, to show how many the current binder collapses.
export const latentAsterisks = (log, { includeSpeculative = false } = {}) => {
  const events = eventsOf(log);
  const retracted = new Set();
  for (const e of events)
    if (e.op === 'SEG' && e.kind === 'retract' && e.refSeq != null) retracted.add(e.refSeq);

  const parent = new Map();
  const find = (x) => { let p = parent.get(x) ?? x; while (p !== (parent.get(p) ?? p)) p = parent.get(p) ?? p; return p; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };

  const labelOf = new Map();   // id → CANONICAL label (first INS wins), one per id

  for (const e of events) {
    if (retracted.has(e.seq)) continue;
    if (e.op === 'INS' && e.id != null) {
      if (!labelOf.has(e.id)) labelOf.set(e.id, e.label ?? e.id);
    } else if (e.op === 'SYN' && e.kind === 'merge') {
      if (includeSpeculative || !e.crossDoc) union(e.from, e.to);   // crossDoc is speculation
    } else if (includeSpeculative && e.op === 'SYN' && e.kind === 'same_as?') {
      union(e.from, e.to);
    }
  }

  // Key each id ONCE by its canonical (first-INS) label, so an entity sighted under
  // several surface forms ("Gregor" then "Gregor Samsa") is not double-counted into
  // two norm2 buckets — the measure is over distinct ids per name, not per mention.
  const idsByNorm = new Map();  // norm2 → Set<id>
  for (const [id, label] of labelOf) {
    const key = normLabel(label);
    if (key) (idsByNorm.get(key) || idsByNorm.set(key, new Set()).get(key)).add(id);
  }

  const groups = [];
  for (const [norm, idset] of idsByNorm) {
    const ids = [...idset];
    if (ids.length < 2) continue;
    const roots = [...new Set(ids.map(find))];
    if (roots.length < 2) continue;            // a firm merge already united them — not latent
    groups.push(Object.freeze({ norm, label: labelOf.get(ids[0]) ?? norm, ids, roots }));
  }
  groups.sort((a, b) => b.roots.length - a.roots.length || a.norm.localeCompare(b.norm));
  return Object.freeze({ count: groups.length, groups: Object.freeze(groups) });
};

// ── The EVA of the disambiguation loop — convergence or conflict ─────────────
//
// discriminatorIndex — the relational fingerprint of every firm cluster: a
// Map<root, Map<via, Set<normTarget>>> over the witnessed CON/SIG edges. Naming
// edges and derived (defeasible) edges are excluded — a discriminator must travel
// with the person and be attested, never be the name itself or a guess.
export const discriminatorIndex = (edges, find, labelFor) => {
  const idx = new Map();
  for (const e of edges || []) {
    if (e.kind !== 'con' && e.kind !== 'sig') continue;
    if (e.derived) continue;                                   // defeasible → not a discriminator
    const via = e.relType || e.via;
    if (!via || NAME_VIAS.has(String(via).toLowerCase())) continue;
    const from = find(e.from);
    const target = normLabel(labelFor(find(e.to)));
    if (!target) continue;
    let m = idx.get(from); if (!m) idx.set(from, (m = new Map()));
    let s = m.get(via);    if (!s) m.set(via, (s = new Set()));
    s.add(target);
  }
  return idx;
};

// evaluateSameAs — test two firm roots against their discriminators (directive #5).
//   'promote' — convergence: ≥ minConvergence shared discriminators (label excluded).
//   'split'   — conflict: a FUNCTIONAL discriminator filled by disjoint targets (a
//               person has one employer; two distinct fillers ⇒ two people).
//   'open'    — neither: the asterisk holds and identity remains a void.
// Conflict dominates convergence — conflicting discriminators are positive evidence
// of two people, not merely the absence of evidence for one.
//
// The conflict semantics are NOT held here: this is the consume side of the spec's
// ID-4 oracle. `attributesConflict` (the typing bridge, injectable via the opt — the
// same discipline as the parser's injected rolesConflict) judges whether two value-
// sets on one via are incompatible; evaluateSameAs only counts the verdicts. A custom
// oracle (or learned functionality, threaded as `functionalVias`) flows straight in.
export const evaluateSameAs = (rootA, rootB,
  { discriminatorsOf, minConvergence = 1, functionalVias = null, attributesConflict: conflictOracle = attributesConflict } = {}) => {
  const A = discriminatorsOf(rootA) || EMPTY;
  const B = discriminatorsOf(rootB) || EMPTY;
  const shared = [];
  const conflicts = [];
  for (const [via, targetsA] of A) {
    const targetsB = B.get(via);
    if (!targetsB) continue;
    const overlap = [...targetsA].filter(t => targetsB.has(t));
    if (overlap.length) { for (const t of overlap) shared.push({ via, target: t }); continue; }
    // same via, disjoint targets — ask the oracle whether the values conflict (a
    // one-valued attribute filled by disjoint fillers, or typed-role disjointness).
    const verdict = conflictOracle(via, [...targetsA], [...targetsB], { functionalVias });
    if (verdict && verdict.conflict > 0)
      conflicts.push({ via, a: [...targetsA], b: [...targetsB], conflict: verdict.conflict, reason: verdict.reason });
  }
  let verdict = 'open';
  if (conflicts.length) verdict = 'split';
  else if (shared.length >= minConvergence) verdict = 'promote';
  return Object.freeze({ verdict, shared: Object.freeze(shared), conflicts: Object.freeze(conflicts) });
};

// ── Directive #6 — the identity frontier (reuse, don't add a subsystem) ──────
//
// The same DEF·EVA·REC machinery the conflict frontier runs, pointed at identity.
// Each OPEN same_as? candidate is a question — "resolve `label*`: find a source
// naming both contexts" — ranked by EXPECTED SURPRISE: the single most belief-moving
// reading is a source that co-attests a discriminator across the two clusters,
// because one such source either collapses the asterisk or, by naming two distinct
// employers in one breath, hardens the split. Discounted by how independently each
// cluster is ALREADY attested: a barely-seen cluster has little belief to move, and
// a lopsided pair (one richly attested, one seen once) is a weaker question than a
// balanced one where a bridge swings the most mass.
export const identityFrontier = (graph, { attestationOf = null } = {}) => {
  const attest = attestationOf || ((root) => graph?.entities?.get?.(root)?.sightings || 1);
  const items = [];
  for (const c of graph?.sameAs || []) {
    const aN = attest(c.a), bN = attest(c.b);
    const score = Math.min(aN, bN) / (1 + Math.abs(aN - bN));   // balanced + well-attested ⇒ high
    const name = c.label || c.norm || c.a;
    items.push(Object.freeze({
      kind: 'identity', a: c.a, b: c.b, label: name, norm: c.norm,
      score, attestation: [aN, bN],
      text: `resolve ${name}* — find a source naming both contexts`,
    }));
  }
  items.sort((x, y) => y.score - x.score);
  return Object.freeze(items);
};

const EMPTY = new Map();
const eventsOf = (log) =>
  typeof log?.snapshot === 'function' ? log.snapshot()
  : Array.isArray(log?.events) ? log.events
  : Array.isArray(log) ? log
  : [];
