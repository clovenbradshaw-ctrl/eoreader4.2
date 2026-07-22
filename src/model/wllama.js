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
import { makeDecodeGate } from './decode-gate.js';

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

// THE DEFAULT WEIGHTS ARE A LADDER, NOT A URL. The canonical HuggingFaceTB GGUF
// repo went 401 (gated/private) in mid-2026 — which killed not just this backend
// but the webllm→wllama fallback rung above it, so ANY webllm hiccup ended in
// "no local model could load". A single upstream URL is a single point of failure
// we do not control; the default is now the same SmolLM2-135M-Instruct Q8_0 quant
// on independently-maintained public mirrors, tried in order at load(). The
// canonical repo stays last so it is picked back up the moment it reopens.
export const DEFAULT_MODEL_URLS = Object.freeze([
  'https://huggingface.co/bartowski/SmolLM2-135M-Instruct-GGUF/resolve/main/SmolLM2-135M-Instruct-Q8_0.gguf',
  'https://huggingface.co/unsloth/SmolLM2-135M-Instruct-GGUF/resolve/main/SmolLM2-135M-Instruct-Q8_0.gguf',
  'https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct-GGUF/resolve/main/smollm2-135m-instruct-q8_0.gguf',
]);

// The URLs a load() attempt will walk, in order: an explicit pin is honoured
// alone (the caller chose an exact artifact — silently substituting a mirror
// would break provenance), no pin ⇒ the default ladder. Pure, for the tests.
export const wllamaCandidates = (pinned) =>
  pinned ? [pinned] : [...DEFAULT_MODEL_URLS];

const ARRAYBUFFER_MAX = 2 ** 31 - 1;   // 2,147,483,647 — the per-file ceiling

// A readable model name from a GGUF URL — the file's own basename (…/smollm2-135m-instruct-q8_0.gguf
// → "smollm2-135m-instruct-q8_0.gguf"). For PROVENANCE (describe): a weights URL is the model's
// identity here, but the whole URL is noise in an export, so the audit names the file. Exported for
// the coder backends (model/coders.js) that share this load path. Fail-soft: any fault ⇒ the raw URL.
export const wllamaModelName = (url) => {
  try {
    const clean = String(url || '').split(/[?#]/)[0];
    return decodeURIComponent(clean.split('/').filter(Boolean).pop() || '') || String(url || '');
  } catch { return String(url || ''); }
};

// Recover an honest error from an opaque one. An oversized model surfaces only as
// "network error"; on any load failure we make a best-effort HEAD to read the
// real size and, if that is the cause, name it. Best-effort: if the HEAD itself
// can't run (CORS, offline) we keep the original error rather than guess.
const diagnoseLoadFailure = async (url, err) => {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    // A gone repo answers before a byte moves: 401/403 is a repo that went
    // gated/private, 404 a file that moved. Name it — the runtime's own error
    // for these is an opaque "network error" that reads as the user's wifi.
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      return new Error(
        `the weights are no longer public at ${wllamaModelName(url)}'s repo ` +
        `(HTTP ${res.status}) — the file moved or its repo went gated/private`,
      );
    }
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
    // Free the half-built runtime before walking on. Each mirror attempt constructs a fresh
    // Wllama (a whole WASM module + memory); without this, walking a ladder of dead mirrors
    // stacked one abandoned runtime per rung — real memory pressure on the machines least
    // able to afford it. Best-effort: exit() on a runtime that never fully started may throw.
    try { await inst.exit?.(); } catch { /* nothing started — nothing to free */ }
    throw await diagnoseLoadFailure(modelUrl, err);
  }
  onProgress?.({ phase: 'ready', pct: 1 });
  return inst;
};

registerBackend('wllama', (opts = {}) => {
  let inst = null;
  let loading = null;
  // ONE DECODE AT A TIME. A single llama.cpp context in a single WASM instance —
  // a second createCompletion during a decode corrupts it. phrase() and propose()
  // both enter through this gate (model/decode-gate.js).
  // `let`, not `const`: reset() swaps in a FRESH gate so a wedged decode's
  // never-settling queue entry can't block the decodes after a rebuild.
  let gate = makeDecodeGate();
  // The GGUF actually in play. Before load: the pin or the ladder's head, so
  // describe() can already name the expected artifact; after load: whichever
  // candidate actually answered — the mirror that served the file IS the model's
  // provenance, so the resolved URL replaces the guess.
  let modelUrl = opts.modelUrl || DEFAULT_MODEL_URLS[0];

  return {
    id: 'wllama',
    kind: 'local',
    // The context window (model/context-budget.js): loadWllamaModel takes wllama's default n_ctx
    // (4096), so the guard keeps any assembled prompt under it. Named here as local knowledge —
    // the runtime this backend loads decides the ceiling, and it is 4096 unless that changes.
    contextWindow: 4096,
    // PROVENANCE (model/interface.js describeModel): the GGUF this backend runs, named by its file
    // (wllamaModelName). CPU/WASM and in-browser — the export can state the answer stayed local.
    describe: () => ({ backend: 'wllama', kind: 'local', model: wllamaModelName(modelUrl), label: 'wllama · CPU/WASM, in-browser' }),
    isLoaded: () => !!inst,
    async load(onProgress) {
      if (inst)    return;
      if (loading) return loading;
      loading = (async () => {
        try {
          let lastErr = null;
          for (const url of wllamaCandidates(opts.modelUrl)) {
            try {
              const i = await loadWllamaModel(url, onProgress);
              inst = i; modelUrl = url;
              return;
            } catch (err) { lastErr = err; }   // this mirror is out — walk on
          }
          throw lastErr || new Error('wllama: no weights URL to load');
        } catch (err) {
          // A failed load must not poison this instance: left in place, the rejected
          // promise answered every later load() forever and the backend could never
          // retry (a transient network blip became a permanent "won't load").
          loading = null;
          throw err;
        }
      })();
      return loading;
    },
    // TEAR THE RUNTIME DOWN (the wedge recovery's other half — model/webllm.js has the same
    // contract). Before this, wllama had no reset(): the app-side recovery dropped its handle
    // and the whole WASM module — runtime + weights, hundreds of MB — just lingered until GC
    // felt like it, and repeated recoveries STACKED instances; that memory pressure is itself
    // a model-killer. Drop the handle first (isLoaded() → false at once, a hung exit can never
    // block the reload), give the backend a fresh decode gate so a never-settling entry from a
    // wedged decode can't block the rebuilt runtime, and free the module best-effort behind.
    async reset() {
      const dead = inst;
      inst = null; loading = null;
      gate = makeDecodeGate();
      try { await dead?.exit?.(); } catch { /* already gone — the handle drop is the reset */ }
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
      // The gate serializes decodes; a call whose signal aborted while it queued
      // skips the engine entirely (the per-token check above only fires once a
      // decode is already running).
      return gate(async () => {
        if (signal?.aborted) return '';
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
      });
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
      const completion = gate(() => inst.createCompletion(toPrompt(messages), {
        nPredict: opts.maxTokens ?? 256,
        sampling: { temp: 0 },                 // greedy — no internal sampling
        onNewToken: (_tok, _piece, currentText, optsCb) => {
          // wllama hands the running text; emit the delta as the next token.
          push(currentText);
          if (optsCb && optsCb.abortSignal) { /* the gate has no abort yet */ }
        },
      })).then(() => { done = true; push(null); }, () => { done = true; push(null); });

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
    // model/interface.js's OPTIONAL field-weight capability. ONE forward pass — tokenize, decode,
    // read the next-token distribution wllama already exposes for custom sampling (getLogits) —
    // never a sampling loop, never parsed prose. `choices` are matched case-insensitively at a word
    // boundary against each candidate token's own detokenization (so "yes"/"Yes"/"YES" all count,
    // "yesterday" does not), summed and renormalized over `choices` only. Returns null when NEITHER
    // choice's first token appears in the read-out top-K at all — no signal, not a coin-flip guess.
    // kvClear() resets the context first: weigh() is meant to be called once per candidate in a
    // field, back to back, and a stale KV cache from the PRIOR candidate would bleed into this one.
    async weigh(messages, choices, opts = {}) {
      if (!inst) throw new Error('wllama: not loaded');
      return gate(async () => {
        await inst.kvClear();
        const tokens = await inst.tokenize(toPrompt(messages), true);
        await inst.decode(tokens, {});
        const logits = await inst.getLogits(opts.topK ?? 40);
        const matchers = choices.map((c) => new RegExp(`^\\s*${String(c).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'));
        const mass = choices.map(() => 0);
        for (const { token, p } of logits) {
          const piece = await inst.detokenize([token], true);
          matchers.forEach((re, i) => { if (re.test(piece)) mass[i] += p; });
        }
        const total = mass.reduce((a, b) => a + b, 0);
        if (total <= 0) return null;
        const out = {};
        choices.forEach((c, i) => { out[c] = mass[i] / total; });
        return out;
      });
    },
  };
});

// ChatML assembly — the prompt format SmolLM2 and Qwen2.5(-Coder) both speak. Exported
// so the GGUF coder backends (model/coders.js) reuse it rather than re-deriving it.
export const toPrompt = (messages) =>
  messages.map(m => `<|im_start|>${m.role}\n${m.content}<|im_end|>`).join('\n') +
  '\n<|im_start|>assistant\n';
