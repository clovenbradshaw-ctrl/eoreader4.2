// EO: NUL·SEG(Field → Void,Field, Clearing,Dissecting) — streaming surfacer wrapper
// model/stream.js — phrase's streaming sibling, as a capability wrapper.
// (The Streaming Answer §3a, §5)
//
// `phrase` draws the whole reply and returns the string. Streaming wants the
// tokens AS they decode — the same surface, emitted left to right — so the
// answer can be realised one grounded sentence at a time without the reader
// ever seeing the seam (§3a). This is the OPTIONAL streaming capability, exactly
// as `propose` is optional (model/interface.js): a backend that can decode
// token-by-token calls the handed `onToken` per piece; one that cannot simply
// ignores it, and `streamPhrase` falls back to draw-then-emit — the whole drawn
// beat is emitted once. The loop still runs; the only loss is that the gap
// between beats becomes one sentence's latency instead of none (§5).
//
// `streamPhrase(model, messages, { onToken, ...opts }) → Promise<string>` is the
// one entry point the write loop calls. It returns the full beat text (the canon
// the witness binds and the audit keeps); `onToken` is the live surface the UI
// renders. The two reconcile by construction: a streaming backend's pieces
// concatenate to the returned text, and the fallback emits that same text whole.

// streamPhrase — draw a beat, streaming its tokens through `onToken` if the
// backend supports it, else emitting the whole beat once (draw-then-emit, §5).
// Always returns the full beat string.
export const streamPhrase = async (model, messages, opts = {}) => {
  const { onToken, ...rest } = opts;
  if (typeof onToken !== 'function') {
    return String((await model.phrase(messages, rest)) ?? '');
  }
  let streamed = false;
  const sink = (piece) => {
    const s = String(piece ?? '');
    if (s) { streamed = true; onToken(s); }
  };
  const text = String((await model.phrase(messages, { ...rest, onToken: sink })) ?? '');
  // Draw-then-emit fallback: a backend that ignored `onToken` streamed nothing,
  // so emit the whole drawn beat once. The loss is latency, never a token, and
  // the visible surface is still exactly the returned text.
  if (!streamed && text) onToken(text);
  return text;
};

// surfaceTokens — split a beat into emission pieces that concatenate back to the
// original exactly (whitespace runs kept as their own pieces). The stub/echo
// backends use this to surface a drawn beat token by token so the streaming
// surface is testable without a real decoder; the join in the answer loop (§3b)
// reconstructs the draft verbatim from these pieces.
export const surfaceTokens = (s) => String(s ?? '').match(/\s+|\S+/g) || [];

// emitSurface — a backend convenience: if a caller handed `onToken`, surface the
// drawn beat token by token. Returns the beat unchanged so a backend can
// `return emitSurface(text, opts.onToken)`.
export const emitSurface = (text, onToken) => {
  if (typeof onToken === 'function') for (const t of surfaceTokens(text)) onToken(t);
  return text;
};
