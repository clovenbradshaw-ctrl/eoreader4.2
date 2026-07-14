// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines"). The body is
// VERBATIM from the closure; cross-section reach rides ctx (call-time), the core
// spine (state · emit · trail beats · client) is destructured once at install.
// workspaces — the top-level containers a topic tree lives in
import { nowIso } from './util.js';

export const installWorkspaces = (appCtx) => {
  const { emit, logIt, state } = appCtx;
  // ── workspaces — the top-level containers a topic tree lives in ──────────────
  // The accent palette a new workspace cycles through; the seed "Personal" takes the
  // app default. A shared workspace (future) is a Matrix room — `shared` is the hook
  // the switcher already reads, so the collaborative case slots in without a reshape.
  const WS_COLORS = ['#6D5EF5', '#2563EB', '#0F766E', '#B45309', '#A91D1D', '#BE185D', '#15803D'];
  const activeWorkspace = () => state.workspaces.find((w) => w.id === state.activeWorkspaceId) || state.workspaces[0] || null;
  const workspaceNew = (name = 'New workspace', { silent = false, shared = false } = {}) => {
    const w = { id: `ws${++appCtx.wn}`, name: String(name || 'New workspace'), color: WS_COLORS[state.workspaces.length % WS_COLORS.length], shared: !!shared, roomId: null, syncToMatrix: false, created: nowIso() };
    state.workspaces.push(w);
    state.activeWorkspaceId = w.id;
    appCtx.topicNew('New topic', { silent: true, workspaceId: w.id });   // a workspace always opens onto a topic
    if (!silent) { logIt('open', `New workspace — ${name}`); appCtx.persist(); emit('topics'); }
    return w;
  };
  const setWorkspace = (id) => {
    const w = state.workspaces.find((x) => x.id === id);
    if (!w || state.activeWorkspaceId === id) return;
    state.activeWorkspaceId = id;
    // Land on a topic that actually lives in this workspace (make one if it is empty).
    const first = state.topics.find((t) => t.workspaceId === id);
    state.activeTopicId = first ? first.id : appCtx.topicNew('New topic', { silent: true, workspaceId: id }).id;
    appCtx.deepWake(); appCtx.persist(); emit('topics');
  };
  const workspaceRename = (id, name) => { const w = state.workspaces.find((x) => x.id === id); if (w && name) { w.name = String(name); appCtx.persist(); emit('topics'); } };
  // Bind a workspace to a Matrix room — this is what makes it SHARED and invitable. The
  // engine only records the pairing (roomId + a members hint); the actual room create /
  // invite and the encrypted, hash-chained sync live in boot's `spaces` membrane
  // (rooms/archive/room-vault), so app state stays network-free. `roomId: null` unshares.
  const workspaceBindRoom = (id, { roomId = null, members = null } = {}) => {
    const w = state.workspaces.find((x) => x.id === id);
    if (!w) return null;
    w.roomId = roomId || null;
    w.shared = !!roomId;
    if (Array.isArray(members)) w.members = members.slice();
    appCtx.persist(); emit('topics');
    return w;
  };
  const workspaceByRoom = (roomId) => state.workspaces.find((w) => w.roomId === roomId) || null;
  // The "sync to Matrix" opt-in for a workspace — when on, its content is mirrored into
  // the shared, room-encrypted blockchain (boot's `spaces.sync`, rooms/archive/space-sync).
  // The engine only records the flag; the actual encrypt-and-publish lives in boot.
  const workspaceSetSync = (id, on) => { const w = state.workspaces.find((x) => x.id === id); if (!w) return null; w.syncToMatrix = !!on; appCtx.persist(); emit('topics'); return w; };
  const workspaceDelete = (id) => {
    if (state.workspaces.length <= 1) return;   // the shell always keeps one workspace
    const idx = state.workspaces.findIndex((w) => w.id === id);
    if (idx < 0) return;
    state.workspaces = state.workspaces.filter((w) => w.id !== id);
    // Re-home this workspace's topics into the previous sibling, flattened to its root,
    // so nothing filed here is lost when the container goes.
    const dest = state.workspaces[Math.max(0, idx - 1)] || state.workspaces[0];
    for (const t of state.topics) if (t.workspaceId === id) { t.workspaceId = dest.id; t.parentId = null; }
    // Re-home this workspace's Drive folders into the destination too, so the sources filed in
    // them keep a valid folderId and land in the same folder structure they came with.
    for (const f of state.folders) if (f.workspaceId === id) f.workspaceId = dest.id;
    if (state.activeWorkspaceId === id) {
      state.activeWorkspaceId = dest.id;
      const f = state.topics.find((t) => t.workspaceId === dest.id);
      state.activeTopicId = f ? f.id : appCtx.topicNew('New topic', { silent: true, workspaceId: dest.id }).id;
    }
    appCtx.persist(); emit('topics');
  };

  Object.assign(appCtx, { WS_COLORS, activeWorkspace, setWorkspace, workspaceBindRoom, workspaceByRoom, workspaceDelete, workspaceNew, workspaceRename, workspaceSetSync });
};
