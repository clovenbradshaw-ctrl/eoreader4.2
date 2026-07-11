import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pickSize, makeWebllmBackend } from '../src/model/webllm.js';
import { availableBackends, createModel } from '../src/model/interface.js';

// The webllm (WebGPU/Llama) backend. The live path — the WebGPU probe, the CDN
// import, decoding — is a browser concern exercised through the model chip. What
// IS provable here without a DOM or a GPU is the pure size decision that the
// Fast/Fluent lever turns: pickSize maps (speed pin × device class) → the build
// size, and every Llama-3.2 artifact is already 4-bit, so this is the only knob
// that moves how fast an answer renders. The grounding is untouched either way.

test('model/webllm: an explicit Fast/Fluent pin wins over the device class', () => {
  // 'fast' is always the 1B build, 'fluent' always 3B — regardless of whether the
  // device reads as small. The pin is the user's deliberate override.
  assert.equal(pickSize('fast', false), '1B');
  assert.equal(pickSize('fast', true), '1B');
  assert.equal(pickSize('fluent', false), '3B');
  assert.equal(pickSize('fluent', true), '3B');
});

test('model/webllm: with no pin the device class decides (small ⇒ 1B, else 3B)', () => {
  assert.equal(pickSize(null, true), '1B');
  assert.equal(pickSize(null, false), '3B');
});

test('model/webllm: an unknown or empty speed value falls back to the adaptive default', () => {
  // Anything that isn't exactly 'fast'/'fluent' is treated as no pin, so a garbled
  // localStorage value can never produce a broken artifact id — it defers to the device.
  for (const junk of ['', 'FAST', 'small', '3b', undefined, 0, {}]) {
    assert.equal(pickSize(junk, true), '1B', `${JSON.stringify(junk)} + small ⇒ 1B`);
    assert.equal(pickSize(junk, false), '3B', `${JSON.stringify(junk)} + not-small ⇒ 3B`);
  }
});

test('model/webllm: registers the webllm backend with the expected shape', () => {
  assert.ok(availableBackends().includes('webllm'), 'webllm is registered');
  const m = createModel('webllm');
  assert.equal(m.id, 'webllm');
  assert.equal(m.kind, 'local');
  assert.equal(m.isLoaded(), false);
  assert.equal(typeof m.load, 'function');
  assert.equal(typeof m.phrase, 'function');
  assert.equal(typeof m.reset, 'function');   // wedge recovery — tear a dead engine down
});

test('model/webllm: a coder variant reuses the builder under its own id', () => {
  // The builder is parameterised (model/coders.js binds MLC coder artifacts through it);
  // a bound variant keeps the shared shape but carries its own id.
  const coder = makeWebllmBackend({ id: 'qwen-coder-1.5b', model: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC' })();
  assert.equal(coder.id, 'qwen-coder-1.5b');
  assert.equal(coder.kind, 'local');
  assert.equal(coder.isLoaded(), false);
});

// ── wedge recovery ────────────────────────────────────────────────────────────
// The live engine is a browser/GPU concern, but the LIFECYCLE that made the app get stuck — a
// write-once engine singleton that keeps answering isLoaded() true after its WebGPU device dies,
// so every retry hangs on the corpse — is testable with an injected fake (opts.createEngine),
// no DOM or GPU. These pin the contract the app-side recovery (resetWedgedLocalModel) relies on.

// A stand-in for a web-llm engine: records unloads, and exposes a WebGPU device whose `lost`
// promise the test can resolve to simulate a driver reset / OOM.
const makeFakeEngine = () => {
  let loseDevice;
  const device = { lost: new Promise((res) => { loseDevice = res; }) };
  const engine = {
    unloaded: 0,
    getGPUDevice: () => device,
    unload: async () => { engine.unloaded += 1; },
    interruptGenerate: () => {},
    chat: { completions: { create: async () => ({ choices: [{ message: { content: 'ok' } }] }) } },
  };
  return { engine, loseDevice: (reason) => loseDevice({ reason }) };
};
const tick = () => new Promise((r) => setTimeout(r, 0));

test('model/webllm: reset() tears the engine down so isLoaded() stops lying and load() rebuilds', async () => {
  let built = 0;
  const { engine } = makeFakeEngine();
  const backend = makeWebllmBackend({ model: 'Fake-1B' })({ createEngine: async () => { built += 1; return engine; } });

  assert.equal(backend.isLoaded(), false);
  await backend.load();
  assert.equal(backend.isLoaded(), true);
  assert.equal(built, 1);
  assert.equal(backend.describe().model, 'Fake-1B', 'provenance names the exact build that answered');

  await backend.reset();
  assert.equal(backend.isLoaded(), false, 'reset() makes isLoaded() honest — no zombie singleton');
  assert.equal(engine.unloaded, 1, 'reset() frees the GPU memory on the way out');

  await backend.load();
  assert.equal(built, 2, 'a fresh engine is built after reset, not the dead one reused');
  assert.equal(backend.isLoaded(), true);
});

test('model/webllm: a lost WebGPU device drops the engine so the next ask reloads (self-heal)', async () => {
  const { engine, loseDevice } = makeFakeEngine();
  const backend = makeWebllmBackend({ model: 'Fake-3B' })({ createEngine: async () => engine });
  await backend.load();
  assert.equal(backend.isLoaded(), true);

  loseDevice('unknown');   // the device vanishes under us — a driver reset / OOM / backgrounded tab
  await tick();            // let the device.lost .then run
  assert.equal(backend.isLoaded(), false, 'a real device loss invalidates the singleton, so ensureModel reloads');
});

test('model/webllm: an ordinary "destroyed" teardown is NOT treated as a wedge', async () => {
  const { engine, loseDevice } = makeFakeEngine();
  const backend = makeWebllmBackend({ model: 'Fake-3B' })({ createEngine: async () => engine });
  await backend.load();

  loseDevice('destroyed');   // deliberate teardown (page unload, manual unload) — not a fault to flap on
  await tick();
  assert.equal(backend.isLoaded(), true, 'a destroyed-on-teardown loss must not invalidate a healthy engine');
});

test('model/webllm: reset() on a never-loaded backend is a harmless no-op', async () => {
  const backend = createModel('webllm');
  assert.equal(backend.isLoaded(), false);
  await assert.doesNotReject(() => backend.reset(), 'reset() must be fail-soft when there is no engine');
  assert.equal(backend.isLoaded(), false);
});
