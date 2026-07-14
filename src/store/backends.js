// EO: NUL·INS·SEG(Void → Entity,Field, Making,Clearing) — byte-sink backends
//
// A backend is the raw, environment-specific place a room's ciphertext lives.
// The EventStore (event-store.js) owns the FORMAT (magic, header, encrypted
// chunks); a backend only has to hold and grow an opaque byte file:
//
//   backend.read()          → Promise<Uint8Array | null>   whole file, or null if absent
//   backend.append(bytes)   → Promise<void>                append to the end (create if new)
//   backend.clear()         → Promise<void>                delete the file
//   backend.size()          → Promise<number>              current byte length (0 if absent)
//
// Two backends ship here:
//   · memoryBackend()  — an in-RAM byte file. Always available (Node + browser);
//                        the durable-substrate default under tests and the fallback
//                        when OPFS is missing or the vault is locked.
//   · opfsBackend()    — the browser's Origin Private File System. This is the
//                        durable browser path, chosen DELIBERATELY over IndexedDB:
//                        OPFS is an append-friendly real file, no object-store
//                        ceremony.
//
// Nothing here decrypts or parses — a backend never sees a key.

/** In-memory byte file. Survives only as long as the process/tab holds it. */
export function memoryBackend() {
  let buf = null; // Uint8Array | null
  return {
    kind: 'memory',
    async read() { return buf; },
    async append(bytes) {
      if (!bytes || bytes.length === 0) return;
      if (!buf) { buf = bytes.slice(); return; }
      const next = new Uint8Array(buf.length + bytes.length);
      next.set(buf, 0);
      next.set(bytes, buf.length);
      buf = next;
    },
    async clear() { buf = null; },
    async size() { return buf ? buf.length : 0; },
  };
}

/** True when the Origin Private File System is reachable in this environment. */
export async function opfsAvailable() {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) return false;
    const root = await navigator.storage.getDirectory();
    return !!root;
  } catch {
    return false;
  }
}

/**
 * Ask the browser to make this origin's storage persistent so OPFS is exempt
 * from best-effort eviction under storage pressure. Idempotent, best-effort,
 * never throws. Returns { supported, persisted }.
 */
export async function requestPersistentStorage() {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
      return { supported: false, persisted: false };
    }
    const already = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    if (already) return { supported: true, persisted: true };
    const granted = await navigator.storage.persist();
    return { supported: true, persisted: !!granted };
  } catch (e) {
    return { supported: false, persisted: false, error: e?.message || String(e) };
  }
}

/**
 * OPFS-backed byte file named `fileName`. Returns null when OPFS is unavailable
 * so the caller can fall back to memoryBackend() without a try/catch dance.
 */
export async function opfsBackend(fileName) {
  if (!(await opfsAvailable())) return null;
  const dir = await navigator.storage.getDirectory();

  const getHandle = (create) => dir.getFileHandle(fileName, { create });

  return {
    kind: 'opfs',
    fileName,
    async read() {
      let handle;
      try { handle = await getHandle(false); } catch { return null; }
      const file = await handle.getFile();
      if (file.size === 0) return new Uint8Array(0);
      return new Uint8Array(await file.arrayBuffer());
    },
    async append(bytes) {
      if (!bytes || bytes.length === 0) return;
      const handle = await getHandle(true);
      const file = await handle.getFile();
      const writable = await handle.createWritable({ keepExistingData: true });
      await writable.seek(file.size);
      await writable.write(bytes);
      await writable.close();
    },
    async clear() {
      try { await dir.removeEntry(fileName); } catch { /* already gone */ }
    },
    async size() {
      let handle;
      try { handle = await getHandle(false); } catch { return 0; }
      return (await handle.getFile()).size;
    },
  };
}

/**
 * Pick the best available backend for a file: OPFS when the browser offers it,
 * an in-memory file otherwise. The one call the store makes when a caller does
 * not inject a specific backend.
 */
export async function autoBackend(fileName) {
  return (await opfsBackend(fileName)) || memoryBackend();
}
