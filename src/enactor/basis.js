// EO: SEG·SYN(Field,Network → Network,Void, Dissecting,Composing) — surf → grounded basis
// enactor/basis.js — surf → grounded basis (§4).
//
// The DEF the enactor's gate holds (modality-blind; add-on 3 §1). A thin adapter
// over the surfer's result
// (read/surf.js: { stops, field, recCursors, … }) that emits the basis the gate
// measures each candidate proposition against:
//
//   groundedBasis = {
//     props:    [ { …prop, amplitude, idx, status } … ],   // what the document SAYS
//     void:     [ { target, idx, status:'void' } … ],      // absence AS a basis element
//     question: { targetProps }                            // what the question ASKS
//   }
//
// `props` are the propositions read at the surfer's STOPS — the cursors the
// field made it arrest on (read/surf.js). Each carries an `amplitude`: the
// Bayesian-surprise / strain at that stop (surf.field[idx].bayes), the figure
// mass that made it a stop, already computed and carried forward as the support
// weight (§4). A higher-amplitude stop is stronger ground.
//
// `void` is absence made first-class (§7): the surfer's NUL verdicts (the
// derived-null abstention it records when run with an alpha) and the question
// targets with no supported prop. Because void is a basis ELEMENT, abstention is
// something the measurement collapses TO, not a veto bolted on after.
//
// `question.targetProps` is the SECOND basis — the question parsed into the
// prop(s) it asks for (relevance), distinct from the finding (truth). The gate
// multiplies support by relevance so a true-but-irrelevant prop is held.

import { parseProps } from './props.js';
import { correspondProp } from './props.js';
import { projectGraph, typeOf } from '../core/index.js';

// Build the grounded basis from a surf result and its document. `surf` is the
// read/surf.js output (with a `field` carrying per-cursor bayes, and optionally
// per-cursor `verdict` when surfed with an alpha). `question` is the user's
// string; with no admission on the doc the target basis is empty and the gate's
// relevance factor degrades to neutral (documented in the gate).
export const buildBasis = (surf, doc, question, opts = {}) => {
  const units = doc?.units || doc?.sentences || [];
  const field = surf?.field || [];
  const bayesByIdx = new Map(field.map(f => [f.idx, f.bayes]));
  const verdictByIdx = new Map(field.map(f => [f.idx, f.verdict]));
  const stops = surf?.stops || [];
  const cursor = surf?.peak ?? stops[0] ?? 0;

  // The findings: every proposition read at a stop, tagged with the stop's
  // amplitude. Endpoints resolve through the document field at the surf peak —
  // the same cursor the fold's reading sat on, so the basis and the gate agree
  // on who each proposition is about.
  const props = [];
  for (const idx of stops) {
    const text = units[idx];
    if (text == null) continue;
    const amplitude = bayesByIdx.has(idx) ? bayesByIdx.get(idx) : 0;
    for (const p of parseProps(text, doc, cursor)) {
      props.push(Object.freeze({ ...p, idx, amplitude, status: 'support' }));
    }
  }

  // The second basis: the question parsed into the props it asks for. Resolved
  // through the same field so a question about "his sister" targets the same id
  // the finding props carry.
  const targetProps = parseProps(question, doc, cursor)
    .map(p => Object.freeze({ ...p, status: 'target' }));

  // The void basis (§7): the surfer's NUL cursors (a checked-and-empty stop is a
  // record, not a silence — read/surf.js), and any question target the findings
  // do not support (the dangerous on-question-but-unsupported gap, made an
  // explicit absence the gate can collapse to rather than invent across).
  const voidEls = [];
  for (const idx of stops) {
    if (verdictByIdx.get(idx) === 'NUL') voidEls.push(Object.freeze({ target: null, idx, status: 'void', from: 'surf-nul' }));
  }
  for (const t of targetProps) {
    if (!correspondProp(t, props)) {
      voidEls.push(Object.freeze({ target: t, idx: null, status: 'void', from: 'unsupported-target' }));
    }
  }

  // §4 — the RELATIONAL / ROLE atom. The basis held mass over entities, triples, and
  // predicates, but a kinship- or role-asserting reading (sister-of, transformed-into)
  // moved NOTHING: those edges had no basis element to correspond to, so a relational
  // proposition could neither ground nor be denied at the gate. This adds the TYPED
  // relation edges (kinship, role, change-of-state — typeOf != null) incident to the
  // stops as first-class basis elements, the grounded counterpart of the §4 edge-grounding
  // unlock. An untyped CON edge stays in the prop channel as before; only the typed
  // relations enter this atom, so the addition is additive and the existing fields are
  // untouched.
  const relations = [];
  if (doc?.log) {
    const graph = doc.projectGraph ? doc.projectGraph({ cursor }) : projectGraph(doc.log, { cursor });
    const stopSet = new Set(stops);
    for (const e of (graph.edges || [])) {
      const t = typeOf(e.via);
      if (!t) continue;                                                  // only typed relations
      if (e.sentIdx != null && stops.length && !stopSet.has(e.sentIdx)) continue;  // incident to a stop
      relations.push(Object.freeze({
        src: e.from, via: e.via, tgt: e.to, idx: e.sentIdx ?? null,
        type: t.type, status: 'relation',
      }));
    }
  }

  return Object.freeze({
    props: Object.freeze(props),
    void: Object.freeze(voidEls),
    relations: Object.freeze(relations),
    question: Object.freeze({ targetProps: Object.freeze(targetProps) }),
    cursor,
  });
};
