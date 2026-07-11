// EO: CON·INS(Network,Field → Link, Binding,Making) — encrypted key backup + recovery
// archive/vault-backup.js — the durability answer for the vault: without this, the
// chain-with-keys lives only in this browser's OPFS, so losing the profile loses the
// data. Backup serializes the whole chain (every block, i.e. every per-file key),
// encrypts it under a PASSPHRASE the user chooses (file-crypto wrapWithPassphrase, a
// PBKDF2 → AES-GCM envelope), and uploads that ciphertext to the SAME Matrix media
// store the content already lives in. The homeserver therefore only ever holds opaque
// bytes; the passphrase never leaves the browser and is never uploaded.
//
// So a second device can FIND the backup, its pointer (the mxc, plus metadata — no
// secret) is written to Matrix ACCOUNT DATA, which the homeserver syncs per-user.
// Recovery: sign in → read the pointer from account data → download → unwrap with the
// passphrase → import the chain. Deliberately NOT Archive.org: a backup of key
// material must be private and deletable, not a permanent public commons.
import { wrapWithPassphrase, unwrapWithPassphrase, bytesToText } from './file-crypto.js';

// The account-data type that holds the backup pointer (not the backup itself).
export const BACKUP_ACCOUNT_DATA_TYPE = 'org.eoreader.vault.backup';

// createVaultBackup({ chain, media, session, fetch }) → { backup, restore, pointer }.
export const createVaultBackup = ({
  chain, media, session,
  fetch: fetchImpl = (typeof fetch !== 'undefined' ? fetch : null),
  now = null,
} = {}) => {
  const id = () => (session && session.identity ? session.identity() : null);
  const nowIso = () => { try { return new Date(typeof now === 'function' ? now() : Date.now()).toISOString(); } catch { return null; } };

  // Account-data GET/PUT for the pointer — small authenticated JSON calls, non-throwing.
  const accountDataUrl = (who) =>
    `${who.homeserver}/_matrix/client/v3/user/${encodeURIComponent(who.userId)}/account_data/${encodeURIComponent(BACKUP_ACCOUNT_DATA_TYPE)}`;

  const putPointer = async (pointer) => {
    const who = id(); if (!who || !who.token || !fetchImpl) return { ok: false };
    try {
      const res = await fetchImpl(accountDataUrl(who), {
        method: 'PUT',
        headers: { Authorization: 'Bearer ' + who.token, 'Content-Type': 'application/json' },
        body: JSON.stringify(pointer),
      });
      return { ok: res.ok !== false && res.status < 400 };
    } catch { return { ok: false }; }
  };
  const getPointer = async () => {
    const who = id(); if (!who || !who.token || !fetchImpl) return null;
    try {
      const res = await fetchImpl(accountDataUrl(who), { method: 'GET', headers: { Authorization: 'Bearer ' + who.token, Accept: 'application/json' } });
      if (res.ok === false || res.status >= 400) return null;
      const j = await res.json();
      return j && j.mxc ? j : null;
    } catch { return null; }
  };

  // Back up the current chain under `passphrase`. Returns { ok, mxc, count } — the
  // pointer is written to account data so any signed-in device can recover.
  const backup = async (passphrase) => {
    if (!passphrase) return { ok: false, error: 'a passphrase is required' };
    const blocks = await chain.exportBlocks();
    const plain = new TextEncoder().encode(JSON.stringify({ v: 1, blocks }));
    let envelope;
    try { envelope = await wrapWithPassphrase(plain, passphrase); }
    catch (e) { return { ok: false, error: e.message }; }
    const blob = new TextEncoder().encode(JSON.stringify(envelope));
    const up = await media.upload(blob, { contentType: 'application/json', filename: 'vault-backup.enc' });
    if (!up.ok) return { ok: false, error: up.error || 'upload failed' };
    const pointer = { mxc: up.mxc, at: nowIso(), count: blocks.length, algo: envelope.v };
    await putPointer(pointer);   // best-effort; the mxc is still returned to the caller
    return { ok: true, mxc: up.mxc, count: blocks.length };
  };

  // Restore the chain from the account-data pointer using `passphrase`. Replaces the
  // local chain (validated before it is committed). Returns { ok, count }.
  const restore = async (passphrase) => {
    if (!passphrase) return { ok: false, error: 'a passphrase is required' };
    const pointer = await getPointer();
    if (!pointer || !pointer.mxc) return { ok: false, error: 'no backup found for this account' };
    const dl = await media.download(pointer.mxc);
    if (!dl.ok) return { ok: false, error: dl.error || 'download failed' };
    let envelope;
    try { envelope = JSON.parse(bytesToText(dl.bytes)); } catch { return { ok: false, error: 'unreadable backup' }; }
    let plain;
    try { plain = await unwrapWithPassphrase(envelope, passphrase); }
    catch (e) { return { ok: false, error: e.code === 'WRONG_PASSPHRASE' ? 'wrong passphrase' : 'corrupt backup' }; }
    let parsed;
    try { parsed = JSON.parse(bytesToText(plain)); } catch { return { ok: false, error: 'corrupt backup contents' }; }
    const res = await chain.importBlocks(parsed.blocks || []);
    if (!res.ok) return { ok: false, error: `backup chain invalid (${res.reason || 'broken'})` };
    return { ok: true, count: res.length };
  };

  return Object.freeze({ backup, restore, pointer: getPointer });
};
