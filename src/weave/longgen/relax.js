// EO: SYN·REC(Field,Network → Lens, Composing,Making) — decision as relaxation
// relax — the decision as a network relaxing into an attractor, not a readout consulted
// (docs/decision-as-relaxation.md). Measuring, reading, and deciding are one event: the
// field's occupancy IS the input current, and the settling IS the choice. There is no step
// where the loop takes in p(next) and THEN consults it — the currents drive a winner-take-all
// relaxation with lateral inhibition (mutual repression — PU.1/GATA1) and self-excitation
// (commitment, memory), and the network falls into one stable configuration and is trapped
// there. Nothing chose; a feedback network relaxed into one of its stable states.
//
// The cadence is NOT scheduled. It emerges from an activator–consumer loop in the currents:
// introducing a figure leaves an undeveloped atom, which raises the develop current; the
// develop consumes it, which drops the develop current and re-enables introduce. Alternation
// is a relaxation oscillator, the way a central pattern generator walks — not a hand-written
// beat.

import { MOVE_ALPHABET } from '../../perceiver/predict/movelog.js';

const NODE_OPS = ['CON', 'DEF', 'INS', 'SIG'];   // introduce — spend fresh ground
const EDGE_DEV = 'EVA';                            // develop — consume an undeveloped atom

// Relax input currents to a single attractor. Pure. `currents` is a map op→drive (≥0 the
// meaningful range). Lateral inhibition makes it winner-take-all / bistable; self-excitation
// gives commitment; the per-step renormalisation keeps the competition bounded. Returns the
// settled winner and the activation vector.
export const relax = (currents = {}, { steps = 20, selfEx = 0.55, inhib = 0.45, leak = 0.1, alphabet = MOVE_ALPHABET } = {}) => {
  let a = {};
  for (const o of alphabet) a[o] = Math.max(0, currents[o] || 0);
  for (let t = 0; t < steps; t++) {
    let sum = 0; for (const o of alphabet) sum += a[o];
    const na = {};
    let nmax = 0;
    for (const o of alphabet) {
      // drive = the input current (the occupancy — always present, the field never stops
      // gating) + self-excitation (commit) − lateral inhibition (the others repress) − leak.
      const drive = (currents[o] || 0) + selfEx * a[o] - inhib * (sum - a[o]) - leak * a[o];
      na[o] = drive > 0 ? drive : 0;
      if (na[o] > nmax) nmax = na[o];
    }
    // renormalise to keep the competition on a fixed scale (bounded, non-degenerate).
    if (nmax > 0) for (const o of alphabet) na[o] /= nmax;
    a = na;
  }
  let winner = alphabet[0], best = -Infinity;
  for (const o of alphabet) if (a[o] > best) { best = a[o]; winner = o; }
  return { winner, activations: a, alphabet };
};

// Build the input currents from the field's OCCUPANCY and settle them — one event. No
// posterior is drawn and then sampled; the occupancy of the ground (how much fresh mass is
// unspent), of the self (is the last atom an undeveloped node), and of the field (is the
// frontier a turn) directly drives the operators, and the network falls where it falls.
//
//   prior     the ranked p(next) [[op,p],…] — the recurrence/structure/grammar drive,
//             folded in as a soft baseline current (the network's resting potential).
//   ground/covered  the ground pool and the spent set — the introduce current is the
//             unspent mass; a spent pool silences the node ops.
//   units     the self so far — a trailing node with no develop after it raises the develop
//             current (the consumer half of the activator–consumer loop).
//   field     the field read — strain at the frontier drives REC (the turn).
//   phase     the arc phase — land raises SYN once there are constituents to close.
export const relaxMove = ({ prior = null, ground = [], covered = new Set(), units = [], field = null, phase = null, alphabet = MOVE_ALPHABET, opts = {} } = {}) => {
  const cov = covered instanceof Set ? covered : new Set(covered || []);
  const currents = {};
  for (const o of alphabet) currents[o] = 0;

  // OCCUPANCY currents — the field directly gating. These are the drive; the prior only
  // breaks ties. `occupancy` is their total: when it falls to ~0 there is nothing to
  // introduce, develop, turn, or close, and the network has no attractor → the loop quiesces.
  let occupancy = 0;
  const drive = (op, amt) => { if (amt > 0) { currents[op] += amt; occupancy += amt; } };

  // introduce current — the NEXT unspent span (one at a time, not the whole remaining mass:
  // an introduce drive proportional to the total pool would swamp the develop and the field
  // would never get walked in order). The strongest uncovered span sets the drive.
  const nextSpanScore = ground
    .map((s, i) => ({ s, idx: s.idx ?? i }))
    .filter(({ idx }) => !cov.has(idx))
    .reduce((m, { s }) => Math.max(m, s.score || 0), 0);
  for (const o of NODE_OPS) drive(o, 1.8 * nextSpanScore);

  // develop current — the consumer. A trailing node not yet developed leaves a substrate the
  // develop consumes; once developed the substrate is gone and this drops (the oscillator).
  const last = units[units.length - 1];
  const lastIsUndevelopedNode = last && !last.selfOp && NODE_OPS.includes(last.move);
  if (lastIsUndevelopedNode) drive(EDGE_DEV, 2.2);

  // turn current — the field strain at the frontier drives REC (restructure the frame).
  const strain = field?.strainByCursor?.[units.length - 1] || 0;
  drive('REC', 3.0 * strain);

  // close current — in the land phase, with constituents fired, SYN pulls to a landing.
  if (phase === 'land' && cov.size >= 2) drive('SYN', 2.4);

  // resting potential — the prior, a SMALL tiebreaker (occupancy decides, the prior informs).
  // Added after `occupancy` is totalled so it never keeps a spent field from quiescing.
  if (prior) for (const [op, p] of prior) if (op in currents) currents[op] += 0.15 * Math.max(0, Math.log((p || 0) + 1e-6) + 7);

  const settled = relax(currents, { ...opts, alphabet });
  return { move: settled.winner, currents, activations: settled.activations, occupancy };
};
