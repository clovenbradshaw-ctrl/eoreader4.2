// EO: NUL(Field -> Void, Tending) — structured docs (JSON tree, table) -> their own shape
// A JSON or table source already carries its real structure on the doc the organ built
// (organs/in/json.js's `data`, organs/in/table.js's `columns`/`records`) — `source.text` is
// only the flattened "path: value." / "col: val; col: val." sentence reading those organs
// also produce for retrieval, never the shape a person would recognise as "the JSON" or
// "the table". This renders the REAL structure instead: a pretty-printed, coloured JSON
// tree, and an actual <table>. Pure: no DOM, no network.

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── JSON ───────────────────────────────────────────────────────────────────────────────────
const jsonValueHtml = (v, indent) => {
  const pad = '  '.repeat(indent), padIn = '  '.repeat(indent + 1);
  if (v === null) return '<span class="tok-keyword">null</span>';
  if (typeof v === 'boolean') return '<span class="tok-keyword">' + v + '</span>';
  if (typeof v === 'number') return '<span class="tok-number">' + v + '</span>';
  if (typeof v === 'string') return '<span class="tok-string">"' + esc(v) + '"</span>';
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    const items = v.map((x) => padIn + jsonValueHtml(x, indent + 1)).join(',\n');
    return '[\n' + items + '\n' + pad + ']';
  }
  if (typeof v === 'object') {
    const keys = Object.keys(v);
    if (!keys.length) return '{}';
    const items = keys.map((k) => padIn + '<span class="tok-key">"' + esc(k) + '"</span>: ' + jsonValueHtml(v[k], indent + 1)).join(',\n');
    return '{\n' + items + '\n' + pad + '}';
  }
  return esc(String(v));
};

// jsonToHtml(data) → { html }. `data` is the already-parsed JSON value (organs/in/json.js's
// doc.data) — this only lays it out; it does not parse or re-derive anything from it.
export const jsonToHtml = (data) => ({ html: '<pre class="eo-json">' + jsonValueHtml(data, 0) + '</pre>' });

export const JSON_CSS = `
.eo-json{font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:#15151a;color:#dce4f0;border-radius:8px;padding:16px 18px;overflow:auto;white-space:pre}
.eo-json .tok-key{color:#7dd3d8}
.eo-json .tok-string{color:#9ecb8c}
.eo-json .tok-number{color:#e8b989}
.eo-json .tok-keyword{color:#c996e0;font-weight:600}
`;

// ── table ──────────────────────────────────────────────────────────────────────────────────
// tableToHtml(doc) → { html }. `doc` is organs/in/table.js's ingestTable() doc — its real
// `columns` header and `records` ({cells}) rows, the same data the Overview tab's Dataset
// glance already reads (index.html#_sourceLandingVM's tableDoc). A cap keeps a huge sheet
// from laying out tens of thousands of DOM rows at once; `truncated` says so honestly.
const MAX_ROWS = 2000;
export const tableToHtml = (doc, { maxRows = MAX_ROWS } = {}) => {
  const columns = (doc && doc.columns) || [];
  const keys = (doc && doc.keys) || columns;
  const records = (doc && doc.records) || [];
  const shown = records.slice(0, maxRows);
  const head = '<thead><tr><th class="eo-table-idx">#</th>' + columns.map((c) => '<th>' + esc(c) + '</th>').join('') + '</tr></thead>';
  const body = '<tbody>' + shown.map((r) => '<tr><td class="eo-table-idx">' + (r.index + 1) + '</td>' +
    keys.map((k) => '<td>' + esc((r.cells && r.cells[k]) || '') + '</td>').join('') + '</tr>').join('') + '</tbody>';
  return { html: '<table class="eo-table">' + head + body + '</table>', rows: records.length, truncated: records.length > maxRows };
};

export const TABLE_CSS = `
.eo-table{border-collapse:collapse;width:100%;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
.eo-table th,.eo-table td{border:1px solid #ececf0;padding:6px 10px;text-align:left;white-space:nowrap}
.eo-table th{background:#fafafb;font-weight:700;position:sticky;top:0}
.eo-table td.eo-table-idx,.eo-table th.eo-table-idx{color:#9b9ba3;text-align:right;background:#fafafb}
`;
