// EO: INS(Field → Entity, Making) — wllama CPU/WASM backend
// wllama backend — CPU/WASM, SmolLM2-135M default.
//
// The runtime is fetched by URL on first load; the page-open cost is 0. This is
// the smooth-loading default for users without WebGPU.
//
// Two things the loader has to get right, both of which also serve the Pleias
// backends (pleias.js) that share this exact path:
//
//   1. The wasm runtime. wllama's JS wrapper does not ship its wasm beside
//      index.js — it loads two wasm binaries (single- and multi-thread) by URL,
//      and that path map MUST be handed to the constructor. With no map
//      (`new Wllama({})`) it resolves the wasm against the page origin, fetches
//      our index.html instead, and dies inside WebAssembly.instantiate ("expected
//      magic word 00 61 73 6d, found 3c 21 44 4f" — the bytes of "<!DO…"). We
//      give it CDN paths (WLLAMA_WASM) pinned to the runtime version so the
//      wrapper and its wasm stay a matched pair; the bare `@2` tag floats.
//
//   2. The 2GB per-file ceiling. wllama reads each GGUF into one ArrayBuffer
//      (max 2^31-1 bytes), so a single file over ~2GB cannot load — the runtime
//      fails deep down and the browser reports only a bare "network error". A
//      model that big must be split into shards (docs/large-models.md);
//      `diagnoseLoadFailure` recovers the real size on failure and names it.
//
// Caching is automatic: wllama streams every download to OPFS (it never holds the
// whole file in memory) and `allowOffline` lets that cached copy reload with no
// network — so a model is fetched once and then opens from disk.

import { registerBackend } from './interface.js';

// Pinned to 2.3.7, the last release before wllama 2.4.0 made Memory64 (wasm64) a
// hard requirement. 2.4.0 drops Safari and any browser without memory64 support,
// where loading a model crashes mid-parse as "Invalid typed array length: …" —
// the glue misreading 64-bit memory. 2.3.x is the broadly compatible line.
const WLLAMA_VERSION = '2.3.7';
const WLLAMA_BASE = `https://cdn.jsdelivr.net/npm/@wllama/wllama@${WLLAMA_VERSION}/esm`;
const WLLAMA_RUNTIME_URL = `${WLLAMA_BASE}/index.js`;
// The wasm assets the constructor needs, keyed by the logical names wllama looks
// up. Mapped by hand (rather than importing wllama's generated wasm-from-cdn — it
// ships only as .ts source, so the .js 404s on the CDN) and pinned to the runtime
// version so the pair can't drift. wllama picks single- vs multi-thread itself.
const WLLAMA_WASM = {
  'single-thread/wllama.wasm': `${WLLAMA_BASE}/single-thread/wllama.wasm`,
  'multi-thread/wllama.wasm':  `${WLLAMA_BASE}/multi-thread/wllama.wasm`,
};

const DEFAULT_MODEL_URL =
  'https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct-GGUF/resolve/main/smollm2-135m-instruct-q8_0.gguf';

const ARRAYBUFFER_MAX = 2 ** 31 - 1;   // 2,147,483,647 — the per-file ceiling

// Recover an honest error from an opaque one. An oversized model surfaces only as
// "network error"; on any load failure we make a best-effort HEAD to read the
// real size and, if that is the cause, name it. Best-effort: if the HEAD itself
// can't run (CORS, offline) we keep the original error rather than guess.
const diagnoseLoadFailure = async (url, err) => {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    const size = Number(
      res.headers.get('content-length') || res.headers.get('x-linked-size') || 0,
    );
    if (size > ARRAYBUFFER_MAX) {
      return new Error(
        `model is ${(size / 2 ** 30).toFixed(2)}GB — over wllama's 2GB per-file ` +
        `limit; split it into shards or use a smaller quant (docs/large-models.md)`,
      );
    }
  } catch { /* couldn't size it — keep the original error */ }
  return err instanceof Error ? err : new Error(String(err));
};

// Load a GGUF model through the wllama WASM runtime. Returns the live Wllama
// instance. `onProgress` receives the same { phase, pct } shape every backend
// reports, so the UI's loader does not care which model is on the other end.
// A split model loads the same way — pass the first shard's URL (…-00001-of-…)
// and wllama fetches, caches and assembles the rest.
export const loadWllamaModel = async (modelUrl, onProgress) => {
  onProgress?.({ phase: 'fetch-runtime', pct: 0.05 });
  const { Wllama } = await import(/* @vite-ignore */ WLLAMA_RUNTIME_URL);
  const inst = new Wllama(WLLAMA_WASM, { allowOffline: true });
  onProgress?.({ phase: 'fetch-weights', pct: 0.2 });
  try {
    await inst.loadModelFromUrl(modelUrl, {
      progressCallback: ({ loaded, total }) => {
        const pct = 0.2 + 0.75 * (loaded / Math.max(total, 1));
        onProgress?.({ phase: 'fetch-weights', pct });
      },
    });
  } catch (err) {
    throw await diagnoseLoadFailure(modelUrl, err);
  }
  onProgress?.({ phase: 'ready', pct: 1 });
  return inst;
};

registerBackend('wllama', (opts = {}) => {
  let inst = null;
  let loading = null;
  const modelUrl = opts.modelUrl || DEFAULT_MODEL_URL;

  return {
    id: 'wllama',
    kind: 'local',
    isLoaded: () => !!inst,
    async load(onProgress) {
      if (inst)    return;
      if (loading) return loading;
      loading = loadWllamaModel(modelUrl, onProgress).then((i) => { inst = i; });
      return loading;
    },
    async phrase(messages, opts = {}) {
      if (!inst) throw new Error('wllama: not loaded');
      // The streaming capability (model/stream.js §): when the answer loop hands an
      // `onToken`, decode token-by-token and emit each delta as it arrives, so the
      // UI sees the beat form left to right (§3a). wllama hands the running text on
      // each new token; we emit the delta. Absent `onToken`, createCompletion still
      // samples the whole reply and returns it — byte-identical to before.
      // CANCELLATION (the Stop button): an optional AbortSignal halts generation. wllama
      // hands each token callback an abortSignal controller — call its abort() to stop the
      // decode; the running text it already streamed is returned as the partial answer.
      const signal = opts.signal || null;
      if (signal?.aborted) return '';
      const onToken = typeof opts.onToken === 'function' ? opts.onToken : null;
      let last = '';
      const out = await inst.createCompletion(toPrompt(messages), {
        nPredict: opts.maxTokens ?? 256,
        sampling: { temp: opts.temperature ?? 0.7 },
        onNewToken: (_tok, _piece, currentText, optsCb) => {
          const text = String(currentText ?? '');
          const delta = text.startsWith(last) ? text.slice(last.length) : text;
          last = text;
          if (delta && onToken) onToken(delta);
          if (signal?.aborted) optsCb?.abortSignal?.();   // user stopped — halt the decode
        },
      });
      return String(out || '').trim();
    },
    // The grounded-speech capability (model/interface.js §). wllama exposes the
    // decode path, so the talker can drive it under the gate. This is the
    // GREEDY decode-path read: temperature 0, streamed token-by-token through
    // onNewToken, each piece yielded as a one-hot Dist (logprob 0). It exposes
    // the decode WITHOUT temperature sampling — the gate drives collapse and
    // rollback at the proposition above it. True per-token logprob access (a
    // real distribution rather than the greedy one-hot) is a follow-up the gate
    // is already shaped for; until then a one-hot greedy stream is the honest,
    // non-breaking propose. Absent this method a backend keeps phrase()+veto.
    async *propose(messages, opts = {}) {
      if (!inst) throw new Error('wllama: not loaded');
      const queue = [];
      let resolve = null;
      let done = false;
      const push = (piece) => {
        if (piece) queue.push(piece);
        if (resolve) { const r = resolve; resolve = null; r(); }
      };
      const completion = inst.createCompletion(toPrompt(messages), {
        nPredict: opts.maxTokens ?? 256,
        sampling: { temp: 0 },                 // greedy — no internal sampling
        onNewToken: (_tok, _piece, currentText, optsCb) => {
          // wllama hands the running text; emit the delta as the next token.
          push(currentText);
          if (optsCb && optsCb.abortSignal) { /* the gate has no abort yet */ }
        },
      }).then(() => { done = true; push(null); }, () => { done = true; push(null); });

      let last = '';
      while (true) {
        if (!queue.length) {
          if (done) break;
          await new Promise((r) => { resolve = r; });
          continue;
        }
        const currentText = String(queue.shift());
        const delta = currentText.startsWith(last) ? currentText.slice(last.length) : currentText;
        last = currentText;
        for (const t of (delta.match(/[A-Za-z0-9'’]+|[^\sA-Za-z0-9]/g) || [])) {
          yield { tokens: [{ token: t, logprob: 0 }] };
        }
      }
      await completion;
    },
  };
});

// ChatML assembly — the prompt format SmolLM2 and Qwen2.5(-Coder) both speak. Exported
// so the GGUF coder backends (model/coders.js) reuse it rather than re-deriving it.
export const toPrompt = (messages) =>
  messages.map(m => `<|im_start|>${m.role}\n${m.content}<|im_end|>`).join('\n') +
  '\n<|im_start|>assistant\n';
