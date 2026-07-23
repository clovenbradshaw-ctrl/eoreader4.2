// EO: EVA·REC·DEF(Field → Paradigm, Composing) — boundary induction (meaning revises syntax)
// Boundary induction — the DEF·EVA·REC loop that lets MEANING revise SYNTAX.
//
// Presence is bedrock: that these marks are here, in this order, is not up for
// revision. But where a sentence ENDS is an interpretation — the lowest DEF the
// reader makes — and like every interpretation it is provisional. The segmenter's
// established rule is `boundary = .!?` (sentences.js). For most text that holds. For
// a text that uses the colon as its sentence separator (the KJV), it does not: whole
// genealogies fuse into one unit, and the meaning will not cohere — a patriarch's
// clause welds to the "generations of X" frame and the begat falls to a stray
// referent ("God begat Shem"). That incoherence is not noise; it is a MEASUREMENT on
// the syntax beneath it.
//
// So this runs the SAME enacted DEF·EVA·REC loop the significance engine runs
// (core/enacted/loop.js), pointed down at the boundary convention instead of the figure
// field:
//
//   DEF   the boundary set begins at the floor `.!?` (the seed commitment).
//   EVA   each unit is tested for COHERENCE STRAIN — how many independent
//         propositions it fuses across an ignored mark (a punctuation character
//         the document uses regularly enough, relative to its own floor marks,
//         to be plausible — see discoverCandidates below, not a fixed `:`/`;`
//         alphabet). A coherent one-proposition unit confirms the frame and
//         adds nothing; a run-on strains it. Surprise sourced from "meaning
//         did not emerge here."
//   REC   when the leaky strain accumulates past threshold — a crisis, not a single
//         anomaly, so it stays RARE — the frame breaks: promote the ignored mark
//         that accounts for the most fusion to a boundary, re-segment, and re-run
//         until the reading settles (the spiral converges, or promotes every
//         candidate the document actually strains on).
//
// The existence floor still binds: the loop may only promote a mark that is ALREADY
// in the text, to fit the tokens that exist — it can move where a unit ends, never
// invent one. The witness deposits, the convention layer decides (it RECs itself).

import { createEnactedLoop } from '../../core/enacted/index.js';
import { deriveNull } from '../../core/index.js';
import { segmentSentences } from './sentences.js';

// The candidate marks are DISCOVERED from the document, never compiled in as "the
// marks that separate sentences in language X" — a fixed `[':', ';']` alphabet is
// exactly the kind of hard rule this module exists to replace, and it silently
// assumes the document is written in a script that even uses those two glyphs
// (the Hebrew verse-end sof-pasuq `׃` and the Arabic '۔' never got a seat at this
// table under the old list, not because they were considered and rejected, but
// because nobody added them). The existence floor still binds — see below.
const FLOOR_MARKS = new Set(['.', '!', '?']);              // sentences.js's own floor
const CJK_FINAL_MARKS = new Set(['。', '｡', '！', '？', '﹗', '﹖']); // sentences.js CJK_FINAL — never re-litigated
// A mark seen only once or twice is noise (an OCR artifact, a stray em dash), not a
// document convention — this floor is about being a PLAUSIBLE candidate, not about
// whether it actually separates sentences; the significance gate below still
// decides that. Presence is bedrock, but presence ONCE is not a convention.
const MIN_MARK_OCCURRENCES = 8;

// Subjects that open an independent clause after a mark (a new proposition, not a
// list item): any letter, in any script — not a hardcoded Latin-capital-or-English-
// pronoun list, which by construction could never match Hebrew or Arabic text
// (neither has letter case, and "he/she/they/thou/ye" are English words). The
// word-count floor in fusionByMark below (>=4 words) is what actually tells a
// clause from a list item; this only excludes a mark followed by bare digits or
// more punctuation (a list: "1, 2, 3"), which holds regardless of script.
const CLAUSE_OPENER = /^\s*\p{L}/u;

const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}''-]*/gu;

// What actually distinguishes a sentence-boundary punctuation mark from an
// ordinary frequent one is neither "recurs often" (Unicode's
// Terminal_Punctuation property includes the comma, not only true
// sentence-enders — that alone let a comma-boundary through, roughly
// DOUBLING sentence counts on ordinary English novels, measured on
// Frankenstein/Heart of Darkness) nor low gap-variance (tried — real sentence
// lengths vary enough that even the period's own gap has a coefficient of
// variation around 0.5–0.6 on real prose, so "regular spacing" is not
// actually a property real terminal marks have).
//
// What real text DOES show, measured on four real documents (King James
// Genesis 1–10, Frankenstein, Heart of Darkness, a Basque novel — gaps
// counted in WORDS): a genuine sentence-scale mark recurs at intervals AT
// LEAST AS LONG AS the reader's own already-trusted floor (`.!?`) —
// colon/semicolon sit at 2.0×–65× the floor's mean gap across all four texts
// — while the comma tops out at 0.95× it (and runs as low as 0.43× in the
// KJV), clause-internal rather than sentence-scale, in every one of them.
// Comma density relative to sentence length varies a lot by author (0.43×
// to 0.95× across these four alone — an earlier, lower cutoff of 0.8× still
// let two of the four comma's through), but the gap between "no comma
// observed above 0.95×" and "no genuine terminal mark observed below 2.0×"
// is wide enough to hold a line with real margin. The floor marks are the
// reference precisely because nothing in this reader doubts them; a
// candidate has to be at least this rare to be plausible as their peer, not
// a hard number invented in isolation.
const FLOOR_RELATIVE_MIN = 1.2;

// The gap-ratio test alone has a hole: in a long document, almost ANY rare
// mark that happens to occur only MIN_MARK_OCCURRENCES (8) times will
// trivially have a huge average gap — 8 hits spread across a 75,000-word
// novel are ~9,000 words apart on average by simple arithmetic, nothing to do
// with being a real convention. A genuine sentence-scale mark also has to
// recur often enough, relative to the floor's own count, that "once roughly
// every so many sentences" is plausible — colon/semicolon sit at 0.29–0.49×
// the floor's count in the same two real texts. Both signals are required
// together.
const MIN_COUNT_RATIO = 0.1;

// Word-index occurrence positions for a punctuation candidate — mapped to the
// nearest preceding word so gaps read in a consistent unit ("words between
// occurrences") comparable to the floor's own gap, regardless of how the
// floor and the candidate are spaced in raw characters.
const wordIndexAt = (words, charOffset) => {
  let lo = 0, hi = words.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid].end <= charOffset) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
};

const meanGap = (ends) => {
  if (ends.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < ends.length; i++) sum += ends[i] - ends[i - 1];
  return sum / (ends.length - 1);
};

// Collect every Terminal_Punctuation character beyond the floor/CJK marks,
// then keep only the ones recurring at least as rarely, in words, as the
// document's own floor marks — see FLOOR_RELATIVE_MIN/MIN_COUNT_RATIO. A
// document with too few floor marks to trust (using NO period/exclamation/
// question mark at all — e.g. Hebrew or Arabic script, which mark sentence
// ends with their own Terminal_Punctuation characters instead) falls back to
// a population-relative test: the same "structure vs. its own noise null"
// discipline voidnull.js runs for every other significance decision in this
// codebase (deriveNull), pointed at gap size — keep candidates whose mean gap
// is a genuine outlier among this document's OWN candidates, not everything
// above a line picked by hand.
const discoverCandidates = (text) => {
  const words = [];
  let m;
  WORD_RE.lastIndex = 0;
  while ((m = WORD_RE.exec(text))) words.push({ end: m.index + m[0].length });

  const marks = new Set();
  for (const ch of text) {
    if (FLOOR_MARKS.has(ch) || CJK_FINAL_MARKS.has(ch)) continue;
    if (/\p{Terminal_Punctuation}/u.test(ch)) marks.add(ch);
  }

  const occurrences = (matchSet) => {
    const ends = [];
    for (let i = 0; i < text.length; i++) {
      if (!matchSet.has(text[i])) continue;
      const wi = wordIndexAt(words, i);
      if (wi >= 0) ends.push(wi);
    }
    return ends;
  };

  const floorEnds = occurrences(FLOOR_MARKS);
  const floorGap = floorEnds.length >= MIN_MARK_OCCURRENCES ? meanGap(floorEnds) : null;
  const floorCount = floorEnds.length;

  const rows = [];
  for (const mark of marks) {
    const ends = occurrences(new Set([mark]));
    if (ends.length < MIN_MARK_OCCURRENCES) continue;
    const gap = meanGap(ends);
    if (gap <= 0) continue;
    rows.push({ mark, gap, count: ends.length });
  }

  if (floorGap != null) {
    return rows
      .filter((r) => r.gap >= floorGap * FLOOR_RELATIVE_MIN && r.count >= floorCount * MIN_COUNT_RATIO)
      .map((r) => r.mark);
  }
  // No floor to compare against AND too few candidate marks for deriveNull's
  // own background requirement (MIN_SAMPLES, leave-one-out) to mean anything
  // — a script with a small punctuation vocabulary (Hebrew biblical text has
  // exactly two Terminal_Punctuation marks in ordinary use) has no "population"
  // to be an outlier against. There is no comma-vs-colon ambiguity to resolve
  // with only a couple of candidates; existence + the frequency floor already
  // cleared (MIN_MARK_OCCURRENCES) is the only test available, and the
  // downstream fusion+REC loop is still the real judge of whether ignoring the
  // mark actually fuses independent clauses.
  if (rows.length < 4) return rows.map((r) => r.mark);
  const gaps = rows.map((r) => r.gap);
  const out = [];
  for (const r of rows) {
    const line = deriveNull(gaps, { scale: 'log', alpha: 0.01, N: gaps.length, leaveOut: r.gap });
    if (Number.isFinite(line) && r.gap > line) out.push(r.mark);
  }
  return out;
};

const escapeForCharClass = (ch) => ch.replace(/[\\\]^-]/g, '\\$&');

// All occurrences of a candidate punctuation mark in `text`, as end-offsets
// (the position right after the mark).
const findMarkOccurrences = (text, mk) => {
  const ends = [];
  for (let i = 0; i < text.length; i++) if (text[i] === mk) ends.push(i + 1);
  return ends;
};

// How many independent propositions a unit FUSES across each still-ignored
// mark. A mark counts only when an independent clause of real length follows
// it — so a colon before a short list item ("sons: Shem, Ham") does not
// strain, but a colon before a clause ("of Shem: Shem was an hundred years
// old…") does. The "where does the following clause end" probe stops at any
// mark that could plausibly end it — the floor plus every candidate under
// test this pass, never a hardcoded `[:;.!?]`.
const fusionByMark = (unit, ignored) => {
  const counts = {};
  for (const mk of ignored) counts[mk] = 0;
  const stopClass = [...FLOOR_MARKS, ...ignored].map(escapeForCharClass).join('');
  const stopRe = new RegExp(`[${stopClass}]`);
  for (const mk of ignored) {
    for (const end of findMarkOccurrences(unit, mk)) {
      const after = unit.slice(end);
      if (!CLAUSE_OPENER.test(after)) continue;
      const seg = after.split(stopRe)[0].trim();
      if (seg.split(/\s+/).filter(Boolean).length >= 4) counts[mk]++;   // a clause, not a fragment
    }
  }
  return counts;
};

// The strain loop needs several DISCRETE readings to accumulate a crisis over —
// one giant unit gives it nothing to compare. `segmentSentences` on the floor
// alone provides that for free whenever `.!?` (or an already-promoted mark)
// does most of the real work, as in the KJV colon case. But a document with NO
// floor punctuation at all — one that marks every sentence end with a word
// convention instead ("...signed full stop Witnesses then...") — is one solid
// unit under the floor alone, no matter how long it is; segmentSentences never
// gets a chance to even be tested.
//
// This provisional split must NOT cut on the candidates under test — that would
// pre-empty every "ignored" mark's own fusion count to zero (each unit would
// already stop right where the mark sits, leaving nothing after it to measure),
// inverting the whole point of "ignored" (pretend this mark is NOT a boundary,
// see how much runs together). So it partitions on something candidate-blind
// instead: paragraph breaks if there are enough of them, otherwise fixed-size
// word chunks, generous enough (>=40 words) that several real candidate
// occurrences still land inside each chunk with room to measure what follows.
// It decides nothing on its own; fusionByMark still has to find genuine strain
// in what it produces before anything is promoted.
const BOOTSTRAP_CHUNK_WORDS = 40;
const bootstrapSplit = (text) => {
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paras.length >= 4) return paras;
  const words = text.split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < words.length; i += BOOTSTRAP_CHUNK_WORDS) out.push(words.slice(i, i + BOOTSTRAP_CHUNK_WORDS).join(' '));
  return out;
};

// Run the loop to convergence. Returns the learned boundary set (beyond the floor)
// and the REC entries — one per promotion — for the conventions log.
export const induceBoundaries = (text, { isAbbreviation, thresholds, confirmBand } = {}) => {
  const extraBoundaries = new Set();
  const recs = [];
  // Discovered ONCE from the whole document, up front — the candidate set itself
  // does not change pass to pass, only which of its members are still `ignored`
  // (not yet promoted) does.
  const candidateMarks = discoverCandidates(text);

  // At most one promotion per candidate mark; the loop re-runs after each so a
  // second mark is judged against the units the first one already fixed.
  for (let pass = 0; pass <= candidateMarks.length; pass++) {
    const ignored = new Set(candidateMarks.filter((m) => !extraBoundaries.has(m)));
    if (ignored.size === 0) break;

    let units = segmentSentences(text, { isAbbreviation, extraBoundaries });
    if (units.length < 4) units = bootstrapSplit(text);
    if (units.length < 4) break;                       // too thin to fit a convention

    // EVA strain per unit, and the per-mark tally that decides the restructuring.
    const total = {};
    for (const mk of ignored) total[mk] = 0;
    const strain = units.map((u) => {
      const f = fusionByMark(u, ignored);
      let s = 0;
      for (const mk of ignored) { total[mk] += f[mk]; s += f[mk]; }
      return s;
    });

    // The enacted loop is the witness: it decides WHETHER the frame breaks (a rare,
    // accumulated crisis), reading the coherence strain as its surprise.
    const loop = createEnactedLoop({
      layers: ['segmentation'],
      thresholds: { segmentation: thresholds?.segmentation ?? 3 },
      confirmBand: confirmBand ?? 0.4,                 // a unit fusing <1 clause confirms
      impulseThreshold: 1.1,                           // accumulation only — no single-unit shock
      read: (i) => ({ surprise: Math.min(1, strain[i] / 2), terms: [...extraBoundaries] }),
    });
    loop.runTo(units.length - 1);
    if (!loop.events.some((e) => e.op === 'REC')) break;   // the frame held — converged

    // Restructure: promote the ignored mark that accounts for the most fusion.
    const mark = [...ignored].sort((a, b) => total[b] - total[a])[0];
    if (!total[mark]) break;
    extraBoundaries.add(mark);
    recs.push({ op: 'REC', kind: 'boundary', token: mark, fused: total[mark], reader: 'reading' });
  }

  return { extraBoundaries, recs };
};
