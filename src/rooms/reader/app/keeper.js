// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines"). The body is
// VERBATIM from the closure; cross-section reach rides ctx (call-time), the core
// spine (state · emit · trail beats · client) is destructured once at install.
// THE MODEL KEEPER — the model heals itself instead of waiting to be asked
import { createHashEmbedder, createMiniLMEmbedder, withPersistentEmbedCache } from '../../../model/index.js';
import { probeModelAlive } from './guards.js';

export const installKeeper = (appCtx) => {
  const { emit, state } = appCtx;
  // ── THE MODEL KEEPER — the model heals itself instead of waiting to be asked ──────────────────
  // A loaded engine can silently become unloaded between turns: webllm drops its own singleton when
  // the WebGPU device is lost (a backgrounded tab, memory pressure, a driver reset), a failed load
  // leaves the chip on "error" until someone retries, and a bfcache restore can revive the page
  // around an engine whose GPU state died with the freeze. Before, ALL of these waited for the next
  // question — which then paid the whole reload on the critical path and could trip the turn
  // watchdog, reading as yet another wedge. The keeper reloads in the BACKGROUND at the moments a
  // recovery is likely to work: the tab coming back to the foreground, the network returning, and a
  // slow 30s watch for the quiet failures nothing announces. Exponential backoff (60s → 10min) on
  // repeated failures so a blocked network is probed politely, not hammered; any success resets it.
  let healFails = 0, healNotBefore = 0;
  const HEAL_WATCH_MS = 30000;
  const healModel = () => {
    if (!state.ready) return;
    if (appCtx.synthesisEnabled && !appCtx.synthesisEnabled()) return;
    if (typeof document !== 'undefined' && document.hidden) return;   // heal when the user can see it
    if (appCtx.model?.isLoaded?.() || appCtx.modelLoading) return;                  // nothing to heal / already healing
    if (Date.now() < healNotBefore) return;                           // backing off a failing load
    appCtx.ensureModel().then(
      () => { healFails = 0; healNotBefore = 0; },
      () => {
        healFails = Math.min(healFails + 1, 6);
        healNotBefore = Date.now() + Math.min(60000 * 2 ** (healFails - 1), 600000);
      },
    );
  };
  // A bfcache restore (pageshow persisted) revives the page's JS — including a `model` handle —
  // around GPU state that may not have survived the freeze. isLoaded() answers true either way,
  // so PROVE it with the same one-token probe the wedge recovery uses; a corpse is freed and
  // reloaded quietly before the user ever asks it anything.
  const verifyRestoredModel = () => {
    const m = appCtx.model;
    if (!m || m.kind !== 'local' || !m.isLoaded?.()) { healModel(); return; }
    const gen = appCtx.modelGen;
    void probeModelAlive(m).then((alive) => {
      if (alive || gen !== appCtx.modelGen || appCtx.model !== m) return;
      appCtx.orphanModel();
      appCtx.freeOrphan(m);
      state.model = { backend: appCtx.backendPref(), state: 'cold', progress: 0, note: 'reloading — the restored tab’s model didn’t survive' };
      emit('model');
      healModel();
    });
  };

  // embedders — hash is instant; MiniLM warms in the background on first ask. MiniLM is
  // wrapped in the persistent cache (model/embed-cache.js): every vector it computes
  // lands in IndexedDB, so a text embedded in ANY session is never embedded again — the
  // reader gets measurably faster the more it operates.
  const hashEmb = createHashEmbedder();
  let minilmWarming = false; appCtx.minilm = null;
  const warmMinilm = () => {
    if (appCtx.minilm?.isWarm?.() || minilmWarming) return;
    minilmWarming = true;
    try {
      appCtx.minilm = withPersistentEmbedCache(createMiniLMEmbedder());
      appCtx.minilm.warm().then(() => { emit('model'); appCtx.buildShapeLib(); }).catch(() => { appCtx.minilm = null; }).finally(() => { minilmWarming = false; });
    } catch { minilmWarming = false; }
  };

  Object.assign(appCtx, { HEAL_WATCH_MS, hashEmb, healModel, verifyRestoredModel, warmMinilm });
};
