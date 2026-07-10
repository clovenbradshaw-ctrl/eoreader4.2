// EO: DEF·SEG·NUL(Field → Field,Void, Making,Dissecting,Clearing) — paragraph loop; one paragraph per model call
// write/paragraphs.js — the paragraph loop: trust the model with the fold's content.
//
// The sentence-per-beat streamed answer (write/answer.js) collapsed one cursor per
// surfer stop and offered the decode to the lens port's logit bias. In practice the
// per-beat scaffolding over-constrained a small talker — choppy, stilted beats — and
// the weighting never demonstrably moved the surface. This is the replacement
// posture: hand the model the SAME grounded prompt the one-shot path built — the
// fold's content: the lines the reading turned up, the conversation, the question —
// and let it answer ONE PARAGRAPH AT A TIME. Trust the model to write grounded
// prose; keep the grounding MECHANICAL and downstream, where it already lives: the
// binder cites each claim (ground/bind.js), the fact-checker adjudicates relations,
// the veto flags. Nothing here touches a logit.
//
//   for p in 1..N:
//     input     = p == 1 ? the turn's grounded prompt
//                        : [...prompt, assistant: the answer so far, user: CONTINUE_CUE]
//     paragraph = phrase(input)          // streamed through the boundary gate
//     stop on DONE · an empty or repeated paragraph · the paragraph cap
//
// THE CONTINUATION IS A CONVERSATION: the answer so far rides back as the model's
// own assistant turn, so a multiround-aware backend (web-llm) can reuse its KV cache
// instead of re-prefilling the whole prompt per paragraph.
//
// THE BOUNDARY GATE upholds the streaming invariant the beat loop kept (the visible
// stream IS the returned draft, §3a): tokens are forwarded a sentence at a time, a
// paragraph closes at its first blank line (the decode is aborted early where the
// backend honours a signal), and a fragment the token cap cut mid-sentence is
// dropped BEFORE it is shown — never un-streamed after.

// The continuation cue — one paragraph forward, or a clean close. DONE is the
// model's own stop: it is held back by the gate and never reaches the surface.
export const CONTINUE_CUE =
  'Continue your answer with the next paragraph. Pick up where you left off — do not ' +
  'repeat or rephrase what you already wrote, and stay grounded in what you read. ' +
  'If your answer is already complete, reply with only DONE.';

// The model's close, alone on its reply. Anchored to the WHOLE trimmed text so a real
// sentence that happens to open with "Done…" is never swallowed.
const SENTINEL = /^DONE[.!]?$/i;

// A sentence end: terminal punctuation (plus any closing quote/bracket) before
// whitespace or the end of text.
const SENT_END_RE = () => /[.!?…]["'”’)\]]*(?=\s|$)/g;

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

// The first complete sentence of `s`, or null while none has closed yet.
export const firstSentenceOf = (s) => {
  const m = SENT_END_RE().exec(String(s || ''));
  return m ? String(s).slice(0, m.index + m[0].length) : null;
};

// draw one paragraph through the boundary gate. Returns { text, halted, sawDone }:
// `text` is EXACTLY what was forwarded to `onToken` (after the paragraph join, which
// the gate also owns); `halted` means the loop should stop (the model closed with
// DONE, or looped back onto an opener it already wrote).
const drawParagraph = async ({ model, messages, maxTokens, onToken, signal, isFirst, seenOpeners }) => {
  const inner = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const onOuterAbort = () => inner?.abort();
  if (signal) signal.addEventListener('abort', onOuterAbort, { once: true });

  let buf = '';           // everything the decode produced
  let start = -1;         // index of the paragraph's first non-whitespace char
  let opened = false;     // forwarding began — the first sentence cleared the checks
  let suppressed = false; // the call is held back whole (DONE / a repeated opener)
  let sawDone = false;
  let closed = -1;        // index where the first blank line closed the paragraph
  let forwarded = -1;     // buf index emitted so far

  const lastSentenceEnd = () => {
    const re = SENT_END_RE();
    let last = -1, m;
    while ((m = re.exec(buf))) last = m.index + m[0].length;
    return last;
  };

  const pump = (final) => {
    if (suppressed || (closed >= 0 && forwarded >= 0 && forwarded >= closed)) return;
    if (start < 0) {
      const i = buf.search(/\S/);
      if (i < 0) return;
      start = i;
    }
    if (!opened) {
      // Hold until the first sentence lands (or the decode ends), then decide once:
      // a bare DONE stops the loop unstreamed; an opener the answer already used
      // means the model is looping — stop rather than stream a repeat.
      const whole = buf.slice(start);
      const fs = firstSentenceOf(whole);
      if (!fs && !final) return;
      const opener = fs || whole;
      if (SENTINEL.test(whole.trim()) || SENTINEL.test(opener.trim())) {
        suppressed = true; sawDone = true; inner?.abort(); return;
      }
      if (seenOpeners.has(norm(opener))) { suppressed = true; inner?.abort(); return; }
      opened = true;
      forwarded = start;
      if (!isFirst) onToken?.('\n\n');       // the join between paragraphs
    }
    if (closed < 0) {
      const br = /\n[ \t]*\n/.exec(buf.slice(start));
      if (br) { closed = start + br.index; inner?.abort(); }
    }
    let upTo;
    if (closed >= 0) upTo = closed;
    else if (!final) upTo = lastSentenceEnd();          // hold back the trailing partial sentence
    else {
      // Decode over with no blank line: keep it whole when it ends cleanly; when the
      // token cap cut it mid-sentence, drop the fragment (it was never forwarded).
      const end = start + buf.slice(start).trimEnd().length;
      const lse = lastSentenceEnd();
      upTo = lse >= end ? end : (lse > start ? lse : end);
    }
    while (upTo > forwarded && /\s/.test(buf[upTo - 1])) upTo--;
    if (upTo > forwarded) { onToken?.(buf.slice(forwarded, upTo)); forwarded = upTo; }
  };

  const sink = (piece) => {
    if (suppressed || closed >= 0) return;
    const s = String(piece ?? '');
    if (!s) return;
    buf += s;
    pump(false);
  };

  let returned = '';
  try {
    returned = String((await model.phrase(messages, {
      maxTokens, onToken: sink, signal: inner ? inner.signal : signal,
    })) ?? '');
  } finally {
    if (signal) signal.removeEventListener('abort', onOuterAbort);
  }
  // A backend that ignored `onToken` (draw-then-emit): run the whole text through
  // the same gate, so the invariant and the stop conditions hold identically.
  if (!buf && returned) buf = returned;
  pump(true);

  const text = !suppressed && opened && forwarded > start ? buf.slice(start, forwarded) : '';
  return { text, halted: suppressed, sawDone };
};

// streamParagraphs — realise the grounded answer one paragraph per model call,
// streaming through `onToken`. `messages` is the turn's grounded prompt exactly as
// the one-shot path would send it; `budget` is the turn's token ceiling and sets the
// paragraph cap. Returns { draft, paragraphs, done, stopped } — the draft is
// byte-identical to the emitted stream — or null when nothing was realised (the
// caller falls back to the one-shot draw, non-breaking by construction).
export const streamParagraphs = async ({
  model, messages, onToken = null, budget = 384, maxParagraphs = null, signal = null,
} = {}) => {
  if (!model || !Array.isArray(messages) || !messages.length) return null;
  const cap = maxParagraphs ?? Math.max(1, Math.min(4, Math.round(budget / 128)));
  const perCall = Math.max(64, Math.min(256, budget));

  const paragraphs = [];
  const seenOpeners = new Set();
  let done = false;

  for (let i = 0; i < cap; i++) {
    if (signal?.aborted) break;
    const input = i === 0 ? messages : [
      ...messages,
      { role: 'assistant', content: paragraphs.join('\n\n') },
      { role: 'user', content: CONTINUE_CUE },
    ];
    let out;
    try {
      out = await drawParagraph({
        model, messages: input, maxTokens: perCall, onToken, signal,
        isFirst: paragraphs.length === 0, seenOpeners,
      });
    } catch { break; }   // a decode fault ends the loop with what we have — never a dead turn
    if (out.sawDone) done = true;
    if (out.halted || !out.text) break;
    paragraphs.push(out.text);
    seenOpeners.add(norm(firstSentenceOf(out.text) || out.text));
  }

  if (!paragraphs.length) return null;
  return Object.freeze({
    draft: paragraphs.join('\n\n'),
    paragraphs: Object.freeze(paragraphs.slice()),
    done,
    stopped: !!signal?.aborted,
  });
};
