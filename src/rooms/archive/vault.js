// EO: CON·INS(Network,Field → Link,Entity, Binding,Making) — the encrypted media vault
// archive/vault.js — the one entrance to "save things, encrypted, hash-chained, into
// the media store." It composes the three parts into a single reactive controller:
//
//   file-crypto  encrypt the bytes with a fresh per-file key (Matrix EncryptedFile)
//   mxc          upload the CIPHERTEXT to the homeserver media store → an mxc:// URI
//   chain        append a tamper-evident block: content address + mxc + the key
//
// The homeserver holds only opaque ciphertext; the decryption key lives inside the
// block, and the chain (with its keys) is persisted to OPFS. Saving is idempotent by
// content: the same bytes resolve to the same content address, so a re-save returns
// the existing block instead of duplicating the upload. Opening reverses the pipeline
// and verifies twice — the ciphertext SHA-256 (file-crypto) and the plaintext content
// address (the block) — so a swapped or corrupted blob is caught, not returned.
//
// Reuses the Matrix identity the app already has (archive/matrix, via window.EO.matrix)
// and needs no libolm — attachment encryption is Web Crypto AES-CTR. Injectable and
// non-throwing throughout.
import { createOpfsStore } from '../chat/index.js';
import { createMediaStore } from './mxc.js';
import { createChain } from './chain.js';
import { createVaultBackup } from './vault-backup.js';
import { encryptFile, decryptFile, sha256Hex, asBytes, safeText } from './file-crypto.js';

// createVault({ matrix, fetch, navigator, storeRoot }) → the vault controller.
export const createVault = ({
  matrix,
  fetch: fetchImpl = (typeof fetch !== 'undefined' ? fetch : null),
  navigator: nav = (typeof navigator !== 'undefined' ? navigator : null),
  storeRoot = 'eo-vault',
} = {}) => {
  const state = { status: 'idle', error: null, persistent: false, blocks: [] };
  const subs = new Set();
  const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
  const emit = (kind = 'state') => { for (const fn of subs) { try { fn(state, kind); } catch { /* surface's problem */ } } };
  const setState = (patch, kind) => { Object.assign(state, patch); emit(kind); };

  let store = null, media = null, chain = null, backupCtl = null;

  const refreshBlocks = () => { state.blocks = chain ? chain.list().slice().reverse() : []; };   // newest first for the surface

  // Load the chain from OPFS and wire the media client. Idempotent.
  const start = async () => {
    if (state.status === 'live') return { ok: true };
    const who = matrix && matrix.identity ? matrix.identity() : null;
    if (!who || !who.token) { setState({ status: 'idle', error: 'sign in first' }); return { ok: false, error: 'anon' }; }
    setState({ status: 'starting', error: null });
    store = await createOpfsStore({ navigator: nav, root: storeRoot });
    media = createMediaStore({ session: matrix, fetch: fetchImpl });
    chain = createChain({ store });
    backupCtl = createVaultBackup({ chain, media, session: matrix, fetch: fetchImpl });
    await chain.load();
    refreshBlocks();
    setState({ status: 'live', persistent: store.persistent }, 'blocks');
    return { ok: true };
  };

  // Save bytes/text: encrypt → upload → append a block. `meta` may carry { name, mime }.
  // Returns { ok, block, deduped? } — never throws.
  const save = async (input, meta = {}) => {
    if (state.status !== 'live') { const s = await start(); if (!s.ok) return s; }
    let bytes;
    try { bytes = asBytes(input); } catch (e) { return { ok: false, error: e.message }; }
    const contentHash = await sha256Hex(bytes);

    const existing = chain.findByContentHash(contentHash);
    if (existing) return { ok: true, block: existing, deduped: true };

    let enc;
    try { enc = await encryptFile(bytes); } catch (e) { return { ok: false, error: 'encrypt failed: ' + e.message }; }
    const up = await media.upload(enc.ciphertext, {
      contentType: 'application/octet-stream',
      filename: (meta.name ? String(meta.name) : 'item') + '.enc',
    });
    if (!up.ok) return { ok: false, error: up.error || 'upload failed' };

    const file = { ...enc.file, url: up.mxc };
    const block = await chain.append({
      contentHash,
      size: bytes.length,
      mime: meta.mime || 'application/octet-stream',
      name: meta.name || null,
      mxc: up.mxc,
      enc: file,
    });
    refreshBlocks();
    emit('blocks');
    return { ok: true, block };
  };

  // Open a block (by index or block object): download → decrypt → verify both hashes.
  // Returns { ok, bytes, text }, or { ok:false, error }.
  const open = async (indexOrBlock) => {
    if (state.status !== 'live') { const s = await start(); if (!s.ok) return s; }
    const block = typeof indexOrBlock === 'object' ? indexOrBlock : chain.get(indexOrBlock);
    if (!block) return { ok: false, error: 'no such block' };
    const dl = await media.download(block.mxc);
    if (!dl.ok) return { ok: false, error: dl.error || 'download failed' };
    let bytes;
    try { bytes = await decryptFile(dl.bytes, block.enc); }
    catch (e) { return { ok: false, error: e.code === 'HASH_MISMATCH' ? 'ciphertext tampered' : ('decrypt failed: ' + e.message) }; }
    // Second check: the decrypted plaintext must match the block's content address.
    if (await sha256Hex(bytes) !== block.contentHash) return { ok: false, error: 'content address mismatch' };
    return { ok: true, bytes, text: safeText(bytes, block.mime) };
  };

  const list = () => (chain ? chain.list().slice().reverse() : []);
  const verify = async () => (chain ? chain.verify() : { ok: true, length: 0 });
  const head = () => (chain ? chain.head() : null);

  // Encrypt the chain-with-keys under `passphrase` and back it up to the Matrix media
  // store (pointer in account data). Returns { ok, mxc, count }.
  const backup = async (passphrase) => {
    if (state.status !== 'live') { const s = await start(); if (!s.ok) return s; }
    setState({ error: null }, 'backup');
    const r = await backupCtl.backup(passphrase);
    emit('backup');
    return r;
  };
  // Recover the chain from the account's backup using `passphrase`, replacing the local
  // chain. Returns { ok, count }.
  const restore = async (passphrase) => {
    if (state.status !== 'live') { const s = await start(); if (!s.ok) return s; }
    const r = await backupCtl.restore(passphrase);
    if (r.ok) { refreshBlocks(); emit('blocks'); }
    return r;
  };
  // Whether a backup exists for this account (for the surface to show a Restore hint).
  const backupPointer = async () => (backupCtl ? backupCtl.pointer() : null);

  return Object.freeze({ state, subscribe, start, save, open, list, verify, head, backup, restore, backupPointer });
};
