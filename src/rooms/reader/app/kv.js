// EO — reader-app support (split from rooms/reader/app.js, 2026-07 compliance pass:
// "no god module — no file over ~250 lines", docs/architecture.md). Same holon.
// Tiny IndexedDB kv (best-effort; absent in Node).
// ── tiny IndexedDB kv (best-effort; absent in Node) ──────────────────────────
export const idbOpen = () => new Promise((res, rej) => {
  const r = indexedDB.open('eo-reader-42', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
export const kv = async (mode, fn) => {
  if (typeof indexedDB === 'undefined') return null;
  const db = await idbOpen();
  try {
    return await new Promise((res, rej) => {
      const tx = db.transaction('kv', mode);
      const out = fn(tx.objectStore('kv'));
      tx.oncomplete = () => res(out && 'result' in out ? out.result : null);
      tx.onerror = () => rej(tx.error);
    });
  } finally { db.close(); }
};


