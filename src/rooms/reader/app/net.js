// EO — reader-app support (split from rooms/reader/app.js, 2026-07 compliance pass:
// "no god module — no file over ~250 lines", docs/architecture.md). Same holon.
// The proxy chain: public CORS proxies raced in order, and the full-text mirrors.
import { GUTENBERG_FULLTEXT, WIKIMEDIA_FULLTEXT, GITHUB_FULLTEXT, wikiExtract, directCorsUrl } from '../../../organs/ingest/index.js';
// ── the proxy chain ───────────────────────────────────────────────────────────
// The primary is the n8n feed proxy (webfetch's default); when it fails the two
// public CORS proxies are tried in order, same target. The chain rides UNDER
// createWebClient: the client builds its primary-proxied URL, this fetchImpl
// recovers the target and walks the chain — so search kinds, wiki extracts and
// page fetches all inherit the fallback without knowing it exists.
export const PROXY_FORMS = [
  (u) => `https://n8n.intelechia.com/webhook/feed?url=${encodeURIComponent(u)}`,
  // corsproxy.io was dropped: its free tier now returns a 200 HTML landing page (no CORS
  // header) for every request, so it poisoned the chain — a fake "success" that hid a real
  // failure and blocked the working fallback below. allorigins is the public backstop for a
  // fully-down primary; n8n (the reader's own feed proxy) carries the normal load.
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
];

export const targetOf = (proxiedUrl) => {
  try { return new URL(proxiedUrl).searchParams.get('url') || proxiedUrl; }
  catch { return proxiedUrl; }
};

// fetchTimed cuts a stalled proxy connection loose two ways: a per-request TIMEOUT and the
// caller's abort `signal` (the Stop button / the turn's stall watchdog). 4.1's proxyFetch
// chained the caller signal so Stop halted an in-flight fetch; 4.2 had dropped it, so a
// hung fetch ignored Stop and the turn ground through the full timeout with no way out.
export const fetchTimed = (url, { ms = 20000, signal = null } = {}) => {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  const relay = () => { try { c.abort(); } catch { /* already aborted */ } };
  if (signal) { if (signal.aborted) relay(); else signal.addEventListener('abort', relay, { once: true }); }
  return fetch(url, { signal: c.signal }).finally(() => {
    clearTimeout(t);
    if (signal) signal.removeEventListener('abort', relay);
  });
};

export const chainFetch = async (proxiedUrl, { signal = null } = {}) => {
  if (signal?.aborted) throw new Error('aborted');
  const target = targetOf(proxiedUrl);
  // CORS-DIRECT FIRST. The Wikimedia API family (the default search route) and OpenAlex (the
  // academic route) answer cross-origin with `Access-Control-Allow-Origin: *`, so fetch them
  // straight from the browser with no proxy — the reliability fix: the two most common routes no
  // longer go dark when BOTH proxies are down or rate-limited, and each hop is a hop faster. A
  // direct miss (an unexpected CORS failure, an offline tab, a transient 5xx) simply falls through
  // to the proxy chain below, so this only ADDS a path, never removes one. Everything else — article
  // pages, arXiv/ar5iv, news RSS, feeds — has no CORS header and still rides the proxy.
  const direct = directCorsUrl(target);
  const forms = direct ? [() => direct, ...PROXY_FORMS] : PROXY_FORMS;
  let lastErr = null;
  for (const form of forms) {
    if (signal?.aborted) throw new Error('aborted');
    try {
      const res = await fetchTimed(form(target), { signal });
      if (!res.ok && (res.status >= 500 || res.status === 429)) { lastErr = new Error(`HTTP ${res.status}`); continue; }
      return res;
    } catch (e) {
      // A user/turn abort is final — don't keep walking the chain waiting on a stopped turn.
      if (signal?.aborted) throw e;
      lastErr = e;
    }
  }
  throw lastErr || new Error('fetch failed');
};

// Full-text hooks per search kind — a Wikipedia hit reads the clean API extract,
// a Gutenberg hit the whole book, a Wikidata hit its rendered claims; anything
// else fetches the page and reduces its HTML. Mirrors webfetch's internal map.
export const FULL_TEXT = {
  wikipedia: (client, item) => wikiExtract(client, item?.title),
  ...GUTENBERG_FULLTEXT,
  ...WIKIMEDIA_FULLTEXT,
  ...GITHUB_FULLTEXT,   // a repo hit reads its README
};


