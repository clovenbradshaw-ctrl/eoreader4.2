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
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

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

// ── the abort backstop ────────────────────────────────────────────────────────
// The frozen-session failure: a decode wedges MID-generation, its promise never settles, and
// the abort (Stop / the 45s watchdog) is ignored — so the orphan holds the decode gate and
// every later turn queues behind it forever. phrase() now gives an aborted decode a grace
// window to settle; past it the engine is declared wedged and torn down from inside, so the
// stopped turn gets its partial back and the next ask meets a fresh engine, not the corpse.

// An engine whose decode HANGS: streams `pieces` through the streaming path, then never
// settles, and ignores interruptGenerate — the wedge exactly as exported.
const makeWedgedEngine = (pieces = []) => ({
  unload: async () => {},
  interruptGenerate: () => { /* wedged — the interrupt is ignored */ },
  chat: { completions: { create: async ({ stream }) => {
    if (!stream) return new Promise(() => {});            // non-streaming draw: hangs forever
    return (async function* () {
      for (const p of pieces) yield { choices: [{ delta: { content: p } }] };
      await new Promise(() => {});                        // dies mid-stream, holding the decode
    })();
  } } },
});

test('model/webllm: an abort the engine ignores tears it down within the grace and keeps the partial', async () => {
  let built = 0;
  const backend = makeWebllmBackend({ model: 'Fake-3B', abortGraceMs: 25 })({
    createEngine: async () => { built += 1; return makeWedgedEngine(['The largest ', 'dolphin ']); },
  });
  await backend.load();

  const ctrl = new AbortController();
  const got = [];
  const p = backend.phrase([{ role: 'user', content: 'write an essay' }],
    { signal: ctrl.signal, onToken: (t) => got.push(t) });
  await delay(10);                    // let the stream hand over its preamble, then wedge
  ctrl.abort();                       // Stop / the watchdog — the engine ignores it

  const text = await p;               // settles via the backstop, NOT the (dead) decode
  assert.equal(text, 'The largest dolphin', 'the stopped turn keeps what streamed');
  assert.deepEqual(got, ['The largest ', 'dolphin ']);
  assert.equal(backend.isLoaded(), false, 'the wedged engine was torn down, not left claiming loaded');

  await backend.load();
  assert.equal(built, 2, 'the next ask rebuilds a fresh engine instead of re-hitting the corpse');
});

test('model/webllm: a decode queued behind a wedged one skips the dead engine instead of hanging', async () => {
  const backend = makeWebllmBackend({ model: 'Fake-3B', abortGraceMs: 25 })({
    createEngine: async () => makeWedgedEngine(),
  });
  await backend.load();

  const first = new AbortController();
  const p1 = backend.phrase([{ role: 'user', content: 'q1' }], { signal: first.signal });
  const second = new AbortController();
  const p2 = backend.phrase([{ role: 'user', content: 'q2' }], { signal: second.signal });   // queues behind q1

  await delay(5);
  first.abort();                      // q1's Stop; the engine ignores it → backstop resets

  assert.equal(await p1, '', 'the wedged decode settles empty via the backstop');
  assert.equal(await p2, '', 'the queued decode sees its engine was torn down and skips — it never hangs');
  assert.equal(backend.isLoaded(), false);
});

test('model/webllm: a healthy decode that honours the abort settles through the normal path — no reset', async () => {
  // The engine stops when asked: create() resolves promptly after interruptGenerate. The
  // backstop must stay out of the way — the engine survives, no reload is paid.
  let interrupted = false;
  let release = null;
  const engine = {
    unload: async () => {},
    interruptGenerate: () => { interrupted = true; if (release) release({ choices: [{ message: { content: 'partial answer' } }] }); },
    chat: { completions: { create: async () => new Promise((res) => { release = res; }) } },
  };
  const backend = makeWebllmBackend({ model: 'Fake-3B', abortGraceMs: 5000 })({ createEngine: async () => engine });
  await backend.load();

  const ctrl = new AbortController();
  const p = backend.phrase([{ role: 'user', content: 'q' }], { signal: ctrl.signal });
  await delay(5);
  ctrl.abort();

  assert.equal(await p, 'partial answer', 'the honoured abort returns what the engine handed back');
  assert.equal(interrupted, true, 'the abort reached interruptGenerate');
  assert.equal(backend.isLoaded(), true, 'a healthy engine is never torn down by a mere Stop');
});
