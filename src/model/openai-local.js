// EO: INS(Field → Entity, Making) — LM Studio / Ollama local-server backend
// The bridge to a locally-running model server — the way to reach the LARGE models
// (the 27–80B Qwen coders, GLM, DeepSeek) that a browser tab can never load itself.
//
// WHY this exists. web-llm (WebGPU) and wllama (WASM) run weights INSIDE the tab, so
// they top out at a few billion params. LM Studio and Ollama run the weights in a
// native process on the same machine and expose them over HTTP — so the browser stops
// being the runtime and becomes the client. That lifts the ceiling to whatever the
// user's box can serve: a 3090 running Qwen3.6-27B, a workstation running the 80B coder.
//
// WHY one file for both. LM Studio and Ollama both speak the SAME wire protocol —
// OpenAI's POST /v1/chat/completions with Server-Sent-Events streaming. The only
// difference is the default port (LM Studio 1234, Ollama 11434) and the setup words.
// So one factory (makeLocalServerBackend) drives both; the two registrations below
// differ only in id, label, default base, and the one-time-setup help string.
//
// DEAD SIMPLE to connect (the whole point): pick the backend on the model chip and it
// AUTO-DISCOVERS. load() asks the server GET /v1/models, and whatever model is loaded
// (LM Studio) or pulled (Ollama) is used — no model id to type. The only setup is the
// server's own: start it, and allow this page's origin (CORS). load() fails with the
// exact one-liner to fix when the server isn't reachable, so the model chip tells the
// user what to do instead of sitting at an opaque error.
//
// A NOTE ON localhost + HTTPS. This page may be served over https (GitHub Pages), and
// the servers listen on http://localhost. Browsers make a SPECIAL EXCEPTION for
// localhost / 127.0.0.1 — they are treated as potentially-trustworthy, so an https
// page may fetch them without a mixed-content block. That is why this works at all.
//
// The pipeline's message list is ALREADY OpenAI's shape ([{role,content}]), so unlike
// the Anthropic backend there is no request lift — toOpenAIRequest only stringifies
// content and attaches the sampling opts. Both helpers are exported pure, for the tests.

import { registerBackend } from './interface.js';

// localStorage escape hatches, mirroring eo_claude_base / eo_webllm_model: an optional
// base-URL override (a non-default port, a LAN box, a gateway), an optional model pin
// (force one specific model instead of auto-discover), and an optional bearer key (for
// a gateway that guards the endpoint — the local apps themselves need none).
const ls = (k) => {
  try {
    if (typeof localStorage === 'undefined') return null;
    const v = localStorage.getItem(k);
    return v && v.trim() ? v.trim() : null;
  } catch { return null; }
};

// Normalise a base URL to an OpenAI-style root: trim a trailing slash, and if the user
// gave a bare host:port (no /v1 anywhere) append /v1, so both "http://localhost:1234"
// and "http://localhost:1234/v1" resolve the same. A base that already carries a path
// (a gateway mount) is respected verbatim beyond the trailing-slash trim.
export const normalizeBase = (base) => {
  let b = String(base || '').trim().replace(/\/+$/, '');
  if (!b) return b;
  if (!/\/v\d+($|\/)/.test(b)) b += '/v1';
  return b;
};

// Build the chat/completions request body. The pipeline already speaks OpenAI's
// [{role,content}] shape, so this only coerces content to string and attaches the
// sampling opts the local backends honour. stream:true always — we feed onToken live
// and keep a long draw off the request-timeout cliff, exactly like the claude backend.
export const toOpenAIRequest = (messages = [], { model, maxTokens, temperature, stop } = {}) => ({
  model: model || 'local-model',
  messages: (Array.isArray(messages) ? messages : [])
    .filter((m) => m && m.role)
    .map((m) => ({ role: m.role, content: String(m.content ?? '') })),
  stream: true,
  ...(Number.isFinite(maxTokens) ? { max_tokens: maxTokens } : {}),
  ...(Number.isFinite(temperature) ? { temperature } : {}),
  ...(Array.isArray(stop) && stop.length ? { stop } : {}),
});

// Read one SSE line into an event. OpenAI streams `data: {json}` lines terminated by a
// lone `data: [DONE]`; blank lines and comment (`:`) lines are keepalives to ignore.
// Returns { done:true } at the terminator, { content } for a text delta (possibly ''),
// or null for anything to skip. A malformed JSON line is skipped, never thrown — a
// single bad frame must not sink a good stream. Exported pure, for the tests.
export const deltaFromLine = (line) => {
  const s = String(line || '').trim();
  if (!s || !s.startsWith('data:')) return null;
  const payload = s.slice(5).trim();
  if (payload === '[DONE]') return { done: true };
  try {
    const j = JSON.parse(payload);
    const choice = j?.choices?.[0];
    const piece = choice?.delta?.content ?? choice?.text ?? '';
    return { content: String(piece ?? '') };
  } catch { return null; }
};

// Pick which model to run from the server's GET /v1/models list: an explicit pin wins
// (if the server actually has it), else the first model the server reports. Exported
// pure so the auto-discovery rule is unit-testable without a live server.
export const pickModel = (ids = [], pinned = null) => {
  const list = (Array.isArray(ids) ? ids : []).map((x) => String(x || '')).filter(Boolean);
  if (pinned && list.includes(pinned)) return pinned;
  if (pinned && !list.length) return pinned;      // server lists nothing but the user named one — trust them
  return list[0] || null;
};

// A fetch with a hard timeout, so "the server isn't running" fails FAST (the connection
// refuses or hangs) instead of leaving the chip spinning. Merges an external abort
// signal (the Stop button) with the timeout via a relay controller.
const fetchWithTimeout = async (url, init = {}, ms = 6000) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new Error('timeout')), ms);
  const ext = init.signal || null;
  const onAbort = () => ctrl.abort(ext?.reason);
  if (ext) { if (ext.aborted) ctrl.abort(ext.reason); else ext.addEventListener('abort', onAbort, { once: true }); }
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
    if (ext) ext.removeEventListener?.('abort', onAbort);
  }
};

// The shared factory — everything LM Studio and Ollama have in common. `cfg` carries
// only what differs: id, label, the default base URL, and the product-specific fix line
// shown when the server can't be reached.
const makeLocalServerBackend = (cfg) => (opts = {}) => {
  const baseKey = `eo_${cfg.id}_base`;
  const modelKey = `eo_${cfg.id}_model`;
  const keyKey = `eo_${cfg.id}_key`;
  const base   = () => normalizeBase(opts.baseURL || ls(baseKey) || cfg.defaultBase);
  const apiKey = () => opts.apiKey || ls(keyKey) || null;
  const pin    = () => opts.model || ls(modelKey) || null;

  let resolvedModel = null;   // the model auto-discovery / the pin settled on, set by load()
  let ready = false;
  let loading = null;

  const headers = () => ({
    'Content-Type': 'application/json',
    ...(apiKey() ? { Authorization: `Bearer ${apiKey()}` } : {}),
  });

  // Turn a fetch/connection failure into the honest, actionable note the chip shows.
  // A refused/aborted connection is the overwhelmingly common case — the server isn't
  // running or this origin isn't allowed — so it gets the product's exact fix line.
  const unreachable = (err) =>
    new Error(`${cfg.label} isn't reachable at ${base()} — ${cfg.help}` +
              (err?.message ? ` (${String(err.message).slice(0, 80)})` : ''));

  return {
    id: cfg.id,
    kind: 'remote',
    // PROVENANCE (model/interface.js describeModel): the exact model the local server is
    // serving — resolved by load() (pin or auto-discovery) — so the audit and chat export
    // name what actually answered, not a generic "ollama".
    describe: () => ({ backend: cfg.id, kind: 'remote', model: resolvedModel, label: `${cfg.label} · local server` }),
    isLoaded: () => ready,
    async load(onProgress) {
      if (ready)   return;
      if (loading) return loading;
      loading = (async () => {
        try {
          onProgress?.({ phase: 'connecting', pct: 0.2 });
          // Probe the server and read its model list in one call. A reachable server
          // proves the port, the CORS allowance, AND (with a loaded/pulled model) gives
          // us the id to run — the whole auto-discovery, one round trip.
          let list = [];
          try {
            const res = await fetchWithTimeout(`${base()}/models`, { headers: headers() });
            if (res.status === 401 || res.status === 403) {
              throw new Error(`${cfg.label} rejected the request (${res.status}) — clear ${keyKey} or set a valid key`);
            }
            if (!res.ok) throw new Error(`${cfg.label} answered ${res.status} at ${base()}/models`);
            const body = await res.json().catch(() => ({}));
            list = Array.isArray(body?.data) ? body.data.map((m) => m?.id).filter(Boolean) : [];
          } catch (err) {
            // A thrown-with-status message is already actionable; a raw network error is not.
            if (err?.message && /rejected|answered/.test(err.message)) throw err;
            throw unreachable(err);
          }
          onProgress?.({ phase: 'discovering model', pct: 0.7 });
          const model = pickModel(list, pin());
          if (!model) throw new Error(`${cfg.label} is running but has no model loaded — ${cfg.emptyHelp}`);
          resolvedModel = model;
          ready = true;
          onProgress?.({ phase: 'ready', pct: 1 });
        } catch (err) {
          loading = null;   // a failed probe must not poison the instance — the next load() re-probes
          throw err;
        }
      })();
      return loading;
    },
    async phrase(messages, opts2 = {}) {
      if (!ready) throw new Error(`${cfg.id}: not loaded`);
      const signal = opts2.signal || null;
      if (signal?.aborted) return '';
      const body = toOpenAIRequest(messages, {
        model: resolvedModel,
        maxTokens: opts2.maxTokens ?? 1024,
        temperature: opts2.temperature,
        stop: opts2.stop,
      });
      const onToken = typeof opts2.onToken === 'function' ? opts2.onToken : null;
      let text = '';
      let res;
      try {
        // No timeout on the generation itself — a big model on CPU can take minutes for
        // the first token; the Stop button (signal) is the only bound. The connect probe
        // in load() already proved the server is up, so a hang here is slow, not dead.
        res = await fetch(`${base()}/chat/completions`, {
          method: 'POST', headers: headers(), body: JSON.stringify(body), ...(signal ? { signal } : {}),
        });
      } catch (err) {
        if (signal?.aborted) return '';
        throw unreachable(err);
      }
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`${cfg.label} error ${res.status}: ${detail.slice(0, 160) || res.statusText}`);
      }
      // Stream the SSE body, splitting on newlines and feeding each data-line through
      // deltaFromLine. A partial line at a chunk boundary stays in `buf` for the next read.
      const reader = res.body?.getReader?.();
      if (!reader) { // a non-streaming server (or a polyfill without a body reader): read whole
        const whole = await res.json().catch(() => null);
        const t = whole?.choices?.[0]?.message?.content ?? '';
        text = String(t || '');
        if (text && onToken) onToken(text);
        return text.trim();
      }
      const dec = new TextDecoder();
      let buf = '';
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl);
            buf = buf.slice(nl + 1);
            const ev = deltaFromLine(line);
            if (!ev) continue;
            if (ev.done) { buf = ''; return text.trim(); }
            if (ev.content) { text += ev.content; if (onToken) onToken(ev.content); }
          }
        }
        // Flush a trailing line with no terminating newline.
        const ev = deltaFromLine(buf);
        if (ev && !ev.done && ev.content) { text += ev.content; if (onToken) onToken(ev.content); }
      } catch (err) {
        if (signal?.aborted) return text.trim();   // user stopped — keep the partial answer
        throw err;
      }
      return text.trim();
    },
  };
};

// ── the two registrations ─────────────────────────────────────────────────────────
// LM Studio: the desktop app; its OpenAI server listens on :1234 once started from the
// Developer tab. Recent builds allow cross-origin by default; older ones need the
// "Enable CORS" toggle beside the start button.
registerBackend('lmstudio', makeLocalServerBackend({
  id: 'lmstudio', label: 'LM Studio', defaultBase: 'http://localhost:1234/v1',
  help: 'open LM Studio → Developer → Start Server (and leave "Enable CORS" on)',
  emptyHelp: 'load a model in LM Studio first (e.g. a Qwen3.6 / Qwen3-Coder-Next GGUF)',
}));

// Ollama: the CLI/daemon; its OpenAI-compatible endpoint is /v1 on :11434. It only
// answers a browser origin when started with OLLAMA_ORIGINS allowing it — the one bit
// of setup, called out verbatim so the chip can tell the user exactly what to run.
registerBackend('ollama', makeLocalServerBackend({
  id: 'ollama', label: 'Ollama', defaultBase: 'http://localhost:11434/v1',
  help: 'run it with the browser allowed: OLLAMA_ORIGINS=* ollama serve',
  emptyHelp: 'pull a model first, e.g. `ollama pull qwen3-coder-next`',
}));
