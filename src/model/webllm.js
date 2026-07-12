// EO: INS·EVA(Field,Atmosphere → Entity, Making,Tending) — webllm WebGPU backend
// webllm backend — WebGPU, Llama-3.2-3B default.
//
// Heavier than wllama; loads only when explicitly chosen. Same shape
// as the other backends; the rest of the system does not know which is in use.
//
// THE LENS PORT IS RETIRED HERE. This backend used to register a LogitProcessor
// (write/lens-port.js) through logitProcessorRegistry. Registering ANY processor
// forces web-llm onto its slow sampling path — on EVERY decoded token the full
// vocab logit vector is copied GPU→CPU behind a device.sync() stall, handed to JS,
// and copied back to the GPU — whether or not the lens was armed, and it pins the
// engine in-thread (the worker engine ignores the registry). The steering never
// demonstrably moved the surface. The posture now is: trust the model with the
// fold's content (write/paragraphs.js) and keep grounding mechanical and
// downstream — the binder cites, the fact-checker adjudicates, the veto flags.
// write/lens-port.js remains as the pure implementation should a propose-capable
// backend ever want the port back.

import { registerBackend } from './interface.js';
import { makeDecodeGate } from './decode-gate.js';

// Pinned exactly, the same posture as wllama's runtime and the Anthropic SDK: a
// floating '@0.2' re-resolves to every new minor jsdelivr publishes, so the app
// could break overnight with no commit to blame. 0.2.84's whole artifact chain is
// verified live: the +esm bundle, its Llama-3.2 MLC weights on HF, and its
// v0_2_84 kernel wasm on raw.githubusercontent.com.
const WEBLLM_URL = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.84/+esm';

// THE WORKER ENGINE — the durable fix the wedge work (PR #76) named and deferred. The
// main-thread engine (CreateMLCEngine) decodes ON the UI thread: a long generation makes the
// page stutter, and a WEDGED decode freezes it outright — the Stop button can't be clicked,
// the 45s no-progress watchdog can't fire ("Thought for 2:11"), and nothing short of a page
// reload ever recovers. Running the engine in a dedicated worker
// (CreateWebWorkerMLCEngine) moves every decode off the main thread, so:
//   · the UI stays live while the model talks — Stop is always clickable;
//   · the watchdog's timer fires ON TIME, so a stall is caught at 45s, not minutes late;
//   · interruptGenerate() actually lands mid-decode (the worker's event loop is free);
//   · reset() gains a guaranteed kill — worker.terminate() — where a wedged main-thread
//     decode could not be stopped at all.
// The worker is spun from a blob so the no-build static app needs no separate file; it
// imports the SAME pinned bundle, so main thread and worker can never version-skew. The
// weights cache (MLC's Cache API storage) is origin-scoped and shared either way.
const WORKER_SRC =
  `import { WebWorkerMLCEngineHandler } from '${WEBLLM_URL}';\n` +
  `const handler = new WebWorkerMLCEngineHandler();\n` +
  `self.onmessage = (msg) => handler.onmessage(msg);\n`;

// How long an ABORTED decode may keep the engine before it is declared wedged and torn
// down (phrase's backstop below). Generous next to a healthy interrupt (milliseconds),
// tiny next to the 45s watchdog that usually precedes the abort.
const ABORT_GRACE_MS = 4000;

// THE RENDER-SPEED LEVER: which SIZE build to run. The Llama artifacts are already
// at web-llm's 4-bit floor (there is no sub-4-bit Llama-3.2 prebuilt), so the knob
// that actually moves how fast an answer renders is the parameter count, not the bit
// width. The two builds trade fluency for speed:
//   · '1B'  (Fast)   — ~0.9GB, loads ~2× faster, decodes ~2–3× faster, prose a touch plainer.
//   · '3B'  (Fluent) — ~1.9GB, the fuller talker.
// The GROUNDING is identical either way: binding and fact-check are mechanical and
// downstream of the model (weave/write/paragraphs.js, enactor/ground), so the size pick
// moves prose fluency, never what the record can witness. Pure and exported so the pick
// is unit-testable without a DOM or a GPU. An explicit 'fast'/'fluent' pin wins; with no
// pin the device class decides (small ⇒ 1B). Anything else ⇒ the adaptive default.
export const pickSize = (speed, small) =>
  speed === 'fast'   ? '1B'
  : speed === 'fluent' ? '3B'
  : (small ? '1B' : '3B');

// The backend is a parameterised builder so a coding-model variant (model/coders.js)
// can bind a different MLC artifact under its own id WITHOUT duplicating the engine
// wiring below. `webllm` itself is just the builder with the Llama-3.2-3B default;
// a coder passes { id, model } and reuses every line of this path.
export const makeWebllmBackend = (defaults = {}) => (opts = {}) => {
  const id    = defaults.id || 'webllm';
  // An explicit pin (a caller's opts.model / a coder variant's defaults.model) is honoured as-is;
  // otherwise the default 3B build is chosen ADAPTIVELY at load, keyed to the GPU (pickModel below).
  const pinned = opts.model || defaults.model || null;
  // A SIZE pin handed in by the caller (the reader passes its effective Fast/Fluent pick,
  // session-only overrides included, through createModel opts). It wins over the localStorage
  // read below, so an automatic in-session downgrade works without writing the user's saved
  // preference. Anything but 'fast'/'fluent' ⇒ no pin, exactly like speedPrefLS.
  const speedPin = (opts.speed === 'fast' || opts.speed === 'fluent') ? opts.speed : null;
  let engine  = null;
  let loading = null;
  // The dedicated worker behind `engine` when the worker path built it (null for the
  // main-thread fallback and for injected test engines). Held so reset() can terminate it —
  // the one kill that works on a decode too wedged to answer messages.
  let engineWorker = null;
  // The engine constructor. Production imports web-llm from the pinned CDN url and builds the
  // WORKER engine (see WORKER_SRC above), falling back to the main-thread CreateMLCEngine
  // wherever the worker path can't run — no Worker/Blob (old browsers, odd embeds), a blocked
  // blob worker, or a runtime without WebGPU-in-workers. A test injects a fake through
  // opts.createEngine to exercise the load / wedge / reset lifecycle without a GPU or a
  // network. Same contract either way: (model, { initProgressCallback }) → engine.
  const createEngine = typeof opts.createEngine === 'function'
    ? opts.createEngine
    : async (model, cfg) => {
        const mod = await import(/* @vite-ignore */ WEBLLM_URL);
        if (typeof Worker === 'function' && typeof Blob === 'function'
            && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
          let worker = null, blobUrl = null;
          try {
            blobUrl = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
            worker = new Worker(blobUrl, { type: 'module' });
            // A worker that can't even start (CSP on blob workers, a failed module import)
            // errors on the Worker object without ever answering the engine handshake —
            // race it so the fallback runs instead of hanging the load forever.
            const failed = new Promise((_, rej) => {
              worker.addEventListener('error',
                (e) => rej(e?.error || new Error(String(e?.message || 'worker failed to start'))),
                { once: true });
            });
            const eng = await Promise.race([mod.CreateWebWorkerMLCEngine(worker, model, cfg), failed]);
            engineWorker = worker;
            return eng;
          } catch { try { worker?.terminate?.(); } catch { /* never started */ } }
          finally { if (blobUrl) { try { URL.revokeObjectURL(blobUrl); } catch { /* already gone */ } } }
        }
        return mod.CreateMLCEngine(model, cfg);
      };
  // ONE DECODE AT A TIME. The MLC engine runs a single generation loop; a second
  // chat.completions.create while one decodes collides inside the runtime (the
  // intermittent "it hangs this time" when a stopped turn's decode was still
  // unwinding as the next question fired). Every phrase() enters through this gate.
  // `let`, not `const`: reset() swaps in a FRESH gate so a wedged decode's never-settling
  // queue entry can't block the decodes that run after the engine is rebuilt.
  let gate = makeDecodeGate();
  // The MLC artifact this backend actually loaded. A pin is known up front; the adaptive
  // pick (pickModel) is only decided inside load(), so it is captured there. Held for
  // PROVENANCE (describe below) — the audit/export must be able to name the exact build,
  // not just "webllm", since the artifact (1B/3B, f16/f32, or a coder variant) is the model.
  let resolved = pinned || null;

  // A user can pin an explicit MLC artifact through localStorage (eo_webllm_model) to
  // override every heuristic below — an escape hatch for testing a bigger/smaller build
  // without a code change. Empty / unreadable ⇒ ignored, the adaptive pick stands.
  const pinnedLS = () => {
    try {
      if (typeof localStorage === 'undefined') return null;
      const v = localStorage.getItem('eo_webllm_model');
      return v && v.trim() ? v.trim() : null;
    } catch { return null; }
  };

  // The Fast/Fluent pick (eo_llm_speed), the size lever the surface's model chip sets.
  // 'fast' ⇒ the 1B build, 'fluent' ⇒ 3B; empty/unreadable/any other value ⇒ null, i.e.
  // fall back to the adaptive device-class default below. This is a size hint only — it
  // composes with the fp16/fp32 dtype probe, never overrides the full-artifact pin above.
  const speedPrefLS = () => {
    try {
      if (typeof localStorage === 'undefined') return null;
      const v = localStorage.getItem('eo_llm_speed');
      return (v === 'fast' || v === 'fluent') ? v : null;
    } catch { return null; }
  };

  // IS THIS A PHONE / LOW-MEMORY DEVICE. The 3B build is ~1.9GB to download and hold in
  // memory — on a phone or tablet that is a punishing first load and a real OOM risk, and
  // "the model takes forever to load" is almost always this. The 1B build (~0.9GB) loads
  // roughly twice as fast, fits far more devices, and still talks. Signals, any of which
  // is enough: a small `deviceMemory`, a mobile user-agent, or a touch-first machine that
  // reports as desktop (iPadOS 13+ masquerades as Macintosh Safari). Fail-soft — any fault
  // resolves to "not small", i.e. the full 3B default, never a broken pick.
  const isSmallDevice = () => {
    try {
      if (typeof navigator === 'undefined') return false;
      const mem = navigator.deviceMemory;                       // GB, coarse & optional
      if (typeof mem === 'number' && mem > 0 && mem <= 4) return true;
      const ua = navigator.userAgent || '';
      if (/Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|Windows Phone/i.test(ua)) return true;
      if ((navigator.maxTouchPoints || 0) > 1 && /Macintosh/.test(ua)) return true;
      return false;
    } catch { return false; }
  };

  // PICK THE BUILD BY DEVICE CLASS × WHAT THE GPU CAN DO. Two axes:
  //  · SIZE — the Fast/Fluent pin (eo_llm_speed) if the user set one, else adaptive:
  //    1B on a phone/low-memory device (fast to fetch, fits), 3B otherwise. See pickSize.
  //  · DTYPE — the suffix is the accumulation dtype, not the weight width (both are 4-bit):
  //    q4f16_1 accumulates in fp16 and decodes fast, but ONLY on a GPU exposing the WebGPU
  //    `shader-f16` feature. Without it (many integrated/older GPUs, some browsers) q4f16 runs
  //    an emulated path SLOWER than q4f32_1, so the fp32-accumulation build is the right,
  //    broadly-portable default there. Probe the adapter for shader-f16 and take the fast
  //    build only when it's real. Fail-soft — any detection fault (no navigator, no adapter,
  //    a throw) resolves to the portable build of the chosen size, never a broken fetch.
  const pickModel = async () => {
    const explicit = pinnedLS();
    if (explicit) return explicit;
    // SIZE (the render-speed lever): a Fast/Fluent pin wins — the caller's opts.speed first
    // (it carries session-only overrides), then the saved localStorage pick; otherwise the
    // device class decides (small ⇒ 1B). DTYPE is chosen independently below and multiplies onto it.
    const size = pickSize(speedPin || speedPrefLS(), isSmallDevice());
    const f32Build = `Llama-3.2-${size}-Instruct-q4f32_1-MLC`;   // portable — fp32 accumulation
    const f16Build = `Llama-3.2-${size}-Instruct-q4f16_1-MLC`;   // fast — needs the shader-f16 feature
    try {
      if (typeof navigator === 'undefined' || !navigator.gpu) return f32Build;
      const adapter = await navigator.gpu.requestAdapter();
      return (adapter && adapter.features && adapter.features.has('shader-f16')) ? f16Build : f32Build;
    } catch { return f32Build; }
  };

  // TEAR DOWN A WEDGED ENGINE (rooms/reader/app.js resetWedgedLocalModel, and phrase's own
  // abort backstop below). A local decode that stalled has almost certainly lost its GPU
  // device; the engine is a write-once singleton that would otherwise keep answering
  // isLoaded() true and hang every retry — the "Ask again to retry" that never works. Drop
  // the handle so the next load() rebuilds a fresh engine (or the smaller/CPU backup one
  // rung down the ladder takes over), and give the backend a FRESH decode gate so a
  // never-settling queue entry from the wedged decode can't block the rebuilt engine. A
  // worker engine is KILLED, not asked: terminate() ends the decode and frees the GPU with
  // the worker, and works even when the worker is too wedged to answer an unload message —
  // the kill the main-thread engine never had. Idempotent and fail-soft: an already-dead or
  // never-loaded engine simply has nothing to unload, and a hung unload never blocks the
  // caller (it awaits its own promise).
  const hardReset = async () => {
    const eng = engine, w = engineWorker;
    engine = null; loading = null; engineWorker = null;   // isLoaded() → false; load() rebuilds fresh
    gate = makeDecodeGate();                              // a clear queue for the rebuilt engine
    if (w) { try { w.terminate(); } catch { /* already dead */ } return; }
    try { await eng?.unload?.(); } catch { /* engine already gone — the handle drop IS the reset */ }
  };

  return {
    id,
    kind: 'local',
    // PROVENANCE (model/interface.js describeModel): the exact MLC build in play — the pin, or the
    // adaptive pick once load() has run (before load, the pin or a plain "(adaptive)" placeholder).
    // In-browser and local, so the chat export can say the answer never left the machine.
    describe: () => ({ backend: id, kind: 'local', model: resolved || '(adaptive — resolved at load)', label: 'web-llm · WebGPU, in-browser' }),
    isLoaded: () => !!engine,
    async load(onProgress) {
      if (engine)  return;
      if (loading) return loading;
      loading = (async () => {
        const model = pinned || await pickModel();
        resolved = model;   // remember the exact artifact for provenance (describe)
        let eng;
        try {
          eng = await createEngine(model, {
            initProgressCallback: (p) =>
              onProgress?.({ phase: p.text || 'loading', pct: p.progress ?? 0 }),
          });
        } catch (err) {
          // A failed load must not poison this instance: left in place, the rejected
          // promise answered every later load() forever — one CDN/network blip and the
          // backend could never retry. Clear the latch so the next load() starts fresh.
          loading = null;
          throw err;
        }
        engine = eng;
        // WEDGE GUARD (rooms/reader/app.js resetWedgedLocalModel is the other half). The WebGPU
        // device behind this engine can be lost out from under us — a backgrounded tab, memory
        // pressure from the ~1.9GB weights, a driver/GPU reset. When it goes the engine is a
        // zombie: isLoaded() still says true, but every decode hangs on dead GPU state and no
        // retry recovers it (load() early-returns on the non-null engine, above). Listen for the
        // loss and drop the singleton so the NEXT load() rebuilds fresh. Best-effort: not every
        // build exposes the device, and an ordinary 'destroyed' loss on teardown is not a fault.
        try {
          const dev = typeof eng.getGPUDevice === 'function' ? eng.getGPUDevice() : null;
          dev?.lost?.then?.((info) => {
            if (info && info.reason === 'destroyed') return;   // deliberate teardown, not a wedge
            if (engine === eng) void hardReset();   // drop + fresh gate; the next load() rebuilds
          });
        } catch { /* no device handle (the worker engine keeps its device worker-side) —
                     phrase's abort backstop and reset() on a stalled turn still cover the wedge */ }
      })();
      return loading;
    },
    async phrase(messages, opts = {}) {
      if (!engine) throw new Error(`${id}: not loaded`);
      // THIS call's engine. If a reset swaps the singleton while we sit in the queue, the
      // decode we were promised is gone — skip rather than call into a torn-down (or
      // rebuilt-and-busy) engine.
      const eng = engine;
      // CANCELLATION (the Stop button / the turn's stall watchdog): an optional
      // AbortSignal lets the caller halt generation. Already aborted before we start
      // ⇒ draw nothing. Mid-decode we ask the engine to interruptGenerate() and
      // return whatever decoded so far, so the user keeps the partial answer rather
      // than losing the whole beat. BOTH paths honour it — the non-streaming draw
      // used to ignore the signal entirely, so every opaque utility decode (query
      // formulation, sense disambiguation) a stop/stall abandoned kept running as an
      // orphan and held the engine against the next turn.
      const signal = opts.signal || null;
      if (signal?.aborted) return '';
      const params = {
        messages,
        temperature: opts.temperature ?? 0.7,
        max_tokens:  opts.maxTokens ?? 256,
      };
      const onToken = typeof opts.onToken === 'function' ? opts.onToken : null;
      const graceMs = opts.abortGraceMs ?? defaults.abortGraceMs ?? ABORT_GRACE_MS;
      // The gate serializes decodes; a call whose signal aborted while it queued
      // skips the engine entirely. The abort listener attaches only INSIDE the gate,
      // when the running generation is provably ours — attached while queued it
      // would interrupt someone else's decode.
      return gate(async () => {
        if (signal?.aborted || eng !== engine) return '';
        let streamed = '';   // what has decoded so far — the wedge backstop hands it back
        const onAbort = () => { try { eng.interruptGenerate(); } catch { /* engine gone — the checks below still stop us */ } };
        if (signal) signal.addEventListener('abort', onAbort, { once: true });
        const decode = (async () => {
          try {
            // The streaming capability (model/stream.js §): when the turn hands an
            // `onToken`, drive web-llm's streaming completion and emit each delta as it
            // decodes, so the answer fills in live. The accumulated text is returned
            // exactly as the non-streaming call would — byte-identical to before when no
            // callback is handed.
            if (onToken) {
              try {
                const chunks = await eng.chat.completions.create({ ...params, stream: true });
                for await (const chunk of chunks) {
                  const piece = chunk.choices?.[0]?.delta?.content || '';
                  if (piece) { streamed += piece; onToken(piece); }
                  if (signal?.aborted) break;
                }
                if (signal?.aborted) return streamed.trim();   // user stopped — keep the partial answer
                if (streamed.trim()) return streamed.trim();
              } catch { /* a streaming hiccup degrades to the plain draw below — the answer still lands */ }
            }
            if (signal?.aborted) return streamed.trim();
            const out = await eng.chat.completions.create(params);
            return out.choices?.[0]?.message?.content?.trim() || '';
          } finally { if (signal) signal.removeEventListener('abort', onAbort); }
        })();
        if (!signal) return decode;
        // THE WEDGE BACKSTOP. An abort asks the engine to stop; a HEALTHY engine settles in
        // milliseconds. One that doesn't inside the grace window has wedged (a lost GPU
        // device, a dead worker) — and its never-settling promise would otherwise hold the
        // decode gate so EVERY later turn queued behind it forever: the frozen session where
        // exchange 2 hangs and 3 and 4 hang identically behind it. Past the grace we tear the
        // engine down ourselves (terminate the worker / drop the singleton — the next ask
        // reloads fresh) and hand back whatever streamed.
        return new Promise((resolve, reject) => {
          let done = false, timer = null;
          const settle = (fn) => (v) => {
            if (done) return;
            done = true;
            if (timer) clearTimeout(timer);
            signal.removeEventListener('abort', arm);
            fn(v);
          };
          const ok = settle(resolve), fail = settle(reject);
          const arm = () => {
            if (done || timer) return;
            timer = setTimeout(() => { void hardReset(); ok(streamed.trim()); }, graceMs);
          };
          decode.then(ok, fail);
          if (signal.aborted) arm();
          else signal.addEventListener('abort', arm, { once: true });
        });
      });
    },
    reset: hardReset,
  };
};

registerBackend('webllm', makeWebllmBackend());
