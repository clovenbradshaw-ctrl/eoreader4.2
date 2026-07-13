// EO: SIG·EVA·SYN(Field → Field,Lens, Tending,Binding,Composing) — the surf chorus — chorusStops
// The chorus of surf rides (docs/surfing-the-fold.md, §"a chorus, not a pilot").
//
// surfFold rides ONE signal — the document's own Bayesian surprise — and arrests where the
// reading was rewritten. That is the document talking to itself; it is blind to whether the
// passage is what THIS conversation is about. A single ride is a single blind spot: a ranked
// list the question wants sits at LOW surprise (a list is unsurprising once its first row is
// read), so the surprise ride steps right over it and arrests on whatever the document found
// most self-surprising instead — the "not discourse-aware" failure.
//
// The fix is a CHORUS: several rides, each measuring the reach a different way, none of them
// the pilot. The rides are grouped into FAMILIES so agreement across genuinely-independent
// ways of looking (significance vs. novelty vs. relevance) counts, but two channels of one
// family (a figure hit and a link hit are both "referential") cannot manufacture their own
// consensus — the collusion guard the cooperative chorus (lineup/) gets from its room monitor,
// ported to spans as family-distinct counting.
//
// Every ride's score is a Born weight or a squashed divergence — soft, in [0,1], never a hard
// hit. Each nominates the cursors that beat ITS OWN noise null (the field's non-aligned bulk,
// deriveNull / boundedNull — abstaining, never a constant floor, when the reach is too thin to
// tell signal from chance). We then merge born-SOFT: a cursor's relevance is the SUM of the
// best margin each distinct family gave it, so corroboration raises a cursor continuously
// rather than by a discrete vote, and the kept set is the one the measured null over that
// combined relevance admits — plus the structural ground (the anchor, the frame-breaks) and
// the witnessed ground (a span that literally spells a queried term). When nothing clears and
// no ride's null ever resolved, the chorus abstains (returns null) and surfFold runs its
// incumbent median-rule arrest verbatim — so the chorus never returns fewer stops than today.

import { deriveNull, boundedNull } from '../core/index.js';
import { bornSalience, figureSalience, linkSalience, linksBySentence } from './salience.js';

// The family of each ride. Consensus counts DISTINCT FAMILIES, never raw ride ids: 'figure'
// and 'link' are both referential (the same thread figures drive both), so they are one voice;
// 'semantic' and 'lens' are both meaning. This is the independence assumption (lineup/signal.js)
// transferred to spans — the only faithful port, since the room monitor does not come along.
export const FAMILY = Object.freeze({
  bayes:   'significance',   // the document's own belief-shift (D_KL)
  surprise:'novelty',        // the −log₂p oddness, already carried in the field, never scored
  lexical: 'lexical',        // the thread's words (Born term overlap)
  figure:  'referential',    // the thread's figures (coref-resolved)
  link:    'referential',    // a relation between the thread's figures
  bridge:  'connectivity',   // a connective reveal (opt-in — a second readingAt)
  semantic:'meaning',        // embedding cosine to the query (opt-in — needs a warm embedder)
  lens:    'meaning',        // Born overlap with a chosen eigen-lens (opt-in — needs activations)
});

// threadOf(opts) → the activated-thread basis carried on opts.chorus, or null. Accepts a
// threadBasis object ({ terms, figures }) or a bare term Map (terms only). `true`/anything
// without terms means "chorus on, but no thread" — the significance/novelty rides still run.
const threadOf = (opts) => {
  const c = opts && opts.chorus;
  if (!c || c === true) return null;
  if (c instanceof Map) return { terms: c, figures: null };
  if (typeof c === 'object') return { terms: c.terms || null, figures: c.figures || null };
  return null;
};

// buildRoster(ctx, opts) → the rides in the water this turn. bayes + surprise always (embedder-
// free, read straight off the field/readings surfFold already computed); the three relevance
// rides only when a thread is activated; bridge/semantic/lens only when their opt-in inputs are
// present. Each ride is { id, family, bounded, at(idx) } — `bounded` picks the null (a bounded
// [0,1] salience draws boundedNull, an unbounded divergence draws deriveNull).
const buildRoster = (ctx, opts) => {
  const { readings = [], field = [], doc } = ctx;
  const rides = [];
  // significance — the incumbent ride, kept as one voice of the chorus.
  rides.push({ id: 'bayes', family: FAMILY.bayes, bounded: false,
               at: (idx) => readings[idx]?.bayes ?? 0 });
  // novelty — the surprisal already in the field trace, promoted to a scored ride.
  const surp = new Map(field.map((f) => [f.idx, 1 - Math.pow(2, -(f.surprisalBits || 0))]));
  rides.push({ id: 'surprise', family: FAMILY.surprise, bounded: false,
               at: (idx) => surp.get(idx) ?? 0 });

  const thread = threadOf(opts);
  const terms = thread && thread.terms;
  const figs  = thread && thread.figures;
  if (terms && terms.size) {
    rides.push({ id: 'lexical', family: FAMILY.lexical, bounded: true,
                 at: (idx) => bornSalience(terms, doc?.tokensBySentence?.[idx]) });
  }
  if (figs && figs.size) {
    rides.push({ id: 'figure', family: FAMILY.figure, bounded: true,
                 at: (idx) => figureSalience(figs, readings[idx]?.predicted?.figures || []) });
    const links = linksBySentence(doc);
    rides.push({ id: 'link', family: FAMILY.link, bounded: true,
                 at: (idx) => { const ls = links.get(idx) || []; return ls.length ? Math.max(0, ...ls.map((l) => linkSalience(figs, l))) : 0; } });
  }
  // LENS ride (opt-in): the Born overlap with a chosen eigen-lens — needs activations + a lens.
  if (opts.lens && Array.isArray(opts.activations)) {
    rides.push({ id: 'lens', family: FAMILY.lens, bounded: true,
                 at: (idx) => bornOverlap(opts.lens, opts.activations[idx]) });
  }
  return rides;
};

// |⟨L|v⟩|² — the Born overlap of an activation with a chosen lens (mirrors surf.js's bornWeight
// so the lens ride reads the same quantity the incumbent lens-conditioning does).
const bornOverlap = (lens, v) => {
  if (!Array.isArray(lens) || !Array.isArray(v)) return 0;
  let dot = 0, nl = 0, nv = 0;
  const n = Math.min(lens.length, v.length);
  for (let i = 0; i < n; i++) { dot += lens[i] * v[i]; nl += lens[i] * lens[i]; nv += v[i] * v[i]; }
  const d = Math.sqrt(nl) * Math.sqrt(nv);
  if (d <= 1e-12) return 0;
  const o = dot / d;
  return o * o;
};

// literalHits(ctx, opts) → the cursors that WITNESS the thread: a span whose tokens include a
// full-weight thread term (the prompt's own words, weighted 1 in threadBasis). A row that
// literally spells the queried word cannot be a phantom, so it is ground — kept regardless of
// how quiet its surprise is. Embedder-free; empty when no thread or no token axis.
const literalHits = (ctx, opts) => {
  const out = new Set();
  const thread = threadOf(opts);
  const terms = thread && thread.terms;
  const toks = ctx.doc?.tokensBySentence;
  if (!terms || !terms.size || !toks) return out;
  const strong = new Set([...terms.entries()].filter(([, w]) => w >= 1).map(([t]) => t));
  if (!strong.size) return out;
  for (const f of ctx.field) {
    const s = toks[f.idx];
    if (!s) continue;
    for (const t of s) { if (strong.has(t)) { out.add(f.idx); break; } }
  }
  return out;
};

// chorusStops(ctx, opts) → the merged stop list, or null to defer to surfFold's incumbent
// arrest. ctx = { field, readings, a, recCursors, maxStops, doc, alpha }.
//
//   STAGE 1 — each ride nominates the cursors that beat its OWN reach null and records the
//             margin (score − null). A bounded salience ride draws boundedNull (ceiling 1);
//             an unbounded divergence ride draws deriveNull (linear). A null that abstains
//             (Infinity, on a thin/contaminated bulk) means that ride casts no vote — never a
//             constant floor. `anyFinite` remembers whether ANY ride's null ever resolved.
//   STAGE 2 — born-soft merge: a cursor's relevance is the SUM over DISTINCT FAMILIES of the
//             best margin that family gave it (family-max within a family = the collusion
//             guard). Keep a cursor when it is ground (the forced anchor/REC set, or a literal
//             thread witness) OR its combined relevance beats the measured null over the
//             combined series (when that null resolves; when it abstains, a nomination by any
//             ride is enough). Rank the kept by combined relevance, fill toward maxStops.
export const chorusStops = (ctx, opts = {}) => {
  const { field = [], a = 0, recCursors = [], maxStops = 5, alpha = 0.05 } = ctx;
  if (!field.length) return null;
  const idxs = field.map((f) => f.idx);
  const rides = buildRoster(ctx, opts);

  // STAGE 1 — per-ride nomination against the ride's own noise null.
  const familyMargin = new Map();   // idx → Map(family → best margin)
  let anyFinite = false;
  for (const ride of rides) {
    const series = idxs.map(ride.at);
    // the null is derived over the WHOLE reach — the zeros (cursors with no salience) ARE the
    // non-aligned bulk the Born-rule void boundary is defined against (salience.js). Filtering
    // them out would compare salient-against-salient and over-tighten the bar.
    const floor = ride.bounded
      ? boundedNull(series, { alpha, ceiling: 1, fallback: Infinity })
      : deriveNull(series, { scale: 'linear', alpha });
    if (!Number.isFinite(floor)) continue;   // this ride abstains — no vote
    anyFinite = true;
    for (let i = 0; i < idxs.length; i++) {
      const score = series[i];
      if (!(score > floor)) continue;
      const idx = idxs[i];
      let fm = familyMargin.get(idx);
      if (!fm) { fm = new Map(); familyMargin.set(idx, fm); }
      const prev = fm.get(ride.family) ?? 0;
      if (score - floor > prev) fm.set(ride.family, score - floor);   // family-max
    }
  }

  // STAGE 2 — born-soft combined relevance, then the measured cut.
  const forced = new Set([a, ...recCursors]);
  const literal = literalHits(ctx, opts);
  const combined = new Map();
  for (const [idx, fm] of familyMargin) {
    let sum = 0; for (const m of fm.values()) sum += m;   // sum across DISTINCT families
    combined.set(idx, sum);
  }
  const combinedFloor = deriveNull([...combined.values()], { scale: 'linear', alpha });
  const passLoud = (c) => (Number.isFinite(combinedFloor) ? c > combinedFloor : true);

  const candidates = [];
  const seen = new Set();
  for (const [idx, c] of combined) {
    if (forced.has(idx)) continue;
    if (literal.has(idx) || passLoud(c)) { candidates.push({ idx, c }); seen.add(idx); }
  }
  // a literal witness that no ride scored is still ground — include it at zero relevance.
  for (const idx of literal) if (!forced.has(idx) && !seen.has(idx)) candidates.push({ idx, c: 0 });

  // SAFETY-NET — nothing beyond the forced set AND no ride's null ever resolved: defer to the
  // incumbent median rule so a thin reach is never left with fewer stops than today.
  if (!candidates.length && !anyFinite) return null;

  // RANK / FILL — the forced set is seeded first; the rest fill by descending relevance, ties
  // broken by lower index for a total order (mirrors surf.js's peak fill).
  const stops = new Set(forced);
  candidates.sort((x, y) => (y.c - x.c) || (x.idx - y.idx));
  for (const { idx } of candidates) { if (stops.size >= maxStops) break; stops.add(idx); }
  const stopList = [...stops].sort((x, y) => x - y);

  const out = { stopList };
  if (opts.chorusReport) {
    out.report = {
      rides: rides.map((r) => ({ id: r.id, family: r.family })),
      combinedFloor: Number.isFinite(combinedFloor) ? round(combinedFloor) : null,
      byCursor: [...combined.entries()].map(([idx, c]) => ({ idx, relevance: round(c), families: [...(familyMargin.get(idx)?.keys() || [])], literal: literal.has(idx) })),
    };
  }
  return out;
};

const round = (x) => (Number.isFinite(x) ? Math.round(x * 1e4) / 1e4 : x);
