// EO: INS(Field → Entity, Making) — claude hosted-API backend
// The claude backend — Anthropic's hosted models over the official browser SDK.
//
// This is the DEPENDABLE talker: the local backends need WebGPU or a multi-GB
// download and still land on a small model; this one needs only an API key and
// answers in seconds with a frontier model. Same shape as every other backend —
// the rest of the system does not know which is in use.
//
// The SDK is fetched by URL on first load (the page-open cost is 0), pinned to
// an exact version so the wrapper can't drift under us — the same posture as
// wllama's runtime pin. The API key lives ONLY in this browser's localStorage
// (eo_claude_key); it is sent to api.anthropic.com and nowhere else. Direct
// browser access is the SDK's `dangerouslyAllowBrowser` mode — Anthropic's
// CORS-enabled path for exactly this keep-your-own-key setup.
//
// Two request-shape rules this file owns (the callers never learn them):
//   1. Anthropic takes `system` as a TOP-LEVEL param, not a message role — and
//      the first message must be `user`. toClaudeRequest lifts the pipeline's
//      [{role:'system'},…] shape into that form (exported pure, for the tests).
//   2. Current Opus models reject `temperature` outright (400), so the sampling
//      opts the local backends consume are deliberately NOT forwarded here.

import { registerBackend } from './interface.js';

// Pinned exactly — a floating tag could ship a breaking minor under us mid-session.
const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.110.0/+esm';

export const DEFAULT_CLAUDE_MODEL = 'claude-opus-4-8';

// localStorage escape hatches, mirroring eo_webllm_model: the key the user pasted,
// an optional model pin, and an optional base URL (for a gateway/proxy deployment).
// Empty / unreadable ⇒ null, and load() explains what is missing.
const ls = (k) => {
  try {
    if (typeof localStorage === 'undefined') return null;
    const v = localStorage.getItem(k);
    return v && v.trim() ? v.trim() : null;
  } catch { return null; }
};

// Lift the pipeline's message list into Anthropic's request shape: every
// system-role message joins the top-level `system`; user/assistant turns pass
// through with stringified content; leading assistant turns are dropped (the
// API requires the first message to be `user`). Pure — the unit under test.
export const toClaudeRequest = (messages = []) => {
  const system = messages
    .filter((m) => m && m.role === 'system')
    .map((m) => String(m.content ?? ''))
    .filter(Boolean)
    .join('\n\n');
  let turns = messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({ role: m.role, content: String(m.content ?? '') }));
  while (turns.length && turns[0].role !== 'user') turns = turns.slice(1);
  if (!turns.length) turns = [{ role: 'user', content: '(empty turn)' }];
  return { system: system || null, messages: turns };
};

// Make an opaque SDK error honest at the surface the user sees (the model chip).
const explain = (err) => {
  const status = err?.status;
  if (status === 401) return new Error('the API key was rejected — paste a current one from console.anthropic.com (pick Claude again on the model chip)');
  if (status === 404) return new Error(`unknown model "${ls('eo_claude_model') || DEFAULT_CLAUDE_MODEL}" — clear eo_claude_model or set a real model id`);
  if (status === 429) return new Error('rate-limited by the API — wait a moment and retry');
  return err instanceof Error ? err : new Error(String(err));
};

registerBackend('claude', (opts = {}) => {
  let client = null;
  let loading = null;
  const apiKey = () => opts.apiKey || ls('eo_claude_key');
  const model  = () => opts.model  || ls('eo_claude_model') || DEFAULT_CLAUDE_MODEL;

  return {
    id: 'claude',
    kind: 'remote',
    // The context window (model/context-budget.js): the hosted Claude models carry a 200k-token
    // window — far past anything this reader assembles — so the guard is effectively never engaged
    // here; declaring it keeps the accounting honest rather than treating the hosted talker as
    // unbounded. A narrower future model would simply lower this number.
    contextWindow: 200000,
    // PROVENANCE (model/interface.js describeModel): the exact hosted model this backend talks to
    // — the pin (opts / eo_claude_model) or the frozen default — so the audit and the chat export
    // can name what produced an answer. `model()` already resolves the pin/default, and reads it
    // fresh so a mid-session model switch is reflected.
    describe: () => ({ backend: 'claude', kind: 'remote', model: model(), label: 'Claude · hosted API (Anthropic)' }),
    isLoaded: () => !!client,
    async load(onProgress) {
      if (client)  return;
      if (loading) return loading;
      loading = (async () => {
        try {
          const key = apiKey();
          if (!key) throw new Error('no API key — pick "Claude · hosted" on the model chip and paste one (console.anthropic.com)');
          onProgress?.({ phase: 'fetch-runtime', pct: 0.2 });
          const mod = await import(/* @vite-ignore */ SDK_URL);
          const base = opts.baseURL || ls('eo_claude_base');
          const c = new mod.Anthropic({
            apiKey: key,
            dangerouslyAllowBrowser: true,
            ...(base ? { baseURL: base } : {}),
          });
          // Prove the key + model + network NOW, so "ready" on the chip is earned,
          // not hoped. count_tokens is the free endpoint — no generation is billed.
          onProgress?.({ phase: 'checking key', pct: 0.7 });
          try {
            await c.messages.countTokens({ model: model(), messages: [{ role: 'user', content: 'ping' }] });
          } catch (err) { throw explain(err); }
          client = c;
          onProgress?.({ phase: 'ready', pct: 1 });
        } catch (err) {
          // A failed check must not poison this instance: the latch is cleared so the next
          // load() re-reads the key (freshly pasted ones included) and re-proves it.
          loading = null;
          throw err;
        }
      })();
      return loading;
    },
    async phrase(messages, opts2 = {}) {
      if (!client) throw new Error('claude: not loaded');
      // CANCELLATION (the Stop button): the signal rides into the SDK request;
      // an abort mid-stream keeps the partial answer, same as the local backends.
      const signal = opts2.signal || null;
      if (signal?.aborted) return '';
      const { system, messages: turns } = toClaudeRequest(messages);
      const params = {
        model: model(),
        max_tokens: opts2.maxTokens ?? 1024,
        ...(system ? { system } : {}),
        ...(Array.isArray(opts2.stop) && opts2.stop.length ? { stop_sequences: opts2.stop } : {}),
        messages: turns,
      };
      // Always stream: it feeds the answer loop's `onToken` live, and it keeps a
      // long draw from hitting request timeouts. Without `onToken` the accumulated
      // text returns exactly as a one-shot call would.
      const onToken = typeof opts2.onToken === 'function' ? opts2.onToken : null;
      let text = '';
      try {
        const stream = client.messages.stream(params, signal ? { signal } : undefined);
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            const piece = event.delta.text || '';
            if (piece) { text += piece; if (onToken) onToken(piece); }
          }
        }
      } catch (err) {
        if (signal?.aborted) return text.trim();   // user stopped — keep the partial answer
        throw explain(err);
      }
      return text.trim();
    },
  };
});
