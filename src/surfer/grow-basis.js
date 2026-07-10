// EO: REC·EVA(Paradigm,Void → Paradigm, Composing,Cultivating) — the growing basis
// The growing basis — the cells themselves learned, not shipped.
//
// The 27 cells are an external prior: a fixed frame the document is read through. An
// organism does not only fill a given frame — where the frame has no cell for what it
// keeps meeting, it COMPOSES one. That is the helix's deepest turn: REC(Composing,
// Paradigm) at the level of the basis, the Generate × Pattern move that "builds a new
// resolution-of-identity." Re-grounding (horizon.js) can then relocate to a frame
// element that did not exist a moment ago, instead of only clearing back to σ.
//
// The discipline is the engine's own — signal from noise, applied to category formation:
//
//   • a unit FITS a cell when its cosine to that cell beats the "belongs" floor derived
//     from the cells' own geometry (how close a unit must be to be nearer a cell than
//     cells typically are to each other) — never a hand-set number;
//   • a unit that beats NO cell is a MISFIT — the frame has no reading for it. Misfits
//     are buffered, not acted on;
//   • a new cell is composed ONLY when a cluster of misfits COHERES — ≥ minCluster of
//     them mutually beat the floor. Scattered misfits (genuine novelty/noise, no shared
//     direction) compose nothing. So the basis grows on recurring unframed meaning, not
//     on every surprise — the same "must beat what chance throws up" rule that keeps the
//     reader from chasing snow.
//
// Pure on vectors: it grows a basis over text-cell centroids, audio archetypes, or video
// motifs the same way. Acyclic — it derives its floor with boundedNull from core and
// never imports classify; the prior is injected.

import { boundedNull } from '../core/index.js';

const cosine = (a, b) => {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d > 1e-12 ? dot / d : 0;
};
const meanVec = (vs) => {
  const d = vs[0].length, m = new Array(d).fill(0);
  for (const v of vs) for (let i = 0; i < d; i++) m[i] += v[i] / vs.length;
  return m;
};
const normalize = (v) => { const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1; return v.map(x => x / n); };
const round = (x) => Math.round(x * 1e4) / 1e4;
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const std = (xs) => { const m = mean(xs); return Math.sqrt(mean(xs.map(x => (x - m) ** 2))); };

// createGrowingBasis(prior, { alpha, minCluster, maxMisfits })
//
//   prior        the centroid bundle { vectors: { key: vec } } — the shipped cells.
//   alpha        the Born budget for the boundedNull behind the "belongs" floor.
//   minCluster   how many cohering misfits compose a new cell (default 3).
//   maxMisfits   misfit-buffer cap (oldest dropped) so stale unframed units don't
//                accumulate forever (default 64).
export const createGrowingBasis = (prior, { alpha = 0.05, minCluster = 3, maxMisfits = 64 } = {}) => {
  const vectors = prior?.vectors;
  if (!vectors || !Object.keys(vectors).length) throw new Error('createGrowingBasis needs a prior with vectors');
  const cells = Object.keys(vectors).sort().map(key => ({ key, vec: vectors[key], learned: false }));

  // The "belongs" floor, derived from the cells' OWN geometry: a unit belongs to a cell
  // when it is closer than cells typically are to each other (mean + 2σ of inter-cell
  // cosines), with boundedNull as the Born-rule cross-check and a sane clamp. Recomputed
  // when the basis grows, so a new cell tightens the frame.
  let floor = 0.3;
  const recomputeFloor = () => {
    const inter = [];
    for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) inter.push(cosine(cells[i].vec, cells[j].vec));
    if (inter.length >= 4) {
      const derived = boundedNull(inter, { alpha, fallback: mean(inter) + 2 * std(inter) });
      floor = Math.max(0.2, Math.min(0.95, Number.isFinite(derived) ? Math.max(derived, mean(inter) + 1.5 * std(inter)) : mean(inter) + 2 * std(inter)));
    }
  };
  recomputeFloor();

  const misfits = [];          // buffered { vec, label }
  const log = [];              // append-only REC(Composing) events
  let composed = 0;

  const cosToCells = (vec) => cells.map(c => ({ key: c.key, sim: cosine(vec, c.vec) }));
  const project = (vec) => cells.map(c => cosine(vec, c.vec));
  const nearest = (vec) => cosToCells(vec).sort((a, b) => b.sim - a.sim)[0];

  // Admit one unit (a raw embedding). Returns whether it fit an existing cell, and — if
  // its arrival made a buffered misfit-cluster cohere — the key of the newly composed cell.
  const admit = (vec, { label = null } = {}) => {
    const best = nearest(vec);
    if (best.sim >= floor) return { fit: true, cellKey: best.key, residual: round(1 - best.sim), composed: null };

    // a misfit: the frame has no reading for it. Buffer it, then see if it now coheres
    // with enough other buffered misfits to compose a cell.
    misfits.push({ vec, label });
    if (misfits.length > maxMisfits) misfits.shift();
    const cluster = [misfits.length - 1];
    for (let i = 0; i < misfits.length - 1; i++) if (cosine(vec, misfits[i].vec) >= floor) cluster.push(i);

    if (cluster.length >= minCluster) {
      const members = cluster.map(i => misfits[i]);
      const newVec = normalize(meanVec(members.map(m => m.vec)));
      const key = `REC_Composing_Paradigm#${++composed}`;     // a learned Paradigm cell (Generate × Pattern)
      cells.push({ key, vec: newVec, learned: true, members: members.length, labels: members.map(m => m.label).filter(Boolean) });
      // consume the clustered misfits (drop them from the buffer, high indices first)
      for (const i of [...cluster].sort((a, b) => b - a)) misfits.splice(i, 1);
      recomputeFloor();
      log.push(Object.freeze({
        op: 'REC', site: 'Paradigm', stance: 'Composing', cell: key,
        from: members.length, floor: round(floor), rode: 'misfit-cluster',
      }));
      return { fit: false, cellKey: null, residual: round(1 - best.sim), composed: key };
    }
    return { fit: false, cellKey: null, residual: round(1 - best.sim), composed: null };
  };

  return Object.freeze({
    admit, project,
    nearest: (vec) => { const b = nearest(vec); return { key: b.key, sim: round(b.sim) }; },
    residualOf: (vec) => round(1 - nearest(vec).sim),
    get cells() { return cells.map(c => ({ key: c.key, learned: c.learned })); },
    get learnedCount() { return composed; },
    get floor() { return round(floor); },
    get pendingMisfits() { return misfits.length; },
    get log() { return log.slice(); },
    // the grown bundle, in the same shape as the prior — feed it to centroidBasis /
    // corpusSigma / a Horizon so the rest of the column reads through the grown frame.
    bundle() { return { vectors: Object.fromEntries(cells.map(c => [c.key, c.vec])) }; },
  });
};
