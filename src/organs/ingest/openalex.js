// EO: SIG·SEG·INS(Void → Field,Entity, Binding,Clearing,Making) — OpenAlex — scholarly discovery
// OpenAlex as a research source — DISCOVERY across every field, with the quality prior attached.
// (docs/web-search.md "The library sources")
//
// Where Gutenberg is the literary shelf and arXiv the STEM preprint shelf, OpenAlex is the
// CATALOG: ~250M scholarly works, keyless JSON, every field. It answers "what are the good papers
// on X" — and, crucially for the inspiration selector, HOW GOOD each is: `cited_by_count` is the
// scholarly analogue of Gutenberg canonicity, a cheap prior that a work is a strong specimen of
// its kind. Full text OpenAlex does not host; it hands back the open-access location, and the
// full-text hook reads it when it is clean HTML, falling back to the abstract otherwise (the
// reliable payload — arXiv/EuropePMC are the full-text shelves).
//
// One fetch primitive (ctx.fetchUrl through the CORS proxy); zero imports; offline-testable.

export const OPENALEX_BASE = 'https://api.openalex.org';
export const openalexSearchUrl = (q, k = 5) =>
  `${OPENALEX_BASE}/works?search=${encodeURIComponent(q)}&per_page=${Math.max(1, k)}`;

export const openalexIdOf = (ref) => {
  const s = String(ref || '').trim();
  const m = /(?:openalex\.org|api\.openalex\.org\/works)\/(W\d+)/i.exec(s) || /^(W\d+)$/i.exec(s);
  return m ? m[1] : null;
};

// deInvertAbstract(index) → the abstract as prose. OpenAlex stores abstracts as an inverted index
// { word: [positions] } (a copyright side-step); reconstruct by placing each word at its positions.
export const deInvertAbstract = (index) => {
  if (!index || typeof index !== 'object') return '';
  const slots = [];
  for (const [word, positions] of Object.entries(index)) {
    if (!Array.isArray(positions)) continue;
    for (const p of positions) if (Number.isInteger(p) && p >= 0) slots[p] = word;
  }
  return slots.filter((w) => w != null).join(' ').replace(/\s+/g, ' ').trim();
};

const oaLocation = (w) => {
  const loc = w?.best_oa_location || w?.primary_location || null;
  if (!loc) return { url: null, pdf: null };
  return { url: loc.landing_page_url || null, pdf: loc.pdf_url || null };
};

// parseOpenAlex(json, k) → catalog hits. `text` is the reconstructed abstract (or the title), and
// each item carries `citedBy` / `year` / `oaUrl` — what the selector reads to judge a good model.
export const parseOpenAlex = (json, k = 5) => {
  let j = json;
  if (typeof j === 'string') { try { j = JSON.parse(j); } catch { return []; } }
  return (j?.results || []).slice(0, Math.max(1, k)).map((w) => {
    const authors = (w.authorships || []).map((a) => a?.author?.display_name).filter(Boolean);
    const abstract = deInvertAbstract(w.abstract_inverted_index);
    const { url, pdf } = oaLocation(w);
    const id = openalexIdOf(w.id) || w.id || null;
    const title = w.display_name || w.title || '(untitled work)';
    return {
      title: authors.length ? `${title} — ${authors.slice(0, 3).join(', ')}` : title,
      text: abstract || title,
      url: url || (id ? `https://openalex.org/${id}` : null),
      source: 'openalex',
      openalexId: id,
      oaUrl: url || pdf || w.open_access?.oa_url || null,
      pdfUrl: pdf || null,
      citedBy: Number.isFinite(w.cited_by_count) ? w.cited_by_count : 0,
      year: w.publication_year || null,
      isOA: !!w.open_access?.is_oa,
      authors,
    };
  }).filter((it) => it.title);
};

// Local HTML reducer — kept here so the module never imports webfetch (whose SEARCH_SOURCES spread
// would make the cycle unsafe). Small on purpose; the full-text shelves (arXiv/EuropePMC) do the
// heavy reading.
const stripHtml = (html) => String(html || '')
  .replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
  .replace(/<\/(p|div|section|h[1-6]|li|br)>/gi, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/[ \t]+/g, ' ').replace(/ *\n *(?:\n *)+/g, '\n\n').trim();

export const OPENALEX_SOURCES = {
  openalex: async (ctx, query, k) => parseOpenAlex((await ctx.fetchUrl(openalexSearchUrl(query, k))).text, k),
};

// Full text: OpenAlex is discovery, not a repository. When the OA location is clean HTML, read it;
// when it is a PDF (unparseable through the text proxy) or missing, the abstract is the payload.
export const OPENALEX_FULLTEXT = {
  openalex: async (client, item) => {
    const u = item?.oaUrl;
    if (!u || /\.pdf($|\?)/i.test(u) || item?.pdfUrl === u) return item?.text || '';
    try {
      const text = stripHtml((await client.fetchUrl(u)).text);
      return text && text.length > 400 ? text : (item?.text || '');
    } catch { return item?.text || ''; }
  },
};
