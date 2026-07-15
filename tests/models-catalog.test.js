import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCatalog, buildCoders, GROUPS, TALKERS, BUILTINS,
  deriveStatus, installability, actionLabel, connecting,
  readInstalled, writeInstalled, markInstalled, unmarkInstalled,
  fmtBytes, INSTALLED_KEY, ACTIVE_KEY,
} from '../src/rooms/models/catalog.js';

// The models room's pure half — the catalog and the status folds the surface projects. Everything
// with a DOM or a network is the surface's concern (a browser test); these are the folds that
// decide WHAT installs, WHAT state it's in, and WHETHER this device can run it.

// A throwaway in-memory localStorage, so the tests never touch a real one.
const memStore = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
};

test('models/catalog: buildCatalog spans every group and includes the browser talkers', () => {
  const cat = buildCatalog();
  const ids = cat.map((m) => m.id);
  for (const id of ['echo', 'structure', 'wllama', 'webllm', 'qwen', 'claude', 'lmstudio', 'ollama']) {
    assert.ok(ids.includes(id), `${id} is in the catalog`);
  }
  // Every catalog row belongs to a declared group.
  const groupKeys = new Set(GROUPS.map((g) => g.key));
  for (const m of cat) assert.ok(groupKeys.has(m.group), `${m.id || m.label} has a known group (${m.group})`);
});

test('models/catalog: an unregistered backend is dropped, not offered as a dead button', () => {
  const cat = buildCatalog({ registered: ['echo', 'wllama'] });   // pretend only these two registered
  const ids = cat.map((m) => m.id).filter(Boolean);
  assert.ok(ids.includes('echo') && ids.includes('wllama'));
  assert.ok(!ids.includes('webllm'), 'webllm dropped when not registered');
  // Native coders are documentation, not backends — they survive the filter regardless.
  assert.ok(cat.some((m) => m.group === 'native'), 'native coders still listed');
});

test('models/catalog: buildCoders splits browser-runnable from native-only', () => {
  const rows = buildCoders([
    { id: 'qwen-coder-1.5b', label: 'Qwen2.5-Coder 1.5B · x', family: 'Qwen', params: '1.5B', runtime: 'webgpu' },
    { id: null, label: 'Qwen3.6 27B · y', family: 'Qwen3.6', params: '27B', runtime: 'native', pull: 'ollama pull qwen3.6:27b' },
  ]);
  const web = rows.find((r) => r.id === 'qwen-coder-1.5b');
  const nat = rows.find((r) => r.group === 'native');
  assert.equal(web.group, 'coder');
  assert.equal(web.install, 'download');
  assert.equal(nat.install, null);
  assert.equal(nat.pull, 'ollama pull qwen3.6:27b');
});

test('models/catalog: deriveStatus follows install → download → installed → active', () => {
  const webllm = TALKERS.find((m) => m.id === 'webllm');
  const env = { webgpu: true };
  // fresh
  assert.equal(deriveStatus(webllm, { env }).key, 'idle');
  // mid-download (live session wins over everything)
  const s1 = deriveStatus(webllm, { session: { webllm: { state: 'installing', pct: 0.42 } }, env });
  assert.equal(s1.key, 'installing');
  assert.match(s1.label, /42%/);
  // failed
  assert.equal(deriveStatus(webllm, { session: { webllm: { state: 'error', error: 'x' } }, env }).key, 'error');
  // installed but not active
  assert.equal(deriveStatus(webllm, { installed: new Set(['webllm']), env }).key, 'installed');
  // installed and active
  assert.equal(deriveStatus(webllm, { installed: new Set(['webllm']), activeId: 'webllm', env }).key, 'active');
});

test('models/catalog: deriveStatus blocks a WebGPU model on a device without WebGPU', () => {
  const webllm = TALKERS.find((m) => m.id === 'webllm');
  const s = deriveStatus(webllm, { env: { webgpu: false } });
  assert.equal(s.key, 'unsupported');
  assert.equal(s.tone, 'blocked');
  // ...but if it was already installed, it stays usable (the record wins).
  assert.equal(deriveStatus(webllm, { installed: new Set(['webllm']), env: { webgpu: false } }).key, 'installed');
});

test('models/catalog: built-ins are ready-not-installed, natives run elsewhere', () => {
  const echo = BUILTINS.find((m) => m.id === 'echo');
  assert.equal(deriveStatus(echo, {}).key, 'builtin');
  assert.equal(deriveStatus(echo, { activeId: 'echo' }).key, 'active');
  const nat = buildCoders([{ id: null, label: 'GLM · z', family: 'GLM', params: '355B', runtime: 'native' }])[0];
  assert.equal(deriveStatus(nat, {}).key, 'native');
});

test('models/catalog: installability refuses native and webgpu-without-webgpu, allows the rest', () => {
  const webllm = TALKERS.find((m) => m.id === 'webllm');
  const wllama = TALKERS.find((m) => m.id === 'wllama');
  const nat = buildCoders([{ id: null, label: 'x', runtime: 'native', params: '80B' }])[0];
  assert.equal(installability(webllm, { webgpu: true }).ok, true);
  assert.equal(installability(webllm, { webgpu: false }).ok, false);
  assert.equal(installability(wllama, { webgpu: false }).ok, true);   // CPU model — WebGPU irrelevant
  assert.equal(installability(nat, {}).ok, false);
});

test('models/catalog: action verbs read as install / connect / verify / retry', () => {
  const webllm = TALKERS.find((m) => m.id === 'webllm');
  const claude = TALKERS.find((m) => m.id === 'claude');
  const ollama = TALKERS.find((m) => m.id === 'ollama');
  assert.equal(actionLabel(webllm, { key: 'idle' }), 'Install');
  assert.equal(actionLabel(webllm, { key: 'installed' }), 'Reinstall');
  assert.equal(actionLabel(webllm, { key: 'error' }), 'Retry');
  assert.equal(actionLabel(claude, { key: 'idle' }), 'Verify key');
  assert.equal(actionLabel(ollama, { key: 'idle' }), 'Connect');
  assert.equal(actionLabel(ollama, { key: 'installed' }), 'Reconnect');
  assert.equal(connecting(claude), true);
  assert.equal(connecting(webllm), false);
});

test('models/catalog: the installed set persists, marks, and unmarks (fail-soft)', () => {
  const store = memStore();
  assert.deepEqual([...readInstalled(store)], []);
  markInstalled(store, 'webllm');
  markInstalled(store, 'wllama');
  assert.deepEqual([...readInstalled(store)].sort(), ['webllm', 'wllama']);
  assert.equal(store.getItem(INSTALLED_KEY), JSON.stringify(['webllm', 'wllama']));
  unmarkInstalled(store, 'webllm');
  assert.deepEqual([...readInstalled(store)], ['wllama']);
  // a corrupt value degrades to empty rather than throwing
  store.setItem(INSTALLED_KEY, '{not json');
  assert.deepEqual([...readInstalled(store)], []);
  // no store at all is fine
  assert.deepEqual([...readInstalled(null)], []);
  assert.doesNotThrow(() => writeInstalled(null, new Set(['x'])));
});

test('models/catalog: fmtBytes is human and total', () => {
  assert.equal(fmtBytes(0), '0 B');
  assert.equal(fmtBytes(512), '512 B');
  assert.equal(fmtBytes(1024), '1 KB');
  assert.equal(fmtBytes(512 * 1024 ** 2), '512 MB');
  assert.equal(fmtBytes(1.9 * 1024 ** 3), '1.9 GB');
  assert.equal(fmtBytes(null), '—');
  assert.equal(fmtBytes(-5), '—');
  assert.equal(fmtBytes(NaN), '—');
  assert.equal(ACTIVE_KEY, 'eo_backend');   // the reader's own key — setting active here is its switch
});
