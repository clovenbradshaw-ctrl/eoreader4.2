// The optional-Matrix-login + content-addressed archive checkpoint suite. Proves the
// three new archive holons hold their contracts as behavior: matrix.js trades a
// password for a token and never leaks it onto reactive state; checkpoints.js
// addresses content stably so re-archiving can't spam archive.org; deposit.js gates
// on identity + consent and is idempotent. Everything is injected — a fake fetch and
// a Map-backed storage — so nothing touches the network or a real localStorage.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMatrixSession, parseUserId, DEFAULT_HOMESERVER } from '../src/rooms/archive/matrix.js';
import { checkpointId, checkpointUrl, contentHash, createCheckpointLog, CHECKPOINT_PREFIX } from '../src/rooms/archive/checkpoints.js';
import { depositToArchive, missingConsent, archiveMediatype, REQUIRED_CONSENT } from '../src/rooms/archive/deposit.js';
import { createGenomeAutosave, genomeSnapshot } from '../src/rooms/archive/autosave.js';

// A Map-backed localStorage stand-in.
const fakeStore = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _map: m };
};
// A JSON response the way fetch hands one back.
const jsonRes = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
// A fetch router: maps a matcher fn over recorded calls to a response.
const router = (routes) => {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    for (const [match, res] of routes) if (match(String(url), opts)) return typeof res === 'function' ? res(String(url), opts) : res;
    return jsonRes(404, { errcode: 'M_NOT_FOUND' });
  };
  fetchImpl.calls = calls;
  return fetchImpl;
};

// ── matrix.js ────────────────────────────────────────────────────────────────

test('matrix: parseUserId splits @user:server and bare localparts', () => {
  assert.deepEqual(parseUserId('@michael:hyphae.social'), { local: 'michael', server: 'hyphae.social', full: '@michael:hyphae.social' });
  assert.deepEqual(parseUserId('michael'), { local: 'michael', server: null, full: null });
});

test('matrix: login trades a password for a token, persists, and never leaks it onto state', async () => {
  const storage = fakeStore();
  const fetchImpl = router([
    [(u) => u.endsWith('/_matrix/client/v3/login'), jsonRes(200, { user_id: '@michael:hyphae.social', access_token: 'secret-tok', device_id: 'DEV1' })],
  ]);
  const mx = createMatrixSession({ fetch: fetchImpl, storage });
  const r = await mx.login({ id: 'michael', password: 'pw' });
  assert.equal(r.ok, true);
  assert.equal(r.userId, '@michael:hyphae.social');
  assert.equal(mx.isLoggedIn(), true);
  assert.equal(mx.token(), 'secret-tok');
  assert.equal(mx.state.status, 'live');
  assert.equal(mx.state.userId, '@michael:hyphae.social');
  // the secret is NOT on the reactive state the surface renders
  assert.equal(mx.state.accessToken, undefined);
  assert.ok(!JSON.stringify(mx.state).includes('secret-tok'));
  // it IS persisted (so reload keeps you signed in)
  const saved = JSON.parse(storage.getItem('eo_matrix_session'));
  assert.equal(saved.accessToken, 'secret-tok');
  assert.equal(saved.userId, '@michael:hyphae.social');
  // login POSTed to the default homeserver
  assert.ok(fetchImpl.calls.some((c) => c.url === DEFAULT_HOMESERVER + '/_matrix/client/v3/login'));
});

test('matrix: a full @user:server discovers its own homeserver via well-known', async () => {
  const fetchImpl = router([
    [(u) => u.endsWith('/.well-known/matrix/client'), jsonRes(200, { 'm.homeserver': { base_url: 'https://matrix.hyphae.social' } })],
    [(u) => u === 'https://matrix.hyphae.social/_matrix/client/v3/login', jsonRes(200, { user_id: '@ada:hyphae.social', access_token: 't2' })],
  ]);
  const mx = createMatrixSession({ fetch: fetchImpl, storage: fakeStore() });
  const r = await mx.login({ id: '@ada:hyphae.social', password: 'pw' });
  assert.equal(r.ok, true);
  assert.equal(mx.state.homeserver, 'https://matrix.hyphae.social');
});

test('matrix: a 403 is a friendly error, not a throw, and leaves you signed out', async () => {
  const fetchImpl = router([[(u) => u.endsWith('/login'), jsonRes(403, { errcode: 'M_FORBIDDEN', error: 'Invalid password' })]]);
  const mx = createMatrixSession({ fetch: fetchImpl, storage: fakeStore() });
  const r = await mx.login({ id: 'x', password: 'bad' });
  assert.equal(r.ok, false);
  assert.equal(mx.isLoggedIn(), false);
  assert.equal(mx.state.status, 'error');
  assert.match(mx.state.error, /Incorrect username or password/);
});

test('matrix: missing credentials never hit the network', async () => {
  const fetchImpl = router([]);
  const mx = createMatrixSession({ fetch: fetchImpl, storage: fakeStore() });
  const r = await mx.login({ id: '', password: '' });
  assert.equal(r.ok, false);
  assert.equal(fetchImpl.calls.length, 0);
});

test('matrix: restore rehydrates a session from storage with no network call', () => {
  const storage = fakeStore();
  storage.setItem('eo_matrix_session', JSON.stringify({ v: 1, accessToken: 'tok', userId: '@r:hyphae.social', deviceId: 'D', homeserver: 'https://hyphae.social' }));
  const mx = createMatrixSession({ fetch: router([]), storage });
  const uid = mx.restore();
  assert.equal(uid, '@r:hyphae.social');
  assert.equal(mx.isLoggedIn(), true);
  assert.equal(mx.token(), 'tok');
});

test('matrix: whoami clears the session on a definitive 401, but not on a network fault', async () => {
  const storage = fakeStore();
  storage.setItem('eo_matrix_session', JSON.stringify({ v: 1, accessToken: 'tok', userId: '@r:hyphae.social', homeserver: 'https://hyphae.social' }));

  // definitive 401 → signed out + storage cleared
  const mx401 = createMatrixSession({ fetch: router([[() => true, jsonRes(401, { errcode: 'M_UNKNOWN_TOKEN' })]]), storage });
  mx401.restore();
  const r401 = await mx401.whoami();
  assert.equal(r401.ok, false);
  assert.equal(mx401.isLoggedIn(), false);
  assert.equal(storage.getItem('eo_matrix_session'), null);

  // network fault → still signed in (offline ≠ logged out)
  const storage2 = fakeStore();
  storage2.setItem('eo_matrix_session', JSON.stringify({ v: 1, accessToken: 'tok', userId: '@r:hyphae.social', homeserver: 'https://hyphae.social' }));
  const throwFetch = async () => { throw new Error('offline'); };
  const mxNet = createMatrixSession({ fetch: throwFetch, storage: storage2 });
  mxNet.restore();
  const rNet = await mxNet.whoami();
  assert.equal(rNet.ok, false);
  assert.equal(mxNet.isLoggedIn(), true);
});

test('matrix: logout clears locally even when the network call fails', async () => {
  const storage = fakeStore();
  const throwFetch = async (u) => { if (u.endsWith('/logout')) throw new Error('down'); return jsonRes(200, { user_id: '@x:hyphae.social', access_token: 't' }); };
  const mx = createMatrixSession({ fetch: throwFetch, storage });
  await mx.login({ id: 'x', password: 'pw' });
  assert.equal(mx.isLoggedIn(), true);
  await mx.logout();
  assert.equal(mx.isLoggedIn(), false);
  assert.equal(storage.getItem('eo_matrix_session'), null);
});

// ── checkpoints.js ───────────────────────────────────────────────────────────

test('checkpoints: identifier is content-addressed, stable, and archive.org-legal', () => {
  const a = checkpointId('the genome, checkpointed');
  const b = checkpointId('the genome, checkpointed');
  const c = checkpointId('different content');
  assert.equal(a, b, 'same content → same identifier');
  assert.notEqual(a, c, 'different content → different identifier');
  assert.ok(a.startsWith(CHECKPOINT_PREFIX + '-'));
  assert.match(a, /^eo-genome-[a-z0-9]{16}$/);
  assert.equal(checkpointUrl(a), 'https://archive.org/details/' + a);
});

test('checkpoints: id from a precomputed hash matches id from the text', () => {
  const text = 'abc';
  assert.equal(checkpointId(contentHash(text), { isHash: true }), checkpointId(text));
});

test('checkpoints: the ledger records, finds, and dedups by content hash', () => {
  const log = createCheckpointLog({ storage: fakeStore() });
  const h = contentHash('payload');
  assert.equal(log.has(h), false);
  log.record({ hash: h, identifier: 'eo-genome-1111111111111111', url: 'u', title: 'T' });
  assert.equal(log.has(h), true);
  assert.equal(log.find(h).identifier, 'eo-genome-1111111111111111');
  // re-recording the same checkpoint doesn't pile up
  log.record({ hash: h, identifier: 'eo-genome-1111111111111111', url: 'u', title: 'T' });
  assert.equal(log.list().length, 1);
});

// ── deposit.js ───────────────────────────────────────────────────────────────

test('deposit: refuses without a token (identity gate)', async () => {
  const r = await depositToArchive({ token: null, text: 'x', consent: REQUIRED_CONSENT, fetch: router([]) });
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'auth');
});

test('deposit: refuses without the three acknowledgements (consent gate)', async () => {
  assert.deepEqual(missingConsent(['permanence']).sort(), ['privacy', 'rights']);
  const r = await depositToArchive({ token: 'tok', text: 'x', consent: ['permanence'], fetch: router([]) });
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'consent');
  assert.deepEqual(r.missing.sort(), ['privacy', 'rights']);
});

test('deposit: already-archived content reuses the item and uploads nothing (anti-spam)', async () => {
  const text = 'a source worth keeping';
  const h = contentHash(text);
  const ledger = createCheckpointLog({ storage: fakeStore() });
  ledger.record({ hash: h, identifier: checkpointId(h, { isHash: true }), url: checkpointUrl(checkpointId(h, { isHash: true })), title: 'prior' });
  const fetchImpl = router([[() => true, () => { throw new Error('should not upload'); }]]);
  const r = await depositToArchive({ token: 'tok', text, consent: REQUIRED_CONSENT, ledger, fetch: fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(r.reused, true);
  assert.equal(fetchImpl.calls.length, 0, 'no upload for content already archived');
});

test('deposit: a fresh checkpoint posts a content-addressed multipart PUT and records it', async () => {
  const text = 'brand new genome checkpoint';
  const expectId = checkpointId(text);
  const ledger = createCheckpointLog({ storage: fakeStore() });
  const fetchImpl = router([
    [(u) => u.includes('/webhook/archiveo-cases'), jsonRes(200, { success: true, s3_status: 200, archive: { identifier: expectId } })],
  ]);
  const r = await depositToArchive({
    token: 'secret', text, title: 'Fresh', consent: REQUIRED_CONSENT, ledger, fetch: fetchImpl,
  });
  assert.equal(r.ok, true);
  assert.equal(r.reused, false);
  assert.equal(r.identifier, expectId);
  assert.equal(r.archive.url, 'https://archive.org/details/' + expectId);
  // the request carried the stable identifier in the query and the token as a Bearer
  const call = fetchImpl.calls[0];
  assert.ok(call.url.includes('identifier=' + expectId), 'identifier in the query string');
  assert.equal(call.opts.method, 'POST');
  assert.equal(call.opts.headers.Authorization, 'Bearer secret');
  assert.ok(call.opts.body && typeof call.opts.body.get === 'function', 'body is a FormData');
  assert.ok(call.opts.body.get('file'), 'a file part is attached');
  // and it landed in the ledger, retrievable later
  assert.equal(ledger.has(contentHash(text)), true);
});

test('deposit: a webhook failure surfaces as { ok:false } with the stage', async () => {
  const fetchImpl = router([[() => true, jsonRes(502, { success: false, stage: 's3_upload', error: 'archive.org PUT failed' })]]);
  const r = await depositToArchive({ token: 'tok', text: 'y', consent: REQUIRED_CONSENT, fetch: fetchImpl });
  assert.equal(r.ok, false);
  assert.equal(r.stage, 's3_upload');
});

test('deposit: archiveMediatype mirrors the webhook mapping', () => {
  assert.equal(archiveMediatype('text/plain'), 'texts');
  assert.equal(archiveMediatype('image/png'), 'image');
  assert.equal(archiveMediatype('application/octet-stream'), 'data');
});

// ── autosave.js ──────────────────────────────────────────────────────────────

const fakeApp = (sources, eot) => ({
  state: { sources },
  eotFor: (sn) => ({ text: (eot || {})[sn] || '' }),
  subscribe: () => () => {},
});
const fakeMatrix = (loggedIn) => ({ isLoggedIn: () => loggedIn, subscribe: () => () => {} });
const capturingDeposit = (result) => {
  const calls = [];
  const fn = async (opts) => { calls.push(opts); return result || { ok: true, reused: false, archive: { identifier: 'id', url: 'u' }, checkpoint: { identifier: 'id', url: 'u' } }; };
  fn.calls = calls;
  return fn;
};

test('autosave: the genome snapshot is deterministic and reflects the record', () => {
  const app = fakeApp([{ sn: 'S2', reg: 'S2', title: 'Two' }, { sn: 'S1', reg: 'S1', title: 'One' }], { S1: 'alpha', S2: 'beta' });
  const a = genomeSnapshot(app);
  const b = genomeSnapshot(app);
  assert.equal(a, b, 'same record → identical snapshot');
  assert.ok(a.includes('alpha') && a.includes('beta'));
  // ordered by source id (S1 before S2) regardless of array order
  assert.ok(a.indexOf('One') < a.indexOf('Two'));
});

test('autosave: defaults OFF and never checkpoints while disabled', async () => {
  const storage = fakeStore();
  const deposit = capturingDeposit();
  const gen = createGenomeAutosave({ app: fakeApp([{ sn: 'S1', title: 'x' }], { S1: 'text' }), matrix: fakeMatrix(true), deposit, storage });
  assert.equal(gen.isEnabled(), false, 'off by default — we never push it on');
  const r = await gen.maybeCheckpoint();
  assert.equal(r.ok, false);
  assert.equal(r.skipped, 'disabled');
  assert.equal(deposit.calls.length, 0);
});

test('autosave: signed out, an enabled autosave still uploads nothing', async () => {
  const storage = fakeStore(); storage.setItem('eo_save_genome_online', '1');
  const deposit = capturingDeposit();
  const gen = createGenomeAutosave({ app: fakeApp([{ sn: 'S1' }], { S1: 'text' }), matrix: fakeMatrix(false), deposit, storage });
  const r = await gen.maybeCheckpoint();
  assert.equal(r.skipped, 'signed-out');
  assert.equal(deposit.calls.length, 0);
});

test('autosave: enabled + signed in checkpoints the whole genome once, then dedups the unchanged', async () => {
  const storage = fakeStore(); storage.setItem('eo_save_genome_online', '1');
  const deposit = capturingDeposit();
  const app = fakeApp([{ sn: 'S1', title: 'One' }], { S1: 'the genome' });
  const gen = createGenomeAutosave({ app, matrix: fakeMatrix(true), deposit, storage });

  const r1 = await gen.maybeCheckpoint();
  assert.equal(r1.ok, true);
  assert.equal(deposit.calls.length, 1);
  // it archived the whole genome as a dataset, with the standing consent
  assert.equal(deposit.calls[0].kind, 'dataset');
  assert.equal(deposit.calls[0].title, 'EO system genome');
  assert.deepEqual([...deposit.calls[0].consent].sort(), [...REQUIRED_CONSENT].sort());
  assert.ok(deposit.calls[0].text.includes('the genome'));
  assert.equal(gen.state.status, 'saved');
  assert.ok(gen.state.lastCheckpoint);

  // nothing changed → no second upload (anti-spam)
  const r2 = await gen.maybeCheckpoint();
  assert.equal(r2.reused, true);
  assert.equal(deposit.calls.length, 1, 'unchanged genome is not re-uploaded');

  // the record changes → a fresh checkpoint
  app.state.sources.push({ sn: 'S2', title: 'Two' });
  app.eotFor = (sn) => ({ text: sn === 'S1' ? 'the genome' : 'more genome' });
  const r3 = await gen.maybeCheckpoint();
  assert.equal(r3.ok, true);
  assert.equal(deposit.calls.length, 2, 'a changed genome uploads a new checkpoint');
});

test('autosave: setEnabled persists the opt-in and is reversible', () => {
  const storage = fakeStore();
  const gen = createGenomeAutosave({ app: fakeApp([], {}), matrix: fakeMatrix(false), deposit: capturingDeposit(), storage });
  gen.setEnabled(true);
  assert.equal(gen.isEnabled(), true);
  assert.equal(storage.getItem('eo_save_genome_online'), '1');
  gen.setEnabled(false);
  assert.equal(gen.isEnabled(), false);
  assert.equal(storage.getItem('eo_save_genome_online'), '0');
});
