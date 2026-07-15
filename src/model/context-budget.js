// EO: SEG·CON(Field → Field, Dissecting,Binding) — keep the prompt inside the model's context window
// The context-window guard. Every talker has a finite context — the number of tokens the
// model can hold at once (webllm/wllama ≈ 4k, a hosted Claude far more). The prompt assembler
// upstream already keeps things small (the conversation fold caps the recent window; the
// surfer trims the excerpts to the relevant few), but nothing GUARANTEED the assembled prompt
// fit the model that will actually decode it — a long source sentence, a raised recent-window
// budget, a woven mind, or a long-form ask could push a single turn past the window, and a
// prompt that overflows either errors or silently drops its own tail (the question) inside the
// runtime. This module is the floor under that: given the model's window and the room the reply
// needs, it sheds just enough of the prompt to fit, oldest conversation turns first and only
// then the middle of the largest block, so the model is never handed more than it can hold.
//
// It is a NO-OP whenever the prompt already fits — the overwhelming common case — so a normal
// turn is byte-identical and the golden prompts stand. Token counts are the same estimate the rest
// of the surface budgets against (converse/history.js keeps a private copy of this exact rule for
// its verbatim-window budget): the exact accounting is the tokenizer's, and this only has to decide
// WHETHER, and by how much, to trim.

// ESTIMATE TOKENS — script-aware, deliberately CONSERVATIVE. The old rule was a flat chars/4, the
// standard English heuristic; it is right for ASCII/Latin and badly WRONG for everything else, in
// the one direction that hurts here. The local talkers (webllm/wllama and every GGUF coder) run
// byte-level BPE tokenizers, which emit far more tokens for a script they saw little of: a
// Cyrillic prompt tokenizes ~2–3.5× denser than chars/4 predicts, CJK/kana ~5–6×. chars/4 then
// calls such a prompt "fits", the guard trims nothing, and the runtime throws
// ContextWindowSizeExceededError — the exact failure this module exists to prevent (a Russian or
// Japanese page read at a 4k-window local model). So the estimate is derived from each code
// point's UTF-8 byte length, the quantity byte-level BPE actually consumes: ASCII stays bytes/4
// (English is byte-identical to the old rule — the golden prompts stand), and every non-ASCII code
// point counts at bytes/2 — ~1 token for a 2-byte char (Cyrillic/Greek/accented Latin), ~1.5 for a
// 3-byte char (CJK/kana/hangul/most Indic), ~2 for a 4-byte char (emoji, rare CJK). That tracks
// real tokenization closely enough to never severely UNDER-count (overflow, the crash), while at
// worst over-trimming a non-Latin prompt slightly (safe — the answer still lands). Whitespace-only
// ⇒ nothing.
const utf8Len = (cp) => (cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4);
export const estimateTokens = (str) => {
  const s = String(str ?? '');
  if (!s.trim()) return 0;
  let t = 0;
  for (const ch of s) {
    const bytes = utf8Len(ch.codePointAt(0));
    t += bytes === 1 ? 0.25 : bytes * 0.5;   // ASCII: bytes/4 (== chars/4); else bytes/2
  }
  return Math.ceil(t);
};

// A per-message framing overhead (role tags, the chat template's turn delimiters). Small and
// fixed; it keeps a many-turn history from being under-counted against the window.
const PER_MESSAGE_TOKENS = 4;

// Total estimated tokens a {role,content}[] prompt costs — content plus per-message framing.
export const messagesTokens = (messages) => {
  if (!Array.isArray(messages)) return 0;
  let n = 0;
  for (const m of messages) n += estimateTokens(m && m.content) + PER_MESSAGE_TOKENS;
  return n;
};

// The elision left where a block was trimmed — named so a human reading the audit's promptText
// (or the model itself) sees the cut for what it is, not a mysterious gap.
const ELISION = '\n…[trimmed to fit the model’s context window]…\n';

// Truncate one block to ~keepChars, preserving BOTH ends and eliding the middle. Head keeps the
// block's opening (the frame/boundary the talker reads first); the larger tail keeps its close
// (in the grounded frame the QUESTION rides last, where a small model attends hardest — never
// cut it). Returns the block unchanged when it already fits.
const truncateMiddle = (text, keepChars) => {
  const s = String(text ?? '');
  if (keepChars <= 0) return '';
  if (s.length <= keepChars) return s;
  const budget = Math.max(0, keepChars - ELISION.length);
  const head = Math.floor(budget * 0.35);
  const tail = budget - head;
  return s.slice(0, head) + ELISION + s.slice(s.length - tail);
};

// Fit a {role,content}[] prompt within `limit` tokens (the INPUT budget — the window minus the
// room reserved for the reply). Returns { messages, trimmed, before, after }; `messages` is the
// SAME array when nothing had to give (no copy, byte-identical). The shed order, gentlest first:
//   1. Drop whole INTERIOR messages (conversation history) oldest-first — never the system
//      message (it carries the boundary + voice) nor the last message (the live question).
//   2. If still over, truncate the largest remaining block's MIDDLE, preferring a non-system
//      block, until the prompt fits or nothing can be reduced further.
// Pure and total: a non-array, empty, or already-fitting prompt returns untouched.
export const fitMessages = (messages, limit) => {
  const before = messagesTokens(messages);
  if (!Array.isArray(messages) || messages.length === 0 || !(limit > 0) || before <= limit) {
    return { messages, trimmed: false, before, after: before };
  }

  // Work on a shallow copy of normalized {role,content} — the caller's array is never mutated.
  let arr = messages.map((m) => ({ ...m, content: String((m && m.content) ?? '') }));

  // (1) Drop interior history, oldest (lowest index above the system message) first.
  const droppable = () => {
    const last = arr.length - 1;
    for (let i = 1; i < last; i++) return i;   // first interior message, if any
    return -1;
  };
  for (let guard = 0; guard < messages.length && messagesTokens(arr) > limit; guard++) {
    const i = droppable();
    if (i < 0) break;
    arr.splice(i, 1);
  }

  // (2) Truncate the largest block's middle until it fits. A non-system block is preferred as
  // the target (the last/user block holds the excerpts, the sheddable bulk); the system block
  // is only cut as a last resort, when it is the sole thing left to reduce.
  const MIN_KEEP_CHARS = 80;   // below this a block is treated as irreducible — cutting it buys nothing
  for (let guard = 0; guard < 64 && messagesTokens(arr) > limit; guard++) {
    // Pick the reducible target: the longest NON-system block, and only if none qualifies the
    // longest system block (the system message is cut last — it carries the boundary + voice).
    const longestWhere = (pred) => {
      let idx = -1, len = MIN_KEEP_CHARS;
      for (let i = 0; i < arr.length; i++) {
        if (!pred(arr[i], i)) continue;
        if (arr[i].content.length > len) { idx = i; len = arr[i].content.length; }
      }
      return idx;
    };
    const target = (() => {
      const nonSystem = longestWhere((m) => m.role !== 'system');
      return nonSystem >= 0 ? nonSystem : longestWhere((m) => m.role === 'system');
    })();
    if (target < 0) break;   // nothing left large enough to shed
    const over = messagesTokens(arr) - limit;
    // How many CHARS to drop to shed `over` TOKENS — computed at THIS block's OWN token density
    // (tokens/char), not a fixed 4-chars-per-token. A non-Latin block runs far denser (a CJK char
    // ≈ 1.5 tokens, Cyrillic ≈ 0.9, vs ASCII's 0.25), so the old fixed ratio over-dropped it
    // several-fold and needlessly starved the model of context — a Russian page trimmed to a
    // quarter of the window it was allowed. Dividing the token overage by the block's measured
    // density adapts the cut to its script. It only has to be close: the loop re-checks and
    // iterates, so an imperfect step still converges, and the while-guard guarantees the result is
    // never left over the limit. The floor keeps an all-whitespace block (0 tokens) from dividing
    // by zero.
    const content = arr[target].content;
    const density = Math.max(content.length ? estimateTokens(content) / content.length : 0.25, 0.05);
    const removeChars = Math.ceil((over + PER_MESSAGE_TOKENS) / density) + ELISION.length;
    const keepChars = Math.max(MIN_KEEP_CHARS, content.length - removeChars);
    const next = truncateMiddle(content, keepChars);
    if (next.length >= content.length) break;   // no progress — stop rather than spin
    arr[target].content = next;
  }

  const after = messagesTokens(arr);
  return { messages: arr, trimmed: after < before, before, after };
};
