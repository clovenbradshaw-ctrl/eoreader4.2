// EO: SIG·SEG·INS(Void → Field,Entity, Binding,Clearing,Making) — generic JSON/REST APIs → records
// A JSON API is a TABLE behind a URL — find the records, name the columns, admit the rows.
// (docs/civic-apis.md "Navigating an API")
//
// The library organs (arxiv, openalex, gutenberg) each speak ONE service's shape. This organ
// speaks the shape every REST/JSON API shares: a request returns an object, and somewhere inside
// it is the ARRAY OF RECORDS the caller wants — `results`, `data`, `items`, `records`, `features`
// (GeoJSON), `value` (OData/Socrata-over-OData), or the top level itself. It:
//
//   • NAVIGATES to that array — a caller-given dotted path (`response.docs`) or, absent one,
//     auto-detects the largest array-of-objects in the tree (pickRecords);
//   • FLATTENS each record to addressable scalar fields (dotted keys for nesting) and unions the
//     keys into a stable column set (recordsToTable) — the exact { name, columns, rows } shape
//     organs/in/table.js#ingestTable takes, so an API result lands in the data room like a CSV;
//   • SUMMARISES the payload as prose (summarizeApi) and admits it as a web-source/1 record so a
//     claim can cite "row 12, `population` = 8,468,000" the way it cites a spreadsheet cell.
//
// Dependency-free but for the deliberate admit (websource.admitWebSource); the navigation and
// flattening are pure and offline-testable. Never imports webfetch (cycle-safe, like arxiv.js).

import { admitWebSource } from './websource.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isRecordArray = (v) => Array.isArray(v) && v.length > 0 && v.some(isObj);

// Walk a dotted path into a parsed value: getPath({a:{b:[1]}}, 'a.b') → [1]. Array indices are
// numeric segments (`features.0.properties`). Returns undefined on a miss, never throws.
export const getPath = (json, path) => {
  if (!path) return json;
  let cur = json;
  for (const seg of String(path).split('.')) {
    if (cur == null) return undefined;
    cur = Array.isArray(cur) ? cur[Number(seg)] : cur[seg];
  }
  return cur;
};

// The well-known envelope keys, in the order APIs most commonly use them. Checked before the
// generic deep scan so the OBVIOUS records array wins over an incidental nested one.
const RECORD_KEYS = ['results', 'data', 'items', 'records', 'rows', 'features', 'value', 'entries', 'docs', 'response'];

// pickRecords(json, path?) → { records, path }. With a path, navigate there (and if THAT is an
// object wrapping an array, descend one more). Without, try the well-known envelope keys, then
// fall back to the deepest/largest array-of-objects anywhere in the tree. A bare top-level array
// is itself the records. Always returns an array (possibly empty) + the path it resolved, so the
// caller can show WHERE the rows were found.
export const pickRecords = (json, path) => {
  if (path) {
    let v = getPath(json, path);
    if (isRecordArray(v)) return { records: v, path };
    if (isObj(v)) {                                   // path pointed at the envelope, not the array
      for (const key of RECORD_KEYS) if (isRecordArray(v[key])) return { records: v[key], path: `${path}.${key}` };
    }
    return { records: Array.isArray(v) ? v : [], path };
  }
  if (isRecordArray(json)) return { records: json, path: '' };
  if (isObj(json)) {
    for (const key of RECORD_KEYS) {
      if (isRecordArray(json[key])) return { records: json[key], path: key };
      // one level of nesting: { response: { docs: [...] } } (Solr/CKAN), { data: { rows: [...] } }
      if (isObj(json[key])) for (const k2 of RECORD_KEYS) if (isRecordArray(json[key][k2])) return { records: json[key][k2], path: `${key}.${k2}` };
    }
  }
  // last resort — the largest array-of-objects anywhere (bounded scan, no adversarial blow-up)
  let best = [], bestPath = '';
  const scan = (v, p, depth) => {
    if (depth > 6 || !v || typeof v !== 'object') return;
    if (isRecordArray(v) && v.length > best.length) { best = v; bestPath = p; }
    if (Array.isArray(v)) { if (v.length && isObj(v[0])) scan(v[0], `${p}.0`, depth + 1); return; }
    for (const key of Object.keys(v)) scan(v[key], p ? `${p}.${key}` : key, depth + 1);
  };
  scan(json, '', 0);
  return { records: best, path: bestPath };
};

// flattenRecord(obj) → a flat map of scalar cells: nested objects become dotted keys
// (`geo.lat`), arrays of scalars join, arrays/objects too deep stringify. So a record with a
// nested `properties` block still tabulates as addressable columns. Bounded depth (adversarial
// JSON can't recurse forever).
export const flattenRecord = (obj, prefix = '', out = {}, depth = 0) => {
  if (depth > 8 || obj == null) { if (prefix) out[prefix] = obj == null ? '' : String(obj); return out; }
  if (Array.isArray(obj)) {
    if (obj.every((x) => x == null || typeof x !== 'object')) out[prefix || 'value'] = obj.join('; ');
    else obj.forEach((x, i) => flattenRecord(x, prefix ? `${prefix}.${i}` : String(i), out, depth + 1));
    return out;
  }
  if (isObj(obj)) {
    for (const key of Object.keys(obj)) flattenRecord(obj[key], prefix ? `${prefix}.${key}` : key, out, depth + 1);
    return out;
  }
  out[prefix || 'value'] = obj;                        // a scalar
  return out;
};

// recordsToTable(records, { name, maxCols }) → { name, columns, rows }. Columns are the UNION of
// every record's flattened keys (first-seen order — a field that first appears on row 40 must not
// vanish, mirroring organs/in/table.js). Capped at maxCols so a wildly heterogeneous payload does
// not explode the grid; the overflow is reported by the caller, never silently dropped.
export const recordsToTable = (records, { name = 'api', maxCols = 60 } = {}) => {
  const flat = (records || []).map((r) => isObj(r) || Array.isArray(r) ? flattenRecord(r) : { value: r });
  const columns = [];
  const seen = new Set();
  for (const f of flat) for (const key of Object.keys(f)) if (!seen.has(key)) { seen.add(key); columns.push(key); }
  const cols = columns.slice(0, maxCols);
  const rows = flat.map((f) => {
    const row = {};
    for (const c of cols) row[c] = f[c] == null ? '' : (typeof f[c] === 'object' ? JSON.stringify(f[c]) : f[c]);
    return row;
  });
  return { name, columns: cols, rows, droppedColumns: columns.length - cols.length };
};

// summarizeApi(url, records, table) → the prose an admitted source reads as: what the endpoint is,
// how many records, the columns, and the first few rows rendered as `key: value` lines (the same
// legible shape organs/in/json.js gives a JSON tree). So an API result is groundable, not opaque.
export const summarizeApi = (url, records, table, { previewRows = 8 } = {}) => {
  const head = `API: ${url}\n${records.length} record${records.length === 1 ? '' : 's'} · ${table.columns.length} field${table.columns.length === 1 ? '' : 's'}`;
  const cols = `Fields: ${table.columns.join(', ')}`;
  const lines = (table.rows || []).slice(0, previewRows).map((row, i) =>
    `Record ${i + 1}. ` + table.columns.filter((c) => row[c] !== '' && row[c] != null).slice(0, 12)
      .map((c) => `${c}: ${row[c]}`).join('; '));
  const more = records.length > previewRows ? `\n… and ${records.length - previewRows} more records (open as a table to read them all).` : '';
  return [head, cols, lines.join('\n') + more].filter(Boolean).join('\n\n');
};

// parseJson(text) → parsed value | null. Tolerant of a leading BOM / whitespace; never throws.
export const parseJson = (text) => {
  try { return JSON.parse(String(text || '').replace(/^﻿/, '').trim()); } catch { return null; }
};

// The search KIND: the query is a JSON API URL → fetch, navigate to records, return the top k as
// items (each summarised as one hit). Snippet-level until fetchPages asks for the whole payload
// (API_FULLTEXT). Returns [] for a non-URL query, or a body that is not JSON (routeKind falls
// through). `path` may be threaded on the ctx (ctx.apiPath) to point past a non-standard envelope.
export const API_SOURCES = {
  api: async (ctx, query, k) => {
    if (!/^https?:\/\//i.test(String(query || '').trim())) return [];
    const json = parseJson((await ctx.fetchUrl(query.trim())).text);
    if (json == null) return [];
    const { records } = pickRecords(json, ctx?.apiPath);
    if (!records.length) {
      // a scalar/object endpoint (a status, a single entity) — one item of its legible fields
      const table = recordsToTable([json], { name: query });
      return [{ title: query, text: summarizeApi(query, [json], table), url: query, source: 'api' }];
    }
    const table = recordsToTable(records, { name: query });
    return records.slice(0, k).map((r, i) => {
      const flat = flattenRecord(r);
      const title = flat.name || flat.title || flat.label || flat.id || `record ${i + 1}`;
      const text = table.columns.filter((c) => flat[c] != null && flat[c] !== '').slice(0, 16)
        .map((c) => `${c}: ${flat[c]}`).join('; ');
      return { title: String(title), text, url: query, source: 'api', _apiRecord: r };
    });
  },
};

// The FULL-TEXT hook: under fetchPages, an api item reads the WHOLE endpoint summarised — every
// record's fields, so the reader can ground on any row, not just the head. Re-fetches once (the
// item URL is the endpoint) and renders the full table as prose.
export const API_FULLTEXT = {
  api: async (client, item) => {
    const url = item?.url;
    if (!url) return item?.text || '';
    try {
      const json = parseJson((await client.fetchUrl(url)).text);
      if (json == null) return item?.text || '';
      const { records } = pickRecords(json);
      const rows = records.length ? records : [json];
      const table = recordsToTable(rows, { name: url });
      return summarizeApi(url, rows, table, { previewRows: 200 });
    } catch { return item?.text || ''; }
  },
};

// recordId(rec) → an API record's STABLE identity if it carries one (id/guid/uuid/_id/…), else
// null. The unique key a pointer keeps instead of the record's fields, so a re-fetch dedups.
export const recordId = (rec) => {
  if (!isObj(rec)) return null;
  for (const k of ['id', 'guid', 'uuid', '_id', 'identifier', 'ID', 'Id']) if (rec[k] != null && rec[k] !== '') return String(rec[k]);
  return null;
};

// apiPointer(url, picked) → the MINIMAL reference kept by default for a JSON endpoint: the endpoint
// URL (itself the re-fetch key), the resolved records path, the record count, and — where the
// records carry stable ids — those ids. NOT the record bodies. The endpoint is the tap; the pointer
// re-reads it on demand rather than storing a copy.
export const apiPointer = (url, picked) => {
  const ids = (picked?.records || []).map(recordId).filter(Boolean);
  return Object.freeze({
    schema: 'api-pointer/1', url, path: picked?.path || '',
    count: (picked?.records || []).length,
    ids: ids.length ? ids : null,
  });
};

const nowIso = () => { try { return new Date().toISOString(); } catch { return null; } };

// fetchJsonApi(url, opts) → { json, records, path, pointer, table, admitted } | null — the
// DELIBERATE path: name a JSON endpoint and get the parsed payload, the resolved records array (+
// WHERE it was found), the id-keyed POINTER, and a data-room table. `path` navigates past a
// non-standard envelope. Mirrors fetchFeed / fetchArxivPaper.
//
// By DEFAULT it does NOT store the endpoint's data — `admit` is false, so the records come back for
// viewing (the table) and the lightweight pointer is the thing kept; nothing is persisted or
// admitted onto the spine. Pass { admit:true } to opt IN to materialising the payload as a
// groundable source (the old default) — a deliberate "keep this endpoint's snapshot".
export const fetchJsonApi = async (url, { client, store = null, path = null, k = Infinity, admit = false, fetched_at = nowIso(), hangGuard = 4_000_000 } = {}) => {
  if (!client || !/^https?:\/\//i.test(String(url || '').trim())) return null;
  const json = parseJson((await client.fetchUrl(String(url).trim())).text);
  if (json == null) return null;
  const picked = pickRecords(json, path);
  const rows = picked.records.length ? picked.records.slice(0, k) : [json];
  const table = recordsToTable(rows, { name: url });
  const pointer = apiPointer(url, picked);
  let admitted = null;
  if (admit) {
    const payload = {
      url, title: url, text: summarizeApi(url, rows, table, { previewRows: 200 }),
      excerpt: `${picked.records.length} records · ${table.columns.length} fields`,
      retrieval_query: String(url), engine: 'web:api', fetched_at,
    };
    admitted = store ? store.admit(payload, { hangGuard }) : admitWebSource(payload, { hangGuard });
  }
  return { json, records: picked.records, path: picked.path, pointer, table, admitted };
};
