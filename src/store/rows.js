// EO: INS·CON·SEG(Network → Entity,Link, Making,Binding) — the row model
//
// A ROW is a plain record the grid/query/formula layers operate on:
//
//   { _id, _set, _label?, ...fields, _links? }
//
//   _id     stable row id (the fold entity id, or an import ordinal)
//   _set    the table/set this row belongs to
//   _label  a display label (optional; recordLabel() derives one otherwise)
//   _links  { field: { to, rel, ids[] } } — foreign-record references, resolved
//           into connections by resolveLinks()
//
// The two row sources are unified here:
//   · foldToRows(projectGraph(log))   — every entity becomes a row, edges become
//                                        connections ("rows are events, folded")
//   · materializeRecords(records,set) — an imported CSV/JSON table (records → rows)
//
// A CONNECTION is { source, target, type } — the same edge the query/rollup FK
// traversal follows.

import { coerce, coerceValue } from './types.js';

/** The best display label for a row: a known name field, else the tail of its id. */
export function recordLabel(row) {
  if (!row) return '';
  return row._label || row.Name || row.name || row.title || row.body ||
    row.claim || row.what || row.label || row.summary ||
    String(row._id ?? '').slice(-8);
}

const DEFAULT_SET_OF = (entity) =>
  entity.props?._set ?? entity.props?.set ?? entity.props?.type ?? entity.props?.kind ?? 'entity';

/**
 * Project a fold (projectGraph result) into { rows, connections }. Each entity
 * becomes a row keyed by its id, its props spread as fields; each edge becomes a
 * connection. `opts.setOf(entity)` decides a row's table (default: an entity's
 * `_set`/`set`/`type`/`kind` prop, else 'entity').
 */
export function foldToRows(fold, opts = {}) {
  const setOf = opts.setOf || DEFAULT_SET_OF;
  const rows = [];
  const entities = fold?.entities;
  if (entities && typeof entities.values === 'function') {
    for (const e of entities.values()) {
      rows.push({ _id: e.id, _set: setOf(e), _label: e.label, _sightings: e.sightings, ...e.props });
    }
  }
  const connections = (fold?.edges || []).map((e) => ({
    source: e.from, target: e.to, type: e.via || e.kind || 'link',
  }));
  return { rows, connections };
}

/**
 * Materialize a set of plain records into rows of `setName`. Each record's `id`
 * (or `_id`) becomes `_id`; otherwise an import-ordinal id is minted. A `_links`
 * map is carried through for resolveLinks().
 */
export function materializeRecords(records, setName, opts = {}) {
  const idKey = opts.idKey || 'id';
  return (records || []).map((rec, i) => {
    const id = rec[idKey] ?? rec._id ?? `${setName}#r${i}`;
    const row = { _id: String(id), _set: setName };
    for (const [k, v] of Object.entries(rec)) {
      if (k === idKey || k === '_id' || k === '_set') continue;
      if (k === '_links') { row._links = v; continue; }
      if (v !== undefined && v !== null && v !== '') row[k] = v;
    }
    if (rec._label != null) row._label = rec._label;
    return row;
  });
}

/**
 * Resolve every row's `_links` into connections, using a record-id → row-id
 * index. Returns a flat connection list (deduped on source|target|rel).
 */
export function resolveLinks(rows) {
  const byRecId = new Map();
  for (const r of rows) {
    if (r._recordId != null) byRecId.set(String(r._recordId), r._id);
    byRecId.set(String(r._id), r._id);
  }
  const out = [];
  const seen = new Set();
  for (const r of rows) {
    const links = r._links;
    if (!links) continue;
    for (const field of Object.keys(links)) {
      const { rel, ids } = links[field];
      for (const id of ids || []) {
        const target = byRecId.get(String(id));
        if (!target || target === r._id) continue;
        const key = `${r._id}|${target}|${rel || field}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ source: r._id, target, type: rel || field });
      }
    }
  }
  return out;
}

// ── CSV / JSON import (self-contained; RFC-4180-ish, quoted "" → ") ──

export function parseCSV(text) {
  const rows = [];
  let row = [], cur = '', inQ = false, started = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if (ch === '"' && !started) { inQ = true; started = true; }
    else if (ch === ',') { row.push(cur); cur = ''; started = false; }
    else if (ch === '\r') { /* swallow */ }
    else if (ch === '\n') { row.push(cur); cur = ''; started = false; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
    else { cur += ch; started = true; }
  }
  if (cur !== '' || row.length) { row.push(cur); if (row.length > 1 || row[0] !== '') rows.push(row); }
  return rows;
}

export function parseJsonRows(text) {
  const data = typeof text === 'string' ? JSON.parse(text) : text;
  const isRowObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  if (Array.isArray(data)) {
    if (data.length === 0) return [];
    return isRowObj(data[0]) ? data : data.map((v) => ({ value: v }));
  }
  if (data && typeof data === 'object') {
    for (const k of Object.keys(data)) {
      const v = data[k];
      if (Array.isArray(v) && v.length > 0 && isRowObj(v[0])) return v;
    }
    return [data];
  }
  return [{ value: data }];
}

/**
 * Import a CSV/JSON blob into rows of `setName` under a field plan. A field is
 * `{ name, type, csvIdx?|jsonKey?, link?: { to, rel } }`; link fields hold arrays
 * of foreign ids stashed in `_links` for resolveLinks().
 */
export function importRows(text, { setName, fieldPlan, shape = 'csv', hasHeader = true } = {}) {
  const isJson = shape === 'json';
  const dataRows = isJson
    ? parseJsonRows(text)
    : (() => { const p = parseCSV(text); return hasHeader ? p.slice(1) : p; })();

  return dataRows.map((raw, i) => {
    const out = { _id: `${setName}#r${i}`, _set: setName };
    for (const f of fieldPlan || []) {
      if (f.link) {
        const ids = raw && raw[f.jsonKey];
        if (Array.isArray(ids) && ids.length) {
          if (!out._links) out._links = {};
          out._links[f.name] = { to: f.link.to, rel: f.link.rel || f.name, ids: ids.map(String) };
        }
        continue;
      }
      const v = isJson ? coerceValue(raw && raw[f.jsonKey], f.type) : coerce(raw && raw[f.csvIdx], f.type);
      if (v !== undefined && v !== null && v !== '') out[f.name] = v;
    }
    return out;
  });
}
