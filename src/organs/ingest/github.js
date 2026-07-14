// EO: SIG·SEG·INS(Void → Field,Entity, Binding,Clearing,Making) — GitHub library — repos, files, WHOLE codebases
// GitHub as a research source — REPOS to search, FILES to read, and WHOLE CODEBASES to ingest.
// (docs/library-search.md — "The code shelf")
//
// The code twin of gutenberg.js/arxiv.js. Three motions, one contract:
//   • SEARCH   the public repository index (api.github.com/search/repositories, keyless, CORS-*),
//              each hit a repo — owner/name, stars, language, description — its `text` the repo's
//              own blurb so a snippet-only admission still says what the project IS.
//   • FULL TEXT under `fetchPages`, a repo hit reads its README (the project's own account of
//              itself) — the analogue of Gutenberg pulling the whole book.
//   • INGEST   fetchGithubRepo(ref) is the deliberate "ingest all code" path: walk the repo's git
//              tree, pull every source blob through the same one fetch primitive, and hand the
//              files to the CODE ORGAN (organs/code — code → EOT → issues from the dependency
//              order). The whole codebase is admitted as one reading: README + a file manifest +
//              the organ's findings, with the raw files returned for a deeper pass.
//
// Everything travels the ONE fetch primitive the client already has (ctx.fetchUrl / client.fetchUrl,
// through the CORS feed proxy — and api.github.com / raw.githubusercontent.com answer cross-origin,
// so direct-cors.js lets them skip the proxy entirely). The talker never reaches the network; the
// admitted doc carries the same web-source/1 provenance every fetched page carries. The code organ
// is reached by an INJECTED `readCodebase` (default: a lazy import), so this module stays light on
// the common search path and fully offline-testable — the tree parsing, file picking, README
// decoding, and id shapes are all pure.

import { admitWebSource } from './websource.js';

// ── The endpoints ───────────────────────────────────────────────────────────────────────────────
export const GITHUB_API = 'https://api.github.com';
export const githubSearchUrl = (q, k = 5) =>
  `${GITHUB_API}/search/repositories?q=${encodeURIComponent(q)}&per_page=${Math.max(1, Math.min(50, k))}&sort=stars&order=desc`;
export const githubRepoUrl = (owner, repo) => `https://github.com/${owner}/${repo}`;
export const githubRepoApiUrl = (owner, repo) => `${GITHUB_API}/repos/${owner}/${repo}`;
export const githubReadmeApiUrl = (owner, repo) => `${GITHUB_API}/repos/${owner}/${repo}/readme`;
export const githubTreeUrl = (owner, repo, branch) =>
  `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
export const githubRawUrl = (owner, repo, branch, path) =>
  `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${String(path).split('/').map(encodeURIComponent).join('/')}`;

// ── Reference shapes — the ways a user (or a hop) holds a repo / a file ────────────────────────────
// githubRepoOf(ref) → { owner, repo } | null, from owner/repo, a github.com URL, a
// raw.githubusercontent URL, or an api.github.com/repos URL. The `.git` suffix and any trailing
// path (/, /tree/…, /blob/…, /issues) are trimmed.
export const githubRepoOf = (ref) => {
  const s = String(ref || '').trim();
  const m =
    /(?:github\.com|api\.github\.com\/repos)\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/#?].*)?$/i.exec(s) ||
    /raw\.githubusercontent\.com\/([\w.-]+)\/([\w.-]+)\//i.exec(s) ||
    /^([\w.-]+)\/([\w.-]+?)(?:\.git)?$/.exec(s);
  if (!m) return null;
  const repo = m[2].replace(/\.git$/i, '');
  // Reject a bare "a/b" that is really a path fragment, not a slug — owner and repo must look like
  // GitHub names (letters/digits/._-), and the whole thing must be exactly two segments here.
  if (!/^[\w.-]+$/.test(m[1]) || !/^[\w.-]+$/.test(repo)) return null;
  return { owner: m[1], repo };
};

// githubFileOf(ref) → { owner, repo, branch, path } | null, from a blob URL
// (github.com/o/r/blob/branch/path) or a raw URL (raw.githubusercontent.com/o/r/branch/path).
export const githubFileOf = (ref) => {
  const s = String(ref || '').trim();
  let m = /github\.com\/([\w.-]+)\/([\w.-]+)\/blob\/([^/]+)\/(.+?)(?:[#?].*)?$/i.exec(s);
  if (m) return { owner: m[1], repo: m[2].replace(/\.git$/i, ''), branch: decodeURIComponent(m[3]), path: m[4] };
  m = /raw\.githubusercontent\.com\/([\w.-]+)\/([\w.-]+)\/([^/]+)\/(.+?)(?:[#?].*)?$/i.exec(s);
  if (m) return { owner: m[1], repo: m[2], branch: decodeURIComponent(m[3]), path: m[4] };
  return null;
};

// ── Cross-environment base64 → utf-8 (the README API hands content base64-encoded) ────────────────
export const b64ToUtf8 = (b64) => {
  const clean = String(b64 || '').replace(/\s+/g, '');
  if (!clean) return '';
  if (typeof Buffer !== 'undefined') { try { return Buffer.from(clean, 'base64').toString('utf8'); } catch { /* fall through */ } }
  if (typeof atob === 'function') {
    try {
      const bin = atob(clean);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      return new TextDecoder('utf-8').decode(bytes);
    } catch { try { return atob(clean); } catch { return ''; } }
  }
  return '';
};

// ── Search — repos as items ───────────────────────────────────────────────────────────────────────
// parseRepoSearch(json, k) → catalog hits. `text` is the repo's description (its own blurb), so a
// snippet-only admission says what the project is; the README arrives only under fetchPages. Each
// item keeps owner/repo/branch so the full-text hook and the code-ingest path need not re-search.
export const parseRepoSearch = (json, k = 5) => {
  let j = json;
  if (typeof j === 'string') { try { j = JSON.parse(j); } catch { return []; } }
  return (j?.items || []).slice(0, Math.max(1, k)).map((r) => {
    const owner = r.owner?.login || String(r.full_name || '').split('/')[0] || '';
    const repo = r.name || String(r.full_name || '').split('/')[1] || '';
    const stars = Number.isFinite(r.stargazers_count) ? r.stargazers_count : 0;
    const lang = r.language || '';
    const desc = String(r.description || '').trim();
    const facts = [lang, stars ? `★ ${stars.toLocaleString('en-US')}` : ''].filter(Boolean).join(' · ');
    return {
      title: r.full_name || `${owner}/${repo}`,
      text: desc ? (facts ? `${desc} (${facts})` : desc) : (facts || r.full_name || `${owner}/${repo}`),
      url: r.html_url || githubRepoUrl(owner, repo),
      source: 'github',
      owner, repo,
      branch: r.default_branch || 'HEAD',
      description: desc,
      language: lang,
      stars,
      topics: Array.isArray(r.topics) ? r.topics.slice(0, 8) : [],
      pushedAt: r.pushed_at || null,
      license: r.license?.spdx_id || r.license?.name || null,
    };
  }).filter((it) => it.owner && it.repo);
};

// The search KIND (webfetch.js SEARCH_SOURCES shape): (ctx, query, k) → items. Snippet-level (the
// repo descriptions) until fetchPages asks for the READMEs / the code itself.
export const GITHUB_SOURCES = {
  github: async (ctx, query, k) => parseRepoSearch((await ctx.fetchUrl(githubSearchUrl(query, k))).text, k),
};

// fetchReadme(client, owner, repo) → the README as text, or ''. The /readme endpoint resolves
// whatever the project named it (README.md / .rst / .txt) and returns it base64-encoded; a raw
// download_url is the fallback when the payload carries no inline content.
export const fetchReadme = async (client, owner, repo) => {
  try {
    const j = JSON.parse((await client.fetchUrl(githubReadmeApiUrl(owner, repo))).text);
    if (j?.content && /base64/i.test(j.encoding || 'base64')) {
      const text = b64ToUtf8(j.content);
      if (text) return text;
    }
    if (j?.download_url) {
      const raw = (await client.fetchUrl(j.download_url)).text;
      if (raw) return raw;
    }
  } catch { /* no README, a private repo, or a rate-limit — the caller keeps the blurb */ }
  return '';
};

// The FULL-TEXT hook (webfetch.js FULL_TEXT shape): under fetchPages, a github item reads its
// README — the project's own account of itself — with the description as the floor so a full-text
// miss is a smaller read, never an empty one.
export const GITHUB_FULLTEXT = {
  github: async (client, item) => {
    const owner = item?.owner, repo = item?.repo;
    if (!owner || !repo) return item?.text || '';
    const readme = await fetchReadme(client, owner, repo);
    if (!readme) return item?.description || item?.text || '';
    const head = item?.title ? `# ${item.title}\n${item.url || ''}\n\n` : '';
    return head + readme;
  },
};

// ── Whole-codebase ingest — the "ingest all code" path ────────────────────────────────────────────
// The source extensions the code organ (organs/code) can read structurally: JS/TS (facts.js),
// Python (python.js), Go (go.js), Rust (rust.js). Others are pulled as prose when explicitly asked
// for, but the default codebase read stays on the languages the ISSUE FOLD actually judges.
export const CODE_EXTENSIONS = Object.freeze(['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'py', 'go', 'rs']);
const extOf = (path) => (/\.([a-z0-9]+)$/i.exec(String(path || '')) || [])[1]?.toLowerCase() || '';

// Paths that are never source worth reading: dependency trees, build output, vendored copies,
// minified bundles, sourcemaps, and lockfiles. Kept out so the organ reads the project's OWN code.
const SKIP_PATH = /(^|\/)(node_modules|bower_components|vendor|third_party|dist|build|out|\.next|\.nuxt|coverage|__pycache__|\.venv|venv|target|\.git)\//i;
const SKIP_FILE = /(\.min\.(?:js|css)|\.map|-lock\.(?:json|yaml)|\.lock)$/i;

// parseTree(json) → the repo's blobs as { path, size }. Truncated trees (very large repos) still
// yield what GitHub returned — a partial read, never a throw.
export const parseTree = (json) => {
  let j = json;
  if (typeof j === 'string') { try { j = JSON.parse(j); } catch { return { entries: [], truncated: false }; } }
  const entries = (j?.tree || [])
    .filter((e) => e?.type === 'blob' && e.path)
    .map((e) => ({ path: e.path, size: Number.isFinite(e.size) ? e.size : 0 }));
  return { entries, truncated: !!j?.truncated };
};

// pickCodeFiles(entries, opts) → the source blobs worth reading, path-sorted, bounded by count and
// per-file size so a monorepo cannot flood a single ingest. The bounds are the codebase's analogue
// of gutenberg's hang guard: a deliberate ceiling on how much one repo may pull.
export const pickCodeFiles = (entries, { maxFiles = 40, maxBytes = 200_000, extensions = CODE_EXTENSIONS } = {}) => {
  const ok = new Set(extensions);
  return (entries || [])
    .filter((e) => e && e.path && !SKIP_PATH.test('/' + e.path) && !SKIP_FILE.test(e.path))
    .filter((e) => ok.has(extOf(e.path)))
    .filter((e) => !e.size || e.size <= maxBytes)
    .sort((a, b) => a.path.localeCompare(b.path))
    .slice(0, Math.max(1, maxFiles));
};

const nowIso = () => { try { return new Date().toISOString(); } catch { return null; } };

// The code organ, reached lazily so importing this module (and, through webfetch, the whole search
// path) does not statically pull organs/code in. A caller may inject its own `readCodebase` (a fake
// in tests, or the already-loaded organ) to keep the ingest fully offline + synchronous.
const loadReadCodebase = async () => {
  try { const mod = await import('../code/index.js'); return mod.readCodebase; }
  catch { return null; }
};

// A compact per-repo digest as the admitted reading: the README (the project's account), the file
// manifest (what was pulled), and the code organ's report (the dependency order + the issues read
// off the tuples). The raw files ride back on the return for a deeper pass (the widget/code room).
const digestOf = ({ owner, repo, branch, readme, files, codebase, truncated }) => {
  const lines = [];
  lines.push(`# ${owner}/${repo}`);
  lines.push(githubRepoUrl(owner, repo) + (branch && branch !== 'HEAD' ? ` @ ${branch}` : ''));
  if (readme) lines.push('', readme.trim());
  lines.push('', `## Source files (${files.length}${truncated ? ', tree truncated' : ''})`);
  for (const f of files) lines.push(`- ${f.path}`);
  if (codebase?.report) lines.push('', '## Code organ — issues from the dependency order', '', String(codebase.report).trim());
  return lines.join('\n');
};

// fetchGithubRepo(ref, opts) → { doc, record, files, codebase, owner, repo, branch } | null — the
// DELIBERATE "ingest all code" path. Names a repo (owner/repo or a github URL); walks its tree,
// pulls each source blob through the proxy, hands the files to the code organ, and admits the whole
// codebase as one reading. `analyze:false` skips the organ (pull-only); `readCodebase` is injectable
// for offline tests. Bounded by maxFiles/maxBytes so one repo cannot pull unboundedly.
export const fetchGithubRepo = async (ref, {
  client, store = null, rawStore = null, fetched_at = nowIso(),
  branch = null, maxFiles = 40, maxBytes = 200_000, extensions = CODE_EXTENSIONS,
  analyze = true, readCodebase = null, codeOpts = {}, hangGuard = 8_000_000,
} = {}) => {
  const id = githubRepoOf(ref);
  if (!id || !client) return null;
  const { owner, repo } = id;

  // Resolve the default branch when the caller did not pin one (a repo's tree lives on a branch).
  let ref_branch = branch;
  if (!ref_branch) {
    try { ref_branch = JSON.parse((await client.fetchUrl(githubRepoApiUrl(owner, repo))).text)?.default_branch || null; }
    catch { /* fall back to a probe below */ }
    ref_branch = ref_branch || 'main';
  }

  // The git tree → the source blobs worth reading. A miss on `main` retries `master` once (the two
  // common defaults) so a repo we could not resolve the branch for still reads.
  let tree = parseTree((await client.fetchUrl(githubTreeUrl(owner, repo, ref_branch)).catch(() => ({ text: '' }))).text);
  if (!tree.entries.length && ref_branch === 'main') {
    ref_branch = 'master';
    tree = parseTree((await client.fetchUrl(githubTreeUrl(owner, repo, ref_branch)).catch(() => ({ text: '' }))).text);
  }
  const picked = pickCodeFiles(tree.entries, { maxFiles, maxBytes, extensions });

  // Pull each blob's raw text (sequentially — one advancing fetch at a time, the proxy-friendly
  // pace). A failed blob is skipped, never fatal: a partial codebase still reads.
  const files = [];
  for (const f of picked) {
    try {
      const text = (await client.fetchUrl(githubRawUrl(owner, repo, ref_branch, f.path))).text;
      if (text) files.push({ path: f.path, text });
    } catch { /* skip the blob, keep pulling */ }
  }
  const readme = await fetchReadme(client, owner, repo);
  if (!files.length && !readme) return null;

  // Hand the files to the code organ (code → EOT → issues from the dependency order).
  let codebase = null;
  if (analyze && files.length) {
    const rc = readCodebase || await loadReadCodebase();
    if (rc) { try { codebase = rc(files, { docId: `github-${owner}-${repo}`, ...codeOpts }); } catch { /* the digest still stands on the README + manifest */ } }
  }

  const text = digestOf({ owner, repo, branch: ref_branch, readme, files, codebase, truncated: tree.truncated });
  const payload = {
    url: githubRepoUrl(owner, repo), title: `${owner}/${repo}`, text,
    retrieval_query: String(ref), engine: 'web:github', fetched_at,
  };
  const admitted = store ? store.admit(payload, { hangGuard }) : admitWebSource(payload, { hangGuard });
  if (rawStore && admitted?.record?.content_hash) {
    try { await rawStore.put(admitted.record.content_hash, text, { url: payload.url, title: payload.title, fetched_at }); }
    catch { /* never block admission */ }
  }
  return { ...admitted, files, codebase, owner, repo, branch: ref_branch, truncated: tree.truncated };
};

// fetchGithubFile(ref, opts) → { doc, record } | null — the deliberate one-FILE path: name a file
// by its blob or raw URL and admit its contents as a source (a single module the reader stands on).
export const fetchGithubFile = async (ref, { client, store = null, rawStore = null, fetched_at = nowIso() } = {}) => {
  const f = githubFileOf(ref);
  if (!f || !client) return null;
  const text = (await client.fetchUrl(githubRawUrl(f.owner, f.repo, f.branch, f.path)).catch(() => ({ text: '' }))).text;
  if (!text) return null;
  const payload = {
    url: `https://github.com/${f.owner}/${f.repo}/blob/${f.branch}/${f.path}`,
    title: `${f.owner}/${f.repo} — ${f.path}`, text,
    retrieval_query: String(ref), engine: 'web:github', fetched_at,
  };
  const admitted = store ? store.admit(payload) : admitWebSource(payload);
  if (rawStore && admitted?.record?.content_hash) {
    try { await rawStore.put(admitted.record.content_hash, text, { url: payload.url, title: payload.title, fetched_at }); }
    catch { /* never block admission */ }
  }
  return admitted;
};
