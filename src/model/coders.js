// EO: NUL·INS·SEG(Kind → Kind,Entity, Clearing,Making) — coder catalog + registration
// Local coding models — the 2026 small-to-mid open-weight coders, registered as
// pickable backends so the chat surface can be driven by a model trained for code.
//
// WHY a separate file. The talker family (echo / webllm-Llama / Pleias) is tuned for
// reading prose and grounding to sources. A coder is a different instrument: it reads
// source code, answers about it, and emits the structured surface the code organ
// (organs/in/code.js) lowers to EOT. Keeping the coder catalog here means the talker
// roster stays unchanged and a coder is an explicit, opt-in pick — never the default.
//
// WHAT can actually run in a browser. This project is browser-native: WebGPU through
// web-llm (MLC) or CPU/WASM through wllama, with weights streamed once to OPFS. That
// ceiling is real — the workstation-class coders the conversation surveyed (GLM-5.2,
// Kimi K2.6, DeepSeek V4 Pro, Qwen3.6-27B) need tens of GB of VRAM and a native
// runtime (Ollama / llama.cpp / vLLM); they CANNOT load in a tab. So the catalog below
// records the whole field by hardware tier (honest about what each needs), but only the
// browser-feasible members are REGISTERED as live backends. The rest carry a
// `runtime: 'native'` note and a pull command, documented, never silently pretended-runnable.
//
// HOW they load. WebGPU coders reuse the webllm builder (model/webllm.js) bound to an
// MLC artifact id — same engine, streaming and cancellation as the
// Llama default. GGUF coders reuse loadWllamaModel + the ChatML prompt (model/wllama.js),
// exactly as the Pleias backends reuse that path. Nothing is fetched until load() runs.
//
// Sources (the conversation's map, kept for provenance):
//   https://www.kdnuggets.com/top-7-coding-models-you-can-run-locally-in-2026
//   https://pinggy.io/blog/best_open_source_self_hosted_llms_for_coding/
//   https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF
//   https://huggingface.co/mlc-ai  (the WebGPU/MLC prebuilt artifacts)

import { registerBackend } from './interface.js';
import { makeWebllmBackend } from './webllm.js';
import { loadWllamaModel, toPrompt } from './wllama.js';

// ── the catalog ────────────────────────────────────────────────────────────────
// One row per model the field offers, ordered light → heavy. `tier` is the hardware
// class; `runtime` is 'webgpu' | 'wasm' (browser-runnable, registered below) or
// 'native' (Ollama/llama.cpp/vLLM only — documented, not registered). `id` is the
// backend name a browser-runnable row registers under; native rows carry `pull` instead.
export const CODER_MODELS = Object.freeze([
  {
    id: 'qwen-coder-0.5b', label: 'Qwen2.5-Coder 0.5B · GGUF, runs on CPU',
    family: 'Qwen2.5-Coder', params: '0.5B', runtime: 'wasm', tier: '≤8GB RAM, no GPU',
    note: 'The lightest coder that still helps — fits where WebGPU is absent.',
    modelUrl: 'https://huggingface.co/Qwen/Qwen2.5-Coder-0.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-0.5b-instruct-q4_k_m.gguf',
  },
  {
    id: 'qwen-coder-1.5b', label: 'Qwen2.5-Coder 1.5B · runs in your browser (WebGPU)',
    family: 'Qwen2.5-Coder', params: '1.5B', runtime: 'webgpu', tier: '8–16GB',
    note: 'Best in its weight class without a big GPU; the recommended browser coder.',
    model: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
  },
  {
    id: 'qwen-coder-3b', label: 'Qwen2.5-Coder 3B · runs in your browser (WebGPU)',
    family: 'Qwen2.5-Coder', params: '3B', runtime: 'webgpu', tier: '8–16GB',
    note: 'A step up in code reasoning while still fitting a mid GPU.',
    model: 'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC',
  },
  {
    id: 'qwen-coder-7b', label: 'Qwen2.5-Coder 7B · runs in your browser (WebGPU, ~6GB)',
    family: 'Qwen2.5-Coder', params: '7B', runtime: 'webgpu', tier: '16GB+',
    note: '≈85% HumanEval; outperforms Llama-3.3-8B and Mistral-7B on code generation.',
    model: 'Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC',
  },
  // ── workstation / native-only — documented, NOT registered (won't fit a tab) ──
  {
    id: null, label: 'Qwen3.6 27B (4-bit) · best all-round local coder',
    family: 'Qwen3.6', params: '27B', runtime: 'native', tier: 'single 16–24GB GPU (3090/4090)',
    note: 'The 2026 default for native local coding; run via Ollama/llama.cpp.',
    pull: 'ollama pull qwen3.6:27b',
  },
  {
    id: null, label: 'Codestral 22B · fast IDE autocomplete',
    family: 'Codestral', params: '22B', runtime: 'native', tier: 'single 16–24GB GPU',
    note: 'Tuned for low-latency fill-in-the-middle completion.',
    pull: 'ollama pull codestral',
  },
  {
    id: null, label: 'Devstral · multi-file, agentic edits',
    family: 'Devstral', params: '24B', runtime: 'native', tier: 'single 16–24GB GPU',
    note: 'Built for autonomous multi-file work rather than single completions.',
    pull: 'ollama pull devstral',
  },
  {
    id: null, label: 'GLM-5.2 · top open-source coding (LiveBench ≈79.65)',
    family: 'GLM', params: '~355B MoE', runtime: 'native', tier: 'workstation / multi-GPU',
    note: 'Leads open-weight coding; agentic score beats every proprietary model in the table.',
    pull: 'serve via vLLM',
  },
]);

// The subset a browser can actually load — what a picker should offer.
export const browserCoders = () => CODER_MODELS.filter((m) => m.runtime !== 'native');

// ── register the browser-runnable coders ─────────────────────────────────────────
for (const m of CODER_MODELS) {
  if (m.runtime === 'webgpu') {
    // Same web-llm engine as the Llama default, bound to this coder's MLC artifact.
    registerBackend(m.id, makeWebllmBackend({ id: m.id, model: m.model }));
  } else if (m.runtime === 'wasm') {
    // A GGUF coder over the wllama runtime — the Pleias load path, ChatML prompt.
    const url = m.modelUrl;
    registerBackend(m.id, (opts = {}) => {
      let inst = null;
      let loading = null;
      const modelUrl = opts.modelUrl || url;
      return {
        id: m.id,
        kind: 'local',
        isLoaded: () => !!inst,
        async load(onProgress) {
          if (inst)    return;
          if (loading) return loading;
          loading = loadWllamaModel(modelUrl, onProgress).then((i) => { inst = i; });
          return loading;
        },
        async phrase(messages, opts = {}) {
          if (!inst) throw new Error(`${m.id}: not loaded`);
          const signal = opts.signal || null;
          if (signal?.aborted) return '';
          const onToken = typeof opts.onToken === 'function' ? opts.onToken : null;
          let last = '';
          const out = await inst.createCompletion(toPrompt(messages), {
            nPredict: opts.maxTokens ?? 512,
            sampling: { temp: opts.temperature ?? 0.2 },   // code wants a cooler default
            onNewToken: (_tok, _piece, currentText, optsCb) => {
              const text = String(currentText ?? '');
              const delta = text.startsWith(last) ? text.slice(last.length) : text;
              last = text;
              if (delta && onToken) onToken(delta);
              if (signal?.aborted) optsCb?.abortSignal?.();
            },
          });
          return String(out || '').trim();
        },
      };
    });
  }
}
