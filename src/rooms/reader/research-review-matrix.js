// EO: EVA·SIG(Field,Network → Lens, Tracing,Tending) — the evidence matrix (docs/research-review.md §7.1).
// Rows are aligned evidence objects (a measure comparisonMatrix already pivoted, or an evidence
// area's shared vocabulary); columns are the reviewed candidates. Every cell is read off structure
// this app already computed — comparisonMatrix's quantities for MEASURE rows, evidenceAreas'
// term-overlap membership for PROPOSITION rows — never a fabricated semantic judgment. Two of the
// spec's row families (measure, proposition) and five of its cell states (supports, contests,
// revises, silent, candidate correspondence) are genuinely computed here; the remaining row
// families (state/classification/relation/event/definition/evaluation/absence/change) and cell
// states (states-a-different-value, unavailable, no-commit) would need real proposition-level
// parsing this app does not run yet — left out rather than faked, the same "what is next" honesty
// docs/research-review.md already holds itself to.

import { clusterOf } from './research-review.js';

// measureRows(rows, matrix) → one MEASURE row per comparisonMatrix row, cells keyed by sn (not
// position) so the matrix's own column order never has to match the caller's candidate-row order.
export const measureRows = (rows, matrix) => {
  if (!matrix || !matrix.rows || !matrix.rows.length) return [];
  const sourceIndex = new Map((matrix.sources || []).map((c, i) => [c.source, i]));
  return matrix.rows.map((mr) => {
    const cells = {};
    for (const r of rows) {
      const i = sourceIndex.get(r.sn);
      const cell = i != null ? mr.cells[i] : null;
      if (!cell) { cells[r.sn] = { state: 'silent' }; continue; }
      cells[r.sn] = {
        state: mr.conflict ? 'contests' : cell.transition ? 'revises' : 'supports',
        display: cell.display, text: cell.text, sentIdx: cell.sentIdx, source: cell.source,
      };
    }
    return { family: 'measure', label: mr.measureLabel, reading: mr.reading, conflict: mr.conflict, cells };
  });
};

// propositionRows(rows, areas, clusters) → one PROPOSITION row per evidence area — its label IS the
// shared vocabulary that put the members there, never an invented claim text. A member reads
// 'supports' when it is the cluster's origin or an independent voice; 'candidate correspondence'
// when it is a DERIVATIVE of another member already in the area (the same origin restated, not a
// second witness); 'silent' when the candidate's own reviewed text never entered this area at all.
export const propositionRows = (rows, areas, clusters) => (areas || []).map((area) => {
  const memberSns = new Set(area.sns);
  const cells = {};
  for (const r of rows) {
    if (!memberSns.has(r.sn)) { cells[r.sn] = { state: 'silent' }; continue; }
    const cluster = clusterOf(r.sn, clusters);
    const isDerivative = !!(cluster && cluster.origin && cluster.origin.sn !== r.sn && cluster.members.length > 1);
    cells[r.sn] = { state: isDerivative ? 'candidate correspondence' : 'supports', originSn: isDerivative ? cluster.origin.sn : null };
  }
  return { family: 'proposition', label: area.label, terms: area.terms, independentOrigins: area.independentOrigins, cells };
});

// evidenceMatrix(rows, { matrix, areas, clusters }) → { rows:[...], sources:[{source,label}] } — the
// one entrance. `sources` echoes the column order the caller renders in (the candidate rows' own
// order), decoupled from whatever internal order comparisonMatrix happens to carry.
export const evidenceMatrix = (rows, { matrix = null, areas = [], clusters = [] } = {}) => ({
  rows: [...measureRows(rows, matrix), ...propositionRows(rows, areas, clusters)],
  sources: rows.map((r) => ({ source: r.sn, label: r.title || r.domain || r.sn })),
});
