// EO: EVA(Field,Network,Link → Lens, Binding,Tending) — co-reading: the reflection at the reader's place
// surfer/co-read.js — CO-READING: deep reading tethered to the human's position.
//
// fold/deep-reading.js surfs to the place of most interest and reflects there. Idle, that place is
// the document's OWN steepest structure — a seed (idle.js I5) only varies which void the walk
// starts from, never the content. Co-reading points the SAME mechanism at YOU: where you read
// becomes the salience thread (salience.js positionThread, the Born rule), so "most interesting"
// is re-weighted toward the passage under your eye, and the reflection fires in the margin of THAT
// place — a companion glancing up and noticing, not a narrator running the whole book.
//
// Nothing is invented here; it is deep-reading.js COMPOSED:
//   positionThread(doc, position)  — the reader's place as an activated |T⟩ state (salience.js)
//   surfFold(doc, anchor, {thread}) — the peak, salience-conditioned toward that place (surf.js)
//   deepReading(doc, {anchor, thread}) — fold the peak, reflect, and the FIREWALL
// A live chat thread (or a lens filter) composes IN via combineThreads: "where you are" and "what
// is being discussed" pull on the same |T⟩ together.
//
// THE FIREWALL is unchanged and is what makes a margin-thought showable: every reflection is an
// enacted EVA, reafferent (`fromEnactor`), band VOID, canWitness === false BY TYPE (§8), and
// projectGraph skips EVA — so a co-read margin-thought can NEVER launder into a fact the document
// is claimed to say. The type keeps the reading's own thoughts and the witnessed text apart.
//
// THE GOVERNOR is the "catches on something" gate (deep-reading.js I3): the reflection fires only
// where the place BEATS the reach's own band (the surprise is real, not the flat between peaks).
// Below the band it returns null — the companion stays quiet rather than narrate every paragraph
// (rumination, the architecture's named worst failure). Habituation is the caller's `visited` set:
// dwell on a place already read and nothing re-fires.

import { surfFold } from './surf.js';
import { positionThread, combineThreads } from './salience.js';
import { deepReading, REFLECTION_ENACTMENT } from './fold/index.js';

const round = (x) => Math.round(x * 1e4) / 1e4;

// canon — fold smart quotes/dashes/whitespace/case, the same normalisation reader-render.js's
// scrollToText uses, so a snippet lifted off the rendered book matches the doc's own sentence text.
const canon = (s) => String(s || '')
  .replace(/[‘’‚‛]/g, "'").replace(/[“”„]/g, '"')
  .replace(/[–—‒]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();

// sentenceIndexOfText(doc, text, { from }) → the doc sentence index a piece of VISIBLE reading text
// belongs to — the bridge from the rendered book (reflowed paragraphs, no sentence indices) back to
// the doc's sentence space the co-reader anchors in. The reader reports where the eye has settled as
// TEXT (the block at the top of the viewport); this resolves it to the sentence index `coReadAt`
// needs, robust to reflow and to front-matter the book strips but the doc may still carry (it
// matches by text, never by positional counting). Returns -1 when nothing plausibly matches (→ the
// caller does nothing). `from` biases the scan forward from a known position (a reader rides
// forward), but a match anywhere is accepted so a jump backward still resolves.
export const sentenceIndexOfText = (doc, text, { from = 0 } = {}) => {
  const sents = doc?.units || doc?.sentences || [];
  const t = canon(text);
  if (!t || !sents.length) return -1;
  const start = Math.max(0, from | 0);
  // a sentence STARTS the visible block (its head is a prefix of the block), or the block starts the
  // sentence (a short block — a heading — is a prefix of the sentence). Scan forward first, then wrap.
  const hit = (cs) => {
    if (!cs) return false;
    const h = cs.slice(0, 24);
    return (h.length >= 8 && t.indexOf(h) === 0) || (t.length >= 8 && cs.indexOf(t.slice(0, 24)) === 0);
  };
  for (let i = start; i < sents.length; i++) if (hit(canon(sents[i]))) return i;
  for (let i = 0; i < start; i++) if (hit(canon(sents[i]))) return i;
  // fallback: the first sentence whose head appears anywhere in the block (a paragraph that reflows
  // several sentences — the block's lead sentence still lands us in the right neighbourhood).
  for (let i = 0; i < sents.length; i++) {
    const cs = canon(sents[i]);
    if (cs && cs.length >= 12 && t.indexOf(cs.slice(0, 16)) >= 0) return i;
  }
  return -1;
};

// coReadAt(doc, position, opts) → ONE governed co-reading pass at the reader's position. Builds the
// position-thread, surfs to the salience-weighted peak near `position`, folds it, and — only if the
// place beats the band — reflects there, firewalled. Returns the reflection record (as deepReading
// does, plus `worth`), or null when there is nothing fresh worth catching on (below band, off the
// reference apparatus, or already visited).
//   surf       INJECTED surfer (default surfFold) — kept injectable so the engine stays testable.
//   reflect    OPTIONAL model voice (fold, ctx) => { body, verdict }. Absent → the model-free note.
//   thread     OPTIONAL a live chat thread (threadBasis) to COMPOSE with the position — the lens /
//              the question steering alongside the eye. Absent → the position alone is the thread.
//   visited    a Set of cursors already reflected on — habituation (never re-reflect a place). The
//              caller owns it, so at-rest deep reading and co-reading share ONE habituation memory.
//   reach,gamma the position-thread window (how much of the passage around the eye pulls, decayed).
//   medianBand a caller floor beneath the reach's own band — the minimum surprise worth a thought.
//   commit     append the reflection to doc.log when it beats the band (default true). false peeks.
export const coReadAt = (doc, position, {
  surf = surfFold, reflect = null, thread = null, visited = null,
  reach = 4, gamma = 0.7, medianBand = 0, enactment = REFLECTION_ENACTMENT, commit = true,
} = {}) => {
  if (typeof surf !== 'function') throw new Error('coReadAt: surf(doc, anchor, opts) must be injected');
  if (!doc || !doc.log) return null;
  const p = Number.isInteger(position) ? position : 0;

  // the reader's place IS the thread — composed with any live chat thread the caller passes.
  const t = combineThreads(positionThread(doc, p, { reach, gamma }), thread);

  // peek: surf to the salience-weighted peak near the eye, fold it, and voice the note — without
  // committing, so a below-band place leaves the log untouched (the companion stays quiet).
  const seen = visited instanceof Set ? visited : new Set(visited || []);
  const peek = deepReading(doc, { surf, reflect, thread: t, anchor: p, visited: seen, enactment, commit: false });
  if (!peek) return null;

  // the "catches on something" gate (I3): reflect only where the place beats the reach's own band
  // AND any caller floor. Below → nothing worth saying here → null (never narrate the flat).
  const worth = peek.surprise > Math.max(medianBand, peek.band);
  if (!worth) return Object.freeze({ ...peek, worth: false });

  seen.add(peek.peak);                                    // habituate — never re-reflect this place
  const event = commit ? doc.log.append(peek.event) : peek.event;
  return Object.freeze({ ...peek, band: round(peek.band), event, committed: commit, worth: true });
};
