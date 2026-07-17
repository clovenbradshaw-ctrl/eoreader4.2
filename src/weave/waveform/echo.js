// EO: SIG(Field → Network, Tending) — echo detection (docs/omnimodal-waveform.md §3.4)
// Motif recurrence: two non-adjacent windows whose fields match closer than chance
// AND whose match improves prediction of what follows — not raw similarity alone,
// so the arc doesn't fire on every repeated common phrase / stock cadence / diurnal
// wiggle. Purely a function of `field` vectors + `metric` — the most trivially
// omnimodal signal in the system (music's literal recurrence, weather's diurnal
// cycle, and text's motif rhyme are the same computation).

import { boundedNull } from '../../core/index.js';
import { windowMean } from './metric.js';

const median = (xs) => {
  const s = xs.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!s.length) return 0;
  const i = s.length >> 1;
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
};

// competenceGain(a, b) — does folding b in as a recurrence of a improve
// prediction of what comes right after b, versus the generic local trend?
// naiveError: how far unit b+1 sits from the window ending at b (the "nothing
// special happens next" prediction). matchedError: how far unit b+1 sits from
// what followed a (the "this is the same motif, so it continues the same way"
// prediction). A positive gain means the pattern match is doing real predictive
// work, not just coincidental phrasing overlap.
const competenceGain = (units, metric, a, b) => {
  if (a + 1 >= units.length || b + 1 >= units.length) return 0;
  const localTrend = windowMean(units, Math.max(0, b - 2), b + 1);
  const naiveError = localTrend ? metric(units[b + 1].field, localTrend) : 0;
  const matchedError = metric(units[b + 1].field, units[a + 1].field);
  return naiveError - matchedError;
};

// findEchoes — every non-adjacent window pair beating BOTH the chance-similarity
// null and the competence-gain null. `winSize` windows the comparison so a single
// stray token/frame does not manufacture an echo; `minGap` keeps adjacent-unit
// self-similarity (trivially high) out of the candidate pool; `stride` bounds the
// O(n²) candidate search on long Readings — every `stride`-th start position is a
// window anchor, not every position (a coarser but honest sampling of the space,
// not a silent truncation: `stats.windowsSampled` reports how many anchors ran).
export const findEchoes = (units, metric, { winSize = 3, minGap = 8, stride = 1, maxPairs = 20000 } = {}) => {
  const n = units.length;
  const anchors = [];
  for (let i = 0; i + winSize <= n; i += stride) anchors.push(i);

  const pairs = [];
  outer:
  for (let ai = 0; ai < anchors.length; ai++) {
    const a = anchors[ai];
    const wa = windowMean(units, a, a + winSize);
    if (!wa) continue;
    for (let bi = ai + 1; bi < anchors.length; bi++) {
      const b = anchors[bi];
      if (b - a < minGap) continue;
      const wb = windowMean(units, b, b + winSize);
      if (!wb) continue;
      const sim = 1 - metric(wa, wb);
      pairs.push({ a, b, sim });
      if (pairs.length >= maxPairs) break outer;
    }
  }

  const sims = pairs.map((p) => p.sim);
  const simLine = boundedNull(sims, { alpha: 0.05, ceiling: Infinity, fallback: median(sims) });

  const survivors = Number.isFinite(simLine) ? pairs.filter((p) => p.sim > simLine) : [];
  const gains = survivors.map((p) => competenceGain(units, metric, p.a, p.b));
  const gainLine = boundedNull(gains.filter((g) => g > 0), { alpha: 0.05, ceiling: Infinity, fallback: median(gains) });

  const echoes = [];
  for (let i = 0; i < survivors.length; i++) {
    const g = gains[i];
    if (!Number.isFinite(gainLine) || !(g > gainLine)) continue;
    echoes.push({ span_a: survivors[i].a, span_b: survivors[i].b, sim: survivors[i].sim });
  }
  return { echoes, stats: { windowsSampled: anchors.length, pairsConsidered: pairs.length } };
};
