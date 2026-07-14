// The room-ordered ledger, folded from a stream of block records the way every member
// folds the room timeline. The key properties: DETERMINISM (two members folding the same
// order compute the same head hash), IDEMPOTENCY (a re-synced event never double-appends),
// integrity (verify walks the hash links), and durability (it reloads from OPFS).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createOpfsStore } from '../src/rooms/chat/opfs-store.js';
import { createRoomChain } from '../src/rooms/archive/room-chain.js';

const roomId = '!team:hs.test';

// A block record as it arrives on the bus: the decrypted payload + the authenticated
// envelope (at = origin_server_ts, author = sender, src.eventId = the Matrix event id).
const rec = (i, extra = {}) => ({
  contentHash: `hash${i}`, size: 10 + i, mime: 'text/plain', name: `n${i}`,
  mxc: `mxc://hs.test/m${i}`, enc: { v: 'v2', key: { k: `k${i}` }, iv: 'iv', hashes: { sha256: `s${i}` }, url: `mxc://hs.test/m${i}` },
  at: 1000 + i, author: '@alice:hs.test', src: { eventId: `$ev${i}` }, ...extra,
});

test('folding the same ordered records yields identical, verifiable chains on two members', async () => {
  const a = createRoomChain({ store: await createOpfsStore({ memory: true }), roomId });
  const b = createRoomChain({ store: await createOpfsStore({ memory: true }), roomId });
  for (let i = 0; i < 4; i++) { await a.fold(rec(i)); await b.fold(rec(i)); }

  assert.equal(a.list().length, 4);
  assert.deepEqual(a.head(), b.head(), 'two members converge on the same head hash');
  assert.equal((await a.verify()).ok, true, 'the chain verifies');
  assert.equal(a.list()[0].index, 0);
  assert.equal(a.list()[3].prev, a.list()[2].hash, 'each block links to the one before it');
});

test('folding is idempotent by source event id — a re-sync never double-appends', async () => {
  const c = createRoomChain({ store: await createOpfsStore({ memory: true }), roomId });
  await c.fold(rec(0));
  const again = await c.fold(rec(0));   // same $ev0
  assert.equal(again.deduped, true);
  assert.equal(c.list().length, 1, 'the duplicate event did not grow the chain');
  assert.equal(c.hasEvent('$ev0'), true);
});

test('a nothing block record still carries the per-file key that unlocks its ciphertext', async () => {
  const c = createRoomChain({ store: await createOpfsStore({ memory: true }), roomId });
  const { block } = await c.fold(rec(0));
  assert.ok(block.enc && block.enc.key, 'the folded block holds the decryption manifest');
  assert.equal(block.mxc, 'mxc://hs.test/m0', 'and where the ciphertext lives');
  assert.equal(block.author, '@alice:hs.test');
});

test('the chain reloads from OPFS and still verifies, keeping its idempotency set', async () => {
  const shared = fakeOpfs();
  const nav = { storage: { getDirectory: async () => shared } };

  const c1 = createRoomChain({ store: await createOpfsStore({ navigator: nav, root: 'eo-room-vault' }), roomId });
  await c1.fold(rec(0)); await c1.fold(rec(1));
  assert.equal((await c1.verify()).ok, true);

  const c2 = createRoomChain({ store: await createOpfsStore({ navigator: nav, root: 'eo-room-vault' }), roomId });
  await c2.load();
  assert.equal(c2.list().length, 2, 'reloaded from OPFS');
  assert.equal((await c2.verify()).ok, true);
  assert.equal(c2.hasEvent('$ev0'), true, 'idempotency set rebuilt from the blocks');
  const dup = await c2.fold(rec(0));
  assert.equal(dup.deduped, true, 'a replayed event after reload is still a no-op');
  assert.equal(c2.list().length, 2);
});

test('two rooms in one store do not collide', async () => {
  const store = await createOpfsStore({ memory: true });
  const a = createRoomChain({ store, roomId: '!a:hs.test' });
  const b = createRoomChain({ store, roomId: '!b:hs.test' });
  await a.fold(rec(0));
  await b.load();
  assert.equal(b.list().length, 0, 'room B is empty though room A has a block in the same store');
});

// A minimal in-memory OPFS directory handle (mirrors the chat/vault integration tests).
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
