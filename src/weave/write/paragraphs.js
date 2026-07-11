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

import { retreads } from '../../surfer/salience.js';

// The continuation cue — one NEW paragraph forward, or a clean close. A close is the
// default: left told merely to "continue", a small talker pads the answer to length by
// re-covering ground it already made in fresh words (the orca run said "large brain →
// intelligence" across four paragraphs). So the cue makes DONE the easy path and forbids
// reworded restatement outright — continue only when there is a genuinely new point. DONE
// is the model's own stop: it is held back by the gate and never reaches the surface.
export const CONTINUE_CUE =
  'Continue ONLY if you have a genuinely new point to make — one you have not made yet. ' +
  'If you do, add just that point, grounded in what you read, and pick up where you left ' +
  'off; do not restate, re-explain, or reword anything you already wrote, even in other ' +
  'words. If you have already made your points, do not pad the answer out — reply with only DONE.';

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
const drawParagraph = async ({ model, messages, maxTokens, onToken, signal, isFirst, seenOpeners, prior = '' }) => {
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
  let droppedTail = '';   // a mid-sentence tail the per-decode ceiling cut (a bound guard, logged upstream)

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
      // A continuation paragraph tends to open with the model's OWN ellipsis — its
      // literal reading of the CONTINUE_CUE ("pick up where you left off"). It is a
      // seam artifact, never answer content, so skip a leading run of "…"/"." (and the
      // space after it) before the paragraph opens: the strike lands on `start`, so the
      // ellipsis is never streamed to onToken and never enters the draft — no flicker,
      // unlike a post-hoc trim. Gated to continuation paragraphs (the first never sees
      // the cue), so a "0.5 kg…" opener — which only a first paragraph would carry — is
      // never touched. The run may arrive a dot at a time (a lone "." reads as a whole
      // sentence to the gate below, so it must be caught HERE): while nothing but dots
      // has landed we wait; once real content follows we skip the whole run; if the
      // decode ends on nothing but dots the paragraph suppresses like an empty one.
      if (!isFirst) {
        const lead = buf.slice(start);
        const run = /^[.…]+[ \t]*/.exec(lead);
        if (run) {
          if (lead.length > run[0].length) start += run[0].length;        // real content follows
          else if (final) { suppressed = true; inner?.abort(); return; }   // only dots ever arrived
          else return;                                                     // still streaming — wait
        }
      }
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
      // A continuation whose opener only re-covers already-said ground is the model looping to
      // fill the cap once it has said its piece. The measured self-repetition read (surfer/
      // salience.js retreads) — the engine's OWN surprise, the same the walk stops a non-novel hop
      // on, read as the self-normalized onBits>offBits crossing so a ubiquitous topic word never
      // false-fires. It generalises the exact-match seenOpeners above (which misses a paraphrased
      // repeat); stops here before a byte is forwarded, so nothing un-streams. Byte-identical when
      // the paragraph brings new surprise, which every non-degenerate continuation does.
      if (!isFirst && prior && retreads(prior, opener)) { suppressed = true; inner?.abort(); return; }
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
      // per-decode ceiling cut it mid-sentence, forward the complete sentences and
      // record the dropped tail as a bound guard (logged upstream, never silent).
      const end = start + buf.slice(start).trimEnd().length;
      const lse = lastSentenceEnd();
      if (lse >= end) upTo = end;
      else if (lse > start) { upTo = lse; droppedTail = buf.slice(lse, end).trim(); }
      else upTo = end;
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
  return { text, halted: suppressed, sawDone, droppedTail };
};

// ── Runaway guards — NOT length policy ──────────────────────────────────────
// Length is EMERGENT: the loop ends when the model CLOSES — a bare DONE, a
// paragraph that loops back onto an opener already used, or an empty draw. None of
// the numbers below shapes a real answer; each only catches a backend that will not
// close (a decode that never says DONE, a paragraph that never breaks). When one
// binds it is logged loudly and recorded on the returned `guards` — a bound guard is
// a signal worth reading, never a silent truncation. (Same posture as the arc's
// MAX_SECTIONS / MAX_TOTAL_TOKENS backstops, arc/constants.js §5.7.)
const RUNAWAY_PARAGRAPHS = 24;   // was a 3–4 shaping cap; now a pathology backstop, far above any real answer
const PER_CALL_FLOOR = 1024;     // generous per-decode rope — a paragraph closes on its blank line far under it
const PER_CALL_MAX   = 4096;     // per-decode cost backstop for a paragraph that never breaks (budget may raise, never past this)

// A bound guard is loud: stderr AND the returned `guards` list, so it is auditable the
// way the arc records its guard steps. Wrapped so a console-less host never throws.
const warnGuard = (guard, detail) => {
  try { console.warn(`streamParagraphs: guard bound — ${guard}`, detail); } catch { /* no console host */ }
};

// streamParagraphs — realise the grounded answer paragraph by paragraph, streaming
// through `onToken`. `messages` is the turn's grounded prompt exactly as the one-shot
// path would send it. Length is EMERGENT — the loop develops paragraphs until the
// model closes (DONE / a repeated opener / an empty draw), NOT to a budget-derived
// count. `maxParagraphs`, when the caller passes it, is an explicit request honoured
// as given; otherwise the only bound is the runaway guard, and `budget` only raises
// the per-decode rope (never shrinks a paragraph to a choppy cap). Returns
// { draft, paragraphs, done, stopped, guards } — the draft is byte-identical to the
// emitted stream, `guards` lists any backstop that bound — or null when nothing was
// realised (the caller falls back to the one-shot draw, non-breaking by construction).
export const streamParagraphs = async ({
  model, messages, onToken = null, budget = 384, maxParagraphs = null, signal = null,
} = {}) => {
  if (!model || !Array.isArray(messages) || !messages.length) return null;
  // The paragraph count is emergent (the model closes when it is done); `cap` is only the
  // runaway backstop, or the caller's explicit `maxParagraphs`. The per-decode ceiling is
  // generous — a real paragraph closes on its blank line far under it, so it is a guard,
  // not a shape. Either binding is logged; neither shapes a normal answer.
  const cap = maxParagraphs ?? RUNAWAY_PARAGRAPHS;
  const perCall = Math.min(PER_CALL_MAX, Math.max(PER_CALL_FLOOR, budget | 0));

  const paragraphs = [];
  const seenOpeners = new Set();
  const guards = [];
  let done = false;

  let i = 0;
  for (; i < cap; i++) {
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
        isFirst: paragraphs.length === 0, seenOpeners, prior: paragraphs.join('\n\n'),
      });
    } catch { break; }   // a decode fault ends the loop with what we have — never a dead turn
    if (out.sawDone) done = true;
    if (out.droppedTail) {
      // The per-decode ceiling cut this paragraph mid-sentence — rare by construction
      // (paragraphs close on their blank line far under PER_CALL_MAX). Log the bound
      // guard with the dropped text; it is not silently discarded.
      const g = { guard: 'per-call-ceiling', paragraph: paragraphs.length, dropped: out.droppedTail };
      guards.push(g); warnGuard('per-call-ceiling', g);
    }
    if (out.halted || !out.text) break;
    paragraphs.push(out.text);
    seenOpeners.add(norm(firstSentenceOf(out.text) || out.text));
  }
  // The loop reached its bound with the model still going (no DONE, not aborted): a
  // backend that will not close. The draft is whole up to here — but the STOP was a
  // guard, not saturation, so it is logged rather than passed off as a finished answer.
  if (i >= cap && !done && !signal?.aborted) {
    const g = { guard: maxParagraphs != null ? 'max-paragraphs' : 'runaway-paragraphs', paragraphs: paragraphs.length };
    guards.push(g); warnGuard(g.guard, g);
  }

  if (!paragraphs.length) return null;
  return Object.freeze({
    draft: paragraphs.join('\n\n'),
    paragraphs: Object.freeze(paragraphs.slice()),
    done,
    stopped: !!signal?.aborted,
    guards: Object.freeze(guards),
  });
};
