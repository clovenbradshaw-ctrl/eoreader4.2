// EO: CON(Field → Link,Network, Binding,Tracing) — content-addressed checkpoint ledger
// archive/checkpoints.js — the anti-spam, always-retrievable half of the archive
// path. Archiving a source is a CHECKPOINT, not a stream: we derive the archive.org
// identifier from a hash of the exact bytes, so
//
//   · the same content always maps to the SAME identifier — re-archiving unchanged
//     content overwrites that one item in place (an S3 PUT to the same bucket/key)
//     instead of minting a fresh item every time, so we never spam archive.org; and
//   · the identifier is RECOMPUTABLE from the content alone — hash the bytes, prefix
//     them, and you have the details URL, even on another device with an empty
//     ledger. "It won't be hard to get the code later" is a property of the id, not
//     of any server we have to keep asking.
//
// Alongside the addressing scheme, a small local ledger keeps the checkpoints a user
// has made (identifier, url, title, time) so the surface can list and re-open them
// without a round-trip. Pure and DOM-free; storage is injected (browser localStorage
// by default, an in-memory shim in Node/tests). Nothing here throws or hits network.

import { webContentHash } from '../../organs/ingest/index.js';

// The identifier namespace. A checkpoint lands at archive.org/details/eo-genome-<h>.
export const CHECKPOINT_PREFIX = 'eo-genome';
const LEDGER_KEY = 'eo_archive_checkpoints';
const LEDGER_CAP = 200;

// The content hash of the exact bytes to archive — the same FNV fixity the source
// registry and archive pins use (organs/ingest/websource.webContentHash), so a
// checkpoint's address is consistent with the rest of the record's provenance.
export const contentHash = (text) => webContentHash(text);

// A stable, archive.org-legal identifier from a hash (or straight from text). Strips
// the `fnv:` prefix, keeps 16 hex digits, and namespaces them. Deterministic: same
// input → same id, forever.
export const checkpointId = (hashOrText, { prefix = CHECKPOINT_PREFIX, isHash = false } = {}) => {
  const h = isHash ? String(hashOrText || '') : webContentHash(hashOrText);
  const digits = h.replace(/^[^:]*:/, '').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 16).padEnd(16, '0');
  return `${prefix}-${digits}`;
};

// The permanent details URL for an identifier — the thing you keep.
export const checkpointUrl = (identifier) => `https://archive.org/details/${identifier}`;

const memoryStore = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
};
const safeStore = (storage) => {
  if (storage) return storage;
  if (typeof localStorage !== 'undefined') return localStorage;
  return memoryStore();
};

const nowIso = (now) => {
  try { return new Date(typeof now === 'function' ? now() : Date.now()).toISOString(); }
  catch { return null; }
};

// createCheckpointLog({ storage, now }) → the local index of checkpoints made. Every
// op is defensive: a corrupt or absent store yields an empty ledger, never a throw.
export const createCheckpointLog = ({ storage = null, now = null } = {}) => {
  const store = safeStore(storage);

  const read = () => {
    let raw = null;
    try { raw = store.getItem(LEDGER_KEY); } catch { return []; }
    if (!raw) return [];
    try {
      const obj = JSON.parse(raw);
      const arr = Array.isArray(obj) ? obj : (obj && Array.isArray(obj.items) ? obj.items : []);
      return arr.filter((e) => e && typeof e === 'object' && e.identifier);
    } catch { return []; }
  };
  const write = (arr) => {
    try { store.setItem(LEDGER_KEY, JSON.stringify({ v: 1, items: arr.slice(0, LEDGER_CAP) })); }
    catch { /* private mode / quota — the in-memory result still returns */ }
  };

  // Newest first — the order the surface lists them in.
  const list = () => read().sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  const find = (hash) => read().find((e) => e.hash === hash) || null;
  const findById = (identifier) => read().find((e) => e.identifier === identifier) || null;
  const has = (hash) => !!find(hash);

  // Record a checkpoint, keyed by identifier (idempotent: re-recording the same
  // checkpoint updates it in place rather than piling up duplicates).
  const record = (entry) => {
    if (!entry || !entry.identifier) return entry;
    const e = { at: nowIso(now), ...entry };
    const rest = read().filter((x) => x.identifier !== e.identifier && x.hash !== e.hash);
    write([e, ...rest]);
    return e;
  };
  const remove = (identifier) => { write(read().filter((e) => e.identifier !== identifier)); };
  const clear = () => { try { store.removeItem(LEDGER_KEY); } catch { /* ignore */ } };

  return Object.freeze({ list, find, findById, has, record, remove, clear });
};
