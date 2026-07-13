// EO: SYN·SEG·NUL(Field → Network,Void, Composing,Dissecting,Clearing) — transcript edit/redaction fold
// transcript-edit.js — the live transcript as a PURE FOLD of an immutable heard baseline plus an
// append-only edit log. The word timings are the truth the hearing left (organs/in/audio.js:
// tokens keep [start,end]); a user's correction or redaction is a defeasible edit ON TOP, never a
// rewrite of the baseline. So an edit is always recoverable (the original surface rides in the
// event), and undo is just a RETRACT tombstone — the same shape hear.js's self-editing pass uses,
// but as plain JSON so it survives a reload (the real doc.log holds closures and cannot persist).
//
// The current state is `projectTranscript(baseWords, audioEvents)` — recomputed, never stored.
// Events:
//   { op:'EDIT',   id, idx, from, to, ts }            — re-hear word `idx` as `to` (from = its baseline surface)
//   { op:'REDACT', id, start, end, mode, ts }         — hide the span [start,end]s (mode 'silence'|'beep')
//   { op:'RETRACT', id, ref, ts }                      — undo the EDIT/REDACT whose id === ref

const isNum = (x) => typeof x === 'number' && isFinite(x);

// A long enough silence to read as a paragraph break, in seconds — the SAME gap organs/in/audio.js
// (transcriptViews) and transcript-export.js segment on, so a recomputed transcript paragraphs the
// way the original did.
export const PARA_GAP = 0.9;

// The redaction marker a hidden word becomes in the plain-text transcript, so a downstream model
// (chat grounding, EoT) never sees the redacted content — only that something was removed.
export const REDACTION_MARK = '▮';

// wordsToText(words) → the plain transcript string: words joined per line, a blank line on a
// PARA_GAP pause. A redacted word contributes the marker, not its surface.
export const wordsToText = (words = []) => {
  const lines = [];
  let cur = [];
  let prevEnd = null;
  for (const w of words) {
    if (!w) continue;
    if (prevEnd != null && isNum(w.start) && w.start - prevEnd >= PARA_GAP && cur.length) {
      lines.push(cur.join(' '));
      cur = [];
    }
    cur.push(w.redacted ? REDACTION_MARK : String(w.text ?? ''));
    if (isNum(w.end)) prevEnd = w.end;
    else if (isNum(w.start)) prevEnd = w.start;
  }
  if (cur.length) lines.push(cur.join(' '));
  return lines.join('\n\n');
};

// projectTranscript(baseWords, audioEvents) → { words, text, redactions }
//   words       [{ text, start, end, edited?, origText?, redacted? }] — the display list
//   text        the plain transcript (edits applied, redacted → marker) for chat/grounding/EoT
//   redactions  active [{ id, start, end, mode }] — feeds audio-dsp.applyRedactions
// Pure: baseWords and audioEvents are read, never mutated.
export const projectTranscript = (baseWords = [], audioEvents = []) => {
  const words = (Array.isArray(baseWords) ? baseWords : []).map((w) => ({
    text: String(w?.text ?? ''), start: w?.start, end: w?.end,
  }));
  const events = Array.isArray(audioEvents) ? audioEvents : [];

  // The retracted set: any event whose id is the ref of a RETRACT is undone.
  const retracted = new Set();
  for (const e of events) if (e && e.op === 'RETRACT' && e.ref != null) retracted.add(e.ref);

  // EDITs, in order — a word's surface becomes the latest edit's `to`; its baseline is preserved
  // in origText the first time it is touched, so the original is always recoverable and shown.
  for (const e of events) {
    if (!e || e.op !== 'EDIT' || retracted.has(e.id)) continue;
    const i = e.idx;
    if (!Number.isInteger(i) || i < 0 || i >= words.length) continue;
    if (words[i].origText == null) words[i].origText = e.from != null ? String(e.from) : words[i].text;
    words[i].text = String(e.to ?? '');
    words[i].edited = true;
  }

  // Active REDACTs → time spans, and the words they cover are marked hidden.
  const redactions = [];
  for (const e of events) {
    if (!e || e.op !== 'REDACT' || retracted.has(e.id)) continue;
    if (!isNum(e.start) || !isNum(e.end) || e.end <= e.start) continue;
    redactions.push({ id: e.id, start: e.start, end: e.end, mode: e.mode === 'beep' ? 'beep' : 'silence' });
  }
  if (redactions.length) {
    for (const w of words) {
      if (!isNum(w.start) || !isNum(w.end)) continue;
      for (const r of redactions) {
        if (w.start < r.end && w.end > r.start) { w.redacted = true; break; }
      }
    }
  }

  return { words, text: wordsToText(words), redactions };
};

// A fresh id for a new event — time-ordered enough for undo (the LAST event is the newest), and
// unique within a source's log. `seed` is the current event count; `stamp` an optional ms clock.
export const audioEventId = (op, seed = 0, stamp = 0) => `${op}-${seed}-${stamp}`;
