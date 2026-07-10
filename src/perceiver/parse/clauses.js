// EO: SEG(Field → Field, Dissecting) — clause segmentation (§8)
// Clause segmentation — the §8 carve-limit fix (the "SEG-first rework" relations.js
// flags in its own comment). A sentence is cut into clause spans on coordinating /
// subordinating boundaries, each carrying its offset back into the sentence.
// parseRelations then runs the subject→verb→object scan PER CLAUSE, not once per
// sentence, so a MID-sentence subject becomes a clause-initial subject and its bond
// finally fires ("Gregor woke, and Grete opened the door" → two subjects, two bonds).
//
// Mechanical and defeasible by construction (the headVerb "better silence" stance):
// a boundary is a token from the seed ledger, not a parse. A WRONG split yields a
// MISSING edge, never a false one — fail toward silence. Each clause keeps the
// sentence's sentIdx downstream, so provenance and γ-decay are unchanged.

// The boundary markers — the home for the language-specific tokens, seeded and
// injectable (the same shape relations.js uses for copula/modifier/speech). A marker
// is matched lowercased; the clause ENDS at the marker and the next clause begins
// AFTER it (the subordinate/coordinate subject follows the connective, so the
// connective belongs to neither clause). Comma-led coordinators (", and ") keep the
// cut from firing on a bare "and" inside a noun phrase ("salt and pepper"). The set
// is HIGH-PRECISION on purpose: a marker that DOUBLES as a preposition or a verb
// particle ("looks AFTER", "BEFORE noon", "SINCE Monday", "UNTIL dawn") is left out —
// it would shred a phrasal verb's object off its verb. Likewise the ambiguous " that "
// / " as " / " for ". A missed split only loses an edge; a wrong one scatters offsets
// and breaks a real bond — silence is the cheaper failure.
export const SEED_CLAUSE_BOUNDARY = Object.freeze([
  ', and ', ', but ', ', or ', ', nor ', ', so ', ', yet ',
  '; ',
  ' while ', ' when ', ' where ', ' because ', ' although ', ' though ', ' whereas ',
  ' unless ', ' who ', ' which ',
]);

// A comma-led clause whose next clause opens on a participle ("…, clutching the
// sheet, …") or a subject pronoun ("…, he turned …"). Split there too — but ONLY on
// those openers: a bare comma is an apposition as often as a clause, and splitting
// every comma would shred noun phrases. Capitalised pronoun openers only, matching
// leadingSubject's own pronoun gate.
const PARTICIPIAL = /,\s+(?=(?:[a-z]+ing\b|He\b|She\b|They\b|We\b|It\b|You\b))/g;

// Slice [from,to) of `s` into a clause span trimmed of surrounding whitespace, with
// `offset` pointing at the first KEPT character in `s` — so the SVO scanner's
// clause-relative offsets map back to the sentence by simple addition, and the
// argument-span SEG still walks to the verbatim text (§3).
const span = (s, from, to) => {
  const raw  = s.slice(from, to);
  const lead = raw.length - raw.replace(/^\s+/, '').length;
  const text = raw.slice(lead).replace(/\s+$/, '');
  return text ? { text, offset: from + lead } : null;
};

// The bare connective a boundary marker carries — ", and " → "and", " who " → "who".
// Reported on the clause the marker OPENS (as `opener`), so the relation parser can
// tell a coordinated continuation ("…, and walked off") from a relative clause
// ("…player who refuses…") whose subject is the antecedent, not the running subject.
const openerOf = (marker) => String(marker || '').replace(/[,;]/g, '').trim().toLowerCase() || null;

export const segmentClauses = (sentence, { boundaries = SEED_CLAUSE_BOUNDARY } = {}) => {
  const s = String(sentence || '');
  if (!s.trim()) return [];
  const lower = s.toLowerCase();

  // Cut points: { at } where the current clause ends (exclusive), { after } where
  // the next clause's text begins (past the marker), { opener } the marker's bare
  // connective (null for a participial cut, which consumes no connective).
  const cuts = [];
  for (const mk of boundaries) {
    let from = 0, i;
    while ((i = lower.indexOf(mk, from)) !== -1) {
      cuts.push({ at: i, after: i + mk.length, opener: openerOf(mk) });
      from = i + mk.length;
    }
  }
  let m;
  const re = new RegExp(PARTICIPIAL.source, 'g');
  while ((m = re.exec(s)) !== null) cuts.push({ at: m.index, after: m.index + m[0].length, opener: null });

  if (cuts.length === 0) {
    const whole = span(s, 0, s.length);
    return whole ? [{ ...whole, opener: null }] : [];
  }
  cuts.sort((a, b) => a.at - b.at);

  const spans = [];
  let start = 0;
  let opener = null;   // the connective that begins the clause now being collected
  for (const c of cuts) {
    if (c.at <= start) {                          // inside a consumed cut — the later
      if (c.after > start) { start = c.after; opener = c.opener; }  // marker leads the next clause
      continue;
    }
    const sp = span(s, start, c.at);
    if (sp) spans.push({ ...sp, opener });
    start = c.after;
    opener = c.opener;
  }
  const tail = span(s, start, s.length);
  if (tail) spans.push({ ...tail, opener });
  return spans;
};
