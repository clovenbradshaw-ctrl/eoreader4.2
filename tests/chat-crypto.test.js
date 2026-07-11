// The E2EE core, proven against the real vendored libolm: two independent crypto
// instances (Alice and Bob), each with its own in-memory OPFS store, establish an
// Olm session, hand a Megolm room key across it, and exchange an encrypted room
// event — then Alice's account survives a full pickle→OPFS→reload cycle.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadOlm } from './helpers/load-olm.js';
import { createOpfsStore } from '../src/rooms/chat/opfs-store.js';
import { createChatCrypto } from '../src/rooms/chat/crypto.js';

const newCrypto = async (Olm, userId, deviceId, store) => {
  const s = store || await createOpfsStore({ memory: true });
  const c = await createChatCrypto({ Olm, store: s, userId, deviceId });
  await c.init();
  return { c, store: s };
};

test('device identity keys are well-formed and signing is stable', async () => {
  const Olm = await loadOlm();
  const { c } = await newCrypto(Olm, '@alice:hs', 'ALICE');
  assert.match(c.deviceCurve25519(), /^[A-Za-z0-9+/]+$/);
  assert.match(c.deviceEd25519(), /^[A-Za-z0-9+/]+$/);
  const payload = c.deviceKeysPayload();
  assert.equal(payload.user_id, '@alice:hs');
  assert.ok(payload.signatures['@alice:hs']['ed25519:ALICE']);
  c.dispose();
});

test('Olm session carries a Megolm key; the room event decrypts end to end', async () => {
  const Olm = await loadOlm();
  const { c: alice } = await newCrypto(Olm, '@alice:hs', 'ALICE');
  const { c: bob } = await newCrypto(Olm, '@bob:hs', 'BOB');

  // Bob publishes a one-time key; Alice "claims" it (in a real client via /keys/claim).
  const bobOtks = await bob.oneTimeKeysPayload(1);
  const bobOtk = Object.values(bobOtks)[0].key;
  await bob.markOneTimeKeysPublished();

  // Alice opens an Olm session to Bob and sends him the room's Megolm key.
  const roomId = '!room:hs';
  await alice.createOutboundOlmSession(bob.deviceCurve25519(), bobOtk);
  const roomKey = await alice.roomKeyContent(roomId);
  const olmCipher = await alice.encryptOlm(bob.deviceCurve25519(), {
    type: 'm.room_key', content: roomKey,
  });

  // Bob decrypts the Olm to-device message and imports the room key.
  const decoded = await bob.decryptOlm(alice.deviceCurve25519(), olmCipher);
  assert.equal(decoded.type, 'm.room_key');
  await bob.importInboundSession(decoded.content);

  // Alice encrypts a room message; Bob decrypts it with the shared key.
  const enc = await alice.encryptRoomEvent(roomId, 'm.room.message', { msgtype: 'm.text', body: 'hi bob' });
  assert.equal(enc.algorithm, 'm.megolm.v1.aes-sha2');
  const out = await bob.decryptRoomEvent(enc, roomId);
  assert.equal(out.eventType, 'm.room.message');
  assert.deepEqual(out.content, { msgtype: 'm.text', body: 'hi bob' });

  alice.dispose(); bob.dispose();
});

test('a sender can always read its own encrypted messages', async () => {
  const Olm = await loadOlm();
  const { c: alice } = await newCrypto(Olm, '@alice:hs', 'ALICE');
  const roomId = '!solo:hs';
  const enc = await alice.encryptRoomEvent(roomId, 'm.room.message', { body: 'note to self' });
  const out = await alice.decryptRoomEvent(enc, roomId);
  assert.equal(out.content.body, 'note to self');
  alice.dispose();
});

test('account + sessions survive an OPFS pickle→reload cycle', async () => {
  const Olm = await loadOlm();
  const store = await createOpfsStore({ memory: true });
  const { c: alice } = await newCrypto(Olm, '@alice:hs', 'ALICE', store);
  const idBefore = alice.deviceCurve25519();
  const roomId = '!keep:hs';
  const enc = await alice.encryptRoomEvent(roomId, 'm.room.message', { body: 'persist me' });
  alice.dispose();

  // Fresh crypto over the SAME store — simulates a reload. No new account is created.
  const reloaded = await createChatCrypto({ Olm, store, userId: '@alice:hs', deviceId: 'ALICE' });
  await reloaded.init();
  assert.equal(reloaded.deviceCurve25519(), idBefore, 'same identity after reload');
  const out = await reloaded.decryptRoomEvent(enc, roomId);
  assert.equal(out.content.body, 'persist me', 'inbound session restored from OPFS');
  reloaded.dispose();
});
