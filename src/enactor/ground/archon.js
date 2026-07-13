// EO: EVA·CON(Link,Network → Lens, Binding,Tracing) — the streaming source gate's archon
// The ARCHON — the magistrate the streaming boundary gate consults at each PERIOD: it admits a
// sentence to the record only when the sentence already sources (docs/archon-source-gate.md). It
// is the write-time twin of the post-hoc bind/veto: instead of writing freely and flagging what
// could not be cited, a sentence is admitted only when it already cites.
//
// A sentence is ADMITTED (sourced) only when EVERY proposition it asserts is
//   · GROUNDED in the document — the same figures stand in the same relation the memo holds
//     (classifyProvenance, provenance.js — MEANING, not lexical overlap), AND
//   · corroborated by at least `minWitnesses` DISTINCT witnessing spans — two different
//     sentences of the memo, not one lexical hit (witnessesForProps, reflect.js).
// Its citations are the union of those witnessing spans. A sentence that carries no proposition
// (a bare fragment / discourse marker) witnesses nothing, so the archon refuses it. A half-sourced
// sentence (one proposition meets the bar, another does not) is refused whole — a half-sourced
// sentence reads as fully sourced, so the archon drops the sentence, not just the proposition.
//
// "unique witness" = distinct source SPAN (sentIdx) by default — the within-document measure a
// single memo can meet (two of its sentences corroborate). Over a multi-source corpus, pass
// { byOrigin: true } to require distinct independent ROOT ORIGINS instead (the stronger,
// cross-source form reflectAnswer already names).
//
// Seat the archon ONCE per turn with buildArchon so the gate call site stays one argument; each
// sentence is then one classifyProvenance parse + one witness-table lookup, memoized per turn.

import { classifyProvenance } from './provenance.js';
import { witnessesForProps } from './reflect.js';

// the witnessing spans as sN citation tags, de-duplicated and ordered.
const citeOf = (spanIdxs) => [...new Set(spanIdxs)].sort((a, b) => a - b).map((i) => `s${i}`);

// archonReview(sentence, { doc, spanIdxs?, minWitnesses = 2, byOrigin = false })
//   → { sourced, citations: ["s3","s7"],
//       propositions: [{ subj, via, obj, grounded, spans, origins, spanIdxs, met }] }
export const archonReview = (sentence, { doc, spanIdxs = null, minWitnesses = 2, byOrigin = false } = {}) => {
  const text = String(sentence || '').trim();
  if (!text || !doc) return { sourced: false, citations: [], propositions: [] };
  // grounded-vs-void per proposition, over the document's own graph (coref intact). spanIdxs, when
  // supplied, restricts grounding to the sentences actually read; otherwise the whole memo grounds.
  const cls = classifyProvenance(text, spanIdxs ? { doc, spanIdxs } : { doc });
  const props = cls.propositions || [];
  if (!props.length) return { sourced: false, citations: [], propositions: [] };   // nothing to witness → refuse
  // Witness against the retrieved spans (spanIdxs) so every citation points at a passage the reader
  // has, and "≥2 witnesses" means two of the shown lines. Null spanIdxs → witness the whole document.
  const wit = witnessesForProps(doc, props, spanIdxs);
  const propositions = props.map((p, i) => {
    const w = wit[i] || { spanIdxs: [], spans: 0, origins: 0 };
    const grounded = p.grounding !== 'fabricated' && p.ground !== 'void';
    const count = byOrigin ? w.origins : w.spans;
    return {
      subj: p.subj, via: p.via, obj: p.obj ?? null,
      grounded, spans: w.spans, origins: w.origins, spanIdxs: w.spanIdxs,
      met: grounded && count >= minWitnesses,
    };
  });
  const sourced = propositions.every((p) => p.met);
  const citations = sourced ? citeOf(propositions.flatMap((p) => p.spanIdxs)) : [];
  return { sourced, citations, propositions };
};

// buildArchon(doc, spanIdxs, opts) → (sentence) => archonReview(...) result
// The per-turn magistrate the streaming gate calls once per sentence. The doc + options are bound so
// the call site is a single argument, and verdicts are memoized per (lowercased) sentence so a
// converge/continuation loop that re-draws a near-identical sentence pays the reading once.
export const buildArchon = (doc, spanIdxs = null, opts = {}) => {
  const cfg = { doc, spanIdxs, minWitnesses: opts.minWitnesses ?? 2, byOrigin: !!opts.byOrigin };
  const cache = new Map();
  return (sentence) => {
    const key = String(sentence || '').trim().toLowerCase();
    if (!key) return { sourced: false, citations: [], propositions: [] };
    let hit = cache.get(key);
    if (hit === undefined) { hit = archonReview(sentence, cfg); cache.set(key, hit); }
    return hit;
  };
};
