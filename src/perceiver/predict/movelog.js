// EO: SYN·INS(Network,Field → Field,Network, Composing,Making) — the move-log, Phase 0
// Phase 0 — the move-log. The ordered sequence of moves the reader emits on a
// text, indexable by cursor, the substrate the predictor runs over.
//
// A MOVE is an operator firing with a Site and a Resolution — the triple the
// system already speaks (core/address.js). The reader emits moves from two
// registers as it reads, and the move-log is their honest union in reading order:
//
//   CONTENT (depicted)   what the reader perceives in the text — INS a figure,
//                        CON/SIG a relation, DEF a predicate, NUL a degenerate
//                        line, VOID an asserted absence. From doc.log, each event
//                        carrying the sentIdx it was read at.
//   ENACTED (cognition)  the reading's own act — DEF its frame's terms, EVA each
//                        particular against them, REC when the testing breaks the
//                        frame (core/enacted/loop.js). The DEF→EVA→…→REC cycle.
//
// Both map to a move symbol over a small alphabet via eoAddressOfEvent. The union
// is ordered by (cursor, register, generation): at each cursor the reader first
// perceives the line's content, then its cognition tests the frame. The result is
// a clean array you can index by position — move i, predict move i+1.
//
// VOID is carried as a distinguished symbol (a DEF to VOID, kind:'void') because
// the predictor must be able to predict the engine asserting absence, not only
// the nine transforming operators.

import { eoAddressOfEvent } from '../../core/index.js';
import { readingAt } from '../index.js';
import { createEnactedLoop } from '../../enactor/enact/index.js';

// The prediction alphabet: the nine operators plus VOID (the asserted absence).
// Ordered to read like the ACT face row by row, with VOID last as the refusal.
export const MOVE_ALPHABET = Object.freeze([
  'NUL', 'SEG', 'DEF', 'SIG', 'CON', 'EVA', 'INS', 'SYN', 'REC', 'VOID',
]);

const isVoid = (e) => e?.kind === 'void';
export const symbolOf = (e) => (isVoid(e) ? 'VOID' : e?.op);

// The enacted DEF–EVA–REC stream over a doc, single-layer for a clean cycle (one
// EVA per cursor, a DEF to open, a REC where the frame breaks). Rides the Bayesian
// γ-mass surprise the significance engine already runs (read/reading.js), with the
// band and thresholds calibrated CAUSALLY — fit from the surprises seen so far, so
// the scale that judges cursor c never sees the future (enact/index.js, §5).
//
// Steps one cursor at a time so it can capture the LIVE strain after each step —
// the running accumulator the structural prior rides (strain near threshold → a
// REC is licensed). Returns the event stream and the per-cursor frame state.
const enactedMoves = (doc, { layer = 'proposition', readings } = {}) => {
  const units = doc.units || doc.sentences || [];
  if (!units.length) return { events: [], stateByCursor: [] };
  const rs = readings || units.map((_, c) => readingAt(doc, c));
  const loop = createEnactedLoop({
    read: (c) => ({
      surprise: rs[c]?.bayes ?? 0,
      terms: rs[c]?.predicted?.figures || [],
      contrib: rs[c]?.bayesBy || null,
    }),
    layers: [layer],
    calibrate: { mode: 'causal' },
  });
  const stateByCursor = [];
  for (let c = 0; c < units.length; c++) {
    const before = loop.events.length;
    const threshold = loop.frameAt(layer)?.threshold ?? Infinity;
    loop.step(c);
    // The PEAK strain at this cursor — the value this cursor's evaluation produced,
    // BEFORE any REC reset zeroed it. This is the causal quantity the engine's own
    // break rule reads (strain ≥ threshold → REC), so the structural prior riding it
    // reproduces the cause of the break, not its aftermath: high on the breaking
    // cursor and climbing in the run-up, never the post-reset zero. When a REC fired,
    // the REC event carries that pre-reset sum; otherwise it is the live strain.
    const recEv = loop.events.slice(before).find(e => e.op === 'REC' && e.cursor === c);
    const strain = recEv ? recEv.strainSum : loop.strainAt(layer);
    stateByCursor[c] = {
      strain,
      threshold,
      ratio: Number.isFinite(threshold) && threshold > 0 ? strain / threshold : 0,
    };
  }
  return { events: loop.events, stateByCursor };
};

// A short, human-readable gloss of a move — what the panel and the dump print.
const describe = (e, register) => {
  if (register === 'enacted') {
    if (e.op === 'DEF') return `frame: ${(e.frame?.terms || []).slice(0, 3).join(', ') || '∅'}`;
    if (e.op === 'EVA') return `${e.verdict === 'strain' ? '−' : '+'} (surprise ${e.surprise ?? 0})`;
    if (e.op === 'REC') return `break along ${(e.alongAxis || []).slice(0, 2).join(', ') || 'frame'} (${e.trigger})`;
    return '';
  }
  if (isVoid(e)) return `${e.node || ''}/${e.rel || ''} absent`.trim();
  switch (e.op) {
    case 'INS': return `${e.label ?? e.id}`;
    case 'SYN': return `${e.from ?? '?'} → ${e.to ?? '?'}`;
    case 'CON':
    case 'SIG': return `${e.src} ${e.via || '—'} ${e.tgt}`;
    case 'DEF': return `${e.id}: ${e.value ?? e.key ?? ''}`.trim();
    case 'NUL': return `${e.kind || 'held'}${e.text ? `: ${String(e.text).slice(0, 24)}` : ''}`;
    case 'SEG': return `${e.kind || 'split'}`;
    case 'REC': return `${e.kind || 'rule'}: ${e.token ?? ''}`.trim();
    default: return '';
  }
};

// One move, with its address, its source register, its cursor, and a gloss.
const toMove = (e, register) => {
  const addr = eoAddressOfEvent(e) || {};
  return Object.freeze({
    op: symbolOf(e),                       // the alphabet symbol (VOID for a DEF-to-void)
    site: addr.site || null,               // (domain, grain)
    resolution: addr.resolution || null,   // (mode, grain)
    cursor: e.sentIdx ?? e.cursor ?? 0,     // the unit/sentence index this move was read at
    register,                              // 'content' | 'enacted'
    verdict: e.verdict || null,            // EVA: 'confirm' | 'strain'
    void: isVoid(e),
    label: describe(e, register),
    raw: e,
  });
};

const REGISTER_ORDER = { content: 0, enacted: 1 };

// Build the unified move-log for a doc. Returns the ordered moves (each with an
// index `i`, its position in the sequence — the cursor the scrubber walks), the
// alphabet, the per-unit readings (reused so callers don't recompute them), and
// `frameByCursor` — the structural state at each unit the structural prior reads
// (live strain vs threshold, the γ-mass surprise, whether a new figure entered,
// whether a frame broke there).
export const buildMoveLog = (doc, opts = {}) => {
  const units = doc.units || doc.sentences || [];
  const readings = opts.readings || units.map((_, c) => readingAt(doc, c));

  // CONTENT moves: every logged event read at a unit position. Events with no
  // sentIdx (the document-level convention RECs learned before reading) are not
  // tied to a cursor, so they are not part of the per-cursor move sequence.
  const content = doc.log.snapshot()
    .filter(e => Number.isInteger(e.sentIdx))
    .map((e, k) => ({ move: toMove(e, 'content'), cursor: e.sentIdx, seq: e.seq ?? k }));

  // ENACTED moves: the DEF–EVA–REC cognition stream + the live per-cursor strain.
  const { events: enactedEvents, stateByCursor } = enactedMoves(doc, { ...opts, readings });
  const enacted = enactedEvents
    .map((e, k) => ({ move: toMove(e, 'enacted'), cursor: e.cursor, seq: e.seq ?? k }));

  // Union, ordered by (cursor, register, generation). At each cursor the reader
  // perceives content first, then runs its cognition over the frame.
  const merged = [...content, ...enacted].sort((a, b) =>
    a.cursor - b.cursor ||
    REGISTER_ORDER[a.move.register] - REGISTER_ORDER[b.move.register] ||
    a.seq - b.seq);

  const moves = merged.map((m, i) => Object.freeze({ ...m.move, i }));

  // The structural state at each unit cursor — the fold the structural prior reads.
  const recCursors = new Set(enactedEvents.filter(e => e.op === 'REC').map(e => e.cursor));
  const frameByCursor = units.map((_, c) => {
    const r = readings[c] || {};
    const st = stateByCursor[c] || { strain: 0, threshold: Infinity, ratio: 0 };
    return Object.freeze({
      strain: round3(st.strain),
      threshold: round3(st.threshold),
      ratio: round3(Math.min(2, st.ratio || 0)),
      bayes: r.bayes ?? 0,
      surprisalBits: r.surprisalBits ?? 0,
      newFigure: (r.surprises || []).some(s => s.op === 'INS'),
      brokeHere: recCursors.has(c),
    });
  });

  return { moves, alphabet: MOVE_ALPHABET, readings, units, frameByCursor };
};

const round3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : x);

// A compact notation for a move, e.g. "EVA(Int,Fig)−" or "REC(Int,Pat)".
export const moveNotation = (m) => {
  if (!m) return '?';
  const s = m.site ? `${m.site.domain.slice(0, 3)},${m.resolution.grain.slice(0, 3)}` : '';
  const sign = m.op === 'EVA' && m.verdict ? (m.verdict === 'strain' ? '−' : '+') : '';
  return `${m.op}(${s})${sign}`;
};
