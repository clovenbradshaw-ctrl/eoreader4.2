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

// ── Reading a magnitude out of prose ─────────────────────────────────────────
//
// The parser (perceiver/parse) types COPULAR DEFs and SVO edges; a measured quantity
// rides inside an object NP ("power 18,000 homes", "an 80MW installation") and never
// becomes a structured tuple, so this reads it directly. Open-vocabulary in (any
// number + any trailing unit/noun), a small CLOSED set of measures out — the same
// discipline the relation algebra follows: extraction stays open, the comparison
// operates on the projection so two sources' "homes" land on one measure key.

// Scale words are multipliers on the bare number, distinct from units.
const SCALE = Object.freeze({
  thousand: 1e3, k: 1e3, million: 1e6, mn: 1e6, m: 1e6, billion: 1e9, bn: 1e9, b: 1e9, trillion: 1e12,
});

// Each rule tests the window AFTER the number (lowercased). `measure` is the closed
// key two sources must share to be comparable; `unit` is what the value is carried in;
// `mul` normalizes a same-measure unit to the group's canonical one (GW→MW, kW→MW) so
// 0.08 GW and 80 MW compare as one capacity, never two.
const UNIT_RULES = Object.freeze([
  { re: /^\s*-?\s*(?:gw|gigawatts?)\b/,                                                    measure: 'capacity', unit: 'MW', mul: 1000 },
  { re: /^\s*-?\s*(?:kw|kilowatts?)\b/,                                                     measure: 'capacity', unit: 'MW', mul: 0.001 },
  { re: /^\s*-?\s*(?:mw|megawatts?|megawatt)\b/,                                            measure: 'capacity', unit: 'MW' },
  { re: /^\s*-?\s*(?:metric\s+)?(?:tons?|tonnes?)\s+of\s+(?:co2|co₂|carbon(?:\s+dioxide)?|emissions)\b/, measure: 'co2', unit: 'tons' },
  { re: /^\s*-?\s*(?:tons?|tonnes?)\b/,                                                     measure: 'tonnage', unit: 'tons' },
  { re: /^\s*(?:homes?|households?)\b/,                                                     measure: 'homes', unit: 'homes' },
  { re: /^\s*(?:jobs?|positions?|roles?)\b/,                                                measure: 'jobs', unit: 'jobs' },
  { re: /^\s*(?:acres?)\b/,                                                                 measure: 'acres', unit: 'acres' },
  { re: /^\s*(?:megawatt-hours?|mwh)\b/,                                                    measure: 'energy', unit: 'MWh' },
]);

// A quantity's measure label for display ("capacity" → "capacity (MW)", "co2" → "CO₂").
export const measureLabel = (measure, unit) => {
  const M = { capacity: 'capacity', homes: 'homes powered', co2: 'CO₂ reduction', jobs: 'jobs',
    cost: 'cost', acres: 'acreage', energy: 'annual output', tonnage: 'tonnage', percent: 'share' };
  const base = M[measure] || measure;
  return unit && unit !== measure ? `${base} (${unit})` : base;
};

// Read the magnitudes a stretch of text states. Returns [{ value, unit, measure, raw }].
// A number with no recognizable measure is DROPPED (a bare "2021", a footnote "[3]"): an
// ungoverned magnitude has nothing to be compared against, and guessing one would invent
// a conflict, the very failure this module exists to avoid.
export const readQuantities = (text) => {
  const s = String(text || '');
  const out = [];
  // $?  then either comma-grouped (18,000 / 1,234,567) or plain (80 / 2.5 / 18000).
  const re = /(\$)?\s*(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?!\d)/g;
  let m;
  while ((m = re.exec(s))) {
    const dollar = !!m[1];
    let value = parseFloat(m[2].replace(/,/g, ''));
    if (!Number.isFinite(value)) continue;
    const after = s.slice(re.lastIndex).toLowerCase();
    const sc = after.match(/^\s*(thousand|million|billion|trillion|bn|mn)\b/);
    const scaleMul = sc ? (SCALE[sc[1]] || 1) : 1;
    const afterScale = sc ? after.slice(sc[0].length) : after;
    let unit = null, measure = null;
    for (const u of UNIT_RULES) {
      if (u.re.test(afterScale)) { measure = u.measure; unit = u.unit; if (u.mul) value *= u.mul; break; }
    }
    value *= scaleMul;
    // A dollar sign names the measure regardless of a trailing noun ("$2.5 billion").
    if (dollar) { measure = 'cost'; unit = 'USD'; }
    if (!measure) continue;
    out.push({ value, unit, measure, raw: `${dollar ? '$' : ''}${m[2]}${sc ? sc[0].replace(/\s+/g, ' ') : ''}`.trim() });
  }
  return out;
};

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
  const domLabel = dominantLabel(doc);
  const source = meta.source ?? meta.sn ?? doc.docId ?? null;
  const out = [];
  for (let i = 0; i < sents.length; i++) {
    const qs = readQuantities(sents[i]);
    if (!qs.length) continue;
    const field = documentFieldAt(doc, i);
    const top = field && field[0];
    const subjLabel = (top && doc.admission.labelOf?.(top.id)) || domLabel || null;
    for (const q of qs) out.push({
      subj: top?.id ?? null, subjLabel,
      measure: q.measure, value: q.value, unit: q.unit, raw: q.raw,
      sentIdx: i, text: sents[i],
      source, sourceLabel: meta.label ?? meta.title ?? null, date: meta.date ?? null,
    });
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
const subjectsCompatible = (a, b) => {
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
    // Any cross-source, subject-compatible pair that disagrees beyond tolerance?
    let hit = false;
    for (let i = 0; i < recs.length && !hit; i++) {
      for (let j = i + 1; j < recs.length && !hit; j++) {
        const a = recs[i], b = recs[j];
        if (a.source === b.source) continue;                       // one source is not a disagreement
        if (!subjectsCompatible(a.subjLabel, b.subjLabel)) continue;
        if (quantitiesConflict(a.value, b.value, { relTol, absTol }).conflict) hit = true;
      }
    }
    if (!hit) continue;
    // Collect one witness per source (first mention), so the finding shows the full spread.
    const bySource = new Map();
    for (const r of recs) if (!bySource.has(r.source)) bySource.set(r.source, r);
    const witnesses = [...bySource.values()];
    // Keep only the witnesses whose subject is compatible with the conflict's subject.
    const subject = subjectOf(witnesses);
    const values = witnesses
      .filter((r) => subjectsCompatible(r.subjLabel, subject))
      .map((r) => ({ value: r.value, unit: r.unit, raw: r.raw, source: r.source,
        sourceLabel: r.sourceLabel, sentIdx: r.sentIdx, text: r.text }));
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
