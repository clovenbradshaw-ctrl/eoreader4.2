// EO: EVA·SYN(Field,Network → Network,Lens, Tracing,Composing) — the cross-source comparison matrix
//
// The cross-source pass (crosscheck.js) answers one yes/no question — do two sources
// clash on a measure? — and reports only the clashes. The instrument the corpus asks
// for is the whole grid behind that answer: one ROW per measured thing (seawall budget,
// completion year, wetland acreage, federal funding), one COLUMN per source, and in each
// cell the exact value that source states — including the value it was REVISED from —
// each opening back to the sentence it was read out of. A reading per row names the shape
// of the spread (revised upward, schedule pushed later, sources disagree, consistent)
// deterministically, from the values alone, no model in the loop.
//
// It is built on the SAME reading crosscheck.js already runs — extractQuantities binds
// each magnitude to its subject; readMeasures resolves "from X to Y" so a cell carries
// the transition, not the number the source moved off of. This module only PIVOTS those
// bound records into measure × source, and reads the row's shape off the pivot. It never
// reads the sources a second way, so the matrix and the conflict banner can never disagree.

import { extractQuantities, subjectOf, subjectsCompatible, measureTol } from './crosscheck.js';
import { measureLabel } from './quantities.js';
import { quantitiesConflict } from '../../core/index.js';

// The operative record for one source on one measure — the value that source ASSERTS.
// A record carrying a transition (the "to $145M" side of a change) is the source's real
// position and wins over a bare same-measure mention; otherwise the first mention stands.
const operativeFor = (recs) => {
  let cur = null;
  for (const r of recs) if (!cur || (!cur.transition && r.transition)) cur = r;
  return cur;
};

// Does the row's spread hold a genuine cross-source disagreement (beyond the measure's
// tolerance)? Years compare on an absolute floor; everything else proportionally.
const rowConflict = (measure, cells, opts) => {
  const tol = measureTol(measure, opts);
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    if (cells[i].source === cells[j].source) continue;
    if (quantitiesConflict(cells[i].value, cells[j].value, tol).conflict) return true;
  }
  return false;
};

// The row's reading — the shape of the spread, in words, from the values alone. A
// DIRECTION is only claimed when a source states the move itself (a "revised from X to Y"
// transition); ingestion order is not asserted time, so absent an explicit change the
// reading names the disagreement without inventing which way it went.
//
// A transition explains a disagreement only between the figure it names as old and the
// figure it names as new. A cell that matches NEITHER — a third source with its own,
// different number — is a disagreement the revision says nothing about; calling the row
// "Revised" would bury that second, unexplained dispute behind a reading that sounds
// resolved. So a transition only licenses a "Revised …" reading when every other cell's
// value lands within tolerance of one side of it; otherwise this falls through to the
// plain "Sources disagree", same as a row with no transition at all.
const readingFor = (measure, cells, conflict, opts) => {
  const sched = measure === 'schedule';
  const withTr = cells.filter((c) => c.transition);
  if (withTr.length) {
    const tol = measureTol(measure, opts);
    const explained = withTr.flatMap((c) => [c.value, c.transition.from]);
    const isExplained = (v) => explained.some((e) => !quantitiesConflict(v, e, tol).conflict);
    const unexplained = cells.some((c) => !c.transition && !isExplained(c.value));
    if (!unexplained) {
      const up = withTr.some((c) => c.value > c.transition.from);
      const down = withTr.some((c) => c.value < c.transition.from);
      if (up && !down) return sched ? 'Pushed later' : 'Revised upward';
      if (down && !up) return sched ? 'Pulled earlier' : 'Revised downward';
      return sched ? 'Schedule changed' : 'Revised';
    }
  }
  if (new Set(cells.map((c) => c.source)).size < 2) return 'Only one source';
  if (!conflict) return 'Consistent';
  return 'Sources disagree';
};

// cellDisplay(cell) → the value as it should read in a matrix cell: a change shows the
// move ("$120M → $145M"), a bound shows its side ("≥ $145M"), an exact value stands alone.
export const cellDisplay = (cell) => {
  if (!cell) return '—';
  if (cell.transition) return `${cell.transition.fromRaw} → ${cell.raw}`;
  if (cell.bound === 'atLeast') return `≥ ${cell.raw}`;
  if (cell.bound === 'atMost') return `≤ ${cell.raw}`;
  return cell.raw;
};

// comparisonMatrix(sources, opts) → { rows, sources, counts }
//
//   sources : [{ doc, source, label, date }] in the corpus's own order (the column order).
//   rows    : one per measure any source states, each
//     { measure, measureLabel, subject, conflict, changed, reading, sourceCount,
//       cells: [ cell | null ] parallel to `sources` } where a cell is
//       { source, sourceLabel, value, unit, raw, bound, transition, sentIdx, text, display }.
//   sources : [{ source, label }] echoed for the column header.
//   counts  : { rows, measures, conflicts, sources }.
//
// Rows are ordered by salience — the ones that actually compare (a disagreement, then a
// revision, then the multi-source agreements) ahead of the single-source rows — so the
// grid leads with what the corpus contests, not with what only one source happens to say.
export const comparisonMatrix = (sources = [], opts = {}) => {
  const cols = sources.map((s, i) => ({
    source: (s && (s.source ?? s.sn)) ?? (s && s.doc && s.doc.docId) ?? `src${i}`,
    label: (s && (s.label ?? s.title)) ?? null,
  }));
  const colIndex = new Map(cols.map((c, i) => [c.source, i]));

  // Every bound magnitude across the corpus, in one flat list (superseded values already
  // dropped by extractQuantities), grouped by measure.
  const byMeasure = new Map();
  sources.forEach((s, si) => {
    const doc = s && s.doc ? s.doc : s;
    if (!doc?.admission) return;
    const meta = {
      source: cols[si].source, label: cols[si].label, date: (s && s.date) ?? null,
    };
    for (const r of extractQuantities(doc, meta)) {
      let a = byMeasure.get(r.measure); if (!a) byMeasure.set(r.measure, a = []); a.push(r);
    }
  });

  const rows = [];
  for (const [measure, recs] of byMeasure) {
    // The row key is subject × measure, not measure alone: a bare same-measure match ("cost
    // (USD)") is not enough to call two magnitudes the same thing — a $15 accessory and a
    // company's $2.2T valuation share a measure and nothing else. Cluster this measure's
    // records: two join the same row if EITHER both name a subject and those subjects don't
    // positively split (subjectsCompatible, the same gate the strict conflict pass uses) OR
    // their magnitudes are within the same rough order of size. Note this is a STRICTER read
    // of subjectsCompatible than its own pairwise contract: that helper treats an unresolved
    // subject on either side as "defer to true", which is right for asking about one specific
    // pair but wrong here — clustering is transitive, so a single unresolved-subject record
    // would silently bridge every other subject in the measure into one row. Requiring both
    // sides resolved keeps that leniency from leaking across the union-find; an unresolved
    // record still joins a row, but only via the magnitude leg below.
    // The magnitude leg is what keeps the reader's own "wetland acreage" in one row whether a
    // source binds it to the seawall (60 acres) or to the agency that recommended it (240
    // acres) — real same-topic figures stay within a bounded ratio of each other even when the
    // sentence-level subject differs — while still splitting apart values that share nothing
    // but a measure: a $15 accessory is >10^8x a $2.2T valuation, nowhere near "the same kind
    // of figure" no matter what either sentence's subject resolved to.
    const MAGNITUDE_SPLIT_RATIO = 25;
    const namedSubjectsCompatible = (a, b) => !!a && !!b && subjectsCompatible(a, b);
    const magnitudeClose = (a, b) => {
      const x = Math.abs(a), y = Math.abs(b);
      if (!x || !y) return x === y;
      return Math.max(x, y) / Math.min(x, y) <= MAGNITUDE_SPLIT_RATIO;
    };
    const parent = recs.map((_, i) => i);
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const union = (i, j) => { const ri = find(i), rj = find(j); if (ri !== rj) parent[ri] = rj; };
    for (let i = 0; i < recs.length; i++) {
      for (let j = i + 1; j < recs.length; j++) {
        if (namedSubjectsCompatible(recs[i].subjLabel, recs[j].subjLabel) || magnitudeClose(recs[i].value, recs[j].value)) union(i, j);
      }
    }
    const clusters = new Map();
    for (let i = 0; i < recs.length; i++) {
      const root = find(i); let a = clusters.get(root); if (!a) clusters.set(root, a = []); a.push(recs[i]);
    }
    for (const kept of clusters.values()) {
      if (!kept.length) continue;
      const subject = subjectOf(kept);
      // One operative record per source, placed in its column.
      const bySource = new Map();
      for (const r of kept) { let a = bySource.get(r.source); if (!a) bySource.set(r.source, a = []); a.push(r); }
      const cells = cols.map(() => null);
      const present = [];
      for (const [src, srcRecs] of bySource) {
        const op = operativeFor(srcRecs);
        if (!op) continue;
        const cell = {
          source: src, sourceLabel: op.sourceLabel, value: op.value, unit: op.unit, raw: op.raw,
          bound: op.bound || 'exact', transition: op.transition || null,
          sentIdx: op.sentIdx, text: op.text,
        };
        cell.display = cellDisplay(cell);
        const ci = colIndex.get(src);
        if (ci != null) cells[ci] = cell;
        present.push(cell);
      }
      if (!present.length) continue;
      const conflict = rowConflict(measure, present, opts);
      const changed = present.some((c) => c.transition);
      rows.push({
        measure, measureLabel: measureLabel(measure, present[0]?.unit), subject,
        conflict, changed, reading: readingFor(measure, present, conflict, opts),
        sourceCount: new Set(present.map((c) => c.source)).size, cells,
      });
    }
  }

  // Salience: disagreements first, then revisions, then multi-source agreements, then the
  // single-source rows; ties broken by how many sources speak to the measure.
  const rank = (r) => (r.conflict ? 0 : r.changed ? 1 : r.sourceCount >= 2 ? 2 : 3);
  rows.sort((a, b) => rank(a) - rank(b) || b.sourceCount - a.sourceCount ||
    String(a.measureLabel).localeCompare(String(b.measureLabel)));

  return {
    rows, sources: cols,
    counts: {
      rows: rows.length, measures: byMeasure.size,
      conflicts: rows.filter((r) => r.conflict).length, sources: sources.length,
    },
  };
};
