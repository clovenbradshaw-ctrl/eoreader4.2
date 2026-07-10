// EO: SEG·SYN·EVA(Field,Network → Network,Field, Unraveling,Composing,Binding) — autopoietic holons by Born rule
// Autopoietic holons by the Born rule — detected, not imposed.
//
// `detectGrain` (levels.js) chunks on the author's chapter headings: an IMPOSED grain. But a
// chapter is not a closed unit — a scene spans chapter lines, the philosophy-of-history thread
// is scattered across the whole book yet closes on itself. The grain the reading actually has
// is where the reading's OWN bonds close: a region whose cast keeps re-instantiating itself
// (operational closure / autopoiesis — the holon maintains its own boundary), weakly coupled
// to what surrounds it.
//
// We detect that with the machinery the surfer already runs (surf.js, structure-basis.js):
// the BORN RULE over a density operator.
//
//   1. Basis  — the top figures (the standing cast). dim small, the eigensolver cheap.
//   2. ρ      — buildDensity over per-unit cast activations. ρ_ij is how much figures i and j
//               co-activate across the document: the cast-coupling operator.
//   3. Lenses — eigenLenses(ρ): the document's natural readings. Each eigenlens concentrates
//               Born mass on a SELF-COUPLED figure community — a cast that keeps appearing
//               together, i.e. an autopoietic holon's signature; its eigenvalue is the holon's
//               closure mass. This is exactly the Born rule the surfer reads the field with.
//   4. Assign — each unit goes to the lens it expresses with maximal Born probability
//               |⟨lens|a_u⟩|². A unit "is in" the holon whose cast is on stage in it.
//   5. Holons — maximal contiguous runs of one dominant lens. The lens SWITCH is the boundary —
//               which is the cast-turnover surprise (the coarse-grain surprise the sentence
//               cursor cannot see). Detecting holons and encoding multi-grain surprise are the
//               same operation; the seams fall out together, σ-side and deterministic.
//   6. Grain  — k (lenses retained) is the resolution: few lenses → coarse arcs, more → finer
//               scenes. The eigenspectrum's drop suggests the natural k; `holarchy` nests them.

import { buildDensity, eigenLenses, vonNeumann, projectGraph } from '../core/index.js';

const round = (x) => Math.round(x * 1e4) / 1e4;
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

// Build the per-unit cast activations over the top-K figures, and the figures' index. A
// `range` restricts BOTH the top-figure basis and the activations to a span — so a local
// re-detection (the holarchy) builds its cast from the figures central to THAT span (where
// Karataev is a protagonist), not the document's global top, which would never list him.
const castActivations = (doc, { topFigures, lo, hi }) => {
  const events = doc?.log?.snapshot ? doc.log.snapshot() : (Array.isArray(doc?.log) ? doc.log : []);
  const graph = projectGraph(doc.log);
  const rep = graph.representative || ((x) => x);
  const labelOf = (id) => doc.admission?.labelOf?.(id) || graph.entities.get(rep(id))?.label || id;
  const inRange = (i) => i != null && i >= lo && i < hi;
  // top figures by sighting mass WITHIN the range — the local standing cast.
  const sight = new Map();
  for (const e of events) if (e.op === 'INS' && inRange(e.sentIdx)) { const id = rep(e.id); sight.set(id, (sight.get(id) || 0) + 1); }
  const top = [...sight.entries()].sort((a, b) => b[1] - a[1]).slice(0, topFigures).map(([id]) => id);
  const idx = new Map(top.map((id, i) => [id, i]));
  const K = top.length;
  const units = doc.units || doc.sentences || [];
  const A = units.map(() => new Array(K).fill(0));
  const touch = (sentIdx, id, w) => { const i = idx.get(rep(id)); if (i != null && A[sentIdx]) A[sentIdx][i] += w; };
  for (const e of events) {
    if (!inRange(e.sentIdx)) continue;
    if (e.op === 'INS') touch(e.sentIdx, e.id, 1);
    else if ((e.op === 'CON' || e.op === 'SIG') && !e.linkKind) {
      const w = 1 + (e.confidence ?? 0);          // a sure bond couples its endpoints harder
      if (e.srcKind == null) touch(e.sentIdx, e.src, w);
      if (e.tgtKind == null) touch(e.sentIdx, e.tgt, w);
    }
  }
  // L2-normalize each unit (a direction in cast-space; magnitude is "how much cast is on stage")
  for (const v of A) { let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n); if (n > 0) for (let i = 0; i < v.length; i++) v[i] /= n; }
  return { A, top, idx, K, labelOf, rep };
};

// detectHolons — the Born-rule closure detection at one grain (k lenses), optionally over a
// `range` {lo, hi} of units (the holarchy passes a coarse holon's span for local re-detection).
export const detectHolons = (doc, { k = 8, minLen = 3, topFigures = 48, range = null } = {}) => {
  const units = doc?.units || doc?.sentences || [];
  const lo = range?.lo ?? 0, hi = range?.hi ?? units.length;
  const empty = { k, holons: [], boundaries: [], lenses: [], spectrum: [], entropy: 0, units: hi - lo };
  if (hi <= lo) return empty;
  const { A, top, K, labelOf } = castActivations(doc, { topFigures, lo, hi });
  if (!K) return empty;

  // ρ over the cast, its eigenlenses the self-coupled communities (the Born rule).
  const active = A.slice(lo, hi).filter((v) => v.some((x) => x !== 0));
  if (!active.length) return empty;
  const { rho } = buildDensity(active);
  const lenses = eigenLenses(rho, { k }).filter((l) => l.weight > 1e-9);
  if (!lenses.length) return empty;
  const spectrum = lenses.map((l) => round(l.weight));
  const entropy = round(vonNeumann(lenses.map((l) => l.weight)));

  // Assign each unit to the lens it expresses with maximal BORN probability |⟨lens|a⟩|².
  // A unit with no cast carries the previously active lens (the holon persists across a
  // descriptive lull rather than spawning a phantom boundary).
  const dom = new Array(units.length).fill(-1);
  let carry = 0;
  for (let u = lo; u < hi; u++) {
    const a = A[u];
    if (!a.some((x) => x !== 0)) { dom[u] = carry; continue; }
    let best = 0, bi = 0;
    for (let l = 0; l < lenses.length; l++) { const p = dot(a, lenses[l].lens) ** 2; if (p > best) { best = p; bi = l; } }
    dom[u] = bi; carry = bi;
  }

  // Maximal contiguous runs of one dominant lens; a run shorter than minLen is absorbed into
  // the preceding holon (a flicker is not a scene). The runs are the holons; their starts the
  // boundaries (= the cast-turnover surprise).
  const runs = [];
  for (let u = lo; u < hi; u++) {
    const last = runs[runs.length - 1];
    if (last && last.lens === dom[u]) last.hi = u + 1;
    else if (last && (last.hi - last.lo) < minLen) { last.lens = dom[u]; last.hi = u + 1; }  // absorb a flicker
    else runs.push({ lens: dom[u], lo: u, hi: u + 1 });
  }
  // merge adjacent runs that ended up on the same lens after absorption
  const merged = [];
  for (const r of runs) { const last = merged[merged.length - 1]; if (last && last.lens === r.lens) last.hi = r.hi; else merged.push({ ...r }); }

  const castOf = (lensIdx) => {
    const lens = lenses[lensIdx]?.lens || [];
    return [...lens.keys()].map((i) => ({ id: top[i], label: labelOf(top[i]), w: round(Math.abs(lens[i])) }))
      .sort((a, b) => b.w - a.w).slice(0, 5).filter((f) => f.w > 0.05);
  };
  const holons = merged.map((r, n) => ({
    idx: n, lens: r.lens, lo: r.lo, hi: r.hi, units: r.hi - r.lo,
    mass: round(lenses[r.lens]?.weight ?? 0),
    cast: castOf(r.lens),
    closure: 0,   // filled below
  }));
  // closure (autopoiesis made measurable) — LOCAL coherence, not a global mass share. A
  // recurring cast (the Rostovs appear in fifty scenes) holds only a fraction of its lens's
  // document-wide mass, so a global ratio reads ≈0 for every real holon. What closure means
  // is: over the holon's OWN units, how much of each unit's Born mass its dominant lens
  // captures — does this span express one reading, or a blur? Averaged over the holon, in [0,1].
  holons.forEach((h) => {
    let s = 0, m = 0;
    for (let u = h.lo; u < h.hi; u++) {
      const a = A[u]; if (!a.some((x) => x !== 0)) continue;
      let tot = 0; for (let l = 0; l < lenses.length; l++) tot += dot(a, lenses[l].lens) ** 2;
      if (tot > 0) { s += (dot(a, lenses[h.lens].lens) ** 2) / tot; m++; }
    }
    h.closure = round(m ? s / m : 0);
  });

  return Object.freeze({
    k, units: hi - lo, entropy, spectrum,
    lenses: lenses.map((l, i) => ({ weight: round(l.weight), cast: castOf(i) })),
    holons, boundaries: holons.map((h) => h.lo).filter((b) => b > lo),
  });
};

// holarchy — the nested grains. Detect coarse holons, then re-detect WITHIN each coarse holon's
// span (range) at finer resolution, so a coarse arc (the Rostov family, the war) resolves into
// its scenes — and on its OWN local cast, so a figure central to the span but globally minor
// (Karataev in the captivity) heads a fine holon. Recursing deeper is the same call per child.
export const holarchy = (doc, { coarseK = 6, fineK = 5, minLen = 4, topFigures = 48 } = {}) => {
  const coarse = detectHolons(doc, { k: coarseK, minLen, topFigures });
  const levels = coarse.holons.map((h) => {
    const fine = detectHolons(doc, { k: fineK, minLen: Math.max(2, minLen >> 1), topFigures,
                                     range: { lo: h.lo, hi: h.hi } });
    return { holon: h, children: fine.holons };
  });
  return Object.freeze({ coarse, levels });
};
