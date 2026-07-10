// EO: SEG·CON·INS(Field,Network → Network,Link, Dissecting,Binding,Making) — span->cell resolver (streaming answer §2)
// write/plan.js — the span→cell resolver: a surfer stop becomes a cursor cell.
// (The Streaming Answer §2, §7 Piece 1)
//
// The writer demo hand-specifies its cells; an answer must DERIVE them. The plan is
// not authored — it is read off the physics. `fold` (turn/stages.js) already runs
// the surfer over the retrieved subgraph and returns `surf = { stops, peak, focus,
// field, recCursors }`. The surfer steps down the Bayesian-surprise gradient and
// arrests where the reading was REWRITTEN, so its stops are exactly a beat order:
// EACH STOP IS ONE SENTENCE (§2). The same witness-does-not-decide rule the surfer
// obeys for navigation now obeys it for composition.
//
// `stopToCell` is the inverse of the reader's clause→event typing: take a stop and
// SELECT the graph edge to realise —
//   • the stop's focus figure              → the cell's SUBJECT (its integral name);
//   • the strongest edge leaving it within  → the cell's EDGE (A -> B : tends), its
//     the reach                               endpoints the Subject/Object slots;
//   • the edge's Resolution band            → the cell's BAND, so a void stop HEDGES
//                                             before it is written, never after (§3b);
//   • the spans the edge was read from       → the cell's grounded excerpts.
// A stop that carries no firm edge — pure significance with nothing to assert — is
// rendered as an ORIENTING beat (a free instruction), never forced into a claim
// (the §3b FIRM-ONLY law applied to the answer).
//
// This is the smallest new piece: it reads structures `fold` already computed.
// `figureSurface` (perceiver) already returns a referent's incident edges,
// coref-collapsed and WEIGHT-RANKED, in surface form (src/tgt labels, via, polarity,
// modality, idx) — so "the strongest edge leaving the figure" is read off it, not
// recomputed. The membrane (write/cursor.js) still asserts no hashId leaks.

import { projectGraph } from '../../core/index.js';
import { figureSurface } from '../../perceiver/index.js';

const norm = (s) => String(s ?? '').trim().toLowerCase();

// The plain relation label the talker may read on the edge — the verb, hyphenated,
// with a "not-" prefix for a negated bond so the sign cannot be smoothed away (the
// same conscience token the notes serializer carries). Never a code.
const relLabel = (via, polarity) => {
  const v = String(via ?? '').trim().replace(/[.!?]+$/, '').replace(/\s+/g, '-') || 'linked-to';
  return (polarity === '−' ? 'not-' : '') + v;
};

// surfToPlan — turn the surfer's stops into the ordered list of cursor cells (§2).
// Registers every document referent in the `fold` (head = its surface label) so the
// cursor can collapse identity per beat, then resolves one cell per stop. Skips a
// stop only when nothing — not even a focus figure — resolves there.
export const surfToPlan = (surf, doc, fold, opts = {}) => {
  if (!surf || !doc?.log) return [];
  const units = doc.units || doc.sentences || [];
  const graph = projectGraph(doc.log);
  const rep = graph.representative || ((id) => id);

  // Register every referent so its integral (the head = surface label) is available
  // to any beat that names it. Registration is not appearance — the loop appears a
  // referent when its beat fires (INS-by-appearance, §4).
  const labelToId = new Map();
  for (const [id, ent] of graph.entities) {
    fold.register(id, { head: ent.label || id });
    if (ent.label) labelToId.set(norm(ent.label), id);
  }

  // The reach the surfer measured (its field's index span) bounds "within the reach".
  const idxs = (surf.field || []).map(f => f.idx);
  const reach = idxs.length ? { lo: Math.min(...idxs), hi: Math.max(...idxs) } : { lo: -Infinity, hi: Infinity };

  // Claimed arrows, deduped across the plan: each stop is ONE sentence (§2), so a
  // beat never re-asserts an arrow an earlier beat already made. A stop whose only
  // leaving edge is already spent falls back to an orienting beat — still grounded
  // on the stop's own line, never a forced repeat.
  const claimed = new Set();
  const ctx = { surf, doc, graph, rep, units, labelToId, reach, focus: opts.focus || [], claimed };
  const cells = [];
  for (const stop of surf.stops || []) {
    const cell = stopToCell(stop, ctx);
    if (cell) cells.push(cell);
  }
  return cells;
};

// stopToCell — resolve one surfer stop to a cursor cell (§2). Returns null only when
// no subject figure resolves at the stop (an empty graph); otherwise a relation cell
// when a firm edge leaves the subject within the reach, or an orienting cell when it
// does not (pure significance, nothing to assert — never a forced claim).
export const stopToCell = (stop, ctx) => {
  const { surf, doc, graph, rep, units, labelToId, reach, focus, claimed } = ctx;
  const spent = claimed || new Set();

  // The stop's focus figure → the Subject. The surf field carries the warmest figure
  // per cursor as a LABEL; resolve it to a referent id (the graph's representative).
  const label = surf.field?.find(f => f.idx === stop)?.focus ?? surf.focus ?? null;
  let subjId = label != null ? (labelToId.get(norm(label)) ?? (graph.entities.has(label) ? label : null)) : null;
  if (subjId == null && focus.length) subjId = rep(focus[0]);          // the named referent, if any
  if (subjId == null) {                                                 // last resort: the warmest figure
    let best = null, mass = -1;
    for (const [id, ent] of graph.entities) if ((ent.sightings || 0) > mass) { mass = ent.sightings || 0; best = id; }
    subjId = best;
  }
  if (subjId == null) return null;
  subjId = rep(subjId);

  // The strongest edge LEAVING the subject within the reach (§2). figureSurface
  // returns the subject's incident bonds, coref-collapsed and weight-ranked; we keep
  // the ones where the subject is the source and the arrow is not already spent,
  // prefer the one read closest to the stop (its locus), and fall back to the
  // strongest unspent incident if none sits in reach.
  const arrowKey = (r) => `${subjId}|${r.via}|${rep(r.tgt.id)}`;
  const { relations } = figureSurface(doc, [subjId]);
  const leaving = relations.filter(r =>
    rep(r.src.id) === subjId && rep(r.tgt.id) !== subjId && !spent.has(arrowKey(r)));
  const inReach = leaving.filter(r => r.idx >= reach.lo && r.idx <= reach.hi);
  const pick = inReach.length
    ? inReach.slice().sort((a, b) => Math.abs(a.idx - stop) - Math.abs(b.idx - stop))[0]
    : (leaving[0] || null);
  if (pick) spent.add(arrowKey(pick));

  if (!pick) {
    // No edge leaves the subject — an orienting beat (establish the figure), never a
    // forced claim. The spans are the stop's own line.
    return Object.freeze({
      id: `s${stop}`, op: 'INS', args: [subjId], stop, kind: 'orient',
      res: 'firm', spans: spansAt(units, [stop]),
    });
  }

  const objId = rep(pick.tgt.id);
  // The edge's Resolution band (§3b): VOID when the document does not settle the
  // connection — a hedged/irrealis modality, or a carved absence (a graph VOID)
  // shadowing the subject. A firm negation stays FIRM (the "not-" rides on the edge
  // label, a real claim of absence), not a hedge.
  const shadowed = (graph.voids || []).some(v => rep(v.node) === subjId);
  const hedged = pick.modality && pick.modality !== 'realis';
  const res = shadowed || hedged ? 'void' : 'firm';

  return Object.freeze({
    id: `s${stop}`, op: 'CON', args: [subjId, objId], stop, kind: 'relation',
    edge: relLabel(pick.via, pick.polarity), via: pick.via, res,
    spans: spansAt(units, [pick.idx, stop]),
  });
};

// The grounded excerpts for a beat — the lines the edge and the stop were read from,
// deduped, verbatim, each carrying its real index so the witness and the binder can
// anchor (exafference, §2).
const spansAt = (units, idxs) => {
  const seen = new Set();
  const out = [];
  for (const idx of idxs) {
    if (seen.has(idx)) continue;
    seen.add(idx);
    const text = units[idx];
    if (text != null) out.push({ idx, text });
  }
  return out;
};
