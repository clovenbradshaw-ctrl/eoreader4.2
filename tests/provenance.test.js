import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  repoRef, parseBuild, reconcile, freshnessNote,
  readBuild, fetchLatestCommit, composeProvenance, gatherProvenance,
  APP_NAME, APP_VERSION, REPO,
} from '../src/rooms/reader/provenance.js';
import { describeModel } from '../src/model/interface.js';

// Provenance is the "what produced this" seam: the app, the exact published build, the latest build
// on GitHub, and the model that answered. These pin the PURE helpers (no network) and prove the
// best-effort gatherers degrade to null on every fault rather than throwing — provenance is a
// courtesy on top of the export, never a precondition for it.

// ── describeModel (model/interface.js) — a backend naming itself ─────────────────────────────────

test('describeModel: reads a backend describe(), falls back to id/kind, and never throws', () => {
  const full = describeModel({ id: 'claude', kind: 'remote',
    describe: () => ({ backend: 'claude', kind: 'remote', model: 'claude-opus-4-8', label: 'Claude · hosted API (Anthropic)' }) });
  assert.deepEqual(full, { backend: 'claude', kind: 'remote', model: 'claude-opus-4-8', label: 'Claude · hosted API (Anthropic)' });

  // no describe() → the coarse { id, kind } every backend already carries
  assert.deepEqual(describeModel({ id: 'wllama', kind: 'local' }),
    { backend: 'wllama', kind: 'local', model: null, label: null });

  // a throwing describe() must not cost the caller — degrade to id/kind
  assert.deepEqual(describeModel({ id: 'webllm', kind: 'local', describe: () => { throw new Error('cold'); } }),
    { backend: 'webllm', kind: 'local', model: null, label: null });

  assert.equal(describeModel(null), null);
});

// ── repoRef — derive owner/repo from the running location ────────────────────────────────────────

test('repoRef: reads owner/repo from a GitHub Pages URL, falls back to the canonical repo', () => {
  const pages = repoRef('https://clovenbradshaw-ctrl.github.io/eoreader4.2/index.html');
  assert.equal(pages.owner, 'clovenbradshaw-ctrl');
  assert.equal(pages.repo, 'eoreader4.2');
  assert.equal(pages.slug, 'clovenbradshaw-ctrl/eoreader4.2');
  assert.equal(pages.repoUrl, 'https://github.com/clovenbradshaw-ctrl/eoreader4.2');
  assert.match(pages.siteUrl, /github\.io\/eoreader4\.2\//);

  // null / non-pages host → the canonical repo, but a custom host still records where it served
  assert.equal(repoRef(null).slug, REPO);
  const custom = repoRef('https://reader.example.com/app/');
  assert.equal(custom.slug, REPO);
  assert.equal(custom.siteUrl, 'https://reader.example.com/app/');
});

// ── parseBuild / reconcile / freshnessNote — the build record and its freshness ──────────────────

test('parseBuild: normalises a version.json, tolerates field drift, rejects an empty marker', () => {
  const b = parseBuild({ app: 'EO Reader', version: '4.2', commit: 'abcdef1234567890', ref: 'main', builtAt: '2026-07-10T00:00:00Z' });
  assert.equal(b.commit, 'abcdef1234567890');
  assert.equal(b.shortCommit, 'abcdef1', 'the short sha is derived when absent');
  assert.equal(b.ref, 'main');

  // alternative field names still parse
  const alt = parseBuild({ sha: 'deadbeefcafebabe', built_at: '2026-01-01T00:00:00Z', branch: 'main' });
  assert.equal(alt.commit, 'deadbeefcafebabe');
  assert.equal(alt.shortCommit, 'deadbee');
  assert.equal(alt.ref, 'main');

  assert.equal(parseBuild({}), null, 'a marker with nothing identifying is not a build');
  assert.equal(parseBuild(null), null);
});

test('reconcile: current when the deployed commit is the head, outdated when not, unknown when either is missing', () => {
  assert.equal(reconcile({ commit: 'abcdef1234' }, { commit: 'abcdef1234' }).status, 'current');
  assert.equal(reconcile({ commit: 'abcdef1000' }, { commit: 'abcdef1234' }).status, 'current', 'compared on the 7-char prefix');
  assert.equal(reconcile({ commit: 'aaaaaaa1' }, { commit: 'bbbbbbb2' }).status, 'outdated');
  assert.equal(reconcile(null, { commit: 'abc' }).status, 'unknown');
  assert.equal(reconcile({ commit: 'abc' }, null).status, 'unknown');

  assert.match(freshnessNote('current'), /current published build/);
  assert.match(freshnessNote('outdated', {}, { shortCommit: 'e4f5g6h' }), /newer build/);
  assert.match(freshnessNote('unknown', null), /local or unstamped/);
});

// ── readBuild / fetchLatestCommit — best-effort network, null on any fault ────────────────────────

const resp = (ok, body, status = ok ? 200 : 404) => ({ ok, status, json: async () => body });
const routedFetch = (routes) => async (url) => {
  for (const [needle, r] of routes) if (String(url).includes(needle)) return r;
  return resp(false, {}, 404);
};

test('readBuild: fetches ./version.json and parses it; null with no fetch or a non-2xx', async () => {
  const fetchOk = routedFetch([['version.json', resp(true, { app: 'EO Reader', version: '4.2', commit: 'abcdef1234567890', ref: 'main', builtAt: 't' })]]);
  const b = await readBuild(fetchOk, 'https://clovenbradshaw-ctrl.github.io/eoreader4.2/');
  assert.equal(b.shortCommit, 'abcdef1');
  assert.equal(b.ref, 'main');

  assert.equal(await readBuild(routedFetch([['version.json', resp(false, {}, 404)]]), 'https://x/'), null, 'non-2xx → null');
  assert.equal(await readBuild(null, 'https://x/'), null, 'no fetch (Node/tests) → null');
});

test('fetchLatestCommit: reads the default-branch head; null on 403/404/no-slug', async () => {
  const commits = [{ sha: 'a1b2c3d4e5f6a7b8', html_url: 'https://github.com/o/r/commit/a1b2c3d4e5f6a7b8',
    commit: { committer: { date: '2026-07-10T00:00:00Z' }, message: 'ship it\n\nbody' } }];
  const okFetch = routedFetch([['api.github.com', resp(true, commits)]]);
  const latest = await fetchLatestCommit(okFetch, 'clovenbradshaw-ctrl/eoreader4.2');
  assert.equal(latest.commit, 'a1b2c3d4e5f6a7b8');
  assert.equal(latest.shortCommit, 'a1b2c3d');
  assert.equal(latest.message, 'ship it', 'the subject line only, no body');
  assert.match(latest.url, /commit\/a1b2c3d4e5f6a7b8/);

  assert.equal(await fetchLatestCommit(routedFetch([['api.github.com', resp(false, {}, 403)]]), 'o/r'), null, 'rate-limited → null');
  assert.equal(await fetchLatestCommit(okFetch, null), null, 'no slug → null');
  assert.equal(await fetchLatestCommit(null, 'o/r'), null, 'no fetch → null');
});

// ── composeProvenance / gatherProvenance — the whole bundle ───────────────────────────────────────

test('composeProvenance: assembles the bundle, reconciles freshness, defaults models to the one model', () => {
  const model = { backend: 'wllama', kind: 'local', model: 'smollm2-135m-instruct-q8_0.gguf', label: 'wllama · CPU/WASM, in-browser' };
  const p = composeProvenance({
    build: { commit: 'abc1234', shortCommit: 'abc1234' },
    latest: { commit: 'abc1234', shortCommit: 'abc1234' },
    repo: repoRef('https://clovenbradshaw-ctrl.github.io/eoreader4.2/'),
    model, exportedAt: '2026-07-10T12:00:00Z',
  });
  assert.equal(p.app, APP_NAME);
  assert.equal(p.version, APP_VERSION);
  assert.equal(p.repo, 'clovenbradshaw-ctrl/eoreader4.2');
  assert.equal(p.freshness, 'current');
  assert.match(p.freshnessNote, /current published build/);
  assert.equal(p.models.length, 1, 'models defaults to the single current model');
  assert.equal(p.models[0].model, 'smollm2-135m-instruct-q8_0.gguf');
  assert.equal(p.exportedAt, '2026-07-10T12:00:00Z');
});

test('gatherProvenance: one-shot over an injected fetch; degrades to app+model with no network', async () => {
  const model = { backend: 'claude', kind: 'remote', model: 'claude-opus-4-8', label: 'Claude · hosted API (Anthropic)' };
  const fetchAll = routedFetch([
    ['version.json', resp(true, { commit: 'abcdef1234567890', ref: 'main', builtAt: 't' })],
    ['api.github.com', resp(true, [{ sha: 'abcdef1234567890', commit: { committer: { date: 't' }, message: 'head' } }])],
  ]);
  const online = await gatherProvenance({ fetch: fetchAll, location: 'https://clovenbradshaw-ctrl.github.io/eoreader4.2/', model, now: 'T' });
  assert.equal(online.build.shortCommit, 'abcdef1');
  assert.equal(online.latest.shortCommit, 'abcdef1');
  assert.equal(online.freshness, 'current');
  assert.equal(online.model.model, 'claude-opus-4-8');

  // no fetch at all (Node/tests) — build/latest null, but the app + model still compose, no throw
  const offline = await gatherProvenance({ fetch: null, location: null, model });
  assert.equal(offline.build, null);
  assert.equal(offline.latest, null);
  assert.equal(offline.freshness, 'unknown');
  assert.equal(offline.model.model, 'claude-opus-4-8');
  assert.equal(offline.repo, REPO);
});
