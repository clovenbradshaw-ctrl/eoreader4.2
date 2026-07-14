// The shared, room-encrypted, hash-chained vault end to end — two real members (Alice,
// Bob) with real vendored libolm, one fake homeserver. Alice opens a room (a shared
// workspace), invites Bob, and saves a blob: it is encrypted, its ciphertext uploaded as
// binary to the media repo, and its block published as a Megolm room event. Bob — because
// he is in the room — receives the key, folds the block onto an identical chain, and opens
// the bytes back. A user who was NOT in the room when it was saved cannot. Nothing is
// stubbed but the network.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadOlm } from './helpers/load-olm.js';
import { createFakeHomeserver } from './helpers/fake-homeserver.js';
import { createChatRoom } from '../src/rooms/chat/index.js';
import { createRoomVault, VAULT_BLOCK_TYPE } from '../src/rooms/archive/room-vault.js';
import { bytesToText } from '../src/rooms/archive/file-crypto.js';

// A member = a chat controller (the encrypted bus) + a room vault riding on it.
const member = (hs, Olm, userId, deviceId, token) => {
  const session = hs.sessionFor(userId, deviceId, token);
  const chat = createChatRoom({ matrix: session, Olm, fetch: hs.fetch, navigator: null, autoSync: false });
  const vault = createRoomVault({ chat, matrix: session, fetch: hs.fetch, navigator: null });
  return { userId, session, chat, vault };
};

// Alice opens a shared room, invites Bob, Bob joins, both are started and synced once so
// their device keys are published and claimable. Returns { alice, bob, roomId }.
const sharedRoom = async (hs, Olm) => {
  const alice = member(hs, Olm, '@alice:hs.test', 'ALICEDEV', 'tok-a');
  const bob = member(hs, Olm, '@bob:hs.test', 'BOBDEV', 'tok-b');
  await alice.vault.start();   // starts alice.chat + publishes her keys
  await bob.vault.start();
  const created = await alice.chat.createRoom({ name: 'Team space', invite: ['@bob:hs.test'] });
  assert.equal(created.ok, true, 'room created');
  const roomId = created.roomId;
  await bob.chat.join(roomId);
  await bob.vault.pump();      // Bob's device + one-time keys are now known
  return { alice, bob, roomId };
};

test('Alice saves into a shared room; Bob (a member) folds the block and opens the bytes', async () => {
  const Olm = await loadOlm();
  const hs = createFakeHomeserver();
  const { alice, bob, roomId } = await sharedRoom(hs, Olm);

  const secret = 'Minutes: the vote passed 4–1. Readable only inside this room.';
  const saved = await alice.vault.save(roomId, secret, { name: 'minutes', mime: 'text/plain' });
  assert.equal(saved.ok, true, 'save published');
  assert.ok(saved.eventId, 'a room event carried the block');

  await alice.vault.pump();    // Alice folds her own block from the timeline
  await bob.vault.pump();      // Bob receives the room key, then the block, and folds it

  const bobBlocks = bob.vault.list(roomId);
  assert.equal(bobBlocks.length, 1, 'Bob folded exactly one block');
  assert.ok(bobBlocks[0].enc && bobBlocks[0].enc.key, 'the block carried the per-file key');

  const opened = await bob.vault.open(roomId, bobBlocks[0].index);
  assert.equal(opened.ok, true, 'Bob opened it');
  assert.equal(opened.text, secret, 'and got the exact plaintext back');

  // Both members converge on the same head hash — the chain is shared, not per-device.
  assert.equal(alice.vault.list(roomId).length, 1);
  assert.deepEqual(alice.vault.head(roomId), bob.vault.head(roomId), 'chains converge');
  assert.equal((await bob.vault.verify(roomId)).ok, true, 'and Bob\'s chain verifies');

  alice.chat.stop(); bob.chat.stop();
});

test('the media repo holds only ciphertext — the plaintext never leaves the client', async () => {
  const Olm = await loadOlm();
  const hs = createFakeHomeserver();
  const { alice, roomId } = await sharedRoom(hs, Olm);
  await alice.vault.save(roomId, 'PLAINTEXT-NEEDLE-7c1d', { name: 'n', mime: 'text/plain' });
  assert.ok(hs.mediaStore.size >= 1, 'something was uploaded');
  for (const bytes of hs.mediaStore.values()) {
    assert.ok(!bytesToText(bytes).includes('PLAINTEXT-NEEDLE-7c1d'), 'stored blob is encrypted');
  }
  alice.chat.stop();
});

test('a binary (non-text) payload round-trips byte-for-byte', async () => {
  const Olm = await loadOlm();
  const hs = createFakeHomeserver();
  const { alice, bob, roomId } = await sharedRoom(hs, Olm);

  const blob = new Uint8Array([0, 1, 2, 255, 254, 128, 42, 0, 7]);
  const saved = await alice.vault.save(roomId, blob, { name: 'blob', mime: 'application/octet-stream' });
  assert.equal(saved.ok, true);
  await alice.vault.pump(); await bob.vault.pump();

  const opened = await bob.vault.open(roomId, bob.vault.list(roomId)[0].index);
  assert.equal(opened.ok, true);
  assert.deepEqual([...opened.bytes], [...blob], 'the raw bytes survived encrypt → matrix → decrypt');

  alice.chat.stop(); bob.chat.stop();
});

test('a user not in the room when it was saved cannot read the block', async () => {
  const Olm = await loadOlm();
  const hs = createFakeHomeserver();
  const { alice, bob, roomId } = await sharedRoom(hs, Olm);

  await alice.vault.save(roomId, 'not for carol', { name: 'x', mime: 'text/plain' });
  await alice.vault.pump(); await bob.vault.pump();

  // Carol only joins AFTER the save — she never received that block's key.
  const carol = member(hs, Olm, '@carol:hs.test', 'CAROLDEV', 'tok-c');
  await carol.vault.start();
  await carol.chat.join(roomId);
  await carol.vault.pump();

  assert.equal(carol.vault.list(roomId).length, 0, 'Carol folded no blocks — she has no key');
  const locked = carol.chat.timelineOf(roomId).filter((m) => m.undecryptable);
  assert.equal(locked.length, 1, 'Carol sees a locked placeholder, not the content');

  alice.chat.stop(); bob.chat.stop(); carol.chat.stop();
});

test('re-saving identical bytes already on the chain dedupes to one block and one upload', async () => {
  const Olm = await loadOlm();
  const hs = createFakeHomeserver();
  const { alice, roomId } = await sharedRoom(hs, Olm);

  const a = await alice.vault.save(roomId, 'same bytes', { name: 'a' });
  assert.equal(a.ok, true);
  await alice.vault.pump();                      // fold it onto Alice's chain
  const b = await alice.vault.save(roomId, 'same bytes', { name: 'b' });
  assert.equal(b.ok, true);
  assert.equal(b.deduped, true, 'the second save was recognised by content address');
  assert.equal(alice.vault.list(roomId).length, 1, 'still one block');
  assert.equal(hs.mediaStore.size, 1, 'and only one ciphertext upload');

  alice.chat.stop();
});

test('a corrupted ciphertext blob is caught on open, not returned as garbage', async () => {
  const Olm = await loadOlm();
  const hs = createFakeHomeserver();
  const { alice, bob, roomId } = await sharedRoom(hs, Olm);
  await alice.vault.save(roomId, 'trust but verify', { name: 't', mime: 'text/plain' });
  await alice.vault.pump(); await bob.vault.pump();

  const [mediaId] = [...hs.mediaStore.keys()];
  const raw = hs.mediaStore.get(mediaId); raw[0] ^= 0xff;   // tamper
  const opened = await bob.vault.open(roomId, bob.vault.list(roomId)[0].index);
  assert.equal(opened.ok, false);
  assert.match(opened.error, /tampered/);

  alice.chat.stop(); bob.chat.stop();
});

test('signals ride the same encrypted bus — a nudge reaches the room, readable only there', async () => {
  const Olm = await loadOlm();
  const hs = createFakeHomeserver();
  const { alice, bob, roomId } = await sharedRoom(hs, Olm);

  const seen = [];
  bob.chat.onRoomEvent((evt) => { if (evt.type === 'org.eoreader.signal') seen.push(evt); });

  const sent = await alice.chat.sendSignal(roomId, 'saved', { name: 'minutes' });
  assert.equal(sent.ok, true);
  await bob.vault.pump();

  assert.equal(seen.length, 1, 'Bob received the signal');
  assert.equal(seen[0].content.kind, 'saved');
  assert.deepEqual(seen[0].content.data, { name: 'minutes' });
  assert.equal(seen[0].sender, '@alice:hs.test', 'authenticated to its sender');

  alice.chat.stop(); bob.chat.stop();
});

test('room lifecycle: create, invite, join, and membership reflect a shared workspace', async () => {
  const Olm = await loadOlm();
  const hs = createFakeHomeserver();
  const alice = member(hs, Olm, '@alice:hs.test', 'ALICEDEV', 'tok-a');
  const bob = member(hs, Olm, '@bob:hs.test', 'BOBDEV', 'tok-b');
  await alice.chat.start(); await bob.chat.start();

  const created = await alice.chat.createRoom({ name: 'Research', invite: ['@bob:hs.test'] });
  assert.equal(created.ok, true);
  assert.ok(created.roomId.startsWith('!'), 'a real room id');

  let m = await alice.chat.members(created.roomId);
  assert.deepEqual(m.members, ['@alice:hs.test'], 'only the creator is joined at first');

  const joined = await bob.chat.join(created.roomId);
  assert.equal(joined.ok, true);
  m = await alice.chat.members(created.roomId);
  assert.equal(m.members.length, 2, 'Bob is now a member');
  assert.ok(m.members.includes('@bob:hs.test'));

  void VAULT_BLOCK_TYPE;   // exported for the surface
  alice.chat.stop(); bob.chat.stop();
});
