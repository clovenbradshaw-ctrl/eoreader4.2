// EO: NUL(Void → Void, Tending) — sync anchor JSONL store (OPFS binary)
// Keep a sync run's anchor JSONL (core/sync/anchors.js) in the Origin Private File System,
// keyed by content hash — modeled directly on audio-store.js's createAudioStore, same
// resolveOpfsDir helper, same never-throws/in-memory-fallback discipline. The anchor stream
// can be sizeable (one line per matched token pair) and is a derived artifact, not something
// that needs to ride the 400ms structured-clone autosave path with the rest of the session —
// exactly the reasoning audio-store.js gives for keeping media bytes off it too. The standing
// fold record (app/standing.js, kind:'sync') keeps only a small summary plus `anchorRef`,
// the same shape `source.audioRef` already uses to point at its own OPFS-held bytes.
//
// Browser-only (navigator.storage.getDirectory); degrades to an in-memory Map wherever OPFS
// is absent (Node, tests, private-mode quirks) so callers never branch on capability.

import { resolveOpfsDir } from '../../store/index.js';

export const opfsAvailable = () =>
  typeof navigator !== 'undefined' && !!navigator.storage &&
  typeof navigator.storage.getDirectory === 'function';

export const ANCHOR_STORE_DIR = 'eoreader-anchors';

const anchorFileName = (key) => `${String(key).replace(/[^a-z0-9_.-]/gi, '_')}.jsonl`;

// createAnchorStore({ dir }) → { putBytes, getBytes, putText, getText, has, remove, available }.
// Keys are content hashes; putBytes/getBytes take Uint8Array (parity with audio-store.js);
// putText/getText are the convenience most callers actually want, since an anchor stream is
// always UTF-8 JSONL text, never binary media.
export const createAnchorStore = ({ dir = ANCHOR_STORE_DIR } = {}) => {
  const mem = new Map();   // key → Uint8Array: the fallback when OPFS is absent or a write failed
  let dirPromise = null;
  const directory = async () => {
    if (!dirPromise) dirPromise = resolveOpfsDir(dir);
    return dirPromise;
  };

  const putBytes = async (key, bytes) => {
    if (key == null || !bytes) return { key, bytes: 0, persisted: false };
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const d = await directory();
    let persisted = false;
    if (d) {
      try {
        const fh = await d.getFileHandle(anchorFileName(key), { create: true });
        const w = await fh.createWritable();
        await w.write(u8);
        await w.close();
        persisted = true;
      } catch { persisted = false; }
    }
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
      const fh = await d.getFileHandle(anchorFileName(key));
      return new Uint8Array(await (await fh.getFile()).arrayBuffer());
    } catch { return null; }
  };

  const putText = async (key, text) => putBytes(key, new TextEncoder().encode(String(text || '')));
  const getText = async (key) => {
    const bytes = await getBytes(key);
    return bytes ? new TextDecoder().decode(bytes) : null;
  };

  const has = async (key) => (key != null) && (mem.has(key) || (await getBytes(key)) != null);

  const remove = async (key) => {
    if (key == null) return;
    mem.delete(key);
    const d = await directory();
    if (d) { try { await d.removeEntry(anchorFileName(key)); } catch { /* already gone */ } }
  };

  return { putBytes, getBytes, putText, getText, has, remove, available: opfsAvailable };
};
