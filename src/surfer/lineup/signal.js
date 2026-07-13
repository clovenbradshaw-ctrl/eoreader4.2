// EO: SIG·EVA·NUL(Field,Network → Field,Lens,Void, Tending,Tracing,Clearing) — signal from noise
// lineup/signal.js — separate the signal from the noise of what the chorus found.
//
// Every surfer returns findings; most of them are not worth keeping. This module makes
// the cut the way the whole engine makes it (surf.js, voidnull.js): it does NOT pick a
// count or a fixed floor — it derives the NOISE NULL the findings' own bulk throws up by
// chance (core deriveNull) and keeps only what beats it. A lone loud finding from one
// surfer must clear that bar on its own; nothing is signal because a voice was confident.
//
// Two things the single-reader null cannot see, and the chorus can:
//
//   CONSENSUS — a move that INDEPENDENT temperaments each reached (the surfers forked the
//     same graph, so they did not copy each other) is corroborated. ADHD's scattered lead
//     and type A's methodical closure landing on the same figures is the strongest thing
//     the lineup produces, and it counts even when neither voice's bits cleared the null
//     alone. This is the cooperative payoff: the voices confirm each other.
//   GROUND — a finding the LOG graded grounded or warranted (reason/walk.js) is already
//     anchored to the corpus; it is signal by provenance, not by loudness. Idle reaches
//     get no such pass — they must earn it by consensus or by beating the null.
//
// So the verdict is a disjunction the framework already trusts: grounded, OR corroborated
// by ≥2 voices, OR loud enough to beat the noise null. Everything else is held as noise —
// kept WITH its key (recoverability: a lead the chorus could not yet confirm is a record,
// not a silence), exactly as the governor keeps its silent tail (chorus/governor.js).

import { deriveNull } from '../../core/index.js';

// The default hallucination budget for the null — the same order the surfer core uses
// (surf.js adaptive reach: alpha 0.05). A caller may loosen it to hear more leads or
// tighten it to keep only the sharpest.
export const DEFAULT_ALPHA = 0.05;

// group — fold a flat finding list into one entry per corroboration key. Each group
// carries the distinct voices that reached it, the strongest grade any of them earned,
// and the loudest bits — the three quantities the verdict reads.
const group = (findings) => {
  const byKey = new Map();
  for (const f of findings) {
    let g = byKey.get(f.key);
    if (!g) {
      g = { key: f.key, op: f.op, sites: f.sites, said: f.said, voices: new Set(),
            bestBits: 0, bestWeight: 0, grade: f.grade, findings: [] };
      byKey.set(f.key, g);
    }
    g.voices.add(f.temperament);
    g.findings.push(f);
    if (f.bits > g.bestBits) g.bestBits = f.bits;
    if (f.weight > g.bestWeight) { g.bestWeight = f.weight; g.grade = f.grade; g.said = f.said ?? g.said; }
  }
  return byKey;
};

// separate — the cut. Returns the signal groups (kept) and the noise groups (held with
// their keys), the null threshold it derived (Infinity when the background is too thin to
// trust — deriveNull abstains, and then only consensus and ground can name signal, never
// loudness), and the by-key index for the reward to attribute credit.
export const separate = (findings, { alpha = DEFAULT_ALPHA, consensus = 2 } = {}) => {
  const byKey = group(findings || []);
  const groups = [...byKey.values()];

  // The noise null over the pooled surprise — the bar a lone finding must beat. Leave the
  // candidate out of its own background (leaveOut) so a single loud reach cannot raise the
  // bar it is judged against. Abstains (Infinity) on a thin background, by design.
  const bits = findings.map((f) => f.bits);
  const thresholdOf = (b) => deriveNull(bits, { scale: 'linear', alpha, leaveOut: b });

  const signal = [];
  const noise = [];
  for (const g of groups) {
    const corroborated = g.voices.size >= consensus;             // ≥2 independent voices
    const anchored = g.bestWeight >= GRADE_GROUNDED;            // an exafferent witness graded it grounded
    const nul = thresholdOf(g.bestBits);
    const loud = Number.isFinite(nul) && g.bestBits > nul;       // beats what chance throws up
    const isSignal = anchored || corroborated || loud;

    // the finding's standing — surprise, lifted by how many voices agreed and how well it
    // is graded. Reported so the reward and the audit can rank without recomputing.
    const score = round(g.bestBits * (g.bestWeight || 0.2) * (1 + Math.log2(g.voices.size + 1)));
    const entry = Object.freeze({
      key: g.key, op: g.op, sites: g.sites, said: g.said, grade: g.grade,
      voices: Object.freeze([...g.voices].sort()), consensus: g.voices.size,
      bits: round(g.bestBits), weight: g.bestWeight, score,
      because: anchored ? 'grounded' : corroborated ? 'corroborated' : loud ? 'loud' : 'held',
      findings: g.findings,
    });
    (isSignal ? signal : noise).push(entry);
  }

  const rank = (a, b) => b.score - a.score || (a.key < b.key ? -1 : 1);
  signal.sort(rank); noise.sort(rank);

  return Object.freeze({
    signal: Object.freeze(signal),
    noise: Object.freeze(noise),
    threshold: findings.length ? thresholdOf(NaN) : Infinity,   // the shared bar (no candidate left out)
    signalKeys: new Set(signal.map((s) => s.key)),
    byKey,
    // the honest external check the room monitor reads: of what the chorus KEPT, how much
    // was anchored to the corpus rather than merely agreed upon — high consensus with low
    // ground is the collusion tell (reward.js), so it is measured, not assumed away.
    groundedFraction: signal.length
      ? round(signal.filter((s) => s.weight >= GRADE_WARRANTED).length / signal.length)
      : 0,
  });
};

const GRADE_GROUNDED = 1;      // a grounded (exafferent-witnessed) finding — signal by provenance
const GRADE_WARRANTED = 0.7;   // grounded-or-warranted floor (used for the reported groundedFraction)
const round = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : x);
