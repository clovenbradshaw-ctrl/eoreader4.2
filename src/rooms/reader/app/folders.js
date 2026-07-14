// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines"). The body is
// VERBATIM from the closure; cross-section reach rides ctx (call-time), the core
// spine (state · emit · trail beats · client) is destructured once at install.
// folders — the source explorer's Drive
import { scopeSources } from '../scope-sources.js';
import { nowIso, nowMs } from './util.js';

export const installFolders = (appCtx) => {
  const { emit, logIt, state } = appCtx;
  // ── folders — the source explorer's Drive ────────────────────────────────────
  // The "Sources" surface is a file browser: a workspace owns a nested tree of folders and
  // every top-level source carries a `folderId` (null = the drive root). Folders are
  // workspace-scoped, so a workspace's whole library — the sources of EVERY topic in it —
  // organises into one navigable Drive that scales to a great deal of content, while
  // grounding stays topic-scoped (topicSources/scopeSources are untouched by any of this).
  const folderById = (id) => (id ? state.folders.find((f) => f.id === id) || null : null);
  const workspaceFolders = (workspaceId = null) => {
    const ws = workspaceId || state.activeWorkspaceId;
    return state.folders.filter((f) => f.workspaceId === ws);
  };
  const folderNew = (name = 'New folder', { parentId = null, workspaceId = null } = {}) => {
    const ws = workspaceId || state.activeWorkspaceId;
    const par = folderById(parentId);
    const f = {
      id: `F${++appCtx.fon}`,
      name: String(name || 'New folder').trim() || 'New folder',
      parentId: (par && par.workspaceId === ws) ? par.id : null,
      workspaceId: ws, created: nowIso(),
    };
    state.folders.push(f);
    logIt('open', `New folder — ${f.name}`);
    appCtx.persist(); emit('sources');
    return f;
  };
  const folderRename = (id, name) => {
    const f = folderById(id);
    if (f && name && String(name).trim()) { f.name = String(name).trim(); appCtx.persist(); emit('sources'); }
    return f;
  };
  // Is `maybeAncestor` at or above `id` in the tree? The cycle guard for folderMove — a folder
  // may never be filed inside itself or one of its own descendants.
  const folderIsAncestor = (maybeAncestor, id) => {
    let cur = folderById(id), guard = 0;
    while (cur && guard++ < 200) { if (cur.id === maybeAncestor) return true; cur = folderById(cur.parentId); }
    return false;
  };
  const folderMove = (id, newParentId = null) => {
    const f = folderById(id);
    if (!f) return null;
    if (newParentId) {
      const p = folderById(newParentId);
      // refuse a cross-workspace move or a cycle (into itself or one of its descendants)
      if (!p || p.workspaceId !== f.workspaceId || newParentId === id || folderIsAncestor(id, newParentId)) return f;
      f.parentId = newParentId;
    } else f.parentId = null;
    appCtx.persist(); emit('sources');
    return f;
  };
  const folderDelete = (id) => {
    const f = folderById(id);
    if (!f) return;
    // Non-destructive, Drive-like: child folders and the sources filed here rise to this
    // folder's parent rather than vanishing with it — nothing recorded is ever lost.
    for (const c of state.folders) if (c.parentId === id) c.parentId = f.parentId;
    for (const s of state.sources) if ((s.folderId || null) === id) s.folderId = f.parentId;
    state.folders = state.folders.filter((x) => x.id !== id);
    logIt('skip', `Deleted folder — ${f.name} · its contents rose to the parent`);
    appCtx.persist(); emit('sources');
  };
  // The chain of folders from the drive root down to `id`, for the explorer's breadcrumb.
  const folderPath = (id) => {
    const out = []; let cur = folderById(id), guard = 0;
    while (cur && guard++ < 200) { out.unshift(cur); cur = folderById(cur.parentId); }
    return out;
  };
  // File a source into a folder (null = the root). Only a top-level record is filed; asked to
  // move a followed sub-page, we move the SITE it hangs under, so a site and its pages stay together.
  const sourceMove = (id, folderId = null) => {
    const s = appCtx.sourceBySn(id);
    if (!s) return null;
    const root = s.parentSn ? (appCtx.sourceBySn(s.parentSn) || s) : s;
    if (folderId) {
      const f = folderById(folderId);
      if (!f || f.workspaceId !== state.activeWorkspaceId) return root;
      root.folderId = folderId;
    } else root.folderId = null;
    appCtx.persist(); emit('sources');
    return root;
  };
  // Star a source in the Drive (a workspace-scoped "keep" flag the explorer's Starred shelf reads).
  // `starred` is an underscore-free field, so serialize() keeps it across a reload (like folderId).
  const sourceStar = (id) => {
    const s = appCtx.sourceBySn(id);
    if (!s) return null;
    const root = s.parentSn ? (appCtx.sourceBySn(s.parentSn) || s) : s;
    root.starred = !root.starred;
    appCtx.persist(); emit('sources');
    return root;
  };
  // Stamp when a source was last engaged, so the explorer's Recent shelf + "Jump back in" order by
  // real recency rather than record order. openedAt is underscore-free → it persists.
  const sourceTouch = (id) => {
    const s = appCtx.sourceBySn(id);
    if (!s) return null;
    const root = s.parentSn ? (appCtx.sourceBySn(s.parentSn) || s) : s;
    root.openedAt = nowMs();
    appCtx.persist(); emit('sources');
    return root;
  };
  // Add an already-recorded Drive source into the ACTIVE topic's grounding corpus (idempotent).
  // Filing is workspace-wide; this is the deliberate move that makes a source count toward a topic's
  // answers — the explorer inspector's "Add to corpus" button.
  const sourceAddToTopic = (id) => {
    const s = appCtx.sourceBySn(id);
    if (!s) return null;
    const root = s.parentSn ? (appCtx.sourceBySn(s.parentSn) || s) : s;
    const t = appCtx.topic();
    if (t && !t.sourceSns.includes(root.sn)) { t.sourceSns.push(root.sn); appCtx.persist(); emit('sources'); }
    return root;
  };
  // The drive's file set: every top-level source referenced by a topic in the workspace,
  // deduped, in record order (sub-pages ride with their site, so they are filtered out here).
  const workspaceSources = (workspaceId = null) => {
    const ws = workspaceId || state.activeWorkspaceId;
    const ids = new Set();
    for (const t of state.topics) if (t.workspaceId === ws) for (const x of t.sourceSns) ids.add(x);
    return state.sources.filter((s) => ids.has(s.sn) && !s.parentSn);
  };

  Object.assign(appCtx, { folderById, folderDelete, folderMove, folderNew, folderPath, folderRename, sourceAddToTopic, sourceMove, sourceStar, sourceTouch, workspaceFolders, workspaceSources });
};
