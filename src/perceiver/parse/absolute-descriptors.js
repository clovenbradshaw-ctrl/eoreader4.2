// EO: EVA·SEG(Field → Kind, Tracing) — the ownerless-descriptor scan
// absolute-descriptors.js — scanAbsoluteDescriptors, the OWNERLESS half of the descriptor
// intake. relations.js's scanDescriptors finds a role that belongs to someone ("his
// sister", "Gregor's sister"): a possessed epithet. An absolute definite description with
// no owner and no name ("the emperor", "the owner") matches neither of its patterns, so
// it's invisible to noteDescriptor / the individuation gate. This scan admits them, keyed
// on the HEAD noun so "the emperor" and a later bare "emperor" fold to one roleKey. `subj`
// (not preposition-fronted, in the clause head) is the agency signal the gate uses to split
// emanon (acts) from protogon (orbited). Apposition ("the owner, M. Morrel") → naming path.
//
// The optional second word ("the young man") is gated on a closed adjective list, not any
// lowercase word — without POS tagging, "the [word] [word]" can't otherwise tell a compound
// noun phrase from "the owner did" / "the marshal knew", where the second word is a verb.
// An unguarded match folds those verbs in as the roleKey (a real bug this list closes).
const DESC_ADJ = 'young|old|poor|dear|little|great|elder|younger|new|whole';
const ABS_DESC_RE = new RegExp(String.raw`\b[Tt]he\s+(?:(${DESC_ADJ})\s+)?([a-z]{3,})\b`, 'g');
const OBLIQUE_PREP = /\b(?:of|to|with|from|into|about|at|on|for|by|toward|towards|upon|near|against)\s+$/i;
export const scanAbsoluteDescriptors = (sentence) => {
  const s = String(sentence || ''), out = [];
  const re = new RegExp(ABS_DESC_RE.source, 'gi');
  let m;
  while ((m = re.exec(s)) !== null) {
    if (/^[,\s]+[A-Z][a-z]/.test(s.slice(m.index + m[0].length))) continue; // apposition → naming path
    const head = m[2].toLowerCase();
    const phrase = 'the ' + (m[1] ? m[1].toLowerCase() + ' ' : '') + head;
    const subj = !OBLIQUE_PREP.test(s.slice(0, m.index)) && (m.index / Math.max(1, s.length)) < 0.55;
    out.push({ roleKey: head, phrase, subj, index: m.index });
  }
  return out;
};
