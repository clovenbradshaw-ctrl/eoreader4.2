// EO: SEG·SIG·SYN(Network → Field,Network, Dissecting,Tending,Composing) — multi-level surf
// Multi-level surfing (docs/surfing-the-fold.md, §"surf the sources, then their content").
//
// A grounding doc is often a COMPOSITE — many sources folded onto one shared sentence axis
// (organs/in/composite.js). The single-level surf anchors at one retrieval hit and reads a
// local window around it, so it is at the mercy of retrieval: one stray lexical match in an
// off-topic page (a Twitter-engineering page under a US-presidents question) becomes the
// anchor, and the reader elaborates that neighbourhood while the relevant sources go unread.
// That is the source DRIFT the audits show.
//
// The fix is the surfer's two rules, one level up:
//
//   LEVEL 1 — surf the HIGH LEVEL of each source. Score each source's gist against the
//     activated thread (the top-k Born term-salience over its units — a source judged by its
//     most-relevant passages, not diluted by its bulk) and KEEP the sources whose gist beats
//     the noise null the source set throws up by chance (boundedNull — a bounded [0,1]
//     salience). The anchor's own source is always kept; too few sources to tell → keep all.
//
//   LEVEL 2 — surf the CONTENT of the ones that seem relevant. Run the CHORUS surf (surf.js
//     opts.chorus, chorus.js) inside each kept source, bounded to that source, anchored at its
//     most-salient unit. Merge the per-source reads into one surf: the forced ground (the
//     anchor, each source's frame-breaks and peak) plus the most-relevant content across all
//     kept sources, capped, with the peak/focus taken from the most-relevant source.
//
// Everything is a pure read; nothing is appended to the log. Not a composite, or no thread to
// be relevant TO → level 1 is a no-op and this delegates to a single chorus surf, so the seam
// is the same one function for the one-source and many-source cases.

import { surfFold, significancePass } from './surf.js';
import { bornSalience, threadFigures } from './salience.js';
import { boundedNull } from '../core/index.js';

// How much of a kept source to read at level 2: a window of at most this many units either
// side of the source's salient anchor, clamped to the source. Bounds the readingAt cost on a
// large source while still reading a generous neighbourhood of its most-relevant passage.
const MAX_SOURCE_REACH = 40;
const DEFAULT_PER_SOURCE_STOPS = 4;
const DEFAULT_GLOBAL_STOPS = 8;   // buildSurfPath caps its walk at 12; stay comfortably under

// sourceRanges(doc) → the contiguous [lo, hi] ranges the sources occupy on the shared axis,
// each tagged with its docId. A non-composite doc is one source spanning the whole axis.
export const sourceRanges = (doc) => {
  const S = (doc?.units || doc?.sentences || []).length;
  if (S === 0) return [];
  if (!doc.isComposite || typeof doc.origin !== 'function') return [{ docId: doc?.docId ?? null, lo: 0, hi: S - 1 }];
  const ranges = [];
  let cur = null;
  for (let i = 0; i < S; i++) {
    const id = doc.origin(i)?.docId ?? null;
    if (!cur || cur.docId !== id) { cur = { docId: id, lo: i, hi: i }; ranges.push(cur); }
    else cur.hi = i;
  }
  return ranges;
};

const threadTermsOf = (thread) => {
  if (!thread) return null;
  if (thread instanceof Map) return thread;
  return thread.terms || null;
};

// gistOf — the top-k Born term-salience over a source's units. The source's relevance to the
// thread read off its strongest passages, so a long source is not penalised for its bulk.
const gistOf = (doc, terms, range, topK) => {
  const toks = doc.tokensBySentence || [];
  const per = [];
  for (let i = range.lo; i <= range.hi; i++) per.push(bornSalience(terms, toks[i]));
  per.sort((x, y) => y - x);
  const k = Math.min(topK, per.length);
  if (!k) return 0;
  let s = 0; for (let i = 0; i < k; i++) s += per[i];
  return s / k;
};

// keepSources — LEVEL 1. Returns { ranges, kept:Set<docId>, relevance:Map<docId,gist>,
// anchorDoc, abstained }. Keep a source iff its gist beats the boundedNull the source set
// throws up (never a constant floor); the anchor's source is always kept; the null abstaining
// (too few sources, or a bulk too flat to resolve a line) → keep every source.
export const keepSources = (doc, thread, { alpha = 0.05, anchor = 0, topK = 5 } = {}) => {
  const ranges = sourceRanges(doc);
  const terms = threadTermsOf(thread);
  const anchorDoc = ranges.find((r) => anchor >= r.lo && anchor <= r.hi)?.docId ?? (ranges[0]?.docId ?? null);
  if (ranges.length <= 1 || !terms || !terms.size) {
    return { ranges, kept: new Set(ranges.map((r) => r.docId)), relevance: new Map(), anchorDoc, abstained: true };
  }
  const relevance = new Map();
  const scores = [];
  for (const r of ranges) { const g = gistOf(doc, terms, r, topK); relevance.set(r.docId, g); scores.push(g); }
  // boundedNull over ALL source gists — the low-gist sources are the noise bulk the relevant
  // ones must beat. Fallback −Infinity means "cannot resolve a line (too few sources) → keep all".
  const floor = boundedNull(scores, { alpha, ceiling: 1, fallback: -Infinity });
  const abstained = !Number.isFinite(floor);
  const kept = new Set();
  for (const r of ranges) {
    if (r.docId === anchorDoc || abstained || relevance.get(r.docId) > floor) kept.add(r.docId);
  }
  return { ranges, kept, relevance, anchorDoc, abstained };
};

// mostSalientLocal — a source's own anchor for the content surf: the LOCAL index (into the
// standalone source doc) whose Born term-salience to the thread is highest. 0 when nothing lands.
const mostSalientLocal = (sourceDoc, terms) => {
  const toks = sourceDoc.tokensBySentence || [];
  let best = 0, bestS = -1;
  for (let i = 0; i < toks.length; i++) {
    const s = terms ? bornSalience(terms, toks[i]) : 0;
    if (s > bestS) { bestS = s; best = i; }
  }
  return best;
};

// mergeSurfs — fold the per-source content reads back onto the COMPOSITE axis (each read's
// local indices shifted by its source offset) into one surf-shaped object. Forced ground (the
// original anchor, every source's frame-breaks and its own peak) is always kept; the remaining
// stops are the most thread-relevant across ALL kept sources, capped. The peak and focus are
// taken from the most-relevant source's read, so the eye sits in the source the question is
// most about — never a neighbour source's warmth bleeding in (the isolated per-source read is
// what prevents that).
const mergeSurfs = (reads, { doc, anchor, terms, globalStops }) => {
  const toks = doc.tokensBySentence || [];
  const rel = (idx) => (terms ? bornSalience(terms, toks[idx]) : 0);

  const fieldByIdx = new Map();
  const recSet = new Set();
  const recAxes = [];
  const forced = new Set([anchor]);
  const allStops = new Set();
  for (const { sub, offset } of reads) {
    for (const f of (sub.field || [])) { const idx = f.idx + offset; if (!fieldByIdx.has(idx)) fieldByIdx.set(idx, { ...f, idx }); }
    for (const c of (sub.recCursors || [])) { recSet.add(c + offset); forced.add(c + offset); }
    for (const ax of (sub.recAxes || [])) recAxes.push({ ...ax, cursor: ax.cursor + offset });
    if (Number.isInteger(sub.peak)) forced.add(sub.peak + offset);
    for (const s of (sub.stops || [])) allStops.add(s + offset);
  }
  const field = [...fieldByIdx.values()].sort((a, b) => a.idx - b.idx);
  const recCursors = [...recSet].sort((a, b) => a - b);

  // the most-relevant source drives peak + focus.
  const lead = reads.slice().sort((a, b) => (b.relevance - a.relevance) || (a.offset - b.offset))[0];
  const peak = Number.isInteger(lead?.sub?.peak) ? lead.sub.peak + lead.offset : anchor;
  const focus = lead?.sub?.focus ?? null;

  // stops: forced first, then the most thread-relevant remaining stops across all sources.
  const stops = new Set(forced);
  const rest = [...allStops].filter((s) => !stops.has(s)).sort((x, y) => (rel(y) - rel(x)) || (x - y));
  for (const s of rest) { if (stops.size >= globalStops) break; stops.add(s); }
  const stopList = [...stops].sort((a, b) => a - b);

  return { anchor, stops: stopList, peak, focus, field, recCursors, recAxes, rode: 'chorus-multilevel' };
};

// The clean opts a per-source read inherits: the chorus thread (re-resolved per source) plus
// the reach/arrest knobs. Composite-axis significance opts (activations/lens/prior/signs and
// the column flags) are DROPPED — they are indexed on the composite axis and mean nothing to a
// standalone source doc; the per-source read is for stop selection, not the audit column.
const subOpts = (opts, localThread, behind, ahead, maxStops) => ({
  chorus: localThread, behind, ahead, maxStops,
  // pass alpha ONLY when the caller set one — an unset alpha keeps the per-source surf on the
  // median rule (no void-boundary, so no `verdict` stamped onto field entries), and chorusStops
  // defaults its own noise-null alpha to 0.05 regardless. Forcing 0.05 here would flip every
  // per-source surf into boundary mode for no benefit (the chorus, not the incumbent, arrests).
  ...(Number.isFinite(opts.alpha) ? { alpha: opts.alpha } : {}),
  ...(opts.chorusReport ? { chorusReport: true } : {}),
});

// multiLevelSurf(doc, anchor, opts) → the two-level surf. opts is a surfFold opts object with
// opts.chorus carrying the activated thread (threadBasis-shaped). Delegates to a single chorus
// surf when there is nothing to do at level 1 (one source, or no thread), so callers have one
// entry point for both the one-source and many-source cases.
export const multiLevelSurf = (doc, anchor = 0, opts = {}) => {
  const thread = (opts.chorus && typeof opts.chorus === 'object') ? opts.chorus : null;
  const terms = threadTermsOf(thread);
  const ranges = sourceRanges(doc);
  const S = (doc?.units || doc?.sentences || []).length;
  anchor = clamp(anchor, 0, Math.max(0, S - 1));            // as surfFold does — an out-of-range anchor never leaks a stop

  // Level 1 is a no-op: not a composite, or no thread to be relevant to. One chorus surf.
  if (!terms || !terms.size || ranges.length <= 1) return surfFold(doc, anchor, opts);

  // LEVEL 1 — keep the relevant sources.
  const { kept, relevance, anchorDoc } = keepSources(doc, thread, { alpha: opts.alpha ?? 0.05, anchor });
  const keptRanges = ranges.filter((r) => kept.has(r.docId));

  // LEVEL 2 — the chorus content surf inside each kept source, on its ISOLATED standalone doc
  // (doc.origin(lo).doc) so its warmth/figure field is scoped to that source, then shifted back
  // to the composite axis by the source offset.
  const perSourceStops = opts.perSourceStops ?? DEFAULT_PER_SOURCE_STOPS;
  const reads = [];
  for (const r of keptRanges) {
    const sourceDoc = doc.origin(r.lo)?.doc || doc;
    const offset = (doc.origin(r.lo)?.doc) ? r.lo : 0;       // standalone → local, else composite idx
    const localLen = ((sourceDoc.units || sourceDoc.sentences || []).length) - 1;
    const localThread = { terms, figures: threadFigures(terms, sourceDoc) };
    const localAnchor = (r.docId === anchorDoc)
      ? clamp(anchor - offset, 0, localLen)
      : mostSalientLocal(sourceDoc, terms);
    const behind = Math.min(localAnchor, MAX_SOURCE_REACH);
    const ahead  = Math.min(localLen - localAnchor, MAX_SOURCE_REACH);
    const sub = surfFold(sourceDoc, localAnchor, subOpts(opts, localThread, behind, ahead, perSourceStops));
    reads.push({ r, sub, offset, relevance: relevance.get(r.docId) ?? 0 });
  }
  if (!reads.length) return surfFold(doc, anchor, opts);           // nothing kept → single surf
  if (reads.length === 1) {                                        // one relevant source → its read, shifted
    const { sub, offset } = reads[0];
    return withColumn(shift(sub, offset), doc, opts);
  }
  return withColumn(mergeSurfs(reads, { doc, anchor, terms, globalStops: opts.maxStops ?? DEFAULT_GLOBAL_STOPS }), doc, opts);
};

// withColumn — re-attach the significance column (lenses / lensEntropy / atmosphere / paradigm /
// stance) the veto battery reads. The per-source reads run embedder-free (subOpts drops the
// composite-axis activations), so the merged surf carries no column; when the caller supplied
// activations + a column flag, compute the column ONCE over the composite activations at the
// merged peak and spread it on — the same shape surfFold returns, so downstream is unchanged.
const withColumn = (surf, doc, opts) => {
  const activations = Array.isArray(opts.activations) ? opts.activations : null;
  const wantSig = activations && (opts.atmosphere || opts.lensReport || opts.lens || opts.paradigm || opts.stance);
  if (!wantSig) return surf;
  return { ...surf, ...significancePass(activations, opts, { field: surf.field, peak: surf.peak }) };
};

// shift a single-source read's local indices onto the composite axis (the one-kept-source case).
const shift = (sub, offset) => ({
  anchor: sub.anchor + offset,
  stops: (sub.stops || []).map((s) => s + offset),
  peak: Number.isInteger(sub.peak) ? sub.peak + offset : sub.peak,
  focus: sub.focus,
  field: (sub.field || []).map((f) => ({ ...f, idx: f.idx + offset })),
  recCursors: (sub.recCursors || []).map((c) => c + offset),
  recAxes: (sub.recAxes || []).map((ax) => ({ ...ax, cursor: ax.cursor + offset })),
  rode: 'chorus-multilevel',
});

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x | 0));
