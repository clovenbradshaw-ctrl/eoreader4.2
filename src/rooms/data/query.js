// EO: EVA·SIG(Field → Lens, Binding) — table Q&A / answerTable
// data/query.js — answering a quantitative question over a table by COMPUTING, not reading.
//
// A CSV is not prose: "how many enterprise accounts are at risk?" is a filtered count,
// "what's their combined ARR?" a currency-aware sum, "rank the accounts by ARR" a sort —
// answers that must be computed over the cells and shown with their working, not paraphrased
// from a row read as a sentence. This holon is the NL→math.js bridge: it reads a natural
// question, resolves the columns/filters it names (fluently — "enterprise" matches the
// ENT / Tier 1 spellings too; "at risk" is red-or-yellow; "$200k" is a threshold), computes
// through the same math.js engine the chat uses for arithmetic, and returns an auditable
// record that traces back to the exact cells. When the question is NOT a computation over
// the table ("what's the tell?", "who is acme working for?") every route returns null and
// the turn falls through to the grounded reading.
//
// Money is read honestly (values.js): "$410k", "USD 98,000", "£180k" and "EUR 85,000" are
// four different currencies, so a total across them reports per-currency subtotals rather
// than blending them into one meaningless number. And a note LOG that repeats a customer's
// ARR across several notes is de-duplicated to distinct accounts before it is summed, so a
// per-account figure is never multiplied by how many times the account was written up.

import { traceExpression, formatNumber } from '../../enactor/answer/math.js';
import {
  parseAmount, parseDate, classifyColumn, groupByCurrency, formatMoney, formatGroup, numberInText,
} from './values.js';

const slugKey = (s) => String(s || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || 'col';
const norm = (s) => String(s == null ? '' : s).toLowerCase().trim();
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const round2 = (n) => Math.round(n * 100) / 100;
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const plural = (c) => { const w = norm(c).replace(/_/g, ' '); return /s$/.test(w) ? w : w + 's'; };
const singular = (w) => String(w || '').replace(/ies$/, 'y').replace(/s$/, '');

// The closed-class + high-frequency words a value-match must never fire on, so "how many
// accounts ARE there" does not match every note that contains the word "are".
const STOPWORDS = new Set(('a an and the of to in on at for with without from by as is are was were be been being ' +
  'has have had do does did this that these those it its their our your my his her they them he she we you i ' +
  'not no yes or but if then than so such about into over under out up down off just only also more most less ' +
  'many much few some any all each every there here what which who whom whose when where why how many count number ' +
  'total sum average mean avg rank sort order top bottom highest lowest largest smallest per group show list ' +
  'inc llc ltd co corp group health fintech foods energy logistics retail robotics').split(/\s+/));

// ── a uniform, typed view over a table ───────────────────────────────────────
const asTable = (t) => {
  if (!t) return null;
  const columns = (t.columns || []).map(String);
  let records = t.records;
  if (!records && t.rows) records = t.rows.map((row, i) => {
    const cells = {}; columns.forEach((c, ci) => { cells[slugKey(c)] = Array.isArray(row) ? row[ci] : row[c]; }); return { id: 'row-' + i, index: i, cells };
  });
  records = (records || []).map((r, i) => ({ id: r.id || 'row-' + i, index: r.index ?? i, cells: r.cells || {} }));
  const key = (col) => slugKey(col);
  const valuesOf = (col) => records.map((r) => r.cells[key(col)]);
  const types = {};
  for (const c of columns) types[c] = classifyColumn(valuesOf(c));
  // A categorical column is FILTERABLE only if its cells are short (a real category / name /
  // id / email), never a free-text column (notes, body) whose prose would match anything.
  const maxLen = (c) => Math.max(0, ...valuesOf(c).map((v) => String(v ?? '').length));
  return {
    columns, records, key, valuesOf, types,
    name: t.docId || t.name || t.metadata?.title || 'table',
    numberColumns: columns.filter((c) => types[c].kind === 'money' || types[c].kind === 'number'),
    dateColumns: columns.filter((c) => types[c].kind === 'date'),
    categoricalColumns: columns.filter((c) => types[c].kind === 'categorical'),
    filterableColumns: columns.filter((c) => types[c].kind === 'categorical' && maxLen(c) <= 48),
  };
};

// Which column does the question name? Longest column-name match wins.
const columnMentioned = (q, columns) => {
  const low = norm(q);
  let best = null;
  for (const c of columns) { const cl = norm(c); if (cl && low.includes(cl) && (!best || cl.length > best.length)) best = c; }
  return best;
};

// ── value typing for equality within an entity ───────────────────────────────
// Read a cell as its VALUE, so "$410k" and "410000" compare equal when deciding whether a
// column is constant within a customer (the string compare that made dedup miss).
const valueKeyIn = (T, col) => {
  const kind = T.types[col].kind;
  const k = T.key(col);
  if (kind === 'money' || kind === 'number') return (r) => { const a = parseAmount(r.cells[k]); return a ? a.value : null; };
  if (kind === 'date') return (r) => { const d = parseDate(r.cells[k]); return d ? d.value : null; };
  return (r) => norm(r.cells[k]);
};

// ── the entity key — the column a note LOG repeats a customer across ──────────
const ENTITY_NAME_RE = /(account|customer|company|client|org|organisation|organization|name|entity|vendor|party)/i;
const entityKeyFor = (T, targetCol) => {
  const val = valueKeyIn(T, targetCol);
  const qualifies = (c) => {
    const groups = new Map();
    for (const r of T.records) {
      const g = norm(r.cells[T.key(c)]);
      if (!g) continue;
      const v = val(r);
      if (!groups.has(g)) groups.set(g, v);
      else if (groups.get(g) !== v) return false;   // target varies within this group → not its key
    }
    return groups.size > 0 && groups.size < T.records.length;
  };
  const cand = (cols) => cols.filter(qualifies).sort((a, b) => new Set(T.valuesOf(a)).size - new Set(T.valuesOf(b)).size)[0] || null;
  return cand(T.filterableColumns.filter((c) => ENTITY_NAME_RE.test(c))) || cand(T.filterableColumns);
};

// The table's nouns: the raw ROW noun (a note / a ticket) and the ENTITY noun the rows are
// about (accounts).
const nounsFor = (T) => {
  const entityKeyGuess = T.filterableColumns.find((c) => ENTITY_NAME_RE.test(c)) || null;
  const base = String(T.name).split(/[#/\\]/).pop().replace(/\.[a-z0-9]+$/i, '');
  const lastTok = (base.split(/[_\-\s]+/).pop() || 'row').toLowerCase();
  const rowNoun = /s$/.test(lastTok) ? lastTok : lastTok + 's';
  const entityNoun = entityKeyGuess ? plural(entityKeyGuess) : rowNoun;
  return { rowNoun, entityNoun, entityKeyGuess };
};

const distinctByKey = (records, T, keyCol) => {
  const seen = new Set(); const out = [];
  for (const r of records) { const g = norm(r.cells[T.key(keyCol)]); if (seen.has(g)) continue; seen.add(g); out.push(r); }
  return out;
};

// ── fluent value filters (NL → a predicate over rows) ────────────────────────
const ROLE_COLUMN = {
  health: (c, T) => /health|flag|status|risk/i.test(c) && hasAnyValue(T, c, ['green', 'yellow', 'red']),
  tier:   (c) => /tier|segment|plan|band|level/i.test(c),
  priority: (c) => /priorit|severity|sev|urgency/i.test(c),
};
const hasAnyValue = (T, c, vals) => { const set = new Set(T.valuesOf(c).map(norm)); return vals.some((v) => set.has(v)); };
const SYNONYMS = [
  { role: 'health', label: 'at risk', phrases: ['at risk', 'at-risk', 'risky', 'in trouble', 'troubled', 'churning', 'churn risk'], values: ['red', 'yellow'] },
  { role: 'health', label: 'healthy', phrases: ['healthy', 'green health', 'green flag', 'green'], values: ['green'] },
  { role: 'health', label: 'yellow', phrases: ['yellow', 'amber', 'warning'], values: ['yellow'] },
  { role: 'health', label: 'red', phrases: ['red', 'critical'], values: ['red'] },
  { role: 'tier', label: 'enterprise', phrases: ['enterprise', 'ent'], values: ['enterprise', 'ent', 'tier 1'] },
  { role: 'tier', label: 'mid-market', phrases: ['mid-market', 'mid market', 'midmarket', 'mm'], values: ['mid-market', 'mm'] },
  { role: 'tier', label: 'SMB', phrases: ['smb', 'small business', 'small-business'], values: ['smb'] },
  { role: 'priority', label: 'urgent', phrases: ['urgent', 'p1'], values: ['1 - urgent', 'urgent', 'p1'] },
  { role: 'priority', label: 'high priority', phrases: ['high priority', 'high-priority', 'high'], values: ['high', 'p2'] },
  { role: 'priority', label: 'normal priority', phrases: ['normal priority', 'normal'], values: ['normal'] },
  { role: 'priority', label: 'low priority', phrases: ['low priority', 'p3', 'low'], values: ['low', 'p3'] },
];
const columnForRole = (role, T) => T.columns.find((c) => ROLE_COLUMN[role] && ROLE_COLUMN[role](c, T)) || null;
const wordRe = (p) => new RegExp(`(^|[^a-z0-9])${escapeRe(p)}([^a-z0-9]|$)`, 'i');

const COMPARATORS = [
  { re: /(?:>=|at least|minimum|no less than|greater than or equal to)/, op: '>=' },
  { re: /(?:<=|at most|maximum|no more than|less than or equal to)/, op: '<=' },
  { re: /(?:>|over|above|more than|greater than|exceeds|exceeding|beyond|north of)/, op: '>' },
  { re: /(?:<|under|below|less than|fewer than|south of|beneath)/, op: '<' },
];
const OP_WORD = { '>': 'over', '<': 'under', '>=': 'at least', '<=': 'at most', '=': 'is' };
const nounRe = (noun) => new RegExp(`\\b${escapeRe(singular(noun))}s?\\b`, 'i');

// Parse the question into a conjunction of clauses. Same-column clauses OR their values;
// different columns AND. Each clause carries a human label (the phrase that triggered it).
const parseFilter = (q, T) => {
  const low = norm(q);
  const byCol = new Map();   // col → { values:Set, cmp:[], labels:[] }
  const add = (col, patch) => {
    if (!col) return;
    const e = byCol.get(col) || { values: new Set(), cmp: [], labels: [] };
    if (patch.values) patch.values.forEach((v) => e.values.add(v));
    if (patch.cmp) e.cmp.push(patch.cmp);
    if (patch.label) e.labels.push(patch.label);
    byCol.set(col, e);
  };

  // 1) synonym phrases (longest first) → a role column's values. Several synonyms of the
  //    SAME role union onto one column, so "red and yellow" or "enterprise or mid-market"
  //    both land as one OR-set on that column.
  for (const syn of [...SYNONYMS].sort((a, b) => longest(b.phrases) - longest(a.phrases))) {
    const hit = syn.phrases.find((p) => wordRe(p).test(low));
    if (!hit) continue;
    const col = columnForRole(syn.role, T);
    if (!col) continue;
    const present = new Set(T.valuesOf(col).map(norm));
    const values = syn.values.filter((v) => present.has(v));
    if (values.length) add(col, { values, label: syn.label });
  }

  // 2) literal categorical values named in the question — over SHORT (filterable) columns
  //    only, and only distinctive tokens (length ≥ 4, not a stopword) or a whole value.
  for (const c of T.filterableColumns) {
    if (byCol.has(c)) continue;
    for (const v of new Set(T.valuesOf(c).map(String))) {
      const vl = norm(v);
      if (vl.length < 2) continue;
      const whole = vl.length >= 3 && wordRe(vl).test(low);
      const tokens = vl.split(/[^a-z0-9]+/).filter((t) => t.length >= 4 && !STOPWORDS.has(t));
      const tokenHit = tokens.find((t) => wordRe(t).test(low));
      if (whole || tokenHit) add(c, { values: [vl], label: whole ? v : (tokenHit) });
    }
  }

  // 3) numeric / money comparison ("arr over 200k").
  const numCol = columnMentioned(low, T.numberColumns) || (T.numberColumns.length === 1 ? T.numberColumns[0] : null);
  if (numCol) {
    for (const cmp of COMPARATORS) {
      const m = low.match(new RegExp(cmp.re.source + '\\s*\\$?£?€?\\s*([0-9][0-9.,]*\\s*(?:k|m|bn|b|thousand|million|billion)?)', 'i'));
      if (m) { const n = numberInText(m[1]); if (n != null) { add(numCol, { cmp: { op: cmp.op, n } }); break; } }
    }
  }

  if (!byCol.size) return null;
  const parts = [], labels = [], cols = [];
  for (const [col, e] of byCol) {
    cols.push(col);
    const k = T.key(col);
    const tests = [];
    if (e.values.size) { const vs = [...e.values]; tests.push((r) => vs.includes(norm(r.cells[k]))); }
    for (const c of e.cmp) { tests.push((r) => { const a = parseAmount(r.cells[k]); return a != null && cmpNum(a.value, c.op, c.n); }); e.labels.push(`${col} ${OP_WORD[c.op]} ${formatGroup(c.n)}`); }
    parts.push((r) => tests.some((t) => t(r)));
    labels.push(e.labels.join('/'));
  }
  return { test: (r) => parts.every((p) => p(r)), label: labels.join(' and '), cols };
};
const longest = (arr) => Math.max(...arr.map((p) => p.length));
const cmpNum = (a, op, b) => op === '>' ? a > b : op === '<' ? a < b : op === '>=' ? a >= b : op === '<=' ? a <= b : a === b;

// ── the computation record (auditable, cell-cited) ───────────────────────────
const cellsForRows = (records, T, cols) => {
  const out = [];
  for (const r of records) for (const c of (cols || [])) out.push({ row: r.index, id: r.id, col: c, value: r.cells[T.key(c)], label: `R${r.index + 1} ${c}` });
  return out;
};
const rec = (op, expr, note, cells) => {
  const tr = expr != null ? traceExpression(expr) : null;
  return {
    engine: 'math.js', op, expr: tr ? tr.expr : (expr || ''),
    result: tr ? tr.result : null, resultText: tr ? tr.resultText : '',
    steps: tr ? tr.steps : [], operators: tr ? tr.operators : [op],
    operands: tr ? tr.operands : [], cells: cells || [], note: note || '',
  };
};

// ── currency-aware aggregation over a set of records on a money/number column ─
const aggregateMoney = (records, T, col, kind, { rowNoun, subject, dedup = true }) => {
  let rows = records;
  const key = dedup ? entityKeyFor(T, col) : null;
  let unit = rowNoun;
  if (key) { rows = distinctByKey(records, T, key); unit = plural(key); }
  const amounts = rows.map((r) => ({ r, a: parseAmount(r.cells[T.key(col)]) })).filter((x) => x.a);
  if (!amounts.length) return null;
  const groups = groupByCurrency(amounts.map((x) => x.a));
  const cells = cellsForRows(amounts.map((x) => x.r), T, [col]);

  const partText = [], subtotals = [];
  for (const [ccy, list] of groups.byCurrency) {
    const vals = list.map((a) => a.value);
    const total = vals.reduce((s, v) => s + v, 0);
    const value = kind === 'mean' ? total / vals.length : total;
    subtotals.push({ ccy, value, list });
    partText.push(ccy === '—' ? `${formatGroup(round2(value))} (currency unspecified)` : formatMoney(round2(value), ccy));
  }
  const single = subtotals.length === 1 ? subtotals[0] : null;
  const expr = single && single.list.length <= 24
    ? (kind === 'mean'
        ? '(' + single.list.map((a) => formatNumber(a.value)).join(' + ') + ') / ' + single.list.length
        : single.list.map((a) => formatNumber(a.value)).join(' + '))
    : null;
  const record = rec(kind === 'mean' ? 'divide' : 'add', expr,
    `${kind} of ${col} across ${amounts.length} ${unit}${single ? '' : ' (mixed currency)'}`, cells);
  if (single && record.result == null) record.result = single.value;
  if (single) record.resultText = single.ccy === '—' ? formatGroup(round2(single.value)) : formatMoney(round2(single.value), single.ccy);

  const verb = kind === 'mean' ? 'averages' : 'totals';
  const head = subject ? `The ${col} of ${subject}` : `The ${col} across ${amounts.length} ${unit}`;
  const dedupNote = key ? ` (${amounts.length} distinct ${plural(key)}, de-duplicated from ${records.length} ${rowNoun})` : '';
  const text = groups.mixed
    ? `${head} spans ${subtotals.length} currencies, so it ${verb} per currency: ${partText.join('; ')}${dedupNote}. Different currencies are kept apart — one blended figure would be meaningless.`
    : `${head} ${verb} ${partText[0]}${dedupNote}.`;
  return { text, record, kind, column: col, cells };
};

// ── the routes ───────────────────────────────────────────────────────────────
export const answerTable = (question, table, opts = {}) => {
  const T = asTable(table);
  if (!T || !T.records.length) return null;
  const q = norm(question);
  if (!q) return null;
  const nouns = { ...nounsFor(T), ...(opts.nouns || {}) };
  const { rowNoun, entityNoun } = nouns;
  const nRows = T.records.length;

  const filt = parseFilter(q, T);
  const filtered = filt ? T.records.filter(filt.test) : T.records;

  // GROUP-BY
  const groupByCol = matchGroupBy(q, T);
  if (groupByCol) {
    const agg = /\b(total|sum|combined)\b/.test(q) ? 'sum' : /\b(average|mean|avg)\b/.test(q) ? 'mean' : 'count';
    const targetCol = agg === 'count' ? null : (columnMentioned(q, T.numberColumns) || (T.numberColumns.length === 1 ? T.numberColumns[0] : null));
    if (agg !== 'count' && !targetCol) return null;
    const entityNamed = entityNoun !== rowNoun && nounRe(entityNoun).test(q);
    const distinctCol = (agg === 'count' && entityNamed) ? nouns.entityKeyGuess : null;
    return groupBy(T, groupByCol, agg, targetCol, { rowNoun, distinctCol });
  }

  // RANK / SORT / TOP-N
  const ranking = matchRanking(q, T);
  if (ranking) return rankRows(T, ranking, { rowNoun, entityNoun });

  // SHARE / PERCENT
  const share = answerShare(q, T);
  if (share) return share;

  // COUNT
  if (/\bhow many\b|\bnumber of\b|\bcount\b|\bhow much\b/.test(q) && !/\b(total|sum|average|mean|avg)\b/.test(q)) {
    // Did the question name the ENTITY (accounts) rather than the raw ROW (notes)? Only then
    // do we count distinct entities; "how many notes" and the ticket table (no entity key)
    // count rows. The entity key is the account column, NOT whichever column the filter used.
    const entityNamed = entityNoun !== rowNoun && nounRe(entityNoun).test(q);
    const key = entityNamed ? nouns.entityKeyGuess : null;
    if (filt) {
      if (key) {
        const hit = new Set(filtered.map((r) => norm(r.cells[T.key(key)])).filter(Boolean));
        const all = new Set(T.records.map((r) => norm(r.cells[T.key(key)])).filter(Boolean));
        return {
          text: `${cap(filt.label)}: ${hit.size} of ${all.size} ${plural(key)}.`,
          record: rec('count', null, `${hit.size} of ${all.size} ${plural(key)} match ${filt.label}`, cellsForRows(filtered, T, filt.cols)),
          kind: 'count', column: key,
        };
      }
      return {
        text: `${cap(filt.label)}: ${filtered.length} of ${nRows} ${rowNoun}.`,
        record: rec('count', null, `${filtered.length} of ${nRows} ${rowNoun} match ${filt.label}`, cellsForRows(filtered, T, filt.cols)),
        kind: 'count',
      };
    }
    if (key) {
      const all = new Set(T.records.map((r) => norm(r.cells[T.key(key)])).filter(Boolean));
      return {
        text: `There ${all.size === 1 ? 'is' : 'are'} ${all.size} ${plural(key)} (across ${nRows} ${rowNoun}).`,
        record: rec('count', null, `${all.size} distinct ${plural(key)}`, []),
        kind: 'count', column: key,
      };
    }
    return {
      text: `There ${nRows === 1 ? 'is' : 'are'} ${nRows} ${rowNoun}.`,
      record: rec('count', null, `${nRows} ${rowNoun}`, []),
      kind: 'count',
    };
  }

  // SUM / TOTAL
  if (/\b(total|sum|combined|altogether|add up|aggregate)\b/.test(q)) {
    const col = columnMentioned(q, T.numberColumns) || (T.numberColumns.length === 1 ? T.numberColumns[0] : null);
    if (!col) return null;
    return aggregateMoney(filtered, T, col, 'sum', { rowNoun, subject: filt ? filt.label : null });
  }

  // AVERAGE / MEAN
  if (/\b(average|mean|avg|typical)\b/.test(q)) {
    const col = columnMentioned(q, T.numberColumns) || (T.numberColumns.length === 1 ? T.numberColumns[0] : null);
    if (!col) return null;
    return aggregateMoney(filtered, T, col, 'mean', { rowNoun, subject: filt ? filt.label : null });
  }

  // MIN / MAX (single extreme)
  const wantMax = /\b(max|maximum|highest|largest|biggest|greatest|most)\b/.test(q);
  const wantMin = /\b(min|minimum|lowest|smallest|least)\b/.test(q);
  if (wantMax || wantMin) {
    const col = columnMentioned(q, T.numberColumns) || (T.numberColumns.length === 1 ? T.numberColumns[0] : null);
    if (!col) return null;
    const r = rankRows(T, { col, dir: wantMax ? 'desc' : 'asc', n: 1 }, { rowNoun, entityNoun });
    if (r) r.kind = wantMax ? 'max' : 'min';
    return r;
  }

  return null;
};

// GROUP-BY detection.
const matchGroupBy = (q, T) => {
  const m = q.match(/\b(?:by|per|for each|grouped by|group by|broken down by|breakdown by)\s+([a-z][a-z0-9 _-]*?)(?:\s*[?.!]|$|\s+(?:that|which|where|with|and|in|of|is|are|ascending|descending|asc|desc))/);
  if (!m) return null;
  const phrase = m[1].trim();
  const roleCol = (/tier|segment|plan/.test(phrase) && columnForRole('tier', T))
    || (/health|flag|status|risk/.test(phrase) && columnForRole('health', T))
    || (/priorit|severity|urgency/.test(phrase) && columnForRole('priority', T));
  return columnMentioned(phrase, T.categoricalColumns)
      || roleCol
      || T.categoricalColumns.find((c) => norm(c).includes(phrase) || phrase.includes(norm(c)))
      || null;
};

// Canonicalise a categorical value through the role synonyms, so "Enterprise", "ENT" and
// "Tier 1" fold into one group; a non-role column is returned unchanged.
const canonicalizer = (col, T) => {
  const role = Object.keys(ROLE_COLUMN).find((r) => columnForRole(r, T) === col);
  if (!role) return (v) => String(v ?? '').trim() || '(blank)';
  const map = new Map();
  for (const syn of SYNONYMS) if (syn.role === role) for (const v of syn.values) map.set(v, syn.label);
  return (v) => map.get(norm(v)) || (String(v ?? '').trim() || '(blank)');
};

const groupBy = (T, groupCol, agg, targetCol, { rowNoun, distinctCol }) => {
  const gk = T.key(groupCol);
  const canon = canonicalizer(groupCol, T);
  const groups = new Map();
  for (const r of T.records) { const g = canon(r.cells[gk]); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); }
  const rows = [];
  for (const [g, recs] of groups) {
    if (agg === 'count') {
      const c = distinctCol ? new Set(recs.map((r) => norm(r.cells[T.key(distinctCol)])).filter(Boolean)).size : recs.length;
      rows.push({ g, text: `${c}`, sort: c }); continue;
    }
    const res = aggregateMoney(recs, T, targetCol, agg === 'sum' ? 'sum' : 'mean', { rowNoun, subject: null });
    rows.push({ g, text: res ? stripLead(res.text) : '—', sort: res?.record?.result ?? 0 });
  }
  rows.sort((a, b) => b.sort - a.sort);
  const label = agg === 'count' ? `count of ${distinctCol ? plural(distinctCol) : rowNoun}` : `${agg === 'sum' ? 'total' : 'average'} ${targetCol}`;
  return {
    text: `${cap(label)} by ${groupCol}:\n${rows.map((r) => `  • ${r.g}: ${r.text}`).join('\n')}`,
    record: rec(agg === 'count' ? 'count' : (agg === 'sum' ? 'add' : 'divide'), null, `${label} grouped by ${groupCol} (${rows.length} groups)`, []),
    kind: 'group', column: groupCol,
  };
};
const stripLead = (t) => String(t).replace(/^The [a-z0-9_]+ across \d+ [a-z]+ (totals|averages) /i, '').replace(/^The [a-z0-9_]+ across[^:]*: /i, '').replace(/\.$/, '');

// RANK / SORT / TOP-N detection. Returns { col, dir, n } or null.
const matchRanking = (q, T) => {
  if (!/\b(rank|sort|order|top|bottom|highest|lowest|largest|smallest|most|least|leading|biggest)\b/.test(q)) return null;
  const sortable = [...T.numberColumns, ...T.dateColumns];
  if (!sortable.length) return null;
  const byM = q.match(/\bby\s+([a-z][a-z0-9 _-]*)/);
  let col = columnMentioned(q, sortable);
  if (!col && byM) col = columnMentioned(byM[1], sortable);
  // A "by <phrase>" that names no sortable column is a reasoning sort ("by unspoken
  // frustration", "by the deadline that matters") — defer, don't silently rank by ARR.
  if (byM && !col) return null;
  if (!col && T.numberColumns.length === 1) col = T.numberColumns[0];
  if (!col) return null;
  const nm = q.match(/\b(?:top|bottom|first|last)\s+(\d{1,3})\b/) || q.match(/\b(\d{1,3})\s+(?:highest|lowest|largest|smallest|biggest)\b/);
  const single = /\bwhich\b.*\b(has|is|are|have)\b/.test(q) || /\bthe (highest|lowest|largest|smallest|biggest|most|least)\b/.test(q);
  const n = nm ? Math.max(1, +nm[1]) : (single ? 1 : 0);
  const dir = /\b(bottom|last|lowest|smallest|least|earliest|oldest|asc|ascending)\b/.test(q) ? 'asc' : 'desc';
  return { col, dir, n };
};

const rankRows = (T, { col, dir, n }, { rowNoun, entityNoun }) => {
  const isDate = T.types[col].kind === 'date';
  const valOf = (r) => isDate ? (parseDate(r.cells[T.key(col)])?.value ?? null) : (parseAmount(r.cells[T.key(col)])?.value ?? null);
  const key = entityKeyFor(T, col);
  const base = key ? distinctByKey(T.records, T, key) : T.records;
  const labelCol = key || T.filterableColumns.find((c) => ENTITY_NAME_RE.test(c)) || T.filterableColumns[0] || null;
  const scored = base.map((r) => ({ r, v: valOf(r) })).filter((x) => x.v != null);
  if (!scored.length) return null;
  scored.sort((a, b) => dir === 'asc' ? a.v - b.v : b.v - a.v);
  const take = n && n > 0 ? scored.slice(0, n) : scored;
  const nameOf = (r) => labelCol ? String(r.cells[T.key(labelCol)] ?? `row ${r.index + 1}`) : `row ${r.index + 1}`;
  const showVal = (r) => isDate ? parseDate(r.cells[T.key(col)]).iso : formatMoney(parseAmount(r.cells[T.key(col)]).value, parseAmount(r.cells[T.key(col)]).currency);
  const unit = key ? plural(key) : rowNoun;
  const head = n === 1
    ? `${cap(dir === 'asc' ? 'lowest' : 'highest')} ${col}: ${nameOf(take[0].r)} — ${showVal(take[0].r)}.`
    : `${cap(unit)} by ${col} (${dir === 'asc' ? 'ascending' : 'highest first'})${n ? `, top ${take.length}` : ''}:\n${take.map((x, i) => `  ${i + 1}. ${nameOf(x.r)} — ${showVal(x.r)}`).join('\n')}`;
  return {
    text: head,
    record: rec(dir === 'asc' ? 'min' : 'max', null, `${unit} ranked by ${col} (${scored.length} ranked)`, cellsForRows(take.map((x) => x.r), T, [col])),
    kind: n === 1 ? (dir === 'asc' ? 'min' : 'max') : 'rank', column: col,
  };
};

// SHARE / PERCENT.
const answerShare = (q, T) => {
  const col = columnMentioned(q, T.numberColumns) || (T.numberColumns.length === 1 ? T.numberColumns[0] : null);
  if (!col) return null;

  const ofTotal = q.match(/(\d+(?:\.\d+)?)\s*(?:%|percent|per cent)\s+of\s+(?:the\s+)?(?:total|combined|sum of|all)/);
  if (ofTotal) {
    const pct = parseFloat(ofTotal[1]);
    const tot = totalOnDominant(T, col);
    if (!tot) return null;
    const expr = `(${pct} / 100) * ${formatNumber(tot.value)}`;
    const record = rec('multiply', expr, `${pct}% of the total ${col} (${tot.ccy || 'unspecified'})`, []);
    const val = record.result ?? (pct / 100) * tot.value;
    return { text: `${pct}% of the total ${col} (${formatMoney(tot.value, tot.ccy)}${tot.ccy ? '' : ' unspecified'}) is ${formatMoney(round2(val), tot.ccy)}.`, record, kind: 'percent', column: col };
  }

  if (/(%|percent|per cent|share|fraction|proportion)/.test(q) && /\bof\b/.test(q) && /\b(what|which|how)\b/.test(q)) {
    const filt = parseFilter(q, T);
    if (!filt) return null;
    const subset = T.records.filter(filt.test);
    const sub = totalOnDominant(subset, col, T);
    const tot = totalOnDominant(T, col);
    if (!sub || !tot || !tot.value || sub.ccy !== tot.ccy) return null;
    const expr = `${formatNumber(sub.value)} / ${formatNumber(tot.value)} * 100`;
    const record = rec('divide', expr, `${col} share of ${filt.label}`, cellsForRows(subset, T, [col]));
    const pct = record.result ?? (sub.value / tot.value * 100);
    return { text: `${cap(filt.label)}: ${formatMoney(sub.value, sub.ccy)} of ${formatMoney(tot.value, tot.ccy)} total ${col} — ${round2(pct)}%.`, record, kind: 'percent', column: col };
  }
  return null;
};

const totalOnDominant = (recordsOrT, col, maybeT) => {
  const T = maybeT || recordsOrT;
  const records = maybeT ? recordsOrT : T.records;
  const key = entityKeyFor(T, col);
  const rows = key ? distinctByKey(records, T, key) : records;
  const amounts = rows.map((r) => parseAmount(r.cells[T.key(col)])).filter(Boolean);
  if (!amounts.length) return null;
  const groups = groupByCurrency(amounts);
  const [ccy, list] = [...groups.byCurrency.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  return { value: list.reduce((s, a) => s + a.value, 0), ccy: ccy === '—' ? null : ccy, n: list.length };
};

export const isTableQuery = (question, table) => answerTable(question, table) != null;

// ── the turn seam: pick the table a question is about and compute over it ─────
export const answerOverTables = (question, docs, opts = {}) => {
  const tables = (docs || []).filter((d) => d && d.modality === 'table' && Array.isArray(d.records) && d.records.length);
  if (!tables.length) return null;
  const scored = tables.map((d) => ({ d, score: tableRelevance(question, d) })).sort((a, b) => b.score - a.score);
  for (const { d } of scored) {
    const ans = answerTable(question, d, opts);
    if (ans) return {
      route: 'table', text: ans.text, answer: ans.text, sources: [],
      record: ans.record, kind: ans.kind, table: d.docId || d.metadata?.title || 'table',
    };
  }
  return null;
};

const tableRelevance = (question, doc) => {
  const T = asTable(doc);
  const low = norm(question);
  let score = 0;
  for (const c of T.columns) if (low.includes(norm(c))) score += 2;
  const { rowNoun, entityNoun } = nounsFor(T);
  if (nounRe(rowNoun).test(low)) score += 1;
  if (nounRe(entityNoun).test(low)) score += 1;
  for (const c of T.filterableColumns) {
    for (const v of new Set(T.valuesOf(c).map(norm))) {
      const toks = v.split(/[^a-z0-9]+/).filter((t) => t.length >= 4 && !STOPWORDS.has(t));
      if ((v.length >= 4 && wordRe(v).test(low)) || toks.some((t) => wordRe(t).test(low))) { score += 1; break; }
    }
  }
  return score;
};
