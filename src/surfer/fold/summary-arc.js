// EO: SEG·EVA(Field → Field, Clearing,Tracing) — arc coverage; stops stratified across the whole work
// fold/summary-arc.js — the whole-work walk behind the summary packet's `coverage: 'arc'`.
//
// One adaptive surf from anchor 0 reads a PLACE well; it cannot represent a novel. For a
// whole-work summary the stops must span the arc — opening, middle, close — or the packet
// (and every summary realized from it) is a summary of wherever the surf happened to peak.
// arcStops samples the document's own grain (the INJECTED `grain` — the caller wires
// detectGrain so the author's chapters cut the arc when the document carries them; the
// quantile fallback is pure arithmetic), surfs LOCALLY at each sampled boundary (the same
// cheap reach as the cursor scope — never the adaptive whole-doc walk, K times), and keeps
// each neighbourhood's strongest stop. First and last segments are always sampled, so the
// packet always carries where the work begins and where it ends.
//
// Holon discipline as summary.js: `surf` and `grain` are INJECTED — fold/ imports no
// surfer internals; everything here is arithmetic over what the caller wires.

export const arcStops = (doc, surf, { grain = null, want = 8 } = {}) => {
  const sents = doc.units || doc.sentences || [];
  const n = sents.length;
  let bounds = null;
  if (typeof grain === 'function') {
    try {
      const g = grain(doc);
      if (g && Array.isArray(g.bounds) && g.bounds.length >= 3) bounds = g.bounds;
    } catch { bounds = null; }
  }
  if (!bounds) {
    const k = Math.max(3, Math.min(want, n));
    bounds = Array.from({ length: k }, (_, i) => Math.floor((i * n) / k));
  }
  // Sample `want` boundaries evenly across the grain — the first and last always in.
  const k = Math.max(2, Math.min(want, bounds.length));
  const picked = k >= bounds.length ? bounds.slice()
    : Array.from({ length: k }, (_, i) => bounds[Math.round((i * (bounds.length - 1)) / (k - 1))]);
  const seen = new Set();
  const stops = [];
  const scores = new Map();
  let peak = null, peakScore = -Infinity;
  for (const b of picked) {
    const anchor = Math.max(0, Math.min(n - 1, b | 0));
    let s = null;
    try { s = surf(doc, anchor, {}); } catch { s = null; }      // the LOCAL reach, per segment
    if (!s || !Array.isArray(s.stops) || !s.stops.length) continue;
    const byIdx = new Map((s.field || []).map((f) => [f.idx, f.bayes]));
    const ranked = [...s.stops].sort((a, c) => (byIdx.get(c) ?? 0) - (byIdx.get(a) ?? 0));
    const pick = ranked.find((idx) => !seen.has(idx)) ?? s.peak;
    if (pick == null || seen.has(pick)) continue;
    seen.add(pick);
    stops.push(pick);
    const sc = byIdx.get(pick) ?? 0;
    scores.set(pick, sc);
    if (sc > peakScore) { peakScore = sc; peak = pick; }
  }
  if (!stops.length) return null;
  return { stops: stops.sort((a, b) => a - b), peak: peak ?? stops[0], scoreAt: (c) => scores.get(c) ?? 0 };
};
