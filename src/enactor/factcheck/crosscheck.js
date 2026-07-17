// EO: EVA·SYN(Field,Network,Lens → Lens,Network, Tracing,Composing) — cross-source conflict pass (P3)
// The cross-source veto — the source-vs-source pass the two answer-vetoes never run.
//
// correspond.js (edges) and propositions.js (DEF/office) both grade the ANSWER
// against the sources: is the talker faithful to the record? They are answer-vs-graph
// by construction, so a record whose SOURCES disagree with each other reads as green
// until an answer happens to repeat the disagreement — and even then only if the
// clash is a typed relation. A numeric one ("18,000 homes" in one source, "9,000" in
// another) is neither an edge nor an office, so nothing looked, and the "no conflicts
// on record" banner asserted a consistency it had never checked.
//
// This closes that: read every source's MEASURED quantities, bind each to the figure
// the source is talking about, and ask the one question the answer-vetoes cannot —
// do two SOURCES put a different magnitude on the SAME measure of the SAME subject?
// It is still a correspondence between readings, never a claim against the world: it
// reports that the record contests ITSELF, and it names both witnesses so a reader
// can adjudicate. Like the office channel it only ever FLAGS — a disagreement between
// sources is a finding to surface, never a reason to refuse an answer.
//
//   readQuantities        a sentence → the magnitudes it states, each normalized to a
//                         measure (capacity/homes/co2/jobs/cost/…) and unit.
//   extractQuantities     a source doc → those magnitudes bound to the doc's hottest
//                         referent at each cursor (the fact-checker's document field).
//   crossSourceConflicts  the pass: group by measure; two DIFFERENT sources with a
//                         non-overlapping magnitude on a compatible subject → a conflict.

import { documentFieldAt } from './correspond.js';
import { quantitiesConflict } from '../../core/index.js';
import { readQuantities, measureLabel, isLegibleProse, replacementRatio } from './quantities.js';

// Reading a magnitude out of prose (readQuantities/measureLabel) and judging whether a
// source is prose at all (isLegibleProse) live in ./quantities.js. This file binds each
// magnitude to its subject and runs the cross-source pass over the bound records.

// A measure's MAGNITUDE and a measure's ORDINAL label are different kinds of quantity.
// "45MW" vs "45.2MW" is one fact rounded two ways, so the 5%-of-magnitude default band
// (quantitiesConflict) rightly defers. A calendar year is never a rounding of another —
// "2030" vs "2032" is a two-year slip a reader needs to see, but at a year's own scale
// (~2000) the same 5% band swallows it whole (a ~100-year tolerance). Discrete measures
// get an exact-match band unless the caller overrides it.
const DISCRETE_MEASURES = new Set(['completion']);
export const toleranceFor = (measure, { relTol, absTol }) =>
  DISCRETE_MEASURES.has(measure) ? { relTol: 0, absTol: 0 } : { relTol, absTol };

// ── Binding a magnitude to its subject ───────────────────────────────────────

// The doc's dominant referent — the fallback subject for a sentence whose own field is
// empty. Most-mentioned admitted figure, labelled.
const dominantLabel = (doc) => {
  let best = null, bestN = -1;
  for (const [id, idxs] of (doc?.mentions || new Map())) {
    const n = Array.isArray(idxs) ? idxs.length : (idxs?.size || 0);
    if (n > bestN) { bestN = n; best = id; }
  }
  return best ? (doc?.admission?.labelOf?.(best) || best) : null;
};

// Extract a source doc's magnitudes, each bound to the figure the sentence is about
// (the hottest DOCUMENT referent at that cursor — the same field the fact-checker binds
// a talker's pronoun through). meta carries the source's identity for the citation.
export const extractQuantities = (doc, meta = {}) => {
  if (!doc?.admission) return [];
  const sents = doc.sentences || [];
  // A source of mis-decoded bytes mints no quantities: mining a magnitude out of a
  // binary read as text ("$456", "9,000 MW") is an artifact of the decoder, never a
  // figure a source stated, and comparing it to a real source invents a conflict.
  // Judge the document as a whole — a single garbage line is ambiguous, a binary file
  // is not (isLegibleProse, quantities.js).
  if (!isLegibleProse(sents.join(' '))) return [];
  const domLabel = dominantLabel(doc);
  const source = meta.source ?? meta.sn ?? doc.docId ?? null;
  const out = [];
  for (let i = 0; i < sents.length; i++) {
    // Even inside a legible document, skip a lone mis-decoded line: its replacement
    // chars are unambiguous decode failure, and its stray digits are not a datum.
    if (replacementRatio(sents[i]) > 0.02) continue;
    const qs = readQuantities(sents[i]);
    if (!qs.length) continue;
    const field = documentFieldAt(doc, i);
    const top = field && field[0];
    const subjLabel = (top && doc.admission.labelOf?.(top.id)) || domLabel || null;
    for (const q of qs) {
      // A 'new'-role figure paired (readQuantities' changeId) with an 'old' one in the SAME
      // sentence carries its prior value along, so a witness pick or a matrix cell can print
      // "$120M → $145M" instead of silently discarding what it was revised from.
      let changedFromRaw = null, changedFromValue = null;
      if (q.role === 'new' && q.changeId) {
        const was = qs.find((x) => x.changeId === q.changeId && x.role === 'old');
        if (was) { changedFromRaw = was.raw; changedFromValue = was.value; }
      }
      out.push({
        subj: top?.id ?? null, subjLabel,
        measure: q.measure, value: q.value, unit: q.unit, raw: q.raw,
        role: q.role || null, comparator: q.comparator || null, changedFromRaw, changedFromValue,
        sentIdx: i, text: sents[i],
        source, sourceLabel: meta.label ?? meta.title ?? null, date: meta.date ?? null,
      });
    }
  }
  return out;
};

// ── Subject compatibility ────────────────────────────────────────────────────
//
// Two magnitudes only disagree if they are about the SAME thing. The subject label
// proposes it; a shared non-generic name token disposes. The gate is LENIENT — an
// unresolved subject (null) DEFERS to the measure grouping ("do these sources about
// this project disagree?"), and only a positive name split (two DIFFERENT named
// subjects) blocks a conflict. The honest seam: same-measure figures about genuinely
// different named entities won't false-conflict, but the pass is scoped to a topic
// the reader assembled, not the open web.
const GENERIC = new Set(['the', 'a', 'an', 'this', 'that', 'it', 'its', 'their', 'project',
  'plant', 'array', 'installation', 'facility', 'site', 'company', 'system', 'program', 'programme',
  'proposal', 'development', 'scheme', 'initiative', 'plan', 'new', 'of', 'and']);
const nameTokens = (label) => new Set(
  String(label || '').toLowerCase().replace(/['’]/g, '').split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !GENERIC.has(t)));
export const subjectsCompatible = (a, b) => {
  if (!a || !b) return true;                       // unresolved → defer to the measure scope
  const A = nameTokens(a), B = nameTokens(b);
  if (!A.size || !B.size) return true;             // only generics on a side → defer
  for (const t of A) if (B.has(t)) return true;    // a shared proper token → same subject
  return false;                                    // two distinct named subjects → not a conflict
};

// The subject to name in a conflict — the most frequent non-generic label among its
// witnesses, else the first non-null label.
const subjectOf = (recs) => {
  const tally = new Map();
  for (const r of recs) if (r.subjLabel) tally.set(r.subjLabel, (tally.get(r.subjLabel) || 0) + 1);
  let best = null, bestN = -1;
  for (const [lab, n] of tally) if (n > bestN) { bestN = n; best = lab; }
  return best;
};

// ── The pass ─────────────────────────────────────────────────────────────────
//
// sources: an array of source docs, each a parseText result. An entry may be the bare
// doc, or { doc, source, label, date } carrying the source's registry id + title so a
// conflict cites S-000n, not a raw docId. A composite doc's PARTS should be passed as
// separate entries (unpackComposite recovers them).
//
// Returns { conflicts, counts }. Each conflict:
//   { id, measure, measureLabel, subject, values:[{ value, unit, raw, source, sourceLabel,
//     sentIdx, text }], sources:[id…] }
export const crossSourceConflicts = (sources = [], opts = {}) => {
  const relTol = opts.relTol ?? 0.05, absTol = opts.absTol ?? 0;
  const records = [];
  sources.forEach((s, si) => {
    const doc = s && s.doc ? s.doc : s;
    if (!doc?.admission) return;
    const meta = {
      source: (s && (s.source ?? s.sn)) ?? doc.docId ?? `src${si}`,
      label: (s && (s.label ?? s.title)) ?? null,
      date: (s && s.date) ?? null,
    };
    for (const r of extractQuantities(doc, meta)) records.push(r);
  });

  const byMeasure = new Map();
  for (const r of records) { let a = byMeasure.get(r.measure); if (!a) byMeasure.set(r.measure, a = []); a.push(r); }

  const conflicts = [];
  for (const [measure, recs] of byMeasure) {
    const tol = toleranceFor(measure, { relTol, absTol });
    // Any cross-source, subject-compatible pair that disagrees beyond tolerance?
    let hit = false;
    for (let i = 0; i < recs.length && !hit; i++) {
      for (let j = i + 1; j < recs.length && !hit; j++) {
        const a = recs[i], b = recs[j];
        if (a.source === b.source) continue;                       // one source is not a disagreement
        if (!subjectsCompatible(a.subjLabel, b.subjLabel)) continue;
        if (quantitiesConflict(a.value, b.value, tol).conflict) hit = true;
      }
    }
    if (!hit) continue;
    // Collect one witness per source — first mention, UNLESS a later mention in that same
    // source is flagged 'new' (readQuantities' change-language read, "revised from X to Y"):
    // a revision's CURRENT figure is the source's actual witness, not whichever number the
    // sentence happened to print first. (The reported failure: a PDF stating "revised from
    // $120M to $145M" was witnessed at its stale $120M because first-mention ignored role.)
    const bySource = new Map();
    for (const r of recs) {
      const cur = bySource.get(r.source);
      if (!cur || (r.role === 'new' && cur.role !== 'new')) bySource.set(r.source, r);
    }
    const witnesses = [...bySource.values()];
    // Keep only the witnesses whose subject is compatible with the conflict's subject.
    const subject = subjectOf(witnesses);
    const values = witnesses
      .filter((r) => subjectsCompatible(r.subjLabel, subject))
      .map((r) => ({ value: r.value, unit: r.unit, raw: r.raw, source: r.source,
        sourceLabel: r.sourceLabel, sentIdx: r.sentIdx, text: r.text,
        comparator: r.comparator || null, changedFromRaw: r.changedFromRaw || null }));
    if (new Set(values.map((v) => v.source)).size < 2) continue;   // needs ≥2 distinct sources
    conflicts.push({
      id: `X-${measure}`, measure, measureLabel: measureLabel(measure, values[0]?.unit),
      subject, values, sources: [...new Set(values.map((v) => v.source))],
    });
  }

  return {
    conflicts,
    counts: {
      conflicts: conflicts.length,
      measuresCompared: byMeasure.size,
      quantities: records.length,
      sources: sources.length,
    },
  };
};

// Recover the PART docs of a composite (the pocket universes), each tagged with its
// source identity, so a composite topic doc can be passed straight to the pass. Mirrors
// propositions.js `universesOf`; a non-composite doc is its own single universe.
export const unpackComposite = (doc) => {
  if (!doc?.isComposite) return doc ? [{ doc, source: doc.docId, label: doc.docId }] : [];
  const seen = new Map();
  for (let i = 0; i < (doc.sentences || []).length; i++) {
    const o = typeof doc.origin === 'function' ? doc.origin(i) : null;
    if (o?.doc && !seen.has(o.docId)) seen.set(o.docId, { doc: o.doc, source: o.docId, label: o.doc?.web?.title || o.docId });
  }
  return seen.size ? [...seen.values()] : [{ doc, source: doc.docId, label: doc.docId }];
};
