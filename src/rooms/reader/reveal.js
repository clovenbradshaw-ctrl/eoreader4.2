// EO: INS·DEF(Field → Entity, Making,Dissecting) — the chat typewriter's PACE
// reveal.js — how fast the streamed answer types out, as a pure function so the freeze
// regression is guarded by a test the browserless CI can run (the surface that calls it,
// index.html _advanceReveals, is not).
//
// THE FREEZE THIS FILE EXISTS TO PREVENT. The chat answer is revealed one character at a
// time on a requestAnimationFrame loop; each frame that still has characters left to reveal
// re-renders the WHOLE dc surface. The original pace CAPPED the reveal at ~5 chars/frame
// (perSec ≤ 320). A fast backend — the Anthropic API, echo, or a quick local decode — hands
// over text far faster than that, so the reveal fell THOUSANDS of characters behind and the
// 60fps whole-app re-render kept running for (answerLength / 320) seconds AFTER the answer had
// already settled: measured ~11.6s of pinned main thread for a single ~3900-char answer. That
// pinned thread is the "it slows down the computer / the tab freezes / I can't even hit Stop or
// start a new prompt" report — Stop clicks and keystrokes starve behind the render storm.
//
// TWO invariants hold the fix:
//   · a slow LIVE stream still types at a gentle FLOOR (the typewriter feel is preserved);
//   · a fast burst — or a long already-settled answer — can NEVER leave the reveal crawling for
//     seconds. That comes from (a) a CONSTANT catch-up rate, not one proportional to the backlog
//     (a proportional pace decays exponentially into a Zeno tail — the last characters crawl), and
//     (b) a hard MAX_BACKLOG clamp so the catch-up is bounded by TIME, not by answer length.

export const REVEAL = Object.freeze({
  FLOOR: 90,           // chars/sec — the unhurried typewriter floor for a slow live stream
  CATCHUP: 900,        // chars/sec — the brisk constant rate when the reveal has fallen behind
  FAST_THRESHOLD: 24,  // backlog (chars) above which the brisk catch-up rate kicks in
  MAX_BACKLOG: 180,    // the reveal may never trail the settled text by more than this many chars
});

// Chars to advance this frame, given how far behind the reveal is (`backlog`) and the frame time
// `dt` (ms). Constant rate above the threshold (no exponential tail), gentle floor below it. The
// `Math.max(1, …)` keeps it moving at least a character a frame so it always finishes. Time-based,
// so the speed holds across frame rates.
export const revealStep = (backlog, dt) => {
  const perSec = backlog > REVEAL.FAST_THRESHOLD ? REVEAL.CATCHUP : REVEAL.FLOOR;
  return Math.max(1, Math.round(perSec * dt / 1000));
};

// The next reveal cursor for one message: `shown` chars are revealed of `full`; `dt` ms elapsed
// this frame. Clamp the backlog first — a burst can otherwise queue the whole answer, and typing
// that out one frame at a time is the freeze — then step. A slow live stream never reaches the
// clamp, so its char-by-char typewriter is untouched.
export const advanceReveal = (shown, full, dt) => {
  if (shown >= full) return full;
  const s = (full - shown > REVEAL.MAX_BACKLOG) ? full - REVEAL.MAX_BACKLOG : shown;
  return Math.min(full, s + revealStep(full - s, dt));
};

// Frames to fully reveal `full` chars from `shown` at frame time `dt` — the catch-up length. Pure
// and bounded (the loop cap is a safety net far above any real reveal); the test asserts this stays
// small and INDEPENDENT of `full`, which is exactly the property the freeze violated.
export const framesToReveal = (shown, full, dt) => {
  let s = shown, n = 0;
  while (s < full && n < 100000) { s = advanceReveal(s, full, dt); n++; }
  return n;
};
