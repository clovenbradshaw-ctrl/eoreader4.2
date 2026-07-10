// EO: EVA·DEF(Field,Network → Lens, Tracing,Making) — piece-grain frame; the beat's site (streaming answer §8)
// write/frame.js — the piece-grain frame: each beat's site, measured not declared.
// (The Streaming Answer §8)
//
// A beat should know what kind of SITE it falls in — opening ground, the salient
// turn, the relation drawn across — but two things must hold or the discipline
// collapses into a template: the frame must be EMERGENT (read off the field, never
// a schema) and the TALKER MUST NOT SEE IT.
//
// THE FRAME IS THE Ground/Figure/Pattern TRIAD, RAISED ONE GRAIN. Phasepost
// (classify/phasepost.js, classify/bands.js) measures every PROPOSITION into three
// positions — Ground (the terrain a clause rests on), Figure (the act that stands
// out), Pattern (the relation laid across the field). The frame is that same
// partition run over the ANSWER SO FAR instead of a single clause: `frameAt`
// measures whether THIS beat is doing Ground-work, Figure-work, or Pattern-work in
// the emergent piece. Same instrument, one level up — the holonic transcend-and-
// include (the beat is a Figure as a sentence; at the grain above it occupies a
// position in a Pattern).
//
// IT IS EMERGENT BECAUSE IT IS READ OFF THE FIELD. There is no intro→body→conclusion
// table. The site falls out of quantities the fold + surf already maintain — the
// SAME scalar the surfer rode (docs/surfing-the-fold.md), so the two cannot disagree:
//   • early, the integral mass is thin — terrain is still being laid — so opening
//     beats measure into GROUND (establishing, not yet asserting);
//   • the steepest Bayesian-surprise stop (surf.peak) is where the reading was
//     rewritten — the salient move — so it measures into FIGURE (the turn);
//   • after the turn, and at a REC firing under accumulated strain, the relation is
//     drawn across the whole field, so the closing beats measure into PATTERN.
// "Hook → bona fides → turn → land" is the human's NAME for this trajectory, not its
// cause; the shape is discovered, never imposed.
//
// IT IS A POSTERIOR, AND IT MAY HOLD. `frameAt` commits a position only above a
// floor (the field has real structure); otherwise it holds at no-commit and the
// cursor falls back to a neutral posture — the same honesty as the predictor's VOID.
//
// THE TALKER NEVER SEES IT. The site is an address, never a token (phasepost.md).
// `frameAt` conditions the cursor's SURFACE only — its posture, its target in plain
// words ("open the ground here", "make the move", "draw it together"), its budget.
// It NEVER emits a typed edge (a wrong edge ships a claim the fold cannot un-say);
// the frame shapes how a thing is said, the witness still owns whether it is true.

import { BANDS as SITES } from '../../perceiver/classify/bands.js';

// The no-commit floor (the predictor's-VOID analogue, §8). The field must carry a
// minimum spread of Bayesian surprise before a position is read off it; a flat reach
// holds at neutral rather than inventing a shape. Router-grade — a wrong posture
// costs a slightly mis-shaped sentence, never a false fact.
const DEFAULT_FLOOR = 0.04;

// The plain-language posture per site — the SURFACE the cursor is conditioned with.
// No operator code, no cell name, none of the words Ground/Figure/Pattern ever
// reach the talker (the surface discipline, §3b/§8): it is handed a target in plain
// words and a posture, and it writes one honest sentence not knowing which it is.
const POSTURE = Object.freeze({
  Ground: {
    posture: 'narrative',
    target: 'open the ground in one plain sentence — set up who and what this is about, establish it rather than argue it',
  },
  Figure: {
    posture: 'thesis-first',
    target: 'make the move in one sentence — say the turn this passage takes, the thing that changes the reading',
  },
  Pattern: {
    posture: 'thesis-first',
    target: 'draw it together in one sentence — relate this back to what you have already said',
  },
  neutral: {
    posture: 'narrative',
    target: 'write one plain, grounded sentence',
  },
});

const median = (xs) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// frameAt — measure the site of the beat at surfer stop `stop`, position `i` of
// `total`, over the answer-so-far `fold` and the surfer's `surf` reading. Returns
// the site (or null at no-commit), whether it committed, and the SURFACE the cursor
// is conditioned with — posture, a plain-words target, and a budget. It never
// returns an edge or a band; those are the resolver's and the witness's (§8).
export const frameAt = (fold, surf, stop, i, total, opts = {}) => {
  const floor = opts.floor ?? DEFAULT_FLOOR;
  const field = (surf && surf.field) || [];
  const reach = field.map(f => f.bayes).filter(Number.isFinite);
  const spread = reach.length ? Math.max(...reach) - Math.min(...reach) : 0;
  const mass = fold && fold.appeared ? fold.appeared().length : 0;

  // No-commit: a reach with no real structure (flat surprise) holds at neutral
  // rather than reading a shape into noise (§8, the predictor's VOID).
  if (spread <= floor) return decide(null, opts);

  const stops = (surf && surf.stops) || [];
  const peakIdx = stops.indexOf(surf.peak);
  const here = stops.indexOf(stop) >= 0 ? stops.indexOf(stop) : i;
  const isRec = (surf.recCursors || []).includes(stop);
  const peakMargin = bayesAt(field, surf.peak) - median(reach);

  // The trajectory, read off the peak the surfer already found (the same scalar).
  // GROUND until the turn (the terrain is still being laid), FIGURE at the steepest
  // stop (the reading was rewritten there), PATTERN after it — and at any REC, where
  // a frame broke under accumulated strain and the relation is drawn across.
  let site;
  if (stop === surf.peak && peakMargin > 0) site = SITES[1];           // Figure
  else if (isRec) site = SITES[2];                                     // Pattern
  else if (peakIdx >= 0 && here > peakIdx) site = SITES[2];            // Pattern (past the turn)
  else if (mass <= 1 || here <= 0) site = SITES[0];                    // Ground (thin terrain / opening)
  else if (peakIdx >= 0 && here < peakIdx) site = SITES[0];            // Ground (before the turn)
  else site = SITES[1];                                                // Figure (the move, by default)

  return decide(site, opts, { peakMargin, mass });
};

const bayesAt = (field, idx) => field.find(f => f.idx === idx)?.bayes ?? 0;

// Map a measured site (or null) to the cursor surface. The site itself is never
// surfaced — only its plain-language posture, target, and budget (§8).
const decide = (site, opts, extra = {}) => {
  const key = site && POSTURE[site] ? site : 'neutral';
  const p = POSTURE[key];
  return Object.freeze({
    site,
    committed: site != null,
    posture: opts.posture || p.posture,
    target: p.target,
    budget: opts.budget ?? undefined,
    ...extra,
  });
};

export { SITES };
