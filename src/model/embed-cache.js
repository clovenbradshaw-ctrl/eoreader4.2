// EO: REC·NUL(Atmosphere → Atmosphere, Composing,Clearing) — persistent embedding cache
// Wrap any embedder so its vectors survive the session. The MiniLM embedder
// (model/embed.js) caches in a Map — every page load re-pays every embedding it ever
// computed. This wrapper adds an IndexedDB layer under that: memory first, IndexedDB
// second, compute third (then persist), so the machine is measurably faster the more it
// operates — a query it has embedded in ANY session is never embedded again.
//
// Keyed by (organ/model, FNV-1a×2 of the text, text length): the model id is in the key
// because a vector is only meaningful in the space that produced it — swap the model and
// the old rows are simply never hit, not wrongly reused. Float32Array round-trips
// through IndexedDB's structured clone unchanged.
//
// Degrades, never fails: without IndexedDB (Node, tests, private browsing) every method
// falls through to the wrapped embedder — the wrapper is then the identity with a Map,
// exactly what the bare embedder already was.

// Own DB name (not the centroids loader's) — two modules sharing one IDB name at the
// same version each see only the store whichever ran first created.
const DB = 'eoreader4-embed', STORE = 'vectors';

const hasIDB = () => typeof indexedDB !== 'undefined';

// Two independent FNV-1a passes (different offset basis) + length — 2^64-ish keyspace
// over the text, cheap and deterministic. Not cryptographic; collision here costs a
// wrong nearest-neighbour, not a security property, and at this scale (thousands of
// texts) the probability is negligible.
const fnv = (s, seed) => {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
};
export const textKey = (text) => `${fnv(text, 2166136261)}:${fnv(text, 40389)}:${text.length}`;

export const withPersistentEmbedCache = (embedder, {
  dbName = DB,
  storeName = STORE,
  useIDB = hasIDB(),
} = {}) => {
  if (!embedder) return embedder;
  // The hot layer is bounded: past the cap the oldest entries fall out of memory but
  // stay in IndexedDB, so a re-hit pays a disk read, never a recompute — and a long
  // session over big documents can't grow the heap without limit.
  const MEM_CAP = 4096;
  const memory = new Map();
  const remember = (key, v) => {
    if (memory.size >= MEM_CAP) memory.delete(memory.keys().next().value);
    memory.set(key, v);
  };
  let dbPromise = null;
  const openDB = () => {
    if (!useIDB) return Promise.resolve(null);
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      try {
        const open = indexedDB.open(dbName, 1);
        open.onupgradeneeded = () => open.result.createObjectStore(storeName);
        open.onerror = () => resolve(null);
        open.onsuccess = () => resolve(open.result);
      } catch { resolve(null); }
    });
    return dbPromise;
  };

  const idbGet = async (key) => {
    const db = await openDB();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
        tx.onsuccess = () => resolve(tx.result ?? null);
        tx.onerror = () => resolve(null);
      } catch { resolve(null); }
    });
  };

  const idbPut = async (key, value) => {
    const db = await openDB();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, 'readwrite').objectStore(storeName).put(value, key);
        tx.onsuccess = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch { resolve(false); }
    });
  };

  const stats = { memoryHits: 0, idbHits: 0, computed: 0 };
  const spaceId = embedder.model || embedder.organ || embedder.id || 'embed';

  return {
    ...embedder,
    // Pass-through identity: the wrapper measures meaning iff the wrapped organ does.
    isWarm: (...a) => embedder.isWarm?.(...a),
    warm: (...a) => embedder.warm?.(...a),
    cacheStats: () => ({ ...stats }),
    async embed(text) {
      const t = String(text);
      const key = `${spaceId}:${textKey(t)}`;
      const inMem = memory.get(key);
      if (inMem) { stats.memoryHits++; return inMem; }
      const inIDB = await idbGet(key);
      if (inIDB instanceof Float32Array) {
        stats.idbHits++;
        remember(key, inIDB);
        return inIDB;
      }
      const v = await embedder.embed(t);
      stats.computed++;
      remember(key, v);
      if (v instanceof Float32Array) idbPut(key, v); // fire-and-forget — never blocks the answer
      return v;
    },
    // A cache probe that never computes: returns the vector if it is already known
    // (memory or disk), null otherwise. The time-boxed index builder reads this to
    // race through the already-embedded prefix without spending budget on it.
    async embedIfCached(text) {
      const t = String(text);
      const key = `${spaceId}:${textKey(t)}`;
      const inMem = memory.get(key);
      if (inMem) { stats.memoryHits++; return inMem; }
      const inIDB = await idbGet(key);
      if (inIDB instanceof Float32Array) {
        stats.idbHits++;
        remember(key, inIDB);
        return inIDB;
      }
      return null;
    },
  };
};
