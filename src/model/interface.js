// EO: INS(Kind → Entity, Making) — backend registry + createModel
// The model interface.
//
// A backend is a factory: createBackend(opts) → {
//   id, kind, isLoaded(),
//   load(onProgress) → Promise<void>,
//   phrase(messages, opts) → Promise<string>,        // the golden path — sample-then-return
//   propose?(messages, opts) → AsyncIterator<Dist>,  // OPTIONAL — the grounded-speech path
// }
//
// `phrase` is the sample-then-return contract: the backend draws the whole
// reply and hands back the string. It stays for the golden path and for any
// backend without logit access — the talker falls back to it transparently.
//
// `propose` is the new, OPTIONAL capability the grounded-speech gate drives
// (enactor/gate.js). It exposes the next-token distribution at the current
// position WITHOUT the backend sampling — the enactor drives sampling through
// the gate, one proposition past the committed edge, and rolls back what fails
// to ground. A backend that cannot expose its distribution simply omits
// `propose`; the talker detects its absence (model.propose == null) and uses
// phrase()+veto, byte-identical to today.
//
//   Dist = { tokens: [{ token, logprob }, …] }   // the distribution at this position
//
// The consumer drives the iterator with `.next(pick)`: it inspects the yielded
// Dist, chooses a token (the gate's sampler), and passes it back to commit that
// token and advance. No weights are touched — `propose` is a decode-path read.
//
// An embedder is a separate thing entirely:
//   { id, isWarm(), warm() → Promise, embed(text) → Promise<Float32Array> }
//
// The turn pipeline takes a model and an embedder by dependency injection.
// No turn code ever knows which backend it has.

import { fitMessages } from './context-budget.js';

const backends = new Map();

export const registerBackend = (name, factory) => {
  if (typeof factory !== 'function') {
    throw new TypeError(`registerBackend: factory must be a function`);
  }
  backends.set(name, factory);
};

export const availableBackends = () => [...backends.keys()];

// A backend's CONTEXT WINDOW — the token ceiling the model can hold at once — read off the
// backend's own `contextWindow` (each declares its own; local knowledge, like describe()).
// Returns null when there is no declared bound (echo/structure — no LLM — or a server whose
// window the client can't know), which the guard reads as "nothing to enforce".
export const modelContextWindow = (model) => {
  const w = Number(model && model.contextWindow);
  return Number.isFinite(w) && w > 0 ? w : null;
};

// How much of the window the reply is allowed to claim when the caller names no ceiling, and
// the headroom held back for the chars/4 estimate's slack (an under-count would otherwise let a
// prompt creep past the real window). The input budget is window − output − margin.
const DEFAULT_OUTPUT_RESERVE = 384;   // mirrors the llm stage's default max_tokens
const MARGIN_FRACTION = 0.08;
const MIN_MARGIN = 256;
const MIN_INPUT = 256;                // never trim below this — a prompt has to say something

// Wrap a backend so every prompt it is handed is kept within its context window (context-budget.js).
// The trim is a NO-OP whenever the prompt already fits — so a normal turn is byte-identical and the
// golden prompts stand — and only sheds when a prompt would overflow. A backend with no declared
// window (contextWindow absent/0) is returned untouched. `phrase` and `propose` are the two prompt
// entry points; each is wrapped only if the backend actually exposes it, so a backend without
// `propose` stays without one (the gated-speech path detects its absence — model.propose == null).
const guardContext = (backend) => {
  const ctx = modelContextWindow(backend);
  if (!backend || typeof backend !== 'object' || ctx == null) return backend;
  const inputLimit = (opts = {}) => {
    const out = Number(opts.maxTokens) > 0 ? Number(opts.maxTokens) : DEFAULT_OUTPUT_RESERVE;
    const margin = Math.max(MIN_MARGIN, Math.round(ctx * MARGIN_FRACTION));
    return Math.max(MIN_INPUT, ctx - out - margin);
  };
  const wrapped = { ...backend };
  if (typeof backend.phrase === 'function') {
    wrapped.phrase = (messages, opts = {}) =>
      backend.phrase(fitMessages(messages, inputLimit(opts)).messages, opts);
  }
  if (typeof backend.propose === 'function') {
    // `yield*` delegates the two-way iterator protocol, so the gate's .next(pick) still drives
    // the underlying generator unchanged — only the messages it opens on are fitted first.
    wrapped.propose = async function* (messages, opts = {}) {
      yield* backend.propose(fitMessages(messages, inputLimit(opts)).messages, opts);
    };
  }
  return wrapped;
};

export const createModel = (name, opts = {}) => {
  const factory = backends.get(name);
  if (!factory) throw new Error(`unknown backend: ${name}`);
  return guardContext(factory(opts));
};

// A backend's self-description, for PROVENANCE: the audit records WHAT produced an answer, but
// the specific model (webllm's resolved MLC artifact, wllama's GGUF, Claude's model id) lives
// inside each backend's own closure. `describe()` is the backend's optional answer — a plain
// { backend, kind, model, label }. This reads it and falls back to the coarse { id, kind } every
// backend already carries, so a model is ALWAYS nameable, even one that never implements describe().
// Pure and total: a null model, a missing method, or a throwing describe() all resolve to a record
// (or null), never an exception — provenance must never cost the caller its answer or its export.
export const describeModel = (model) => {
  if (!model) return null;
  const id = model.id ?? null, kind = model.kind ?? null;
  try {
    const d = typeof model.describe === 'function' ? model.describe() : null;
    if (d && typeof d === 'object') {
      return {
        backend: d.backend ?? id,
        kind:    d.kind    ?? kind,
        model:   d.model   ?? null,
        label:   d.label   ?? null,
      };
    }
  } catch { /* a describe() fault must never sink the caller */ }
  return { backend: id, kind, model: null, label: null };
};
