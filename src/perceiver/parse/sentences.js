// EO: SEG·EVA(Void → Field, Clearing) — sentence segmentation
// Sentence segmentation. Honours paragraph breaks.
// Drop-in replacement: any function (text) → string[].
//
// The boundary rule is a DEF — the established convention for where a sentence
// ends: a sentence-final mark (. ! ?) followed by space or end. The smartness is
// an EVA on each candidate '.': a period after a known ABBREVIATION (Mr, Mrs, Dr,
// St…) or a single capital INITIAL (J. Austen) is not a boundary — it abbreviates,
// so the cut is withheld. Without this, "Mr. Darcy" splits into "Mr." + "Darcy",
// and a one-token fragment is a junk unit that warps everything downstream (the
// meaning reader spikes on it, the graph mis-bonds). ! and ? are unambiguous and
// always cut.
//
// The abbreviation list itself lives in the conventions ledger (the home for the
// language-specific stuff), seeded as a DEF and learnable as a REC. The splitter
// holds none of its own: it takes an `isAbbreviation` predicate, defaulting to the
// ledger's seed so a standalone call still works. The pipeline hands it the live
// conventions, so a document's learned abbreviations flow straight in.
//
// HONEST SEAM — the boundary set is `.!?` only; `:` and `;` are not sentence ends.
// That is right for modern prose (a colon introduces a list or elaboration, not a
// new sentence), but WRONG for archaic text that uses the colon as its primary
// sentence separator. Measured on the KJV book of Genesis: 214 of 1458 units run
// over 40 words and the longest is 147 — whole genealogies welded into one unit
// because their verses end in `:`. This is not a local nuisance: the sentence is
// the reading UNIT everywhere downstream — the cursor steps per unit, the γ-mass /
// Bayesian surprise is computed per unit, the enacted loop breaks frames per unit,
// the coref decay window counts in units — so a 147-word unit silently degrades the
// surprise signal, the activation field, and the frame loop together, and it buries
// clause subjects deep enough that subject resolution (parse/relations.js) cannot
// reach them. The fix is a LEARNABLE boundary convention, and it is built:
// parse/boundaries.js runs the enacted DEF·EVA·REC loop over this very DEF, promoting
// `:`/`;` to a boundary for a document only when leaving them ignored fuses
// propositions into incoherent run-ons (meaning revising syntax). The promoted marks
// arrive here as `extraBoundaries`; modern prose, which fuses nothing, is unchanged.

import { SEED_ABBREVIATIONS } from '../../core/conventions/index.js';

const SEED_ABBR = new Set(SEED_ABBREVIATIONS);
const defaultIsAbbreviation = (w) => SEED_ABBR.has(String(w).toLowerCase());

// Is the period that ends `buf` an abbreviation/initial, not a sentence boundary?
// Reads the word immediately before the period. A single capital is an initial
// (J. R. R.); a known abbreviation (from the ledger) marks a title or contraction.
const abbreviates = (buf, isAbbreviation) => {
  const m = buf.slice(0, -1).match(/([A-Za-z]+)$/);
  if (!m) return false;
  const w = m[1];
  return /^[A-Z]$/.test(w) || isAbbreviation(w);
};

// ── The HEADING boundary — a line break that ends a heading/label, not a wrapped line ──
//
// Web prose (and any extracted-from-HTML text) carries section headings and list labels
// on their own line with NO terminal punctuation: "Planned reboot", "External links",
// "Ryan Coogler reboot", "Places". The paragraph loop below collapses a single `\n` to a
// space, so such a line WELDS onto the sentence beneath it — "Ryan Coogler reboot" + "In
// March 2023, …Chris Carter" became one sentence, and the relation reader, finding two
// admitted names with the heading word "reboot" between them, minted the phantom edge
// "Ryan Coogler -> Chris Carter : reboot" that produced the wrong "Carter" answer. The
// heading is its own unit; the `\n` after it is a boundary.
//
// The discriminator from a hard-wrapped PROSE line (Project Gutenberg wraps mid-sentence
// at ~70 chars) is conjunctive and conservative — a real wrapped line fails it on length
// alone (it carries ten-plus words): the line is SHORT, ends in no sentence mark, does not
// trail off on a continuation word (a clause that wraps ends on "the"/"to"/"and"/a verb-
// like aux), and the next line opens a fresh capitalised sentence. Miss toward NOT cutting
// — a welded heading is a known, bounded harm; a shattered prose sentence is worse.
const HEADING_MAX_WORDS = 4;
// A line ending in one of these is a clause that wrapped, never a heading — the tail the
// next line completes ("…lay on his" / "…slide off" / "…size of the"). Kept small and
// closed-class: articles, coordinators, common prepositions, the copula/aux/modal run.
const CONTINUATION_TAIL = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'nor', 'so', 'of', 'to', 'in', 'on', 'at', 'by',
  'for', 'with', 'from', 'as', 'than', 'that', 'which', 'who', 'whose', 'into', 'onto',
  'his', 'her', 'their', 'its', 'this', 'these', 'those', 'my', 'your', 'our',
  'is', 'was', 'were', 'are', 'be', 'been', 'being', 'will', 'would', 'could', 'should',
  'can', 'may', 'might', 'must', 'not', 'no', 'up', 'off', 'over', 'out',
]);
const isHeadingLine = (line, nextChar) => {
  const s = String(line).trim();
  if (!s) return false;
  if (/[.!?]$/.test(s)) return false;                       // a completed sentence is not a heading
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > HEADING_MAX_WORDS) return false;
  if (CONTINUATION_TAIL.has(words[words.length - 1].toLowerCase())) return false;  // a wrapped clause
  return nextChar === '' || /[A-Z0-9"'“(]/.test(nextChar);  // next line opens a fresh unit
};

// `extraBoundaries` is a set of marks the reading has LEARNED to treat as sentence
// ends for this document — beyond the `.!?` floor. It is empty by default (modern
// prose), and promoted by the boundary-induction loop (parse/boundaries.js) when a
// text uses `:`/`;` as sentence separators and meaning will not cohere otherwise.
export const segmentSentences = (
  text,
  { isAbbreviation = defaultIsAbbreviation, extraBoundaries = EMPTY } = {},
) => {
  const t = String(text || '').replace(/\r\n?/g, '\n');
  if (!t.trim()) return [];
  const out = [];
  for (const para of t.split(/\n{2,}/)) {
    // Collapse spaces/tabs but KEEP single newlines as candidate heading boundaries;
    // trim the spaces hugging each newline so a line's last/first word reads clean.
    const p = para.replace(/[^\S\n]+/g, ' ').replace(/ *\n */g, '\n').replace(/^\n+|\n+$/g, '');
    if (!p) continue;
    let buf = '';
    let lineStart = 0;                                  // start of the current physical line in `p`
    for (let i = 0; i < p.length; i++) {
      const ch = p[i];
      if (ch === '\n') {
        // A line break ends a physical line. If that line was a heading/label, the break
        // is a boundary; otherwise it is a soft wrap and reads as a space.
        const line = p.slice(lineStart, i);
        const nextChar = (p.slice(i + 1).match(/\S/) || [''])[0];
        lineStart = i + 1;
        if (isHeadingLine(line, nextChar)) {
          const s = buf.trim();
          if (s) out.push(s);
          buf = '';
        } else {
          buf += ' ';
        }
        continue;
      }
      buf += ch;
      const next = p[i + 1] || '';
      const isFloor = ch === '.' || ch === '!' || ch === '?';
      if ((isFloor || extraBoundaries.has(ch)) && (next === '' || /\s/.test(next))) {
        // The EVA: a '.' that abbreviates is not a boundary — withhold the cut. A
        // learned `:`/`;` boundary has no abbreviation case.
        if (ch === '.' && abbreviates(buf, isAbbreviation)) continue;
        const s = buf.trim();
        if (s) out.push(s);
        buf = '';
      }
    }
    if (buf.trim()) out.push(buf.trim());
  }
  return out;
};

const EMPTY = new Set();
