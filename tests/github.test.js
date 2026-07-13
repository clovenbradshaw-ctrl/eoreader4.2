import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseRepoSearch, githubRepoOf, githubFileOf, b64ToUtf8, parseTree, pickCodeFiles,
  fetchReadme, fetchGithubRepo, fetchGithubFile, CODE_EXTENSIONS,
  githubSearchUrl, githubRawUrl, GITHUB_SOURCES, GITHUB_FULLTEXT,
} from '../src/organs/ingest/github.js';
import { routeKind, SEARCH_SOURCES } from '../src/organs/ingest/webfetch.js';
import { directCorsUrl } from '../src/organs/ingest/direct-cors.js';

// The GitHub organ is the code shelf: search repos, read READMEs, INGEST whole codebases through
// the code organ. Every test is a named falsifier — it fails if the mechanism is decorative — and
// each pins one movement (search · full-text · deliberate ingest) offline, with an injected client.

const SEARCH_JSON = JSON.stringify({
  total_count: 2,
  items: [
    {
      full_name: 'octocat/Hello-World', name: 'Hello-World', owner: { login: 'octocat' },
      description: 'My first repository on GitHub!', html_url: 'https://github.com/octocat/Hello-World',
      stargazers_count: 2500, language: 'JavaScript', default_branch: 'main',
      topics: ['demo', 'octocat'], license: { spdx_id: 'MIT' }, pushed_at: '2020-01-01T00:00:00Z',
    },
    { full_name: 'torvalds/linux', name: 'linux', owner: { login: 'torvalds' }, description: '', stargazers_count: 170000, language: 'C' },
  ],
});

test('github: parseRepoSearch reads owner/name/stars/language, blurb as the text', () => {
  const items = parseRepoSearch(SEARCH_JSON, 5);
  assert.equal(items.length, 2);
  assert.equal(items[0].owner, 'octocat');
  assert.equal(items[0].repo, 'Hello-World');
  assert.equal(items[0].source, 'github');
  assert.equal(items[0].stars, 2500);
  assert.equal(items[0].language, 'JavaScript');
  assert.equal(items[0].branch, 'main');
  assert.match(items[0].text, /My first repository/);
  assert.match(items[0].text, /JavaScript/);          // the facts ride in the snippet
  assert.deepEqual(items[0].topics, ['demo', 'octocat']);
  // a description-less repo still says what it is (language · stars)
  assert.match(items[1].text, /★|C\b/);
});

test('github: githubRepoOf reads every shape a repo is held by', () => {
  assert.deepEqual(githubRepoOf('octocat/Hello-World'), { owner: 'octocat', repo: 'Hello-World' });
  assert.deepEqual(githubRepoOf('https://github.com/octocat/Hello-World'), { owner: 'octocat', repo: 'Hello-World' });
  assert.deepEqual(githubRepoOf('https://github.com/octocat/Hello-World.git'), { owner: 'octocat', repo: 'Hello-World' });
  assert.deepEqual(githubRepoOf('https://github.com/octocat/Hello-World/tree/main/src'), { owner: 'octocat', repo: 'Hello-World' });
  assert.deepEqual(githubRepoOf('https://api.github.com/repos/octocat/Hello-World'), { owner: 'octocat', repo: 'Hello-World' });
  assert.equal(githubRepoOf('just some words'), null);
  assert.equal(githubRepoOf(''), null);
});

test('github: githubFileOf reads blob and raw URLs', () => {
  assert.deepEqual(githubFileOf('https://github.com/o/r/blob/main/src/a.js'),
    { owner: 'o', repo: 'r', branch: 'main', path: 'src/a.js' });
  assert.deepEqual(githubFileOf('https://raw.githubusercontent.com/o/r/dev/lib/b.py'),
    { owner: 'o', repo: 'r', branch: 'dev', path: 'lib/b.py' });
  assert.equal(githubFileOf('https://github.com/o/r'), null);   // not a file ref
});

test('github: b64ToUtf8 round-trips UTF-8 (the README API hands content base64)', () => {
  const s = 'Hello, 世界 — a README.';
  assert.equal(b64ToUtf8(Buffer.from(s, 'utf8').toString('base64')), s);
  assert.equal(b64ToUtf8(''), '');
});

test('github: parseTree + pickCodeFiles keep source, drop vendor/min/oversize', () => {
  const tree = JSON.stringify({ truncated: false, tree: [
    { type: 'blob', path: 'src/a.js', size: 100 },
    { type: 'blob', path: 'src/b.py', size: 200 },
    { type: 'blob', path: 'node_modules/dep/index.js', size: 100 },   // vendored → dropped
    { type: 'blob', path: 'dist/bundle.min.js', size: 100 },          // minified → dropped
    { type: 'blob', path: 'README.md', size: 100 },                   // not a code ext → dropped
    { type: 'blob', path: 'huge.js', size: 999_999 },                 // oversize → dropped
    { type: 'tree', path: 'src', size: 0 },                           // a directory → not a blob
  ] });
  const { entries, truncated } = parseTree(tree);
  assert.equal(truncated, false);
  const picked = pickCodeFiles(entries, { maxFiles: 40, maxBytes: 200_000 });
  assert.deepEqual(picked.map((f) => f.path), ['src/a.js', 'src/b.py']);   // path-sorted, filtered
  // the count bound holds
  assert.equal(pickCodeFiles(entries, { maxFiles: 1 }).length, 1);
});

test('github: CODE_EXTENSIONS covers the languages the code organ reads', () => {
  for (const ext of ['js', 'ts', 'py', 'go', 'rs']) assert.ok(CODE_EXTENSIONS.includes(ext), ext);
});

test('github: the search kind fetches and parses through ctx', async () => {
  let seen = null;
  const ctx = { fetchUrl: async (u) => { seen = u; return { text: SEARCH_JSON }; } };
  const items = await GITHUB_SOURCES.github(ctx, 'hello world', 3);
  assert.equal(seen, githubSearchUrl('hello world', 3));
  assert.equal(items.length, 2);
  assert.equal(items[0].source, 'github');
});

test('github: full-text hook reads the README, description as the floor', async () => {
  const readme = '# Hello-World\n\nThis is the readme body, long enough to matter.';
  const client = { fetchUrl: async (u) => {
    if (/\/readme$/.test(u)) return { text: JSON.stringify({ content: Buffer.from(readme, 'utf8').toString('base64'), encoding: 'base64' }) };
    throw new Error('unexpected ' + u);
  } };
  const text = await GITHUB_FULLTEXT.github(client, { owner: 'octocat', repo: 'Hello-World', title: 'octocat/Hello-World', url: 'https://github.com/octocat/Hello-World', description: 'blurb' });
  assert.match(text, /This is the readme body/);
  assert.match(text, /octocat\/Hello-World/);       // the heading is prepended
  // no README (a throw) falls back to the description, never empty
  const bad = { fetchUrl: async () => { throw new Error('404'); } };
  assert.equal(await GITHUB_FULLTEXT.github(bad, { owner: 'o', repo: 'r', description: 'the floor blurb' }), 'the floor blurb');
});

test('github: fetchReadme prefers inline base64, falls back to download_url', async () => {
  const client = { fetchUrl: async (u) => {
    if (/\/readme$/.test(u)) return { text: JSON.stringify({ encoding: 'base64', download_url: 'https://raw.githubusercontent.com/o/r/main/README.md' }) };
    return { text: 'raw readme via download_url' };
  } };
  assert.equal(await fetchReadme(client, 'o', 'r'), 'raw readme via download_url');
});

// A fake GitHub the ingest walks: default branch → tree → blobs → README.
const mkRepoClient = (files) => ({
  fetchUrl: async (u) => {
    if (/\/repos\/o\/r$/.test(u)) return { text: JSON.stringify({ default_branch: 'main' }) };
    if (/\/git\/trees\//.test(u)) return { text: JSON.stringify({ truncated: false, tree: Object.keys(files).map((p) => ({ type: 'blob', path: p, size: files[p].length })) }) };
    if (/\/readme$/.test(u)) return { text: JSON.stringify({ content: Buffer.from('# r\nreadme', 'utf8').toString('base64'), encoding: 'base64' }) };
    const m = /raw\.githubusercontent\.com\/o\/r\/main\/(.+)$/.exec(u);
    if (m) { const p = decodeURIComponent(m[1]); if (files[p] != null) return { text: files[p] }; }
    throw new Error('unexpected ' + u);
  },
});

test('github: fetchGithubRepo walks the tree, pulls blobs, feeds the CODE ORGAN', async () => {
  const files = { 'src/a.js': 'export const x = 1;\n', 'src/b.js': "import { x } from './a.js';\nexport const y = x + 1;\n" };
  const client = mkRepoClient(files);
  let handed = null;
  const readCodebase = (fs) => { handed = fs; return { report: 'ISSUES: none', issues: [], order: ['src/a.js', 'src/b.js'] }; };
  const res = await fetchGithubRepo('o/r', { client, readCodebase });
  assert.ok(res, 'a repo with source resolves');
  assert.equal(res.owner, 'o'); assert.equal(res.repo, 'r'); assert.equal(res.branch, 'main');
  // every source blob reached the code organ
  assert.deepEqual(handed.map((f) => f.path).sort(), ['src/a.js', 'src/b.js']);
  assert.equal(res.files.length, 2);
  assert.ok(res.codebase && /ISSUES/.test(res.codebase.report));
  // the admitted reading carries the digest: repo header, the file manifest, the organ's report
  assert.match(res.doc.text, /# o\/r/);
  assert.match(res.doc.text, /## Source files \(2\)/);
  assert.match(res.doc.text, /Code organ/);
  assert.match(res.doc.text, /readme/);
  assert.equal(res.record.engine, 'web:github');
});

test('github: fetchGithubRepo with analyze:false pulls files but skips the organ', async () => {
  const files = { 'main.py': 'def f():\n    return 1\n' };
  const res = await fetchGithubRepo('o/r', { client: mkRepoClient(files), analyze: false });
  assert.equal(res.files.length, 1);
  assert.equal(res.codebase, null);
  assert.equal(res.files[0].path, 'main.py');
});

test('github: fetchGithubRepo returns null on a non-repo ref or no client', async () => {
  assert.equal(await fetchGithubRepo('not a repo', { client: mkRepoClient({}) }), null);
  assert.equal(await fetchGithubRepo('o/r', {}), null);
});

test('github: fetchGithubFile admits one file from a blob URL', async () => {
  const client = { fetchUrl: async (u) => {
    if (/raw\.githubusercontent\.com\/o\/r\/main\/src\/a\.js$/.test(u)) return { text: 'export const x = 1;' };
    throw new Error('unexpected ' + u);
  } };
  const res = await fetchGithubFile('https://github.com/o/r/blob/main/src/a.js', { client });
  assert.ok(res && res.doc);
  assert.match(res.doc.text, /export const x/);
  assert.match(res.record.title, /o\/r — src\/a\.js/);
});

test('github: routeKind and direct-CORS reach the code shelf', () => {
  assert.equal(routeKind('github tree-sitter parser'), 'github');       // named source wins
  assert.equal(routeKind('the source code for a JSON parser'), 'github');
  assert.equal(routeKind('an open-source implementation of raft'), 'github');
  assert.equal(routeKind('the capital of france'), 'wikipedia');        // default is unmoved
  assert.ok(SEARCH_SOURCES.github, 'github is a registered search kind');
  // api.github.com + raw host answer cross-origin → fetched straight, no proxy
  assert.equal(directCorsUrl(githubSearchUrl('x', 3)), githubSearchUrl('x', 3));
  assert.equal(directCorsUrl(githubRawUrl('o', 'r', 'main', 'a.js')), githubRawUrl('o', 'r', 'main', 'a.js'));
});
