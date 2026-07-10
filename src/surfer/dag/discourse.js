// EO: CON·SYN(Field,Link → Network, Tracing,Composing) — cursor 1 — discourse DAG
// Cursor (1) — the discourse DAG: the flow of content WITHIN THE DOCUMENT ITSELF.
//
// This is the first of the two cursors. It reads how the DOCUMENT moves — its own argument,
// in its own order — not the world it describes. Two things make it a DAG:
//
//   • the SPINE — the document's natural sections in reading order (flow/sectionize: runs of a
//     dominant operator, the INS↔SEG alternation, bounded by NUL births — the part boundaries
//     the text articulates for itself). Reading order is acyclic, so section→section is a DAG.
//   • the LINKS — the discourse relations the document draws between its own propositions: the
//     inter-proposition CON links the parser emits under the total read (because/therefore →
//     'cause', although/whereas → 'contrast', if/unless → 'condition', when/after → 'sequence').
//     Each link is lifted to the sections its endpoints fall in, typed by the connective.
//
// This cursor is deliberately BLIND to the described world: a section that argues "the library
// cut crime" and a section that argues "no, a common cause did" are just two moves in the
// document's flow here. Whether either is TRUE, or even what causal graph each ASSERTS, is the
// second cursor's job (causal.js). Keeping them apart is the point: the shape of the argument
// is not the shape of the world, and conflating them is the collapse the whole holon prevents.

import { sectionize } from '../flow/index.js';

const CONNECTIVE_TYPE = Object.freeze({ cause: 'cause', contrast: 'contrast', condition: 'condition', sequence: 'sequence' });

// The document's OWN discourse connectives, read at the sentence grain — the rhetorical
// relations a document draws between its sentences, independent of whether the entities are
// admitted. A sentence-INITIAL connective links the PREVIOUS sentence to this one; an
// embedded one ("…, because …", "…, but …") is an intra-sentence relation. This is what
// makes the two cursors legible against each other: the SAME word "because" is a discourse
// 'reason' arc here (cursor 1) and a causal edge between world-nodes there (cursor 2). The
// arrow is in the narration; keeping it here is what stops it leaking into the world graph.
const DISCOURSE_MARKERS = Object.freeze({
  therefore: 'consequence', thus: 'consequence', hence: 'consequence', so: 'consequence',
  consequently: 'consequence', accordingly: 'consequence',
  but: 'contrast', however: 'contrast', although: 'contrast', though: 'contrast',
  whereas: 'contrast', yet: 'contrast', nonetheless: 'contrast', nevertheless: 'contrast', still: 'contrast',
  because: 'reason', since: 'reason',
  if: 'condition', unless: 'condition',
  meanwhile: 'sequence', afterward: 'sequence', later: 'sequence', then: 'sequence',
  moreover: 'elaboration', furthermore: 'elaboration', additionally: 'elaboration', also: 'elaboration',
});
const firstWord = (s) => (String(s || '').trim().match(/^[a-z]+/i) || [''])[0].toLowerCase();

// Read the sentence-grain discourse relations. Inter-sentence arcs (from a sentence-initial
// marker) plus intra-sentence relations (an embedded marker), each sourced to its sentence.
export const readDiscourseLinks = (sentences) => {
  const links = [];
  sentences.forEach((sent, i) => {
    const lead = firstWord(sent);
    if (i > 0 && DISCOURSE_MARKERS[lead]) {
      links.push(Object.freeze({ type: DISCOURSE_MARKERS[lead], connective: lead, from: i - 1, to: i, grain: 'inter' }));
    }
    // embedded markers (after the first word) — intra-sentence discourse moves.
    const body = ` ${sent.toLowerCase()} `;
    for (const [w, type] of Object.entries(DISCOURSE_MARKERS)) {
      if (w !== lead && body.includes(` ${w} `)) links.push(Object.freeze({ type, connective: w, at: i, grain: 'intra' }));
    }
  });
  return Object.freeze(links);
};

// Which section a sentence index falls in.
const sectionAt = (sections, sentIdx) => {
  for (let i = 0; i < sections.length; i++) if (sentIdx >= sections[i].lo && sentIdx <= sections[i].hi) return i;
  return -1;
};

// Build the discourse DAG from a parsed doc. Reads doc.sentences and doc.log (sectionize does
// the segmentation) plus the log's inter-proposition CON links. Returns nodes (sections),
// the spine (reading-order succession edges), and the typed discourse links between sections.
export const discourseDag = (doc, opts = {}) => {
  const { sections } = sectionize(doc, opts.segment || {});
  const nodes = sections.map((s, i) => Object.freeze({
    i, from: s.lo, to: s.hi, len: s.len, dominant: s.op, born: s.born,
    // a short label off the section's first sentence, for a readable rendering.
    label: (doc.sentences?.[s.lo] || '').slice(0, 80),
  }));

  // The spine: each section flows to the next. A NUL-born section opens a new part (the text
  // re-grounds), marked so a renderer can show the joints the document articulates for itself.
  const spine = [];
  for (let i = 0; i < nodes.length - 1; i++)
    spine.push(Object.freeze({ from: i, to: i + 1, kind: 'sequence', opensBornPart: !!nodes[i + 1].born }));

  // The links: the document's own inter-proposition discourse relations, lifted to sections.
  // Read from the log (the total read emits these as CON with linkKind:'inter-proposition' and
  // via ∈ {cause,contrast,condition,sequence}); each is sourced to the sentence it was read on.
  const links = [];
  const events = (doc.log?.events || doc.log?.snapshot?.() || []);
  for (const e of events) {
    if (e.op !== 'CON' || e.linkKind !== 'inter-proposition') continue;
    const type = CONNECTIVE_TYPE[e.via];
    if (!type) continue;
    const si = typeof e.sentIdx === 'number' ? e.sentIdx : -1;
    const sec = sectionAt(sections, si);
    links.push(Object.freeze({
      type, connective: e.connective || e.via, sentIdx: si, section: sec,
      // the reified proposition endpoints, kept so a reader can trace the discourse move.
      matrix: e.tgt, dependent: e.src,
      note: `The document draws a '${type}' relation between two of its own propositions here.`,
    }));
  }

  // The sentence-grain layer: every sentence a node, the discourse connectives between them
  // read directly (readDiscourseLinks) so the cursor is legible even on prose whose entities
  // are not admitted — and so the narration's own arrows are visible next to the world's.
  const sentenceNodes = (doc.sentences || []).map((t, i) => Object.freeze({
    i, text: t, section: sectionAt(sections, i),
  }));
  const discourseLinks = readDiscourseLinks(doc.sentences || []);

  return Object.freeze({
    kind: 'discourse-dag',
    cursor: 'within-doc',
    nodes: Object.freeze(nodes),
    spine: Object.freeze(spine),
    links: Object.freeze(links),
    sentenceNodes: Object.freeze(sentenceNodes),
    discourseLinks,
    note: 'The flow of content within the document — its argument in its own order. Blind to the described world (that is the asserted DAG). A floor on the discourse structure, sourced to the sentences the relations were read on.',
  });
};
