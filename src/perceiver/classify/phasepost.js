// EO: EVA·SIG(Field,Lens,Kind,Link → Lens, Binding,Tracing) — geometric phasepost classifier
// The centroid measurement classifier — the geometric reader.
//
// Classification is measurement, not choice. A cell is an address, read off a
// proposition's position in centroid space, never a token a reader emits. The
// control-flow router may be a reader emitting a route (a wrong route is cheap;
// no false fact enters the graph). The classifier may not: a wrong cell ships a
// typed edge the talker speaks and the fold cannot un-say. So the cell is not
// chosen — it is measured.
//
//   1. Embed the proposition (at the grain the centroids were built in).
//   2. Score the vector against the 27 centroids, partitioned into three bands.
//   3. Per band, argmax. Margin = own similarity − nearest competitor's.
//   4. Per band, commit if the margin clears a floor; else no-commit.
//   5. Demote DESERT / proven-empty cells — an argmax there is a misfire.
//   6. Confidence = margin × cell provenance.
//
// `embedder` is injected, never imported — the same discipline as the other
// pure modules. The classifier measures meaning ONLY in the space the centroids
// were built in. Under the hash embedder the query vector lives in spelling
// space; the cosine between a spelling-space vector and a MiniLM-space centroid
// measures nothing, so the classifier short-circuits to all-positions-no-commit.
// A verb classified by spelling is the hardcoded list with extra steps — the
// thing this design exists to avoid. No-commit is the honest output until
// MiniLM is the embedder and verified centroids are loaded.

import { BANDS, partitionCells, isMisfireCell } from './bands.js';
import { boundedNull } from '../../core/index.js';

// Provenance is a second multiplier on confidence: how well a cell's centroid
// is actually attested. Margin is the per-proposition continuous signal;
// provenance grades the instrument that produced the centroid.
const PROVENANCE_WEIGHT = Object.freeze({
  attested: 1.0,
  attested_partial: 0.7,
  extrapolated: 0.4,
  empty: 0,
});

// No-commit floor per band. A band thin on attested centroid mass should hold
// more readily — an argmax among under-attested cells is a choice, not a
// measurement, so its floor is higher (§10). Tunable, not a verdict.
export const DEFAULT_FLOORS = Object.freeze({
  Ground: 0.07,   // NUL/INS — 6 cells, one empty; lean toward holding
  Figure: 0.05,   // SEG/DEF/SIG/EVA — 12 cells, the widest band
  Pattern: 0.05,  // CON/SYN/REC — CON and SYN carry attested mass
});

// Cell adjacency floor — the cosine two cell CENTROIDS must clear to count as
// "the same or adjacent" relation (the edge-grounding correspondence, §4). It is
// read off the centroid geometry, never declared by hand; a too-loose floor
// passes "owns" against "holds", a too-tight one strips "lives in" against
// "located-in".
//
// This is no longer the boundary — it is the FALLBACK. The boundary is derived
// (createCellAdjacency below): the Born rule on the centroid set itself. The
// constant survives only for the cold start, when too few centroids exist to
// measure a chance-pairing distribution at all (the same discipline equivalence
// and answerable already run — abstain toward the constant until the void is
// measurable).
export const ADJACENCY_FLOOR = 0.6;

// The tolerated probability of mistaking a chance pairing of two centroids for a
// real adjacency. A policy, not a cosine — the physics computes the line that
// delivers it (core/voidnull.boundedNull). This is now the one knob the original
// ADJACENCY_FLOOR comment asked for ("tune it against the worked-example
// goldens"): the floor value stops being the dial, alpha becomes it.
export const ADJACENCY_ALPHA = 0.05;

const cosine = (a, b) => {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
};

// Pick the fold-verb tier from the perception's significance, not raw margin
// alone (§3): confidence (margin × provenance) selects low/mid/high, which
// indexes both the cell's fold_verb and the confidence tag.
const tierOf = (confidence) =>
  confidence >= 0.18 ? 'high' : confidence >= 0.09 ? 'mid' : 'low';

const CONFIDENCE_TAGS = Object.freeze({ low: 'minor', mid: 'turning point', high: 'central' });

const noCommit = (reason) => Object.freeze({ cell: null, reason });

// Score one band: cosine against every cell that has a centroid vector, take the
// argmax, demote misfires, measure the margin to the nearest real competitor.
const measureBand = (qVec, bandCells, vectors, floor) => {
  const scored = [];
  for (const cell of bandCells) {
    const vec = vectors[cell.key];
    if (!vec) continue;                 // no centroid for this cell → not measurable
    scored.push({ cell, sim: cosine(qVec, vec) });
  }
  if (!scored.length) return noCommit('no-centroids');
  scored.sort((a, b) => b.sim - a.sim);

  // Demote DESERT / proven-empty argmaxes: an argmax there is a misfire, so
  // drop them from the front and let the next real cell stand as the reading.
  let i = 0;
  while (i < scored.length && isMisfireCell(scored[i].cell)) i++;
  if (i >= scored.length) return noCommit('desert');   // nothing real left to read

  const won = scored[i];
  const next = scored.find((s, j) => j > i && !isMisfireCell(s.cell));
  const margin = won.sim - (next ? next.sim : 0);
  if (!(won.sim > 0) || margin < floor) return noCommit('below-floor');

  const provenance = won.cell.provenance || 'attested_partial';
  const confidence = margin * (PROVENANCE_WEIGHT[provenance] ?? 0.5);
  const tier = tierOf(confidence);
  return Object.freeze({
    cell: won.cell.key,
    op: won.cell.op,
    site: won.cell.site,
    stance: won.cell.stance,
    note_rel: won.cell.note_rel || null,
    fold_verb: won.cell.fold_verb ? won.cell.fold_verb[tier] : null,
    arrow_shape: won.cell.arrow_shape || null,
    similarity: round(won.sim),
    margin: round(margin),
    provenance,
    confidence: round(confidence),
    tier,
    tag: CONFIDENCE_TAGS[tier],
  });
};

const round = (x) => Math.round(x * 1000) / 1000;

// The cell-adjacency instrument. Relation correspondence is geometric, not
// string (§4): "lives in" and "located-in" must read as near, "lives in" and
// "owns" as far — and that nearness lives between the two cells' CENTROIDS, not
// their labels. So adjacency is the cosine between two cell centroid vectors,
// thresholded by the boundary the centroid set's OWN noise derives — the Born
// rule applied to the comparison of two cells (core/voidnull). Same key is
// trivially adjacent. A cell with no centroid, or the hash organ (no in-space
// vectors at all), cannot be measured — adjacent() returns null and the caller
// HOLDS, never guessing off spelling. This is the same firewall the classifier
// runs, applied to the comparison of two cells rather than the typing of one.
export const createCellAdjacency = (vectors, { alpha = ADJACENCY_ALPHA } = {}) => {
  const has = !!(vectors && Object.keys(vectors).length);
  const rawCos = (a, b) => {
    const va = vectors?.[a], vb = vectors?.[b];
    if (!va || !vb) return null;
    return cosine(va, vb);
  };

  // The noise background: every pairwise cosine among the centroids — the field's
  // own samples of what a chance pairing of two cells looks like. A real adjacency
  // must beat the Born line derived from THIS distribution (leave-one-out the pair
  // under test), not a number anyone picked. Built once; a reader's centroid set
  // is fixed.
  const keys = has ? Object.keys(vectors) : [];
  const background = [];
  for (let i = 0; i < keys.length; i++)
    for (let j = i + 1; j < keys.length; j++) {
      const c = rawCos(keys[i], keys[j]);
      if (Number.isFinite(c)) background.push(c);
    }

  // The boundary for a specific pair: the bounded-signal Born line over the chance
  // pairings (leave-one-out this pair). boundedNull falls back to the constant on
  // its own when the centroid set is too thin to measure a line below cosine 1
  // (cold start, a handful of cells) — the same cold-start discipline as every
  // other reader, here read off the geometry rather than off a number anyone set.
  const lineFor = (a, b) =>
    alpha == null ? ADJACENCY_FLOOR
      : boundedNull(background, { alpha, leaveOut: rawCos(a, b), fallback: ADJACENCY_FLOOR });

  return Object.freeze({
    measurable: () => has,
    cosine: (a, b) => { const c = rawCos(a, b); return c == null ? null : round(c); },
    // The boundary is derived by default (core/voidnull); an explicit numeric
    // `floor` still overrides it, for a caller that wants a fixed cut.
    adjacent: (a, b, floor) => {
      if (a && b && a === b) return true;       // a cell corresponds to itself
      const c = rawCos(a, b);
      if (c == null) return null;               // null → cannot measure → hold
      return c >= (floor != null ? floor : lineFor(a, b));
    },
  });
};

// Build the geometric reader from a cells registry, a centroid bundle, and an
// injected embedder. `centroids` is { meta:{ model, construction, dim }, vectors:{ key: number[] } }
// or null. The reader is live only when the embedder measures meaning AND a
// verified centroid bundle is present whose construction grain matches the query.
export const createPhasepostClassifier = ({ cells, centroids, embedder, floors = DEFAULT_FLOORS } = {}) => {
  const bands = partitionCells(cells || {});
  const vectors = centroids?.vectors || null;
  const construction = centroids?.meta?.construction || 'clause';

  // A perception is defeasible and re-perceivable — but re-perceivable does not
  // mean recompute-from-scratch. Within one reader (this classifier instance
  // binds a fixed embedder + centroid bundle + floors), the three-position
  // reading is a pure function of the query, so we memoize it: the fold is not
  // thrown away, it is cached. The same projectGraph discipline — the key is
  // fully in the inputs (the query, here; the reader's identity is the instance)
  // — so the memo is safe. A genuinely new perception (a warmer reader, a
  // changed instrument) is a NEW instance with its own empty cache.
  const memo = new Map();

  // The reader is live only if every precondition for a real measurement holds.
  const live = !!(embedder?.measuresMeaning && vectors && Object.keys(vectors).length);

  // The query must match how the centroids were built (§10). Clause-level is the
  // design target (the unit is the proposition). If a bundle declares verb-grain
  // centroids, we embed the verb lemma to stay IN THE SAME SPACE rather than
  // measure a clause vector against a lexical centroid (which would measure
  // nothing). The grain is surfaced so a mismatch is visible, never silent.
  const queryFor = (proposition) => {
    const clause = typeof proposition === 'string' ? proposition
      : (proposition?.clause ?? proposition?.sentence ?? '');
    const verb = typeof proposition === 'object' ? (proposition?.verb ?? '') : '';
    return construction === 'verb' && verb ? verb : clause;
  };

  const classify = async (proposition) => {
    const base = { reader: 'geometric', construction, embedder: embedder?.id || null };
    // The firewall. Under a spelling-space embedder, hold every position.
    if (!embedder?.measuresMeaning) {
      return Object.freeze({ ...base, live: false,
        ground: noCommit('weak-embedder'), figure: noCommit('weak-embedder'), pattern: noCommit('weak-embedder') });
    }
    if (!vectors || !Object.keys(vectors).length) {
      return Object.freeze({ ...base, live: false,
        ground: noCommit('no-centroids'), figure: noCommit('no-centroids'), pattern: noCommit('no-centroids') });
    }
    const query = queryFor(proposition);
    if (!query) {
      return Object.freeze({ ...base, live: true,
        ground: noCommit('empty-query'), figure: noCommit('empty-query'), pattern: noCommit('empty-query') });
    }
    if (memo.has(query)) return memo.get(query);
    // The meaning organ (MiniLM → onnxruntime-web, loaded from a CDN on demand) can
    // fault transiently — a backend-registration race on first inference, a lost WebGPU
    // context. Degrade to no-commit (the honest "couldn't measure") rather than throw:
    // a flaky reader must not crash the turn that called it (the fact-check stage). Not
    // memoized, so a later attempt can still type the clause once the organ recovers.
    let qVec;
    try {
      qVec = await embedder.embed(query);
    } catch (e) {
      return Object.freeze({ ...base, live: false, error: String(e?.message || e),
        ground:  noCommit('embed-failed'),
        figure:  noCommit('embed-failed'),
        pattern: noCommit('embed-failed') });
    }
    const perception = Object.freeze({
      ...base, live: true,
      ground:  measureBand(qVec, bands.Ground,  vectors, floors.Ground),
      figure:  measureBand(qVec, bands.Figure,  vectors, floors.Figure),
      pattern: measureBand(qVec, bands.Pattern, vectors, floors.Pattern),
    });
    memo.set(query, perception);
    return perception;
  };

  return Object.freeze({
    classify,
    isLive: () => live,
    construction,
    bands,
    // The cell-adjacency instrument, bound to this reader's centroids — so the
    // edge-grounding veto compares two relation cells in the SAME space the
    // classifier typed them in. Inert (unmeasurable) under the hash organ.
    adjacency: createCellAdjacency(vectors),
    // The geometric reader's coupling on a deposit is the measured confidence,
    // never a fixed prior — confidence flows up from the margin, it does not
    // flow down from fluency. (The model reader, by contrast, is capped at 0.6.)
    coupling: (perception, band) => perception?.[band]?.confidence ?? 0,
  });
};

// Wrap a classifier reading into an append-only, reader- and cursor-indexed
// perception deposit. The phasepost is Meant, never the Given: it records that
// THIS reader, reading THIS clause at THIS cursor, perceived these three
// positions with these margins. Defeasible. Re-perceivable by a warmer reader
// at a later cursor. Written as content, never as ground-truth fact.
export const perceptionDeposit = ({ reader = 'geometric', cursor = null, clause = '', perception }) =>
  Object.freeze({
    kind: 'phasepost',
    reader,
    cursor,
    clause,                         // the Given — the verbatim clause
    ground:  perception?.ground  ?? noCommit('none'),
    figure:  perception?.figure  ?? noCommit('none'),
    pattern: perception?.pattern ?? noCommit('none'),
  });
