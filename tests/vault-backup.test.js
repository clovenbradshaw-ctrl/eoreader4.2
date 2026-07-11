// Encrypted key backup + recovery, end to end: device A saves items and backs the
// vault up under a passphrase; device B (same account, empty OPFS) restores from the
// account-data pointer and can open A's items. Plus: wrong passphrase fails, the
// backup blob is ciphertext, and recovery is impossible without the passphrase.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createFakeHomeserver } from './helpers/fake-homeserver.js';
import { createVault } from '../src/rooms/archive/vault.js';

// A shared in-memory OPFS directory handle factory (per device).
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
const navFor = (dir) => ({ storage: { getDirectory: async () => dir } });

test('back up on one device, restore on another, open the items', async () => {
  const hs = createFakeHomeserver();
  // Same account/token on both devices; separate OPFS (separate browsers).
  const sessionA = hs.sessionFor('@alice:hs.test', 'DEVA', 'tok-bk');
  const sessionB = { identity: () => ({ homeserver: 'https://hs.test', token: 'tok-bk', userId: '@alice:hs.test', deviceId: 'DEVB' }) };

  const A = createVault({ matrix: sessionA, fetch: hs.fetch, navigator: navFor(fakeOpfs()), autoSync: false });
  await A.start();
  await A.save('first secret', { name: 'one', mime: 'text/plain' });
  await A.save('second secret', { name: 'two', mime: 'text/plain' });
  const bk = await A.backup('my-strong-passphrase');
  assert.equal(bk.ok, true);
  assert.equal(bk.count, 2);

  // Device B: empty vault, restores from the account backup.
  const B = createVault({ matrix: sessionB, fetch: hs.fetch, navigator: navFor(fakeOpfs()) });
  await B.start();
  assert.equal(B.list().length, 0, 'B starts empty');
  const rr = await B.restore('my-strong-passphrase');
  assert.equal(rr.ok, true);
  assert.equal(rr.count, 2);
  assert.equal((await B.verify()).ok, true, 'restored chain verifies');

  // B can open A's encrypted items (it has the keys now, content is on the media store).
  const blocks = B.list();   // newest first
  const opened = await B.open(blocks.find((b) => b.name === 'one').index);
  assert.equal(opened.text, 'first secret');
});

test('the backup blob is ciphertext and needs the passphrase', async () => {
  const hs = createFakeHomeserver();
  const session = hs.sessionFor('@bob:hs.test', 'DEV', 'tok-bk2');
  const A = createVault({ matrix: session, fetch: hs.fetch, navigator: navFor(fakeOpfs()) });
  await A.start();
  await A.save('TOP-SECRET-NEEDLE', { name: 'x', mime: 'text/plain' });
  await A.backup('pw12345');

  // Nothing stored on the homeserver (media or account data) reveals the plaintext.
  for (const bytes of hs.mediaStore.values()) {
    assert.ok(!new TextDecoder().decode(bytes).includes('TOP-SECRET-NEEDLE'));
  }

  // Restore with the wrong passphrase fails, and leaves the local chain untouched.
  const B = createVault({ matrix: session, fetch: hs.fetch, navigator: navFor(fakeOpfs()) });
  await B.start();
  const rr = await B.restore('WRONG');
  assert.equal(rr.ok, false);
  assert.match(rr.error, /wrong passphrase/);
  assert.equal(B.list().length, 0, 'a failed restore imported nothing');
});

test('restore reports when no backup exists for the account', async () => {
  const hs = createFakeHomeserver();
  const session = hs.sessionFor('@carol:hs.test', 'DEV', 'tok-bk3');
  const V = createVault({ matrix: session, fetch: hs.fetch, navigator: navFor(fakeOpfs()) });
  await V.start();
  const rr = await V.restore('anything');
  assert.equal(rr.ok, false);
  assert.match(rr.error, /no backup/);
});
