// EO: EVA·SEG·SIG(Network → Lens, Binding,Dissecting) — the query engine
//
// Structured queries over a row set (rows.js): a typed filter TREE, multi-key
// sort, grouping, aggregation, and foreign-key traversal — the pure spreadsheet
// query surface. No DOM, no LLM; the natural-language front end (if any) parses
// down to the same predicate tree this compiles.

import { isEmpty, toNum, toTime, strOf, ciEq, asArray, asList, nfold, displayValue } from './types.js';

// ── the typed filter operators — each (cell, operand, ctx) → boolean ──────────
const MS = { day: 86400000, week: 604800000, month: 2629800000 };
function withinRange(spec, now) {
  const n = Number(spec && spec.n) || 0;
  const span = (MS[spec && spec.unit] || MS.day) * n;
  return (spec && spec.dir === 'next') ? [now, now + span] : [now - span, now];
}

export const OPERATORS = Object.freeze({
  // text / general
  is:          (c, v) => ciEq(c, v),
  isNot:       (c, v) => !ciEq(c, v),
  contains:    (c, v) => nfold(c).includes(nfold(v)),
  notContains: (c, v) => !nfold(c).includes(nfold(v)),
  isEmpty:     (c) => isEmpty(c),
  isNotEmpty:  (c) => !isEmpty(c),
  // number
  eq:  (c, v) => toNum(c) === toNum(v),
  ne:  (c, v) => toNum(c) !== toNum(v),
  gt:  (c, v) => toNum(c) > toNum(v),
  lt:  (c, v) => toNum(c) < toNum(v),
  gte: (c, v) => toNum(c) >= toNum(v),
  lte: (c, v) => toNum(c) <= toNum(v),
  between: (c, v) => { const n = toNum(c); const [a, b] = asList(v).map(toNum); return n >= Math.min(a, b) && n <= Math.max(a, b); },
  // single-select
  isAnyOf:  (c, v) => asList(v).some((x) => ciEq(c, x)),
  isNoneOf: (c, v) => !asList(v).some((x) => ciEq(c, x)),
  // multiselect
  hasAnyOf:  (c, v) => { const cell = asArray(c).map((s) => s.toLowerCase()); return asList(v).some((x) => cell.includes(strOf(x).toLowerCase())); },
  hasAllOf:  (c, v) => { const cell = asArray(c).map((s) => s.toLowerCase()); return asList(v).every((x) => cell.includes(strOf(x).toLowerCase())); },
  hasNoneOf: (c, v) => { const cell = asArray(c).map((s) => s.toLowerCase()); return !asList(v).some((x) => cell.includes(strOf(x).toLowerCase())); },
  // date
  dateIs:     (c, v) => { const a = toTime(c), b = toTime(v); return !Number.isNaN(a) && !Number.isNaN(b) && a === b; },
  before:     (c, v) => { const a = toTime(c), b = toTime(v); return !Number.isNaN(a) && !Number.isNaN(b) && a < b; },
  after:      (c, v) => { const a = toTime(c), b = toTime(v); return !Number.isNaN(a) && !Number.isNaN(b) && a > b; },
  onOrBefore: (c, v) => { const a = toTime(c), b = toTime(v); return !Number.isNaN(a) && !Number.isNaN(b) && a <= b; },
  onOrAfter:  (c, v) => { const a = toTime(c), b = toTime(v); return !Number.isNaN(a) && !Number.isNaN(b) && a >= b; },
  within:     (c, v, ctx) => { const t = toTime(c); if (Number.isNaN(t)) return false; const [lo, hi] = withinRange(v, ctx.now); return t >= lo && t <= hi; },
  // boolean
  isChecked:   (c) => c === true || /^(true|yes|y|1)$/i.test(strOf(c)),
  isUnchecked: (c) => !(c === true || /^(true|yes|y|1)$/i.test(strOf(c))),
});

// Airtable-style labels → canonical operator keys.
export const OP_ALIASES = Object.freeze({
  'is not': 'isNot', 'does not contain': 'notContains', 'is empty': 'isEmpty',
  'is not empty': 'isNotEmpty', '=': 'eq', '≠': 'ne', '!=': 'ne', '>': 'gt', '<': 'lt',
  '≥': 'gte', '>=': 'gte', '≤': 'lte', '<=': 'lte', 'is any of': 'isAnyOf', 'is none of': 'isNoneOf',
  'has any of': 'hasAnyOf', 'has all of': 'hasAllOf', 'has none of': 'hasNoneOf',
});

export const resolveOp = (name) => OPERATORS[name] || OPERATORS[OP_ALIASES[name]] || null;

/**
 * Compile a filter node into a row → boolean predicate.
 *   leaf:   { field, op, value }
 *   branch: { op: 'and'|'or'|'not', clauses: [...] }
 * `not` negates the AND of its clauses (De Morgan). A predicate that throws
 * evaluates to false rather than blowing up the whole scan.
 */
export function compileFilter(node, ctx = {}) {
  if (!node) return () => true;
  const kind = String(node.op || '').toLowerCase();
  if (kind === 'and' || kind === 'or' || kind === 'not') {
    const kids = (node.clauses || []).map((c) => compileFilter(c, ctx));
    if (kind === 'and') return (row) => kids.every((k) => k(row));
    if (kind === 'or') return (row) => kids.some((k) => k(row));
    return (row) => !kids.every((k) => k(row));
  }
  const fn = resolveOp(node.op);
  if (!fn) throw new Error(`query: unknown filter operator: ${node.op}`);
  const { field, value } = node;
  return (row) => { try { return !!fn(row[field], value, ctx); } catch { return false; } };
}

// ── sort: multi-key, stable, empties always last ─────────────────────────────
function compareValues(a, b) {
  const ae = isEmpty(a), be = isEmpty(b);
  if (ae && be) return 0;
  if (ae) return 1;
  if (be) return -1;
  const na = toNum(a), nb = toNum(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  const ta = toTime(a), tb = toTime(b);
  if (!Number.isNaN(ta) && !Number.isNaN(tb)) return ta - tb;
  return strOf(a).toLowerCase().localeCompare(strOf(b).toLowerCase());
}

export function sortRows(rows, sort) {
  const keys = asList(sort).filter(Boolean);
  if (!keys.length) return rows.slice();
  const decorated = rows.map((row, ord) => ({ row, ord }));
  decorated.sort((A, B) => {
    for (const k of keys) {
      const av = A.row[k.field], bv = B.row[k.field];
      const ae = isEmpty(av), be = isEmpty(bv);
      if (ae && be) continue;
      if (ae) return 1;
      if (be) return -1;
      const c = compareValues(av, bv);
      if (c) return k.dir === 'desc' ? -c : c;
    }
    return A.ord - B.ord; // stable
  });
  return decorated.map((d) => d.row);
}

// ── aggregate: count · sum · avg · min · max, optionally grouped ─────────────
const round6 = (n) => Math.round(n * 1e6) / 1e6;

function reduceAgg(rows, agg, field) {
  if (agg === 'count') return rows.length;
  const nums = rows.map((r) => toNum(r[field])).filter((n) => !Number.isNaN(n));
  if (!nums.length) return null;
  if (agg === 'sum') return round6(nums.reduce((a, b) => a + b, 0));
  if (agg === 'avg') return round6(nums.reduce((a, b) => a + b, 0) / nums.length);
  if (agg === 'max') return round6(Math.max(...nums));
  if (agg === 'min') return round6(Math.min(...nums));
  if (agg === 'countDistinct') return new Set(nums).size;
  return null;
}

/**
 * Aggregate a row set. Without `groupBy` → { grouped:false, value }. With it →
 * { grouped:true, rows:[{ key, value, count }] } sorted by value desc (numeric)
 * else key asc.
 */
export function aggregate(rows, spec = {}) {
  const agg = spec.agg || 'count';
  if (!spec.groupBy) return { grouped: false, value: reduceAgg(rows, agg, spec.field) };
  const groups = new Map();
  for (const r of rows) {
    const key = displayValue(r[spec.groupBy]) || '(empty)';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const out = Array.from(groups.entries()).map(([key, rs]) => ({ key, value: reduceAgg(rs, agg, spec.field), count: rs.length }));
  out.sort((a, b) => (typeof b.value === 'number' && typeof a.value === 'number') ? b.value - a.value : String(a.key).localeCompare(String(b.key)));
  return { grouped: true, rows: out };
}

/**
 * Run a full query over rows.
 *   opts = { filter, search, searchFields, sort, group, offset, limit, now }
 * Returns { page, total, groups } — total is the filtered/searched size before
 * the window; page is the [offset, offset+limit) slice; groups is present when
 * `group.field` is set (each { key, count, [value] } when group.agg given).
 */
export function query(rows, opts = {}) {
  const now = opts.now ?? Date.now();
  let matched = rows;

  if (opts.filter) {
    const pred = compileFilter(opts.filter, { now });
    matched = matched.filter(pred);
  }
  if (opts.search) {
    const term = nfold(opts.search);
    const fields = opts.searchFields || null;
    matched = matched.filter((r) => {
      if (fields) return fields.some((f) => nfold(displayValue(r[f])).includes(term));
      return nfold(Object.keys(r).filter((k) => !k.startsWith('_')).map((k) => displayValue(r[k])).join(' ')).includes(term);
    });
  }

  const total = matched.length;

  let groups;
  if (opts.group && opts.group.field) {
    const g = aggregate(matched, { groupBy: opts.group.field, agg: opts.group.agg || 'count', field: opts.group.field2 || opts.group.aggField });
    groups = g.rows.map((r) => (opts.group.agg && opts.group.agg !== 'count') ? { key: r.key, count: r.count, value: r.value } : { key: r.key, count: r.count });
  }

  const sorted = opts.sort ? sortRows(matched, opts.sort) : matched.slice();
  const offset = Math.max(0, opts.offset | 0);
  const limit = opts.limit == null ? sorted.length : Math.max(0, opts.limit | 0);
  const page = sorted.slice(offset, offset + limit);
  return { page, total, groups };
}

// ── foreign-key traversal ────────────────────────────────────────────────────

function edgesOf(connections, id) {
  const out = [];
  for (const c of connections || []) if (c.source === id || c.target === id) out.push(c);
  return out;
}

/**
 * Records related to `id`, grouped by direction + relation + set:
 *   [{ set, rel, dir:'in'|'out', records:[{ id, set, label, rel, dir }] }]
 * `rowsById` maps id → row (from an index of the row set).
 */
export function relatedRecords(id, { connections, rowsById }) {
  const groups = new Map();
  for (const c of edgesOf(connections, id)) {
    let other = null, dir = null;
    if (c.source === id) { other = c.target; dir = 'out'; }
    else if (c.target === id) { other = c.source; dir = 'in'; }
    else continue;
    const row = rowsById.get(other);
    if (!row) continue;
    const rel = c.type || 'link';
    const key = `${dir}:${rel}:${row._set}`;
    if (!groups.has(key)) groups.set(key, { set: row._set, rel, dir, records: [] });
    groups.get(key).records.push({ id: other, set: row._set, label: row._label || other, rel, dir });
  }
  return Array.from(groups.values());
}

/** The sets a given set can link to — declared schema.links first, else observed. */
export function linkedSetsFor(setName, { schema, connections, rowsById } = {}) {
  const links = schema && schema.links;
  if (Array.isArray(links)) {
    const set = new Set();
    for (const l of links) { if (l.from === setName) set.add(l.to); if (l.to === setName) set.add(l.from); }
    return Array.from(set);
  }
  const set = new Set();
  for (const c of connections || []) {
    const s = rowsById?.get(c.source), t = rowsById?.get(c.target);
    if (s && s._set === setName && t) set.add(t._set);
    if (t && t._set === setName && s) set.add(s._set);
  }
  return Array.from(set);
}

/** Build an id → row index for the traversal/link helpers. */
export const indexRows = (rows) => new Map((rows || []).map((r) => [r._id, r]));
