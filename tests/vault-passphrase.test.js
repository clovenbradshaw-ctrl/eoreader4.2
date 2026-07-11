// Passphrase-wrapped encryption for the key backup: round-trip, wrong-passphrase and
// tamper rejection, and a fresh salt/iv per wrap.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { wrapWithPassphrase, unwrapWithPassphrase, bytesToText } from '../src/rooms/archive/file-crypto.js';

test('wrap → unwrap round-trips under the right passphrase', async () => {
  const env = await wrapWithPassphrase('the whole keyring', 'correct horse battery staple', { iterations: 50000 });
  assert.equal(env.v, 'eo-pw-1');
  assert.ok(env.kdf.salt && env.iv && env.ct);
  const out = await unwrapWithPassphrase(env, 'correct horse battery staple');
  assert.equal(bytesToText(out), 'the whole keyring');
});

test('a wrong passphrase is rejected (GCM tag fails)', async () => {
  const env = await wrapWithPassphrase('secret', 'right', { iterations: 50000 });
  await assert.rejects(() => unwrapWithPassphrase(env, 'wrong'), (e) => e.code === 'WRONG_PASSPHRASE');
});

test('a tampered envelope is rejected', async () => {
  const env = await wrapWithPassphrase('secret', 'pw', { iterations: 50000 });
  const bad = { ...env, ct: env.ct.slice(0, -2) + (env.ct.endsWith('A') ? 'B' : 'A') };
  await assert.rejects(() => unwrapWithPassphrase(bad, 'pw'), (e) => e.code === 'WRONG_PASSPHRASE');
});

test('each wrap uses a fresh salt and iv', async () => {
  const a = await wrapWithPassphrase('x', 'pw', { iterations: 50000 });
  const b = await wrapWithPassphrase('x', 'pw', { iterations: 50000 });
  assert.notEqual(a.kdf.salt, b.kdf.salt);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ct, b.ct);
});
