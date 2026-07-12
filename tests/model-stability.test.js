import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp, probeModelAlive } from '../src/rooms/reader/app.js';
import { createAuditLog } from '../src/rooms/audit/index.js';
import { registerBackend } from '../src/model/interface.js';

// "THE MODELS DON'T STAY LOADED." A loaded engine kept getting dropped for reasons that had
// nothing to do with its health, and every drop is a 140MB–2GB reload the user reads as the app
// being broken. These tests drive the REAL app (createReaderApp) with controllable fake backends
// and pin the lifecycle rules that keep a live engine live:
//
//   1. re-picking the already-active backend (or the already-loaded size) keeps the model;
//   2. a load superseded mid-flight resolves to the CURRENT pick and FREES the orphan engine
//      instead of leaking it (the ~2GB leak that caused the device losses it then "recovered" from);
//   3. a superseded load settling can no longer null a NEWER load's latch (the restart cascade);
//   4. the session-only Fast/Fluent override reaches the backend through createModel opts;
//   5. probeModelAlive tells a dead engine from a merely slow one — the evidence the wedge
//      recovery now demands before tearing anything down.

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// A controllable fake backend: counts factory builds / loads / resets, records the opts the
// app hands it, and loads after an optional delay so a test can supersede it mid-flight.
const makeFake = (id, { kind = 'local', buildName = null, loadDelay = 0 } = {}) => {
  const log = { created: 0, loads: 0, resets: 0, opts: [] };
  registerBackend(id, (opts = {}) => {
    log.created += 1;
    log.opts.push(opts);
    let loaded = false;
    return {
      id, kind,
      describe: () => ({ backend: id, kind, model: buildName, label: id }),
      isLoaded: () => loaded,
      async load(onProgress) {
        log.loads += 1;
        if (loadDelay) await delay(loadDelay);
        loaded = true;
        onProgress?.({ phase: 'ready', pct: 1 });
      },
      async phrase() { return 'ok'; },
      reset() { log.resets += 1; loaded = false; },
    };
  });
  return log;
};

const freshApp = () => createReaderApp({ audit: createAuditLog({ capacity: 64 }) });

test('re-picking the active backend keeps the loaded model; force reloads it', async () => {
  const app = freshApp();
  const log = makeFake('fake-keep');

  app.setBackend('fake-keep');
  const m1 = await app.ensureModel();
  assert.equal(log.created, 1);
  assert.equal(m1.isLoaded(), true);

  // The picker calls setBackend on EVERY row click, including the selected row — before the
  // guard, that click orphaned a fully loaded engine and paid a whole reload for nothing.
  app.setBackend('fake-keep');
  const m2 = await app.ensureModel();
  assert.equal(m2, m1, 'the same backend re-picked keeps the same loaded model');
  assert.equal(log.created, 1, 'no rebuild happened');

  // force is the deliberate reload lane (the claude path re-keys through it: the client
  // bakes the API key in at build, so a re-entered key MUST rebuild).
  app.setBackend('fake-keep', { force: true });
  const m3 = await app.ensureModel();
  assert.notEqual(m3, m1, 'force rebuilds even for the same backend');
  assert.equal(log.created, 2);
});

test('a load superseded mid-flight frees the orphan and resolves to the current pick', async () => {
  const app = freshApp();
  const logSlow = makeFake('fake-slow', { loadDelay: 40 });
  const logNext = makeFake('fake-next');

  app.setBackend('fake-slow');
  const p1 = app.ensureModel();          // the slow load is in flight…
  await delay(10);
  app.setBackend('fake-next');           // …when the user picks another model
  const m2 = await app.ensureModel();
  assert.equal(m2.id, 'fake-next');

  // The superseded caller must get the CURRENT pick — before, it got the orphaned engine
  // (decoding on the build the user just switched away from) and nothing ever freed it:
  // up to ~2GB of GPU/WASM memory leaked per click-during-load.
  const m1 = await p1;
  assert.equal(m1.id, 'fake-next', 'the superseded caller resolves to the current pick, not the orphan');
  await delay(20);                       // let the fire-and-forget freeOrphan run
  assert.ok(logSlow.resets >= 1, 'the orphaned engine was freed (reset), not leaked');

  // The clobber fix: the superseded load settling must NOT null the committed model's latch
  // and trigger yet another rebuild (the old restart cascade).
  const m3 = await app.ensureModel();
  assert.equal(m3, m2, 'no restart cascade after the superseded load settled');
  assert.equal(logNext.created, 1);
});

test('the Fast/Fluent pick rides into the backend, and re-picking the loaded size keeps the model', async () => {
  const app = freshApp();
  // Override the real webllm registration for this process — setSpeed only orphans when
  // webllm is the chosen backend, so the fake must wear its name and a real build id.
  const log = makeFake('webllm', { buildName: 'Llama-3.2-3B-Instruct-q4f32_1-MLC' });

  app.setSpeed('fluent');
  app.setBackend('webllm');
  const m1 = await app.ensureModel();
  assert.equal(log.opts[0].speed, 'fluent', 'the effective speed reaches the backend through createModel opts');

  // Clicking the size that is ALREADY loaded (3B up, Fluent clicked) must keep the engine.
  app.setSpeed('fluent');
  assert.equal(await app.ensureModel(), m1, 'the loaded size re-picked keeps the model');
  assert.equal(log.created, 1);

  // A genuine size change reloads, and the new effective speed rides along.
  app.setSpeed('fast');
  const m2 = await app.ensureModel();
  assert.notEqual(m2, m1, 'a real size change rebuilds');
  assert.equal(log.created, 2);
  assert.equal(log.opts[1].speed, 'fast');

  // The session-only lane (the automatic 3B→1B step): the pref reads back without any storage.
  app.setSpeed('fluent', { persist: false });
  assert.equal(app.speedPref(), 'fluent', 'a session-only speed override is the effective pref');
});

test('probeModelAlive: an answer is life, a throw or a hang is death', async () => {
  // The wedge recovery's evidence step: a 45s stall can be a dead engine OR a merely slow
  // machine, and they need opposite cures. The probe must never throw — only true/false.
  assert.equal(await probeModelAlive({ phrase: async () => 'ok' }), true,
    'an engine that answers one token is alive — it must be KEPT, not torn down');
  assert.equal(await probeModelAlive({ phrase: async () => { throw new Error('webllm: not loaded'); } }), false,
    'an engine whose backend already dropped it is dead');
  assert.equal(await probeModelAlive({ phrase: () => new Promise(() => {}) }, { timeoutMs: 30 }), false,
    'an engine that never answers inside the window is dead');
});
