// The hash-linked block ledger: append + link, persistence + reload, and — the point
// of a chain — tamper detection at every level (content, order, and the links).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createOpfsStore } from '../src/rooms/chat/opfs-store.js';
import { createChain, GENESIS_PREV, hashBlock } from '../src/rooms/archive/chain.js';

const newStore = () => createOpfsStore({ memory: true });

test('the first block links to genesis; each block links to the one before', async () => {
  const chain = createChain({ store: await newStore() });
  await chain.load();
  const b0 = await chain.append({ contentHash: 'aaa', mxc: 'mxc://h/1' });
  const b1 = await chain.append({ contentHash: 'bbb', mxc: 'mxc://h/2' });
  assert.equal(b0.index, 0);
  assert.equal(b0.prev, GENESIS_PREV);
  assert.equal(b1.index, 1);
  assert.equal(b1.prev, b0.hash, 'second block carries the first block hash');
  const v = await chain.verify();
  assert.deepEqual(v, { ok: true, length: 2 });
});

test('the chain persists and reloads from the store', async () => {
  const store = await newStore();
  const a = createChain({ store });
  await a.load();
  await a.append({ contentHash: 'x', mxc: 'mxc://h/x' });
  await a.append({ contentHash: 'y', mxc: 'mxc://h/y' });

  const b = createChain({ store });
  await b.load();
  assert.equal(b.list().length, 2);
  assert.equal(b.head().index, 1);
  assert.equal((await b.verify()).ok, true);
  assert.ok(b.findByContentHash('y'), 'lookup by content address works after reload');
});

test('editing a block content is caught by verify (hash-mismatch)', async () => {
  const store = await newStore();
  const chain = createChain({ store });
  await chain.load();
  await chain.append({ contentHash: 'one', mxc: 'mxc://h/1' });
  await chain.append({ contentHash: 'two', mxc: 'mxc://h/2' });

  // Tamper with the persisted block 0 behind the chain's back.
  const b0 = await store.getJson('vault/block/0');
  b0.contentHash = 'FORGED';
  await store.setJson('vault/block/0', b0);

  const reloaded = createChain({ store });
  await reloaded.load();
  const v = await reloaded.verify();
  assert.equal(v.ok, false);
  assert.equal(v.brokenAt, 0);
  assert.equal(v.reason, 'hash-mismatch');
});

test('re-pointing a block to a different mxc breaks the chain', async () => {
  const store = await newStore();
  const chain = createChain({ store });
  await chain.load();
  await chain.append({ contentHash: 'a', mxc: 'mxc://h/a' });
  await chain.append({ contentHash: 'b', mxc: 'mxc://h/b' });

  // Swap where block 0's ciphertext points, and re-hash ONLY block 0 to hide it.
  const b0 = await store.getJson('vault/block/0');
  b0.mxc = 'mxc://evil/zzz';
  b0.hash = await hashBlock(b0);          // attacker fixes block 0's own hash…
  await store.setJson('vault/block/0', b0);

  const reloaded = createChain({ store });
  await reloaded.load();
  const v = await reloaded.verify();
  // …but block 1 still carries the OLD hash of block 0, so the link is now broken.
  assert.equal(v.ok, false);
  assert.equal(v.brokenAt, 1);
  assert.equal(v.reason, 'prev-mismatch');
});
