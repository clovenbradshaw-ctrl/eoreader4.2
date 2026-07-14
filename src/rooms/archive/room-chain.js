// EO: CON(Field → Link,Network, Binding,Tracing) — the shared, room-ordered ledger
// archive/room-chain.js — the block chain of the SHARED vault. Where archive/chain.js
// is a single writer's private ledger (it assigns `at` from the local clock and appends
// its own blocks), this one is a MANY-writer ledger folded from a Matrix room timeline:
// every member receives the same block events, in the same order the homeserver streamed
// them, and folds them into an identical hash-linked chain. The room timeline is the
// ordering authority (as it already is for every message); the hash-linking is what makes
// that agreed order tamper-evident — reorder, drop, or edit a block and its hash (and
// every later block's `prev`) no longer checks out. Because the block is content-addressed
// (the sha256 of the plaintext) and its record travels inside an authenticated Megolm
// event, the homeserver can neither read a block nor forge one undetectably.
//
// Determinism is the whole game: two members must compute the SAME hash for the same
// block, so nothing local may enter it. `at` is the event's origin_server_ts (identical
// for everyone), `author` is the authenticated event sender, `src.eventId` is the Matrix
// event id — all carried in, none minted here. This module only assigns `index` and
// `prev` from receive order and hashes. Folding is idempotent by `src.eventId`, so a
// re-sync (or a reload that replays the timeline) never double-appends.
//
// Reuses the pure hash/verify primitives from chain.js so the two ledgers agree on what
// a block hash IS; persisted per-room to the injected OPFS store, append-only.
import { hashBlock, verifyBlocks, GENESIS_PREV } from './chain.js';

// createRoomChain({ store, roomId }) → the per-room ledger controller. `store` is an
// opfs-store; `roomId` scopes the keyspace so many rooms share one store without collision.
export const createRoomChain = ({ store, roomId } = {}) => {
  if (!store) throw new Error('createRoomChain needs a store');
  if (!roomId) throw new Error('createRoomChain needs a roomId');
  const P = `rvault/${encodeURIComponent(roomId)}`;
  const blockKey = (i) => `${P}/block/${i}`;
  const HEAD_KEY = `${P}/head`;

  let blocks = [];                 // in-memory cache, index-ordered
  const byEvent = new Set();       // src.eventId already folded — idempotency
  let loaded = false;

  // Hydrate the chain from the store, rebuilding the folded-event set from the blocks
  // themselves (each block records the Matrix event it came from), so idempotency
  // survives a reload without a second bookkeeping key.
  const load = async () => {
    blocks = []; byEvent.clear();
    const head = await store.getJson(HEAD_KEY);
    if (!head || typeof head.index !== 'number') { loaded = true; return blocks; }
    for (let i = 0; i <= head.index; i++) {
      const b = await store.getJson(blockKey(i));
      if (!b) break;
      blocks.push(b);
      if (b.src && b.src.eventId) byEvent.add(b.src.eventId);
    }
    loaded = true;
    return blocks;
  };
  const ensure = async () => { if (!loaded) await load(); };

  const head = () => (blocks.length ? { index: blocks.length - 1, hash: blocks[blocks.length - 1].hash } : null);

  // Fold a decrypted block RECORD (from a room event) onto the tail. The record must be
  // fully deterministic — { contentHash, size, mime, name, mxc, enc, at, author,
  // src:{eventId} } — and must NOT carry index/prev/hash (this assigns them). Idempotent
  // by src.eventId. Returns { block, deduped? }.
  const fold = async (record) => {
    await ensure();
    const eid = record && record.src && record.src.eventId;
    if (eid && byEvent.has(eid)) return { block: blocks.find((b) => b.src && b.src.eventId === eid) || null, deduped: true };
    const prevBlock = blocks[blocks.length - 1] || null;
    const block = {
      index: prevBlock ? prevBlock.index + 1 : 0,
      prev: prevBlock ? prevBlock.hash : GENESIS_PREV,
      ...record,
    };
    block.hash = await hashBlock(block);
    await store.setJson(blockKey(block.index), block);
    await store.setJson(HEAD_KEY, { index: block.index, hash: block.hash });
    blocks.push(block);
    if (eid) byEvent.add(eid);
    return { block };
  };

  const list = () => blocks.slice();                            // oldest → newest
  const get = (index) => blocks.find((b) => b.index === index) || null;
  const findByContentHash = (h) => blocks.find((b) => b.contentHash === h) || null;
  const hasEvent = (eid) => byEvent.has(eid);
  const verify = async () => { await ensure(); return verifyBlocks(blocks); };

  return Object.freeze({ load, fold, list, get, findByContentHash, hasEvent, head, verify });
};
