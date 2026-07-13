// EO: NUL(Void → Void, Tending) — original-audio byte store (OPFS binary)
// audio-store.js — keep the ORIGINAL audio bytes, as binary, in the Origin Private File System,
// keyed by content hash. The transcript, its edits and its redactions persist in the session
// snapshot (small plain JSON); the WAVEFORM ITSELF is large and binary, so it rests here instead —
// off the 400 ms structured-clone autosave path (serialize() would clone it every save) and out of
// the JSON entirely. This is what lets an audio source be PLAYED, and its redactions
// re-synthesised, after a reload: the blob: object URL the import made dies with the tab; these
// bytes do not. A signed-in user ALSO gets an encrypted copy on Matrix media (rooms/archive/vault),
// wired at the call site — this store is the local, always-available home.
//
// Browser-only (navigator.storage.getDirectory); degrades to an in-memory Map wherever OPFS is
// absent (Node, tests, private-mode quirks) so callers never branch on capability. Never throws —
// a persistence fault leaves the session copy playing and just reports `persisted:false`.

export const opfsAvailable = () =>
  typeof navigator !== 'undefined' && !!navigator.storage &&
  typeof navigator.storage.getDirectory === 'function';

// The OPFS sub-directory the original clips live in — separate from the web raw store and the
// chat keystore, so an audio eviction never touches page bytes or keys.
export const MEDIA_STORE_DIR = 'eoreader-media';

// A content hash → a safe OPFS filename (the `.bin` keeps it distinct from any manifest).
const mediaFileName = (key) => `${String(key).replace(/[^a-z0-9_.-]/gi, '_')}.bin`;

// createAudioStore({ dir }) → { putBytes, getBytes, has, remove, available }. Keys are content
// hashes; values are Uint8Array. Every method is async and never throws.
export const createAudioStore = ({ dir = MEDIA_STORE_DIR } = {}) => {
  const mem = new Map();   // key → Uint8Array: the fallback when OPFS is absent or a write failed
  let dirPromise = null;
  const directory = async () => {
    if (!opfsAvailable()) return null;
    if (!dirPromise) dirPromise = navigator.storage.getDirectory()
      .then((root) => root.getDirectoryHandle(dir, { create: true }))
      .catch(() => null);
    return dirPromise;
  };

  const putBytes = async (key, bytes) => {
    if (key == null || !bytes) return { key, bytes: 0, persisted: false };
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const d = await directory();
    let persisted = false;
    if (d) {
      try {
        const fh = await d.getFileHandle(mediaFileName(key), { create: true });
        const w = await fh.createWritable();
        await w.write(u8);
        await w.close();
        persisted = true;
      } catch { persisted = false; }
    }
    // Persisted to disk → drop the in-memory copy (get() re-reads on demand); otherwise hold it
    // for the session so playback still works where OPFS is unavailable.
    if (persisted) mem.delete(key);
    else mem.set(key, u8);
    return { key, bytes: u8.length, persisted };
  };

  const getBytes = async (key) => {
    if (key == null) return null;
    if (mem.has(key)) return mem.get(key);
    const d = await directory();
    if (!d) return null;
    try {
      const fh = await d.getFileHandle(mediaFileName(key));
      return new Uint8Array(await (await fh.getFile()).arrayBuffer());
    } catch { return null; }
  };

  const has = async (key) => (key != null) && (mem.has(key) || (await getBytes(key)) != null);

  const remove = async (key) => {
    if (key == null) return;
    mem.delete(key);
    const d = await directory();
    if (d) { try { await d.removeEntry(mediaFileName(key)); } catch { /* already gone */ } }
  };

  return { putBytes, getBytes, has, remove, available: opfsAvailable };
};
