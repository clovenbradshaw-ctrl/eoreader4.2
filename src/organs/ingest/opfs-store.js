// EO: NUL(Void → Void, Tending) — raw web-content store (OPFS binary)
// The raw web-content store — keep it ALL, as binary, in the Origin Private File System.
// (the user's directive: "save it all as binary into opfs, but we also must READ it on ingestion")
//
// A fetched page is admitted as a parsed prose doc (websource.js), but the parse keeps only what
// it could read. This store retains the FULL original bytes, uncapped, keyed by content hash, so
// nothing a site gave us is thrown away: a later turn can re-read the whole page without a refetch,
// and the provenance is the bytes themselves. Browser-only (navigator.storage.getDirectory);
// degrades to an in-memory Map where OPFS is absent (Node, tests, private-mode quirks), so callers
// never branch on capability — they always get a working put/get.
//
// Alongside the bytes the store keeps a small POINTER MANIFEST — one entry per page: its url, the
// OPFS filename the bytes live in, the content hash, and the byte count. That manifest is the
// export half of the directive: "on export, don't include the full text — pointers to it on the
// web." A session export references each imported page through this manifest (url + opfs file)
// instead of embedding the whole page, and the bytes stay parked in OPFS for re-reading. The
// manifest is itself persisted to OPFS, so the pointers survive a reload even though the in-memory
// byte cache does not.

const enc = () => new TextEncoder();
const dec = () => new TextDecoder();

export const opfsAvailable = () =>
  typeof navigator !== 'undefined' && !!navigator.storage &&
  typeof navigator.storage.getDirectory === 'function';

// The default OPFS sub-directory the raw store lives in — exported so an export pointer can name
// the exact location of the cached bytes (dir + file).
export const RAW_STORE_DIR = 'eoreader-web';

// The reserved manifest filename (not a `.bin`, so it never collides with a content-hash key).
const MANIFEST_FILE = '__pointers__.json';

// OPFS file names are restricted; a content hash ("fnv:ab12…") is sanitised to a safe filename.
// Exported so a pointer can reference the on-disk file, not just the hash.
export const rawFileName = (key) => `${String(key).replace(/[^a-z0-9_.-]/gi, '_')}.bin`;

// createRawStore({ dir }) → { put, get, has, list, available }. Keys are content hashes (or any
// string); values are text persisted as UTF-8 bytes (binary). Every method is async and never
// throws — an OPFS fault falls back to the in-memory cache so admission proceeds.
export const createRawStore = ({ dir = RAW_STORE_DIR } = {}) => {
  const mem  = new Map();          // key → bytes: write-through cache + the fallback when OPFS is absent
  const meta = new Map();          // key → pointer: { key, content_hash, dir, file, bytes, url, title, fetched_at, persisted }
  let dirPromise = null;
  let manifestLoaded = false;
  const directory = async () => {
    if (!opfsAvailable()) return null;
    if (!dirPromise) dirPromise = navigator.storage.getDirectory()
      .then((root) => root.getDirectoryHandle(dir, { create: true }))
      .catch(() => null);
    return dirPromise;
  };

  // Load the persisted pointer manifest once. Best-effort: absent or malformed, the manifest is
  // simply empty. This is what lets a fresh page export pointers to pages fetched in a past
  // session — the bytes are still on disk, and the manifest names them.
  const loadManifest = async () => {
    if (manifestLoaded) return;
    manifestLoaded = true;
    const d = await directory();
    if (!d) return;
    try {
      const fh  = await d.getFileHandle(MANIFEST_FILE);
      const arr = JSON.parse(dec().decode(new Uint8Array(await (await fh.getFile()).arrayBuffer())));
      if (Array.isArray(arr)) for (const e of arr) if (e && e.key && !meta.has(e.key)) meta.set(e.key, e);
    } catch { /* no manifest yet — nothing fetched, or never persisted */ }
  };

  // Persist the manifest beside the bytes. Best-effort; a manifest fault never fails a put.
  const writeManifest = async (d) => {
    if (!d) return;
    try {
      const fh = await d.getFileHandle(MANIFEST_FILE, { create: true });
      const w  = await fh.createWritable();
      await w.write(enc().encode(JSON.stringify([...meta.values()])));
      await w.close();
    } catch { /* best-effort */ }
  };

  // put(key, text, info?) — persist the full text as binary, and record/refresh the page's
  // pointer. `info` carries the page identity an export references ({ url, final_url, title,
  // fetched_at }); it is metadata only, never the bytes.
  const put = async (key, text, info = {}) => {
    if (key == null) return { key, bytes: 0, persisted: false };
    await loadManifest();
    const bytes = enc().encode(String(text ?? ''));
    mem.set(key, bytes);
    const d = await directory();
    let persisted = false;
    if (d) {
      try {
        const fh = await d.getFileHandle(rawFileName(key), { create: true });
        const w  = await fh.createWritable();
        await w.write(bytes);
        await w.close();
        persisted = true;
      } catch { persisted = false; }
    }
    const prev = meta.get(key) || {};
    meta.set(key, {
      key, content_hash: key, dir, file: rawFileName(key), bytes: bytes.length, persisted,
      url:       info.url       ?? prev.url       ?? null,
      final_url: info.final_url ?? prev.final_url ?? null,
      title:     info.title     ?? prev.title     ?? null,
      fetched_at: info.fetched_at ?? prev.fetched_at ?? null,
    });
    if (d) await writeManifest(d);
    return { key, bytes: bytes.length, persisted };
  };

  const get = async (key) => {
    if (key == null) return null;
    if (mem.has(key)) return dec().decode(mem.get(key));
    const d = await directory();
    if (!d) return null;
    try {
      const fh  = await d.getFileHandle(rawFileName(key));
      const buf = new Uint8Array(await (await fh.getFile()).arrayBuffer());
      mem.set(key, buf);
      return dec().decode(buf);
    } catch { return null; }
  };

  const has = async (key) => (key != null) && (mem.has(key) || (await get(key)) != null);

  // list() → the pointer manifest: one entry per stored page, METADATA ONLY (url + opfs file +
  // hash + byte count), never the page text. This is what a session export references in place of
  // the full imported content.
  const list = async () => {
    await loadManifest();
    return [...meta.values()];
  };

  return { put, get, has, list, available: opfsAvailable };
};
