// EO: SEG(Field → Field, Clearing) — narrative depth (structural teller runs)
// The deixis frame (deixis.js) needs to know, per sentence, which STRUCTURAL run of the
// document a first-person mention sits in — so Walton's letters, Victor's own account, and
// the creature's tale nested inside it each get their own teller history instead of one
// sticky bearer for the whole book. This reads that run purely from the document's own
// SHAPE — no speech-verb lexicon, no character names — the same discipline as frame.js's
// banner bracket and sentences.js's heading-line boundary.
//
// Two structural signals, composed into one integer per sentence:
//
//   epoch       a document divided into a labelled, NUMBERED series ("Letter 1"/"Letter 2",
//               "Chapter 1".."Chapter 24") is a run of same-kind headings; the epoch advances
//               only when the recurring kind CHANGES (Letter series → Chapter series), never
//               on every heading — so 24 chapters of the same teller stay one run, but the
//               letters that precede them do not merge into it. A template must recur at least
//               twice to count (a one-off "Room 12" in running prose is not a series); a
//               document with no such series never advances epoch, byte-identical to before.
//   quote id    each “ ” span gets its own UNIQUE id, not a bare nesting count — two disjoint
//               quotes at the same nesting level (a one-line remark early on, an extended tale
//               told chapters later) are unrelated speakers and must not share a teller history
//               just because both sit "one level in". A stack of ids tracks the open quotes:
//               entering pushes a fresh id, closing pops back to whatever was open outside it
//               (so the OUTER voice resumes its own established teller, not a fresh one).
//
//               A long quoted narration is typically re-opened every paragraph and only really
//               closed once, at the very end — ordinary same-paragraph continuation, handled by
//               never pushing on a leading “ while the stack is already non-empty. But a chapter
//               break sitting INSIDE one continuous telling is typeset as a genuine close before
//               the heading and a genuine reopen after it — the stack goes empty at the break —
//               and by the same convention that reopening is still the same speech, not a new
//               speaker. So a reopening “ found with an EMPTY stack still reuses the most
//               recently closed id, rather than minting a new one, PROVIDED nothing but
//               heading-shaped lines sat between the close and this open: any real (non-heading)
//               sentence seen with the stack empty means an actual narrator turn happened there,
//               and the next “ is a genuinely new quote.
//
// Quote ids are drawn from a range disjoint from the epoch baselines, so the two signals never
// collide: a bare epoch (no open quote) and any quote span are always distinguishable.

const NUMBERED_HEADING = /^([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+([0-9]+|[IVXLCDM]+)\.?$/;
const templateKeyOf = (s) => {
  const m = NUMBERED_HEADING.exec(String(s || '').trim());
  return m ? m[1].toLowerCase() : null;
};

// A short, unpunctuated line — the general shape of a structural label (a chapter heading, a
// letter number, a signature line), not a claim about its WORDS. Used only to let a quote
// re-open across such a line without minting a new speaker (see above); a false positive here
// just merges two adjacent quotes that happen to bracket a short fragment, never worse than the
// fragmentation it exists to avoid.
const isHeadingShaped = (s) => {
  const t = String(s || '').trim().replace(/[_*]/g, '');
  if (!t || /[.!?]$/.test(t)) return false;
  const words = t.split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 6;
};

const OPEN = '“';   // “
const CLOSE = '”';  // ”
const EPOCH_SCALE = 1000;
const QUOTE_BASE = 10_000_000;   // well clear of any plausible epoch*EPOCH_SCALE baseline

// sentences → (sentIdx) => depth. Pure over the sentence array; O(chars) to build, O(1) to read.
export const induceNarrativeDepth = (sentences = []) => {
  const counts = new Map();
  for (const s of sentences) {
    const k = templateKeyOf(s);
    if (k) counts.set(k, (counts.get(k) || 0) + 1);
  }
  const recurring = new Set([...counts].filter(([, c]) => c >= 2).map(([k]) => k));

  let epoch = 0, lastKey = null, nextQuoteId = 1;
  const stack = [];               // open quote ids, innermost last
  let lastClosed = null, lastClosedEpoch = null, sawContentSinceClose = false;
  const depths = new Array(sentences.length);
  for (let i = 0; i < sentences.length; i++) {
    const s = String(sentences[i] || '');
    const key = templateKeyOf(s);
    if (key && recurring.has(key)) {
      if (lastKey !== null && key !== lastKey) epoch += 1;
      lastKey = key;
    }
    const heading = isHeadingShaped(s);
    let atStart = true, recorded = false;
    let startValue = stack.length ? QUOTE_BASE + stack[stack.length - 1] : epoch * EPOCH_SCALE;
    for (let j = 0; j < s.length; j++) {
      const ch = s[j];
      if (ch === OPEN) {
        if (atStart && stack.length) { /* same-paragraph continuation — no push */ }
        else if (atStart && !stack.length && lastClosed != null && lastClosedEpoch === epoch && !sawContentSinceClose) {
          stack.push(lastClosed);   // reopening the same still-live quote across a heading gap
        } else {
          stack.push(nextQuoteId++);
        }
      } else if (ch === CLOSE) {
        if (stack.length) {
          lastClosed = stack.pop();
          lastClosedEpoch = epoch;
          sawContentSinceClose = false;
        }
      } else if (!heading && !stack.length && !/\s/.test(ch)) {
        // Real prose sitting OUTSIDE any quote, once the closer has popped — a genuine
        // narrator turn happened here, so the next “ is a new speaker, not a resumption.
        // (Content still INSIDE the quote, before its own closer runs, never reaches here.)
        sawContentSinceClose = true;
      }
      if (!/\s/.test(ch)) {
        if (!recorded) { startValue = stack.length ? QUOTE_BASE + stack[stack.length - 1] : epoch * EPOCH_SCALE; recorded = true; }
        atStart = false;
      }
    }
    depths[i] = startValue;
  }
  return (sentIdx = 0) => depths[sentIdx] ?? 0;
};
