import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CIVIC_CATALOG, searchCatalog, renderCatalogEntry,
  ckanSearchUrl, ckanPackageUrl, parseCkanSearch, renderCkanDataset,
  socrataCatalogUrl, socrataResourceUrl, parseSocrataCatalog, isCkanBody, isSocrataBody,
  CIVIC_SOURCES, CIVIC_FULLTEXT, discoverCivic, fetchCivicCatalog,
} from '../src/organs/ingest/civic.js';
import { routeKind } from '../src/organs/ingest/webfetch.js';

// Civic APIs — find AND navigate (docs/civic-apis.md). The catalog + every parser is pure and
// offline-testable; the two protocol clients (CKAN/Socrata) ride an injected fetch.

test('the catalog is a frozen list of well-formed civic APIs', () => {
  assert.ok(CIVIC_CATALOG.length >= 12);
  for (const e of CIVIC_CATALOG) {
    assert.ok(e.id && e.name && e.base, `entry missing id/name/base: ${JSON.stringify(e)}`);
    assert.ok(['ckan', 'socrata', 'rest'].includes(e.protocol), `bad protocol: ${e.protocol}`);
    assert.ok(Array.isArray(e.tags) && e.tags.length, `entry ${e.id} has no tags`);
    assert.ok(typeof e.auth === 'string', `entry ${e.id} missing auth honesty`);
  }
  assert.throws(() => { CIVIC_CATALOG.push({}); });   // frozen
});

test('searchCatalog finds the right API by topic, offline', () => {
  assert.equal(searchCatalog('campaign finance donations')[0].entry.id, 'fec');
  assert.equal(searchCatalog('population demographics census')[0].entry.id, 'census');
  assert.equal(searchCatalog('bills in congress')[0].entry.id, 'congress');
  assert.equal(searchCatalog('restaurant inspections city open data')[0].entry.id, 'socrata');
  assert.equal(searchCatalog('federal spending awards')[0].entry.id, 'usaspending');
});

test('searchCatalog returns something navigable even for a vague ask', () => {
  const hits = searchCatalog('government data');
  assert.ok(hits.length > 0);
  assert.ok(hits.every((h) => h.entry.id));
});

test('renderCatalogEntry shows protocol, auth, and worked examples', () => {
  const card = renderCatalogEntry(CIVIC_CATALOG.find((e) => e.id === 'census'));
  assert.match(card, /Protocol: REST/);
  assert.match(card, /Auth:/);
  assert.match(card, /Example requests:/);
  assert.match(card, /api\.census\.gov/);
});

// ── CKAN ─────────────────────────────────────────────────────────────────────
test('ckanSearchUrl / ckanPackageUrl build the action API URLs and normalise the base', () => {
  assert.equal(ckanSearchUrl('https://catalog.data.gov', 'air quality', 5),
    'https://catalog.data.gov/api/3/action/package_search?q=air%20quality&rows=5');
  assert.equal(ckanPackageUrl('https://catalog.data.gov/', 'my-dataset'),
    'https://catalog.data.gov/api/3/action/package_show?id=my-dataset');
});

const CKAN_SEARCH = JSON.stringify({
  success: true, help: 'https://catalog.data.gov/api/3/action/help_show',
  result: { count: 1, results: [{
    name: 'air-quality-monitors', title: 'Air Quality Monitors',
    notes: '<p>Hourly readings from &amp; sensors.</p>',
    organization: { title: 'EPA' },
    resources: [
      { name: 'Readings (CSV)', format: 'CSV', url: 'https://epa.example/aq.csv' },
      { name: 'Readings (JSON API)', format: 'JSON', url: 'https://epa.example/aq.json' },
    ],
  }] },
});

test('parseCkanSearch returns datasets with their importable resource URLs', () => {
  const ds = parseCkanSearch(JSON.parse(CKAN_SEARCH), 'https://catalog.data.gov');
  assert.equal(ds.length, 1);
  assert.equal(ds[0].id, 'air-quality-monitors');
  assert.equal(ds[0].organization, 'EPA');
  assert.match(ds[0].notes, /Hourly readings from & sensors\./);   // HTML+entity cleaned
  assert.equal(ds[0].resources.length, 2);
  assert.equal(ds[0].resources[1].url, 'https://epa.example/aq.json');
  assert.match(ds[0].datasetUrl, /package_show\?id=air-quality-monitors/);
});

test('renderCkanDataset lists resources as importable lines', () => {
  const ds = parseCkanSearch(JSON.parse(CKAN_SEARCH), 'https://catalog.data.gov')[0];
  const out = renderCkanDataset(ds);
  assert.match(out, /Air Quality Monitors/);
  assert.match(out, /by EPA/);
  assert.match(out, /\[CSV\] Readings \(CSV\) — https:\/\/epa\.example\/aq\.csv/);
});

test('isCkanBody recognises a CKAN payload', () => {
  assert.equal(isCkanBody(JSON.parse(CKAN_SEARCH)), true);
  assert.equal(isCkanBody({ foo: 1 }), false);
});

// ── Socrata ──────────────────────────────────────────────────────────────────
test('socrataCatalogUrl / socrataResourceUrl build discovery + SODA URLs', () => {
  assert.equal(socrataCatalogUrl('inspections', 5),
    'https://api.us.socrata.com/api/catalog/v1?q=inspections&limit=5');
  assert.equal(socrataResourceUrl('data.cityofnewyork.us', '43nn-pn8j'),
    'https://data.cityofnewyork.us/resource/43nn-pn8j.json?$limit=100');
  assert.match(socrataResourceUrl('data.cityofnewyork.us', '43nn-pn8j', { q: 'pizza', limit: 5 }),
    /\$limit=5&\$q=pizza/);
});

const SOCRATA_CATALOG = JSON.stringify({ results: [{
  resource: { id: '43nn-pn8j', name: 'DOHMH Restaurant Inspections', description: 'Inspection results.', updatedAt: '2026-07-01' },
  metadata: { domain: 'data.cityofnewyork.us' },
  permalink: 'https://data.cityofnewyork.us/d/43nn-pn8j',
}] });

test('parseSocrataCatalog returns datasets with domain, id, and the SODA import URL', () => {
  const ds = parseSocrataCatalog(JSON.parse(SOCRATA_CATALOG));
  assert.equal(ds.length, 1);
  assert.equal(ds[0].id, '43nn-pn8j');
  assert.equal(ds[0].domain, 'data.cityofnewyork.us');
  assert.equal(ds[0].apiUrl, 'https://data.cityofnewyork.us/resource/43nn-pn8j.json?$limit=100');
  assert.equal(ds[0].permalink, 'https://data.cityofnewyork.us/d/43nn-pn8j');
});

test('isSocrataBody recognises a Socrata discovery payload', () => {
  assert.equal(isSocrataBody(JSON.parse(SOCRATA_CATALOG)), true);
  assert.equal(isSocrataBody({ results: [{ a: 1 }] }), false);
});

// ── the search KIND + full-text hook ─────────────────────────────────────────
const ctxFor = (bodies) => ({ fetchUrl: async (url) => ({ text: bodies[url] ?? '' }) });

test('CIVIC_SOURCES.civic answers "which API" from the catalog with no network', async () => {
  const items = await CIVIC_SOURCES.civic(ctxFor({}), 'campaign finance', 6);
  assert.ok(items.length > 0);
  assert.ok(items.some((it) => it.civicKind === 'catalog'));
  assert.equal(items[0].source, 'civic');
});

test('CIVIC_SOURCES.civic also discovers datasets when the ask is data-shaped', async () => {
  const bodies = {
    [ckanSearchUrl('https://catalog.data.gov', 'air quality datasets', 8)]: CKAN_SEARCH,
    [socrataCatalogUrl('air quality datasets', 8)]: SOCRATA_CATALOG,
  };
  const items = await CIVIC_SOURCES.civic(ctxFor(bodies), 'air quality datasets', 8);
  assert.ok(items.some((it) => it.civicKind === 'ckan'), 'includes a data.gov dataset');
  assert.ok(items.some((it) => it.civicKind === 'socrata'), 'includes a Socrata dataset');
});

test('CIVIC_SOURCES.civic survives a portal outage — the catalog answer still lands', async () => {
  const throwing = { fetchUrl: async () => { throw new Error('proxy down'); } };
  const items = await CIVIC_SOURCES.civic(throwing, 'open data on housing', 8);
  assert.ok(items.some((it) => it.civicKind === 'catalog'));
});

test('CIVIC_FULLTEXT renders the catalog card, and a Socrata data preview', async () => {
  const catItem = { civicKind: 'catalog', _entry: CIVIC_CATALOG.find((e) => e.id === 'fec') };
  assert.match(await CIVIC_FULLTEXT.civic(ctxFor({}), catItem), /OpenFEC|campaign finance/i);

  const soURL = 'https://data.cityofnewyork.us/resource/43nn-pn8j.json?$limit=25';
  const preview = JSON.stringify([{ dba: 'Joe Pizza', grade: 'A' }, { dba: 'Corner Deli', grade: 'B' }]);
  const soItem = { civicKind: 'socrata', _dataset: { id: '43nn-pn8j', domain: 'data.cityofnewyork.us', title: 'Inspections', apiUrl: 'x' } };
  const out = await CIVIC_FULLTEXT.civic(ctxFor({ [soURL]: preview }), soItem);
  assert.match(out, /Joe Pizza/);
  assert.match(out, /grade: A/);
});

test('discoverCivic returns the catalog + live datasets', async () => {
  const bodies = {
    [ckanSearchUrl('https://catalog.data.gov', 'flood', 10)]: CKAN_SEARCH,
    [socrataCatalogUrl('flood', 10)]: SOCRATA_CATALOG,
  };
  const { catalog, datasets } = await discoverCivic('flood', { client: ctxFor(bodies) });
  assert.ok(catalog.length > 0);
  assert.equal(datasets.filter((d) => d.protocol === 'ckan').length, 1);
  assert.equal(datasets.filter((d) => d.protocol === 'socrata').length, 1);
});

test('fetchCivicCatalog admits an offline navigation source', () => {
  const { entries, admitted } = fetchCivicCatalog('census population');
  assert.ok(entries.some((e) => e.id === 'census'));
  assert.equal(admitted.record.engine, 'civic:catalog');
});

test('routeKind sends civic/open-data phrasing to civic', () => {
  assert.equal(routeKind('find open data on air quality'), 'civic');
  assert.equal(routeKind('census population by county'), 'civic');
  assert.equal(routeKind('data.gov datasets about flooding'), 'civic');
  assert.equal(routeKind('campaign finance for the 2024 election'), 'civic');
  assert.equal(routeKind('which government api has bill votes'), 'civic');
});
