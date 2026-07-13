// EO: SIG·SEG·INS(Void → Field,Entity, Binding,Clearing,Making) — civic/government APIs: find & navigate
// Civic data is scattered across a hundred portals in three or four shared shapes — this organ is
// the MAP and the two protocols. (docs/civic-apis.md)
//
// "Import from an API, especially a civic one" has two hard parts, and neither is the fetch:
//   1. FINDING the right endpoint — which of data.gov, the Census, a city's Socrata portal,
//      Congress.gov, USAspending, the Federal Register answers *this* question; and
//   2. NAVIGATING it — a CKAN portal is `package_search` → `package_show` → a resource URL; a
//      Socrata portal is a catalog search → a SODA `resource/{id}.json` query; a bespoke REST API
//      is its own routes. api.js handles the fetch once you HAVE a URL; this organ gets you there.
//
// So it carries a curated CATALOG of civic APIs (CIVIC_CATALOG — each with its base, protocol,
// auth honesty, and worked examples) that is searchable OFFLINE, and it speaks the two open-data
// protocols the long tail shares — CKAN (thousands of government portals) and Socrata (most US
// city/state open-data sites) — so "search open data for X" returns real, navigable DATASETS with
// the exact resource URL api.js#fetchJsonApi then loads into the data room.
//
// Depends only on api.js (same organ family, one direction — api.js never imports civic) and
// websource.js. The catalog and every parser are pure and offline-testable; the network calls all
// ride the injected ctx.fetchUrl, so the tests never touch the wire. Never imports webfetch.

import { pickRecords, recordsToTable, flattenRecord, parseJson, summarizeApi } from './api.js';
import { admitWebSource } from './websource.js';

// ── The catalog — the civic APIs worth knowing, each honest about its protocol and its key ──────
// `protocol`: 'ckan' | 'socrata' | 'rest' — how you navigate it. `auth`: what a real request needs
// (a free api.data.gov key covers Congress/FEC/GovInfo/Regulations; Census/OpenStates want their
// own free key; the open-data protocols need none to search). `examples`: copy-pasteable endpoints.
export const CIVIC_CATALOG = Object.freeze([
  {
    id: 'data.gov', name: 'Data.gov (US federal open-data catalog)', protocol: 'ckan',
    base: 'https://catalog.data.gov', geography: 'US federal + state/local aggregations',
    tags: ['open data', 'datasets', 'catalog', 'ckan', 'federal'], auth: 'none for search',
    docs: 'https://catalog.data.gov/api/', note: 'CKAN — 300k+ datasets. package_search to find, package_show to list a dataset\'s resource URLs.',
    examples: ['https://catalog.data.gov/api/3/action/package_search?q=air+quality&rows=10'],
  },
  {
    id: 'census', name: 'US Census Bureau API', protocol: 'rest',
    base: 'https://api.census.gov/data', geography: 'US',
    tags: ['census', 'demographics', 'population', 'acs', 'economy'], auth: 'free key recommended (api.census.gov/data/key_signup.html)',
    docs: 'https://www.census.gov/data/developers/data-sets.html',
    note: 'Returns a header-row + value-rows array (a table already). Pick a dataset (e.g. acs/acs5), variables (get=NAME,B01001_001E), and a geography (for=state:*).',
    examples: ['https://api.census.gov/data/2022/acs/acs5?get=NAME,B01001_001E&for=state:*'],
  },
  {
    id: 'congress', name: 'Congress.gov API (bills, members, votes)', protocol: 'rest',
    base: 'https://api.congress.gov/v3', geography: 'US federal legislature',
    tags: ['congress', 'legislation', 'bills', 'members', 'law'], auth: 'free api.data.gov key (api_key= param)',
    docs: 'https://api.congress.gov/', note: 'Records live under `bills`/`members`/… envelopes — api.js#pickRecords finds them.',
    examples: ['https://api.congress.gov/v3/bill?api_key=DEMO_KEY&limit=10'],
  },
  {
    id: 'federalregister', name: 'Federal Register API (rules, notices)', protocol: 'rest',
    base: 'https://www.federalregister.gov/api/v1', geography: 'US federal',
    tags: ['regulations', 'rules', 'notices', 'executive', 'federal register'], auth: 'none',
    docs: 'https://www.federalregister.gov/developers/documentation/api/v1',
    note: 'No key. Records under `results`. Great for "what rules did agency X publish".',
    examples: ['https://www.federalregister.gov/api/v1/documents.json?per_page=10&conditions[term]=clean+water'],
  },
  {
    id: 'regulations', name: 'Regulations.gov API (dockets, comments)', protocol: 'rest',
    base: 'https://api.regulations.gov/v4', geography: 'US federal',
    tags: ['regulations', 'dockets', 'public comments', 'rulemaking'], auth: 'free api.data.gov key (X-Api-Key header or api_key=)',
    docs: 'https://open.gsa.gov/api/regulationsgov/', note: 'JSON:API shape — records under `data`.',
    examples: ['https://api.regulations.gov/v4/documents?filter[searchTerm]=water&api_key=DEMO_KEY'],
  },
  {
    id: 'usaspending', name: 'USAspending.gov API (federal spending)', protocol: 'rest',
    base: 'https://api.usaspending.gov/api/v2', geography: 'US federal',
    tags: ['spending', 'budget', 'awards', 'contracts', 'grants'], auth: 'none',
    docs: 'https://api.usaspending.gov/', note: 'No key. Many endpoints are POST with a JSON body; GET lookups (agencies, recipients) return `results`.',
    examples: ['https://api.usaspending.gov/api/v2/references/toptier_agencies/'],
  },
  {
    id: 'fec', name: 'OpenFEC API (campaign finance)', protocol: 'rest',
    base: 'https://api.open.fec.gov/v1', geography: 'US federal elections',
    tags: ['campaign finance', 'elections', 'donations', 'candidates', 'committees'], auth: 'free api.data.gov key (api_key=; DEMO_KEY for a taste)',
    docs: 'https://api.open.fec.gov/developers/', note: 'Records under `results`, with a `pagination` block.',
    examples: ['https://api.open.fec.gov/v1/candidates/?api_key=DEMO_KEY&per_page=10'],
  },
  {
    id: 'govinfo', name: 'GovInfo API (federal publications)', protocol: 'rest',
    base: 'https://api.govinfo.gov', geography: 'US federal',
    tags: ['bills', 'laws', 'congressional record', 'cfr', 'publications'], auth: 'free api.data.gov key (X-Api-Key)',
    docs: 'https://api.govinfo.gov/docs/', note: 'Collections + packages; search under `results`/`packages`.',
    examples: ['https://api.govinfo.gov/collections?api_key=DEMO_KEY'],
  },
  {
    id: 'openstates', name: 'OpenStates API (state legislatures)', protocol: 'rest',
    base: 'https://v3.openstates.org', geography: 'US states',
    tags: ['state legislature', 'bills', 'legislators', 'sessions'], auth: 'free key (X-API-Key; openstates.org/accounts/signup/)',
    docs: 'https://docs.openstates.org/api-v3/', note: 'Records under `results`. Covers all 50 state legislatures + DC/PR.',
    examples: ['https://v3.openstates.org/bills?jurisdiction=California&q=housing&apikey=YOUR_KEY'],
  },
  {
    id: 'openfema', name: 'OpenFEMA API (disasters, assistance)', protocol: 'rest',
    base: 'https://www.fema.gov/api/open', geography: 'US',
    tags: ['disasters', 'emergency', 'fema', 'assistance', 'flood'], auth: 'none',
    docs: 'https://www.fema.gov/about/openfema/api', note: 'No key. Each dataset is /v{n}/{Dataset}; records under a dataset-named key (pickRecords finds it).',
    examples: ['https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?$top=10'],
  },
  {
    id: 'bls', name: 'Bureau of Labor Statistics API', protocol: 'rest',
    base: 'https://api.bls.gov/publicAPI/v2', geography: 'US',
    tags: ['labor', 'employment', 'unemployment', 'wages', 'cpi', 'inflation'], auth: 'free key optional (raises rate limits)',
    docs: 'https://www.bls.gov/developers/', note: 'Timeseries API; a GET on a series returns `Results.series[].data`.',
    examples: ['https://api.bls.gov/publicAPI/v2/timeseries/data/LNS14000000'],
  },
  {
    id: 'socrata', name: 'Socrata Open Data (city/state portals)', protocol: 'socrata',
    base: 'https://api.us.socrata.com/api/catalog/v1', geography: 'US cities & states (NYC, Chicago, CA, …)',
    tags: ['open data', 'city data', 'socrata', 'soda', '311', 'inspections'], auth: 'none for search; free app token raises limits',
    docs: 'https://dev.socrata.com/', note: 'Discovery API finds datasets across every Socrata portal; each dataset is a SODA endpoint `https://{domain}/resource/{id}.json` you query with $where/$select/$q.',
    examples: ['https://api.us.socrata.com/api/catalog/v1?q=restaurant+inspections&limit=10'],
  },
  {
    id: 'data.gov.uk', name: 'data.gov.uk (UK open-data catalog)', protocol: 'ckan',
    base: 'https://data.gov.uk', geography: 'United Kingdom',
    tags: ['open data', 'uk', 'datasets', 'ckan'], auth: 'none for search',
    docs: 'https://guidance.data.gov.uk/', note: 'CKAN — same package_search / package_show flow as data.gov.',
    examples: ['https://data.gov.uk/api/3/action/package_search?q=flood&rows=10'],
  },
  {
    id: 'eu', name: 'data.europa.eu (EU open-data portal)', protocol: 'ckan',
    base: 'https://data.europa.eu/api/hub/search', geography: 'European Union',
    tags: ['open data', 'eu', 'europe', 'datasets'], auth: 'none for search',
    docs: 'https://data.europa.eu/en/developers-corner', note: 'CKAN-compatible search over 1M+ EU datasets.',
    examples: ['https://data.europa.eu/api/hub/search/ckan/package_search?q=energy&rows=10'],
  },
  {
    id: 'worldbank', name: 'World Bank Open Data API', protocol: 'rest',
    base: 'https://api.worldbank.org/v2', geography: 'Global (countries)',
    tags: ['development', 'economy', 'gdp', 'indicators', 'global', 'countries'], auth: 'none',
    docs: 'https://datahelpdesk.worldbank.org/knowledgebase/articles/889392',
    note: 'No key. Add &format=json; the payload is [pagination, records] — pickRecords takes the second element.',
    examples: ['https://api.worldbank.org/v2/country/US/indicator/NY.GDP.MKTP.CD?format=json'],
  },
  {
    id: 'nominatim', name: 'Nominatim (OpenStreetMap geocoding)', protocol: 'rest',
    base: 'https://nominatim.openstreetmap.org', geography: 'Global',
    tags: ['geocoding', 'address', 'coordinates', 'places', 'osm'], auth: 'none (fair-use; set a real referer)',
    docs: 'https://nominatim.org/release-docs/latest/api/Overview/', note: 'Turn an address into coordinates; add &format=json.',
    examples: ['https://nominatim.openstreetmap.org/search?q=city+hall+nyc&format=json&limit=5'],
  },
]);

// Strip HTML and decode the common entities from a portal's free-text notes (CKAN ships notes as
// HTML with entities un-decoded inside the JSON). Dependency-free, like the sibling organs.
const deHtml = (s) => String(s || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();

const norm = (s) => String(s || '').toLowerCase();
const tokens = (s) => norm(s).split(/[^a-z0-9.]+/).filter((t) => t.length > 1);

// searchCatalog(query, k) → the catalog entries that best match, scored offline over name + tags +
// note + geography + id. This is the "help me find the right civic API" core — it works with NO
// network, so even a proxy outage still answers "which API is this?". Ties break toward broader
// catalogs (data.gov, socrata) so a vague ask lands somewhere navigable.
export const searchCatalog = (query, k = 6) => {
  const qs = tokens(query);
  if (!qs.length) return CIVIC_CATALOG.slice(0, k).map((e) => ({ entry: e, score: 0 }));
  const scored = CIVIC_CATALOG.map((e) => {
    const hay = norm([e.id, e.name, e.geography, e.note, (e.tags || []).join(' ')].join(' '));
    const tagset = new Set(e.tags || []);
    let score = 0;
    for (const q of qs) {
      if (tagset.has(q)) score += 3;                        // an exact tag hit is strong
      if (norm(e.id) === q || norm(e.id).includes(q)) score += 3;
      if (hay.includes(q)) score += 1;
    }
    if (e.protocol === 'ckan' || e.protocol === 'socrata') score += 0.25;   // navigable long-tail bias
    return { entry: e, score };
  }).filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  return (scored.length ? scored : CIVIC_CATALOG.map((e) => ({ entry: e, score: 0 }))).slice(0, k);
};

// renderCatalogEntry(entry) → the full, legible navigation card for one API: what it is, its
// protocol and base, the auth it needs, and worked example URLs. This is what CIVIC_FULLTEXT reads
// out — the "how do I navigate this" the request asked for.
export const renderCatalogEntry = (e) => [
  `${e.name} [${e.id}]`,
  `Protocol: ${e.protocol.toUpperCase()} · Base: ${e.base}`,
  `Geography: ${e.geography}`,
  `Auth: ${e.auth}`,
  e.note,
  `Docs: ${e.docs}`,
  (e.examples || []).length ? 'Example requests:\n' + e.examples.map((x) => '  ' + x).join('\n') : '',
].filter(Boolean).join('\n');

// ── CKAN — the protocol thousands of government portals share ─────────────────────────────────
const ckanBase = (base) => String(base || 'https://catalog.data.gov').replace(/\/+$/, '').replace(/\/api\/3\/action.*$/, '');
export const ckanSearchUrl = (base, q, k = 10) =>
  `${ckanBase(base)}/api/3/action/package_search?q=${encodeURIComponent(q || '')}&rows=${Math.max(1, k)}`;
export const ckanPackageUrl = (base, id) =>
  `${ckanBase(base)}/api/3/action/package_show?id=${encodeURIComponent(id || '')}`;

// parseCkanSearch(json, base) → datasets as navigable items: title, the org, the notes, and — the
// point — each dataset's RESOURCE URLs (the actual data files/APIs) with their format. `datasetUrl`
// is the package_show link to navigate deeper.
export const parseCkanSearch = (json, base) => {
  const results = json?.result?.results || json?.results || [];
  return (Array.isArray(results) ? results : []).map((d) => ({
    id: d.name || d.id,
    title: d.title || d.name || '(untitled dataset)',
    notes: deHtml(d.notes),
    organization: d.organization?.title || d.organization?.name || '',
    resources: (d.resources || []).map((r) => ({ name: r.name || r.format || 'resource', format: (r.format || '').toUpperCase(), url: r.url })).filter((r) => r.url),
    datasetUrl: ckanPackageUrl(base, d.name || d.id),
  }));
};

// renderCkanDataset(dataset) → a dataset's resources as legible, importable lines — each resource's
// format + URL, so the reader can hand a JSON/CSV resource URL to api.js#fetchJsonApi next.
export const renderCkanDataset = (d) => {
  const head = [d.title, d.organization && `by ${d.organization}`, d.notes].filter(Boolean).join('\n');
  const res = (d.resources || []).length
    ? 'Resources (importable):\n' + d.resources.map((r) => `  [${r.format || '?'}] ${r.name} — ${r.url}`).join('\n')
    : 'No downloadable resources listed.';
  return [head, res].filter(Boolean).join('\n\n');
};

// ── Socrata — most US city/state open-data portals ───────────────────────────────────────────
export const socrataCatalogUrl = (q, k = 10) =>
  `https://api.us.socrata.com/api/catalog/v1?q=${encodeURIComponent(q || '')}&limit=${Math.max(1, k)}`;
// The SODA query URL for a dataset — this is what api.js#fetchJsonApi loads into the data room.
export const socrataResourceUrl = (domain, id, { q = '', limit = 100 } = {}) => {
  const base = `https://${String(domain).replace(/^https?:\/\//, '').replace(/\/+$/, '')}/resource/${id}.json?$limit=${limit}`;
  return q ? `${base}&$q=${encodeURIComponent(q)}` : base;
};

// parseSocrataCatalog(json) → datasets across every Socrata portal, each with its DOMAIN + id, so
// socrataResourceUrl can build the SODA query. `permalink` opens the dataset page for a human.
export const parseSocrataCatalog = (json) => {
  const results = json?.results || [];
  return (Array.isArray(results) ? results : []).map((d) => {
    const r = d.resource || {};
    const domain = d.metadata?.domain || '';
    const id = r.id;
    return {
      id, domain,
      title: r.name || '(untitled dataset)',
      notes: String(r.description || '').replace(/\s+/g, ' ').trim(),
      permalink: d.permalink || (d.link) || '',
      apiUrl: id && domain ? socrataResourceUrl(domain, id) : '',
      updated: r.updatedAt || '',
    };
  }).filter((d) => d.id && d.domain);
};

const nowIso = () => { try { return new Date().toISOString(); } catch { return null; } };

// isCkanBody / isSocrataBody — recognise a portal's JSON so a fetched URL routes to the right
// renderer even when the caller didn't say which protocol it was.
export const isCkanBody = (json) => !!(json && (json.result?.results || (json.help && json.success !== undefined)));
export const isSocrataBody = (json) => !!(json && Array.isArray(json.results) && json.results[0]?.resource);

// The search KIND (webfetch.js SEARCH_SOURCES shape): (ctx, query, k) → items. It answers TWO
// needs at once, because "civic" is asked both ways:
//   • WHICH API — always search the offline catalog, so matching civic APIs come back as
//     navigable items (title = the API, url = its docs, the full card under fetchPages);
//   • WHICH DATASET — when the query reads like an open-data lookup, also run CKAN (data.gov) and
//     Socrata discovery, so real datasets come back with their importable resource URLs.
// Never throws — a portal outage just drops that stream and the catalog answer still lands.
export const CIVIC_SOURCES = {
  civic: async (ctx, query, k = 8) => {
    const q = String(query || '').trim();
    const items = [];
    // 1) the catalog — offline, always answers "which civic API?"
    for (const { entry } of searchCatalog(q, Math.max(3, Math.ceil(k / 2)))) {
      items.push({
        title: entry.name, text: entry.note, url: entry.docs,
        source: 'civic', civicKind: 'catalog', _entry: entry,
      });
    }
    // 2) live dataset discovery — only when the ask is data-shaped (avoid a needless network hit
    //    on a pure "which API" question), and best-effort.
    const dataShaped = /\b(dataset|datasets|open data|data\.gov|csv|records|download|inspection|permits?|311|budget|spending|crime|housing|transit)\b/i.test(q) || /\bfind\b/i.test(q);
    if (dataShaped && q) {
      try {
        const json = parseJson((await ctx.fetchUrl(ckanSearchUrl('https://catalog.data.gov', q, k))).text);
        for (const d of parseCkanSearch(json, 'https://catalog.data.gov').slice(0, k)) {
          items.push({
            title: `${d.title} · data.gov`, text: d.notes || d.title, url: d.datasetUrl,
            source: 'civic', civicKind: 'ckan', _dataset: d,
          });
        }
      } catch { /* data.gov hiccup — the catalog answer still stands */ }
      try {
        const json = parseJson((await ctx.fetchUrl(socrataCatalogUrl(q, k))).text);
        for (const d of parseSocrataCatalog(json).slice(0, k)) {
          items.push({
            title: `${d.title} · ${d.domain}`, text: d.notes || d.title, url: d.apiUrl || d.permalink,
            source: 'civic', civicKind: 'socrata', _dataset: d,
          });
        }
      } catch { /* socrata hiccup — ditto */ }
    }
    return items.slice(0, k);
  },
};

// The FULL-TEXT hook: under fetchPages, a civic item reads its NAVIGATION detail —
//   • a catalog item → the full API card (endpoints, auth, examples) — renderCatalogEntry;
//   • a CKAN dataset → its resources as importable lines — fetch package_show if needed;
//   • a Socrata dataset → a live PREVIEW of its rows (fetch the SODA URL, summarise) so the reader
//     sees the actual data and its columns before a full import.
export const CIVIC_FULLTEXT = {
  civic: async (client, item) => {
    if (item?.civicKind === 'catalog' && item._entry) return renderCatalogEntry(item._entry);
    if (item?.civicKind === 'ckan' && item._dataset) {
      const d = item._dataset;
      if (d.resources?.length) return renderCkanDataset(d);
      try {                                                 // resolve resources via package_show
        const json = parseJson((await client.fetchUrl(d.datasetUrl)).text);
        const full = json?.result || json;
        const resources = (full?.resources || []).map((r) => ({ name: r.name || r.format, format: (r.format || '').toUpperCase(), url: r.url })).filter((r) => r.url);
        return renderCkanDataset({ ...d, notes: d.notes || deHtml(full?.notes), resources });
      } catch { return renderCkanDataset(d); }
    }
    if (item?.civicKind === 'socrata' && item._dataset?.apiUrl) {
      try {
        const json = parseJson((await client.fetchUrl(socrataResourceUrl(item._dataset.domain, item._dataset.id, { limit: 25 }))).text);
        const { records } = pickRecords(json);
        const rows = records.length ? records : (Array.isArray(json) ? json : [json]);
        const table = recordsToTable(rows, { name: item._dataset.title });
        return `${item._dataset.title} — ${item._dataset.domain}\nSODA endpoint: ${item._dataset.apiUrl}\n\n` +
               summarizeApi(item._dataset.apiUrl, rows, table, { previewRows: 25 });
      } catch { return item?.text || ''; }
    }
    return item?.text || '';
  },
};

// discoverCivic(query, opts) → { catalog, datasets } — the DELIBERATE discovery path: which civic
// APIs match, and (best-effort, live) which data.gov/Socrata datasets, each with its importable
// resource URL. The reader hands a chosen resource URL to api.js#fetchJsonApi to load the rows.
export const discoverCivic = async (query, { client } = {}) => {
  const catalog = searchCatalog(query).map((s) => s.entry);
  const datasets = [];
  if (client && query) {
    try {
      const json = parseJson((await client.fetchUrl(ckanSearchUrl('https://catalog.data.gov', query, 10))).text);
      for (const d of parseCkanSearch(json, 'https://catalog.data.gov')) datasets.push({ portal: 'data.gov', protocol: 'ckan', ...d });
    } catch { /* best-effort */ }
    try {
      const json = parseJson((await client.fetchUrl(socrataCatalogUrl(query, 10))).text);
      for (const d of parseSocrataCatalog(json)) datasets.push({ portal: d.domain, protocol: 'socrata', ...d });
    } catch { /* best-effort */ }
  }
  return { catalog, datasets };
};

// fetchCivicCatalog(query) → matching catalog entries admitted as ONE navigation source — the
// offline "which civic API + how to navigate it" answer, groundable and citable. No network.
export const fetchCivicCatalog = (query, { store = null, fetched_at = nowIso() } = {}) => {
  const entries = searchCatalog(query).map((s) => s.entry);
  const text = entries.map(renderCatalogEntry).join('\n\n———\n\n');
  const payload = {
    url: 'civic:catalog', title: `Civic APIs for "${query}"`, text,
    excerpt: entries.map((e) => e.name).join(' · '),
    retrieval_query: String(query), engine: 'civic:catalog', fetched_at,
  };
  return { entries, admitted: store ? store.admit(payload) : admitWebSource(payload) };
};
