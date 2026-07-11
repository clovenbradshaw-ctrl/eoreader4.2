// The whole E2EE chat loop, end to end: two real chat controllers (Alice, Bob), each
// with real vendored libolm and its own in-memory OPFS store, talk through one fake
// homeserver. Alice sends an encrypted message; Bob's device claims a one-time key,
// receives the Megolm room key over Olm to-device, and decrypts the message. Nothing
// is stubbed but the network.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadOlm } from './helpers/load-olm.js';
import { createFakeHomeserver } from './helpers/fake-homeserver.js';
import { createChatRoom } from '../src/rooms/chat/index.js';

test('Alice → Bob: an encrypted message is delivered and decrypted end to end', async () => {
  const Olm = await loadOlm();
  const hs = createFakeHomeserver();
  const roomId = '!room:hs.test';

  const aliceSession = hs.sessionFor('@alice:hs.test', 'ALICEDEV', 'tok-alice');
  const bobSession = hs.sessionFor('@bob:hs.test', 'BOBDEV', 'tok-bob');
  hs.joinRoom(roomId, '@alice:hs.test');
  hs.joinRoom(roomId, '@bob:hs.test');

  const alice = createChatRoom({ matrix: aliceSession, Olm, fetch: hs.fetch, navigator: null, autoSync: false });
  const bob = createChatRoom({ matrix: bobSession, Olm, fetch: hs.fetch, navigator: null, autoSync: false });

  await alice.start();
  await bob.start();
  // Bob syncs once so his device + one-time keys are known and claimable.
  await bob.pump();

  // Alice sends. This claims Bob's OTK, opens an Olm session, ships the room key, and
  // PUTs the encrypted event — all inside sendMessage.
  const sent = await alice.sendMessage(roomId, 'hello bob, this is encrypted');
  assert.equal(sent.ok, true, 'send succeeded');

  // Bob syncs: to-device room key first, then the encrypted timeline event.
  await bob.pump();

  const bobTimeline = bob.timelineOf(roomId).filter((m) => !m.mine);
  assert.equal(bobTimeline.length, 1, 'Bob received exactly one message');
  assert.equal(bobTimeline[0].body, 'hello bob, this is encrypted');
  assert.equal(bobTimeline[0].undecryptable, undefined, 'message was decryptable');
  assert.equal(bobTimeline[0].sender, '@alice:hs.test');

  alice.stop(); bob.stop();
});

test('a device with no key sees a locked placeholder, not a crash', async () => {
  const Olm = await loadOlm();
  const hs = createFakeHomeserver();
  const roomId = '!locked:hs.test';
  const aliceSession = hs.sessionFor('@alice:hs.test', 'ALICEDEV', 'tok-a2');
  const carolSession = hs.sessionFor('@carol:hs.test', 'CAROLDEV', 'tok-c2');
  hs.joinRoom(roomId, '@alice:hs.test');
  // Carol is NOT joined when Alice sends, so she never gets the room key.

  const alice = createChatRoom({ matrix: aliceSession, Olm, fetch: hs.fetch, navigator: null, autoSync: false });
  await alice.start();
  await alice.sendMessage(roomId, 'secret alice cannot share yet');

  // Now Carol joins and syncs — she sees the event but has no key for it.
  hs.joinRoom(roomId, '@carol:hs.test');
  const carol = createChatRoom({ matrix: carolSession, Olm, fetch: hs.fetch, navigator: null, autoSync: false });
  await carol.start();
  await carol.pump();

  const t = carol.timelineOf(roomId);
  assert.equal(t.length, 1);
  assert.equal(t[0].undecryptable, true, 'shown as locked, not decrypted, not thrown');

  alice.stop(); carol.stop();
});

test('keys persist: a restarted controller keeps the same device identity', async () => {
  const Olm = await loadOlm();
  const hs = createFakeHomeserver();
  const session = hs.sessionFor('@alice:hs.test', 'ALICEDEV', 'tok-a3');
  // A shared navigator-less store root would be memory-only; instead reuse the store
  // by pointing both runs at the same fake OPFS via a shared navigator.
  const dir = fakeOpfs();
  const nav = { storage: { getDirectory: async () => dir } };

  const a1 = createChatRoom({ matrix: session, Olm, fetch: hs.fetch, navigator: nav, autoSync: false });
  await a1.start();
  const id1 = a1._internals().crypto.deviceCurve25519();
  a1.stop();

  const a2 = createChatRoom({ matrix: session, Olm, fetch: hs.fetch, navigator: nav, autoSync: false });
  await a2.start();
  const id2 = a2._internals().crypto.deviceCurve25519();
  assert.equal(id2, id1, 'identity restored from OPFS across restart');
  assert.equal(a2.state.persistent, true, 'store reports it is persistent');
  a2.stop();
});

// A minimal in-memory OPFS directory handle good enough for the store to persist
// across two controller lifetimes in one test.
function fakeOpfs() {
  const files = new Map();
  const dir = {
    async getDirectoryHandle() { return dir; },
    async getFileHandle(name, opts = {}) {
      if (!files.has(name) && !opts.create) throw Object.assign(new Error('nf'), { name: 'NotFoundError' });
      return {
        async getFile() { return { text: async () => files.get(name) ?? '' }; },
        async createWritable() { return { async write(v) { files.set(name, String(v)); }, async close() {} }; },
      };
    },
    async removeEntry(name) { files.delete(name); },
    async *keys() { for (const k of files.keys()) yield k; },
  };
  return dir;
}
