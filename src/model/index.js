// EO: INS·SYN·SIG(Field → Entity,Field, Making,Tending) — barrel
// The model holon: swappable LLM backends + the embedder + the grounded prompt.
//
// Built-in backends are registered as a side-effect of importing this index.
// External backends call `registerBackend(name, factory)` at load time.

export { registerBackend, availableBackends, createModel, describeModel } from './interface.js';
// The remote-talk privacy membrane — redact real entities before a hosted talker sees them.
export { wrapRedacting } from './redact-remote.js';
// The blind-structure loop — reason over the EOT SHAPE of a referent, restore it, then gate the
// return on propositional continuity (the meaning-withheld membrane, ideally for code generation).
export { generateOverStructure, continuityGate, propositionsOf, blindPrompt, blindCharge,
         makeStreamRestorer } from './blind-structure.js';
export { POLARITY } from './polarity.js';
export { streamPhrase, surfaceTokens, emitSurface } from './stream.js';
// The one decode organ: a guarded phrase that returns the caller's fallback on any fault.
export { speak } from './speak.js';
export { createHashEmbedder }   from './embed-hash.js';
export { createMiniLMEmbedder } from './embed.js';
// The persistence layer under any embedder: vectors survive the session in IndexedDB,
// so a text embedded in ANY session is never embedded again.
export { withPersistentEmbedCache } from './embed-cache.js';
export { buildGroundedMessages, buildChatMessages, SYSTEM_GROUND, SYSTEM_CHAT,
         SYSTEM_GROUND_STRICT, SYSTEM_FREE,
         orientationLine, metadataBlock, orderSpansForFrame,
         EXCERPTS_HEADER, DEFAULT_BUDGET, SUMMARY_GUARD } from './prompt.js';
// The prompt as a Site (docs/prompt-as-site.md): the band catalog + projections,
// and the input-side checkpoint that judges what the talker is handed.
export { GROUNDED_BANDS, CURSOR_BANDS, CHAT_BANDS, TERRAIN_GRAIN,
         projectBands, projectGroundedBands, projectCursorBands, projectChatBands } from './bands.js';
export { judgePrompt, terrainShares, deriveWidth,
         PROMPT_ERROR_TAXONOMY, STANCE_GRAIN, GRADIENT_BACKGROUND } from './prompt-checkpoint.js';
export { CODER_MODELS, browserCoders } from './coders.js';

import './echo.js';
import './structure.js';
import './wllama.js';
import './webllm.js';
import './anthropic.js';
import './openai-local.js';
import './coders.js';

// (seam healing) re-exported so the module stays behind the entrance
export { explainReach, probeOrigins } from './reach.js';
export { CAPABILITY_CUE, GROUNDING_CUE, LIBRARIAN_CUE, buildCursorMessages } from './prompt.js';
