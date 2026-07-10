// EO: CON·SEG(Field,Network → Link, Binding,Dissecting) — plan->proposition resolver (§4.2)
// resolve — the Site face: plan→proposition, the operator HONORED (spec-planner.md §4.2).
//
// The predictor draws a move-TYPE ("next is an EVA"); a move-type with no content
// is exactly the open slot a small model confabulates into. So we resolve it to a
// concrete PROPOSITION before the talker ever sees it. The earlier cut drew the
// operator and then threw it away and grabbed the next salient uncovered span — so
// the predictor said EVA and the renderer got a CON, and the output read as a list
// of grounded sentences because that is what it was.
//
// This cut SELECTS an edge that realizes the arrested operator (the inverse of the
// reader's clause→event typing — the reader types a clause to a cell; the resolver
// takes a drawn cell and selects an edge to realize). The ground pool is the
// referent-and-relation supply in surface form; an optional `graph` (figureSurface
// shape) refines the edge choice. Each operator names a TRIAD and a STANCE, and the
// resolved proposition carries the operator it realized, its stance, and its
// resolution band — `void` for a VOID-site deposit (an operator on an empty
// address), `firm` otherwise. The band propagates so a synthesis over a void hedges
// by construction (spec-planner.md §2).
//
// Monotone in coverage by construction: every deposit but a SYN close removes one
// span from the uncovered set, so the supply is finite and `ground-exhausted` is a
// real stop — length is emergent, never a token target.

import { ceilingFor, FLOOR_TOKENS } from '../arc/index.js';

// The edge operators — the SELF register (spec-planner.md §4.2, docs/essay-backwards.md).
// Working backwards from a real essay: ~75% of its atoms introduce NO fresh external
// span. They operate on prior atoms — an EVA tests the last claim against the frame, a
// REC recasts a strained claim, a SYN closes over what fired, a NUL holds a degenerate
// line. These INHERIT the ground of the atoms they operate on (already-covered spans)
// and add no new coverage — the existing SYN-close mechanism, generalized to the other
// edge ops. That is what decouples essay length from span exhaustion: the node ops
// (DEF/INS/CON/SIG) spend the external pool; the edge ops develop what the pool bought.
export const EDGE_OPS = Object.freeze(new Set(['EVA', 'REC', 'SYN', 'NUL']));

// The stance each operator takes when it fires — the verb the proposition is built
// around. Read off the operator, handed to the prompt contract (§6) so the render
// is shaped by the move, never improvised.
export const STANCE = Object.freeze({
  CON:  'assert',       // bond a relation tied to a span (the workhorse grounded move)
  SIG:  'attribute',    // attribute a figure (a leaving edge)
  EVA:  'evaluate',     // test a particular against a term the frame asserted
  SYN:  'synthesize',   // close a holon over constituents that have fired
  REC:  'restructure',  // the strained frame and the figure that breaks it
  INS:  'instantiate',  // mint a figure where the field had one
  SEG:  'segment',      // mark a boundary
  DEF:  'define',       // set the terms (the orienting open)
  NUL:  'hold',         // register a degenerate line (assert almost nothing)
  VOID: 'hold-open',    // the void site: assert the absence, do not fill it
});

// Resolve `move` against the ground pool, honoring the operator. Returns the
// section-shaped object generateSection/bindAndVeto consume — enriched with the
// operator's `stance`, its resolution `band`, and a `closes` flag (a SYN that lands
// the arc) — or null when the ground is spent. `move` is preserved so the unit
// records the move-type it realized.
export const resolveProposition = ({ move = 'CON', ground = [], covered = new Set(), graph = null, units = [], selfRegister = false } = {}) => {
  const cov = covered instanceof Set ? covered : new Set(covered || []);
  const op = String(move || 'CON').toUpperCase();

  // SELF register (opt-in) — an edge op with prior atoms to operate on resolves
  // against the SELF, inheriting those atoms' ground and consuming no fresh span. It
  // is tried FIRST for an edge op; if there is no self-target (a SYN with <2 fired, a
  // NUL with no prior) it falls through to the external resolution below.
  if (selfRegister && EDGE_OPS.has(op) && units.length) {
    const self = resolveSelf(op, units, ground);
    if (self) return self;
  }

  // The ranked uncovered supply — the strongest unspent leaving edges first. Ties
  // keep input order, so a run is reproducible.
  const ranked = ground
    .map((s, idx) => ({ ...s, idx: s.idx ?? idx }))
    .filter(s => !cov.has(s.idx))
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  // The already-deposited constituents — what a SYN closes over, what an EVA tests
  // against. Preserves deposit order (the order they fired).
  const fired = ground
    .map((s, idx) => ({ ...s, idx: s.idx ?? idx }))
    .filter(s => cov.has(s.idx));

  switch (op) {
    case 'SYN':
      // SYN closes a holon over constituents that have ALREADY fired — it does not
      // consume a fresh span, it lands what the walk deposited. Legal only once
      // there is something to close over; otherwise there is nothing to synthesize
      // and it falls through to a fresh assertion.
      if (fired.length >= 2) return closeProposition(fired, op);
      return assertProposition(ranked[0], op, graph);

    case 'VOID':
      // The VOID site: an operator on an empty address. We still spend the nearest
      // span (monotone coverage) but assert the ABSENCE rather than fill it — band
      // `void`, so the floor and any later synthesis hedge by construction.
      if (!ranked[0]) return null;
      return voidProposition(ranked[0], op);

    case 'EVA':
      // EVA tests a fresh particular against a term the frame already set. The
      // particular is the next uncovered span; the term it is tested against is the
      // last fired constituent (carried as `against` for the prompt contract).
      if (!ranked[0]) return null;
      return evaluateProposition(ranked[0], fired[fired.length - 1] || null, op);

    default:
      // CON, SIG, INS, REC, DEF, SEG, NUL — each realizes over the strongest unspent
      // leaving edge, differing in stance (and so in how §6 shapes the render).
      if (!ranked[0]) return null;
      return assertProposition(ranked[0], op, graph);
  }
};

// A fresh assertion over the strongest unspent edge. `graph`, when given, lets a
// CON/SIG pick the strongest LEAVING edge by weight rather than by span score; the
// span it lands on is the edge's source line.
const assertProposition = (span, op, graph) => {
  if (!span) return null;
  const chosen = pickEdgeSpan(span, op, graph) || span;
  const mass = chosen.score || 0;
  return Object.freeze({
    move: op,
    stance: STANCE[op] || 'assert',
    band: 'firm',
    subClaim: subClaimOf(chosen),
    spans: [chosen],
    spanSet: [chosen.idx],
    against: null,
    closes: false,
    floor: FLOOR_TOKENS,
    ceiling: ceilingFor({ mass, spans: [chosen] }),
  });
};

// An evaluation — a particular tested against a prior term. The cited span is the
// particular; the prior term rides as `against` so the render frames it as a test,
// not a bare restatement.
const evaluateProposition = (span, againstSpan, op) => {
  const mass = span.score || 0;
  return Object.freeze({
    move: op,
    stance: STANCE.EVA,
    band: 'firm',
    subClaim: subClaimOf(span),
    spans: [span],
    spanSet: [span.idx],
    against: againstSpan ? subClaimOf(againstSpan) : null,
    closes: false,
    floor: FLOOR_TOKENS,
    ceiling: ceilingFor({ mass, spans: [span] }),
  });
};

// The closing synthesis — a holon over the fired constituents. It cites their spans
// (already covered, so it adds no new coverage) and `closes` the arc.
const closeProposition = (fired, op) => {
  const spans = fired.slice(0, 4);                 // the strongest few constituents
  const mass = spans.reduce((m, s) => m + (s.score || 0), 0);
  return Object.freeze({
    move: op,
    stance: STANCE.SYN,
    band: 'firm',
    subClaim: 'what these together show',
    spans,
    spanSet: spans.map(s => s.idx),
    against: null,
    closes: true,
    floor: FLOOR_TOKENS,
    ceiling: ceilingFor({ mass: mass / Math.max(1, spans.length), spans }),
  });
};

// A VOID-site deposit — the asserted absence. Band `void`; the sub-claim names the
// gap the document holds open rather than a fact it fixes.
const voidProposition = (span, op) => Object.freeze({
  move: op,
  stance: STANCE.VOID,
  band: 'void',
  subClaim: `whether ${subClaimOf(span)}`,
  spans: [span],
  spanSet: [span.idx],
  against: null,
  closes: false,
  floor: FLOOR_TOKENS,
  ceiling: ceilingFor({ mass: span.score || 0, spans: [span] }),
});

// With a graph in hand, a CON/SIG picks the strongest LEAVING edge by weight and
// lands on the line that carries it. The graph is the figureSurface shape:
// { relations: [{ via, tgt, weight, idx }] } keyed off the span's referent. Absent
// or empty → the span itself (the no-graph path the loop and tests exercise).
const pickEdgeSpan = (span, op, graph) => {
  if (!graph || (op !== 'CON' && op !== 'SIG')) return null;
  const rels = (graph.relations || graph.edges || [])
    .filter(e => Number.isInteger(e.idx))
    .sort((a, b) => (b.weight || 0) - (a.weight || 0));
  const edge = rels[0];
  if (!edge) return null;
  return { idx: edge.idx, score: edge.weight ?? span.score ?? 0,
           text: edge.text || span.text || '' };
};

// The sub-claim is the span's own text, trimmed to a topic hint — it stands in for
// the raw question so the unit speaks the turn's language, grounded on this one span.
const subClaimOf = (span) => {
  const t = String(span?.text || '').replace(/\s+/g, ' ').trim();
  return t.length <= 120 ? t : t.slice(0, 120).replace(/\s+\S*$/, '') + '…';
};

// ── The SELF register: resolve an edge op against prior atoms ─────────────────

// Resolve an edge op against the SELF — the accepted units so far — inheriting the
// ground of the atoms it operates on. Returns a self-op proposition (selfOp:true,
// spanSet already covered) or null when there is no self-target for this op.
const resolveSelf = (op, units, ground) => {
  const byIdx = new Map(ground.map((s, i) => [s.idx ?? i, { ...s, idx: s.idx ?? i }]));
  const spansOf = (u) => (u?.sources || []).map(i => byIdx.get(i)).filter(Boolean);
  const last = units[units.length - 1];
  // The frame the essay opened with — the first term-setting atom, the thing an EVA
  // tests against and a REC recasts. Falls back to the first atom.
  const frame = units.find(u => u.move === 'DEF' || u.move === 'INS') || units[0];

  switch (op) {
    case 'EVA': {
      // Test the last claim against the frame the opening set.
      const spans = spansOf(last);
      if (!spans.length) return null;
      return selfProposition({ op, stance: STANCE.EVA, subClaim: last.subClaim,
        against: frame && frame !== last ? frame.subClaim : null, spans });
    }
    case 'REC': {
      // Recast the most-strained atom (lowest bound fraction — the weld) in light of
      // the frame. The strain that a drifting atom raised is what a REC turns on.
      const strained = [...units].sort((a, b) => (a.boundFraction ?? 1) - (b.boundFraction ?? 1))[0] || last;
      const spans = spansOf(strained).length ? spansOf(strained) : spansOf(last);
      if (!spans.length) return null;
      return selfProposition({ op, stance: STANCE.REC, subClaim: strained.subClaim,
        against: frame && frame !== strained ? frame.subClaim : null, spans, recast: true });
    }
    case 'SYN': {
      // Close over the atoms that have fired, inheriting the union of their spans. This
      // is the existing SYN-close, but over UNITS (the self) rather than ground spans.
      if (units.length < 2) return null;
      const uniq = dedupeSpans(units.flatMap(spansOf)).slice(0, 4);
      if (uniq.length < 2) return null;
      return selfProposition({ op, stance: STANCE.SYN, subClaim: 'what these together show',
        spans: uniq, closes: true });
    }
    case 'NUL': {
      // A degenerate holding line over the last atom — register it, add nothing.
      const spans = spansOf(last);
      if (!spans.length) return null;
      return selfProposition({ op, stance: STANCE.NUL, subClaim: last.subClaim, spans, nul: true });
    }
    default:
      return null;
  }
};

// Build a self-op proposition. Its spans are INHERITED (already covered), so its
// spanSet adds no new coverage — the loop's monotone-coverage invariant holds and
// external saturation is not advanced by a self-op. band is firm: the material is
// already witnessed, since it can only reference what a prior atom already bound.
const selfProposition = ({ op, stance, subClaim, against = null, spans, closes = false, recast = false, nul = false }) => {
  const mass = spans.reduce((m, s) => m + (s.score || 0), 0) / Math.max(1, spans.length);
  return Object.freeze({
    move: op,
    stance,
    band: 'firm',
    selfOp: true,
    subClaim,
    spans,
    spanSet: spans.map(s => s.idx),
    against,
    closes,
    recast,
    nul,
    floor: FLOOR_TOKENS,
    ceiling: ceilingFor({ mass, spans }),
  });
};

// Dedupe inherited spans by idx, preserving first-seen order (deposit order).
const dedupeSpans = (spans) => {
  const seen = new Set();
  const out = [];
  for (const s of spans) { if (s && !seen.has(s.idx)) { seen.add(s.idx); out.push(s); } }
  return out;
};
