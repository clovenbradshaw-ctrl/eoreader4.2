import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  getPath, pickRecords, flattenRecord, recordsToTable, summarizeApi, parseJson,
  recordId, apiPointer, API_SOURCES, API_FULLTEXT, fetchJsonApi,
} from '../src/organs/ingest/api.js';
import { routeKind } from '../src/organs/ingest/webfetch.js';

// A JSON API is a table behind a URL (docs/civic-apis.md "Navigating an API"). The navigation and
// flattening are pure and offline-testable; the fetch rides an injected ctx.

test('getPath walks dotted paths incl. array indices, undefined on a miss', () => {
  const j = { response: { docs: [{ id: 1 }, { id: 2 }] } };
  assert.deepEqual(getPath(j, 'response.docs'), [{ id: 1 }, { id: 2 }]);
  assert.equal(getPath(j, 'response.docs.1.id'), 2);
  assert.equal(getPath(j, 'response.missing'), undefined);
  assert.equal(getPath(j, ''), j);
});

test('pickRecords finds the well-known envelope keys', () => {
  assert.equal(pickRecords({ results: [{ a: 1 }] }).path, 'results');
  assert.equal(pickRecords({ data: [{ a: 1 }] }).path, 'data');
  assert.deepEqual(pickRecords({ items: [{ a: 1 }, { a: 2 }] }).records, [{ a: 1 }, { a: 2 }]);
});

test('pickRecords descends one level of nesting (Solr/CKAN response.docs)', () => {
  const j = { response: { docs: [{ id: 'x' }] } };
  const p = pickRecords(j);
  assert.equal(p.path, 'response.docs');
  assert.deepEqual(p.records, [{ id: 'x' }]);
});

test('pickRecords takes a bare top-level array, and honours an explicit path', () => {
  assert.deepEqual(pickRecords([{ a: 1 }]).records, [{ a: 1 }]);
  const j = { weird: { nested: { rows: [{ a: 1 }] } } };
  assert.deepEqual(pickRecords(j, 'weird.nested.rows').records, [{ a: 1 }]);
  // path points at the envelope, not the array → descend to the records key
  assert.equal(pickRecords({ payload: { results: [{ a: 1 }] } }, 'payload').path, 'payload.results');
});

test('pickRecords falls back to the largest array-of-objects when there is no envelope', () => {
  const j = { meta: { note: 'hi' }, blob: { series: [{ v: 1 }, { v: 2 }, { v: 3 }] } };
  const p = pickRecords(j);
  assert.deepEqual(p.records.length, 3);
  assert.match(p.path, /series$/);
});

test('flattenRecord dots nested objects, joins scalar arrays', () => {
  const f = flattenRecord({ name: 'A', geo: { lat: 1, lng: 2 }, tags: ['x', 'y'] });
  assert.equal(f.name, 'A');
  assert.equal(f['geo.lat'], 1);
  assert.equal(f['geo.lng'], 2);
  assert.equal(f.tags, 'x; y');
});

test('recordsToTable unions keys first-seen (a late field never vanishes)', () => {
  const t = recordsToTable([{ a: 1 }, { a: 2, b: 3 }], { name: 'x' });
  assert.deepEqual(t.columns, ['a', 'b']);
  assert.equal(t.rows.length, 2);
  assert.equal(t.rows[0].b, '');        // missing cell is empty, not dropped
  assert.equal(t.rows[1].b, 3);
});

test('recordsToTable caps columns and reports the overflow', () => {
  const wide = {}; for (let i = 0; i < 100; i++) wide['c' + i] = i;
  const t = recordsToTable([wide], { name: 'x', maxCols: 10 });
  assert.equal(t.columns.length, 10);
  assert.equal(t.droppedColumns, 90);
});

test('summarizeApi renders header + fields + previewed rows', () => {
  const recs = [{ name: 'Aville', population: 100 }, { name: 'Bville', population: 200 }];
  const t = recordsToTable(recs, { name: 'cities' });
  const s = summarizeApi('https://api.example/cities', recs, t);
  assert.match(s, /2 records · 2 fields/);
  assert.match(s, /Fields: name, population/);
  assert.match(s, /name: Aville/);
});

test('parseJson tolerates a BOM and returns null on garbage', () => {
  assert.deepEqual(parseJson('﻿{"a":1}'), { a: 1 });
  assert.equal(parseJson('<html>not json</html>'), null);
});

// ── the search KIND + full-text hook ─────────────────────────────────────────
const ctxFor = (bodies) => ({ fetchUrl: async (url) => ({ text: bodies[url] ?? '' }) });
const CITIES = JSON.stringify({ results: [
  { name: 'Aville', population: 100, region: { code: 'N' } },
  { name: 'Bville', population: 200, region: { code: 'S' } },
] });

test('API_SOURCES.api fetches JSON, navigates to records, returns them as hits', async () => {
  const url = 'https://api.example/cities.json';
  const items = await API_SOURCES.api(ctxFor({ [url]: CITIES }), url, 8);
  assert.equal(items.length, 2);
  assert.equal(items[0].source, 'api');
  assert.equal(items[0].title, 'Aville');
  assert.match(items[0].text, /population: 100/);
  assert.match(items[0].text, /region\.code: N/);
});

test('API_SOURCES.api returns [] for a non-URL query or a non-JSON body', async () => {
  assert.deepEqual(await API_SOURCES.api(ctxFor({}), 'cities near me', 8), []);
  const url = 'https://api.example/page';
  assert.deepEqual(await API_SOURCES.api(ctxFor({ [url]: '<html>no</html>' }), url, 8), []);
});

test('API_SOURCES.api handles a single-object endpoint as one legible hit', async () => {
  const url = 'https://api.example/status.json';
  const items = await API_SOURCES.api(ctxFor({ [url]: '{"status":"ok","version":3}' }), url, 8);
  assert.equal(items.length, 1);
  assert.match(items[0].text, /status: ok/);
});

test('API_FULLTEXT.api reads the whole endpoint summarised', async () => {
  const url = 'https://api.example/cities.json';
  const full = await API_FULLTEXT.api(ctxFor({ [url]: CITIES }), { url });
  assert.match(full, /2 records/);
  assert.match(full, /Bville/);
});

test('recordId reads a stable id field, else null', () => {
  assert.equal(recordId({ id: 7, name: 'x' }), '7');
  assert.equal(recordId({ uuid: 'ab-cd' }), 'ab-cd');
  assert.equal(recordId({ name: 'no id here' }), null);
});

test('apiPointer keeps the endpoint + path + record ids — never the bodies', () => {
  const json = { results: [{ id: 'a', v: 1 }, { id: 'b', v: 2 }] };
  const p = apiPointer('https://api.example/x.json', pickRecords(json));
  assert.equal(p.schema, 'api-pointer/1');
  assert.equal(p.url, 'https://api.example/x.json');
  assert.equal(p.path, 'results');
  assert.equal(p.count, 2);
  assert.deepEqual(p.ids, ['a', 'b']);
  assert.equal('records' in p, false, 'the record bodies are NOT on the pointer');
});

test('fetchJsonApi DEFAULTS to pointer-only — records for viewing, nothing stored', async () => {
  const url = 'https://api.example/cities.json';
  const out = await fetchJsonApi(url, { client: ctxFor({ [url]: CITIES }) });
  assert.equal(out.records.length, 2);
  assert.equal(out.path, 'results');
  assert.deepEqual(out.table.columns, ['name', 'population', 'region.code']);   // in-memory view
  assert.equal(out.pointer.url, url);
  assert.equal(out.pointer.count, 2);
  assert.equal(out.admitted, null, 'nothing admitted/stored by default');
});

test('fetchJsonApi with { admit:true } opts IN to storing the payload as a source', async () => {
  const url = 'https://api.example/cities.json';
  const out = await fetchJsonApi(url, { client: ctxFor({ [url]: CITIES }), admit: true });
  assert.equal(out.admitted.record.engine, 'web:api');
  assert.ok(out.pointer, 'the pointer is returned either way');
});

test('fetchJsonApi navigates a caller-given path past a non-standard envelope', async () => {
  const url = 'https://api.example/weird';
  const body = JSON.stringify({ payload: { rows: [{ id: 1 }, { id: 2 }] } });
  const out = await fetchJsonApi(url, { client: ctxFor({ [url]: body }), path: 'payload.rows' });
  assert.equal(out.records.length, 2);
});

test('routeKind sends JSON/REST endpoint URLs to api, article/feed URLs to feed', () => {
  assert.equal(routeKind('https://api.census.gov/data/2022/acs/acs5?get=NAME'), 'api');
  assert.equal(routeKind('https://data.city.gov/resource/abcd-1234.json?$limit=100'), 'api');
  assert.equal(routeKind('https://open.gov/things.json'), 'api');
  assert.equal(routeKind('https://api.open.fec.gov/v1/candidates/?api_key=DEMO_KEY'), 'api');
  assert.equal(routeKind('https://blog.example.com/post/hello'), 'feed');
  assert.equal(routeKind('call the rest api endpoint for permits'), 'api');
});
