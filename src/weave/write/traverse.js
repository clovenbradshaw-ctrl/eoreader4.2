// EO: SEG·CON·SYN(Network → Field,Link, Composing,Tracing,Unraveling) — concept -> traverse -> words
// Concept → traversal → words. The generation direction, from the top.
//
// You do not write word-first. You hold the concept IMAGISTICALLY — the activated
// relation graph the reading constituted, a scene of entities and the relations between
// them — and you TRAVERSE that graph to find what to say, lexicalising each step as you
// go. The traversal order is the order of saying, and it comes from the CONCEPT (the
// graph's own structure and activation), not from the source text's order. Each step is
// realised by writing-as-reading-backwards (refer.js): the surface form is chosen so the
// reader's coref field resolves it back to the intended entity.
//
// This is the demonstrable KERNEL of the Enacted Writer holon (fold/folds/scheduler/
// witness), which is the production path with the full nested-instrument theory of mind
// and the streaming surface. Here: take a held graph, walk it, speak it — with the
// referring rules and the me-ness/self line active (refer.js).

import { writeReferring } from './refer.js';
import { realize } from './realize.js';

// conceptToPlan — traverse the held relation graph into an ordered proposition plan.
//
// Two knobs make the SAME graph yield different tellings — the honest form of novelty (the
// generator recombines and re-frames; it never fabricates a fact the graph does not hold):
//   cursor  the entity in focus — say only what it touches (its local subgraph). Moving the
//           cursor re-centres the telling on a different participant.
//   frame   the lens on the relations — a relType bucket (or set, or predicate). Say only the
//           bonds that fall under it, so the same scene told "through perception" and "through
//           motion" are different texts. The frame is the active reading lens, run forward.
// Both are SELECTION (what to say); the arrow of time still fixes ORDER (when). They compose.
export const conceptToPlan = (doc, { genders = {}, max = 12, minCoupling = 0, cursor = null, frame = null } = {}) => {
  const events = typeof doc?.log?.snapshot === 'function' ? doc.log.snapshot() : (doc?.log?.events || []);
  const label = new Map();
  for (const e of events) if (e.op === 'INS' && e.id != null && !label.has(e.id)) label.set(e.id, e.label);
  const L = (id) => label.get(id) ?? id;
  const G = (id) => genders[L(id)] ?? genders[id] ?? 'n';

  // resolve the cursor (a label or an id) to an entity id, and build the frame predicate.
  // Match by id, then exact label, then a NAME WORD it contains ("Gregor" → "Gregor Samsa"),
  // so a cursor on a given name finds the merged full-name entity.
  const resolveCursor = () => {
    if (cursor == null) return null;
    if (label.has(cursor)) return cursor;
    const cl = String(cursor).toLowerCase();
    for (const [id, lab] of label) if (String(lab).toLowerCase() === cl) return id;
    for (const [id, lab] of label) if (String(lab).toLowerCase().split(/\s+/).includes(cl)) return id;
    return cursor;
  };
  const cursorId = resolveCursor();
  const inFrame = frame == null ? () => true
    : typeof frame === 'function' ? frame
    : (Array.isArray(frame) ? (e) => frame.includes(e.relType) : (e) => e.relType === frame);
  const onCursor = cursorId == null ? () => true : (e) => e.src === cursorId || e.tgt === cursorId;

  // Honour bond-level REANALYSIS (reanalyze.js): a REC(kind:'reanalysis') in the log supersedes
  // a mis-bond and forms the corrected one. So a garden-path mis-bond is not spoken — in its
  // place we say the original verb (demoted to a co-predicate) and the orphaned verb as the
  // main predicate. With no reanalysis REC on the log this map is empty → unchanged.
  const superseded = new Map();   // "src|via|tgt" → { demotedVia, formed:{src,via} }
  for (const e of events) {
    if (e.op === 'REC' && e.kind === 'reanalysis' && e.supersedes && e.forms)
      superseded.set(`${e.supersedes.src}|${e.supersedes.via}|${e.supersedes.tgt}`, { demotedVia: e.supersedes.via, formed: e.forms });
  }

  // coupling rides on `w` for a sub-unit (held-weak) bond and is absent on a firm one — the
  // same convention linkInventory reads (firm → 1). `minCoupling` lets the generator SPEAK
  // ONLY WHAT IT HOLDS: with a floor, a merely-glimpsed relation is not said. Default 0
  // speaks everything (byte-identical), so the floor is opt-in.
  // The order of saying follows the ARROW OF TIME — the order the bonds were constituted as
  // the reading proceeded (the log's own order, sentIdx then append order). That order is
  // not the surface being replayed; it is the concept's temporal/dependency structure, and
  // it is essential: it is what coref runs on (a referent is introduced before it is leaned
  // on), so honouring it in the retelling keeps every pronoun resolvable in the SAID order
  // too. Coherence is not a reordering — it is realised by `realize` aggregating ADJACENT
  // same-subject acts, which only holds when the order is already temporal. A salience sort
  // would break both the time line and the reference line, so we do not sort by coupling.
  const plan = [];
  for (const e of events) {
    if (!((e.op === 'CON' || e.op === 'SIG') && e.via && e.src != null)) continue;
    const coupling = e.coupling != null ? e.coupling : (e.w != null ? e.w : 1);
    if (coupling < minCoupling) continue;
    if (!inFrame(e) || !onCursor(e)) continue;            // cursor + frame select WHAT is said
    const sup = superseded.get(`${e.src}|${e.via}|${e.tgt}`);
    if (sup) {
      // the garden path resolves into a reduced relative: the orphaned verb is the MAIN
      // predicate, the original verb a relative-clause MODIFIER of the subject — "Beauty, who
      // ran, fell." Which bond subordinates is the REC's `demoted` tag (measured), not a rule.
      plan.push({ subj: { id: sup.formed.src, gender: G(sup.formed.src), name: L(sup.formed.src) },
        verb: sup.formed.via, relative: { verb: sup.demotedVia } });
      if (plan.length >= max) break;
      continue;
    }
    const objIsEntity = label.has(e.tgt);
    plan.push({
      subj: { id: e.src, gender: G(e.src), name: L(e.src) },
      verb: e.via,
      obj: objIsEntity ? { id: e.tgt, gender: G(e.tgt), name: L(e.tgt) } : L(e.tgt),
    });
    if (plan.length >= max) break;
  }
  return plan;
};

// speakConcept — the whole arc: hold the graph as concept, traverse it, find the words,
// and realise the surface (clause aggregation). Returns the realized result (aggregated
// text + the choppy per-clause units + per-unit provenance + the read-back self), so the
// generated saying is self-authored (me-ness) and its pronouns resolve back to the concept
// (validated by reading forward). Pass { aggregate:false } for the unjoined clause stream.
export const speakConcept = (doc, { genders = {}, max = 12, gamma = 0.7, enactment = 'voice', aggregate = true, minCoupling = 0, cursor = null, frame = null } = {}) => {
  const plan = conceptToPlan(doc, { genders, max, minCoupling, cursor, frame });
  const render = aggregate ? realize : writeReferring;
  return { plan, ...render(plan, { gamma, enactment, given: doc }) };
};
