// EO: CON·INS(Field → Link, Binding,Making) — OPFS persistence for the chat keystore
// chat/opfs-store.js — a small, never-throwing key/value store backed by the Origin
// Private File System (OPFS). Everything the E2EE layer must survive a reload —
// the Olm account pickle, every Olm/Megolm session pickle, the device id, and the
// sync token — is written here as an opaque string in the app's own private,
// origin-scoped directory. OPFS was the deliberate choice over IndexedDB: the keys
// are pickle strings we own the serialization of, so a plain file per key is the
// simplest durable home for them, and OPFS keeps them off the structured-clone
// object store the rest of the web platform can enumerate.
//
// Injectable and offline-safe, like the rest of the tree. `navigator` comes in as an
// option (the browser passes the real one; tests pass a fake or nothing). When OPFS
// is unavailable — Node, private mode, an old browser — the store transparently falls
// back to an in-memory Map, so the crypto layer runs identically under test; it just
// does not persist. Nothing at import time touches disk. Every method returns a
// promise and NEVER rejects: a fault degrades to null / a no-op, never a throw, so a
// storage hiccup can never wedge the chat session.

// A key ('crypto/account', 'megolm/in/<id>', 'sync/token') maps to ONE flat file in
// the store's directory. Slashes and anything filesystem-hostile are percent-encoded
// so the whole keyspace lives in a single directory with no nesting to walk.
const fileNameFor = (key) => encodeURIComponent(String(key)).replace(/\*/g, '%2A');
const keyForFileName = (name) => { try { return decodeURIComponent(name); } catch { return name; } };

// The in-memory fallback — a Map behind the same async surface. Used verbatim under
// test and whenever OPFS is missing; the caller cannot tell the difference beyond
// `persistent` being false.
const memoryBackend = () => {
  const m = new Map();
  return {
    persistent: false,
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async set(k, v) { m.set(k, String(v)); },
    async del(k) { m.delete(k); },
    async keys() { return [...m.keys()]; },
    async clear() { m.clear(); },
  };
};

// The OPFS backend — one file per key under a named subdirectory of the origin's
// private root. Reads and writes swallow their own faults (a mid-write crash leaves
// the previous file; a missing file reads as null), so the surface above never sees
// a rejection.
const opfsBackend = async (dirHandle) => ({
  persistent: true,
  async get(k) {
    try {
      const fh = await dirHandle.getFileHandle(fileNameFor(k));
      const file = await fh.getFile();
      return await file.text();
    } catch { return null; }   // NotFoundError → absent → null
  },
  async set(k, v) {
    try {
      const fh = await dirHandle.getFileHandle(fileNameFor(k), { create: true });
      const w = await fh.createWritable();
      await w.write(String(v));
      await w.close();
    } catch { /* quota / lock — the value simply is not persisted this round */ }
  },
  async del(k) {
    try { await dirHandle.removeEntry(fileNameFor(k)); } catch { /* already gone */ }
  },
  async keys() {
    const out = [];
    try { for await (const name of dirHandle.keys()) out.push(keyForFileName(name)); }
    catch { /* directory vanished — treat as empty */ }
    return out;
  },
  async clear() {
    for (const k of await this.keys()) await this.del(k);
  },
});

// Resolve the OPFS directory handle for `root` under the origin's private root, or
// null when OPFS is not offered by this environment. Best-effort: any fault (private
// mode denying storage, an ancient browser) resolves to null and the caller falls
// back to memory.
const resolveOpfsDir = async (nav, root) => {
  const storage = nav && nav.storage;
  if (!storage || typeof storage.getDirectory !== 'function') return null;
  try {
    const rootDir = await storage.getDirectory();
    return await rootDir.getDirectoryHandle(String(root), { create: true });
  } catch { return null; }
};

// createOpfsStore({ navigator, root, memory }) → a promise for the store. Pass
// `memory: true` to force the in-memory backend regardless of OPFS availability
// (tests, or an explicit ephemeral session). `root` names the private subdirectory
// (default 'eo-chat'), so multiple features can share the origin without collision.
export const createOpfsStore = async ({
  navigator: nav = (typeof navigator !== 'undefined' ? navigator : null),
  root = 'eo-chat',
  memory = false,
} = {}) => {
  let backend = null;
  if (!memory) {
    const dir = await resolveOpfsDir(nav, root);
    if (dir) { try { backend = await opfsBackend(dir); } catch { backend = null; } }
  }
  if (!backend) backend = memoryBackend();

  // Strings are the native currency (pickles); JSON helpers ride on top for the
  // structured bookkeeping (device maps, the sync token record).
  const getJson = async (k) => {
    const raw = await backend.get(k);
    if (raw == null) return null;
    try { return JSON.parse(raw); } catch { return null; }
  };
  const setJson = (k, obj) => backend.set(k, JSON.stringify(obj));

  return Object.freeze({
    persistent: backend.persistent,
    get: (k) => backend.get(k),
    set: (k, v) => backend.set(k, v),
    del: (k) => backend.del(k),
    keys: () => backend.keys(),
    clear: () => backend.clear(),
    getJson,
    setJson,
  });
};
