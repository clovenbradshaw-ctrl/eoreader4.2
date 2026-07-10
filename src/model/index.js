// EO: INS·SYN·SIG(Field → Entity,Field, Making,Tending) — barrel
// The model holon: swappable LLM backends + the embedder + the grounded prompt.
//
// Built-in backends are registered as a side-effect of importing this index.
// External backends call `registerBackend(name, factory)` at load time.

export { registerBackend, availableBackends, createModel, describeModel } from './interface.js';
export { streamPhrase, surfaceTokens, emitSurface } from './stream.js';
export { createHashEmbedder }   from './embed-hash.js';
export { createMiniLMEmbedder } from './embed.js';
export { buildGroundedMessages, buildChatMessages, SYSTEM_GROUND, SYSTEM_CHAT,
         SYSTEM_GROUND_STRICT, SYSTEM_FREE,
         orientationLine, metadataBlock, orderSpansForFrame,
         EXCERPTS_HEADER, DEFAULT_BUDGET, SUMMARY_GUARD } from './prompt.js';
export { CODER_MODELS, browserCoders } from './coders.js';

import './echo.js';
import './structure.js';
import './wllama.js';
import './webllm.js';
import './anthropic.js';
import './coders.js';
