// EO: SIG·INS(Void → Entity,Atmosphere, Binding,Making) — admit web pages as groundable sources
// External web pages as first-class groundable sources.
// (docs/web-search.md; ported from eoreader3 docs/web-source-admission.md)
//
// A page found on the web becomes a source with PROVENANCE: parsed, embedded, and admitted
// through the SAME pipeline an uploaded document travels (parseText → graph). Claims cite it the
// way they cite a file, and the veto checks them identically. This is a SOURCING function, not a
// model tool — the talker never reaches the network. The mechanical layer fetches (a proxy, off
// by default) and admits; the model only PROPOSES a query.
//
// Admission is OFFLINE and pure: given a fetched payload { url, text, … } it mints a frozen
// web-source/1 record and a prose doc that drops straight into the answer scope — the docs[]
// array runTurn folds into a composite, so the web source enters retrieval ranking and its
// cited spans trace back through the composite's origin() with no pipeline change. Search/fetch
// live behind the proxy seam; this core is what they feed.

import { parseText } from '../../perceiver/parse/index.js';

// A deterministic content hash. The proxy computes a real sha256 at fetch time and ships it on
// the payload; absent that (offline / a test), a pure 64-bit FNV-1a stand-in keeps freeze /
// supersede / staleness working with no crypto dependency. Either way it is STABLE on the text,
// so a changed page → a changed hash → a new record.
export const webContentHash = (text) => {
  let h1 = 0x811c9dc5, h2 = 0x811c9dc5;
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ((c + i) & 0xff), 0x01000193) >>> 0;
  }
  return 'fnv:' + (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
};

const hash16 = (contentHash) => String(contentHash).replace(/^[^:]*:/, '').slice(0, 16).padEnd(16, '0');

// The record id is colon-namespaced (web:<hash16>) for citation source_ids; the ENGINE doc id
// swaps the colon for a hyphen (web-<hash16>) because citation markers split on ':'. The two are
// a reversible bridge (eoreader3 reconciliation #2).
export const recordIdOf    = (contentHash) => `web:${hash16(contentHash)}`;
export const engineDocId   = (recordId)    => String(recordId).replace(':', '-');
export const recordIdForDoc = (engineId)   => String(engineId).replace(/^web-/, 'web:');

// Mint the frozen web-source/1 record from a fetched payload. status ∈ active|superseded|retracted.
export const webRecord = (payload = {}) => {
  const content_hash = payload.content_hash || webContentHash(payload.text);
  const id = recordIdOf(content_hash);
  return Object.freeze({
    schema: 'web-source/1', id, kind: 'web-source',
    url: payload.url || null, final_url: payload.final_url || payload.url || null,
    title: payload.title || null, byline: payload.byline || null,
    excerpt: (payload.excerpt || String(payload.text || '').replace(/\s+/g, ' ').trim().slice(0, 240)) || null,
    retrieval_query: payload.retrieval_query || null, engine: payload.engine || null,
    fetched_at: payload.fetched_at || null,    // stamped by the fetcher; never minted here
    // When the page WAS PUBLISHED — the date a claim like "is the mayor" is current AS OF.
    // Distinct from fetched_at (when WE read it); supplied by the fetcher/metadata when known,
    // so the grounding can re-date a present-tense claim against now rather than assume it holds.
    published: payload.published || payload.date || payload.published_at || null,
    salient_image: payload.salient_image || payload.salientImage || payload.thumbnail || payload.thumb || null,
    content_hash, status: 'active',
  });
};

// Page CHROME that survives htmlToText / the wiki extract as bare lines — navigation menus, the
// table of contents, footer furniture, edit/reference markers. These matter disproportionately:
// the surfer arrests on BAYESIAN SURPRISE (surfer/surf.js) and a rare, out-of-prose line like
// "Toggle the table of contents" reads as the MOST surprising thing on the page, so the surf rode
// to the furniture and the answer grounded on it ("Main -> Random : page" instead of the article
// facts — the observed bad result). Drop them before the doc is built so the field the surfer
// reads is the article, not its scaffolding. Matched case-insensitively against the trimmed line.
const BOILERPLATE_LINE = new Set([
  'jump to content', 'jump to navigation', 'jump to search', 'main menu', 'move to sidebar',
  'hide', 'show', 'toggle the table of contents', 'navigation', 'main page', 'contents',
  'current events', 'random article', 'about wikipedia', 'contact us', 'help', 'learn to edit',
  'community portal', 'recent changes', 'upload file', 'special pages', 'pages for logged out editors',
  'donate', 'create account', 'log in', 'log out', 'tools', 'what links here', 'related changes',
  'permanent link', 'page information', 'cite this page', 'get shortened url', 'download qr code',
  'wikidata item', 'download as pdf', 'printable version', 'in other projects', 'wikimedia commons',
  'wikiquote', 'wikidata', 'wikisource', 'wikinews', 'wikiversity', 'print/export', 'languages',
  'add languages', 'from wikipedia, the free encyclopedia', 'appearance', 'small', 'standard',
  'large', 'width', 'color (beta)', 'automatic', 'light', 'dark', 'read', 'edit', 'view history',
  'view source', 'talk', 'sandbox', 'preferences', 'watchlist', 'contributions', 'search',
  // Modern-web furniture: consent/ad/subscribe/share/comment widgets that survive as bare lines.
  'advertisement', 'sign up', 'sign in', 'log in or sign up', 'subscribe', 'subscribe now',
  'newsletter', 'related articles', 'related stories', 'read more', 'see more', 'show more',
  'share', 'share this', 'share this article', 'tweet', 'follow us', 'most read', 'trending',
  'recommended for you', 'skip to content', 'skip to main content', 'accept', 'accept all',
  'accept all cookies', 'reject all', 'manage cookies', 'cookie settings', 'we use cookies',
  'menu', 'close', 'leave a comment', 'comments', 'all rights reserved',
]);

// Reduce a fetched page's text to its PROSE: drop the chrome lines above, the dotted table-of-
// contents entries ("6.4 Ryan Coogler reboot" — the section *number* marks a TOC duplicate of the
// body heading), category/footer furniture, and inline [1] / [edit] markers. Conservative by
// construction: a line that is not recognisably furniture is kept verbatim, so a clean prose
// payload (an uploaded-style page, the tests) passes through unchanged. Pure and exported so the
// behaviour is unit-testable without the network.
export const stripWebBoilerplate = (text) => {
  const kept = [];
  for (const raw of String(text || '').split('\n')) {
    let line = raw.replace(/\[\s*(?:edit|citation needed|\d+)\s*\]/gi, '')  // inline ref / edit markers
                  .replace(/\s+/g, ' ').trim();
    if (!line) { kept.push(''); continue; }
    const low = line.toLowerCase();
    if (BOILERPLATE_LINE.has(low)) continue;                       // an exact chrome line
    if (/^\d+(\.\d+)+\s+\S/.test(line) && line.length < 80) continue;  // dotted TOC entry "6.4 …"
    if (/^(categories|hidden categories|category)\s*:/i.test(line)) continue;
    if (/^retrieved from\b/i.test(low)) continue;
    if (/^this (page|article) was last edited\b/i.test(low)) continue;
    kept.push(line);
  }
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

// admitWebSource(payload) → { doc, record }. The doc is a normal prose document (so every
// pipeline path treats it identically — eoreader3 reconciliation #1) whose WEB identity rides as
// additive metadata, and whose docId is unique + colon-free so its cited spans trace back through
// the composite's origin().
//
// ABSORB AS MUCH AS POSSIBLE (the user's directive). The page is READ in full on ingestion —
// chrome stripped, then parsed entire — so the surfer can ride any section, not just the head
// (the old caps truncated the very section a question asked about, e.g. "Ryan Coogler reboot",
// and the answer came back "I couldn't find it"). The FULL original is retained as binary in
// OPFS by the fetch layer (ingest/opfs-store.js); this is the reading half of "save it all, and
// read it on ingestion". parseText is synchronous, so a single, very high HANG_GUARD remains —
// not a content limit but a backstop against a pathological multi-megabyte page locking the tab.
// Real articles fall far below it, so in practice nothing is dropped.
const HANG_GUARD = 2_000_000;

// `hangGuard` is overridable per admission: an ambient page fetch keeps the default backstop,
// while a DELIBERATE whole-book read (ingest/gutenberg.js fetchGutenbergBook) raises it so a
// long novel is read entire — the caller chose that read, so the caller sets its ceiling.
export const admitWebSource = (payload = {}, { hangGuard = HANG_GUARD } = {}) => {
  const record = webRecord(payload);
  const docId  = engineDocId(record.id);
  const stripped = stripWebBoilerplate(String(payload.text || ''));
  // unnamedReferents: true — the reader's ordinary reading (see rooms/reader/app/registry.js#docFor).
  // A fetched page or a whole Gutenberg book (ingest/gutenberg.js) resolves a figure named only by
  // description ("the creature") instead of dropping it from the Source Index.
  const doc    = parseText(stripped.slice(0, hangGuard), { docId, unnamedReferents: true });
  doc.sourceKind = 'web-source';
  // When the backstop DOES trip, it says so — a coverage receipt, never a silent cut.
  // The full original is still retained as binary by the fetch layer (opfs-store.js).
  if (stripped.length > hangGuard)
    doc.coverage = { complete: false, chars: hangGuard, sourceChars: stripped.length,
                     dropped: [`hang-guard: read the first ${hangGuard.toLocaleString()} of ${stripped.length.toLocaleString()} chars (raise hangGuard for a whole read)`] };
  doc.web = {
    url: record.url, final_url: record.final_url, title: record.title,
    fetched_at: record.fetched_at, published: record.published, content_hash: record.content_hash,
    retrieval_query: record.retrieval_query, engine: record.engine,
    salient_image: record.salient_image,
  };
  doc._webRecord = record;
  return { doc, record };
};

// The citation a web-grounded claim carries — the same char_span the veto's token check reads.
export const toWebCitation = (record, segment_id, char_span) => Object.freeze({
  type: 'web-source', source_id: record.id, segment_id, char_span,
  url: record.url, fetched_at: record.fetched_at, content_hash: record.content_hash,
});

// Provenance integrity (§13.9): a citation is honoured only against an ACTIVE record whose hash
// still matches — a superseded/retracted source, or a hash drift, fails closed.
export const verifyCitation = (record, citation) =>
  !!record && record.status === 'active' &&
  !!citation && citation.content_hash === record.content_hash;

// A minimal web-source store — freeze, supersede, retract; it never overwrites (the log's
// SEG/retract law, applied to sources). Keyed by url so the SAME page over time SUPERSEDES (a
// changed hash mints a new record, the old retained as 'superseded'); an unchanged page returns
// the existing source; a new url is a new entry.
export const createWebStore = () => {
  const byId = new Map();           // record id → { record, doc }
  const latestForUrl = new Map();   // url → record id

  const admit = (payload, opts) => {
    const { doc, record } = admitWebSource(payload, opts);
    const prevId = record.url ? latestForUrl.get(record.url) : null;
    if (prevId && byId.has(prevId)) {
      const prev = byId.get(prevId);
      if (prev.record.content_hash === record.content_hash) return { ...prev, fresh: false, superseded: null };
      byId.set(prevId, { ...prev, record: { ...prev.record, status: 'superseded' } });   // changed → supersede, retained
    }
    byId.set(record.id, { record, doc });
    if (record.url) latestForUrl.set(record.url, record.id);
    return { record, doc, fresh: true, superseded: (prevId && prevId !== record.id) ? prevId : null };
  };
  const retract = (id) => {
    const e = byId.get(id);
    if (!e) return null;
    byId.set(id, { ...e, record: { ...e.record, status: 'retracted' } });
    return id;
  };
  const get    = (id) => byId.get(id) || null;
  const active = () => [...byId.values()].filter(e => e.record.status === 'active');
  return { admit, retract, get, active };
};
