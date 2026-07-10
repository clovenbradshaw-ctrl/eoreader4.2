// EO: SYN·EVA(Field → Field, Composing,Binding) — grammatical encoding; clause aggregation
// realize.js — grammatical encoding: the surface step that joins clauses.
//
// The plan gives propositions; refer.js resolves each one's referring forms (pronoun vs
// name, by inverse coref) and renders it as a standalone clause "Subj verb obj." That is
// correct but choppy — English does not say "He woke. He saw his legs. He turned." It says
// "He woke, saw his legs, and turned." Aggregation is the standard NLG move that earns the
// difference: when consecutive clauses share a subject, drop the repeated subject and
// conjoin the predicates. That is ALL this stage claims to do — it is grammatical surface
// work, not a second act of meaning.
//
// What it deliberately does NOT do (the leash): it does not re-inflect verbs — the plan's
// verbs arrive already inflected from the reading (woke, saw, brought), and re-inflecting
// would corrupt them. It does not invent determiners or prepositions it cannot justify from
// the plan. It does not re-decide reference — refer.js already did that as the discourse
// unfolded, and collapsing an adjacent same-subject clause is exactly the repetition that
// reference would have pronominalised anyway, so the collapse is safe. Provenance and the
// me-ness/self line are passed through untouched.

import { writeReferring } from './refer.js';
import { createRule } from './eva.js';

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// How many predicates a compound may conjoin before a reader cannot hold it in one breath.
// Aggregation past this is the rule's failure mode (a run-on the read-back can't recover).
const CONJUNCT_CAP = 3;

// join a run of predicates the way English does: "a", "a and b", "a, b, and c".
const conjoin = (preds) => {
  if (preds.length === 1) return preds[0];
  if (preds.length === 2) return `${preds[0]} and ${preds[1]}`;
  return `${preds.slice(0, -1).join(', ')}, and ${preds[preds.length - 1]}`;
};

// realize(plan, opts) → { text, sentences, units, given, self }
//
// Runs writeReferring (so reference is resolved correctly), then groups the resolved units
// into sentences by maximal runs of the same subject, conjoining each run's predicates.
// `units`, `given`, `self` pass through unchanged — the provenance/self line is refer.js's.
export const realize = (plan, { gamma = 0.7, enactment = 'voice', given = null } = {}) => {
  const r = writeReferring(plan, { gamma, enactment, given });
  // Aggregation is a defeasible grammar rule too: join adjacent same-subject clauses only
  // while the compound stays readable. A run within the conjunct bound HOLDS; a run that
  // would overflow it BREAKS (split, and strain the rule); enough breaks DEFEAT aggregation
  // and the generator falls back to one clause per sentence — the safe surface.
  const aggRule = createRule();
  const sentences = [];
  let i = 0;
  while (i < r.units.length) {
    const head = r.units[i].parts;
    const preds = [predicate(head)];
    let j = i + 1;
    // extend the run while the next clause has the same subject AND refer.js chose to
    // pronominalise it (a fresh name signals the writer wanted it restated — don't absorb it).
    while (j < r.units.length && r.units[j].parts.subjId === head.subjId && r.units[j].subjForm === 'pronoun') {
      if (!aggRule.on || preds.length >= CONJUNCT_CAP) { aggRule.break(); break; }   // too long to hold → split
      preds.push(predicate(r.units[j].parts));
      j++;
    }
    if (preds.length > 1) aggRule.hold();    // a clean compound read back fine
    // a reduced-relative modifier attaches to the subject, once, before the predicate(s).
    sentences.push(`${cap(head.subj)}${head.relText || ''} ${conjoin(preds)}.`);
    i = j;
  }
  return { text: sentences.join(' '), sentences, units: r.units, given: r.given, self: r.self };
};

const predicate = (p) => `${p.verb}${p.obj ? ' ' + p.obj : ''}`;

// speak(plan, opts) — alias for the aggregated surface, the form callers usually want.
export const speak = realize;
