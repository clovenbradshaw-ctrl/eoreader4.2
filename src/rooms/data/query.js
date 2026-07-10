// EO: EVA·SIG(Field → Lens, Binding) — table Q&A / answerTable
// data/query.js — answering a quantitative question over a table by COMPUTING,
// not reading. A CSV is not prose: "how many contracts did the audit flag?" is a
// count, "what do they total?" is a sum — answers that must be computed over the
// cells and shown with their working, not paraphrased from a row read as a
// sentence. Every figure is computed through answer/math.js (the same engine the
// chat uses for arithmetic), so it carries an auditable computation record and
// traces back to the exact cells.

import { traceExpression, formatNumber } from '../../enactor/answer/math.js';

const slugKey = (s) => String(s || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || 'col';
const num = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : null; };

// A uniform view over a table: the ingestTable doc (columns/records/column()) OR
// a plain { columns, rows }.
const asTable = (t) => {
  if (!t) return null;
  const columns = (t.columns || []).map(String);
  let records = t.records;
  if (!records && t.rows) records = t.rows.map((row, i) => {
    const cells = {}; columns.forEach((c, ci) => { cells[slugKey(c)] = Array.isArray(row) ? row[ci] : row[c]; }); return { id: 'row-' + i, index: i, cells };
  });
  records = records || [];
  const key = (col) => slugKey(col);
  return { columns, records, valuesOf: (col) => records.map((r) => r.cells[key(col)]) };
};

// Which column does the question name? Prefer the longest column-name match, so
// "audit finding" wins over "audit". Returns the display name, or null.
const columnMentioned = (q, columns) => {
  const low = q.toLowerCase();
  let best = null;
  for (const c of columns) { const cl = c.toLowerCase(); if (cl && low.includes(cl) && (!best || cl.length > best.length)) best = cl ? c : best; }
  return best;
};

// A numeric column has enough parseable values to compute over.
const numericColumns = (T) => T.columns.filter((c) => { const vs = T.valuesOf(c).map(num).filter((v) => v != null); return vs.length >= Math.max(1, Math.floor(T.records.length * 0.5)); });

// Build the computation record for a set of operands + a math.js expression. For a
// big table we don't spell out 1,000 additions — we compute and summarise.
const record = (op, expr, cells, engineNote) => {
  const tr = expr != null ? traceExpression(expr) : null;
  return {
    engine: 'math.js', op, expr: tr ? tr.expr : (expr || ''),
    result: tr ? tr.result : null, resultText: tr ? tr.resultText : '',
    steps: tr ? tr.steps : [], operators: tr ? tr.operators : [op],
    operands: cells.map((c) => ({ text: c.label, value: c.value })),
    cells, note: engineNote || '',
  };
};

// The core: answer a quantitative question over a table, or null when it is not
// one (so the caller falls through to the normal grounded chat).
export const answerTable = (question, table, opts = {}) => {
  const T = asTable(table);
  if (!T || !T.records.length) return null;
  const q = String(question || '').toLowerCase();
  const nRows = T.records.length;
  const rowNoun = opts.rowNoun || 'rows';
  const col = columnMentioned(q, T.columns);
  const MAXSTEPS = 24;

  // cells for the record: label each operand as "R<n> <col>=<value>"
  const cellsFor = (colName) => T.records.map((r, i) => ({ row: i, id: r.id, col: colName, value: num(r.cells[slugKey(colName)]), raw: r.cells[slugKey(colName)], label: 'R' + (i + 1) + ' ' + colName })).filter((c) => c.value != null);

  // ── COUNT ────────────────────────────────────────────────────────────────
  if (/\bhow many\b|\bnumber of\b|\bcount\b|\bhow much\b/.test(q) && !(/\b(total|sum|average|mean|avg)\b/.test(q))) {
    // filter form: "how many <X> are <value>" / "... where <col> is <value>"
    const filt = matchFilter(q, T);
    if (filt) {
      const hits = T.records.filter(filt.test);
      return {
        text: `${hits.length} of ${nRows} ${rowNoun} ${hits.length === 1 ? 'matches' : 'match'} ${filt.label}.`,
        record: { engine: 'math.js', op: 'count', expr: `count(${filt.label})`, result: hits.length, resultText: String(hits.length), steps: [], operators: ['count'], operands: [], cells: hits.map((r) => ({ row: r.index, id: r.id, label: 'R' + (r.index + 1) })), note: `${hits.length} of ${nRows} ${rowNoun}` },
        kind: 'count',
      };
    }
    return {
      text: `There ${nRows === 1 ? 'is' : 'are'} ${nRows} ${rowNoun}.`,
      record: { engine: 'math.js', op: 'count', expr: `count(${rowNoun})`, result: nRows, resultText: String(nRows), steps: [], operators: ['count'], operands: [], cells: T.records.map((r) => ({ row: r.index, id: r.id, label: 'R' + (r.index + 1) })), note: `${nRows} ${rowNoun}` },
      kind: 'count',
    };
  }

  // pick a numeric column: the one named, else the sole numeric column
  const nums = numericColumns(T);
  const target = (col && nums.includes(col)) ? col : (nums.length === 1 ? nums[0] : (col && cellsFor(col).length ? col : null));

  // ── SUM / TOTAL ────────────────────────────────────────────────────────────
  if (/\b(total|sum|combined|altogether|add up)\b/.test(q) && target) {
    const cells = cellsFor(target);
    const vals = cells.map((c) => c.value);
    const expr = vals.length <= MAXSTEPS ? vals.map((v) => formatNumber(v)).join(' + ') : null;
    const total = vals.reduce((a, b) => a + b, 0);
    const rec = expr ? record('add', expr, cells) : { engine: 'math.js', op: 'add', expr: `sum(${target}, ${vals.length} rows)`, result: total, resultText: formatNumber(total), steps: [], operators: ['add'], operands: cells.map((c) => ({ text: c.label, value: c.value })), cells };
    return { text: `The ${target} of ${vals.length} ${rowNoun} totals ${rec.resultText}.`, record: rec, kind: 'sum', column: target };
  }

  // ── AVERAGE / MEAN ─────────────────────────────────────────────────────────
  if (/\b(average|mean|avg)\b/.test(q) && target) {
    const cells = cellsFor(target); const vals = cells.map((c) => c.value);
    const expr = vals.length <= MAXSTEPS ? '(' + vals.map((v) => formatNumber(v)).join(' + ') + ') / ' + vals.length : null;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const rec = expr ? record('divide', expr, cells) : { engine: 'math.js', op: 'mean', expr: `mean(${target}, ${vals.length} rows)`, result: mean, resultText: formatNumber(Math.round(mean * 1e6) / 1e6), steps: [], operators: ['mean'], operands: cells.map((c) => ({ text: c.label, value: c.value })), cells };
    return { text: `The average ${target} across ${vals.length} ${rowNoun} is ${rec.resultText}.`, record: rec, kind: 'mean', column: target };
  }

  // ── MIN / MAX ──────────────────────────────────────────────────────────────
  const wantMax = /\b(max|maximum|highest|largest|biggest|most|greatest|top)\b/.test(q);
  const wantMin = /\b(min|minimum|lowest|smallest|least|bottom)\b/.test(q);
  if ((wantMax || wantMin) && target) {
    const cells = cellsFor(target); const vals = cells.map((c) => c.value);
    const fn = wantMax ? 'max' : 'min';
    const expr = vals.length <= MAXSTEPS ? `${fn}(${vals.map((v) => formatNumber(v)).join(', ')})` : null;
    const v = wantMax ? Math.max(...vals) : Math.min(...vals);
    const at = cells.find((c) => c.value === v);
    const rec = expr ? record(fn, expr, cells) : { engine: 'math.js', op: fn, expr: `${fn}(${target}, ${vals.length} rows)`, result: v, resultText: formatNumber(v), steps: [], operators: [fn], operands: cells.map((c) => ({ text: c.label, value: c.value })), cells };
    return { text: `The ${wantMax ? 'highest' : 'lowest'} ${target} is ${rec.resultText}${at ? ` (row ${at.row + 1})` : ''}.`, record: rec, kind: fn, column: target };
  }

  return null;
};

// A crude equality filter read off "where <col> is <value>" / "<col> = <value>"
// / a bare value that matches a categorical column ("how many are sole-source").
const matchFilter = (q, T) => {
  for (const c of T.columns) {
    const vals = [...new Set(T.valuesOf(c).map((v) => String(v == null ? '' : v)))].filter(Boolean);
    for (const v of vals) {
      const vl = v.toLowerCase();
      if (vl.length >= 3 && q.includes(vl)) {
        const k = slugKey(c);
        return { label: `${c} = "${v}"`, col: c, value: v, test: (r) => String(r.cells[k] || '').toLowerCase() === vl };
      }
    }
  }
  return null;
};

export const isTableQuery = (question, table) => answerTable(question, table) != null;
