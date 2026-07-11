// The whole vault pipeline end to end, through the fake homeserver's media store:
// save (encrypt → upload ciphertext → append a hash-linked block), open (download →
// decrypt → verify), dedupe by content, chain integrity, and the guarantee that the
// homeserver only ever holds opaque ciphertext.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createFakeHomeserver } from './helpers/fake-homeserver.js';
import { createVault } from '../src/rooms/archive/vault.js';
import { bytesToText } from '../src/rooms/archive/file-crypto.js';

const vaultOn = async (hs) => {
  const session = hs.sessionFor('@alice:hs.test', 'ALICEDEV', 'tok-vault');
  const v = createVault({ matrix: session, fetch: hs.fetch, navigator: null });
  await v.start();
  return v;
};

test('save → open round-trips a document through the encrypted media store', async () => {
  const hs = createFakeHomeserver();
  const vault = await vaultOn(hs);

  const secret = 'Minutes: the vote passed 4–1. Encrypted at rest, keyed by us.';
  const saved = await vault.save(secret, { name: 'minutes', mime: 'text/plain' });
  assert.equal(saved.ok, true);
  assert.equal(saved.block.index, 0);
  assert.ok(saved.block.mxc.startsWith('mxc://'), 'stored in the media repo');
  assert.ok(saved.block.enc && saved.block.enc.key, 'the block carries the decryption key');

  const opened = await vault.open(saved.block.index);
  assert.equal(opened.ok, true);
  assert.equal(opened.text, secret);
});

test('the media store holds only ciphertext, never the plaintext', async () => {
  const hs = createFakeHomeserver();
  const vault = await vaultOn(hs);
  const secret = 'PLAINTEXT-NEEDLE-9f3a';
  await vault.save(secret, { name: 'n', mime: 'text/plain' });
  // Inspect every blob the homeserver stored — none may contain the needle.
  for (const bytes of hs.mediaStore.values()) {
    assert.ok(!bytesToText(bytes).includes('PLAINTEXT-NEEDLE-9f3a'), 'stored blob is encrypted');
  }
});

test('saving the same content twice is deduped to one block and one upload', async () => {
  const hs = createFakeHomeserver();
  const vault = await vaultOn(hs);
  const a = await vault.save('same bytes', { name: 'a' });
  const b = await vault.save('same bytes', { name: 'b' });
  assert.equal(a.ok, true); assert.equal(b.ok, true);
  assert.equal(b.deduped, true);
  assert.equal(b.block.index, a.block.index, 'same block');
  assert.equal(hs.mediaStore.size, 1, 'only one upload');
});

test('multiple saves form a verifiable chain that survives reload', async () => {
  const hs = createFakeHomeserver();
  const session = hs.sessionFor('@alice:hs.test', 'ALICEDEV', 'tok-v2');
  const nav = { storage: { getDirectory: async () => fakeOpfs() } };
  // one shared fake OPFS across two vault lifetimes
  const shared = fakeOpfs();
  const navShared = { storage: { getDirectory: async () => shared } };

  const v1 = createVault({ matrix: session, fetch: hs.fetch, navigator: navShared });
  await v1.start();
  await v1.save('block one', { name: '1' });
  await v1.save('block two', { name: '2' });
  await v1.save('block three', { name: '3' });
  assert.equal((await v1.verify()).ok, true);
  assert.equal(v1.head().index, 2);

  const v2 = createVault({ matrix: session, fetch: hs.fetch, navigator: navShared });
  await v2.start();
  assert.equal(v2.list().length, 3, 'chain reloaded from OPFS');
  const v = await v2.verify();
  assert.equal(v.ok, true);
  assert.equal(v.length, 3);
  // and an old block still opens after reload
  const opened = await v2.open(0);
  assert.equal(opened.text, 'block one');
  void nav;
});

test('a corrupted blob in the media store is caught on open', async () => {
  const hs = createFakeHomeserver();
  const vault = await vaultOn(hs);
  const saved = await vault.save('trust but verify', { name: 't', mime: 'text/plain' });
  // Corrupt the stored ciphertext.
  const [mediaId] = [...hs.mediaStore.keys()];
  const b = hs.mediaStore.get(mediaId); b[0] ^= 0xff;
  const opened = await vault.open(saved.block.index);
  assert.equal(opened.ok, false);
  assert.match(opened.error, /tampered/);
});

// A minimal in-memory OPFS directory handle (mirrors the chat integration test).
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
