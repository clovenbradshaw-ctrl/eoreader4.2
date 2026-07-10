// EO: CON·INS·DEF(Entity,Lens → Lens,Link, Binding,Making,Dissecting) — pinned-source lens layer
// workspace/lens.js — the LENS layer over the everything-workspace.
//
// A "lens" is a named workspace laid over the shared Record: it does not own
// sources, it PINS them. The same source (keyed by a stable refKey — see
// workspace/index.js) can be pinned into many lenses at once; nothing is copied
// or moved. Each lens carries its own accent color and a remembered panel view,
// so switching lenses re-tints the shell and restores how the left panel was
// last organized. Everything the user has ever read is "memory", shared across
// every lens; a lens is just which slice of memory is in focus right now.
//
// This is the grounding spine: "narrow to workspace" grounds a chat in the
// active lens's pinned sources; "widen to memory" grounds it in everything.
//
// Pure and DOM-free, in the same discipline as workspace/index.js: every op
// takes a plain lens-state object and returns a NEW one — inputs are never
// mutated — and ids/timestamps are injected so the model stays deterministic
// under test and replay. It serializes to a single localStorage string.

// The accent palette a new lens cycles through. Each entry is the accent hue;
// the shell derives the tint/line variants from it. Chosen to stay legible on
// the light shell and distinct from one another around the wheel.
export const LENS_COLORS = [
  '#5b34d6', // violet (the app default)
  '#2563eb', // blue
  '#0f766e', // teal
  '#b45309', // amber
  '#a91d1d', // red
  '#7c3aed', // purple
  '#be185d', // magenta
  '#15803d', // green
];

let _seq = 0;
// A lens id. Deterministic when `id` is supplied (tests, replay); otherwise a
// monotonic token — uniqueness rests on the counter, not the clock.
const mkId = (id, now) => id || `w${(now || 0).toString(36)}${(_seq++).toString(36)}`;

// The seed lens's name. It is the NARROW grounding pole (a chat narrowed to it
// grounds in exactly its pins — empty means nothing), so it must never borrow the
// WIDE pole's word: naming it "Everything" made the narrow control read as the
// paradox "Narrow to 'Everything'" over an empty pin set, sitting right beside
// "Widen to memory". "Home" names the place, not the scope. See deserialize for
// the one-time migration off the old name.
const SEED_NAME = 'Home';

// A fresh lens state always holds at least one workspace — the shell is never
// left with no active lens. The seed workspace takes the first accent.
export const emptyLens = ({ id = 'w0', name = SEED_NAME, now = 0 } = {}) => ({
  active: id,
  order: [id],
  workspaces: {
    [id]: {
      id,
      name: String(name || 'Workspace'),
      color: LENS_COLORS[0],
      view: 'source',
      pinned: [],
      createdAt: now,
      updatedAt: now,
    },
  },
});

// Defensive shallow clone of the two mutated containers.
const clone = (L) => ({
  active: L.active,
  order: [...(L.order || [])],
  workspaces: { ...(L.workspaces || {}) },
});

export const activeId = (L) => (L && L.active) || null;
export const activeWorkspace = (L) => (L && L.workspaces && L.workspaces[L.active]) || null;
export const getWorkspace = (L, id) => (L && L.workspaces && L.workspaces[id]) || null;

// The workspaces in display order, skipping any dangling order entry.
export const listWorkspaces = (L) =>
  (L.order || []).map((id) => L.workspaces[id]).filter(Boolean);

// The next accent for a new lens: the first palette color not already in use,
// falling back to cycling by count when the palette is exhausted.
const nextColor = (L) => {
  const used = new Set(Object.values(L.workspaces).map((w) => w.color));
  const free = LENS_COLORS.find((c) => !used.has(c));
  return free || LENS_COLORS[Object.keys(L.workspaces).length % LENS_COLORS.length];
};

export const createWorkspace = (L, { name, id, color, view = 'source', now = 0 } = {}) => {
  const w = clone(L);
  const wid = mkId(id, now);
  w.workspaces[wid] = {
    id: wid,
    name: String(name || 'New workspace'),
    color: color || nextColor(L),
    view,
    pinned: [],
    createdAt: now,
    updatedAt: now,
  };
  w.order = [...w.order, wid];
  return w;
};

export const renameWorkspace = (L, id, name, now = 0) => {
  if (!L.workspaces[id]) return L;
  const w = clone(L);
  w.workspaces[id] = { ...w.workspaces[id], name: String(name || w.workspaces[id].name), updatedAt: now };
  return w;
};

// Patch arbitrary fields (color, view, …) on one workspace. `id` and `pinned`
// are protected — pins go through pin/unpin so membership stays an array.
export const updateWorkspace = (L, id, patch = {}, now = 0) => {
  if (!L.workspaces[id]) return L;
  const w = clone(L);
  const { id: _drop, pinned: _dropP, ...rest } = patch;
  w.workspaces[id] = { ...w.workspaces[id], ...rest, id, updatedAt: now };
  return w;
};

export const setColor = (L, id, color, now = 0) => updateWorkspace(L, id, { color }, now);
export const setView = (L, id, view, now = 0) => updateWorkspace(L, id, { view }, now);

// Make `id` the active lens. Unknown id is a no-op returning the same ref.
export const setActive = (L, id) => {
  if (!L.workspaces[id] || L.active === id) return L;
  const w = clone(L);
  w.active = id;
  return w;
};

// Delete a lens. The last remaining lens can never be deleted (the shell must
// always have an active one). If the active lens is deleted, activation moves
// to the previous sibling in order (or the first).
export const deleteWorkspace = (L, id) => {
  if (!L.workspaces[id] || (L.order || []).length <= 1) return L;
  const w = clone(L);
  const idx = w.order.indexOf(id);
  delete w.workspaces[id];
  w.order = w.order.filter((x) => x !== id);
  if (w.active === id) w.active = w.order[Math.max(0, idx - 1)] || w.order[0];
  return w;
};

// Re-order a lens to a new index in the switcher (drag reorder).
export const moveWorkspace = (L, id, toIndex) => {
  const from = (L.order || []).indexOf(id);
  if (from < 0) return L;
  const w = clone(L);
  w.order.splice(from, 1);
  const at = Math.max(0, Math.min(w.order.length, toIndex));
  w.order.splice(at, 0, id);
  return w;
};

// ── pinning (a refKey may be pinned into many lenses; pin/unpin is a toggle) ──

const pinsOf = (L, id) => (L.workspaces[id] && L.workspaces[id].pinned) || [];

export const isPinned = (L, id, key) => pinsOf(L, id).includes(key);

export const pin = (L, id, key, now = 0) => {
  if (!L.workspaces[id] || pinsOf(L, id).includes(key)) return L;
  const w = clone(L);
  w.workspaces[id] = { ...w.workspaces[id], pinned: [...pinsOf(L, id), key], updatedAt: now };
  return w;
};

export const unpin = (L, id, key, now = 0) => {
  if (!L.workspaces[id] || !pinsOf(L, id).includes(key)) return L;
  const w = clone(L);
  w.workspaces[id] = { ...w.workspaces[id], pinned: pinsOf(L, id).filter((k) => k !== key), updatedAt: now };
  return w;
};

export const togglePin = (L, id, key, now = 0) =>
  isPinned(L, id, key) ? unpin(L, id, key, now) : pin(L, id, key, now);

// The pinned refKeys of a lens (defaulting to the active one), in pin order.
export const pinnedOf = (L, id = null) => pinsOf(L, id == null ? L.active : id).slice();

// Every lens id that currently pins `key` — the "in which workspaces" answer.
export const workspacesOf = (L, key) =>
  (L.order || []).filter((id) => pinsOf(L, id).includes(key));

// The refKeys in `allRefKeys` that are pinned in NO lens — pure memory, never
// brought into focus. Callers pass the full set of live item refKeys.
export const unpinnedEverywhere = (L, allRefKeys) => {
  const pinnedAnywhere = new Set();
  for (const id of L.order || []) for (const k of pinsOf(L, id)) pinnedAnywhere.add(k);
  return allRefKeys.filter((k) => !pinnedAnywhere.has(k));
};

const VERSION = 1;

export const serialize = (L) =>
  JSON.stringify({ v: VERSION, active: L.active, order: L.order, workspaces: L.workspaces });

// Tolerant of anything: bad JSON, nulls, a partial or future record. An unusable
// value falls back to a fresh single-workspace lens rather than throwing, so a
// corrupt localStorage entry can never brick boot. Every workspace field is
// normalized, the order list is reconciled with the workspace map (no dangling
// or missing ids), and `active` is guaranteed to point at a real workspace.
export const deserialize = (raw) => {
  let obj = raw;
  if (typeof raw === 'string') { try { obj = JSON.parse(raw); } catch { return emptyLens(); } }
  if (!obj || typeof obj !== 'object') return emptyLens();
  const srcWs = obj.workspaces && typeof obj.workspaces === 'object' ? obj.workspaces : {};
  const workspaces = {};
  for (const [id, w] of Object.entries(srcWs)) {
    if (!w || typeof w !== 'object') continue;
    const seen = new Set();
    const pinned = Array.isArray(w.pinned)
      ? w.pinned.filter((k) => typeof k === 'string' && !seen.has(k) && seen.add(k))
      : [];
    workspaces[id] = {
      id,
      name: String(w.name ?? 'Workspace'),
      color: typeof w.color === 'string' ? w.color : LENS_COLORS[0],
      view: typeof w.view === 'string' ? w.view : 'source',
      pinned,
      createdAt: w.createdAt ?? 0,
      updatedAt: w.updatedAt ?? 0,
    };
  }
  const ids = Object.keys(workspaces);
  if (!ids.length) return emptyLens();
  // Reconcile order: keep known ids in their stored order, then append any
  // workspace the order list forgot.
  const rawOrder = Array.isArray(obj.order) ? obj.order.filter((id) => workspaces[id]) : [];
  const order = [...rawOrder];
  for (const id of ids) if (!order.includes(id)) order.push(id);
  // Migrate the legacy seed name. Early builds named the seed lens "Everything" —
  // the WIDE pole's word — so its narrow control read as "Narrow to 'Everything'".
  // Rename ONLY the app-seeded lens (id 'w0') and ONLY while it still carries that
  // exact old default, so a lens a user deliberately named is never touched. The
  // rename is idempotent: once migrated, the name no longer matches.
  if (workspaces.w0 && workspaces.w0.name === 'Everything') {
    workspaces.w0 = { ...workspaces.w0, name: SEED_NAME };
  }
  const active = workspaces[obj.active] ? obj.active : order[0];
  return { active, order, workspaces };
};
