// EO: TEND·BND(Network,Void → Link, Tending,Binding) — the freshness guard (never serve stale code)
// sw.js — a deliberately minimal service worker whose ONE job is to make sure a phone never gets
// stuck on an old build. The app is a buildless ES-module graph served from GitHub Pages with fixed
// paths (no content hashes), so the browser's HTTP cache can pin a whole stale copy — support.js,
// src/**, index.html — and a returning mobile user keeps booting yesterday's (sometimes broken) code
// until the cache happens to expire AND they manually hard-reload. That is the "it won't let me type /
// upload / it's stuck on an older version" report: old code, not a live bug.
//
// The strategy is NETWORK-REVALIDATE, not cache-first: every same-origin GET for the app shell is
// fetched with `cache: 'no-cache'`, which forces a conditional request to the server. Unchanged files
// come back as a cheap 304 (no re-download); changed files come back fresh. So while online the running
// code is ALWAYS current — the worker can never serve a stale version out from under the user. A copy
// of each ok response is mirrored into a runtime cache purely as an OFFLINE fallback (used only when the
// network throws), so a flaky connection still boots the last-known-good build instead of a dinosaur.
//
// Safety: the worker is a strict pass-through for anything it must not touch — cross-origin requests
// (fonts, the GitHub API), non-GET methods, and Range requests (media seeking) all fall straight to the
// network untouched. It precaches nothing (a stale precache is its own footgun), claims clients on
// activate, skips waiting on install, and purges any cache it didn't create. Bump CACHE_VERSION to
// invalidate the offline mirror.

const CACHE_VERSION = 'v2';
const RUNTIME_CACHE = `eo-runtime-${CACHE_VERSION}`;

self.addEventListener('install', (event) => {
  // Take over as soon as installed — no "waiting" phase, so a new deploy activates on the next load.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Drop every cache that isn't the current runtime mirror (old versions, legacy names).
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== RUNTIME_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Only the app's own shell is force-revalidated; media/pdf blobs and cross-origin assets pass through.
function shouldRevalidate(request, url) {
  if (request.method !== 'GET') return false;
  if (url.origin !== self.location.origin) return false;
  // A Range request (audio/video scrubbing) must reach the network verbatim — never intercept it.
  if (request.headers.has('range')) return false;
  return true;
}

// The one exception to "always revalidate": the deploy-bundled entry (build/build.mjs), whose
// URL is tagged `?v=<commit>` by pages.yml. That query makes the URL itself content-addressed —
// a stale copy under the SAME URL is structurally impossible, so there is nothing to revalidate.
// Cache-first here trades the 858-file "no request is ever stale" guarantee (still true for
// everything else this worker touches) for skipping a round trip on every repeat load; a NEW
// deploy is a NEW URL, so it is always a cache miss and fetched fresh regardless.
function isVersionedBundle(url) {
  return url.searchParams.has('v') && /\/boot\.bundle\.js$/.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  let url;
  try { url = new URL(request.url); } catch { return; }
  if (!shouldRevalidate(request, url)) return; // pass-through: the browser handles it as usual

  if (isVersionedBundle(url)) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const fresh = await fetch(request);
      if (fresh && fresh.ok && fresh.type === 'basic') {
        const copy = fresh.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
      }
      return fresh;
    })());
    return;
  }

  event.respondWith((async () => {
    try {
      // `no-cache` = use the HTTP cache but ALWAYS revalidate with the server first. Unchanged → 304
      // (served from cache, no bytes over the wire); changed → a fresh 200. Either way, never stale.
      const fresh = await fetch(request, { cache: 'no-cache' });
      if (fresh && fresh.ok && fresh.type === 'basic') {
        const copy = fresh.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
      }
      return fresh;
    } catch (err) {
      // Offline / network fault: fall back to the last-known-good copy if we have one.
      const cached = await caches.match(request);
      if (cached) return cached;
      throw err;
    }
  })());
});
