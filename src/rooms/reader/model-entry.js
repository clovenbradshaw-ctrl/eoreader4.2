// EO: INS·SYN·DEF(Field,Network → Entity,Lens, Making,Composing) — barrel: models + longgen
// Chat models for the reader — the backends the chat surface can pick.
// echo (instant, offline), webllm (Llama-3.2 over WebGPU — the 3B build by
// default, Fast drops to 1B — plus its Qwen2.5-1.5B sibling under 'qwen'),
// claude (Anthropic's hosted API — the dependable talker, keyed by the user),
// and the Pleias family (Pico / RAG-1B, source-grounded talkers trained only on
// the public-domain Common Corpus, loaded as GGUF through wllama). Each registers
// on import; none pulls anything from a CDN until load() runs. The reader stays
// LLM-free for reading and the grounded panel — a model is only loaded when you
// actually chat, and chat falls back to a structural answer if none is available.
export { createModel } from '../../model/index.js';
export { streamPhrase } from '../../model/index.js';
export { buildChatMessages, buildGroundedMessages, LIBRARIAN_CUE, GROUNDING_CUE, CAPABILITY_CUE } from '../../model/index.js';
// The multi-paragraph walk (docs/paragraph-at-a-time.md, the multi-paragraph-walk
// spec): one paragraph per model call, each a CONTINUATION over a shifting fold,
// bound and vetoed at claim grain. The reader drives it with a `refold` hook (the
// self-read weld — generation drives retrieval) and streams via `onParagraph`.
export { walk, frameLeak, progressAgainst, buildSkeleton, loadInstalledPrior } from '../../weave/longgen/index.js';
// The essay organ (docs/longform-generation.md): commitments before prose. A planned
// spine of section intents is explored → bound → vetoed → rendered one section at a
// time, so a NAMED essay/report comes out a developed, grounded, multi-section piece
// instead of a single padded call. The reader plans the spine (from the research
// facets) and drives it (`retrieve` per section, a wrapped model, `onEvent` to stream).
export { runEssay, projectEssay, EKIND } from '../../weave/essay/index.js';
export { CODER_MODELS, browserCoders } from '../../model/index.js';
// The backends (echo · webllm · anthropic · lmstudio/ollama · the Qwen coders)
// all register on the model ENTRANCE's import — model/index.js side-effect-imports
// each one, and each still downloads nothing until load() runs. The per-backend
// deep imports that used to sit here were redundant with the entrance imports
// above, and pierced the model holon's boundary (docs/holons.md: one entrance).
