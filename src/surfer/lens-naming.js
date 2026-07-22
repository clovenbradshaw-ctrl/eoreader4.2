// EO: SEG(Lens,Paradigm → Lens,Paradigm, Dissecting) — naming a Lens/Paradigm reading
//
// A Lens is an eigenvector of ρ (core/spectral.js eigenLenses); a Paradigm reading is a
// projector-vs-projector incommensurability. Both ship as raw numbers today — a weight, an
// eigenvector, a commutator scalar — with nothing that says what a reading of them means in
// words a reader would recognise (docs/referents-recursed-up-the-domain-axis.md D1: "a Lens
// must never be keyed to... an explicit statement of it", which is right for IDENTITY but has
// left the column mute on DESCRIPTION too). This module closes that, using no vocabulary the
// cube did not already ship: every operator already carries its own verb (core/operators.js
// `label` — "bond", "evaluate", "synthesize", …), so naming a direction is reading off which
// operators load it heaviest, never inventing a word.
//
// Basis-agnostic: a dimension key is either a bare operator code ('EVA') — the structural
// basis (structure-basis.js) — or a cube-cell key ('EVA_Tending_Atmosphere') — the embedding
// basis (atmosphere.js/surf.js). Both name off the LEADING operator code, so one function
// serves both bases without either importing the other's shape.

import { OPERATORS } from '../core/index.js';

const round = (x) => Math.round(x * 1e4) / 1e4;

// the operator a dimension key names itself after, or null for an unrecognised key.
const leadingOp = (dimKey) => {
  const op = String(dimKey).split('_')[0];
  return OPERATORS[op] ? op : null;
};

// topDims(vec, dims, { n, tau }) — the n heaviest-loaded dimensions of a direction (an
// eigenvector, a projector's diagonal, any per-dimension weighting), each { d: dimKey, w:
// loading }, weak loadings dropped at tau. Same shape structure-basis.js's lensTop already
// used locally; generalised here so both bases and both Lens/Paradigm share one namer.
export const topDims = (vec, dims, { n = 3, tau = 0.15 } = {}) =>
  dims.map((d, i) => ({ d, w: round(vec[i] ?? 0) }))
    .sort((a, b) => Math.abs(b.w) - Math.abs(a.w))
    .slice(0, n)
    .filter((o) => Math.abs(o.w) > tau);

// labelPattern(pattern) — the English phrase for a set of top-loaded dimensions, built
// entirely from the cube's own operator verbs. A negative loading reads as the reading
// running AWAY from that operator (the direction opposes it), positive as the verb itself.
// Null when nothing recognisable clears tau — an honest "no name" rather than a guess.
export const labelPattern = (pattern) => {
  const named = (pattern || []).map(({ d, w }) => {
    const op = leadingOp(d);
    if (!op) return null;
    const verb = OPERATORS[op].label;
    return w < 0 ? `away from ${verb}` : verb;
  }).filter(Boolean);
  return named.length ? named.join(' + ') : null;
};

// nameLens(lens, dims, opts) — topDims + labelPattern in one call, the common case: name an
// eigen-lens (or any direction) straight off its loadings.
export const nameLens = (lens, dims, opts = {}) => {
  const pattern = topDims(lens, dims, opts);
  return { pattern, label: labelPattern(pattern) };
};

// nameDivergence(diagA, diagB, dims, opts) — which dimensions separate two projectors'
// diagonals (each P[i][i] is how much mass the projector's top-rank subspace puts on
// dimension i). Built for the Paradigm pass: diagA the document's dominant subspace, diagB
// the corpus prior's — the top divergent dimensions are the commitments the document reads
// under MORE (positive) or LESS (negative) than the corpus does. Same namer, run on a
// difference vector instead of a single direction.
export const nameDivergence = (diagA, diagB, dims, opts = {}) => {
  const n = Math.min(diagA?.length || 0, diagB?.length || 0, dims.length);
  const delta = Array.from({ length: n }, (_, i) => diagA[i] - diagB[i]);
  const pattern = topDims(delta, dims, opts);
  const label = pattern.length
    ? pattern.map(({ d, w }) => {
        const op = leadingOp(d);
        if (!op) return null;
        const verb = OPERATORS[op].label;
        return `${w > 0 ? 'reads more into' : 'reads less into'} ${verb}`;
      }).filter(Boolean).join(', ')
    : null;
  return { pattern, label: label || null };
};
