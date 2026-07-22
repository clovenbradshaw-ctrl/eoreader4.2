// EO: EVA(Network → Lens, Tracing) — FoldTrace (docs/fold-trace-spec.md, docs/coil-surfaces.md §1)
// buildFoldTrace(waveform, opts) => FoldTrace[]. Pure function of an already-built
// WaveformModel (src/weave/waveform/build.js) — never a Reading, never a source, and
// never a second copy of strain/turns/echoes/cast computed here. Every numeric signal
// below is READ off the model that already computed it; this module's only job is to
// LABEL each unit with the cube cell it landed on (§0's "compute the coil once, project
// it many ways" — FoldTrace is the first projection, the labeling pass every later
// surface (coherence-panel, coil, terrain-river, …) reads instead of re-deriving it).
//
// One row per WaveformModel unit ordinal — "one climb of the helix per fold" reads,
// concretely, as "one cube-labeled row per reading unit". The four fields the spec
// calls out as the real delta (address, ops_fired, rec_fired, reject_reason) are
// derived from vocabulary that already exists and is already named: HELIX's fixed
// order (core/contract.js), the desert cell SYN·Cultivating (core/contract.js), and
// the coherence guard (core/cube.js) — never a fabricated heuristic.

import { cellOf, coherence } from './cube.js';
import { HELIX, DESERT_CELL } from './contract.js';

const round3 = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);

// Every referent's FIRST presence ordinal, restricted to referents the individuation
// gate actually admitted (onCast) — a raw sighting never mints; only a gate-cleared
// referent's earliest appearance does. Two referents minted on the same unit both
// count (a fold can instantiate more than one holon at once).
const mintedAt = (cast) => {
  const set = new Set();
  for (const lane of cast) {
    if (!lane.onCast || !lane.presence.length) continue;
    const first = lane.presence[0];
    if (first.role === 'FOREGROUND') set.add(first.start);
  }
  return set;
};

// The frame boundaries that are genuine resplits — i>0, since frame 0's start (the
// document's own beginning) is not a division of anything.
const frameStarts = (frames) => new Set(frames.filter((f) => f.start > 0).map((f) => f.start));

// ordinal → the echo it belongs to, if any (first match — a unit rarely sits in more
// than one motif; when it does, dependency tracing follows the first).
const echoOf = (echoes) => {
  const map = new Map();
  for (const e of echoes) {
    const earlier = Math.min(e.span_a, e.span_b);
    const later = Math.max(e.span_a, e.span_b);
    if (!map.has(later)) map.set(later, { earlier, later });
    if (!map.has(earlier)) map.set(earlier, { earlier, later, isEarlier: true });
  }
  return map;
};

// The desert-cell fallback's own address string — SYN resolving at Ground, the one
// cell "empty across 41 languages" (core/contract.js). Every "nothing distinguished
// happened here" unit lands here and is rejected, never silently accepted as a
// generic pass.
const DESERT_ADDRESS = `${DESERT_CELL.op}(${DESERT_CELL.terrain}, ${DESERT_CELL.stance})`;

const cellAddress = (op, grain) => {
  const cell = cellOf(op, grain);
  return { terrain: cell.terrain, stance: cell.stance, address: `${op}(${cell.terrain}, ${cell.stance})` };
};

// buildFoldTrace — the extension checkpoint (docs/coil-surfaces.md §1): replay a
// document, verify trace length equals fold count, verify at least one rejected
// entry carries a populated reject_reason, verify order_index is strictly monotonic.
// All three hold by construction here (one row per unit, in ordinal order), except
// the rejected entry — which depends on the document actually containing a desert
// stretch or a genuine cross-domain coincidence; see tests/fold-trace.test.js for
// the hand-constructed fixture that forces one when a corpus doesn't produce it.
export const buildFoldTrace = (waveform, { readingId = null } = {}) => {
  const { strain, confidence, frames, turns, echoes, cast } = waveform;
  const n = strain.length;

  const turnOrdinals = new Set(turns.map((t) => t.ordinal));
  const segStarts = frameStarts(frames);
  const minted = mintedAt(cast);
  const echoMap = echoOf(echoes);
  const foreground = presenceLookup(cast, 'FOREGROUND');
  const present = presenceLookup(cast, 'PRESENT');

  const trace = [];
  for (let i = 0; i < n; i++) {
    const isTurn = turnOrdinals.has(i);
    const isFrameStart = segStarts.has(i);
    const isMinted = minted.has(i);
    const echo = echoMap.get(i);
    const isEchoMember = !!echo;
    const hasPresence = foreground.has(i) || present.has(i);
    const confident = Number.isFinite(confidence[i]) && confidence[i] >= 0.5;

    // Primary op — the cell this fold is filed under, in priority order (the most
    // structurally distinctive thing that happened here wins the address).
    let primaryOp, grain;
    if (isTurn)            { primaryOp = 'REC'; grain = 'Pattern'; }
    else if (isMinted)     { primaryOp = 'INS'; grain = 'Figure'; }
    else if (isFrameStart) { primaryOp = 'SEG'; grain = 'Figure'; }
    else if (isEchoMember) { primaryOp = 'CON'; grain = 'Figure'; }
    // EVA reads a unit's strain IN RELATION TO a referent under evaluation — bare
    // continuous deviation with no referent and no structural event is not itself
    // a verdict, it is the ambient medium (cube.js: "the Ground column is the
    // ambient medium the reader rides"), so it falls to the desert fallback below.
    else if (confident && hasPresence) { primaryOp = 'EVA'; grain = 'Figure'; }
    else                   { primaryOp = 'SYN'; grain = 'Ground'; }   // the desert fallback

    // ops_fired — every distinct thing this fold did, ordered by the fixed helix
    // (core/contract.js HELIX), not by discovery order.
    const fired = new Set([primaryOp]);
    if (isTurn) fired.add('REC');
    if (isFrameStart) fired.add('SEG');
    if (isEchoMember) fired.add('CON');
    if (isMinted) fired.add('INS');
    if (confident && hasPresence) fired.add('EVA');
    const ops_fired = HELIX.filter((op) => fired.has(op)).join(',');

    let accepted = true;
    let reject_reason = null;
    let site, stance, address;

    if (primaryOp === 'SYN') {
      // The desert cell itself — SYN·Cultivating never ships as an accepted address.
      accepted = false;
      reject_reason = 'desert-cell';
      site = DESERT_CELL.terrain; stance = DESERT_CELL.stance; address = DESERT_ADDRESS;
    } else if (fired.has('REC') && fired.has('INS')) {
      // A confirmed paradigm-level turn (Interpretation domain) coinciding with a
      // referent instantiation (Existence domain) at the SAME unit — two faces
      // naming grains that cannot both be filed under one address. The guard, not
      // a hand-written check, is what calls this off-diagonal.
      const verdict = coherence({ op: 'REC', terrain: 'Entity' });
      const home = cellAddress(primaryOp, grain);
      site = home.terrain; stance = home.stance; address = home.address;
      if (!verdict.ok) { accepted = false; reject_reason = 'grain-mixed'; }
    } else if (primaryOp === 'CON' && echo.earlier !== i) {
      // This fold is the LATER half of a motif — it depends on its earlier partner
      // already having been individuated. A rejected antecedent breaks the chain.
      const antecedent = trace[echo.earlier];
      const home = cellAddress(primaryOp, grain);
      site = home.terrain; stance = home.stance; address = home.address;
      if (antecedent && !antecedent.accepted) { accepted = false; reject_reason = 'dependency'; }
    } else {
      const home = cellAddress(primaryOp, grain);
      site = home.terrain; stance = home.stance; address = home.address;
    }

    trace.push(Object.freeze({
      reading_id: readingId,
      pos_start: i,
      pos_end: i + 1,
      ops_fired,
      site,
      stance,
      address,
      accepted,
      reject_reason,
      cooked_height: round3(strain[i]),
      rec_fired: isTurn,
      discard_refs: accepted ? null : i,
      order_index: i,
    }));
  }
  return trace;
};

// nearestFoldIndex — the one lookup every scrubber-driven surface shares (the
// Poincaré scrubber, src/rooms/scrubber/poincare.js; the operator-clock,
// src/surfaces/operator-clock/render.js; and every later §3 surface). Binary
// search over a trace sorted by pos_start (FoldTrace's own invariant: strictly
// monotonic order_index === array position) for the row whose [pos_start, pos_end)
// contains `pos`, or the nearest row when `pos` falls outside the trace's own
// range. Lives beside buildFoldTrace, not inside any one consumer, so two
// surfaces reading the "same" pos can never resolve to two different folds.
export const nearestFoldIndex = (foldTrace, pos) => {
  if (!Array.isArray(foldTrace) || !foldTrace.length) return -1;
  if (pos <= foldTrace[0].pos_start) return 0;
  const last = foldTrace.length - 1;
  if (pos >= foldTrace[last].pos_start) {
    let lo = 0, hi = last;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (foldTrace[mid].pos_start <= pos) lo = mid; else hi = mid - 1;
    }
    return lo;
  }
  let lo = 0, hi = last;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (foldTrace[mid].pos_start <= pos && pos < foldTrace[mid].pos_end) return mid;
    if (foldTrace[mid].pos_start > pos) hi = mid - 1; else lo = mid + 1;
  }
  return lo;
};

// ordinal → whether SOME onCast referent has this role covering it — a plain fold
// over each lane's run-length presence, read once per role rather than per-unit.
function presenceLookup(cast, role) {
  const set = new Set();
  for (const lane of cast) {
    if (!lane.onCast) continue;
    for (const run of lane.presence) {
      if (run.role !== role) continue;
      for (let i = run.start; i < run.end; i++) set.add(i);
    }
  }
  return set;
}
