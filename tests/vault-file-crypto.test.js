// The encrypted-attachment crypto: a Matrix EncryptedFile round-trip via Web Crypto,
// and the integrity guard that makes tampering fail loudly.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { encryptFile, decryptFile, bytesToText, sha256Hex } from '../src/rooms/archive/file-crypto.js';

test('encrypt → decrypt round-trips text through a Matrix EncryptedFile manifest', async () => {
  const { ciphertext, file } = await encryptFile('the quick brown fox jumps over the encrypted vault');
  assert.equal(file.v, 'v2');
  assert.equal(file.key.alg, 'A256CTR');
  assert.ok(file.hashes.sha256, 'ciphertext hash present');
  assert.notEqual(bytesToText(ciphertext), 'the quick brown fox jumps over the encrypted vault', 'stored bytes are not plaintext');

  const out = await decryptFile(ciphertext, file);
  assert.equal(bytesToText(out), 'the quick brown fox jumps over the encrypted vault');
});

test('binary bytes survive the round-trip exactly', async () => {
  const data = new Uint8Array([0, 1, 2, 253, 254, 255, 128, 64]);
  const { ciphertext, file } = await encryptFile(data);
  const out = await decryptFile(ciphertext, file);
  assert.deepEqual([...out], [...data]);
});

test('a tampered ciphertext is rejected before any plaintext is returned', async () => {
  const { ciphertext, file } = await encryptFile('sensitive');
  ciphertext[0] ^= 0xff;   // flip a byte
  await assert.rejects(() => decryptFile(ciphertext, file), (e) => e.code === 'HASH_MISMATCH');
});

test('each encryption uses a fresh key (two encryptions of the same input differ)', async () => {
  const a = await encryptFile('same');
  const b = await encryptFile('same');
  assert.notEqual(a.file.key.k, b.file.key.k, 'distinct per-file keys');
  assert.notEqual(await sha256Hex(a.ciphertext), await sha256Hex(b.ciphertext), 'distinct ciphertexts');
});
