// EO: INS·SEG·EVA(Kind,Field → Kind,Lens, Making,Dissecting) — the model catalog + status folds
// catalog.js — the PURE half of the models room. It answers three questions the surface
// asks of every model, with no DOM and no network, so the whole thing is unit-testable:
//
//   1. WHAT can I install?      buildCatalog() — the registered backends, the browser coders,
//                               and the native-only coders, each a plain row with size /
//                               requirement / group / description.
//   2. WHAT is its state now?   deriveStatus() — from the persisted "installed" set, the active
//                               pick (eo_backend), the live in-session load map, and whether this
//                               device can even run it (WebGPU), name one badge: active / installed
//                               / downloading / failed / not-installed / built-in / runs-elsewhere.
//   3. CAN I install it here?   installability() — a webgpu model on a device without WebGPU can't,
//                               and a native-only coder never runs in a tab; both get an honest no.
//
// The surface (surface.js) is a thin projection of these: it drives the real backend load() and
// paints what these functions decide. Nothing here imports a backend runtime — the catalog is a
// description, the load happens in the surface through createModel().

import { CODER_MODELS } from '../../model/index.js';

// The persisted record of which backends have finished a load() in THIS browser at least once —
// an honest "you have downloaded this; it is cached to disk" signal (web-llm caches weights to the
// Cache API, wllama streams to OPFS, both origin-scoped). Keyed alone so a reader session and this
// surface agree. The ACTIVE pick reuses the reader's own key, so setting a model here is the same
// switch the header chip makes — the reader inherits it with no extra wiring.
export const INSTALLED_KEY = 'eo_models_installed';
export const ACTIVE_KEY    = 'eo_backend';
export const SPEED_KEY      = 'eo_llm_speed';   // webllm size lever — 'fast' (1B) | 'fluent' (3B)

// ── the talker catalog ───────────────────────────────────────────────────────────
// The prose/grounding family, ordered lightest-first. `id` is the registered backend name;
// `group` buckets the surface; `size` and `requires` are the two facts a person weighs before
// committing a multi-GB download. `install` names the verb the action button uses — a hosted or
// local-server backend is CONNECTED/VERIFIED, not downloaded. Curated (not derived) so the
// descriptions stay honest about what each actually costs and needs.
export const TALKERS = Object.freeze([
  {
    id: 'wllama', label: 'SmolLM2 135M', family: 'SmolLM2', params: '135M',
    group: 'browser', runtime: 'wasm', install: 'download',
    size: '~140 MB', requires: 'any browser · CPU/WASM',
    note: 'Small and universal — runs on WebAssembly everywhere, no GPU needed. Cached to disk after the first load, then opens offline.',
  },
  {
    id: 'webllm', label: 'Llama 3.2', family: 'Llama 3.2', params: '1B / 3B',
    group: 'browser', runtime: 'webgpu', install: 'download', speed: true,
    size: '~0.9–1.9 GB', requires: 'WebGPU · Chrome/Edge',
    note: 'The local talker — the quick 1B build by default, Fluent opts into the fuller 3B. Runs entirely in your browser on the GPU; nothing leaves the machine.',
  },
  {
    id: 'qwen', label: 'Qwen 2.5', family: 'Qwen 2.5', params: '1.5B',
    group: 'browser', runtime: 'webgpu', install: 'download',
    size: '~1 GB', requires: 'WebGPU · Chrome/Edge',
    note: 'Alibaba’s small talker — about the Llama 1B weight class, a second local voice on the same in-browser GPU engine.',
  },
  {
    id: 'claude', label: 'Claude', family: 'Anthropic (hosted)', params: 'frontier',
    group: 'hosted', runtime: 'hosted', install: 'verify', needsKey: true,
    size: 'nothing to download', requires: 'API key',
    note: 'Anthropic’s hosted models — frontier answers in seconds, nothing to fetch. The key is stored only in this browser and is sent to api.anthropic.com and nowhere else.',
  },
  {
    id: 'lmstudio', label: 'LM Studio', family: 'local server', params: 'your machine',
    group: 'server', runtime: 'server', install: 'connect', needsServer: true,
    size: 'runs on your machine', requires: 'LM Studio server',
    note: 'Reach the BIG models (Qwen 27–80B, GLM, …) running natively in LM Studio on this machine. Start Developer → Start Server, then connect — it auto-discovers whatever model you loaded.',
  },
  {
    id: 'ollama', label: 'Ollama', family: 'local server', params: 'your machine',
    group: 'server', runtime: 'server', install: 'connect', needsServer: true,
    size: 'runs on your machine', requires: 'Ollama server',
    note: 'Reach big models running via Ollama on this machine. Start it with OLLAMA_ORIGINS=* ollama serve, then connect — it uses whatever you have pulled.',
  },
]);

// The two always-on, zero-download engines. Not "installed" — they need nothing — but a person
// scanning the surface should see they exist and can be the active talker (the pipeline runs
// end-to-end on them before any real model loads). Kept apart from TALKERS so the install actions
// never offer to "download" something that has nothing to download.
export const BUILTINS = Object.freeze([
  {
    id: 'echo', label: 'Echo', family: 'skeleton', params: 'no model',
    group: 'builtin', runtime: 'builtin', install: null,
    size: '—', requires: 'always available',
    note: 'Returns the grounded excerpts verbatim — no model, no network. The cold-start voice that lets the whole pipeline run before a real talker is loaded.',
  },
  {
    id: 'structure', label: 'Structure', family: 'graph retelling', params: 'no model',
    group: 'builtin', runtime: 'builtin', install: null,
    size: '—', requires: 'always available',
    note: 'Generates from the engine’s own concept graph — nothing distributional anywhere in the path. A structural retelling of what was read, not an answer drawn from a trained model.',
  },
]);

// A rough download footprint for a WebGPU (MLC, 4-bit) build from its parameter count — enough to
// warn "this is a big fetch" without pretending to byte accuracy. GGUF q4 coders land a little
// lighter; the map is deliberately coarse and honest about being an estimate.
const coderSize = (m) => {
  const p = String(m.params || '');
  if (/0\.5B/.test(p)) return '~0.4 GB';
  if (/1\.5B/.test(p)) return '~1 GB';
  if (/^3B/.test(p))   return '~1.9 GB';
  if (/7B/.test(p))    return '~4.3 GB';
  return m.tier || '—';
};

// Lift the coder catalog (model/coders.js) into catalog rows. The browser-runnable coders
// (webgpu/wasm) are installable exactly like the talkers; the native rows are documented, never
// pretended-runnable, and carry their pull/serve command so the surface can show how to reach them.
export const buildCoders = (models = CODER_MODELS) => (Array.isArray(models) ? models : []).map((m) => {
  const browserRun = m.runtime === 'webgpu' || m.runtime === 'wasm';
  return {
    id: m.id || null,
    label: m.label ? m.label.split(' · ')[0] : (m.family || 'coder'),
    family: m.family, params: m.params,
    group: browserRun ? 'coder' : 'native',
    runtime: m.runtime,
    install: browserRun ? 'download' : null,
    size: browserRun ? coderSize(m) : 'native runtime',
    requires: m.tier || (browserRun ? 'browser' : 'workstation'),
    note: m.note || '',
    pull: m.pull || null,
    serve: m.serve || null,
  };
});

// The whole catalog the surface renders, in display order: builtins, browser talkers, hosted,
// local-server, browser coders, then native-only coders (documented). `registered` (default: all)
// filters to the backends actually present in this build — a talker whose backend never registered
// is dropped rather than offered as a dead button. Pure: same inputs, same array.
export const buildCatalog = ({ registered = null, coders = CODER_MODELS } = {}) => {
  const has = (id) => registered == null || (id && registered.includes(id));
  const talkers = [...BUILTINS, ...TALKERS].filter((m) => has(m.id));
  const coderRows = buildCoders(coders).filter((m) => m.group === 'native' || has(m.id));
  return Object.freeze([...talkers, ...coderRows]);
};

// The display groups, in order, with their headings. The surface walks these and slots each
// catalog row under its `group`; an empty group is simply not drawn.
export const GROUPS = Object.freeze([
  { key: 'builtin', title: 'Built in', sub: 'No download — always ready' },
  { key: 'browser', title: 'In your browser', sub: 'Downloaded once, then cached to disk and run locally' },
  { key: 'hosted',  title: 'Hosted', sub: 'Nothing to download — needs a key' },
  { key: 'server',  title: 'Your local server', sub: 'Reach big native models on this machine' },
  { key: 'coder',   title: 'Coding models · in your browser', sub: 'Tuned for source code — same in-browser engines' },
  { key: 'native',  title: 'Coding models · native only', sub: 'Too large for a tab — pull once, then reach them via LM Studio / Ollama above' },
]);

// ── the installed set (persistence) ────────────────────────────────────────────────
// A tiny, defensive JSON set in localStorage. Every read/write is fail-soft — a private-mode
// browser with no storage, or a corrupted value, degrades to "nothing installed" rather than
// throwing into the surface. `store` is injectable so the tests never touch a real localStorage.
export const readInstalled = (store) => {
  try {
    const raw = store && store.getItem ? store.getItem(INSTALLED_KEY) : null;
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []);
  } catch { return new Set(); }
};

export const writeInstalled = (store, set) => {
  try {
    if (store && store.setItem) store.setItem(INSTALLED_KEY, JSON.stringify([...set]));
  } catch { /* session-only — the in-memory set still drives this session */ }
  return set;
};

export const markInstalled = (store, id) => {
  const set = readInstalled(store);
  if (id) set.add(id);
  return writeInstalled(store, set);
};

export const unmarkInstalled = (store, id) => {
  const set = readInstalled(store);
  set.delete(id);
  return writeInstalled(store, set);
};

// ── status derivation ──────────────────────────────────────────────────────────────
// One badge per model, from four inputs and nothing else (pure): the persisted `installed` set,
// the `activeId` (the reader's eo_backend), the live `session` map (id → { state, pct, phase,
// error }) for loads happening right now, and `env` ({ webgpu }) for what this device can run.
//
// Returns { key, label, tone }:
//   key   — the machine-readable state, the thing tests assert on
//   label — the human words the badge shows
//   tone  — a colour bucket the surface maps to a CSS variable
//
// Precedence is deliberate: a live download or failure this session wins over any stored record
// (the freshest truth), then the active pick, then the stored "installed", then the resting state.
export const deriveStatus = (model, { installed = new Set(), activeId = null, session = {}, env = {} } = {}) => {
  const id = model.id;
  const live = id ? session[id] : null;
  const isActive = !!id && activeId === id;

  // Built-ins are never installed and never downloaded — they just are. Active still wins the label.
  if (model.runtime === 'builtin') {
    return isActive
      ? { key: 'active', label: 'Active', tone: 'active' }
      : { key: 'builtin', label: 'Built in', tone: 'muted' };
  }
  // Native-only coders can't run in a tab at all — they are documentation, not an install.
  if (model.group === 'native') {
    return { key: 'native', label: 'Native runtime', tone: 'muted' };
  }

  // The live, this-session truth first.
  if (live && live.state === 'installing') {
    const pct = Math.max(0, Math.min(100, Math.round((live.pct || 0) * 100)));
    return { key: 'installing', label: `${connecting(model) ? 'Connecting' : 'Downloading'} ${pct}%`, tone: 'busy' };
  }
  if (live && live.state === 'error') {
    return { key: 'error', label: connecting(model) ? "Couldn't connect" : 'Failed', tone: 'error' };
  }

  const ready = (live && live.state === 'ready') || installed.has(id);
  if (ready) {
    if (isActive) return { key: 'active', label: 'Active', tone: 'active' };
    return { key: 'installed', label: connecting(model) ? 'Ready' : 'Installed', tone: 'ready' };
  }

  // Not yet installed/connected. A WebGPU model on a device without it can't be — say so plainly.
  if (model.runtime === 'webgpu' && env.webgpu === false) {
    return { key: 'unsupported', label: 'Needs WebGPU', tone: 'blocked' };
  }
  if (isActive) {
    // Selected as the reader's talker but not proven yet (e.g. picked, key not verified).
    return { key: 'selected', label: 'Selected', tone: 'idle' };
  }
  return {
    key: 'idle',
    label: model.needsKey ? 'Needs a key' : model.needsServer ? 'Not connected' : 'Not installed',
    tone: 'idle',
  };
};

// A hosted/server backend is "connected/verified", not "downloaded" — the one word that changes
// across the whole surface. Kept here so status labels and action verbs agree.
export const connecting = (model) => model.runtime === 'hosted' || model.runtime === 'server';

// Can this model be installed on THIS device, right now? A native coder never can (no tab runtime);
// a WebGPU model can't without WebGPU. Everything else can. Returns { ok, reason } so the surface
// can disable the button AND say why. Pure.
export const installability = (model, { webgpu = true } = {}) => {
  if (model.group === 'native' || model.install === null) {
    return { ok: false, reason: 'runs in a native runtime, not a browser tab' };
  }
  if (model.runtime === 'webgpu' && webgpu === false) {
    return { ok: false, reason: 'this browser has no WebGPU — use Chrome/Edge, or pick a CPU model' };
  }
  return { ok: true, reason: '' };
};

// The action-button verb for a model in a given state — "Install" / "Download 3B" / "Connect" /
// "Verify key" / "Reinstall" / "Retry". Pure, so the surface never re-derives copy.
export const actionLabel = (model, status) => {
  if (status.key === 'installing') return '…';
  if (status.key === 'error')      return connecting(model) ? 'Retry' : 'Retry';
  if (status.key === 'installed' || status.key === 'active' || status.key === 'ready') {
    return connecting(model) ? 'Reconnect' : 'Reinstall';
  }
  if (model.needsKey)    return 'Verify key';
  if (model.needsServer) return 'Connect';
  return model.install === 'download' ? 'Install' : 'Load';
};

// ── byte / size formatting ──────────────────────────────────────────────────────────
// Human-readable bytes for the storage readout (navigator.storage.estimate). Pure and total:
// nullish / non-finite / negative all read as "—" rather than "NaN B". Base-1024, one decimal
// past MB so a 1.9 GB model download reads as a real number.
export const fmtBytes = (n) => {
  if (n == null) return '—';          // Number(null) is 0 — guard before it reads as "0 B"
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return '—';
  if (v < 1024) return `${v} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let u = -1, x = v;
  do { x /= 1024; u++; } while (x >= 1024 && u < units.length - 1);
  const dp = x >= 100 || u < 1 ? 0 : 1;
  return `${x.toFixed(dp)} ${units[u]}`;
};
