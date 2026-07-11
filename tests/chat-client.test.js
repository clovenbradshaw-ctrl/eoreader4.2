// The Matrix transport, exercised with a fake fetch — request shaping (auth, paths,
// txn ids, the /sync since cursor) without touching a homeserver.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMatrixClient } from '../src/rooms/chat/client.js';

// A session stub in the shape archive/matrix.js exposes.
const fakeSession = () => ({
  identity: () => ({ homeserver: 'https://hs.example', token: 'TOKEN', userId: '@me:hs', deviceId: 'DEV' }),
});

// A fetch that records calls and replies from a scripted queue (or a default 200).
const recorder = (responses = []) => {
  const calls = [];
  const fetch = async (url, opts) => {
    calls.push({ url, opts, body: opts.body ? JSON.parse(opts.body) : null });
    const next = responses.shift();
    const payload = next || { ok: true, status: 200, json: {} };
    return {
      ok: payload.status < 400,
      status: payload.status,
      json: async () => payload.json,
    };
  };
  return { fetch, calls };
};

test('every request carries the bearer token and hits the homeserver base', async () => {
  const { fetch, calls } = recorder();
  const c = createMatrixClient({ session: fakeSession(), fetch });
  await c.joinedRooms();
  assert.equal(calls[0].url, 'https://hs.example/_matrix/client/v3/joined_rooms');
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer TOKEN');
});

test('sendEvent PUTs to the room send path with a unique txn id and JSON body', async () => {
  const { fetch, calls } = recorder();
  const c = createMatrixClient({ session: fakeSession(), fetch, now: () => 1000 });
  await c.sendEvent('!r:hs', 'm.room.encrypted', { algorithm: 'm.megolm.v1.aes-sha2', ciphertext: 'X' });
  await c.sendEvent('!r:hs', 'm.room.encrypted', { ciphertext: 'Y' });
  assert.match(calls[0].url, /\/rooms\/!r%3Ahs\/send\/m\.room\.encrypted\/eo1000-0$/);
  assert.match(calls[1].url, /eo1000-1$/, 'txn id increments');
  assert.equal(calls[0].opts.method, 'PUT');
  assert.equal(calls[0].body.ciphertext, 'X');
});

test('keys upload / claim / query build the right bodies', async () => {
  const { fetch, calls } = recorder();
  const c = createMatrixClient({ session: fakeSession(), fetch });
  await c.uploadKeys({ deviceKeys: { user_id: '@me:hs' }, oneTimeKeys: { 'signed_curve25519:a': {} } });
  await c.claimKeys({ '@bob:hs': { BOB: 'signed_curve25519' } });
  await c.queryKeys({ '@bob:hs': [] });
  assert.match(calls[0].url, /\/keys\/upload$/);
  assert.deepEqual(calls[0].body.one_time_keys, { 'signed_curve25519:a': {} });
  assert.match(calls[1].url, /\/keys\/claim$/);
  assert.deepEqual(calls[1].body.one_time_keys, { '@bob:hs': { BOB: 'signed_curve25519' } });
  assert.match(calls[2].url, /\/keys\/query$/);
});

test('sendToDevice targets specific devices', async () => {
  const { fetch, calls } = recorder();
  const c = createMatrixClient({ session: fakeSession(), fetch });
  await c.sendToDevice('m.room.encrypted', { '@bob:hs': { BOB: { ciphertext: 'z' } } });
  assert.match(calls[0].url, /\/sendToDevice\/m\.room\.encrypted\/eo/);
  assert.equal(calls[0].body.messages['@bob:hs'].BOB.ciphertext, 'z');
});

test('syncOnce advances the since cursor across rounds', async () => {
  const { fetch, calls } = recorder([
    { status: 200, json: { next_batch: 's1', rooms: {} } },
    { status: 200, json: { next_batch: 's2', rooms: {} } },
  ]);
  const c = createMatrixClient({ session: fakeSession(), fetch });
  const r1 = await c.syncOnce({ timeout: 0 });
  assert.equal(r1.data.next_batch, 's1');
  assert.ok(!calls[0].url.includes('since='), 'first sync has no since');
  await c.syncOnce({ timeout: 0 });
  assert.match(calls[1].url, /since=s1/, 'second sync sends the first batch token');
});

test('startSync drains rounds until stopped', async () => {
  const { fetch } = recorder([
    { status: 200, json: { next_batch: 's1', to_device: { events: [{ type: 'm.room_key' }] } } },
    { status: 200, json: { next_batch: 's2', to_device: { events: [] } } },
  ]);
  const c = createMatrixClient({ session: fakeSession(), fetch });
  const seen = [];
  await new Promise((resolve) => {
    c.startSync(async (data) => {
      seen.push(data.next_batch);
      if (data.next_batch === 's2') { c.stopSync(); resolve(); }
    }, { timeout: 0 });
  });
  assert.deepEqual(seen, ['s1', 's2']);
  assert.equal(c.isSyncing(), false);
});

test('a request without a session is a value, not a throw', async () => {
  const c = createMatrixClient({ session: { identity: () => null }, fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }) });
  const r = await c.joinedRooms();
  assert.equal(r.ok, false);
  assert.equal(r.status, 401);
});
