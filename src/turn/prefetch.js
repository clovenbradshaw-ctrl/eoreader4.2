// EO: NUL·EVA(Entity → Entity, Clearing,Tending) — speculative web prefetch quarantine
// Speculative web prefetch — search the world WHILE the user is still typing, but
// keep nothing unless the turn proves it useful (docs/web-search.md, the quarantine
// discipline).
//
// This is the provenance gate applied to retrieval. A normal search is proposer-only:
// the turn measures a gap, the user gives a go-ahead, the engine fetches. That fetch
// costs a round-trip the user waits on. Speculative prefetch moves the fetch EARLIER —
// to the keystrokes before Enter — so the result is already warm when the turn asks for
// it. The cost is that we touched the network on a query the user had not yet committed
// to. So everything fetched here lands in a QUARANTINE cache, never in the answer scope:
// it is a provisional bond (low activation energy), not a Given. It hardens into a real
// source only when a turn TAKES it — i.e. the turn measured a gap and consumed this exact
// query. Every entry the turn never reaches is swept, having authored nothing.
//
// Standing authorization: this only ever runs behind web mode `auto`, where the user has
// already said "fetch on your own." In `off`/`confirm` it stays dormant — proactively
// sending typed text to a search engine before a go-ahead would break the proposer-only
// contract everywhere else in the engine.
//
// Pure but for the injected `search` and `now`: the cache logic (normalize, viability,
// LRU + TTL, take/prime/sweep) is testable with a fake search and a hand-advanced clock;
// the debounce and the DOM live in app.js, not here.

// Normalize a query for cache identity: lowercase, collapse whitespace, drop trailing
// punctuation. The chat-route proposal's query IS the question text (turn/propose.js), so a
// prefetch keyed on the typed box hits the submitted turn; a grounded gap that appends a
// figure simply misses and falls back to the network, which is correct.
export const normalizeQuery = (s) =>
  String(s || '').toLowerCase().replace(/\s+/g, ' ').replace(/[?!.,;:\s]+$/, '').trim();

// Worth a speculative hop? Long enough to be a real ask, short enough not to be a pasted
// wall, and carrying at least two word-ish tokens so a half-typed fragment ("what is the")
// doesn't burn a fetch on every keystroke pause. Tunable; deliberately conservative — the
// network cost is real and unbidden until Enter.
export const viableQuery = (s, { min = 12, max = 400, minWords = 3 } = {}) => {
  const q = String(s || '').trim();
  if (q.length < min || q.length > max) return false;
  const words = q.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w));
  return words.length >= minWords;
};

// createSpeculativeWeb({ search, now, ttlMs, maxEntries, maxInflight })
//
//   search      (query, opts) → Promise<admitted[]> — the real fetch+admit (searchAndAdmit
//               bound to the session web client). Injected so tests run offline.
//   now         () → ms — injected clock so TTL/LRU are testable without real time.
//   ttlMs       how long an un-taken entry stays warm before it is swept (default 5 min).
//   maxEntries  LRU cap on the quarantine — oldest-touched evicted past this (default 8).
//   maxInflight ceiling on concurrent speculative fetches (default 2) — the user types
//               faster than the net answers, so cap the in-flight fan-out.
export const createSpeculativeWeb = ({
  search,
  now = () => Date.now(),
  ttlMs = 5 * 60 * 1000,
  maxEntries = 8,
  maxInflight = 2,
} = {}) => {
  if (typeof search !== 'function') throw new Error('createSpeculativeWeb needs a `search` function');

  // key → { query, at, docs|null, promise|null, error, preserved }. `docs` null while in
  // flight; `promise` resolves to the admitted array. `preserved` flips true on take().
  const cache = new Map();
  let inflight = 0;

  const touch = (key) => { const e = cache.get(key); if (e) { e.at = now(); cache.delete(key); cache.set(key, e); } };

  // Evict expired (TTL) and over-cap (LRU — Map keeps insertion/touch order). Called
  // before every prime so the quarantine never grows without bound. Returns the keys dropped.
  const sweep = () => {
    const t = now();
    const dropped = [];
    for (const [key, e] of cache) {
      if (e.promise) continue;                 // never drop an in-flight fetch
      if (t - e.at > ttlMs) { cache.delete(key); dropped.push(key); }
    }
    while (cache.size > maxEntries) {
      // oldest first; skip in-flight, which sort to the front only by age
      const oldest = [...cache].find(([, e]) => !e.promise);
      if (!oldest) break;
      cache.delete(oldest[0]); dropped.push(oldest[0]);
    }
    return dropped;
  };

  // prime(text, opts) — speculatively fetch for the in-progress text. No-op (returns the
  // existing entry) when the query is unviable, already cached/in-flight, or the inflight
  // ceiling is reached. Errors are swallowed onto the entry — a speculative miss must never
  // surface to the user. opts (e.g. { kind, fetchPages, k }) are passed through to search.
  const prime = (text, opts = {}) => {
    sweep();
    const key = normalizeQuery(text);
    if (!viableQuery(key)) return null;
    const hit = cache.get(key);
    if (hit) { touch(key); return hit; }
    if (inflight >= maxInflight) return null;

    const entry = { query: key, at: now(), docs: null, promise: null, error: null, preserved: false };
    cache.set(key, entry);
    inflight += 1;
    entry.promise = Promise.resolve()
      .then(() => search(key, opts))
      .then((docs) => { entry.docs = Array.isArray(docs) ? docs : []; return entry.docs; })
      .catch((err) => { entry.error = err; entry.docs = []; return []; })
      .finally(() => { inflight -= 1; entry.promise = null; entry.at = now(); });
    sweep();   // enforce the LRU cap now the new entry is in (sweep skips the in-flight one)
    return entry;
  };

  // take(text) — the harden step. Return the admitted docs for this query (awaiting an
  // in-flight fetch if needed) and mark the entry PRESERVED — it was useful, the turn
  // consumed it. Null on a miss, so the caller falls back to a live fetch. This is the ONLY
  // path by which a speculative fetch becomes a real source; everything not taken is swept.
  const take = async (text) => {
    const key = normalizeQuery(text);
    const entry = cache.get(key);
    if (!entry) return null;
    touch(key);
    if (entry.promise) { try { await entry.promise; } catch { /* error already on entry */ } }
    if (!entry.docs || !entry.docs.length) return null;
    entry.preserved = true;
    return entry.docs;
  };

  // has(text) — is a warm or in-flight entry present for this query? (UI hint only.)
  const has = (text) => cache.has(normalizeQuery(text));

  // Inspection for tests/telemetry: how many entries, how many preserved, how many in flight.
  const stats = () => ({
    entries: cache.size,
    preserved: [...cache.values()].filter((e) => e.preserved).length,
    inflight,
  });

  // Drop everything (e.g. on web mode → off). Returns the count cleared.
  const clear = () => { const n = cache.size; cache.clear(); return n; };

  return { prime, take, has, sweep, stats, clear };
};
