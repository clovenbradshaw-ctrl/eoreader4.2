// EO: SIG·CON(Network,Void → Link, Tending,Binding) — the version time-machine (roll back to a prior PR)
// versions.js — the counterpart to provenance.js's "what produced this": where provenance names the
// ONE build the running site was deployed from, this lists the PRIOR ones and offers to open any of
// them. The app is deployed to GitHub Pages, and every merge to `main` is a deployed version — so the
// history of merged PRs IS the history of published builds. Rolling back is therefore not a git
// operation the surface can't do; it is just re-opening an older build.
//
// The mechanism. GitHub Pages serves only the latest deploy, so an older build's files have to come
// from somewhere that (a) has them at that exact commit, (b) serves .html as text/html so a browser
// renders it on navigation, (c) serves .js as a JS type so the ES-module graph loads, and (d) sends
// permissive CORS. raw.githubusercontent.com and jsdelivr both serve .html as text/plain (a
// deliberate anti-abuse measure), which kills (b). raw.githack.com is built for exactly this — it
// serves any commit's tree with the right content-types and CORS. Navigating the TOP-LEVEL document
// to `${GITHACK_HOST}/<owner>/<repo>/<sha>/index.html` makes the historical app's whole relative
// module graph (./support.js, src/**) same-origin under the CDN, so it boots exactly as it did at
// that commit — with its own localStorage sandbox, so viewing an old build never touches live data.
//
// Everything here is PURE or BEST-EFFORT, in provenance.js's house style: the pure helpers
// (pullsApiUrl, normalizeVersions, rollbackUrl, formatVersionDate) are unit-tested with no network,
// and the gatherers (fetchVersions, loadVersions) take an injected fetch and resolve every fault to
// an empty list with a worded reason — the version list is a courtesy, never a precondition, and no
// import touches the network.

import { repoRef } from './provenance.js';

// The static CDN that serves any GitHub commit's file tree with correct content-types and CORS —
// isolated here so the one external origin the feature reaches is swappable in a single place.
export const GITHACK_HOST = 'https://raw.githack.com';

// A long history shouldn't unbound the panel; the recent builds are what a rollback wants.
const MAX_VERSIONS = 40;

const str = (x) => String(x ?? '');
const short = (sha) => (sha ? str(sha).replace(/[^0-9a-f]/gi, '').slice(0, 7) : null);

// The public GitHub API URL for a repo's closed PRs, most-recently-updated first. Unauthenticated:
// the per-IP hourly limit is ample for the occasional version check one browser makes.
export const pullsApiUrl = (slug, { perPage = 50 } = {}) => {
  const n = Math.max(1, Math.min(100, Number(perPage) || 50));
  return `https://api.github.com/repos/${slug}/pulls?state=closed&per_page=${n}&sort=updated&direction=desc`;
};

// A compact, LOCALE-STABLE merge date (read in UTC so a test doesn't drift with the runner's zone):
// 'Jul 11, 2026', or '' when there's nothing parseable.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const formatVersionDate = (iso) => {
  try {
    const d = new Date(str(iso));
    if (isNaN(d.getTime())) return '';
    return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  } catch { return ''; }
};

// The historical build URL for a commit — the app as it was at that SHA, served with the content-types
// that let it render and boot. Returns null when the slug or sha is missing so a caller never opens a
// malformed URL. `sha` is scrubbed to hex so nothing but a commit id can be interpolated into the URL.
export const rollbackUrl = (slug, sha, { host = GITHACK_HOST } = {}) => {
  const clean = str(sha).replace(/[^0-9a-fA-F]/g, '');
  if (!slug || !clean) return null;
  return `${host}/${slug}/${clean}/index.html`;
};

// Turn the raw /pulls payload into the version list the surface renders: only MERGED PRs (a
// closed-but-unmerged PR never deployed), newest merge first, each carrying the commit to roll back
// to — merge_commit_sha (the merge commit on the base branch, which is exactly what Pages deployed),
// falling back to the PR head tip when the API omits it. PURE and tolerant of missing fields; capped
// so a long history can't grow the panel without bound. `currentCommit` (the deployed build, read
// from version.json) marks which row is live right now; `slug` builds each row's ready-to-open URL.
export const normalizeVersions = (pulls, { currentCommit = null, slug = null, host = GITHACK_HOST, max = MAX_VERSIONS } = {}) => {
  if (!Array.isArray(pulls)) return [];
  const here = short(currentCommit);
  const rows = [];
  for (const p of pulls) {
    if (!p || typeof p !== 'object') continue;
    if (!p.merged_at) continue;                                   // closed-but-not-merged never shipped
    const sha = str(p.merge_commit_sha || (p.head && p.head.sha) || '').trim();
    if (!sha) continue;                                           // no commit ⇒ nothing to roll back to
    const number = Number(p.number) || null;
    rows.push({
      number,
      title: str(p.title).trim() || (number ? `PR #${number}` : 'Untitled'),
      author: str(p.user && p.user.login) || null,
      sha,
      shortSha: short(sha),
      mergedAt: p.merged_at,
      date: formatVersionDate(p.merged_at),
      url: slug ? rollbackUrl(slug, sha, { host }) : null,
      prUrl: str(p.html_url) || (slug && number ? `https://github.com/${slug}/pull/${number}` : null),
      isCurrent: !!(here && short(sha) === here),
    });
  }
  // Order by when they SHIPPED (merged), newest first — the /pulls sort is by 'updated', which a late
  // comment can reshuffle, so we re-sort on merged_at ourselves for a stable deploy timeline.
  rows.sort((a, b) => str(b.mergedAt).localeCompare(str(a.mergedAt)));
  return rows.slice(0, Math.max(1, Number(max) || MAX_VERSIONS));
};

// Best-effort fetch of the closed PRs — NEVER throws; it distinguishes the faults the surface wants to
// word differently. Injected fetch keeps it unit-testable. Returns { items, error } where error is
// null | 'rate' (GitHub 403/429 — the unauthenticated hourly limit) | 'network' (no fetch / offline /
// thrown) | 'http' (any other non-2xx or a non-array body).
export const fetchVersions = async (fetchFn, slug, { perPage = 50, currentCommit = null, host = GITHACK_HOST } = {}) => {
  if (typeof fetchFn !== 'function' || !slug) return { items: [], error: 'network' };
  try {
    const res = await fetchFn(pullsApiUrl(slug, { perPage }), { headers: { Accept: 'application/vnd.github+json' } });
    if (!res || !res.ok) {
      const status = res && res.status;
      if (status === 403 || status === 429) return { items: [], error: 'rate' };
      return { items: [], error: 'http' };
    }
    const arr = await res.json();
    if (!Array.isArray(arr)) return { items: [], error: 'http' };
    return { items: normalizeVersions(arr, { currentCommit, slug, host }), error: null };
  } catch { return { items: [], error: 'network' }; }
};

// The one call the surface makes (via window.EO.versions.load): derive the repo from the running
// location (a Pages URL names its own owner/repo; anything else falls back to the canonical repo),
// read the deployed commit to mark 'current', then fetch + normalize. Fail-soft — returns the slug it
// used so the surface can render a "you are here" line even when the fetch came back empty.
export const loadVersions = async ({ fetch: fetchFn = null, location = null, slug = null, currentCommit = null, perPage = 50, host = GITHACK_HOST } = {}) => {
  const useSlug = slug || repoRef(location).slug;
  const res = await fetchVersions(fetchFn, useSlug, { perPage, currentCommit, host });
  return { ...res, slug: useSlug };
};
