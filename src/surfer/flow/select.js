// EO: EVA·INS(Field,Void → Paradigm, Binding,Making) — installed-prior resolver + loader
// flow/select.js — resolve an INSTALLED flow prior by facets and load it.
//
// The missing weld between the facet-keyed registry (data/flow-priors/index.json,
// built by tools/flow/install_prior.mjs) and the runtime scorer (flow/index.js).
// selectPrior/loadPrior are pure; this adds the file/fetch I/O the browser and the
// reader need, so a caller can go from "I am writing English prose" to a loaded prior
// object in one await — the step that was flagged open (loadPrior had zero callers).
//
//   const { prior } = await loadInstalledPrior({ lang: 'en' }) ?? {};
//   // → mixed-en-pooled (the general English prior) unless a better facet match exists
//
// Null-safe by construction: any failure (registry missing, no match, bad JSON) returns
// null, so the caller degrades to today's behavior (no prior ⇒ no shaping). This is why
// the reader can opt in unconditionally — a served registry shapes, a missing one is a
// silent no-op, never a throw.

import { selectPrior, loadPrior } from './index.js';

// The default location the registry and priors are served from (repo root under
// `npm run serve`). Overridable via opts.base for a bundle that relocates them.
const DEFAULT_BASE = 'data/flow-priors';

// Resolve a relative data path to a fetchable URL. Mirrors the app's own pattern
// (app.dc.js: `new URL(rel, document.baseURI).href`) when a document base exists;
// in node/tests the raw relative path is handed to the injected reader unchanged.
const resolveUrl = (rel) => {
  try {
    if (typeof document !== 'undefined' && document.baseURI) return new URL(rel, document.baseURI).href;
  } catch { /* fall through to the raw path */ }
  return rel;
};

// The default JSON fetcher — browser fetch. Tests/node inject `fetchJson` to read from
// disk instead, so this module stays dependency-free and browser-safe (no fs import).
const fetchJson = async (rel) => {
  const url = resolveUrl(rel);
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  if (!r || !r.ok) throw new Error(`fetch ${url} → ${r ? r.status : 'no response'}`);
  return r.json();
};

// One resolver per process/tab: the registry and each chosen prior are fetched once and
// memoized, so a per-beat/per-turn caller never re-fetches. Keyed by base + prior name.
const cache = new Map();

// loadInstalledPrior — the load-and-thread weld.
//   query   { lang, region, era, domain, register } — selectPrior scores against these.
//           Default { lang: 'en' }: with no other signal the registry tie-break picks the
//           largest matching corpus (the pooled English prior), a sane general default.
//   opts    { base, read } — base dir for the registry; `read(relPath) → Promise<json>`
//           overrides the fetcher (node/tests read from disk). Returns { prior, entry } or
//           null. Never throws: a missing registry or no match is a null, not a failure.
export async function loadInstalledPrior(query = { lang: 'en' }, opts = {}) {
  const base = opts.base || DEFAULT_BASE;
  const read = opts.read || fetchJson;
  const ckey = `${base}::${JSON.stringify(query || {})}`;
  if (cache.has(ckey)) return cache.get(ckey);
  const result = await (async () => {
    let manifest;
    try { manifest = await read(`${base}/index.json`); }
    catch { return null; }                                   // no registry served ⇒ no shaping
    const entries = manifest && Array.isArray(manifest.priors) ? manifest.priors : [];
    if (!entries.length) return null;
    const entry = selectPrior(entries, query || {});
    if (!entry || !entry.file) return null;
    let priorJson;
    try { priorJson = await read(`${base}/${entry.file}`); }
    catch { return null; }
    let prior;
    try { prior = loadPrior(priorJson); }
    catch { return null; }                                   // a corrupt prior is a no-op, not a crash
    return { prior, entry };
  })();
  cache.set(ckey, result);
  return result;
}

// Test/opt-in seam: clear the memo (a test that swaps registries, or a bundle that
// hot-reloads priors, calls this so the next load re-reads).
export function _clearPriorCache() { cache.clear(); }
