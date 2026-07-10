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

const WEBLLM_URL = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2/+esm';

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
  let engine  = null;
  let loading = null;

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
    // SIZE (the render-speed lever): a Fast/Fluent pin wins; otherwise the device class
    // decides (small ⇒ 1B). DTYPE is chosen independently below and multiplies onto it.
    const size = pickSize(speedPrefLS(), isSmallDevice());
    const f32Build = `Llama-3.2-${size}-Instruct-q4f32_1-MLC`;   // portable — fp32 accumulation
    const f16Build = `Llama-3.2-${size}-Instruct-q4f16_1-MLC`;   // fast — needs the shader-f16 feature
    try {
      if (typeof navigator === 'undefined' || !navigator.gpu) return f32Build;
      const adapter = await navigator.gpu.requestAdapter();
      return (adapter && adapter.features && adapter.features.has('shader-f16')) ? f16Build : f32Build;
    } catch { return f32Build; }
  };

  return {
    id,
    kind: 'local',
    isLoaded: () => !!engine,
    async load(onProgress) {
      if (engine)  return;
      if (loading) return loading;
      loading = (async () => {
        const model = pinned || await pickModel();
        const mod = await import(/* @vite-ignore */ WEBLLM_URL);
        engine = await mod.CreateMLCEngine(model, {
          initProgressCallback: (p) =>
            onProgress?.({ phase: p.text || 'loading', pct: p.progress ?? 0 }),
        });
      })();
      return loading;
    },
    async phrase(messages, opts = {}) {
      if (!engine) throw new Error(`${id}: not loaded`);
      // CANCELLATION (the Stop button): an optional AbortSignal lets the caller halt
      // generation. Already aborted before we start ⇒ draw nothing. Mid-stream we ask
      // the engine to interruptGenerate() and return whatever decoded so far, so the
      // user keeps the partial answer rather than losing the whole beat.
      const signal = opts.signal || null;
      if (signal?.aborted) return '';
      const params = {
        messages,
        temperature: opts.temperature ?? 0.7,
        max_tokens:  opts.maxTokens ?? 256,
      };
      // The streaming capability (model/stream.js §): when the turn hands an
      // `onToken`, drive web-llm's streaming completion and emit each delta as it
      // decodes, so the answer fills in live. The accumulated text is returned
      // exactly as the non-streaming call would — byte-identical to before when no
      // callback is handed.
      const onToken = typeof opts.onToken === 'function' ? opts.onToken : null;
      if (onToken) {
        // Halt the in-flight decode the moment the caller aborts — web-llm ends the
        // streaming iterator on interruptGenerate().
        const onAbort = () => { try { engine.interruptGenerate(); } catch { /* engine gone — the break below still stops us */ } };
        if (signal) signal.addEventListener('abort', onAbort, { once: true });
        try {
          const chunks = await engine.chat.completions.create({ ...params, stream: true });
          let text = '';
          for await (const chunk of chunks) {
            const piece = chunk.choices?.[0]?.delta?.content || '';
            if (piece) { text += piece; onToken(piece); }
            if (signal?.aborted) break;
          }
          if (signal?.aborted) return text.trim();   // user stopped — keep the partial answer
          if (text.trim()) return text.trim();
        } catch { /* a streaming hiccup degrades to the plain draw below — the answer still lands */ }
        finally { if (signal) signal.removeEventListener('abort', onAbort); }
      }
      if (signal?.aborted) return '';
      const out = await engine.chat.completions.create(params);
      return out.choices?.[0]?.message?.content?.trim() || '';
    },
  };
};

registerBackend('webllm', makeWebllmBackend());
