// EO: SIG·INS·SEG·NUL(Void,Field,Network → Entity,Field,Network,Void, Binding,Making,Clearing) — barrel
// The ingest holon: structured-data surface forms → canonical EO tuples.
//
// EOT (docs/eot-surface-syntax.md) is the producer-friendly front end — punctuation shapes a
// model already knows, lowered losslessly to EO events with operator recovery, anchor minting,
// site derivation, and provenance. RDF/OWL imports lower THROUGH this same surface (§10).
export { parseEOT, eotDoc } from './eot.js';
// The inverse: render a reading (the live engine log, or canonical tuples) BACK into EOT surface
// — every ready event read out in the same line syntax a model writes, deduped, no-ops dropped,
// only vocabulary-remap RECs surfaced; what EOT cannot express is reported, never silently lost.
export { emitEot, eotText, tupleToEotLine, tuplesToEot, valueLiteral } from './eot-emit.js';
// Read an ingested doc INTO EoT, layered with what the reading THINKS: the structure it
// extracted (round-trippable canonical EoT) beside its prediction and surprise at every
// turning point — every predictive channel the engine has, run at the moment of ingest.
export { readIngest, readingJsonl, attachReading } from './read.js';
// Web pages as groundable sources: admit a fetched payload as a provenance-tagged prose doc
// that drops into the answer scope, cited + veto-checked like any source (docs/web-search.md).
export { admitWebSource, createWebStore, webRecord, webContentHash,
         toWebCitation, verifyCitation, engineDocId, recordIdForDoc, recordIdOf } from './websource.js';
// The live fetch/search client over a CORS feed proxy (search-by-feed → admit into scope).
export { createWebClient, searchAndAdmit, fetchAndAdmit, parseFeed, htmlToText,
         SEARCH_SOURCES, routeKind, DEFAULT_FEED_PROXY } from './webfetch.js';
// RSS/Atom feeds read WHOLE: every item with its date/author, as sources, as a data-room table,
// or as one dated doc; the linked article pulled under fetchPages (docs/civic-apis.md "Feeds").
export { fetchFeed, parseFeedItems, feedMeta, feedToTable, feedToProse, isFeed, feedHtmlToText,
         FEED_SOURCES, FEED_FULLTEXT } from './feed.js';
// Generic JSON/REST APIs → records: navigate to the records array, flatten to columns, admit the
// rows as a groundable source + a data-room table (docs/civic-apis.md "Navigating an API").
export { fetchJsonApi, pickRecords, getPath, flattenRecord, recordsToTable, summarizeApi,
         parseJson, API_SOURCES, API_FULLTEXT } from './api.js';
// Civic/government APIs — find AND navigate: a curated catalog (which API answers this?) plus the
// two open-data protocols, CKAN (data.gov) and Socrata, for live dataset discovery + import URLs.
export { CIVIC_CATALOG, searchCatalog, renderCatalogEntry, discoverCivic, fetchCivicCatalog,
         ckanSearchUrl, ckanPackageUrl, parseCkanSearch, renderCkanDataset,
         socrataCatalogUrl, socrataResourceUrl, parseSocrataCatalog,
         CIVIC_SOURCES, CIVIC_FULLTEXT } from './civic.js';
// Which endpoints answer a browser cross-origin, so the fetch can skip the proxy chain entirely —
// the Wikimedia API family and OpenAlex. Keeps the common search routes alive through a proxy outage.
export { directCorsUrl } from './direct-cors.js';
// The library sources: Project Gutenberg (search the catalog, read ENTIRE BOOKS as needed) and
// the Wikimedia reference shelf — every sister project plus Wikidata — as search kinds that ride
// the same fetch-through-proxy, admit-with-provenance path (docs/web-search.md).
export { fetchGutenbergBook, stripGutenbergBoilerplate, gutenbergIdOf,
         GUTENBERG_SOURCES, GUTENBERG_FULLTEXT } from './gutenberg.js';
export { WIKIMEDIA_PROJECTS, WIKIMEDIA_SOURCES, WIKIMEDIA_FULLTEXT,
         mediaWikiExtract, renderWikidataEntity } from './wikimedia.js';
// The open academic shelves: arXiv (search the API, read WHOLE PAPERS via ar5iv) and OpenAlex
// (scholarly discovery across every field, with cited_by_count as the good-specimen prior).
export { fetchArxivPaper, parseArxivAtom, arxivIdOf, reduceHtml,
         ARXIV_SOURCES, ARXIV_FULLTEXT } from './arxiv.js';
export { parseOpenAlex, deInvertAbstract, openalexIdOf,
         OPENALEX_SOURCES, OPENALEX_FULLTEXT } from './openalex.js';
// The raw web-content store: keep every fetched page in full, as binary, in OPFS (re-readable
// without a refetch); degrades to in-memory where OPFS is absent.
export { createRawStore, opfsAvailable, rawFileName, RAW_STORE_DIR } from './opfs-store.js';
// Also surface stripWebBoilerplate for callers that reduce a page before admission.
export { stripWebBoilerplate } from './websource.js';
