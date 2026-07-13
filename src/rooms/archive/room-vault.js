// EO: CON·INS(Network,Field → Link,Entity, Binding,Making) — the shared, room-encrypted vault
// archive/room-vault.js — "save anything, as binary, into a room, so only the people in
// that room can read it, and let the room agree on the order." It is the vault
// (archive/vault.js) made COLLECTIVE: instead of a per-file key kept privately on one
// device, the key rides inside a Megolm room event, so exactly the room's members — the
// people invited to the workspace — can decrypt it, and no one else (not even the
// homeserver, which sees only opaque ciphertext and opaque envelopes).
//
// The pipeline, composed from parts that already exist:
//
//   save(roomId, bytes):
//     encrypt (per-file key)      → file-crypto.js   ── the content, as ciphertext
//     upload the CIPHERTEXT       → mxc.js           ── binary, in the Matrix media repo
//     publish the block record    → chat.sendRoomEvent ─ Megolm-encrypted to the room
//                                    (contentHash + mxc + the per-file key)
//
//   receive (every member, via the chat sync loop):
//     decrypt the room event      → chat.onRoomEvent  ── only members hold the key
//     fold onto the room's chain  → room-chain.js     ── timeline order = chain order
//
//   open(roomId, block):
//     download ← mxc → decrypt + verify sha256 → verify content address
//
// So the block record — which carries the per-file key — is readable ONLY by whoever is
// in the room when it is sent (Megolm's exact guarantee), and the ciphertext it points at
// is meaningless without that record. Membership is access. The chain is the same
// tamper-evident, content-addressed ledger as the private vault, but folded from the room
// timeline so every member converges on an identical head hash (compare heads to detect a
// misbehaving server). Room messages ARE the update channel; a save is a room event, and
// `chat.sendSignal` carries the lighter "someone just saved X" nudges on the same rail.
//
// Reuses the SAME Matrix identity as everything else (window.EO.matrix) for the media
// transport, and the chat holon (window.EO.chat) as the encrypted bus. Injectable and
// non-throwing throughout.
import { createOpfsStore } from '../chat/opfs-store.js';
import { createMediaStore } from './mxc.js';
import { createRoomChain } from './room-chain.js';
import { encryptFile, decryptFile, sha256Hex, asBytes, safeText } from './file-crypto.js';

export const VAULT_BLOCK_TYPE = 'org.eoreader.vault.block';   // the room event that carries a block

// createRoomVault({ chat, matrix, fetch, navigator, storeRoot }) → the shared-vault
// controller. `chat` is the chat holon controller (the encrypted room bus); `matrix` is
// the archive/matrix session (for the media transport).
export const createRoomVault = ({
  chat,
  matrix,
  fetch: fetchImpl = (typeof fetch !== 'undefined' ? fetch : null),
  navigator: nav = (typeof navigator !== 'undefined' ? navigator : null),
  storeRoot = 'eo-room-vault',
} = {}) => {
  const state = { status: 'idle', error: null, persistent: false, byRoom: {} };
  const subs = new Set();
  const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
  const emit = (kind = 'state', roomId = null) => { for (const fn of subs) { try { fn(state, kind, roomId); } catch { /* surface's problem */ } } };
  const setState = (patch, kind) => { Object.assign(state, patch); emit(kind); };

  let store = null, media = null, unsub = null;
  const chains = new Map();   // roomId -> room-chain

  const refresh = (roomId) => {
    const chain = chains.get(roomId);
    state.byRoom[roomId] = chain ? chain.list().slice().reverse() : [];   // newest first for the surface
  };

  // Start: needs a Matrix login and the chat bus. Wires the media client and subscribes
  // to decrypted vault-block events so every save any member makes folds onto the chain.
  // Idempotent.
  const start = async () => {
    if (state.status === 'live') return { ok: true };
    const who = matrix && matrix.identity ? matrix.identity() : null;
    if (!who || !who.token) { setState({ status: 'idle', error: 'sign in first' }); return { ok: false, error: 'anon' }; }
    if (!chat) { setState({ status: 'error', error: 'no chat bus' }); return { ok: false, error: 'no-chat' }; }
    setState({ status: 'starting', error: null });
    const s = await chat.start();
    if (!s.ok) { setState({ status: 'error', error: s.error || 'chat unavailable' }); return s; }
    store = await createOpfsStore({ navigator: nav, root: storeRoot });
    media = createMediaStore({ session: matrix, fetch: fetchImpl });
    unsub = chat.onRoomEvent(onBusEvent);
    setState({ status: 'live', persistent: store.persistent });
    return { ok: true };
  };

  const stop = () => { if (unsub) { unsub(); unsub = null; } setState({ status: 'idle' }); };

  // Lazily build + load the ledger for a room.
  const ensureChain = async (roomId) => {
    let chain = chains.get(roomId);
    if (chain) return chain;
    chain = createRoomChain({ store, roomId });
    await chain.load();
    chains.set(roomId, chain);
    refresh(roomId);
    return chain;
  };

  // A decrypted app event arrived on the bus. Fold vault blocks (in timeline order — the
  // dispatch is awaited by the chat holon, so ordering holds) onto the room's chain.
  const onBusEvent = async (evt) => {
    if (!evt || evt.type !== VAULT_BLOCK_TYPE || !evt.content) return;
    const chain = await ensureChain(evt.roomId);
    if (evt.eventId && chain.hasEvent(evt.eventId)) return;
    // The record: the decrypted payload plus the AUTHENTICATED envelope fields, so every
    // member hashes an identical, deterministic block (nothing local enters it).
    const c = evt.content;
    const record = {
      contentHash: c.contentHash, size: c.size, mime: c.mime || 'application/octet-stream',
      name: c.name || null, mxc: c.mxc, enc: c.enc,
      at: (evt.ts != null ? evt.ts : null), author: evt.sender || null,
      src: { eventId: evt.eventId || null },
    };
    await chain.fold(record);
    refresh(evt.roomId);
    emit('blocks', evt.roomId);
  };

  // Save bytes/text into a room: encrypt → upload ciphertext → publish the block event.
  // The block folds when the event echoes back through sync (like every other member's),
  // so a fresh save returns { ok, pending:true, eventId, contentHash } — the block itself
  // appears on `list` after the next sync (there is no local block yet, by design: the
  // room's order is the timeline's). Deduped by content: re-saving identical bytes already
  // on the room's chain returns { ok, deduped:true, block } and uploads nothing. Never throws.
  const save = async (roomId, input, meta = {}) => {
    if (state.status !== 'live') { const s = await start(); if (!s.ok) return s; }
    if (!roomId) return { ok: false, error: 'no room' };
    let bytes;
    try { bytes = asBytes(input); } catch (e) { return { ok: false, error: e.message }; }
    const contentHash = await sha256Hex(bytes);

    const chain = await ensureChain(roomId);
    const existing = chain.findByContentHash(contentHash);
    if (existing) return { ok: true, block: existing, deduped: true, contentHash };

    let enc;
    try { enc = await encryptFile(bytes); } catch (e) { return { ok: false, error: 'encrypt failed: ' + e.message }; }
    // The upload filename is sent UNENCRYPTED in the media URL, so it must reveal nothing:
    // the real name lives only inside the Megolm-encrypted block. Use an opaque, content-
    // derived label so the homeserver never learns what a member called a shared item.
    const up = await media.upload(enc.ciphertext, {
      contentType: 'application/octet-stream',
      filename: contentHash.slice(0, 16) + '.enc',
    });
    if (!up.ok) return { ok: false, error: up.error || 'upload failed' };

    const record = {
      contentHash, size: bytes.length,
      mime: meta.mime || 'application/octet-stream',
      name: meta.name || null,
      mxc: up.mxc,
      enc: { ...enc.file, url: up.mxc },
    };
    const sent = await chat.sendRoomEvent(roomId, VAULT_BLOCK_TYPE, record);
    if (!sent.ok) return { ok: false, error: sent.error || 'publish failed' };
    return { ok: true, pending: true, eventId: sent.eventId, contentHash };
  };

  // Open a block (by index or block object): download → decrypt → verify both hashes.
  const open = async (roomId, indexOrBlock) => {
    if (state.status !== 'live') { const s = await start(); if (!s.ok) return s; }
    const chain = await ensureChain(roomId);
    const block = typeof indexOrBlock === 'object' ? indexOrBlock : chain.get(indexOrBlock);
    if (!block) return { ok: false, error: 'no such block' };
    const dl = await media.download(block.mxc);
    if (!dl.ok) return { ok: false, error: dl.error || 'download failed' };
    let bytes;
    try { bytes = await decryptFile(dl.bytes, block.enc); }
    catch (e) { return { ok: false, error: e.code === 'HASH_MISMATCH' ? 'ciphertext tampered' : ('decrypt failed: ' + e.message) }; }
    if (await sha256Hex(bytes) !== block.contentHash) return { ok: false, error: 'content address mismatch' };
    return { ok: true, bytes, text: safeText(bytes, block.mime) };
  };

  // Pump the chat sync once and let any fresh blocks fold — a hook tests (and a manual
  // "refresh") can call without owning the sync loop.
  const pump = async (opts) => (chat && chat.pump ? chat.pump(opts) : { ok: false });

  const list = (roomId) => { const c = chains.get(roomId); return c ? c.list().slice().reverse() : []; };
  const verify = async (roomId) => { const c = chains.get(roomId); return c ? c.verify() : { ok: true, length: 0 }; };
  const head = (roomId) => { const c = chains.get(roomId); return c ? c.head() : null; };

  return Object.freeze({ state, subscribe, start, stop, save, open, list, verify, head, pump, ensureChain });
};
