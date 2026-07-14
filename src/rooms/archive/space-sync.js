// EO: INS·CON(Network,Field → Link, Making,Binding) — silent, opt-in "sync to Matrix"
// archive/space-sync.js — "Sync this workspace to Matrix?" as one quiet, per-workspace
// setting, never a nag. When it is ON for a workspace, that workspace's content — every
// source recorded under its topics — is mirrored into the SHARED, room-encrypted
// blockchain (archive/room-vault, via boot's `spaces`): each source is encrypted, its
// ciphertext uploaded as binary to the Matrix media repo, and a block published to the
// workspace's room, so the whole workspace is backed up to Matrix and readable by exactly
// the room's members. Turning it on for a workspace that isn't shared yet opens its room
// first (solo — invite people later), so "sync to Matrix" also means "make this a Matrix
// workspace."
//
// It borrows the genome-autosave discipline (archive/autosave.js) so automatic syncing
// never spams the homeserver:
//   · CONTENT-ADDRESSED — a source is addressed by the SHA-256 of its bytes, so an
//     unchanged source is never re-uploaded (a per-session sent-set here, plus the room
//     vault's own content dedup once a block folds, both short-circuit it).
//   · DEBOUNCED — a burst of record changes collapses into one sync pass once it settles.
//
// Default OFF per workspace. It never turns itself on, never prompts, and does nothing
// until the user opts in. Injectable now/debounce; DOM-free; non-throwing throughout.
import { sha256Hex } from './file-crypto.js';

const DEFAULT_DEBOUNCE_MS = 20_000;
const nowIso = (now) => { try { return new Date(typeof now === 'function' ? now() : Date.now()).toISOString(); } catch { return null; } };

// The sources that belong to a workspace: every source referenced by any of its topics
// (sources are scoped to topics, topics to a workspace). Deduped by sn, order-stable.
export const workspaceSources = (app, workspaceId) => {
  if (!app || !app.state) return [];
  const topics = (app.state.topics || []).filter((t) => (t.workspaceId ?? null) === workspaceId);
  const sns = [];
  const seen = new Set();
  for (const t of topics) for (const sn of (t.sourceSns || [])) if (!seen.has(sn)) { seen.add(sn); sns.push(sn); }
  return sns.map((sn) => (app.sourceBySn ? app.sourceBySn(sn) : null)).filter(Boolean);
};

// createSpaceSync({ app, spaces, now, debounceMs }) → the "sync to Matrix" controller the
// boot bridge exposes as window.EO.spaces.sync. `spaces` is boot's spaces membrane
// (shareWorkspace / save). Reactive like the reader app: subscribe once, re-render on emit.
export const createSpaceSync = ({ app = null, spaces = null, now = null, debounceMs = DEFAULT_DEBOUNCE_MS } = {}) => {
  const state = { status: 'idle', error: null, byWorkspace: {} };   // byWorkspace[id] = { enabled, synced, pending, lastAt, error }
  const subs = new Set();
  const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
  const emit = () => { for (const fn of subs) { try { fn(state); } catch { /* surface's problem */ } } };
  const wsState = (id) => (state.byWorkspace[id] = state.byWorkspace[id] || { enabled: false, synced: 0, pending: false, lastAt: null, error: null });
  const setWs = (id, patch) => { Object.assign(wsState(id), patch); emit(); };

  const sent = new Map();     // wsId -> Set(contentHash) already pushed this session
  let timer = null;

  const workspaceById = (id) => (app && app.state ? app.state.workspaces.find((w) => w.id === id) : null);
  const enabledFor = (id) => { const w = workspaceById(id); return !!(w && w.syncToMatrix); };

  // Mirror one workspace's sources into its room's shared vault. Non-throwing; returns a
  // tally { ok, saved, deduped, total, skipped? }. Opens the room first if not shared.
  const syncNow = async (workspaceId) => {
    const ws = workspaceById(workspaceId);
    if (!ws) return { ok: false, error: 'no such workspace' };
    if (!spaces) return { ok: false, error: 'no spaces' };
    if (!ws.roomId) {
      const shared = await spaces.shareWorkspace(workspaceId, []);   // open a room (solo); invite later
      if (!shared.ok) { setWs(workspaceId, { error: shared.error || 'could not open room' }); return shared; }
    }
    const seen = sent.get(workspaceId) || new Set();
    const srcs = workspaceSources(app, workspaceId);
    let saved = 0, deduped = 0;
    setWs(workspaceId, { pending: true, error: null });
    for (const s of srcs) {
      const text = String(s.text || '');
      if (!text.trim()) continue;
      let h;
      try { h = await sha256Hex(new TextEncoder().encode(text)); } catch { h = null; }
      if (h && seen.has(h)) { deduped++; continue; }
      const r = await spaces.save(workspaceId, text, { name: s.title || s.reg || s.sn, mime: 'text/plain' });
      if (r && r.ok) { if (h) seen.add(h); if (r.deduped) deduped++; else saved++; }
      else setWs(workspaceId, { error: (r && r.error) || 'save failed' });
    }
    sent.set(workspaceId, seen);
    setWs(workspaceId, { pending: false, synced: srcs.length, lastAt: nowIso(now) });
    return { ok: true, saved, deduped, total: srcs.length };
  };

  // Sync every workspace whose flag is on. Used by the debounced scheduler.
  const syncAllEnabled = async () => {
    const ids = (app && app.state ? app.state.workspaces : []).filter((w) => w.syncToMatrix).map((w) => w.id);
    for (const id of ids) { try { await syncNow(id); } catch { /* keep going */ } }
    return { ok: true, count: ids.length };
  };

  // Flip the per-workspace opt-in. Turning it ON syncs that workspace right away (the one
  // time the user asked), then future record changes are debounced. Returns the sync tally.
  const setEnabled = async (workspaceId, on) => {
    if (app && app.workspaceSetSync) app.workspaceSetSync(workspaceId, !!on);
    setWs(workspaceId, { enabled: !!on });
    if (!on) return { ok: true, disabled: true };
    return syncNow(workspaceId);
  };
  const isEnabled = (workspaceId) => enabledFor(workspaceId);

  // Coalesce a burst of record changes into one sync pass once things settle. No-op in an
  // environment without timers (tests drive syncNow / syncAllEnabled directly).
  const schedule = () => {
    if (typeof setTimeout === 'undefined') return;
    const anyOn = (app && app.state ? app.state.workspaces : []).some((w) => w.syncToMatrix);
    if (!anyOn) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; syncAllEnabled().catch(() => {}); }, debounceMs);
  };

  // React to the record changing (new/edited sources, topic moves) — a debounced sync
  // follows for every enabled workspace.
  if (app && app.subscribe) app.subscribe((kind) => { if (kind === 'sources' || kind === 'topics') schedule(); });

  return Object.freeze({ state, subscribe, setEnabled, isEnabled, syncNow, syncAllEnabled });
};
