// EO: DEF·SEG·NUL(Lens → Field, Clearing,Dissecting) — local at-rest vault
//
// Adapted from amino's `src/vault.js` (INTEGRATION-EOREADER4 B2). Every byte the
// durable substrate persists — OPFS event chunks, checkpoints — is AES-GCM
// encrypted with a key derived from a passphrase via PBKDF2. The key lives only
// in memory; the store on disk is opaque ciphertext.
//
// Three states:
//   · sealed   — no key in memory; local data is opaque
//   · unlocked — key in memory; reads and writes succeed
//   · absent   — no vault metadata at all (first launch / post-wipe)
//
// lock() clears the key but keeps the data; wipe() drops the metadata too.
//
// Node-safety: amino's vault reached straight for localStorage/sessionStorage.
// Here the small, non-secret metadata (salt + verifier ciphertext) goes through
// a pluggable key/value store that defaults to localStorage in a browser and an
// in-memory Map under Node/tests — so the exact same crypto path runs in the
// test suite as in the tab. We deliberately do NOT use IndexedDB (the browser
// durable path is OPFS, in backends.js); the vault only parks a few tiny
// non-secret metadata strings.

const PBKDF2_ITERATIONS = 250_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BITS = 256;
const VAULT_META_VERSION = 1;

const subtle = globalThis.crypto.subtle;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function unb64(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ── pluggable metadata store (never holds a secret) ──
// Defaults to localStorage in a browser, an in-memory Map elsewhere. Swap it
// with configureVaultStorage({ getItem, setItem, removeItem }) to point at any
// synchronous string KV (e.g. a test double or an app-provided store).
function defaultMetaStore() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
  } catch { /* access can throw in sandboxed contexts */ }
  const mem = new Map();
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); },
  };
}

let metaStore = defaultMetaStore();

/** Point the vault's (non-secret) metadata at a custom synchronous KV store. */
export function configureVaultStorage(store) {
  if (store && typeof store.getItem === 'function' && typeof store.setItem === 'function') {
    metaStore = store;
  }
  return metaStore;
}

function metaKey(userId) { return `eo.vault:${userId}`; }

function loadMeta(userId) {
  let raw = null;
  try { raw = metaStore.getItem(metaKey(userId)); } catch { return null; }
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (obj.v !== VAULT_META_VERSION) return null;
    return {
      salt: unb64(obj.salt),
      verifierIv: unb64(obj.verifierIv),
      verifierCt: unb64(obj.verifierCt),
    };
  } catch {
    return null;
  }
}

function saveMeta(userId, salt, verifierIv, verifierCt) {
  try {
    metaStore.setItem(metaKey(userId), JSON.stringify({
      v: VAULT_META_VERSION,
      salt: b64(salt),
      verifierIv: b64(verifierIv),
      verifierCt: b64(verifierCt),
    }));
  } catch { /* storage disabled / over quota — resume just won't persist */ }
}

async function deriveKey(passphrase, salt) {
  const material = await subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    material,
    { name: 'AES-GCM', length: KEY_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

export class Vault {
  constructor() {
    this._key = null;
    this._userId = null;
    this._listeners = new Set();
  }

  isUnlocked() { return this._key !== null; }
  getUserId() { return this._userId; }
  hasMeta(userId) { return loadMeta(userId) !== null; }

  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _notify() {
    for (const fn of this._listeners) {
      try { fn({ unlocked: this.isUnlocked(), userId: this._userId }); }
      catch (e) { console.warn('[vault] listener error:', e); }
    }
  }

  /**
   * First-time setup for `userId`: mint a salt + verifier from `passphrase`,
   * persist the (non-secret) metadata, and unlock in memory. Subsequent
   * launches use unlock() instead.
   */
  async initialize(userId, passphrase) {
    const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const key = await deriveKey(passphrase, salt);

    const verifierIv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const verifierPlain = encoder.encode(`verify:${userId}`);
    const verifierCt = new Uint8Array(
      await subtle.encrypt({ name: 'AES-GCM', iv: verifierIv }, key, verifierPlain),
    );

    saveMeta(userId, salt, verifierIv, verifierCt);
    this._key = key;
    this._userId = userId;
    this._notify();
    return true;
  }

  /**
   * Unlock an existing vault. Returns true on success, false on a bad
   * passphrase or absent metadata. Fully offline — no network, no IndexedDB.
   */
  async unlock(userId, passphrase) {
    const meta = loadMeta(userId);
    if (!meta) return false;
    const candidate = await deriveKey(passphrase, meta.salt);
    try {
      const plain = await subtle.decrypt(
        { name: 'AES-GCM', iv: meta.verifierIv }, candidate, meta.verifierCt,
      );
      if (decoder.decode(new Uint8Array(plain)) !== `verify:${userId}`) return false;
      this._key = candidate;
      this._userId = userId;
      this._notify();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Open a vault, whichever state it's in: initialize() on first use for this
   * user, unlock() thereafter. The common entry point for the store.
   */
  async open(userId, passphrase) {
    if (this.hasMeta(userId)) return this.unlock(userId, passphrase);
    return this.initialize(userId, passphrase);
  }

  /** Lock: clear the key from memory, keep the ciphertext on disk. */
  lock() {
    this._key = null;
    this._userId = null;
    this._notify();
  }

  /** Wipe this user's vault metadata (and lock, if it's the active user). */
  wipe(userId) {
    try { metaStore.removeItem(metaKey(userId)); } catch { /* ignore */ }
    if (this._userId === userId) this.lock();
  }

  /** Encrypt arbitrary bytes → a single [iv(12)][ciphertext+tag] Uint8Array. */
  async encryptBytes(plaintext) {
    if (!this._key) throw new Error('Vault is locked');
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const ct = new Uint8Array(
      await subtle.encrypt({ name: 'AES-GCM', iv }, this._key, plaintext),
    );
    const out = new Uint8Array(iv.length + ct.length);
    out.set(iv, 0);
    out.set(ct, iv.length);
    return out;
  }

  /** Decrypt an [iv][ct] blob produced by encryptBytes. */
  async decryptBytes(blob) {
    if (!this._key) throw new Error('Vault is locked');
    const iv = blob.subarray(0, IV_BYTES);
    const ct = blob.subarray(IV_BYTES);
    const pt = await subtle.decrypt({ name: 'AES-GCM', iv }, this._key, ct);
    return new Uint8Array(pt);
  }

  async encryptJSON(obj) { return this.encryptBytes(encoder.encode(JSON.stringify(obj))); }
  async decryptJSON(blob) { return JSON.parse(decoder.decode(await this.decryptBytes(blob))); }
  async encryptString(str) { return this.encryptBytes(encoder.encode(str)); }
  async decryptString(blob) { return decoder.decode(await this.decryptBytes(blob)); }
}

// The process-wide singleton the store reaches for by default. Callers that
// want isolation (parallel tests, a second workspace) can `new Vault()`.
export const vault = new Vault();

/** List the users that have a vault on this device. */
export function listVaultUsers() {
  const ids = [];
  try {
    // localStorage-style enumeration when available; the in-memory fallback
    // exposes no keys, which is fine (nothing durable to list under Node).
    const len = typeof metaStore.length === 'number' ? metaStore.length : 0;
    for (let i = 0; i < len; i++) {
      const k = metaStore.key ? metaStore.key(i) : null;
      if (k && k.startsWith('eo.vault:')) ids.push(k.slice('eo.vault:'.length));
    }
  } catch { /* ignore */ }
  return ids;
}
