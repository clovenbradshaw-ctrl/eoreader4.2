// EO: INS·CON(Network,Void → Entity,Link, Making,Binding) — export provenance (what produced this)
// provenance.js — assemble the answer to "what produced this conversation?" so a downloaded chat
// audit stands on its own. Three things a reader needs and the export never carried:
//
//   1. THE APP + ITS VERSION. Not just "EO Reader 4.2" but the exact BUILD — the commit the running
//      site was deployed from (the Pages workflow stamps ./version.json; readBuild fetches it). A
//      receipt from an unnamed build is half a receipt.
//   2. THE LATEST GITHUB VERSION, IF ACCESSIBLE. Best-effort: the head commit of the repo's default
//      branch (fetchLatestCommit). It lets a reader tell a current export from a stale one — and
//      "if accessible" is literal: offline / rate-limited / private all resolve to null, never a throw.
//   3. WHICH MODEL ANSWERED. Threaded in from model/interface.js describeModel by the caller (the
//      backend + its exact model), because the model is not this module's to reach.
//
// Everything here is PURE or BEST-EFFORT. The pure helpers (repoRef, parseBuild, reconcile,
// composeProvenance) are unit-tested with no network; the gatherers (readBuild, fetchLatestCommit,
// gatherProvenance) take an injected fetch and swallow every fault to null — provenance is a
// courtesy on top of the export, never a precondition for it. No import touches the network.

// The canonical repo, used when the running location can't name one (local dev, a custom domain).
// The app is deployed to GitHub Pages, so a live session usually names its own owner/repo instead.
export const REPO = 'clovenbradshaw-ctrl/eoreader4.2';
export const APP_NAME = 'EO Reader';
export const APP_VERSION = '4.2';

const str = (x) => String(x ?? '');
const short = (sha) => (sha ? str(sha).replace(/[^0-9a-f]/gi, '').slice(0, 7) : null);

// Where this app lives on GitHub, derived from the running location when it can be — a GitHub Pages
// URL is `https://<owner>.github.io/<repo>/…`, so the owner is the host label and the repo the first
// path segment. Anything else (a custom domain, file://, Node) falls back to the canonical REPO but
// still records where it was actually served (siteUrl), so the export links the code AND the instance.
// `location` may be a Location, a URL, an href string, or null. Total: any fault ⇒ the canonical repo.
export const repoRef = (location = null) => {
  const [defOwner, defRepo] = REPO.split('/');
  const canonical = { owner: defOwner, repo: defRepo, slug: REPO, repoUrl: `https://github.com/${REPO}`, siteUrl: null };
  try {
    if (!location) return canonical;
    const href = typeof location === 'string' ? location : str(location.href);
    if (!href) return canonical;
    const url = new URL(href);
    const pages = /^([a-z0-9-]+)\.github\.io$/i.exec(url.hostname || '');
    if (pages) {
      const owner = pages[1];
      const seg = url.pathname.split('/').filter(Boolean);
      const repo = seg[0] || defRepo;
      const slug = `${owner}/${repo}`;
      return { owner, repo, slug, repoUrl: `https://github.com/${slug}`,
               siteUrl: `${url.origin}/${seg[0] ? seg[0] + '/' : ''}` };
    }
    // Served from somewhere that doesn't name the repo — keep the canonical code link, note the host.
    return { ...canonical, siteUrl: `${url.origin}${url.pathname}` };
  } catch { return canonical; }
};

// Normalise a version.json (whatever the deploy stamped) into a stable build record, or null when
// there is nothing usable. Tolerant of field-name drift (commit/sha, builtAt/built_at/date) so a
// hand-written or CI-written marker both parse.
export const parseBuild = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const commit = raw.commit || raw.sha || raw.gitCommit || null;
  const rec = {
    app:         raw.app || null,
    version:     raw.version || null,
    commit:      commit || null,
    shortCommit: raw.shortCommit || short(commit),
    ref:         raw.ref || raw.branch || null,
    builtAt:     raw.builtAt || raw.built_at || raw.date || null,
    runId:       raw.runId || raw.run_id || null,
  };
  // A marker with no identifying field at all is noise, not a build.
  return (rec.commit || rec.builtAt || rec.version) ? rec : null;
};

// The running build vs the latest on GitHub. 'current' when the deployed commit is the branch head,
// 'outdated' when it demonstrably is not, 'unknown' when either side is missing (offline, local dev,
// no stamp). Compared on the 7-char prefix so a full sha and a short sha reconcile.
export const reconcile = (build, latest) => {
  const running = build?.commit || null;
  const head = latest?.commit || null;
  if (!running || !head) return { status: 'unknown', running, head };
  const same = short(running) === short(head);
  return { status: same ? 'current' : 'outdated', running, head };
};

// A one-line, human reading of the freshness verdict — for the export's provenance block.
export const freshnessNote = (freshness, build, latest) => {
  switch (freshness) {
    case 'current':  return 'This export was produced by the current published build.';
    case 'outdated': return `A newer build has since been published on GitHub (${latest?.shortCommit || 'HEAD'}); this export predates it.`;
    default:         return build?.commit
      ? 'The latest published build could not be checked (offline or unreachable).'
      : 'Build version unknown — this looks like a local or unstamped run, not the published site.';
  }
};

// ── best-effort network reads (each takes an injected fetch; null on ANY fault) ──────────────────

// The deployed build marker the Pages workflow writes beside the site (./version.json). `base` is the
// running document URL to resolve it against. No fetch, non-2xx, bad JSON, or a marker with nothing
// in it ⇒ null — a local/unstamped run simply has no build, which the export states plainly.
export const readBuild = async (fetchFn, base = null) => {
  if (typeof fetchFn !== 'function') return null;
  try {
    const url = new URL('version.json', base || 'http://localhost/').href;
    const res = await fetchFn(url, { cache: 'no-store' });
    if (!res || !res.ok) return null;
    return parseBuild(await res.json());
  } catch { return null; }
};

// The head commit of the repo's DEFAULT BRANCH — the "latest github version" — over the public
// GitHub API (no auth; the unauthenticated rate limit is ample for a per-export check). `GET
// /repos/{slug}/commits` lists the default branch newest-first; take the first. Best-effort by
// contract: offline, rate-limited (403), private (404), or malformed all resolve to null.
export const fetchLatestCommit = async (fetchFn, slug) => {
  if (typeof fetchFn !== 'function' || !slug) return null;
  try {
    const res = await fetchFn(`https://api.github.com/repos/${slug}/commits?per_page=1`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res || !res.ok) return null;
    const arr = await res.json();
    const c = Array.isArray(arr) ? arr[0] : null;
    if (!c || !c.sha) return null;
    return {
      commit:      c.sha,
      shortCommit: short(c.sha),
      url:         c.html_url || `https://github.com/${slug}/commit/${c.sha}`,
      committedAt: c.commit?.committer?.date || c.commit?.author?.date || null,
      message:     str(c.commit?.message).split('\n')[0].slice(0, 140) || null,
    };
  } catch { return null; }
};

// ── compose ──────────────────────────────────────────────────────────────────────────────────────

// The final bundle the chat export renders — PURE, so the app assembles it synchronously at export
// time from the (possibly cached) network pieces plus the CURRENT model and clock. `model` is a
// describeModel record; `models` is the distinct set actually used across the conversation (the
// export computes it from the per-turn records and passes it here). freshness/note reconcile the
// running build against the latest so the reader knows how current the producing app was.
export const composeProvenance = ({
  app = APP_NAME, version = APP_VERSION,
  build = null, latest = null, repo = null,
  model = null, models = null, exportedAt = null,
} = {}) => {
  const ref = repo && repo.slug ? repo : repoRef(null);
  const { status } = reconcile(build, latest);
  const used = Array.isArray(models) && models.length ? models : (model ? [model] : []);
  return {
    app, version,
    repo: ref.slug, repoUrl: ref.repoUrl, siteUrl: ref.siteUrl || null,
    build:  build || null,
    latest: latest || null,
    freshness: status,                        // 'current' | 'outdated' | 'unknown'
    freshnessNote: freshnessNote(status, build, latest),
    model:  model || null,                    // the session's current/last talker
    models: used,                             // every distinct model that produced a turn here
    exportedAt: exportedAt || null,
  };
};

// One-shot convenience: gather the network pieces and compose. The app usually caches readBuild /
// fetchLatestCommit at boot and calls composeProvenance itself at export time (model + clock fresh),
// but this is the single call for a caller that just wants the whole bundle. Never throws.
export const gatherProvenance = async ({ fetch: fetchFn = null, location = null, model = null, now = null } = {}) => {
  const repo = repoRef(location);
  const base = location ? (typeof location === 'string' ? location : str(location.href)) : null;
  const [build, latest] = await Promise.all([
    readBuild(fetchFn, base),
    fetchLatestCommit(fetchFn, repo.slug),
  ]);
  return composeProvenance({ build, latest, repo, model, now, exportedAt: now });
};
