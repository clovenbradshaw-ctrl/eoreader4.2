// EO: EVA·SYN(Field,Network,Lens → Lens,Network, Tracing,Composing) — the comparison matrix
// The wider read the cross-source pass (crosscheck.js) earns for free. crossSourceConflicts
// only ever reports a MEASURE two sources disagree on — the honest scope for a
// refusal-adjacent veto, but it means a reader can only see the record CONTESTING itself,
// never the record CORROBORATING itself (every source naming the same budget), and never a
// measure only one source happens to state. comparisonMatrix is that wider read: every
// measure ANY source states, one row per (measure, subject), one cell per source —
// agreement, disagreement, and a lone witness all rendered, because a reader deciding
// whether to trust a figure needs to see it was stated once as much as they need to see it
// was contested. Split out under the god-module ratchet (no file over ~250 lines), the same
// reason quantities.js split out of this file's sibling, crosscheck.js.
import { quantitiesConflict } from '../../core/index.js';
import { measureLabel } from './quantities.js';
import { extractQuantities, subjectsCompatible, toleranceFor } from './crosscheck.js';

// `reading` is a short, deterministic gloss — 'Revised upward/downward', 'Sources disagree',
// or 'Consistent across sources' — never a generated sentence, so it never asserts more than
// the extracted values license. A single witness gets no reading at all: "consistent" is a
// claim about TWO OR MORE readings agreeing, never something to assert of one.
const readingFor = (cells, tol) => {
  const changed = cells.find((c) => c.changedFromRaw != null && Number.isFinite(c.changedFromValue));
  if (changed) return changed.value > changed.changedFromValue ? 'Revised upward' : changed.value < changed.changedFromValue ? 'Revised downward' : 'Revised';
  if (cells.length < 2) return null;
  for (let i = 0; i < cells.length; i++)
    for (let j = i + 1; j < cells.length; j++)
      if (quantitiesConflict(cells[i].value, cells[j].value, tol).conflict) return 'Sources disagree';
  return 'Consistent across sources';
};

// sources: same shape crossSourceConflicts takes — a bare doc, or { doc, source, label,
// date }; a composite doc's PARTS should be passed as separate entries (unpackComposite).
//
// Returns { rows, counts }. Each row:
//   { id, measure, measureLabel, subject, cells:[{ source, sourceLabel, value, unit, raw,
//     comparator, changedFromRaw, changedFromValue, sentIdx, text }], reading }
export const comparisonMatrix = (sources = [], opts = {}) => {
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

  const rows = [];
  for (const [measure, recs] of byMeasure) {
    // Cluster by subject compatibility (crosscheck's own gate, reused): a shared non-generic
    // name token merges two records into one row; an unresolved subject defers into whatever
    // cluster is open; two positively DIFFERENT named subjects split into separate rows —
    // "the Riverside Solar Project" and "the Oakdale Wind Farm" never share a row.
    const clusters = [];
    for (const r of recs) {
      let cl = clusters.find((c) => subjectsCompatible(c.subject, r.subjLabel));
      if (!cl) { cl = { subject: r.subjLabel, recs: [] }; clusters.push(cl); }
      else if (!cl.subject && r.subjLabel) cl.subject = r.subjLabel;
      cl.recs.push(r);
    }
    for (const cl of clusters) {
      // One cell per source — first mention, unless a later 'new' (revision) mention
      // supersedes it, the same discipline crossSourceConflicts' witness pick uses.
      const bySource = new Map();
      for (const r of cl.recs) {
        const cur = bySource.get(r.source);
        if (!cur || (r.role === 'new' && cur.role !== 'new')) bySource.set(r.source, r);
      }
      const cells = [...bySource.values()].map((r) => ({
        source: r.source, sourceLabel: r.sourceLabel, value: r.value, unit: r.unit, raw: r.raw,
        comparator: r.comparator || null, changedFromRaw: r.changedFromRaw || null,
        changedFromValue: r.changedFromValue ?? null, sentIdx: r.sentIdx, text: r.text,
      }));
      if (!cells.length) continue;
      rows.push({
        id: `M-${measure}-${rows.length}`, measure, measureLabel: measureLabel(measure, cells[0].unit),
        subject: cl.subject, cells, reading: readingFor(cells, toleranceFor(measure, { relTol, absTol })),
      });
    }
  }
  // Stable, readable order: the measures with the most corroborating/contesting sources
  // first (the rows most worth a reader's first look), ties broken by measure name.
  rows.sort((a, b) => (b.cells.length - a.cells.length) || a.measure.localeCompare(b.measure));

  return {
    rows,
    counts: {
      rows: rows.length,
      measuresCompared: byMeasure.size,
      quantities: records.length,
      sources: sources.length,
    },
  };
};
