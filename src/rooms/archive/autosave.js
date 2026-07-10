// EO: INS·CON(Network,Field → Link, Making,Binding) — silent, opt-in genome autosave
// archive/autosave.js — "Save system genome online?" as one quiet setting, never a
// nag. When it is ON and a Matrix session is live, the WHOLE system genome (every
// recorded source's EoT, in a canonical order) is checkpointed to Archive.org on
// change — automatically, with no per-item prompting and no per-save toast. The
// account menu shows the last checkpoint if you look; nothing is ever pushed at you.
//
// Two properties keep automatic archiving from spamming archive.org:
//   · CONTENT-ADDRESSED — the snapshot is deterministic, so its hash only changes
//     when the record actually changes; an unchanged genome is never re-uploaded
//     (a local last-hash guard plus the deposit ledger both short-circuit it).
//   · DEBOUNCED — a burst of edits collapses into one checkpoint after things settle.
//
// Default OFF. It never turns itself on, never prompts, and does nothing at all until
// the user opts in. Injectable storage/now/deposit; DOM-free; non-throwing.

import { contentHash } from './checkpoints.js';
import { REQUIRED_CONSENT } from './deposit.js';

const SETTING_KEY = 'eo_save_genome_online';
const DEFAULT_DEBOUNCE_MS = 45_000;

const memoryStore = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
};
const safeStore = (storage) => {
  if (storage) return storage;
  if (typeof localStorage !== 'undefined') return localStorage;
  return memoryStore();
};
const nowIso = (now) => { try { return new Date(typeof now === 'function' ? now() : Date.now()).toISOString(); } catch { return null; } };

// A deterministic, canonical serialization of the system genome: every recorded
// source, ordered by its stable id, with its EoT (the encoded reading — every
// admitted proposition). Deterministic in, deterministic hash out, so the same
// record always addresses the same checkpoint.
export const genomeSnapshot = (app) => {
  if (!app || !app.state) return '';
  const sources = (app.state.sources || []).slice()
    .sort((a, b) => String(a.sn).localeCompare(String(b.sn), undefined, { numeric: true }));
  const out = ['# EO system genome', `# sources: ${sources.length}`, ''];
  for (const s of sources) {
    let eot = '';
    try { const e = app.eotFor(s.sn); eot = (e && e.text) || ''; } catch { /* skip an unreadable source */ }
    out.push(`## ${s.reg || s.sn} — ${s.title || ''}`);
    if (s.url) out.push(`# url: ${s.url}`);
    out.push(eot, '');
  }
  return out.join('\n');
};

// createGenomeAutosave({ app, matrix, deposit, storage, now, debounceMs, snapshot }) →
// the autosave controller the boot bridge exposes as window.EO.genome. `deposit` is a
// bound depositToArchive (session + ledger already threaded).
export const createGenomeAutosave = ({
  app = null, matrix = null, deposit = null,
  storage = null, now = null,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  snapshot = genomeSnapshot,
} = {}) => {
  const store = safeStore(storage);
  const readEnabled = () => { try { return store.getItem(SETTING_KEY) === '1'; } catch { return false; } };

  let enabled = readEnabled();
  let lastHash = null;
  let timer = null;

  const state = { enabled, status: 'idle', lastCheckpoint: null, error: null, pending: false };
  const subs = new Set();
  const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
  const emit = () => { for (const fn of subs) { try { fn(state); } catch { /* surface's problem */ } } };
  const setState = (patch) => { Object.assign(state, patch); emit(); };

  const signedIn = () => !!(matrix && matrix.isLoggedIn && matrix.isLoggedIn());

  // Run one checkpoint if warranted. Silent: it moves `state` (the account menu reads
  // it) but never toasts or prompts. `force` bypasses only the unchanged-guard.
  const maybeCheckpoint = async ({ force = false } = {}) => {
    if (!enabled) return { ok: false, skipped: 'disabled' };
    if (!signedIn()) return { ok: false, skipped: 'signed-out' };
    if (!deposit) return { ok: false, skipped: 'no-deposit' };
    const text = String(snapshot(app) || '');
    if (!text.trim()) return { ok: false, skipped: 'empty' };
    const h = contentHash(text);
    if (!force && h === lastHash) return { ok: true, reused: true, skipped: 'unchanged' };

    setState({ status: 'saving', error: null });
    let r;
    try {
      r = await deposit({
        text, hash: h,
        kind: 'dataset', mime: 'text/plain',
        filename: 'eo-system-genome.txt',
        title: 'EO system genome',
        description: 'Automatic content-addressed checkpoint of the EO Reader system genome.',
        consent: REQUIRED_CONSENT,   // the standing consent is the user having enabled the setting
      });
    } catch (e) {
      setState({ status: 'error', error: String(e && e.message || e) });
      return { ok: false, error: String(e && e.message || e) };
    }
    if (r && r.ok) {
      lastHash = h;
      const cp = r.checkpoint || (r.archive ? { identifier: r.archive.identifier, url: r.archive.url } : null);
      setState({ status: 'saved', lastCheckpoint: cp ? { ...cp, at: (cp && cp.at) || nowIso(now) } : state.lastCheckpoint, error: null });
    } else {
      setState({ status: 'error', error: (r && r.error) || 'archive failed' });
    }
    return r;
  };

  // Coalesce a burst of record changes into one checkpoint once things settle. No-op
  // in an environment without timers (tests drive maybeCheckpoint directly).
  const schedule = () => {
    if (!enabled || !signedIn()) return;
    if (typeof setTimeout === 'undefined') return;
    if (timer) clearTimeout(timer);
    setState({ pending: true });
    timer = setTimeout(() => { timer = null; setState({ pending: false }); maybeCheckpoint().catch(() => {}); }, debounceMs);
  };

  const setEnabled = (v) => {
    enabled = !!v;
    try { store.setItem(SETTING_KEY, enabled ? '1' : '0'); } catch { /* private mode */ }
    setState({ enabled, status: enabled ? state.status : 'idle', pending: false });
    if (!enabled && timer) { try { clearTimeout(timer); } catch { /* ignore */ } timer = null; }
    // Turning it on captures the current genome right away (the one time the user
    // asked for it), then future changes are debounced.
    if (enabled && signedIn()) maybeCheckpoint({ force: true }).catch(() => {});
    return enabled;
  };
  const isEnabled = () => enabled;
  const checkpointNow = () => maybeCheckpoint({ force: true });

  // React to the record changing and to signing in (a pending genome can now save).
  if (app && app.subscribe) app.subscribe(() => schedule());
  if (matrix && matrix.subscribe) matrix.subscribe(() => { if (enabled && signedIn()) schedule(); });

  return Object.freeze({ state, subscribe, isEnabled, setEnabled, checkpointNow, maybeCheckpoint, snapshot: () => snapshot(app) });
};
