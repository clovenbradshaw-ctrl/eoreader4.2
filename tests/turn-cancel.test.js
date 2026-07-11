import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';
import { createAuditLog } from '../src/rooms/audit/index.js';
import { registerBackend } from '../src/model/interface.js';
import { formulateSearchQuery } from '../src/turn/web.js';
import { modelDisambiguator } from '../src/turn/disambiguate.js';

// THE INTERMITTENT HANG (the "it doesn't close out the chat" report). Two regressions
// conspired:
//
//   1. the module-level `abort`/`stallGuard` were shared across turns, so when turns
//      overlapped (ask in one topic, switch, ask in another) the first turn's finally
//      cleared the SECOND turn's live watchdog and nulled the Stop button's controller —
//      that turn could then hang forever at "● reading the record" with a dead Stop;
//   2. the opaque utility decodes (query formulation, sense disambiguation, the rewrite
//      loop) never received the turn's AbortSignal, so a Stop/stall left them running as
//      orphans that held the single local engine against the next turn.
//
// These tests drive the REAL app (createReaderApp) with a controllable backend: phrase()
// hangs until the test releases it, which is exactly the shape of a slow local decode.

const BOOK =
  'Gregor woke to find himself changed. His body was hard and armored. ' +
  'The family gathered at the door and would not enter. Grete brought him food but looked away. ' +
  'The chief clerk arrived and demanded an explanation. Gregor could not make himself understood.';
// A distinct second corpus: an identical paste would dedupe by hash onto the first
// topic's source, leaving the second topic with no docs — and an empty-record turn in
// web mode `off` settles before ever arming, which would quietly defeat the overlap.
const BOOK2 =
  'The lighthouse keeper logged the storm at midnight. Waves broke over the seawall for hours. ' +
  'By morning the harbor was littered with kelp and splintered crates. The ferry stayed in port. ' +
  'The keeper brewed coffee and wrote that the light never failed.';

const tick = () => new Promise((r) => setTimeout(r, 10));
const until = async (cond, ms = 2000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('condition never held');
    await tick();
  }
};
// Settle-or-timeout: on the broken code the hung turn never settles — surface that as a
// clean assertion failure instead of a test-runner timeout.
const settles = (p, ms = 3000) => Promise.race([
  p.then(() => true),
  new Promise((r) => setTimeout(() => r(false), ms)),
]);

// A backend whose FIRST phrase() hangs until the test releases it; every later call
// answers at once — so a second turn can complete while the first turn's decode is
// still stuck (the exact shape of the reported hang). Registered under a per-test id
// so no state leaks between tests.
const hangingBackend = (id) => {
  const state = { calls: 0, release: () => {} };
  registerBackend(id, () => ({
    id, kind: 'local',
    isLoaded: () => true,
    async load(onProgress) { onProgress?.({ phase: 'ready', pct: 1 }); },
    async phrase(_messages, opts = {}) {
      if ((opts.maxTokens ?? 0) === 1) return '.';   // the load-time warmup draw — instant
      state.calls++;
      if (state.calls === 1) await new Promise((res) => { state.release = res; });
      return 'The answer, plainly.';
    },
  }));
  return state;
};

const freshApp = async () => {
  const app = createReaderApp({ audit: createAuditLog({ capacity: 64 }) });
  if (!app.state.ready) {
    await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  }
  app.setWebMode('off');   // keep every turn off the network — this is a cancellation test
  return app;
};

test('overlapping turns: the first turn settling must not kill the Stop button for the second', async () => {
  const backend = hangingBackend('hang-overlap');
  const app = await freshApp();
  app.setBackend('hang-overlap');

  // Turn 1 — hangs inside its decode.
  app.ingestText(BOOK, 'Doc one');
  const p1 = app.ask('What happened to Gregor?');
  await until(() => backend.calls >= 1);

  // Turn 2 — a second topic, overlapping turn 1 (the surface allows this: the
  // send guard is per-topic). Its decode answers at once; turn 1 stays stuck.
  app.topicNew('Second topic');
  app.ingestText(BOOK2, 'Doc two');
  const p2 = app.ask('What did the keeper log at midnight?');
  assert.equal(await settles(p2), true, 'turn 2 settles while turn 1 still decodes');

  // Release turn 1's decode: it settles too — its watchdog and controller survived
  // turn 2's cleanup.
  backend.release();
  assert.equal(await settles(p1), true, 'turn 1 settles once its decode answers');
  for (const t of app.state.topics) {
    for (const m of t.messages) assert.equal(!!m.pending, false, 'no bubble is left pending');
  }
});

test('a turn left hanging keeps a live Stop after another turn completes', async () => {
  const backend = hangingBackend('hang-stop');
  const app = await freshApp();
  app.setBackend('hang-stop');

  // Turn 1 hangs in its decode…
  app.ingestText(BOOK, 'Doc one');
  const p1 = app.ask('What happened to Gregor?');
  await until(() => backend.calls >= 1);

  // …turn 2 runs in another topic and COMPLETES (only the backend's first call hangs).
  app.topicNew('Second topic');
  app.ingestText(BOOK2, 'Doc two');
  const p2 = app.ask('What did the keeper log at midnight?');
  assert.equal(await settles(p2), true, 'turn 2 completes normally');

  // The regression: turn 2's finally used to null the module controller — Stop went dead
  // and turn 1 could never settle. Now every live turn keeps its own controller and
  // stop() halts them all.
  app.stop();
  assert.equal(await settles(p1), true, 'Stop still reaches the hung first turn');
  const m1 = await p1;
  assert.equal(m1.pending, false, 'the first bubble is finalized');
  assert.equal(m1.route, 'stopped', 'the first turn reads as stopped, not crashed');
});

test('formulateSearchQuery threads the turn signal into the model decode', async () => {
  let seen = null;
  const model = { phrase: async (_m, opts) => { seen = opts; return 'dolphins'; } };
  const ctrl = new AbortController();
  const q = await formulateSearchQuery({ model, question: 'write me an essay about dolphins', signal: ctrl.signal });
  assert.equal(q, 'dolphins');
  assert.equal(seen && seen.signal, ctrl.signal, 'the decode received the turn signal');
});

test('modelDisambiguator threads the turn signal into the model decode', async () => {
  let seen = null;
  const model = { phrase: async (_m, opts) => { seen = opts; return '{"ambiguous":false}'; } };
  const ctrl = new AbortController();
  await modelDisambiguator(model, { question: 'dolphins', signal: ctrl.signal })('dolphins');
  assert.equal(seen && seen.signal, ctrl.signal, 'the decode received the turn signal');
});
