// EO: SIG·NUL(Field → Lens,Void, Binding,Tending) — the dashboard's durable state, as a log
// dashboard/store.js — where a dashboard's watches and their reading logs LIVE between visits.
// The whole point of the feature is that a metric keeps its history: you pinned a price a week
// ago, and the sparkline shows the week. So the state is persisted as { watches, readings } — the
// watches (what to pull) and, per watch, its append-only reading log (what was pulled). Storage is
// INJECTED (`get`/`set`), defaulting to localStorage in the browser; a Node test passes a plain
// object and pins the same load/append/save lifecycle without a browser. Non-throwing: a storage
// or JSON fault degrades to an in-memory store rather than losing the surface.

import { makeWatch, upsertWatch, dropWatch, renameWatch, recordReading } from './spec.js';

const STORAGE_KEY = 'eo_dashboard_v1';

// The default storage backend: localStorage when present, an in-memory shim otherwise (Node,
// or a browser with storage disabled) — so the store always has somewhere to write.
const defaultBackend = () => {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      return {
        get: (k) => localStorage.getItem(k),
        set: (k, v) => localStorage.setItem(k, v),
      };
    }
  } catch { /* storage blocked — fall through to memory */ }
  const mem = new Map();
  return { get: (k) => (mem.has(k) ? mem.get(k) : null), set: (k, v) => mem.set(k, v) };
};

const emptyState = () => ({ watches: [], readings: {} });

// createDashboardStore({ get, set, key }) → the persistence membrane the surface calls. Holds the
// state in memory, mirrors every change to the backend, and exposes the reducers (add/remove/
// rename a watch, append a reading) as methods that return the fresh state. Subscribers are
// notified after every mutation so the surface re-renders from the log.
export const createDashboardStore = ({ get, set, key = STORAGE_KEY } = {}) => {
  const backend = get && set ? { get, set } : defaultBackend();
  let state = load();
  const subs = new Set();

  function load() {
    try {
      const raw = backend.get(key);
      if (!raw) return emptyState();
      const parsed = JSON.parse(raw);
      const watches = Array.isArray(parsed.watches) ? parsed.watches.map(makeWatch) : [];
      const readings = parsed.readings && typeof parsed.readings === 'object' ? parsed.readings : {};
      return { watches, readings };
    } catch { return emptyState(); }
  }

  function persist() {
    try { backend.set(key, JSON.stringify(state)); } catch { /* best-effort — memory copy stands */ }
  }

  const emit = () => { persist(); for (const fn of subs) { try { fn(state); } catch { /* a bad subscriber never breaks a save */ } } };

  return {
    // A snapshot of the live state.
    get state() { return state; },
    watches: () => state.watches,
    readings: (id) => state.readings[id] || [],

    // Subscribe to state changes (returns an unsubscribe).
    subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },

    // Pin (or re-pin) a watch. Returns the normalized watch so the caller can immediately record
    // its first reading against the id.
    addWatch: (fields) => {
      const w = makeWatch(fields);
      state = { ...state, watches: upsertWatch(state.watches, w) };
      if (!state.readings[w.id]) state.readings = { ...state.readings, [w.id]: [] };
      emit();
      return w;
    },

    removeWatch: (id) => {
      const readings = { ...state.readings }; delete readings[id];
      state = { watches: dropWatch(state.watches, id), readings };
      emit();
    },

    renameWatch: (id, label) => { state = { ...state, watches: renameWatch(state.watches, id, label) }; emit(); },

    // Append one reading to a watch's log (append-only; oldest dropped past the cap).
    appendReading: (id, reading) => {
      const prior = state.readings[id] || [];
      state = { ...state, readings: { ...state.readings, [id]: recordReading(prior, reading) } };
      emit();
    },

    // Wipe everything (the panel's "clear" affordance).
    clear: () => { state = emptyState(); emit(); },
  };
};
