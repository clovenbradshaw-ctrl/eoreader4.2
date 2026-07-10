// EO: SIG·EVA(Entity,Network → Kind, Binding,Tending) — gender inferred by reading, not a table
// Inferring gender by reading, not by table — teach it to fish.
//
// The parser resolves coreference WITHOUT a gender channel (by role + recency + distinctness,
// on purpose), so gender is not stored in the parse. But the EVIDENCE is in the reading: when
// a sentence's subject is a gendered pronoun, the parser has already RESOLVED it to an entity
// — the bond's `src`. So the pronoun's lexical gender is the gender of that resolved entity.
// We read gender off the parser's own subject resolution; the only closed fact we add is that
// he/she/they are gendered (a convention, the HOW, not any entity's content).
//
// We use SUBJECT pronouns only, because subject resolution is what the parser exposes as a
// bond `src`; object-pronoun resolution is not surfaced as an edge, so we do not guess it.
// Where the reading gives no such evidence for an entity, inferGenders returns nothing for it
// — and the referrer must then use the NAME, never fabricate "it". Evidence or silence.

const SUBJECT_PRONOUN = { he: 'm', she: 'f', they: 'p' };

export const inferGenders = (doc) => {
  const sentences = doc?.sentences || doc?.units || [];
  const events = typeof doc?.log?.snapshot === 'function' ? doc.log.snapshot() : (doc?.log?.events || []);

  const labelOf = new Map();
  const subjectAt = new Map();   // sentIdx → the entity the parser resolved as that bond's subject
  for (const e of events) {
    if (e.op === 'INS' && e.id != null && e.label && !labelOf.has(e.id)) labelOf.set(e.id, e.label);
    if ((e.op === 'CON' || e.op === 'SIG') && e.src != null && !subjectAt.has(e.sentIdx)) subjectAt.set(e.sentIdx, e.src);
  }

  const votes = new Map();   // entity id → { m, f, p }
  sentences.forEach((sent, i) => {
    const first = (String(typeof sent === 'string' ? sent : sent?.text || '').match(/^[A-Za-z]+/) || [''])[0].toLowerCase();
    const g = SUBJECT_PRONOUN[first];
    const src = subjectAt.get(i);
    if (!g || src == null) return;                 // not a pronoun subject, or no resolved bond here
    const v = votes.get(src) || { m: 0, f: 0, p: 0 }; v[g] += 1; votes.set(src, v);
  });

  const out = {};
  for (const [id, v] of votes) {
    const g = (['m', 'f', 'p']).sort((a, b) => v[b] - v[a])[0];
    const label = labelOf.get(id);
    if (label && v[g] > 0) out[label] = g;          // gender keyed by the entity's label, for speakConcept
  }
  return out;
};
