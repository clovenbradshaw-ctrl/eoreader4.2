# Feeds, APIs, and civic data — importing the living record

> A document is a snapshot; a feed or an API is a *tap*. This is how the reader drinks from one —
> and, for civic data especially, how it FINDS the tap in the first place.

The web-search organs (`docs/web-search.md`) reach arbitrary pages and the reference/academic
shelves. This layer adds the three shapes that a document upload cannot cover:

- **Feeds** — RSS/Atom, read *whole*: a dated list of items, not one blob.
- **APIs** — any JSON/REST endpoint, navigated to its *records* and imported as a table.
- **Civic APIs** — the finding-and-navigating problem for government/open data, where the hard
  part is never the fetch but knowing *which* portal answers the question and *how* it is shaped.

All three are ingest organs (`src/organs/ingest/`), each a search **kind** on the same
`(ctx, query, k) → items[]` contract every source follows, registered in `webfetch.js`'s
`SEARCH_SOURCES`/`FULL_TEXT` and auto-routed by `routeKind(query)`. So the research walks pick them
up with no change — a data-shaped ask routes to `civic`, a pasted feed URL to `feed`, a JSON
endpoint to `api` — and each admits with the same `web-source/1` provenance as every other source.
Every organ is dependency-free but for the deliberate admit (`websource.admitWebSource`), so all
the parsing is offline-testable and none of them imports `webfetch` (cycle-safe, the rule
`arxiv.js`/`openalex.js` already follow).

## Feeds — `src/organs/ingest/feed.js`

`webfetch.js` had a thin `feed` kind that returned an RSS item's snippet. This organ reads a feed
ENTIRE and offers the same content three ways:

- **As sources** — `FEED_SOURCES.feed` returns every item as its own hit (title · link · date ·
  author · categories · summary); under `fetchPages`, `FEED_FULLTEXT.feed` pulls each item's
  LINKED ARTICLE, not just the RSS summary, with the summary as the floor.
- **As a table** — `feedToTable(items)` → `{ columns:[title, published, author, link, summary],
  rows }`, the exact shape `organs/in/table.js#ingestTable` takes, so the data room can
  sort/filter/count a feed like a CSV.
- **As one doc** — `feedToProse(meta, items)` renders the whole feed as dated blocks for a straight
  read.

`fetchFeed(url, { client })` is the deliberate whole-feed path (the twin of
`fetchGutenbergBook`/`fetchArxivPaper`): name a feed by URL and get `{ meta, items, table,
admitted }`. `parseFeedItems`, `feedMeta`, and `isFeed` are pure and exported.

Reach it: paste a feed URL, or phrase the ask with `rss`/`feed`/`atom` (`routeKind → feed`).

## Navigating an API — `src/organs/ingest/api.js`

A JSON API is a **table behind a URL**; the work is finding the records inside the envelope and
naming the columns. `api.js` does exactly that:

- `pickRecords(json, path?)` → `{ records, path }`. With a dotted `path` it navigates there; without
  one it tries the well-known envelope keys (`results`, `data`, `items`, `records`, `rows`,
  `features` for GeoJSON, `value` for OData/Socrata-over-OData, `docs` for Solr/CKAN), descends one
  level of nesting (`response.docs`), and falls back to the largest array-of-objects anywhere.
- `flattenRecord(obj)` → scalar cells with dotted keys for nesting (`geo.lat`); scalar arrays join.
- `recordsToTable(records)` → `{ name, columns, rows }` (union of keys, first-seen, capped with an
  overflow count) — a data-room table.
- `summarizeApi(url, records, table)` → the legible prose an admitted source reads as, so a claim
  can cite "record 12, `population` = 8,468,000" the way it cites a spreadsheet cell.

`fetchJsonApi(url, { client, path? })` is the deliberate path → `{ json, records, path, table,
admitted }`. `routeKind` sends JSON/REST-looking URLs (`.json`, an `/api/` path or `api.` host, a
`format=json`/`$limit`/`api_key` param, a Socrata `/resource/…json` query) to `api`; other URLs
stay `feed`/page.

## Civic APIs — `src/organs/ingest/civic.js`

"Import from a civic API" has two hard parts, and neither is the fetch:

1. **Which endpoint** answers this — `data.gov`, the Census, a city's Socrata portal,
   `congress.gov`, USAspending, the Federal Register?
2. **How is it navigated** — a CKAN portal is `package_search` → `package_show` → a resource URL; a
   Socrata portal is a catalog search → a SODA `resource/{id}.json` query; a bespoke REST API is
   its own routes.

So the organ carries a **catalog** and speaks the **two open-data protocols** the long tail shares.

### The catalog (`CIVIC_CATALOG`) — searchable offline

A curated, frozen list of civic APIs, each honest about its **protocol** (`ckan` | `socrata` |
`rest`), its **auth** (a free api.data.gov key covers Congress/FEC/GovInfo/Regulations; Census and
OpenStates want their own free key; the open-data protocols need none to *search*), and its worked
**examples**. `searchCatalog(query)` scores over name + tags + geography with NO network, so even
during a proxy outage the reader can still answer "which civic API is this?". Covered today:
`data.gov` (CKAN), US Census, Congress.gov, Federal Register, Regulations.gov, USAspending,
OpenFEC, GovInfo, OpenStates, OpenFEMA, BLS, Socrata (city/state portals), `data.gov.uk`,
`data.europa.eu`, the World Bank, and Nominatim geocoding. `renderCatalogEntry(entry)` is the full
navigation card (protocol · base · auth · examples) read out under `fetchPages`.

### CKAN — the protocol thousands of government portals share

`ckanSearchUrl(base, q)` → `package_search`; `parseCkanSearch(json)` returns datasets each with its
**resource URLs** (the actual CSV/JSON files, with format) plus a `package_show` link to navigate
deeper; `renderCkanDataset(d)` lists those resources as importable lines. Point
`api.js#fetchJsonApi` at a JSON resource URL to load its rows into the data room.

### Socrata — most US city/state open-data portals

`socrataCatalogUrl(q)` searches the discovery API across every Socrata domain;
`parseSocrataCatalog(json)` returns each dataset with its **domain + id** and a ready SODA import
URL (`socrataResourceUrl(domain, id, { q, limit })` → `https://{domain}/resource/{id}.json?$…`).

### One kind, both needs

`CIVIC_SOURCES.civic` answers both ways at once: it ALWAYS searches the catalog (so matching civic
APIs come back as navigable items), and when the ask reads data-shaped (`dataset`, `open data`,
`data.gov`, `permits`, `311`, `find …`) it ALSO runs CKAN (data.gov) + Socrata discovery, so real
datasets come back with their importable resource URLs. A portal outage drops that stream and the
catalog answer still lands — the kind never throws. `CIVIC_FULLTEXT.civic` reads the navigation
detail: a catalog card, a CKAN dataset's resources (resolving `package_show` if needed), or a LIVE
preview of a Socrata dataset's first rows so the columns are visible before a full import.

`discoverCivic(query, { client })` → `{ catalog, datasets }` is the deliberate discovery path;
`fetchCivicCatalog(query)` admits the offline "which API + how to navigate it" answer as a
groundable source with no network.

Reach it: ask for civic/open/government data, name a portal, or use census/legislation/campaign-
finance phrasing (`routeKind → civic`).

## The whole path, end to end

```
"find open data on restaurant inspections in NYC"
   → routeKind → civic
   → CIVIC_SOURCES.civic: catalog (points at Socrata/NYC Open Data)
                        + Socrata discovery finds the dataset (domain + id + SODA URL)
   → fetchPages → CIVIC_FULLTEXT.civic previews the dataset's first rows + columns
   → hand the SODA resource URL to api.js#fetchJsonApi
   → pickRecords → recordsToTable → the data room opens it as a sortable, citable table
```

Nothing here reaches the network on its own: the local talker only PROPOSES a query, and the
mechanical layer (a confirmed user action, or `auto` web mode) fetches through the same CORS proxy
seam every source uses. The privacy thesis of `docs/web-search.md` holds unchanged.

## Tests

Offline, with an injected fake fetch, mirroring `tests/webfetch.test.js`:
`tests/feed-ingest.test.js`, `tests/api-ingest.test.js`, `tests/civic.test.js`. The strict
`tests/contracts.test.js` requires the EO contract each new organ declares in
`src/organs/ingest/eo-contract.js`.
