import { test } from 'node:test';
import assert from 'node:assert/strict';

import { jsonToHtml, tableToHtml } from '../src/rooms/reader/data-render.js';

// jsonToHtml / tableToHtml — a JSON or table source's REAL structure (organs/in/json.js's
// `data`, organs/in/table.js's `columns`/`records`), not the flattened "path: value." /
// "col: val" sentence reading those organs also produce for retrieval. Pure layout only.

test('jsonToHtml: primitives, nested objects/arrays, empty containers', () => {
  const html = jsonToHtml({ name: 'Ada', tags: ['x', 'y'], nested: { ok: true, n: 3 }, gone: null, empty: {}, none: [] }).html;
  assert.match(html, /<span class="tok-key">"name"<\/span>: <span class="tok-string">"Ada"<\/span>/);
  assert.match(html, /<span class="tok-key">"tags"<\/span>: \[\n\s+<span class="tok-string">"x"<\/span>,\n\s+<span class="tok-string">"y"<\/span>\n\s+\]/);
  assert.match(html, /<span class="tok-key">"ok"<\/span>: <span class="tok-keyword">true<\/span>/);
  assert.match(html, /<span class="tok-key">"n"<\/span>: <span class="tok-number">3<\/span>/);
  assert.match(html, /<span class="tok-key">"gone"<\/span>: <span class="tok-keyword">null<\/span>/);
  assert.match(html, /<span class="tok-key">"empty"<\/span>: \{\}/);
  assert.match(html, /<span class="tok-key">"none"<\/span>: \[\]/);
});

test('jsonToHtml: a literal <script> inside a string value never survives as a real tag', () => {
  const html = jsonToHtml({ x: '<script>alert(1)</script>' }).html;
  assert.ok(!html.includes('<script>alert'));
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('jsonToHtml: a key containing HTML-special characters is escaped too', () => {
  const html = jsonToHtml({ '<b>key</b>': 1 }).html;
  assert.ok(!html.includes('<b>key</b>'));
  assert.match(html, /&lt;b&gt;key&lt;\/b&gt;/);
});

test('tableToHtml: real columns and rows become an actual <table>, 1-based row numbers', () => {
  const doc = {
    columns: ['Name', 'Age'], keys: ['name', 'age'],
    records: [
      { index: 0, cells: { name: 'Ada', age: '36' } },
      { index: 1, cells: { name: 'Bea', age: '40' } },
    ],
  };
  const { html, rows, truncated } = tableToHtml(doc);
  assert.equal(rows, 2);
  assert.equal(truncated, false);
  assert.match(html, /<thead><tr><th class="eo-table-idx">#<\/th><th>Name<\/th><th>Age<\/th><\/tr><\/thead>/);
  assert.match(html, /<td class="eo-table-idx">1<\/td><td>Ada<\/td><td>36<\/td>/);
  assert.match(html, /<td class="eo-table-idx">2<\/td><td>Bea<\/td><td>40<\/td>/);
});

test('tableToHtml: a cell value carrying markup is escaped, not interpreted', () => {
  const doc = { columns: ['Name'], keys: ['name'], records: [{ index: 0, cells: { name: '<b>Bea</b>' } }] };
  const html = tableToHtml(doc).html;
  assert.ok(!html.includes('<b>Bea</b>'));
  assert.match(html, /&lt;b&gt;Bea&lt;\/b&gt;/);
});

test('tableToHtml: a missing cell renders blank, not "undefined"', () => {
  const doc = { columns: ['A', 'B'], keys: ['a', 'b'], records: [{ index: 0, cells: { a: 'x' } }] };
  const html = tableToHtml(doc).html;
  assert.match(html, /<td>x<\/td><td><\/td>/);
});

test('tableToHtml: truncates past maxRows and reports the real total', () => {
  const records = Array.from({ length: 30 }, (_, i) => ({ index: i, cells: { a: String(i) } }));
  const doc = { columns: ['A'], keys: ['a'], records };
  const { rows, truncated, html } = tableToHtml(doc, { maxRows: 10 });
  assert.equal(rows, 30, 'reports the real total, not the capped count');
  assert.equal(truncated, true);
  assert.equal((html.match(/<tr>/g) || []).length, 11, '10 body rows + the header row');
});

test('tableToHtml: an empty table still renders a header with an empty body', () => {
  const doc = { columns: ['A'], keys: ['a'], records: [] };
  const { html, rows } = tableToHtml(doc);
  assert.equal(rows, 0);
  assert.match(html, /<thead>.*<\/thead>/s);
  assert.match(html, /<tbody><\/tbody>/);
});
