// Unit-offset recovery (docs/parse-conformance-spec.md Tier 2).
//
// HONEST SEAM: the engine's text perceiver does not carry byte offsets on its
// units. `segmentSentences` (src/perceiver/parse/sentences.js) returns bare
// strings; `buildTextReading`'s `resolve(span)` (src/perceiver/text/waveform.js)
// answers with `{ sentIdx, preview }`, not a byte range into the source. That is
// exactly the gap Tier 2 test #9 predicts ("if the pipeline rewrites text it must
// carry an explicit offset map, and this test is what forces that map to exist").
//
// Rather than assert a byte-offset contract that does not exist yet, this module
// RECOVERS one: segmentSentences is a whitespace-normalizing, content-preserving
// transform (paragraph split on 2+ newlines, run-of-whitespace collapse to a
// single space, trim). Every non-whitespace character a unit contains must
// therefore appear, verbatim and in order, somewhere in the source text, with the
// unit's single spaces standing in for one-or-more original whitespace
// characters (possibly a newline). That is enough structure to relocate each
// unit's span by a forward-only scan — which is exactly the mapping a real
// offset-map feature would need to maintain, so this doubles as the harness that
// would let one be added and verified.
//
// This is unit-recovery, not a claim that the engine tracks offsets today. Tier 2
// tests built on it check what recovery proves (content is conserved, in order,
// non-overlapping) — never that resolve() itself returns byte ranges, since it
// does not.

const WS_RE = /\s/;

// Try to align `unitText` against `src` starting EXACTLY at `srcPos`: a RUN of
// one-or-more literal ' ' characters in unitText consumes one-or-more
// whitespace characters in src; every other character must match literally.
// Returns the end position in `src`, or -1 on failure. A hand-rolled two-
// pointer scan, not a regex — a single ~60KB unit (the huge-single-line
// degenerate fixture) built as one giant `\s+`-joined alternation blows past
// the regex engine's pattern-length limit, and a linear scan is both correct
// and the faster path anyway.
//
// A RUN of consecutive spaces in unitText — not each space individually —
// consumes ONE contiguous source whitespace stretch: segmentSentences can
// deposit two adjacent single-space soft-wraps into one unit (e.g. a poem
// quotation whose CRLF-normalized source has a line containing only a
// trailing space between two newlines — frankenstein.txt around "Like one
// who, on a lonely road" is exactly this case) — that is still ONE gap in the
// source, however many separate append events produced it, so treating each
// space char as its own \s+ boundary would starve the second one and fail a
// match that is, in fact, correct.
const matchAt = (src, srcPos, unitText) => {
  let i = srcPos, j = 0;
  const n = src.length, m = unitText.length;
  while (j < m) {
    const uc = unitText[j];
    if (uc === ' ') {
      while (j < m && unitText[j] === ' ') j++;      // collapse a run of unit-text spaces to one boundary
      if (i >= n || !WS_RE.test(src[i])) return -1;
      while (i < n && WS_RE.test(src[i])) i++;
    } else {
      if (i >= n || src[i] !== uc) return -1;
      i++; j++;
    }
  }
  return i;
};

// deriveUnitOffsets(text, units) -> [{ start, end, ok }]  (UTF-16 code-unit / JS
// string-index offsets — see charOffsetsToByteOffsets below to convert to true
// UTF-8 byte offsets for a manifest fixture's raw bytes).
//
// Forward-only: each unit is searched starting at the end of the previous
// unit's match, so units in reading order can never be mis-mapped to an earlier,
// coincidentally-identical span. `ok:false` (start/end null) marks a unit this
// recovery could not locate — itself a finding (segmentSentences produced text
// that is not a subsequence of the source), never silently skipped.
export const deriveUnitOffsets = (text, units) => {
  const src = String(text);
  const out = [];
  let cursor = 0;
  for (const u of units) {
    const unitText = String(u);
    if (unitText === '') { out.push({ start: cursor, end: cursor, ok: true }); continue; }
    const first = unitText[0];
    let start = -1, end = -1;
    for (let pos = cursor; pos < src.length; pos++) {
      if (first !== ' ' && src[pos] !== first) continue;    // cheap prefilter
      const e = matchAt(src, pos, unitText);
      if (e !== -1) { start = pos; end = e; break; }
    }
    if (start === -1) { out.push({ start: null, end: null, ok: false }); continue; }
    out.push({ start, end, ok: true });
    cursor = end;
  }
  return out;
};

// Convert a JS string char-index offset to a true UTF-8 byte offset — the literal
// "byte offset" language the spec uses, for a fixture whose canonical form is
// raw bytes (fixtures.js loads each fixture as both `bytes` and `text`).
const encoder = new TextEncoder();
export const charOffsetToByteOffset = (text, charIdx) =>
  encoder.encode(String(text).slice(0, charIdx)).length;

export const charOffsetsToByteOffsets = (text, offsets) =>
  offsets.map(({ start, end, ok }) => ({
    ok,
    start: ok ? charOffsetToByteOffset(text, start) : null,
    end:   ok ? charOffsetToByteOffset(text, end)   : null,
  }));

// The non-whitespace ("content") character count of a string — the invariant a
// lossless, whitespace-normalizing transform must conserve exactly.
export const contentCharCount = (s) => (String(s).match(/\S/g) || []).length;

// Total content-character count across a source text, for comparison against the
// sum of recovered per-unit spans (also counted content-only, since inter-unit
// gaps are whitespace/paragraph-boundary by construction).
export const totalContentChars = (text) => contentCharCount(text);
