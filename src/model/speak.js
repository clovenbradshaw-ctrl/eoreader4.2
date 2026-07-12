// EO: INS(Field → Entity, Making) — speak — the one decode organ (guarded phrase)
// model/speak.js — every guarded decode in the body goes through here.
//
// Before this organ existed, each call site hand-rolled the same two things around
// `model.phrase`: its own decode-opts object ({ maxTokens, temperature, minPredict,
// signal, … }) and its own try/catch that swallows a fault into a caller-local
// fallback. That swallow-to-fallback pattern is ONE liveness discipline, written
// many times — and hand-rolling it is exactly the class of code that produced the
// liveness bugs of PRs #70/#72/#76/#80 (unabortable utility decodes outliving a
// Stop/stall as orphans holding the engine, faults costing the answer instead of
// degrading it). The organ owns that discipline in one place:
//
//   - a failed or aborted decode RETURNS the caller's declared `fallback` — it
//     never throws. The caller states up front what "the decode did not happen"
//     means for it (null, '', an off object) and gets exactly that back.
//   - a successful decode always returns a STRING: `String(raw ?? '')` — a backend
//     that resolves undefined/null yields '', never a non-string surprise.
//   - decode opts pass through to the backend UNTOUCHED (maxTokens, temperature,
//     minPredict, minTokens, stop, signal, …) — speak adds no policy of its own.
//   - `onToken` routes the decode through streamPhrase (stream.js), so a streaming
//     backend surfaces tokens live and a non-streaming one draw-then-emits, with
//     the same guarded return either way.
//
// Callers whose error handling is MORE than a fallback (propagate-by-contract,
// watchdog wiring) keep calling model.phrase directly — this organ is only the
// swallow-to-fallback shape.
import { streamPhrase } from './stream.js';

// speak(model, messages, opts) -> Promise<string | fallback>
// opts: { fallback = '', onToken, ...decodeOpts } — decodeOpts pass through to the
// backend untouched (maxTokens, temperature, minPredict, minTokens, stop, signal).
export const speak = async (model, messages, { fallback = '', onToken, ...opts } = {}) => {
  try {
    const raw = onToken
      ? await streamPhrase(model, messages, { onToken, ...opts })
      : await model.phrase(messages, opts);
    return String(raw ?? '');
  } catch {
    return fallback;
  }
};
