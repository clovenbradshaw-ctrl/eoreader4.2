// EO: CON·SYN·EVA(Link,Network → Network,Lens, Tracing,Composing) — asserted/corpus DAG, barrel
// The DAG holon — extract a DAG from a corpus, with two cursors.
//
// (1) discourseDag — the flow of content WITHIN the document itself (discourse.js).
// (2) assertedDag  — the DAG of the content being described qua itself: the causal graph each
//     source IMPLICITLY ASSERTS, as READ by the reader, laid side by side and sourced.
//
// THE BOUNDARY, which is the whole spine. A causal effect is a counterfactual and does not live
// in a corpus. So this holon NEVER produces "X causes Y". It produces, at three guarded removes:
//     the reader READS a passage  →  as proposing that a source CLAIMS  →  X causes Y.
// `claim-src` bars the collapse into fact; `reading:true` + readerConfidence bar the collapse
// into "the source settled it"; and there is deliberately NO method that returns an effect size
// or upgrades a proposed stance. The value on a causal question is not the truth — it is
// stripping the false confidence off the claim and showing what would have to be true, and is
// not shown, for it to hold.
//
// TWO CONSTRAINTS keep it honest (and they are enforced, not just promised):
//   • FLOOR, not ceiling. It proposes the space of stories the CORPUS tells, not the space of
//     possible stories. It can miss a confounder no source named. `floor:true` says so.
//   • WITNESS-FIRST. Every node, edge, confounder, mechanism, and NUL traces to the passage
//     that proposed it. Nothing is invented; the worst failure is inventing a cause.

import { readCausalClaims } from './causal.js';
import { confounders, reversePairs, mechanisms, constructConcerns } from './complexity.js';
import { classifyAbsence, absenceCensus, ABSENCE } from './nul.js';
import { discourseDag } from './discourse.js';

export { discourseDag } from './discourse.js';
export { readCausalClaims } from './causal.js';
export { mountDagSurface } from './surface.js';
export { proposeStance, STANCES } from './stance.js';
export { classifyAbsence, absenceCensus, ABSENCE } from './nul.js';
export { confounders, reversePairs, mechanisms, constructConcerns } from './complexity.js';

// Normalize input to a list of sources. Accepts one doc or an array of docs (a corpus).
const asSources = (input) => {
  const arr = Array.isArray(input) ? input : [input];
  return arr.filter(Boolean).map((doc, i) => ({ docId: doc.docId || `doc${i}`, doc }));
};

// Fold a list of readings (claims) into the node/edge graph. Every claim is KEPT: an edge
// carries the full multiset of proposed stances, each sourced. Stance is NEVER collapsed to a
// single value — an accidental reading and an essential reading of the same edge remain two
// distinct readings side by side, because upgrading one to the other needs a design, not a fold.
const foldGraph = (claims) => {
  const nodeMap = new Map();     // key → { key, labels:Set, qualifiedBy:[{q,docId}], sources:Set }
  const noteNode = (key, label, quals, docId) => {
    let n = nodeMap.get(key);
    if (!n) nodeMap.set(key, n = { key, labels: new Set(), qualifiedBy: [], sources: new Set() });
    if (label) n.labels.add(label);
    n.sources.add(docId);
    for (const q of quals || []) n.qualifiedBy.push({ q, docId });
  };
  const edgeMap = new Map();     // "from→to" → { from, to, claims:[] }
  for (const c of claims) {
    noteNode(c.cause, c.causeLabel, c.causeQualifiers, c.src.docId);
    noteNode(c.effect, c.effectLabel, c.effectQualifiers, c.src.docId);
    const k = `${c.cause}→${c.effect}`;
    let e = edgeMap.get(k);
    if (!e) edgeMap.set(k, e = { from: c.cause, to: c.effect, claims: [] });
    e.claims.push(c);
  }
  const nodes = [...nodeMap.values()].map((n) => Object.freeze({
    key: n.key, labels: Object.freeze([...n.labels]), qualifiedBy: Object.freeze(n.qualifiedBy),
    sources: Object.freeze([...n.sources]),
  }));
  // Per edge: the stance TALLY (how many readings proposed each), the source set, and the
  // polarity split — never a single winning stance.
  const edges = [...edgeMap.values()].map((e) => {
    const byStance = { accidental: 0, essential: 0, generative: 0 };
    const sources = new Set();
    let positive = 0, nullc = 0;
    for (const c of e.claims) {
      byStance[c.stance] = (byStance[c.stance] || 0) + 1;
      sources.add(c.src.docId);
      if (c.polarity === '−') nullc++; else positive++;
    }
    return Object.freeze({
      from: e.from, to: e.to,
      claims: Object.freeze(e.claims),
      stanceTally: Object.freeze(byStance),
      // the strongest stance ANY reading proposed — reported for display, but the tally is the
      // truth; this is never used to overwrite the weaker readings (they stay in `claims`).
      strongestProposed: byStance.generative ? 'generative' : byStance.essential ? 'essential' : byStance.accidental ? 'accidental' : null,
      sources: Object.freeze([...sources]),
      polarity: Object.freeze({ positive, null: nullc }),
      contested: sources.size > 1 && (byStance.accidental > 0) && (byStance.essential + byStance.generative > 0),
    });
  });
  return { nodes, edges };
};

// The asserted DAG — cursor (2). Build the causal graph the corpus's READINGS propose, attach
// the four complexities, and keep it explicitly a set of readings, never a set of facts.
export const assertedDag = (input, opts = {}) => {
  const sources = asSources(input);
  const claims = sources.flatMap((s) => readCausalClaims(s.doc, { docId: s.docId }));
  const { nodes, edges } = foldGraph(claims);
  return Object.freeze({
    kind: 'asserted-dag',
    cursor: 'described-world',
    reading: true,                 // this is what the reader reads the sources as proposing.
    floor: true,                   // the space of stories the CORPUS tells, not of all stories.
    sources: Object.freeze(sources.map((s) => s.docId)),
    nodes, edges,
    // the four complexities — surfaced and sourced, never removed (complexity.js).
    complexities: Object.freeze({
      confounding: confounders(edges),
      reverse: reversePairs(edges),
      mechanism: mechanisms(edges, opts.mechanism),
      construct: constructConcerns(nodes),
    }),
    note: 'The causal DAG the corpus is READ as asserting — a reading of claims, not facts. No effect size is produced or producible from text. A floor on the causal structure the corpus states.',
  });
};

// The corpus DAG — cursor (2) laid out for adjudication: the union graph PLUS each source's own
// asserted sub-DAG side by side, PLUS the structural disagreements between them. Making both
// graphs explicit is what turns a vague dispute ("libraries cut crime" / "no they don't") into
// a structural one you can actually adjudicate — a city report asserting a direct edge with no
// confounders, a critic asserting a common cause with no direct edge.
export const corpusDag = (input, opts = {}) => {
  const sources = asSources(input);
  const union = assertedDag(sources.map((s) => s.doc), opts);
  const perSource = sources.map((s) => {
    const d = assertedDag(s.doc, opts);
    return Object.freeze({ docId: s.docId, edges: d.edges.map((e) => `${e.from}→${e.to}`), dag: d });
  });

  // Disagreements: an edge some sources assert and others contradict — by asserting the reverse,
  // by asserting only a common cause (a confounder present, direct edge absent for that source),
  // or by measuring a null where another measured an effect.
  const disagreements = [];
  for (const e of union.edges) {
    const asserters = new Set(e.sources);
    const others = sources.map((s) => s.docId).filter((d) => !asserters.has(d));
    const back = union.edges.find((x) => x.from === e.to && x.to === e.from);
    const confounded = union.complexities.confounding.filter((c) => c.edge === `${e.from}→${e.to}`);
    if ((others.length && (confounded.length || back)) || (e.polarity.positive > 0 && e.polarity.null > 0)) {
      disagreements.push(Object.freeze({
        edge: `${e.from}→${e.to}`,
        assertedBy: Object.freeze([...asserters]),
        reverseAssertedBy: back ? Object.freeze(back.sources) : null,
        confounderProposedBy: Object.freeze(confounded.map((c) => c.confounder)),
        polaritySplit: e.polarity,
      }));
    }
  }

  return Object.freeze({
    kind: 'corpus-dag',
    union,
    perSource: Object.freeze(perSource),
    disagreements: Object.freeze(disagreements),
    note: 'Each source asserts a DAG; laid side by side and sourced, a dispute becomes a structural disagreement you can adjudicate.',
  });
};

// Pearl's question, made concrete: for each structural disagreement, what evidence would
// DISTINGUISH the competing graphs — and does the corpus contain it, or is it silent? The tool
// cannot run the test (that is a design, outside the text); it can state the test and report
// whether the corpus is silent on it. That silence is itself the finding.
export const distinguishingEvidence = (corpus) => {
  const c = corpus.kind === 'corpus-dag' ? corpus : corpusDag(corpus);
  const union = c.union;
  return Object.freeze(c.disagreements.map((d) => {
    const [from, to] = d.edge.split('→');
    const tests = [];
    for (const z of d.confounderProposedBy) {
      const absence = classifyAbsence(union.edges, from, to);
      tests.push(Object.freeze({
        question: `Does the ${from}→${to} association survive controlling for '${z}'? (direct-edge graph predicts yes; common-cause graph predicts no.)`,
        corpusHas: false,   // the corpus states graphs, not intervention data — it cannot answer this
        corpusStatus: absence.type,
      }));
    }
    if (d.reverseAssertedBy)
      tests.push(Object.freeze({
        question: `Which precedes which — does '${from}' change before '${to}', or the reverse? (a temporal/design question the corpus asserts both ways and cannot settle.)`,
        corpusHas: false,
      }));
    if (d.polaritySplit.positive > 0 && d.polaritySplit.null > 0)
      tests.push(Object.freeze({
        question: `Two readings disagree on whether ${from}→${to} has an effect at all — are they measuring the same construct '${to}'? (see construct concerns.)`,
        corpusHas: union.complexities.construct.some((k) => k.node === to),
      }));
    return Object.freeze({ edge: d.edge, tests: Object.freeze(tests) });
  }));
};

// The one-call convenience: both cursors over one doc (or a corpus), for a caller who wants the
// whole reading in one object. Explicitly two SEPARATE graphs — the shape of the argument and
// the shape of the described world are never merged.
export const readDags = (input, opts = {}) => {
  const first = Array.isArray(input) ? input[0] : input;
  return Object.freeze({
    discourse: first ? discourseDag(first, opts) : null,   // cursor (1): within-doc, per document
    asserted: assertedDag(input, opts),                    // cursor (2): described-world, over the corpus
  });
};
