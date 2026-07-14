// EO: SEG(Network → Network, Dissecting) — CORS-direct fetch targets (proxy-free reliability)
// Which search endpoints answer a browser cross-origin, so the fetch can skip the proxy.
// (docs/web-search.md — "the proxy is a single point of failure for the common case")
//
// Every web fetch in the reader rides one CORS feed proxy chain (app.js chainFetch): a personal
// n8n instance, then allorigins as a backstop. When BOTH stall or rate-limit, ALL search dies —
// even for sources the browser could have reached on its own. But the two MOST COMMON routes are
// exactly those: the default route is the Wikimedia API (routeKind → wikipedia), and the academic
// route is OpenAlex — and both emit `Access-Control-Allow-Origin: *`, so a browser can fetch them
// straight, no proxy. Serving them direct removes the proxy as a single point of failure for the
// common case: a proxy outage no longer takes the reader offline, it only degrades the long tail
// (arbitrary article pages, arXiv/ar5iv, news RSS, feeds — none of which set a CORS header).
//
// directCorsUrl(target) → a directly-fetchable URL for a CORS-capable endpoint, or null when the
// target must go through the proxy. Pure and offline: the host/path rules are the whole logic, so
// they unit-test without the network. The caller (chainFetch) TRIES this first and, on any miss —
// an unexpected CORS failure, offline, a transient 5xx — falls through to the proxy chain, so this
// can only ADD a path, never remove one.
//
// The host list is the source of truth's shadow: the Wikimedia family (wikimedia.js
// WIKIMEDIA_PROJECTS + wikipedia/wikidata in webfetch.js) and OpenAlex (openalex.js). Every one of
// those source kinds fetches through `<host>/w/api.php` (MediaWiki) or `api.openalex.org` — the two
// shapes matched below — so the direct path covers every call they make and nothing they don't.

// The Wikimedia registrable domains — one per reference project. Every language edition
// (en/de/fr.wikipedia.org …) and sister host (species/commons.wikimedia.org, www.wikidata.org)
// is a subdomain of one of these, so a suffix test covers the whole shelf.
const WIKIMEDIA_DOMAIN =
  /(?:^|\.)(?:wikipedia|wiktionary|wikiquote|wikisource|wikibooks|wikiversity|wikinews|wikivoyage|wikidata|wikimedia)\.org$/i;

export const directCorsUrl = (target) => {
  const s = String(target || '');
  let u;
  try { u = new URL(s); } catch { return null; }
  // Only https gets the direct treatment: the app is served over https (GitHub Pages), so an
  // http target would be blocked as mixed content anyway — let the proxy handle those.
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase();

  // OpenAlex sets `Access-Control-Allow-Origin: *` unconditionally on every endpoint (verified),
  // so any api.openalex.org URL is fetchable as-is. Return the original string (not a re-serialized
  // URL) so the target's exact query encoding rides through untouched.
  if (host === 'api.openalex.org') return s;

  // The MediaWiki API family. It emits the CORS header ONLY when `origin` is on the query, and
  // ONLY for the api.php endpoint — so gate on the path (the rendered /wiki/ page has no CORS
  // header, and we never fetch it: the full-text hooks read prop=extracts through api.php) and
  // append `origin=*` when the caller didn't. Anonymous read requests carry no cookies
  // cross-origin, so `origin=*` is honoured (MediaWiki rejects it only for credentialed calls).
  if (WIKIMEDIA_DOMAIN.test(host) && /\/api\.php$/.test(u.pathname))
    return /[?&]origin=/.test(s) ? s : `${s}${s.includes('?') ? '&' : '?'}origin=*`;

  // GitHub. The REST API (api.github.com), raw file host (raw.githubusercontent.com), and the
  // rendered-object host (objects.githubusercontent.com, where raw redirects) all send
  // `Access-Control-Allow-Origin: *` on anonymous reads — so the code shelf's search, README,
  // tree, and blob fetches reach GitHub straight, no proxy. Return the string untouched so the
  // exact query encoding rides through.
  if (host === 'api.github.com' || host === 'raw.githubusercontent.com' || host === 'objects.githubusercontent.com')
    return s;

  return null;
};
