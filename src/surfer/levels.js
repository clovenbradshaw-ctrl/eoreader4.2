// EO: SEG·SYN·EVA(Field,Network → Network,Field, Unraveling,Composing,Tracing) — multi-grain coarse spine
// Multi-grain encoding — the accumulation layer (the spec's "reading that accumulates").
//
// The total read (perceiver/parse) produces a graph at SENTENCE grain: a graded edge per
// apprehended proposition. That grain is right for "who is X's sister" — one hop, one
// span — and wrong for "trace Pierre's spiritual development across the novel": no amount
// of local surfing from one anchor spans a whole book, and surfing all 30k sentences at
// full resolution is the cube's hot path (O(dim³) per cursor) paid for nothing.
//
// So we FOLD the sentence read into coarser units — the document's own structural grain
// (chapters, books) when it carries one, else fixed windows sized to the document. Each
// coarse unit is itself a reading: the figures it turns on, the high-confidence backbone
// it bonds, the inter-proposition links it carries, and — the cube's Site face — its
// split between the CAST channel (Existence ∪ Structure: who exists, how they bond) and
// the MEANING channel (Interpretation: what it asserts, evaluates, reframes).
//
// Why two channels and not three. The cube has three domains, but on a real corpus
// (measured on War and Peace) the cross-domain Frobenius mass is 97% the trivial
// Existence↔Structure coupling — every sentence introduces a figure AND bonds it — while
// Interpretation decouples from the cast at 0.5%. So the block structure the corpus
// supports is two: cast {E∪S} kept coupled, meaning {I} split off clean. A thematic
// (Paradigm) question routes to the meaning channel and never pays for the Link density;
// a mechanical question routes to the cast channel and keeps the E↔S coupling it needs.

import { projectGraph } from '../core/index.js';

// The Site-face domain of each operator (core/operators.js): Existence ∪ Structure is the
// CAST (the figures and their bonds); Interpretation is the MEANING (assert / evaluate /
// learn-rule). The split the coupling control validated.
export const CAST_OPS    = Object.freeze(new Set(['NUL', 'SIG', 'INS', 'SEG', 'CON', 'SYN']));
export const MEANING_OPS = Object.freeze(new Set(['DEF', 'EVA', 'REC']));

// A coarse unit's head proposition is part of its backbone only when the reader
// apprehended it surely (§4). The backbone is the high-confidence spine the surf rides;
// the tentative reads still exist on the sentence graph, they just don't define the unit.
const BACKBONE_CONFIDENCE = 0.85;

// Opener-weld filter (a presentation-layer skip for the upstream admission bug). The entity
// scanner welds a capitalised clause-opener onto a following name ("Having Pierre", "Next
// day", "Firmly", a heading "CHAPTER XIII"), admitting it as a pseudo-figure. Until that is
// fixed in admission, the cast and the cited backbone skip any figure whose label LEADS with a
// known opener or is an all-caps heading token — so the reading a question surfaces shows real
// figures, not welds. Names that legitimately lead with one of these are vanishingly rare.
const OPENER_WELD = new Set([
  'having', 'seeing', 'next', 'toward', 'towards', 'without', 'firmly', 'though', 'although',
  'evidently', 'similarly', 'whence', 'call', 'place', 'near', 'above', 'below', 'being',
  'suddenly', 'meanwhile', 'soyez', 'chapter', 'book', 'epilogue', 'whose', 'while', 'when',
]);
const isWelded = (label) => {
  const first = String(label || '').trim().split(/\s+/)[0] || '';
  return OPENER_WELD.has(first.toLowerCase()) || /^[A-Z]{2,}$/.test(first);
};

// A structural heading — a short line that opens a division the author already cut
// (CHAPTER / BOOK / PART / EPILOGUE / a bare roman or arabic numeral). The grain the
// document hands us, read off its shape, not imposed. Kept high-precision (short line,
// heading-initial) so a sentence that merely mentions "chapter" is never a boundary.
const HEADING_RE = /^\s*(chapter|book|part|canto|act|scene|volume|epilogue)\b|^\s*[IVXLC]{1,6}\.?\s*$|^\s*\d{1,3}\.?\s*$/i;

// Adaptive grain (§: "adaptive by doc size"). A short document reads at sentence grain;
// a long one with structural headings folds to those; a long one without folds to windows
// sized so the coarse spine stays a few hundred units however long the document is — the
// surf cost is bounded by the spine, not by the document.
export const detectGrain = (doc, { grain = 'auto', targetUnits } = {}) => {
  const sents = doc?.units || doc?.sentences || [];
  const n = sents.length;
  if (n === 0) return { mode: 'empty', bounds: [] };
  const sentenceBounds = () => Array.from({ length: n }, (_, i) => i);

  if (grain === 'sentence') return { mode: 'sentence', bounds: sentenceBounds() };

  // Structural headings, if the document carries enough of them.
  const heads = [];
  for (let i = 0; i < n; i++) {
    const s = sents[i] || '';
    if (s.length <= 64 && HEADING_RE.test(s)) heads.push(i);
  }
  if ((grain === 'structural' || grain === 'auto') && heads.length >= 4) {
    if (heads[0] !== 0) heads.unshift(0);     // keep any pre-heading material as unit 0
    return { mode: 'structural', bounds: heads };
  }
  if (grain === 'structural') return { mode: 'sentence', bounds: sentenceBounds() };

  // Short document → sentence grain (nothing to coarsen).
  if (grain === 'auto' && n <= 40) return { mode: 'sentence', bounds: sentenceBounds() };

  // Window fallback: aim for ~2·√n coarse units (clamped), so the spine grows slowly with
  // the document — 28 units at 200 sentences, ~350 at 30k.
  const target = Math.max(8, Math.min(500, targetUnits ?? Math.round(2 * Math.sqrt(n))));
  const win = Math.max(1, Math.ceil(n / target));
  const bounds = [];
  for (let i = 0; i < n; i += win) bounds.push(i);
  return { mode: 'window', bounds };
};

// Which segment a sentence index falls in — upper-bound over the sorted bounds.
const segmentIndex = (bounds, i) => {
  let lo = 0, hi = bounds.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (bounds[m] <= i) lo = m + 1; else hi = m; }
  return lo - 1;
};

// encodeLevels — fold the sentence read into the coarse spine. One pass over the log
// buckets every event into its segment; each segment then carries its own reading.
export const encodeLevels = (doc, opts = {}) => {
  const sents = doc?.units || doc?.sentences || [];
  const { mode, bounds } = detectGrain(doc, opts);
  const events = doc?.log?.snapshot ? doc.log.snapshot() : (Array.isArray(doc?.log) ? doc.log : []);
  const graph = projectGraph(doc.log);
  const rep = graph.representative || ((x) => x);
  const labelOf = (id) => doc.admission?.labelOf?.(id) || graph.entities.get(rep(id))?.label || id;

  const segs = bounds.map((lo, k) => ({
    idx: k, lo, hi: (k + 1 < bounds.length ? bounds[k + 1] : sents.length),
    title: (sents[lo] || '').slice(0, 56).replace(/\s+/g, ' ').trim(),
    figureCount: new Map(),                 // rep(id) → sightings in this unit
    bonds: new Map(),                        // src|via|tgt → strongest edge (backbone)
    links: [],                               // inter-proposition edges in this unit
    cast: 0, meaning: 0,                     // the two-channel operator profile
    conObj: 0, npObj: 0,                      // concrete-register proxy: share of bonds whose object is an NP referent
    text: '',
  }));
  if (!segs.length) return { mode, grain: mode, segments: [], sentenceCount: sents.length, labelOf };

  for (const e of events) {
    if (e.sentIdx == null) continue;
    const si = segmentIndex(bounds, e.sentIdx);
    if (si < 0 || si >= segs.length) continue;
    const seg = segs[si];
    if (CAST_OPS.has(e.op)) seg.cast++;
    else if (MEANING_OPS.has(e.op)) seg.meaning++;
    if (e.op === 'INS') {
      const id = rep(e.id);
      seg.figureCount.set(id, (seg.figureCount.get(id) || 0) + 1);
    } else if (e.op === 'CON' || e.op === 'SIG') {
      if (e.linkKind === 'inter-proposition') { seg.links.push(e); continue; }
      if (e.op === 'CON') { seg.conObj++; if (e.tgtKind === 'np') seg.npObj++; }  // concrete-register proxy
      if ((e.confidence ?? 0) < BACKBONE_CONFIDENCE) continue;   // backbone is the sure spine
      const key = `${rep(e.src)}|${e.via}|${rep(e.tgt)}`;
      const prev = seg.bonds.get(key);
      if (!prev || (e.confidence ?? 0) > (prev.confidence ?? 0)) seg.bonds.set(key, e);
    }
  }

  // Finalize each segment: rank figures, materialize the backbone, carry the text for
  // keyword routing, and the meaning-density (the share of the unit that is Interpretation).
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const segments = segs.map((seg) => {
    const figures = [...seg.figureCount.entries()]
      .map(([id, n]) => ({ id, label: labelOf(id), n }))
      .filter((f) => !isWelded(f.label))                       // skip opener-weld pseudo-figures
      .sort((a, b) => b.n - a.n).slice(0, 8);
    const bonds = [...seg.bonds.values()]
      .map((e) => ({ src: rep(e.src), via: e.via, tgt: rep(e.tgt),
                     srcLabel: labelOf(rep(e.src)), tgtLabel: labelOf(rep(e.tgt)),
                     confidence: e.confidence, polarity: e.polarity, idx: e.sentIdx }))
      .filter((b) => !isWelded(b.srcLabel) && !isWelded(b.tgtLabel))   // cite real figures, not welds
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
    const tot = seg.cast + seg.meaning;
    return Object.freeze({
      idx: seg.idx, lo: seg.lo, hi: seg.hi, title: seg.title,
      sentences: seg.hi - seg.lo,
      figures, bonds, links: seg.links,
      domain: Object.freeze({ cast: seg.cast, meaning: seg.meaning,
                              meaningDensity: tot ? Math.round(1000 * seg.meaning / tot) / 1000 : 0 }),
      // concrete-register proxy (§ defamiliarization): the share of this unit's bonds whose
      // object is an NP referent, a physical thing, not a named figure acting.
      npShare: seg.conObj ? Math.round(1000 * seg.npObj / seg.conObj) / 1000 : 0,
      text: norm(sents.slice(seg.lo, seg.hi).join(' ')),
    });
  });
  return { mode, grain: mode, segments, sentenceCount: sents.length, labelOf, rep };
};

// ── the domain router (the Site face) ───────────────────────────────────────
// A question lives in a domain. "Who married Natásha" is CAST — Existence/Structure, the
// figures and their bonds. "Is his conversion genuine progress or illusion" is MEANING —
// Interpretation/Paradigm, what the reading asserts and evaluates. The router reads the
// question's own vocabulary: a meaning-marker (theory, meaning, symbolize, genuine,
// betrayal, why…) routes to the meaning channel, a cast-marker (who, where, married,
// killed…) to the cast channel; absent either, it surfs both. This is the address the
// coarse surf routes on — surf the channel that holds the answer, not the whole cube.
const MEANING_MARKERS = new Set([
  'theory', 'meaning', 'theme', 'thematic', 'symbol', 'symbolize', 'symbolise', 'represent',
  'represents', 'significance', 'signify', 'signifies', 'ideal', 'critique', 'critiques',
  'philosophy', 'philosophical', 'moral', 'genuine', 'illusion', 'betrayal', 'endorse',
  'endorsing', 'romanticization', 'romanticize', 'convention', 'conventions', 'defamiliarization',
  'paradigm', 'interpret', 'interpretation', 'why', 'enrich', 'awkwardly', 'grafted', 'treatise',
  'fulfillment', 'fulfilment', 'provocation', 'worldview', 'wisdom', 'spiritual', 'conversions',
  'trajectory', 'trajectories', 'progress', 'inevitability', 'contingency', 'deterministic',
]);
const CAST_MARKERS = new Set([
  'who', 'whom', 'where', 'married', 'marries', 'killed', 'kills', 'met', 'meets', 'son',
  'daughter', 'father', 'mother', 'sister', 'brother', 'wife', 'husband', 'many', 'count',
]);
const STOP = new Set(('the a an of to and in on at is are was were be been being how does do did ' +
  'what which that this his her their its as for with by from into over under it he she they we ' +
  'you i not these those between among about or but so than then through during against').split(' '));
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const keyTokens = (q) => [...new Set(norm(q).replace(/[^a-z\s]/g, ' ').split(/\s+/)
  .filter((w) => w.length > 3 && !STOP.has(w)))];

export const routeDomain = (question) => {
  const qs = new Set(norm(question).replace(/[^a-z\s]/g, ' ').split(/\s+/));
  let m = 0, c = 0;
  for (const w of qs) { if (MEANING_MARKERS.has(w)) m++; if (CAST_MARKERS.has(w)) c++; }
  if (m > c) return 'meaning';
  if (c > m) return 'cast';
  return 'both';
};

// coarseSurf — the surf at the right grain. Score every coarse unit for the question by
// the figures it names (weighted by prominence) and the keywords it carries, nudged by the
// channel the question routes to (a meaning question prefers Interpretation-dense units),
// and return the top regions with their readings — the material a synthesis folds. The
// surf rides the coarse spine (a few hundred units), never the 30k sentences, so a
// whole-book question reaches every region it lives in at a fraction of the cost.
//
// `evaluation` (an attributedEvaluation result) wires the MODELER into region selection: for a
// MEANING-routed question, a unit where the narrator's evaluative operation fires (the opera's
// defamiliarization, the historians' framing) is boosted — but ONLY when the unit already has
// keyword/figure relevance, so the globally-most-evaluative chapters are not dragged into every
// meaning question. This is the fix for the Q5 miss: the opera is the #1 evaluative unit AND
// carries the keyword "opera", so the boost lifts it to the top instead of leaving it unranked.
export const coarseSurf = (encoding, question, { top = 4, domain, evaluation = null } = {}) => {
  const segs = encoding?.segments || [];
  const route = domain || routeDomain(question);
  const keys = keyTokens(question);
  const keySet = new Set(keys);
  const evByIdx = new Map((evaluation?.segments || []).map((s) => [s.idx, s]));

  const scored = segs.map((seg) => {
    let kw = 0;
    for (const k of keys) if (seg.text.includes(k)) kw += 1;
    // a figure the question names, weighted by how prominent it is in this unit
    let fig = 0;
    for (const f of seg.figures) {
      const fl = norm(f.label);
      if ([...keySet].some((k) => fl.split(/[\s-]+/).includes(k))) fig += 0.6 * Math.log2(1 + f.n);
    }
    // domain nudge: a meaning question prefers Interpretation-dense units, a cast question
    // the figure-dense ones — small, so relevance still leads.
    const dom = route === 'meaning' ? seg.domain.meaningDensity
              : route === 'cast' ? (1 - seg.domain.meaningDensity) : 0;
    const relevance = kw + fig;
    // the modeler boost — gated on relevance>0, so it re-ranks RELEVANT units toward the ones
    // where the narrator is judging, never surfaces an evaluative-but-irrelevant chapter.
    const evScore = evByIdx.get(seg.idx)?.score ?? 0;
    const evalBoost = (route === 'meaning' && relevance > 0 && evScore > 0) ? 0.6 * evScore : 0;
    const score = relevance + 1.5 * dom + evalBoost;
    return { seg, score, kw, fig };
  }).filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, top);

  return {
    question, domain: route, keys,
    regions: scored.map(({ seg, score }) => ({
      title: seg.title, lo: seg.lo, hi: seg.hi, score: Math.round(score * 100) / 100,
      meaningDensity: seg.domain.meaningDensity,
      figures: seg.figures.slice(0, 6),
      bonds: seg.bonds.slice(0, 4),
      links: seg.links.length,
    })),
  };
};
