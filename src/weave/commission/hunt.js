// EO: SIG·INS(Void → Entity,Field, Binding,Making) — hunt the exemplar on the open internet
// The creature reaches out. Given a brief, search the right library shelves for candidate models,
// and fetch the chosen one WHOLE, tagged as a STYLE EXEMPLAR (a different kind of source than a
// topical one — the surface shows it apart).
//
// Project Gutenberg is the primary shelf for FORM: whole works, the canon, read entire. The open
// academic shelves (OpenAlex for breadth, arXiv for full text) are the shelf for scholarly form.
// Everything rides the same fetch-through-proxy, admit-with-provenance path every source rides;
// nothing here reaches the network directly — the web client is injected (createWebClient in the
// app, a fake in tests).

import { fetchGutenbergBook, fetchArxivPaper, fetchAndAdmit } from '../../organs/ingest/index.js';

export const STYLE_ROLE = 'style-exemplar';

// The plural a library search wants ("essay" → "essays"), so "Montaigne essays" hits the catalog.
const PLURAL = { essay: 'essays', story: 'stories', poem: 'poems', letter: 'letters', review: 'reviews', treatise: 'treatises', dialogue: 'dialogues', report: 'reports' };
const pluralOf = (d) => PLURAL[d] || (d ? `${d}s` : '');

// libraryKindsFor(brief) → the shelves to search, in order. Gutenberg leads for literary FORM; the
// academic shelves lead for scholarly form; an unknown register tries the literary shelf then the
// catalog, so a bare "write me something like X" still reaches a book.
export const libraryKindsFor = (brief) => {
  const scholarly = brief?.register === 'scholarly' || ['review', 'report'].includes(brief?.deliverable);
  if (scholarly) return ['openalex', 'arxiv'];
  const literary = brief?.register === 'literary'
    || ['essay', 'story', 'poem', 'letter', 'treatise', 'dialogue'].includes(brief?.deliverable);
  if (literary) return ['gutenberg'];
  return ['gutenberg', 'openalex'];
};

// huntQueries(brief) → per-kind search strings. A named exemplar becomes "Montaigne essays" on the
// literary shelf and the exemplar name on the academic shelf; an open commission searches by topic
// (+ form on the literary shelf, where the catalog is titled by form).
export const huntQueries = (brief) => {
  const name = brief?.exemplar?.name || '';
  const form = pluralOf(brief?.deliverable);
  const topic = brief?.topic || '';
  const q = {};
  for (const kind of libraryKindsFor(brief)) {
    if (kind === 'gutenberg') {
      q[kind] = (name ? `${name} ${form}` : `${form} ${topic}`).trim() || name || topic || form;
    } else {
      q[kind] = (name ? `${name} ${topic}` : topic || name || form).trim();
    }
  }
  return q;
};

// huntCandidates(brief, { client, search, k, signal }) → search items across the chosen shelves,
// each carrying its `source`/`kind`. Best-effort per shelf: one shelf failing never sinks the hunt.
export const huntCandidates = async (brief, { client = null, search = null, k = 6, signal = null } = {}) => {
  const doSearch = search || (client && ((q, kind) => client.search(q, { kind, k, signal })));
  if (!doSearch) throw new Error('huntCandidates: no web client or search injected');
  const queries = huntQueries(brief);
  const out = [];
  for (const [kind, q] of Object.entries(queries)) {
    if (!q) continue;
    try {
      const hits = await doSearch(q, kind);
      for (const it of hits || []) out.push({ ...it, source: it.source || kind, kind: it.kind || kind });
    } catch { /* one shelf down is not the whole hunt */ }
  }
  return out;
};

// fetchExemplar(item, { client, store, rawStore }) → { doc, record, item, role } | null. The whole
// work admitted as a groundable source, role-tagged STYLE. Dispatched by shelf: a Gutenberg book by
// its ebook id, an arXiv paper by its id (ar5iv full text), everything else by its open-access URL.
export const fetchExemplar = async (item, { client, store = null, rawStore = null, signal = null } = {}) => {
  if (!item || !client) return null;
  const opts = { client, store, rawStore, signal };
  let admitted = null;
  try {
    if (item.source === 'gutenberg') admitted = await fetchGutenbergBook(item.url || item.gutenbergId, opts);
    else if (item.source === 'arxiv') admitted = await fetchArxivPaper(item.arxivId || item.url, opts);
    else if (item.oaUrl || item.url) admitted = await fetchAndAdmit(item.oaUrl || item.url, opts);
  } catch { return null; }
  if (!admitted?.doc) return null;
  return Object.freeze({ doc: admitted.doc, record: admitted.record || null, item, role: STYLE_ROLE });
};
