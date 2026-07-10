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
});

test('model/webllm: a coder variant reuses the builder under its own id', () => {
  // The builder is parameterised (model/coders.js binds MLC coder artifacts through it);
  // a bound variant keeps the shared shape but carries its own id.
  const coder = makeWebllmBackend({ id: 'qwen-coder-1.5b', model: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC' })();
  assert.equal(coder.id, 'qwen-coder-1.5b');
  assert.equal(coder.kind, 'local');
  assert.equal(coder.isLoaded(), false);
});
