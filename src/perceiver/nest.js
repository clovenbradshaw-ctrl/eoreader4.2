// EO: SEG·SYN(Field → Field, Dissecting,Composing) — nest extraction: one file → its nested sources
// nest.js — a single ingested file is often not one document but MANY nested inside one: a
// journal of forty book reviews, an mbox of emails, a chaptered book, a transcript of turns.
// Ingested flat, it is ONE source spanning the whole axis (multilevel.js sourceRanges), so the
// chorus surf has nothing to triage — it reads one neighbourhood and lets the other thirty-nine
// reviews go unread (the source DRIFT the audits show). This module recovers the nesting: it cuts
// the file at the boundaries its own reading surprise marks, and re-presents the SAME text as a
// COMPOSITE of its parts. Then sourceRanges sees the parts, and the chorus (richSurf /
// multiLevelSurf) drops the off-topic ones and reads only the sub-document the ask concerns.
//
// The boundary is not stated by a human — it is READ off the signal, the same way the void
// boundary and the SEG cut are (predict/segment.js): a boundary is a LOCAL PEAK in the surf's own
// reading surprise, above the (1−alpha) quantile of its background, no two within minGap. So the
// file segments itself; alpha is the only knob (the tolerated false-cut rate), minGap the shortest
// a sub-document may be.
//
// Pure and deterministic: the surf is a pure read, the parse is deterministic, and nothing is
// appended to any log. A file with no internal nesting (one segment survives) is returned
// UNCHANGED — the non-nested case pays nothing and reads exactly as before.

import { parseText, tok } from './parse/index.js';
import { surfFold } from '../surfer/index.js';
import { learnBoundariesFromSurprise } from './predict/index.js';
import { createCompositeDoc } from '../organs/in/index.js';

// The surprise the whole-document surf reads at every unit — the signal the cuts are made from.
// surprisalBits is the per-unit information the reading did not predict; a new sub-document opens
// with a jump in it (a topic the prior part never set up). bayes is the fallback when a field
// entry carries no surprisalBits.
const surpriseSeries = (doc) => {
  const surf = surfFold(doc, 0, { reach: 'adaptive' });
  return (surf.field || []).map((f) => ({ at: f.idx, surprise: f.surprisalBits ?? f.bayes ?? 0 }));
};

// The boundaries (sub-document START indices, 0 first) the file's own reading surprise marks.
export const nestBoundaries = (doc, { alpha = 0.06, minGap = 6 } = {}) =>
  learnBoundariesFromSurprise(surpriseSeries(doc), { alpha, minGap });

// A name for a nested source, emergent from its OWN strongest content terms — so a part is
// addressed by what it is about ("doc#7:symmetry-molecular-groups"), not a bare ordinal. This is
// the same "names emergent from content, not position" the section surface reads.
const nameOf = (text, k, docId) => {
  const tf = new Map();
  for (const t of tok(text)) tf.set(t, (tf.get(t) || 0) + 1);
  const top = [...tf.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t);
  return `${docId || 'doc'}#${k + 1}${top.length ? `:${top.join('-')}` : ''}`;
};

// nestComposite(doc, opts) → the SAME text as a COMPOSITE of its nested sub-documents (isComposite,
// origin per unit), ready for the chorus to triage; or the doc UNCHANGED when it shows no nesting.
// Segments of one file get the SAME cross-doc SYN pass any composite gets (crossDocSyn: true, the
// createCompositeDoc default) — NOT held apart. This matters for the case nesting exists to serve
// as much as the journal does: a chaptered NOVEL. Split into chapters, "Victor Frankenstein" named
// identically in chapter 1 and chapter 15 must still resolve to ONE referent, or the nesting that
// let the chorus find the right chapter would break coreference across the very work it read. The
// cross-doc pass is exactly the machinery the Armstrong probe validates: it merges a SHARED,
// specific label across parts (the same Victor); it does not merge distinct labels that merely
// share a surname (Neil Armstrong stays apart from Louis Armstrong) — so a journal's unrelated
// reviews are no more at risk here than any other composite already accepts.
export const nestComposite = (doc, { alpha = 0.06, minGap = 6, minSegments = 2 } = {}) => {
  if (!doc) return doc;
  const units = doc.units || doc.sentences || [];
  if (units.length < 2 * minGap) return doc;                    // too short to carry a nesting
  const bounds = nestBoundaries(doc, { alpha, minGap });
  if (bounds.length < minSegments) return doc;                  // one segment → not a composite

  // The [lo, hi) unit ranges between successive boundaries, with RUNTS folded back: a sub-document
  // has extent (the SEG coherence — a shape is not a single point), so a segment shorter than
  // minGap is not its own document; it merges into the one before it. This is what keeps a
  // coherent passage that threw one weak late peak from splitting into a body + a one-line tail.
  const ranges = [];
  for (let k = 0; k < bounds.length; k++) {
    const lo = bounds[k];
    const hi = (k + 1 < bounds.length) ? bounds[k + 1] : units.length;
    if (ranges.length && (hi - lo) < minGap) ranges[ranges.length - 1][1] = hi;   // fold the runt back
    else ranges.push([lo, hi]);
  }
  if (ranges.length < minSegments) return doc;                  // it was one document after all

  const parts = [];
  for (let k = 0; k < ranges.length; k++) {
    const [lo, hi] = ranges[k];
    const segText = units.slice(lo, hi).join('\n');
    if (segText.trim().length < 20) continue;                   // an empty cut carries no document
    parts.push(parseText(segText, { docId: nameOf(segText, k, doc.docId) }));
  }
  if (parts.length < minSegments) return doc;
  return createCompositeDoc(parts);
};
