// EO: CON·SYN·SEG(Field,Link → Network,Link,Field, Binding,Composing,Dissecting) — virtual folder filing layer
// workspace/index.js — the filing layer for the "everything workspace".
//
// A pure, DOM-free model of user-created FOLDERS and the membership of items
// (sources, chats, documents, imports, tables) inside them. Filing is VIRTUAL:
// an item is referenced by a stable `refKey`, and the same refKey may live in
// many folders at once ("a source in different places") — filing adds a
// membership, it never moves or copies the underlying item. The reader shell
// holds the live items; this module holds only the organization over them, and
// serializes to a single localStorage string.
//
// Everything here takes a plain workspace object and returns a NEW one — inputs
// are never mutated, so callers can diff, snapshot, or undo freely. Ids and
// timestamps are injected (browser passes real ones; tests pass fakes) so the
// model stays deterministic.

// A stable reference to a filable item. The id half may itself contain colons
// (a source is keyed by its url), so parsing splits on the FIRST colon only.
export const refKey = (kind, id) => `${kind}:${id}`;
export const parseRef = (key) => {
  const s = String(key || '');
  const i = s.indexOf(':');
  if (i < 0) return { kind: s, id: '' };
  return { kind: s.slice(0, i), id: s.slice(i + 1) };
};

export const emptyWorkspace = () => ({ folders: {}, members: {} });

// Defensive clone of the two containers we mutate on each op — folder records
// and member arrays are copied lazily by the individual operations below.
const clone = (ws) => ({
  folders: { ...(ws && ws.folders) },
  members: { ...(ws && ws.members) },
});

let _seq = 0;
// A folder id. Deterministic when `id` is supplied (tests, replay); otherwise a
// monotonic-ish token. `now` is only mixed in for a little spread — uniqueness
// rests on the counter, never on the clock.
const mkId = (id, now) => id || `f${(now || 0).toString(36)}${(_seq++).toString(36)}`;

const siblingsOf = (ws, parentId) =>
  Object.values(ws.folders).filter((f) => (f.parentId ?? null) === (parentId ?? null));

const nextOrder = (ws, parentId) =>
  siblingsOf(ws, parentId).reduce((m, f) => Math.max(m, f.order ?? 0), -1) + 1;

export const createFolder = (ws, { name, parentId = null, id, color = null, icon = null, now = 0 } = {}) => {
  const w = clone(ws);
  const fid = mkId(id, now);
  w.folders[fid] = {
    id: fid,
    name: String(name || 'Untitled folder'),
    parentId: parentId ?? null,
    color,
    icon,
    order: nextOrder(ws, parentId ?? null),
    createdAt: now,
    updatedAt: now,
  };
  return w;
};

export const renameFolder = (ws, id, name, now = 0) => {
  if (!ws.folders[id]) return ws;
  const w = clone(ws);
  w.folders[id] = { ...w.folders[id], name: String(name || w.folders[id].name), updatedAt: now };
  return w;
};

export const updateFolder = (ws, id, patch, now = 0) => {
  if (!ws.folders[id]) return ws;
  const w = clone(ws);
  w.folders[id] = { ...w.folders[id], ...patch, id, updatedAt: now };
  return w;
};

// Every folder strictly below `id` in the tree — used by delete and by the
// cycle-guard in moveFolder.
export const descendantIds = (ws, id) => {
  const out = [];
  const walk = (pid) => {
    for (const f of Object.values(ws.folders)) {
      if ((f.parentId ?? null) === pid) { out.push(f.id); walk(f.id); }
    }
  };
  walk(id);
  return out;
};

// Delete one folder. Its DIRECT children are re-parented to its own parent
// (the subtree lifts by one level rather than vanishing), and its membership
// list is dropped. Items filed only here become "unfiled"; items also filed
// elsewhere are untouched.
export const deleteFolder = (ws, id) => {
  if (!ws.folders[id]) return ws;
  const parentId = ws.folders[id].parentId ?? null;
  const w = clone(ws);
  delete w.folders[id];
  delete w.members[id];
  for (const f of Object.values(w.folders)) {
    if ((f.parentId ?? null) === id) w.folders[f.id] = { ...f, parentId };
  }
  return w;
};

// Re-home a folder under a new parent (null = top level). Rejects a move that
// would put a folder inside itself or one of its own descendants — that would
// orphan a cycle out of the tree.
export const moveFolder = (ws, id, newParentId = null, order = null, now = 0) => {
  if (!ws.folders[id]) return ws;
  const np = newParentId ?? null;
  if (np === id || descendantIds(ws, id).includes(np)) return ws;
  const w = clone(ws);
  w.folders[id] = {
    ...w.folders[id],
    parentId: np,
    order: order == null ? nextOrder(ws, np) : order,
    updatedAt: now,
  };
  return w;
};

const memberList = (ws, folderId) => ws.members[folderId] || [];

export const fileItem = (ws, key, folderId) => {
  if (!ws.folders[folderId]) return ws;
  const list = memberList(ws, folderId);
  if (list.includes(key)) return ws;
  const w = clone(ws);
  w.members[folderId] = [...list, key];
  return w;
};

export const unfileItem = (ws, key, folderId) => {
  const list = memberList(ws, folderId);
  if (!list.includes(key)) return ws;
  const w = clone(ws);
  const next = list.filter((k) => k !== key);
  if (next.length) w.members[folderId] = next;
  else delete w.members[folderId];
  return w;
};

export const moveItem = (ws, key, fromFolderId, toFolderId) =>
  fileItem(unfileItem(ws, key, fromFolderId), key, toFolderId);

// Every folder id that currently holds `key`.
export const foldersOf = (ws, key) =>
  Object.keys(ws.members).filter((fid) => ws.folders[fid] && memberList(ws, fid).includes(key));

export const itemsIn = (ws, folderId) => memberList(ws, folderId).slice();

// The refKeys in `allRefKeys` that live in no folder at all — the "Unfiled"
// smart view. Callers pass the full set of live item refKeys.
export const unfiled = (ws, allRefKeys) => {
  const filed = new Set();
  for (const fid of Object.keys(ws.members)) {
    if (ws.folders[fid]) for (const k of memberList(ws, fid)) filed.add(k);
  }
  return allRefKeys.filter((k) => !filed.has(k));
};

const bySortKey = (a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name).localeCompare(String(b.name));

// The folder forest as a nested, sorted structure:
//   [{ folder, depth, count, children:[…] }]
// `count` is the number of items filed DIRECTLY in that folder.
export const buildTree = (ws, parentId = null, depth = 0) =>
  siblingsOf(ws, parentId)
    .sort(bySortKey)
    .map((folder) => ({
      folder,
      depth,
      count: memberList(ws, folder.id).length,
      children: buildTree(ws, folder.id, depth + 1),
    }));

// A flat, depth-annotated pre-order walk of the tree — convenient for an
// indented single-column render (the left sidebar idiom).
export const flatTree = (ws) => {
  const out = [];
  const walk = (nodes) => { for (const n of nodes) { out.push(n); walk(n.children); } };
  walk(buildTree(ws));
  return out;
};

const VERSION = 1;

export const serialize = (ws) => JSON.stringify({ v: VERSION, folders: ws.folders, members: ws.members });

// Tolerant of anything: bad JSON, nulls, a partial or future record. Unknown
// shapes fall back to an empty workspace rather than throwing, so a corrupt
// localStorage value can never brick boot. Folder records are normalized so
// downstream code can assume every field is present.
export const deserialize = (raw) => {
  let obj = raw;
  if (typeof raw === 'string') { try { obj = JSON.parse(raw); } catch { return emptyWorkspace(); } }
  if (!obj || typeof obj !== 'object') return emptyWorkspace();
  const folders = {};
  const srcFolders = obj.folders && typeof obj.folders === 'object' ? obj.folders : {};
  for (const [id, f] of Object.entries(srcFolders)) {
    if (!f || typeof f !== 'object') continue;
    folders[id] = {
      id,
      name: String(f.name ?? 'Untitled folder'),
      parentId: f.parentId ?? null,
      color: f.color ?? null,
      icon: f.icon ?? null,
      order: Number.isFinite(f.order) ? f.order : 0,
      createdAt: f.createdAt ?? 0,
      updatedAt: f.updatedAt ?? 0,
    };
  }
  const members = {};
  const srcMembers = obj.members && typeof obj.members === 'object' ? obj.members : {};
  for (const [fid, list] of Object.entries(srcMembers)) {
    if (folders[fid] && Array.isArray(list)) {
      const seen = new Set();
      const clean = list.filter((k) => typeof k === 'string' && !seen.has(k) && seen.add(k));
      if (clean.length) members[fid] = clean;
    }
  }
  return { folders, members };
};
