// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines"). The body is
// VERBATIM from the closure; cross-section reach rides ctx (call-time), the core
// spine (state · emit · trail beats · client) is destructured once at install.
// model
import { createModel, describeModel } from '../../../model/index.js';
import { probeOrigins, explainReach } from '../../../model/index.js';
import { probeModelAlive } from './guards.js';

export const installModel = (appCtx) => {
  const { emit, logIt, state } = appCtx;
  // ── model ──────────────────────────────────────────────────────────────────
  let backendOverride = null;
  const backendPref = () => {
    if (backendOverride) return backendOverride;
    try { const v = localStorage.getItem('eo_backend'); if (v) return v; } catch { /* default */ }
    return (typeof navigator !== 'undefined' && navigator.gpu) ? 'webllm' : 'wllama';
  };
  // The WebGPU talkers — both ride the web-llm engine, so they share the stall wording,
  // the no-WebGPU blame check, and the wedge ladder's step down to the CPU model.
  const isWebgpuTalker = (b) => b === 'webllm' || b === 'qwen';
  appCtx.model = null; appCtx.modelLoading = null; appCtx.modelGen = 0;
  // Consecutive in-browser decode wedges (a lost / OOM'd WebGPU device). A clean answer clears it
  // (finishMessage); a second straight wedge steps DOWN to the smaller/CPU backup (resetWedgedLocalModel).
  // (localWedges lives on ctx — the wedge streak, cleared by a completed answer)
  // THE ADAPTIVE STALL BUDGET. Every turn arms a no-progress watchdog (makeStallGuard); 45s is
  // right for most machines, but on a slow one a legitimate long prefill outlasts it, the turn
  // is aborted as a "stall", and the engine gets torn down for the crime of being slow. When the
  // wedge probe (probeModelAlive) proves the engine was alive all along, the budget DOUBLES (to a
  // 3-minute ceiling) so later turns on this machine get the room they demonstrably need.
  // Session-only — a fresh visit starts back at 45s.
  appCtx.stallBudgetMs = 45000;
  const STALL_BUDGET_MAX = 180000;
  // Drop the loaded model + orphan any in-flight load, so the next ensureModel starts fresh.
  const orphanModel = () => { appCtx.model = null; appCtx.modelLoading = null; appCtx.modelGen++; };
  // Free an engine the app no longer owns (a superseded load, a bfcache corpse). Fire-and-forget
  // and fail-soft: reset() is optional (claude/echo have none) and an already-dead engine is fine.
  const freeOrphan = (m) => { Promise.resolve().then(() => m?.reset?.()).catch(() => { /* already gone */ }); };
  // `persist: false` is the AUTOMATIC path (the wedge ladder stepping down): the change holds for
  // this session but never overwrites the user's own saved pick — a transient bad day (a
  // backgrounded tab, one OOM) must not permanently hijack their choice of model, which is how
  // "I picked Llama and it keeps coming back as SmolLM2" happened. `force: true` reloads even when
  // the same backend is already up (the claude path re-keys through it).
  const setBackend = (name, { persist = true, force = false } = {}) => {
    const prev = backendPref();
    backendOverride = name;
    if (persist) { try { localStorage.setItem('eo_backend', name); } catch { /* session-only */ } }
    // RE-PICKING THE ACTIVE BACKEND MUST NOT UNLOAD IT. The picker calls this on every row click,
    // including the row already selected — before this guard that click orphaned a fully loaded
    // (or mid-download) engine and paid a whole reload for nothing. Loaded-for-this-name or
    // loading-this-name ⇒ keep it; a prior FALLBACK (pref webllm, wllama actually loaded) does
    // not count as live, so re-picking webllm genuinely retries it.
    const live = (appCtx.model?.isLoaded?.() && appCtx.model.id === name)
      || (!!appCtx.modelLoading && state.model.backend === name && name === prev);
    if (!force && live) { emit('model'); return; }
    // Free the engine being walked away from, same as the wedge/bfcache paths: a dropped
    // handle alone leaves webllm's worker (the whole GPU weight buffer) running forever.
    const old = appCtx.model;
    orphanModel();
    freeOrphan(old);
    state.model = { backend: name, state: 'cold', progress: 0, note: '' };
    emit('model');
  };
  // Fast/Fluent — the render-speed lever for the local Llama (webllm). 'fast' runs the
  // 1B build (~2× faster load, ~2–3× faster decode), 'fluent' the 3B; the pick is read
  // by model/webllm.js at load time. Only the size moves — grounding is mechanical and
  // downstream, so the record it can witness is identical either way. null ⇒ adaptive.
  // `speedOverride` is the session-only lane (the automatic 3B→1B step) — it wins over
  // the saved pick but never touches it, and ensureModel hands the EFFECTIVE speed to
  // the backend (opts.speed) so the override works without a localStorage write.
  let speedOverride = null;
  const speedPref = () => {
    if (speedOverride === 'fast' || speedOverride === 'fluent') return speedOverride;
    try { const v = localStorage.getItem('eo_llm_speed'); if (v === 'fast' || v === 'fluent') return v; } catch { /* default */ }
    return null;
  };
  const setSpeed = (speed, { persist = true } = {}) => {
    if (speed !== 'fast' && speed !== 'fluent') return;
    speedOverride = speed;
    if (persist) { try { localStorage.setItem('eo_llm_speed', speed); } catch { /* session-only */ } }
    // Only webllm reads this. If it is the active backend, orphan the loaded build so the
    // new size takes effect on the next load; for wllama/claude the pin sits dormant and
    // nothing needs to move — just re-emit so the chip reflects the new choice. And if the
    // WANTED size is already the loaded one (clicking Fluent when the adaptive pick landed
    // on 3B, re-clicking the highlighted size), keep the engine — never reload a build that
    // is already up.
    if (backendPref() === 'webllm') {
      const wantSize = speed === 'fast' ? '1B' : '3B';
      const loadedBuild = (appCtx.model?.isLoaded?.() && appCtx.model.id === 'webllm' && describeModel(appCtx.model)?.model) || '';
      if (loadedBuild.includes(`-${wantSize}-`)) { emit('model'); return; }
      const old = appCtx.model;
      orphanModel();
      freeOrphan(old);   // the other-size build's GPU buffers must not outlive the switch
      state.model = { backend: 'webllm', state: 'cold', progress: 0, note: '' };
    }
    emit('model');
  };
  // KEEP THE DOWNLOADED WEIGHTS. Both weight caches are origin storage — wllama streams GGUFs to
  // OPFS, web-llm keeps MLC shards in the Cache API — and un-persisted origin storage is exactly
  // what a browser evicts first under disk pressure. Evicted weights mean the "cached after the
  // first load" promise breaks and the next session silently re-downloads 140MB–2GB: the single
  // biggest "the model didn't stay loaded" between visits. Ask ONCE for durable storage the first
  // time a local model is about to load. Best-effort: Chrome grants silently on engagement,
  // Firefox may prompt, a denial changes nothing — we just stay evictable, as today.
  let persistAsked = false;
  const ensurePersistentStorage = () => {
    if (persistAsked) return;
    persistAsked = true;
    try {
      const st = typeof navigator !== 'undefined' ? navigator.storage : null;
      if (!st || typeof st.persist !== 'function') return;
      Promise.resolve(typeof st.persisted === 'function' ? st.persisted() : false)
        .then((already) => (already ? null : st.persist()))
        .then((granted) => { if (granted) logIt('record', 'Storage marked persistent — the browser won’t evict the downloaded model weights'); })
        .catch(() => { /* stays evictable — no worse than before */ });
    } catch { /* no storage manager here */ }
  };
  const ensureModel = async () => {
    if (appCtx.model?.isLoaded?.()) return appCtx.model;
    if (appCtx.modelLoading) return appCtx.modelLoading;
    const gen = ++appCtx.modelGen;
    const name = backendPref();
    state.model = { backend: name, state: 'loading', progress: 0, note: 'starting…' };
    emit('model');
    appCtx.modelLoading = (async () => {
      const tryLoad = async (backend) => {
        // The EFFECTIVE speed rides in as an opt (session override included) so a
        // persist:false downgrade reaches the backend without a localStorage write.
        const m = createModel(backend, { speed: speedPref() });
        // A local backend is about to put real weight into origin storage — ask (once)
        // that the browser not evict it. Remote backends (claude) store nothing.
        if (m.kind === 'local') ensurePersistentStorage();
        // THE STALL CLOCK. webllm reports progress per fetched CHUNK, and its first
        // chunk is 130–200 MB — on a slow link the chip legitimately sits at
        // "Start to fetch params — 0%" for minutes with no callback at all, which
        // reads as broken ("all models having problems loading") when it is merely
        // mute. And when the network really is blocking the host, that same silent
        // 0% is all the user ever sees. So: count the quiet seconds since the last
        // progress callback and SAY them — first as patience ("the first chunk is
        // large"), and past 90s as the honest suspicion (a blocked host) with a way
        // out. The clock only annotates; it never aborts a slow-but-alive download.
        let lastCb = Date.now(), lastNote = 'starting…';
        const stallClock = setInterval(() => {
          if (gen !== appCtx.modelGen) return;                      // superseded — not ours to narrate
          const quiet = Math.round((Date.now() - lastCb) / 1000);
          if (quiet < 20) return;
          const hint = (isWebgpuTalker(backend) && quiet < 90)
            ? `no data for ${quiet}s — the first chunk is 130–200 MB, a slow link sits at 0% a while`
            : `no data for ${quiet}s — if this never moves, this network may be blocking ` +
              `${backend === 'claude' ? 'api.anthropic.com' : 'huggingface.co'}; pick another model from the chip`;
          state.model = { backend, state: 'loading', progress: state.model.progress || 0, note: `${lastNote} · ${hint}` };
          emit('model');
        }, 10000);
        try {
          await m.load((p) => {
            // Every backend reports progress as { phase, pct } (the shape is spelled out in
            // model/wllama.js and emitted the same by model/webllm.js / anthropic.js). The old
            // code read p.progress / p.text — fields NO backend emits — so `frac` was always 0 and
            // `note` always '': the chip sat at "webllm · 0%" through a multi-GB download and read
            // as stuck / "not loading" until it abruptly finished. Read the real fields.
            const frac = typeof p === 'number' ? p : (p?.pct ?? 0);
            const note = typeof p === 'object' ? (p?.phase || '') : '';
            lastCb = Date.now();
            if (note) lastNote = note;
            // A downloaded chunk is progress: when a turn is already waiting on this load (the user
            // asked mid-download over a slow link), keep its no-progress watchdog alive so the slow
            // download is not mistaken for a hang and aborted as a stall. A truly blocked host emits
            // no chunk, so the guard still trips — this only credits genuine forward motion. No-op
            // during the at-rest prewarm, where no guard is armed (stallGuard is null).
            appCtx.stallGuard?.feed();
            state.model = { backend, state: 'loading', progress: Math.round(frac * 100) / 100, note };
            emit('model');
          });
        } finally { clearInterval(stallClock); }
        return m;
      };
      // LLM-first, always: webllm → wllama, and NO echo in the ladder — a silent
      // fall to the echo skeleton reads as garbage, not an answer. If no LLM can
      // load, the surface says so plainly and offers a retry instead of faking it.
      const ladder = [...new Set([name, 'wllama'])];
      let lastErr = null;
      for (const backend of ladder) {
        try {
          const m = await tryLoad(backend);
          // SUPERSEDED by a newer setBackend/setSpeed/reset while we loaded. The old code
          // returned the orphan uncommitted — every caller then decoded on a build the user
          // had just switched away from, and NOTHING ever freed it: up to ~2GB of GPU/WASM
          // memory leaked per click-during-load, which is exactly the memory pressure that
          // loses WebGPU devices and wedges the NEXT model. Free the orphan and answer with
          // the CURRENT pick instead (ensureModel dedupes, so this joins any load already
          // in flight rather than starting a third).
          if (gen !== appCtx.modelGen) { freeOrphan(m); return ensureModel(); }
          // WARM THE PIPELINE ("shoot a message to get warm"). A local WebGPU/WASM backend pays
          // its shader/kernel warmup on the FIRST decode — silent, no progress tick — so a cold
          // first answer stalls seconds after the download already read "done". Spend it now on a
          // throwaway one-token draw with the chip showing "warming…", so the first real question
          // answers fast (4.1's mount posture). Best-effort and gen-checked: a warmup fault never
          // demotes a model that already loaded; claude (remote) proves itself in load() and the
          // instant skeletons no-op through it.
          if (m.kind === 'local') {
            state.model = { backend, state: 'loading', progress: 1, note: 'warming…' };
            emit('model');
            // Bounded: webllm only arms its wedge backstop when a signal exists, so a
            // signal-less warmup that wedges would hold modelLoading (and the chip at
            // "warming…") for the rest of the session.
            const warmupSignal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(30000) : undefined;
            try { await m.phrase([{ role: 'user', content: '.' }], { maxTokens: 1, temperature: 0, signal: warmupSignal }); } catch { /* warmed or not, it loaded */ }
            if (gen !== appCtx.modelGen) { freeOrphan(m); return ensureModel(); }   // superseded mid-warmup — same as above
          }
          state.model = { backend, state: 'ready', progress: 1, note: backend === name ? '' : `fell back from ${name}` };
          emit('model');
          appCtx.model = m;
          return m;
        } catch (e) {
          lastErr = e;
          if (gen !== appCtx.modelGen) throw e;    // superseded — stop the orphaned ladder quietly
          // Blame WebGPU only when WebGPU is actually absent. webllm also fails on a
          // blocked CDN or weights host, and the old note pointed every such user at
          // chrome://flags — a fix for a problem they didn't have, hiding the real one.
          const noGpu = isWebgpuTalker(backend) && !(typeof navigator !== 'undefined' && navigator.gpu);
          const why = noGpu
            ? 'needs WebGPU (chrome://flags or Chrome/Edge); falling back to the CPU model'
            : String(e?.message || e).slice(0, 120);
          logIt('skip', `Model ${backend} failed to load — ${why}`);
        }
      }
      if (gen === appCtx.modelGen) {
        // The whole ladder is down — the one moment a network probe pays for itself.
        // The runtimes' own errors can't tell "your GPU" from "your firewall"; a
        // 3.5s no-cors HEAD per model host can (model/reach.js), and names the
        // blocked origin in the note instead of leaving an opaque failure.
        let reach = '';
        try { reach = explainReach(await probeOrigins()); } catch { /* nothing provable — say nothing */ }
        state.model = { backend: name, state: 'error', progress: 0,
          note: `No local model could load — ${String(lastErr?.message || lastErr).slice(0, 140)}${reach ? ` · ${reach}` : ''}` };
        emit('model');
      }
      throw lastErr;
    })();
    // Release the latch ONLY if it is still ours. A setBackend/setSpeed mid-load nulls and
    // may REPLACE modelLoading with a fresh load; when the superseded promise then settled,
    // the old unconditional `modelLoading = null` dropped the NEW load's latch — so a third
    // caller started yet another load over it, each supersede orphaning the last: a restart
    // cascade that read as "the model never finishes loading".
    const p = appCtx.modelLoading;
    try { return await p; } finally { if (appCtx.modelLoading === p) appCtx.modelLoading = null; }
  };

  // RECOVER A WEDGED IN-BROWSER MODEL. The no-progress watchdog fired on a LOCAL turn — the decode
  // went dark before its first token, or streamed a preamble and then died mid-decode (the
  // frozen-session shape) — the WebGPU engine has almost certainly lost its device (a backgrounded
  // tab, memory pressure from the ~1.9GB 3B weights, a driver reset). That engine is a singleton that
  // still claims isLoaded(), so every "Ask again to retry" calls into the corpse and stalls the same
  // way — the loop behind "why's it stuck". (The decode gate in model/webllm.js serializes decodes so
  // an OVERLAP can't wedge the runtime; this is the other failure — the device dying under a lone
  // decode — which the gate can't reach.) Tear it down so the NEXT ask reloads a fresh engine, and
  // keep the user's backup: a SECOND straight wedge steps DOWN the ladder — Fluent 3B → Fast 1B, then
  // 1B → the CPU model (wllama) — so a machine that can't hold the big build still answers. Whichever
  // model ends up talking is named in the record: every turn stamps describeModel(model)
  // (turn/pipeline.js) and the export dedups them, so a mid-session downgrade shows both. Synchronous
  // and fire-and-forget: the answer bubble settles now; recovery runs behind it.
  let wedgeProbe = null;   // the in-flight liveness check — concurrent stalls share one verdict
  const resetWedgedLocalModel = () => {
    const m = appCtx.model;
    if (!m || m.kind !== 'local') return;   // a remote talker (claude) has no engine; a healthy model is never sent here
    if (wedgeProbe) return;                 // two turns stalling together get ONE probe, one strike, one budget bump
    const gen = appCtx.modelGen;
    state.model = { ...state.model, note: 'the turn stalled — checking the in-browser model…' };
    emit('model');
    // THE EVIDENCE STEP (probeModelAlive above). A 45s no-progress stall has two causes that need
    // OPPOSITE cures: a dead engine (lost GPU device / dead worker) must be torn down and rebuilt,
    // but a slow-but-alive one must be LEFT ALONE — tearing it down pays a pointless reload and,
    // two strikes later, silently downgrades the user's pick. So ask the engine itself: one token,
    // raced against a window. A truly wedged webllm has already been killed from inside by its own
    // abort backstop (isLoaded() false ⇒ the probe's phrase throws at once), so the dead verdict is
    // usually immediate; the full window is only ever spent on an engine that is genuinely working.
    wedgeProbe = (async () => {
      const alive = await probeModelAlive(m);
      // Superseded while probing (the user switched models, a retry already reloaded) — not ours.
      if (gen !== appCtx.modelGen || appCtx.model !== m) return;
      if (alive) {
        // The engine answered: it never wedged, the machine is just SLOW. Keep it loaded — this
        // is the whole point — clear the strike, and widen the stall budget so the next long
        // prefill isn't aborted for lateness again.
        appCtx.localWedges = 0;
        appCtx.stallBudgetMs = Math.min(appCtx.stallBudgetMs * 2, STALL_BUDGET_MAX);
        logIt('record', `The in-browser model is alive, just slow — turns now get ${Math.round(appCtx.stallBudgetMs / 1000)}s before a stall is called`);
        state.model = { backend: state.model.backend || backendPref(), state: 'ready', progress: 1, note: 'slow but alive — kept loaded' };
        emit('model');
        return;
      }
      appCtx.localWedges += 1;
      // Drop the app's handle FIRST so a slow/hung unload can never block the reload; free the
      // engine's memory in the background (reset → unload/terminate/exit), never awaited.
      orphanModel();
      freeOrphan(m);
      if (appCtx.localWedges >= 2) {
        // A repeat PROVEN wedge — this device likely can't hold the current build. Step to the
        // backup for THIS SESSION ONLY (persist: false): the user's saved pick stays theirs, so a
        // transient bad day (a backgrounded tab, one OOM) can't permanently hijack it — the next
        // visit tries their real choice again.
        // The default IS the 3B build now, so any webllm that isn't explicitly pinned to
        // 'fast' is on the big build and has the lighter 1B rung to step down to first; only
        // an explicit 'fast' pin is already at the smallest webllm build and drops straight
        // to the CPU rung instead of wasting a wedge cycle reloading the same size.
        if (backendPref() === 'webllm' && speedPref() !== 'fast') {
          logIt('skip', 'In-browser model kept dying — dropping to the faster 1B build for this session');
          setSpeed('fast', { persist: false });
        } else if (isWebgpuTalker(backendPref())) {
          logIt('skip', 'WebGPU model kept dying — switching to the CPU model for this session');
          setBackend('wllama', { persist: false });
        } else {
          state.model = { backend: backendPref(), state: 'cold', progress: 0, note: 'reloading — the model stopped responding' };
          emit('model');
        }
        appCtx.localWedges = 0;
      } else {
        state.model = { backend: backendPref(), state: 'cold', progress: 0, note: 'the in-browser model stopped responding — reloading' };
        emit('model');
      }
      // Warm the fresh pick in the background so the retry answers fast instead of paying the reload on
      // the critical path (the mount-time prewarm posture). Browser only; a manual retry also triggers it.
      if (typeof window !== 'undefined') setTimeout(() => { ensureModel().catch(() => { /* the ladder logs its own failure */ }); }, 200);
    })().catch(() => { /* recovery must never throw */ }).finally(() => { wedgeProbe = null; });
  };

  Object.assign(appCtx, { backendPref, ensureModel, freeOrphan, orphanModel, resetWedgedLocalModel, setBackend, setSpeed, speedPref });
};
