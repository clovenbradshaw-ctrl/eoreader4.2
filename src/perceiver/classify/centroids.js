// EO: NUL·SIG(Void → Lens, Clearing,Tending) — centroid loader / instrument
// Centroid loader — the measurement instrument, installed and cached.
//
// The 27 cell centroids are the geometric reader's instrument. They were built
// with paraphrase-multilingual-MiniLM-L12-v2; scoring a proposition against
// them requires embedding it in that SAME space (see model/embed.js). The
// bundle is fetched once and cached in IndexedDB; a warm load reuses it.
//
// INSTALLED: data/centroids-27.json ships a VERIFIED clause-grain bundle, built
// by scripts/build-centroids.mjs from the lexical-analysis project's archetypes
// (mean-pooled top-100 exemplars per cell; that script's header carries the full
// provenance — source repo and commit, the OP(Stance, Site) → OP_Stance_Site
// rewrite, and the ALT→DEF / SUP→EVA operator rename). The construction grain is
// verified as clause: the exemplars are full clauses, not lexical single-verbs,
// so the classifier embeds the clause and the cosine is measured in-space (§10).
//
// It still degrades, never fails: if the bundle is ever absent or malformed,
// loadCentroids returns null, the classifier holds at no-commit, and the boot
// animation reports the geometric reader as unavailable — the honest state, not
// a fake checkmark papered over a missing instrument.

// The shape a verified bundle must take. Documented here so one can be dropped
// in without reading the loader. Construction grain is first-class: the
// classifier embeds its query at this grain so the cosine is measured in-space.
export const CENTROID_SCHEMA = Object.freeze({
  meta: {
    model: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
    construction: 'clause',   // 'clause' (the design target) | 'verb' (lexical space)
    dim: 384,
    built: 'ISO-8601 date the centroids were computed',
  },
  // key is the registry's OP_Stance_Site; value is a dim-length unit vector.
  vectors: { 'INS_Making_Entity': '[number, … dim]' },
});

import { aliasCellKey } from '../../core/index.js';

const DEFAULT_URL = new URL('../../data/centroids-27.json', import.meta.url).href;
const DB = 'eoreader4', STORE = 'centroids';

// Import-time alias (master spec, Edit #3): map a stale-keyed bundle forward to
// the current vocabulary as it is ingested — SUP→EVA, ALT→DEF on the key prefix.
// The installed bundle was already renamed at build time, so this is the identity
// on it; it earns its keep when an OLDER bundle (one still keyed SUP_/ALT_) is
// dropped in. We alias the corpus forward, never rename the system to the corpus.
// Idempotent and key-preserving order; collisions (a stale and a current key both
// mapping to the same target) keep the LAST seen, matching object-literal order.
const aliasForward = (bundle) => {
  if (!bundle?.vectors) return bundle;
  let touched = false;
  const vectors = {};
  for (const [key, vec] of Object.entries(bundle.vectors)) {
    const k = aliasCellKey(key);
    if (k !== key) touched = true;
    vectors[k] = vec;
  }
  return touched ? { ...bundle, vectors } : bundle;
};

const hasIDB = () => typeof indexedDB !== 'undefined';

const idbGet = (key) => new Promise((resolve) => {
  try {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => resolve(null);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      tx.onsuccess = () => resolve(tx.result ?? null);
      tx.onerror = () => resolve(null);
    };
  } catch { resolve(null); }
});

const idbPut = (key, value) => new Promise((resolve) => {
  try {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => resolve(false);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key);
      tx.onsuccess = () => resolve(true);
      tx.onerror = () => resolve(false);
    };
  } catch { resolve(false); }
});

const isValid = (b) =>
  !!b && b.meta && typeof b.meta.model === 'string' &&
  b.vectors && typeof b.vectors === 'object' &&
  Object.keys(b.vectors).length > 0 &&
  Object.values(b.vectors).every(v => Array.isArray(v) && v.length > 0);

// Load the centroid bundle: IndexedDB cache first (idempotent — a warm load
// never re-downloads), then a network fetch, then honest null. Every dependency
// (fetch, the cache) is injectable so the installer can drive it under test
// with no browser and no network.
export const loadCentroids = async ({
  url = DEFAULT_URL,
  fetchImpl = (typeof fetch !== 'undefined' ? fetch : null),
  cacheKey = 'centroids-27',
  useCache = hasIDB(),
} = {}) => {
  if (useCache) {
    const cached = await idbGet(cacheKey);
    if (isValid(cached)) return Object.freeze({ ...aliasForward(cached), source: 'cache' });
  }
  if (!fetchImpl) return null;
  try {
    const res = await fetchImpl(url);
    if (!res || !res.ok) return null;
    const bundle = await res.json();
    if (!isValid(bundle)) return null;
    if (useCache) await idbPut(cacheKey, bundle);
    return Object.freeze({ ...aliasForward(bundle), source: 'network' });
  } catch {
    return null;   // network error, parse error, 404 — all degrade to no-instrument
  }
};
