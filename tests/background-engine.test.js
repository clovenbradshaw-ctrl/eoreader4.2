import { test } from 'node:test';
import assert from 'node:assert/strict';

import { installModel } from '../src/rooms/reader/app/model.js';

// The dedicated background engine (the CPU murmur, on its own — app/model.js). The at-rest murmur
// passes share the ONE foreground engine, so on a GPU session their prose queues on the foreground's
// single decode gate behind the reader's summaries. The design's promise: once contention is
// habitual AND the foreground is a GPU talker, a SEPARATE small wllama (CPU) loads and the murmur
// moves onto it — but a light session, or a CPU-only foreground (a second wllama would just fight for
// the same cores), NEVER pays for the second model. These lock the network-safe invariants of that
// promise without standing up a real runtime — the foreground backend is pinned via setBackend so
// the tests never touch navigator or the network.

// A minimal spine — installModel only reaches emit / logIt / state off the ctx.
const stubCtx = (backend) => {
  const ctx = { emit: () => {}, logIt: () => {}, state: { model: { backend: null, state: 'cold', progress: 0, note: '' } } };
  installModel(ctx);
  if (backend) ctx.setBackend(backend, { persist: false });   // pin the foreground engine, no localStorage/navigator
  return ctx;
};

test('the background engine starts absent and bgTalker falls back to the foreground engine', () => {
  const ctx = stubCtx();
  assert.equal(ctx.bgReady(), false);
  assert.equal(ctx.bgModel, null);
  assert.equal(ctx.bgTalker(), ctx.model);   // no dedicated engine ⇒ the shared foreground one
});

test('a CPU-only foreground never loads a second engine, however habitual the contention', () => {
  const ctx = stubCtx('wllama');
  assert.equal(ctx.loadBackgroundModel(), null);        // a second CPU engine would just contend — refused up front
  for (let i = 0; i < 12; i++) ctx.noteBgYield();       // well past the threshold
  assert.equal(ctx.bgReady(), false);
  assert.equal(ctx.bgModel, null);
  assert.equal(ctx.bgLoading, null);                    // never even attempted
});

test('below the yield threshold, no background load is attempted even on a GPU foreground', () => {
  const ctx = stubCtx('webllm');
  ctx.noteBgYield();
  ctx.noteBgYield();                                    // two yields — one short of the threshold (3)
  assert.equal(ctx.bgLoading, null);                    // still no load kicked
  assert.equal(ctx.bgReady(), false);
});
