// EO: SIG·SEG(Void → Field, Binding,Dissecting) — Wikimedia reference shelf + Wikidata
// The Wikimedia reference family as research sources — every sister project, one shape.
// (docs/web-search.md "The library sources")
//
// Wikipedia was already a search kind (webfetch.js). But the Wikimedia Foundation runs a whole
// REFERENCE SHELF on the same MediaWiki API — a dictionary (Wiktionary), a quotation ledger
// (Wikiquote), a primary-source library (Wikisource), textbooks (Wikibooks), course material
// (Wikiversity), citizen news (Wikinews), travel guides (Wikivoyage), a species directory
// (Wikispecies), and the media commons — plus Wikidata, the structured-fact backbone under all
// of them. Because every wiki speaks the SAME two calls (list=search to find, prop=extracts to
// read the whole page as plain text), one factory covers the shelf: each project becomes a
// search KIND (webfetch.js SEARCH_SOURCES shape) with a FULL-TEXT hook that reads the entire
// page — the same fetch-through-proxy, admit-with-provenance path every web source travels.
//
// Wikidata is the exception worth its own reader: an entity is CLAIMS, not prose, so its
// full-text hook renders the entity legibly — label, description, aliases, then each statement
// as a `property: value` line with the ids resolved to labels in one batched lookup — so the
// parser reads relations, not Q-numbers.

// ── The shelf ─────────────────────────────────────────────────────────────────────────────────
// kind → { host, label }: every reference project on wikimediafoundation.org/what-we-do/
// wikimedia-projects. Language editions default to English; swap the host to read another.
export const WIKIMEDIA_PROJECTS = {
  wiktionary:  { host: 'en.wiktionary.org',      label: 'Wiktionary'  },   // dictionary: definitions, etymology
  wikiquote:   { host: 'en.wikiquote.org',       label: 'Wikiquote'   },   // sourced quotations
  wikisource:  { host: 'en.wikisource.org',      label: 'Wikisource'  },   // primary sources, full original texts
  wikibooks:   { host: 'en.wikibooks.org',       label: 'Wikibooks'   },   // open textbooks
  wikiversity: { host: 'en.wikiversity.org',     label: 'Wikiversity' },   // course & research material
  wikinews:    { host: 'en.wikinews.org',        label: 'Wikinews'    },   // citizen journalism
  wikivoyage:  { host: 'en.wikivoyage.org',      label: 'Wikivoyage'  },   // travel guides
  wikispecies: { host: 'species.wikimedia.org',  label: 'Wikispecies' },   // taxonomy directory
  commons:     { host: 'commons.wikimedia.org',  label: 'Wikimedia Commons' },  // media descriptions
};

const apiBase = (host) => `https://${host}/w/api.php`;
export const wikiPageUrlOn = (host, title) =>
  `https://${host}/wiki/${encodeURIComponent(String(title).replace(/ /g, '_'))}`;

// A snippet arrives as HTML (<span class="searchmatch">…</span>) — reduce it without pulling
// the full htmlToText machinery in (and avoiding a circular import with webfetch.js).
const snippetText = (html) => String(html || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ').trim();

// mediaWikiSearch(ctx, host, query, k) → search hits on ANY MediaWiki instance — the same
// list=search call the wikipedia kind has always made, parameterized by host.
export const mediaWikiSearch = async (ctx, host, query, k, source) => {
  const url = `${apiBase(host)}?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=${k}`;
  const j = JSON.parse((await ctx.fetchUrl(url)).text);
  return (j?.query?.search || []).map((h) => ({
    title: h.title, text: snippetText(h.snippet) || h.title,
    url: wikiPageUrlOn(host, h.title), source, mwHost: host,
  }));
};

// mediaWikiExtract(client, host, title) → the WHOLE page as plain text via TextExtracts —
// no nav/sidebar/footer chrome, the same clean read wikiExtract has always done for Wikipedia,
// on any project of the family. Returns '' on any failure (the caller keeps the snippet).
export const mediaWikiExtract = async (client, host, title) => {
  if (!title) return '';
  const url = `${apiBase(host)}?format=json&action=query&prop=extracts&explaintext=1&exsectionformat=plain&redirects=1&titles=${encodeURIComponent(title)}`;
  try {
    const j = JSON.parse((await client.fetchUrl(url)).text);
    const first = Object.values(j?.query?.pages || {})[0];
    return String(first?.extract || '').trim();
  } catch { return ''; }
};

// ── Wikidata — the structured-fact backbone ───────────────────────────────────────────────────
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';

export const wikidataSearchUrl = (q, k) =>
  `${WIKIDATA_API}?action=wbsearchentities&search=${encodeURIComponent(q)}&language=en&uselang=en&format=json&limit=${k}`;
export const wikidataEntitiesUrl = (ids, props = 'labels|descriptions|aliases|claims') =>
  `${WIKIDATA_API}?action=wbgetentities&ids=${ids.map(encodeURIComponent).join('%7C')}&props=${encodeURIComponent(props)}&languages=en&format=json`;

// The value a snak carries, rendered legibly. Entity references come back as their bare id here
// and are resolved to labels by the batched lookup in renderWikidataEntity.
const snakValue = (snak) => {
  const dv = snak?.datavalue;
  if (!dv) return null;
  const v = dv.value;
  switch (dv.type) {
    case 'string': return String(v);
    case 'monolingualtext': return String(v?.text || '');
    case 'wikibase-entityid': return String(v?.id || '');
    case 'time': return String(v?.time || '').replace(/^\+/, '').replace(/T00:00:00Z$/, '');
    case 'quantity': return String(v?.amount || '').replace(/^\+/, '') + (v?.unit && v.unit !== '1' ? ` (${v.unit.split('/').pop()})` : '');
    case 'globecoordinate': return v ? `${v.latitude}, ${v.longitude}` : null;
    default: return typeof v === 'string' ? v : null;
  }
};

// How many statements a rendered entity carries. Enough for a person or a city to read whole;
// a bound so a mega-entity (a country, with hundreds of statements) cannot flood a hop.
const MAX_CLAIMS = 80;

// renderWikidataEntity(client, id) → the entity as READABLE LINES: label + description first
// (the sentence the entity is), aliases, then one `property: value` line per statement with
// every P-/Q-id resolved to its English label in ONE batched wbgetentities call. The output is
// deliberately line-per-fact so the parser downstream reads each as a unit and the graph gets
// `Douglas Adams -> writer : occupation`-shaped relations, not opaque identifiers.
export const renderWikidataEntity = async (client, id) => {
  const j = JSON.parse((await client.fetchUrl(wikidataEntitiesUrl([id]))).text);
  const e = j?.entities?.[id];
  if (!e) return '';
  const label = e.labels?.en?.value || id;
  const description = e.descriptions?.en?.value || '';
  const aliases = (e.aliases?.en || []).map((a) => a?.value).filter(Boolean);

  // Flatten the claims to (property, value) pairs, collecting every referenced id for the
  // one batched label lookup. Preferred-rank statements first, deprecated dropped.
  const pairs = [];
  const refIds = new Set();
  for (const [prop, statements] of Object.entries(e.claims || {})) {
    for (const st of statements || []) {
      if (st?.rank === 'deprecated') continue;
      const val = snakValue(st?.mainsnak);
      if (val == null || val === '') continue;
      pairs.push({ prop, val, preferred: st.rank === 'preferred' });
      refIds.add(prop);
      if (/^Q\d+$/.test(val)) refIds.add(val);
      if (pairs.length >= MAX_CLAIMS * 2) break;   // gather bound; rendered bound applied below
    }
  }
  pairs.sort((a, b) => (b.preferred ? 1 : 0) - (a.preferred ? 1 : 0));

  // One batched lookup for every property and entity-value label (wbgetentities takes 50 ids a
  // call). Best-effort: an unresolved id stays an id rather than failing the render.
  const labels = new Map();
  const ids = [...refIds];
  for (let i = 0; i < ids.length; i += 50) {
    try {
      const lj = JSON.parse((await client.fetchUrl(wikidataEntitiesUrl(ids.slice(i, i + 50), 'labels'))).text);
      for (const [eid, ent] of Object.entries(lj?.entities || {}))
        if (ent?.labels?.en?.value) labels.set(eid, ent.labels.en.value);
    } catch { /* keep ids bare */ }
  }
  const nameOf = (x) => labels.get(x) || x;

  const lines = [
    description ? `${label}: ${description}.` : label,
    aliases.length ? `Also known as: ${aliases.slice(0, 8).join(', ')}.` : '',
    ...pairs.slice(0, MAX_CLAIMS).map(({ prop, val }) => `${nameOf(prop)}: ${nameOf(val)}`),
  ];
  return lines.filter(Boolean).join('\n');
};

// ── The kinds and their full-text hooks (spread into webfetch.js) ─────────────────────────────
export const WIKIMEDIA_SOURCES = {
  ...Object.fromEntries(Object.entries(WIKIMEDIA_PROJECTS).map(([kind, { host }]) =>
    [kind, (ctx, query, k) => mediaWikiSearch(ctx, host, query, k, kind)])),
  wikidata: async (ctx, query, k) => {
    const j = JSON.parse((await ctx.fetchUrl(wikidataSearchUrl(query, k))).text);
    return (j?.search || []).slice(0, k).map((h) => ({
      title: h.label || h.id,
      text: h.description || h.label || h.id,
      url: h.concepturi || `https://www.wikidata.org/wiki/${h.id}`,
      source: 'wikidata', entityId: h.id,
    }));
  },
};

export const WIKIMEDIA_FULLTEXT = {
  ...Object.fromEntries(Object.entries(WIKIMEDIA_PROJECTS).map(([kind, { host }]) =>
    [kind, (client, item) => mediaWikiExtract(client, item?.mwHost || host, item?.title)])),
  wikidata: (client, item) => item?.entityId ? renderWikidataEntity(client, item.entityId) : Promise.resolve(''),
};
