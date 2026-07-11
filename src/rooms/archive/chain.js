// EO: CON(Field → Link,Network, Binding,Tracing) — the append-only hash-linked ledger
// archive/chain.js — the "block chain" of the encrypted media vault. Each saved item
// is a BLOCK carrying the SHA-256 of the block before it, so the whole record is
// tamper-evident: change any block's content, metadata, order, or its stored mxc, and
// its hash changes, breaking the link every later block depends on. This is the same
// spirit as the app's content-addressed checkpoints (checkpoints.js), sharpened into
// a linked chain and moved onto a cryptographic hash.
//
// A block does NOT hold the plaintext or the ciphertext — it holds the content address
// (sha256 of the plaintext), the mxc where the ciphertext lives (archive/mxc.js), and
// the EncryptedFile manifest that unlocks it (archive/file-crypto.js). Losing the
// chain therefore loses the keys, so it is persisted to the injected OPFS store, one
// record per block plus a head pointer — append-only, never rewritten.
import { sha256Hex } from './file-crypto.js';

export const GENESIS_PREV = '0'.repeat(64);
const blockKey = (i) => `vault/block/${i}`;
const HEAD_KEY = 'vault/head';

// Canonical JSON — keys sorted at every depth — so a block hashes identically wherever
// it is recomputed. The `hash` field itself is excluded (it is the output).
const canonical = (obj) => {
  const sort = (v) => Array.isArray(v) ? v.map(sort)
    : (v && typeof v === 'object')
      ? Object.keys(v).sort().reduce((a, k) => { a[k] = sort(v[k]); return a; }, {})
      : v;
  return JSON.stringify(sort(obj));
};

// The hash of a block: SHA-256 (hex) over its canonical form minus `hash`.
export const hashBlock = async (block) => {
  const { hash, ...rest } = block;   // eslint-disable-line no-unused-vars
  return sha256Hex(new TextEncoder().encode(canonical(rest)));
};

// createChain({ store, now }) → the ledger controller over an injected OPFS store.
export const createChain = ({ store, now = null } = {}) => {
  if (!store) throw new Error('createChain needs a store');
  let blocks = [];   // in-memory cache, index-ordered
  let loaded = false;

  const nowIso = () => { try { return new Date(typeof now === 'function' ? now() : Date.now()).toISOString(); } catch { return null; } };

  // Hydrate the chain from the store: read the head pointer, then walk 0..head.
  const load = async () => {
    blocks = [];
    const head = await store.getJson(HEAD_KEY);
    if (!head || typeof head.index !== 'number') { loaded = true; return blocks; }
    for (let i = 0; i <= head.index; i++) {
      const b = await store.getJson(blockKey(i));
      if (!b) break;
      blocks.push(b);
    }
    loaded = true;
    return blocks;
  };
  const ensure = async () => { if (!loaded) await load(); };

  const head = () => (blocks.length ? { index: blocks.length - 1, hash: blocks[blocks.length - 1].hash } : null);

  // Append a block. `payload` is the vault's record (contentHash, mxc, enc, meta…);
  // this fills in index, prev, at, and the block hash, persists it, and advances head.
  const append = async (payload) => {
    await ensure();
    const prevBlock = blocks[blocks.length - 1] || null;
    const block = {
      index: prevBlock ? prevBlock.index + 1 : 0,
      prev: prevBlock ? prevBlock.hash : GENESIS_PREV,
      at: nowIso(),
      ...payload,
    };
    block.hash = await hashBlock(block);
    await store.setJson(blockKey(block.index), block);
    await store.setJson(HEAD_KEY, { index: block.index, hash: block.hash });
    blocks.push(block);
    return block;
  };

  const list = () => blocks.slice();                         // oldest → newest
  const get = (index) => blocks.find((b) => b.index === index) || null;
  const findByContentHash = (h) => blocks.find((b) => b.contentHash === h) || null;

  // Walk the chain, recomputing each block's hash and checking the prev-linkage and
  // index continuity. Returns { ok, length, brokenAt? , reason? } — the integrity proof.
  const verify = async () => {
    await ensure();
    let prev = GENESIS_PREV;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.index !== i) return { ok: false, brokenAt: i, reason: 'index-gap' };
      if (b.prev !== prev) return { ok: false, brokenAt: i, reason: 'prev-mismatch' };
      const recomputed = await hashBlock(b);
      if (recomputed !== b.hash) return { ok: false, brokenAt: i, reason: 'hash-mismatch' };
      prev = b.hash;
    }
    return { ok: true, length: blocks.length };
  };

  return Object.freeze({ load, append, list, get, findByContentHash, head, verify });
};
