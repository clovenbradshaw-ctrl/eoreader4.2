// EO: SEG·DEF(Field,Atmosphere,Paradigm → Field, Unraveling,Clearing) — field read: turn boundaries
// field — the turn (REC) as a BOUNDARY in the generated field (docs/generation-by-field-reading.md).
//
// essay-backwards.md hit a wall: the fine cadence — when to turn — is not coaxable out
// of the move-predictor, and the lexical self-fold that licenses REC is a poor-man's
// proxy. The ingestion experiments (exp-0004) read a stream's boundaries as a density
// field: ATMOSPHERE = the local density departure (relEntropy), PARADIGM = the eigenbasis
// rotating (commutator), unioned and picked by the Born void (SEG), gated by the
// geography abstention (DEF). Generation is that act run forward, over the field
// the generation is itself laying down. This module reads the accepted atoms back as a
// field and returns, per cursor, whether it is a turn — the concrete first cut of
// spec-generation.md's "read self back through the perceiver".
//
// Causal by construction: at step k the units are the atoms accepted SO FAR, so the field
// is only ever the past. Pure but async (the embed call is async); the strain it returns
// is consumed synchronously by selfMoveLog.

import { buildDensity, eigenLenses, relEntropy, commutator, DEF, SEG } from '../../core/index.js';

// SEG needs ≥ MIN_SAMPLES departures to derive its line; below a handful of atoms
// there is no field to read, so the field strain is silent and the loop runs on drift
// strain alone (exactly the cold-start abstention the void takes everywhere).
export const MIN_FIELD = 5;

const unitText = (u) => String(u?.text || u?.subClaim || '');
const toArr = (v) => (Array.isArray(v) ? v : Array.from(v || []));

// L2-normalise each atom vector (the density it builds is |v⟩⟨v|). We deliberately do
// NOT mean-center: centering a low-cluster field antipodes the two states (A → −A), and a
// density operator is sign-blind (|v⟩⟨v| = |−v⟩⟨−v|), so a clean two-topic turn collapses
// to zero departure. The ingestion measure centers because it reads a rich, many-cluster
// stream's global geography; the local turn is read raw. (Verified: centered kills A|B@4.)
const normalize = (vecs) => vecs.map((v) => {
  let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
});

// Read the accepted units back as a field. Returns:
//   strainByCursor  per-cursor 1 at a turn (a void-cleared atmosphere/paradigm boundary),
//                   0 elsewhere — the strain the structural prior reads (replaces the
//                   lexical self-fold; still MAX'd with the floor's drift strain).
//   abstain         the geography gate: the field holds one reading → nothing left to
//                   distinguish → the honest move is to quiesce.
//   boundaries      the cursor positions that turned (for the trace / parity).
//   k               the reading count the field's own spectrum holds.
export const fieldStrain = async (units, { embed, window = 5, alpha = 0.05, tol = 1 } = {}) => {
  const n = units.length;
  const zero = { strainByCursor: new Array(n).fill(0), abstain: false, boundaries: [], k: n ? 1 : 0 };
  if (!embed || n < MIN_FIELD) return zero;

  const vecs = normalize((await Promise.all(units.map((u) => embed(unitText(u))))).map(toArr));
  if (vecs.length < MIN_FIELD || !vecs[0]?.length) return zero;

  // The whole-field geography → how many readings it holds. Reported for the trace; the
  // quiesce gate below uses it only in concert with "no boundary fired", so the common
  // mode (which keeps the raw spectrum low-rank) never forces a premature stop.
  const lenses = eigenLenses(buildDensity(vecs).rho);
  const rc = DEF(lenses.map((l) => l.weight));

  // The two departure curves over adjacent trailing windows: atmosphere (density
  // departure) and paradigm (basis rotation), at each interior cursor. A cursor is
  // scored only where BOTH windows hold ≥ 2 atoms — a rank-1 window (the last atom on its
  // own) reads as a spurious departure against any field, so the frontier is not scored
  // until enough atoms sit after it. A turn is thus confirmed a beat or two in hindsight.
  const dens = (lo, hi) => buildDensity(vecs.slice(lo, hi)).rho;
  const atmo = [], para = [], idx = [];
  for (let i = 2; i <= n - 2; i++) {
    const L = dens(Math.max(0, i - window), i);
    const R = dens(i, Math.min(n, i + window));
    if (L.length < 1 || R.length < 1) continue;
    atmo.push(0.5 * (relEntropy(L, R) + relEntropy(R, L)));
    para.push(commutator(L, R));
    idx.push(i);
  }
  // Each curve read against the Born void; the union is the turn set (exp-0004's fusion).
  const boundaries = [...new Set([
    ...SEG(atmo, { alpha, tol, indices: idx }),
    ...SEG(para, { alpha, tol, indices: idx }),
  ])].filter((i) => i >= 0 && i < n).sort((a, b) => a - b);

  // Strain rides the turn AND its wake: mark the boundary cursor and the next, so once a
  // turn is confirmed (a beat late) the strain has reached the frontier the direction face
  // reads — a REC fires just after the field turned, restructuring in hindsight.
  const strainByCursor = new Array(n).fill(0);
  for (const b of boundaries) for (let j = b; j <= Math.min(n - 1, b + 2); j++) strainByCursor[j] = 1;
  return { strainByCursor, abstain: rc.abstain, boundaries, k: rc.k };
};
