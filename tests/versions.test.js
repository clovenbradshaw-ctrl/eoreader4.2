import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  GITHACK_HOST, pullsApiUrl, formatVersionDate, rollbackUrl,
  normalizeVersions, fetchVersions, loadVersions,
} from '../src/rooms/reader/versions.js';

// versions.js is the "roll back to a prior PR" seam: the app is deployed per-merge to GitHub Pages,
// so the merged-PR history IS the published-build history. These pin the PURE helpers (no network)
// and prove the best-effort gatherers degrade to an empty list with a worded reason on every fault,
// rather than throwing — the version list is a courtesy, never a precondition.

const SLUG = 'clovenbradshaw-ctrl/eoreader4.2';

// A minimal fake of the GitHub /pulls payload — merged, unmerged, and malformed rows mixed together.
const PULLS = [
  { number: 48, title: 'The redaction membrane', merged_at: '2026-07-11T15:49:24Z',
    merge_commit_sha: '5fd83cfaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', html_url: 'https://github.com/x/y/pull/48',
    user: { login: 'clovenbradshaw-ctrl' }, head: { sha: 'b9d9980headheadheadheadheadheadheadhead0' } },
  { number: 50, title: 'Facing-page source view', merged_at: '2026-07-11T15:49:15Z',
    merge_commit_sha: 'd022436bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', html_url: 'https://github.com/x/y/pull/50',
    user: { login: 'clovenbradshaw-ctrl' } },
  // closed but never merged — must be dropped
  { number: 99, title: 'Rejected idea', merged_at: null, merge_commit_sha: null, html_url: 'https://github.com/x/y/pull/99' },
  // merged but the API omitted merge_commit_sha — fall back to the head tip
  { number: 41, title: 'Paragraph-grain realizer', merged_at: '2026-07-11T04:03:18Z',
    merge_commit_sha: null, head: { sha: '7f95188ccccccccccccccccccccccccccccccccc' }, user: { login: 'clovenbradshaw-ctrl' } },
  null,          // junk rows are tolerated, not fatal
  'nonsense',
];

// ── pure URL + date helpers ───────────────────────────────────────────────────────────────────────

test('pullsApiUrl: closed PRs, newest-updated first, per_page clamped to 1..100', () => {
  assert.equal(pullsApiUrl(SLUG),
    `https://api.github.com/repos/${SLUG}/pulls?state=closed&per_page=50&sort=updated&direction=desc`);
  assert.match(pullsApiUrl(SLUG, { perPage: 5 }), /per_page=5\b/);
  assert.match(pullsApiUrl(SLUG, { perPage: 1000 }), /per_page=100\b/);   // clamped high
  assert.match(pullsApiUrl(SLUG, { perPage: 0 }), /per_page=50\b/);       // 0 ⇒ default
});

test('rollbackUrl: builds a raw.githack.com build URL, scrubs the sha, null on missing pieces', () => {
  assert.equal(rollbackUrl(SLUG, 'd022436'),
    `${GITHACK_HOST}/${SLUG}/d022436/index.html`);
  // a sha arriving with stray whitespace/separators can't inject anything but hex into the URL
  assert.equal(rollbackUrl(SLUG, '  d022436  '), `${GITHACK_HOST}/${SLUG}/d022436/index.html`);
  assert.equal(rollbackUrl(SLUG, 'd0224/36'), `${GITHACK_HOST}/${SLUG}/d022436/index.html`);
  assert.equal(rollbackUrl(SLUG, ''), null);
  assert.equal(rollbackUrl('', 'd022436'), null);
  assert.equal(rollbackUrl(SLUG, 'd022436', { host: 'https://rawcdn.githack.com' }),
    'https://rawcdn.githack.com/' + SLUG + '/d022436/index.html');
});

test('formatVersionDate: compact UTC date, empty string on junk', () => {
  assert.equal(formatVersionDate('2026-07-11T15:49:24Z'), 'Jul 11, 2026');
  assert.equal(formatVersionDate('2026-01-01T00:00:00Z'), 'Jan 1, 2026');
  assert.equal(formatVersionDate('not a date'), '');
  assert.equal(formatVersionDate(null), '');
});

// ── normalizeVersions — the projection the surface renders ─────────────────────────────────────────

test('normalizeVersions: keeps only merged PRs, newest-merge first, head-sha fallback', () => {
  const rows = normalizeVersions(PULLS, { slug: SLUG });
  // #99 (unmerged) and the junk rows are gone; 48, 50, 41 remain
  assert.deepEqual(rows.map((r) => r.number), [48, 50, 41]);   // merged_at desc, not the input order
  // merge_commit_sha is preferred…
  assert.equal(rows[0].sha, '5fd83cfaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(rows[0].shortSha, '5fd83cf');
  // …and the head tip is the fallback when it's absent (#41)
  assert.equal(rows[2].sha, '7f95188ccccccccccccccccccccccccccccccccc');
  // each row carries a ready-to-open historical build URL and a PR link
  assert.equal(rows[1].url, `${GITHACK_HOST}/${SLUG}/d022436bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/index.html`);
  assert.equal(rows[0].prUrl, 'https://github.com/x/y/pull/48');
  assert.equal(rows[0].date, 'Jul 11, 2026');
  assert.equal(rows[0].author, 'clovenbradshaw-ctrl');
});

test('normalizeVersions: marks the row whose sha matches the deployed build as current', () => {
  const rows = normalizeVersions(PULLS, { slug: SLUG, currentCommit: 'd022436bbbbbbb' });
  assert.equal(rows.find((r) => r.number === 50).isCurrent, true);
  assert.equal(rows.find((r) => r.number === 48).isCurrent, false);
  // no deployed commit known (local dev / before version.json loads) ⇒ nothing marked current
  assert.ok(normalizeVersions(PULLS, { slug: SLUG }).every((r) => r.isCurrent === false));
});

test('normalizeVersions: caps the list and never throws on a non-array', () => {
  const many = Array.from({ length: 60 }, (_, i) => ({
    number: i + 1, title: `PR ${i + 1}`, merged_at: `2026-07-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`,
    merge_commit_sha: 'a'.repeat(40).slice(0, 39) + String(i % 10), user: { login: 'x' },
  }));
  assert.equal(normalizeVersions(many, { slug: SLUG }).length, 40);           // MAX_VERSIONS
  assert.equal(normalizeVersions(many, { slug: SLUG, max: 3 }).length, 3);
  assert.deepEqual(normalizeVersions(null), []);
  assert.deepEqual(normalizeVersions(undefined), []);
  assert.deepEqual(normalizeVersions('nope'), []);
});

// ── fetchVersions — best-effort, worded faults, injected fetch ──────────────────────────────────────

const okRes = (body) => ({ ok: true, status: 200, json: async () => body });
const errRes = (status) => ({ ok: false, status, json: async () => ({ message: 'nope' }) });

test('fetchVersions: a 200 yields the normalized, merged-only list', async () => {
  const calls = [];
  const fake = async (url, opts) => { calls.push({ url, opts }); return okRes(PULLS); };
  const { items, error } = await fetchVersions(fake, SLUG, { currentCommit: '5fd83cf' });
  assert.equal(error, null);
  assert.deepEqual(items.map((r) => r.number), [48, 50, 41]);
  assert.equal(items[0].isCurrent, true);
  assert.match(calls[0].url, /\/repos\/clovenbradshaw-ctrl\/eoreader4\.2\/pulls\?state=closed/);
  assert.equal(calls[0].opts.headers.Accept, 'application/vnd.github+json');
});

test('fetchVersions: 403/429 read as a rate-limit; other non-2xx as http; a throw as network', async () => {
  assert.deepEqual(await fetchVersions(async () => errRes(403), SLUG), { items: [], error: 'rate' });
  assert.deepEqual(await fetchVersions(async () => errRes(429), SLUG), { items: [], error: 'rate' });
  assert.deepEqual(await fetchVersions(async () => errRes(500), SLUG), { items: [], error: 'http' });
  assert.deepEqual(await fetchVersions(async () => okRes({ message: 'not an array' }), SLUG), { items: [], error: 'http' });
  assert.deepEqual(await fetchVersions(async () => { throw new Error('offline'); }, SLUG), { items: [], error: 'network' });
});

test('fetchVersions: no fetch or no slug ⇒ network, never a throw', async () => {
  assert.deepEqual(await fetchVersions(null, SLUG), { items: [], error: 'network' });
  assert.deepEqual(await fetchVersions(async () => okRes(PULLS), ''), { items: [], error: 'network' });
});

// ── loadVersions — derives the repo, threads the slug back ──────────────────────────────────────────

test('loadVersions: derives the repo slug from a Pages location and threads it through', async () => {
  const fake = async () => okRes(PULLS);
  const r = await loadVersions({ fetch: fake, location: 'https://clovenbradshaw-ctrl.github.io/eoreader4.2/' });
  assert.equal(r.slug, 'clovenbradshaw-ctrl/eoreader4.2');
  assert.equal(r.error, null);
  assert.equal(r.items[0].number, 48);
  assert.match(r.items[0].url, /raw\.githack\.com\/clovenbradshaw-ctrl\/eoreader4\.2\//);
});

test('loadVersions: an explicit slug wins, and faults come back worded (never thrown)', async () => {
  const r = await loadVersions({ fetch: async () => errRes(403), slug: SLUG });
  assert.deepEqual(r, { items: [], error: 'rate', slug: SLUG });
});
