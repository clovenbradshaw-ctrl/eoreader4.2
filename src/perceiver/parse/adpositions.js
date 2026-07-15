// EO: REC(Field → Kind, Composing) — adposition induction (the setting register, learned)
// WHICH WORDS MARK THE WHERE? The grain reader's SETTING rule (grain.js) needs the adposition
// register — the words that put a name in oblique position ("in London", "в Москве"). English is
// seeded in the conventions ledger; every other language would be a table to hardcode, which is
// exactly what this system refuses. So the register is INDUCED, from the document's own
// statistics, by three signatures an adposition carries in any cased language:
//
//   1. it PRECEDES names, often ("в Москве", "у Ростовых") — a name-governing word;
//   2. ASYMMETRICALLY — a name rarely stands right BEFORE it. This is what a conjunction fails:
//      "Наташа и Пьер" puts a name on both sides of и, so и is joining likes, not governing;
//   3. and the names it governs are OBLIQUE — not the document's nominative forms. This is the
//      declension machinery corroborating (entities.js subjSight → nominativeForms): a Russian
//      preposition governs a case (в МосквЕ, never в МосквА), while "но Пьер" — a clause opener
//      that also precedes names asymmetrically — is followed by SUBJECTS, nominatives, and dies
//      on this test. In an uninflected language every name is its own oblique (nominatives holds
//      only the true subjects), so the test degrades gracefully rather than blocking;
//   4. it is a PROCLITIC — it cannot stand clause-final. Measured on Война и мир: в/на/к/с/при
//      end a clause ≤0.8% of the time; the false governors the first three tests admit — графа,
//      руку, вечер (a title, an object, a time noun that happen to precede names) — end clauses
//      32–81% of the time. The cleanest split in the data;
//   5. and it is NOT name-specialized: an adposition governs mostly COMMON nouns (в комнату, в
//      это) — names are a small fraction of its company — while a TITLE exists precisely to
//      precede names (графа Безухова): name-heavy company marks a moon, not a governor. Applied
//      only with enough evidence (a rare word in a small text is "specialized" by accident).
//
// The induced tokens are learned into the conventions ledger ('preposition' — seed ∪ learned,
// defeasible like every convention), so the same isPreposition every organ reads now carries the
// document's own adpositions, and the setting grade lights up beyond English with no new table.

const TOKEN = /[\p{L}'’]+/gu;

// induceAdpositions(sentences, { names, nominatives, ... }) → [{ token, n, nameNext, oblique }]
//   names        the admitted single-token labels (the figures a governor could govern)
//   nominatives  the forms that behave as subjects (admission.nominativeForms())
//   minNames     the token must govern at least this many name sightings
//   maxPrevRate  names before it / names after it must stay below this (the conjunction filter)
//   minOblique   of the names it governs, at least this fraction must be oblique (non-nominative)
export const induceAdpositions = (sentences, {
  names, nominatives = new Set(),
  minNames = 3, maxPrevRate = 0.2, minOblique = 0.6,
  maxFinalRate = 0.1,       // a proclitic never ends a clause
  maxNameRate = 0.3,        // name-heavy company is a title, not a governor…
  nameRateEvidence = 15,    // …judged only once the token has shown its general behaviour
} = {}) => {
  if (!names || !names.size) return [];
  // Match on the names' HEAD tokens: a multi-word name ("Старой Руссе") is one label but the
  // governor stands before its FIRST word — and the oblique test still reads the matched token
  // (a multi-word head is never in the single-token nominative set, which is right: it admits on
  // the multi-word floor, not on subject behaviour).
  const heads = new Set([...names].map((l) => String(l).split(/\s+/)[0]));
  const stats = new Map();   // lowercased token → { n, cap, fin, nameNext, obliqueNext, namePrev }
  const at = (t) => {
    let s = stats.get(t);
    if (!s) stats.set(t, s = { n: 0, cap: 0, fin: 0, nameNext: 0, obliqueNext: 0, namePrev: 0 });
    return s;
  };
  for (const sent of sentences || []) {
    const str = String(sent);
    const ms = [...str.matchAll(TOKEN)];
    for (let i = 0; i < ms.length; i++) {
      const w = ms[i][0], lc = w.toLowerCase();
      const s = at(lc);
      s.n++;
      if (/^\p{Lu}/u.test(w)) s.cap++;
      // clause-final: nothing but space to the sentence end, or punctuation right after.
      const gap = (str.slice(ms[i].index + w.length).match(/^\s*(.|$)/u) || [])[1] ?? '';
      if (gap === '' || !/\p{L}/u.test(gap)) s.fin++;
      const next = ms[i + 1]?.[0];
      if (next && heads.has(next)) {
        s.nameNext++;
        if (!nominatives.has(next)) s.obliqueNext++;
      }
      const prev = ms[i - 1]?.[0];
      if (prev && heads.has(prev)) s.namePrev++;
    }
  }
  const out = [];
  for (const [token, s] of stats) {
    if (s.nameNext < minNames) continue;
    if (s.cap / s.n > 0.5) continue;                       // a governor is a lowercase word
    if (s.namePrev / s.nameNext > maxPrevRate) continue;   // symmetric company → a conjunction
    if (s.obliqueNext / s.nameNext < minOblique) continue; // governs subjects → a clause opener
    if (s.fin / s.n > maxFinalRate) continue;              // ends clauses → not a proclitic
    if (s.n >= nameRateEvidence && s.nameNext / s.n > maxNameRate) continue;   // a title (a moon)
    out.push({ token, n: s.n, nameNext: s.nameNext, oblique: s.obliqueNext });
  }
  return out.sort((a, b) => b.nameNext - a.nameNext || (a.token < b.token ? -1 : 1));
};
