// EO: SEG·EVA(Void → Field, Clearing) — sentence segmentation (modality-agnostic)
// Sentence segmentation. Honours paragraph breaks. MODALITY-AGNOSTIC: starts with
// only double-newline as floor (universal across prose, code, music, DNA); boundary-
// induction discovers structure specific to the modality.
//
// The boundary rule is a DEF that adapts per modality:
//   Prose floor:     . ! ? (sentence-final marks)
//   Code floor:      ; newline (statement ends, line breaks)
//   Music floor:     note boundary (from music organ)
//   DNA floor:       codon boundary (from codon organ)
//
// Modality-agnostic floor:   \n\n (paragraph break, universal)
// Extra boundaries:          discovered by boundary-induction via coherence strain
//
// The EVA remains text-aware when text is present:
// abbreviation filtering (Mr., Dr., J. Austen) still applies.
//
// MODALITY-AGNOSTIC SHIFT: the segmenter now accepts EITHER:
//   1. Classic boundary marks (. ! ?) via extraBoundaries (prose, backward-compat)
//   2. Explicit markers ("full stop", "period", etc.) via markerPatterns
//   3. Structural marks (;, \n, {, }, etc.) via extraBoundaries (code)
//   4. Learned boundaries from coherence strain (all modalities)

import { createConventions } from '../../core/conventions/index.js';

// The default reads a DEFAULT LEDGER (sediment priors), not a private list — one home.
const DEF_C = createConventions();
const defaultIsAbbreviation = (w) => DEF_C.isAbbreviation(w);

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

// CJK sentence-final marks (ideographic/fullwidth full stop, exclamation, question). Unlike the
// ASCII floor these are UNCONDITIONAL boundaries: CJK is unspaced, so a mark is not followed by a
// space (清盛が来た。清盛は去った。) — the "followed by space/end" test the ASCII floor needs would
// never fire, welding a whole passage into one unit. A CJK final mark also never abbreviates, so it
// always cuts. Absent from any cased-script text, so this changes nothing there.
const CJK_FINAL = /[。｡！？﹗﹖]/;

// Predefined metalinguistic boundary markers that map to structural marks
const PREDEFINED_MARKERS = {
  'full stop': '.',
  'period': '.',
  'exclamation': '!',
  'exclamation mark': '!',
  'exclamation point': '!',
  'question': '?',
  'question mark': '?',
  'semicolon': ';',
  'colon': ':',
  'newline': '\n',
  'paragraph break': '\n\n',
  'end of line': '\n',
  'end of statement': ';',
};

// Detect repeated metalinguistic markers (e.g., "complete" used 5+ times as delimiter).
// Returns a map of detected marker text → structural replacement.
const detectMetalinguisticMarkers = (text) => {
  const detected = new Map();
  const words = text.match(/\b[a-z]+\b/gi) || [];
  const freq = {};

  // Count word frequencies
  words.forEach(w => {
    const lower = w.toLowerCase();
    freq[lower] = (freq[lower] || 0) + 1;
  });

  // Look for words appearing 3+ times that could be boundary markers
  // (heuristic: metalinguistic markers repeat frequently)
  Object.entries(freq).forEach(([word, count]) => {
    if (count >= 3 && word.length > 2) {
      // Check if this word appears in delimiter-like positions
      // (followed by content, or at line boundaries)
      const pattern = new RegExp(`\\b${word}\\b`, 'gi');
      const matches = [...text.matchAll(pattern)];
      if (matches.length >= 3) {
        // This word is repeated often enough to be a metalinguistic marker
        // Map it to a period as the default structural boundary
        detected.set(word.toLowerCase(), '.');
      }
    }
  });

  return detected;
};

// Convert explicit and detected markers to their structural equivalents.
// Ensure proper spacing so boundaries function correctly.
const normalizeExplicitMarkers = (text) => {
  let result = text;

  // Apply predefined markers first — these often come as phrases ("full stop")
  for (const [marker, replacement] of Object.entries(PREDEFINED_MARKERS)) {
    const pattern = new RegExp(`\\b${marker}\\b`, 'gi');
    result = result.replace(pattern, replacement);
  }

  // Then detect and apply any metalinguistic markers in the original text
  const detected = detectMetalinguisticMarkers(text);
  for (const [marker, replacement] of detected.entries()) {
    // Replace the marker word with its structural equivalent, ensuring spacing
    // so the boundary is properly recognized by the segmenter
    const pattern = new RegExp(`\\s+${marker}\\s+`, 'gi');
    result = result.replace(pattern, ` ${replacement} `);
  }

  return result;
};

// `extraBoundaries` is a set of marks the reading has LEARNED to treat as sentence
// ends for this document. Can include:
//   - `.!?` (prose marks, backward-compat)
//   - `;` (code statement ends)
//   - `\n` (code line breaks)
//   - `:` (archaic text or code labels)
//   - Any other discovered boundary via coherence strain
// Empty by default; promoted by boundary-induction (parse/boundaries.js).
export const segmentSentences = (
  text,
  { isAbbreviation = defaultIsAbbreviation, extraBoundaries = EMPTY, normalizeMarkers = true } = {},
) => {
  let t = String(text || '').replace(/\r\n?/g, '\n');

  // MODALITY-AGNOSTIC: Normalize explicit markers to structural equivalents
  if (normalizeMarkers) {
    t = normalizeExplicitMarkers(t);
  }

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
        // is a boundary; otherwise it is a soft wrap and reads as a space. BUT: if `\n`
        // is in extraBoundaries (learned as a code boundary), always cut.
        const line = p.slice(lineStart, i);
        const nextChar = (p.slice(i + 1).match(/\S/) || [''])[0];
        lineStart = i + 1;
        if (extraBoundaries.has('\n') || isHeadingLine(line, nextChar)) {
          const s = buf.trim();
          if (s) out.push(s);
          buf = '';
        } else {
          buf += ' ';
        }
        continue;
      }
      buf += ch;
      // A CJK sentence-final mark ends the unit outright — no trailing space in an unspaced script.
      if (CJK_FINAL.test(ch)) {
        const s = buf.trim();
        if (s) out.push(s);
        buf = '';
        continue;
      }
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
