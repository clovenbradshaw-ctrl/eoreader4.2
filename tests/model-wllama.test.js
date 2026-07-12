import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_MODEL_URLS, wllamaCandidates, wllamaModelName } from '../src/model/wllama.js';
import { availableBackends, createModel } from '../src/model/interface.js';

// The wllama (CPU/WASM) backend. The live path — the wasm runtime, the GGUF
// stream — is a browser concern; what IS provable here is the WEIGHTS LADDER.
// The canonical HuggingFaceTB GGUF repo went 401 (gated/private) in mid-2026 and
// took down not just this backend but the webllm→wllama fallback rung above it:
// one upstream URL nobody here controls was a single point of failure for the
// whole local-model story. The default is now a ladder of public mirrors of the
// SAME artifact, walked in order at load() — these tests pin that shape down.

test('model/wllama: the default weights are a ladder of mirrors, not one URL', () => {
  assert.ok(Array.isArray(DEFAULT_MODEL_URLS) && DEFAULT_MODEL_URLS.length >= 2,
    'at least two independent sources');
  const repos = new Set(DEFAULT_MODEL_URLS.map((u) => new URL(u).pathname.split('/')[1]));
  assert.ok(repos.size >= 2, `mirrors live under different owners, got ${[...repos].join(', ')}`);
  for (const u of DEFAULT_MODEL_URLS) {
    assert.ok(u.startsWith('https://'), `${u} is https`);
  }
});

test('model/wllama: every rung of the ladder is the same artifact', () => {
  // Different mirrors case the filename differently, but they must all be the
  // SmolLM2-135M-Instruct Q8_0 quant — a ladder that silently swapped models
  // between rungs would corrupt provenance (the export names the file).
  for (const u of DEFAULT_MODEL_URLS) {
    assert.equal(wllamaModelName(u).toLowerCase(), 'smollm2-135m-instruct-q8_0.gguf', u);
  }
});

test('model/wllama: the canonical repo stays on the ladder, last', () => {
  // It went dark, but if it reopens it should be picked back up — after the
  // mirrors, so an outage there can never again take the backend down.
  const last = DEFAULT_MODEL_URLS[DEFAULT_MODEL_URLS.length - 1];
  assert.ok(last.includes('/HuggingFaceTB/'), `last rung is the canonical repo, got ${last}`);
});

test('model/wllama: an explicit pin is honoured alone — no silent mirror substitution', () => {
  // A caller who pinned an exact artifact (a coder variant, a test rig, the
  // eo_webllm_model-style escape hatch) chose that URL's provenance; falling
  // back to a different host behind their back would betray it.
  const pinned = 'https://example.org/models/custom.gguf';
  assert.deepEqual(wllamaCandidates(pinned), [pinned]);
  assert.deepEqual(wllamaCandidates(null), [...DEFAULT_MODEL_URLS]);
  assert.deepEqual(wllamaCandidates(undefined), [...DEFAULT_MODEL_URLS]);
});

test('model/wllama: registers with the shared backend shape', () => {
  assert.ok(availableBackends().includes('wllama'), 'wllama is registered');
  const m = createModel('wllama');
  assert.equal(m.id, 'wllama');
  assert.equal(m.kind, 'local');
  assert.equal(m.isLoaded(), false);
  assert.equal(typeof m.load, 'function');
  assert.equal(typeof m.phrase, 'function');
  // Before load, describe() names the ladder's head — the artifact a load would
  // reach for first — so the chip and the export never show a dead URL's name.
  assert.equal(m.describe().model.toLowerCase(), 'smollm2-135m-instruct-q8_0.gguf');
});

test('model/wllama: reset() exists and is a harmless no-op before load', async () => {
  // The wedge recovery (rooms/reader/app.js resetWedgedLocalModel) calls m.reset?.() on every
  // local backend. wllama used to have none — the dropped WASM runtime (runtime + weights,
  // hundreds of MB) just lingered, and repeated recoveries stacked instances. The live teardown
  // (inst.exit()) is a browser concern; what is provable here is the contract: reset is a real
  // method, fail-soft on a never-loaded backend, and leaves isLoaded() honest.
  const m = createModel('wllama');
  assert.equal(typeof m.reset, 'function', 'wllama carries the reset() the wedge recovery relies on');
  await assert.doesNotReject(() => m.reset(), 'reset() before any load must be a no-op, never a throw');
  assert.equal(m.isLoaded(), false);
});
