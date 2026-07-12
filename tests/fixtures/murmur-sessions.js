// Replay fixtures for the murmur sense (spec §12). Synthetic stand-ins for the exported
// sessions the spec tunes against (the dolphin session, the worst-movie session), each carrying
// a per-exchange fold snapshot with embedding vectors so `sense` can be replayed OFFLINE and its
// thresholds earned. Vectors are small unit-ish vectors over a handful of named topic axes — a
// cosine over them behaves like a cosine over the real MiniLM space for the purpose of the drift
// geometry (spec §5). `foldTs` is when the fold stop happened (≈170ms — pre-generation);
// `generationTs` is when the first token would stream. The harness asserts drift is raised
// BEFORE generationTs (the whole point: a pre-generation catch, not a 60s post-hoc flag).

// Named topic axes (orthonormal-ish basis).
const AXES = {
  movie:     [1, 0, 0, 0, 0],
  videogame: [0, 1, 0, 0, 0],
  dolphin:   [0, 0, 1, 0, 0],
  vaporwave: [0, 0, 0, 1, 0],
  phatic:    [0, 0, 0, 0, 1],
};
// A vector mostly along `axis`, with a little leakage toward `toward` (0..1).
const vec = (axis, toward = null, mix = 0) => {
  const base = AXES[axis].map(x => x * (1 - mix));
  if (toward) for (let i = 0; i < base.length; i++) base[i] += AXES[toward][i] * mix;
  // normalize
  const n = Math.sqrt(base.reduce((s, x) => s + x * x, 0)) || 1;
  return base.map(x => x / n);
};
const reading = (axis, toward = null, mix = 0) => [vec(axis, toward, mix), vec(axis, toward, mix * 1.05)];

// ── Worst-movie session (spec §4a worked exchange, §5 worked failure) ──────────
// exchange 1: on-topic, diffuse-but-locked (concentrated:false, w:0.20, focus locked, bayes high)
//             → net LOW drift, do NOT fire (the §5 caveat control).
// exchange 2: "yeah go research that" — a deictic follow-up; retrieval walks into the video game
//             FlatOut 3 (top collapses to 0.412, focus 'Steam'). Fires ONLY because the anchor is
//             the session topic ("worst movie", turn 1), not the contentless follow-up string.
// exchange 3: the user REDIRECTS ("no the worst MOVIE"); retrieval recovers (top 1.0, on-topic).
//             The user chose to redirect — a steer that fought that would be a bug (spec §9.6).
export const worstMovie = {
  id: 'worst-movie',
  exchanges: [
    { query: 'what is the worst movie ever made', queryVec: vec('movie'),
      readingVecs: reading('movie'), foldTs: 170, generationTs: 2400,
      concentration: { concentrated: false, margin: 0.05, w: 0.20, top: 0.71, focus: 'Freddy Got Fingered' },
      expect: { silent: true } },
    { query: 'yeah go research that', queryVec: vec('videogame', 'movie', 0.1),
      readingVecs: reading('videogame'), foldTs: 165, generationTs: 2100,
      concentration: { concentrated: false, margin: 0.02, w: 0.10, top: 0.412, focus: 'Steam' },
      expect: { drift: true, deictic: true } },
    { query: 'no the worst MOVIE', queryVec: vec('movie'),
      readingVecs: reading('movie'), foldTs: 172, generationTs: 2600,
      concentration: { concentrated: true, margin: 0.5, w: 0.9, top: 1.0, focus: 'The Room' },
      expect: { silent: true, userRedirect: true } },
  ],
};

// ── Dolphin session (spec §5 worked failure) ───────────────────────────────────
// exchange 1: phatic opener ("How are you?") — raises NOTHING (the control; the worker stays
//             asleep when there's no signal, spec §12).
// exchange 2: a real dolphin question, on-topic.
// exchange 3: the centroid marches into the vaporwave / Ecco the Dolphin cluster (margin 0,
//             top 0.667); the drift vector points away from the anchor BEFORE generation starts.
export const dolphin = {
  id: 'dolphin',
  exchanges: [
    { query: 'How are you?', queryVec: vec('phatic'),
      readingVecs: reading('phatic'), foldTs: 120, generationTs: 900,
      concentration: { concentrated: false, margin: 0.0, w: 0.0, top: 0.0, focus: null },
      expect: { silent: true, phatic: true } },
    { query: 'how fast can a dolphin swim', queryVec: vec('dolphin'),
      readingVecs: reading('dolphin'), foldTs: 168, generationTs: 2200,
      concentration: { concentrated: true, margin: 0.4, w: 0.82, top: 0.88, focus: 'bottlenose dolphin' },
      expect: { silent: true } },
    { query: 'tell me more', queryVec: vec('dolphin', 'vaporwave', 0.1),
      readingVecs: reading('vaporwave'), foldTs: 170, generationTs: 2300,
      concentration: { concentrated: false, margin: 0.0, w: 0.15, top: 0.667, focus: 'Ecco the Dolphin' },
      expect: { drift: true, deictic: true } },
  ],
};

export const SESSIONS = [worstMovie, dolphin];
