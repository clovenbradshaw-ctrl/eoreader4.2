// EO: CON·EVA(Field,Link → Link, Binding,Tracing) — the durable passage anchor
// The durable passage anchor (docs/search-and-pins.md). Everything pinnable bottoms out in a
// passage, and a passage today has no durable address: the ¶N the surface shows is a sentence
// index re-derived on every parse, a chat cite's idx is a composite-axis index that shifts with
// the turn's scope, and every jump resolves by verbatim-text prefix matching. The anchor is the
// missing tuple — { sn, docId, sourceSha, unit, charSpan, spanHash, text } — every field of which
// composes from machinery that already exists: src.sha and webContentHash (organs/ingest/
// websource.js), the source-local sentence axis, and the canon fold scrollToText resolves by.
//
// Two disciplines, both inherited:
//   · the quote is EMBEDDED, never merely linked (rooms/archive/pin.js) — an anchor carries its
//     own text, so it can testify even when the source has moved under it.
//   · resolution is a LADDER, and drift is honest (websource.js verifyCitation's fail-closed
//     posture): sha-verified slice → re-locate by quote → canon-fold approximation → MOVED.
//     An anchor never silently rebinds and never silently vanishes — the same "the ground moved"
//     discipline the topline applies to a claim whose footing was pulled.
//
// The one subtlety this module owns: sentences are NOT verbatim slices of the raw text. The
// segmenter (perceiver/parse/sentences.js) collapses whitespace runs, folds soft-wrapped lines
// to a space, and trims — so a unit maps back to the raw text only under WHITESPACE EQUIVALENCE:
// every non-whitespace character survives in order, and one unit-space answers any raw
// whitespace run. unitSpans is the two-pointer walk that recovers exact char offsets under that
// equivalence; a plain indexOf would miss every wrapped line.
//
// Pure and model-free: (text, units, anchors) in, (spans, verdicts) out. The one import is the
// shared content hasher, itself pure — so this runs in a unit test exactly as in the browser.

import { webContentHash } from '../../organs/ingest/index.js';

// The same fold scrollToText resolves by (reader-render.js) — smart quotes, dashes, whitespace,
// case. Exported so the approximate rung and the renderer stay one convention.
export const canon = (s) => String(s || '')
  .replace(/[‘’‚‛]/g, "'").replace(/[“”„]/g, '"')
  .replace(/[–—‒]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();

// The span's own fixity — the hash of the CANONICAL text, so a span survives the source being
// re-fetched with different line wrapping, and fails only when the words themselves changed.
export const spanHashOf = (text) => webContentHash(canon(text));

const isWs = (ch) => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f' || ch === '\v' || ch === ' ';

// Try to match `unit` at raw-text position `at` under whitespace equivalence: a unit-space
// consumes one-or-more raw whitespace characters; every other character must match exactly.
// Returns the END offset (exclusive) or -1.
const tryMatch = (t, at, unit) => {
  let i = at;
  for (let j = 0; j < unit.length; j++) {
    const c = unit[j];
    if (c === ' ') {
      if (i >= t.length || !isWs(t[i])) return -1;
      while (i < t.length && isWs(t[i])) i++;
    } else {
      if (t[i] !== c) return -1;
      i++;
    }
  }
  return i;
};

// First whitespace-equivalent occurrence of `unit` in `t` at or after `from` → { start, end } | null.
const matchFrom = (t, from, unit) => {
  const s = String(unit || '');
  if (!s) return null;
  let i = t.indexOf(s[0], Math.max(0, from));
  while (i !== -1) {
    const end = tryMatch(t, i, s);
    if (end !== -1) return { start: i, end };
    i = t.indexOf(s[0], i + 1);
  }
  return null;
};

// unitSpans(rawText, units) → [[start, end] | null, …] — char offsets into the raw text for each
// sentence unit, recovered under whitespace equivalence. The walk is monotonic (a cursor advances
// past each match) so repeated sentences land in reading order; a unit that cannot be recovered
// leaves null WITHOUT advancing the cursor, so one bad unit never derails the rest.
export const unitSpans = (rawText, units) => {
  const t = String(rawText || '');
  const xs = units || [];
  const spans = new Array(xs.length).fill(null);
  let cursor = 0;
  for (let u = 0; u < xs.length; u++) {
    const hit = matchFrom(t, cursor, xs[u]);
    if (hit) { spans[u] = [hit.start, hit.end]; cursor = hit.end; }
  }
  return spans;
};

// Find a quote (whitespace-equivalent, falling back to canon-fold search) → { start, end } | null.
// The canon rung scans for the folded needle inside the folded haystack and then recovers raw
// offsets by re-walking — approximate by construction, so callers must mark it as such.
const findSpan = (t, quote) => {
  const exact = matchFrom(t, 0, String(quote || '').trim());
  if (exact) return exact;
  const needle = canon(quote);
  if (needle.length < 8) return null;
  // Walk the raw text accumulating the canon fold with an offset map, then indexOf on the fold.
  const map = [];   // folded index → raw index
  let folded = '';
  let pendingWs = false;
  const raw = t;
  for (let i = 0; i < raw.length; i++) {
    let ch = raw[i];
    if (isWs(ch)) { pendingWs = folded.length > 0; continue; }
    if (pendingWs) { folded += ' '; map.push(i - 1); pendingWs = false; }
    if ("‘’‚‛".includes(ch)) ch = "'";
    else if ('“”„'.includes(ch)) ch = '"';
    else if ('–—‒'.includes(ch)) ch = '-';
    folded += ch.toLowerCase(); map.push(i);
  }
  const at = folded.indexOf(needle);
  if (at < 0) return null;
  const start = map[at];
  const end = (map[at + needle.length - 1] ?? (raw.length - 1)) + 1;
  return { start, end };
};

// anchorFor({ src, doc, unit, quote }) → anchor | null. Mint from a sentence unit (preferred —
// the span is exact by construction) or from a bare quote (located in the raw text). `src` is the
// S-registry row ({ sn, docId, sha, text }); `doc` the parsed doc when a unit index is given.
export const anchorFor = ({ src, doc = null, unit = null, quote = null } = {}) => {
  if (!src || typeof src.text !== 'string') return null;
  let span = null, text = null, unitIdx = Number.isInteger(unit) ? unit : null;
  if (unitIdx != null && doc && Array.isArray(doc.sentences) && doc.sentences[unitIdx] != null) {
    const s = unitSpans(src.text, doc.sentences)[unitIdx];
    span = s ? { start: s[0], end: s[1] } : null;
    text = doc.sentences[unitIdx];
  } else if (quote) {
    span = findSpan(src.text, quote);
    text = span ? src.text.slice(span.start, span.end) : String(quote);
  }
  if (!text) return null;
  return Object.freeze({
    sn: src.sn ?? null, docId: src.docId ?? null,
    sourceSha: src.sha ?? null,
    unit: unitIdx,
    charSpan: span ? [span.start, span.end] : null,
    spanHash: spanHashOf(text),
    text: String(text).slice(0, 280),
  });
};

// resolveAnchor(anchor, src) → { status, text, charSpan, jump } — the ladder.
//   exact      — the source is byte-identical (sha match) and the span slice still hashes true.
//   relocated  — the source changed but the quote was found verbatim (whitespace-equivalent).
//   approx     — only the canon fold finds it; offsets are approximate and marked so.
//   moved      — the ground moved: source gone, or the words are no longer carried.
// `jump` is always usable by the existing affordance (openViewer(sn, text) → scrollToText).
export const resolveAnchor = (anchor, src) => {
  const a = anchor || {};
  const jump = { sn: a.sn ?? null, text: a.text || '' };
  if (!src || typeof src.text !== 'string')
    return { status: 'moved', reason: 'source-gone', text: a.text || '', charSpan: null, jump };
  if (a.sourceSha && src.sha === a.sourceSha && Array.isArray(a.charSpan)) {
    const slice = src.text.slice(a.charSpan[0], a.charSpan[1]);
    if (slice && spanHashOf(slice) === a.spanHash)
      return { status: 'exact', text: slice, charSpan: [a.charSpan[0], a.charSpan[1]], jump };
  }
  const found = a.text ? findSpan(src.text, a.text) : null;
  if (found) {
    const slice = src.text.slice(found.start, found.end);
    const status = spanHashOf(slice) === a.spanHash ? 'relocated' : 'approx';
    return { status, text: slice, charSpan: [found.start, found.end], jump };
  }
  return { status: 'moved', reason: 'text-gone', text: a.text || '', charSpan: null, jump };
};
