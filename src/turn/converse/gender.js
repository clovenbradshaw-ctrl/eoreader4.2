// EO: SIG·EVA(Atmosphere,Entity → Lens,Link, Tending,Binding) — pronoun gender agreement
// Gender agreement for a follow-up pronoun. A gendered follow-up ("where was HE born?", "where did
// SHE grow up?") must not bind to a figure the conversation marks as the OTHER gender — the
// Janet/Carol misfire, where "he" landed on the wife because she was the most recently referenced
// figure. This is a small, CONSERVATIVE read: gender comes only from an unambiguous kinship ROLE or
// spouse verb sitting right beside a proper name ("his wife was Janet" → Janet f; "he … married
// Carol" → Carol f). It never guesses from a name, and a name with conflicting cues stays UNKNOWN —
// so it can only demote a figure the text positively contradicts, never invent one. Absent a
// gendered pronoun, none of this fires (reference.js only consults it then).

const GENDER_PRONOUN = { he: 'm', him: 'm', his: 'm', himself: 'm', she: 'f', her: 'f', hers: 'f', herself: 'f' };
const ROLE_GENDER = {
  m: 'husband father dad son brother uncle nephew grandfather grandpa widower boyfriend king prince duke lord actor mr mister sir',
  f: 'wife mother mom daughter sister aunt niece grandmother grandma widow girlfriend queen princess duchess lady actress mrs ms miss madam madame',
};
const ROLE_OF = (() => { const m = new Map(); for (const g of ['m', 'f']) for (const w of ROLE_GENDER[g].split(/\s+/)) m.set(w, g); return m; })();
const ROLES_ALT = [...ROLE_OF.keys()].join('|');
const NAME_RUN = `[A-Z][a-zA-Z'’-]+(?:\\s+[A-Z][a-zA-Z'’-]+){0,3}`;
// Capitalized function words that open a sentence and are NOT names — kept out of the gender read so a
// leading "His"/"The"/"She" beside a role word never records a spurious gender for a non-name token.
const NAME_STOP = new Set('the a an his her their its it he she they we you i who what when where why how this that these those and but or of to in on for with as at by from is was were are be been hers'.split(/\s+/));

// The gender a gendered follow-up pronoun demands ('m' | 'f'), or null when the turn carries none.
export const pronounGender = (question) => {
  const toks = String(question || '').toLowerCase().match(/[a-z]+/g) || [];
  for (const t of toks) if (GENDER_PRONOUN[t]) return GENDER_PRONOUN[t];
  return null;
};

// roleGenders(text) → Map<nameToken(lowercased), 'm'|'f'> — the gender a role/spouse word pins on the
// proper name right beside it. Three tight, reliable shapes: a role noun leading into a name ("wife
// was Janet"), a name trailing into a role ("Janet, his wife"), and a gendered subject's spouse ("he
// married Carol" → Carol f). A name that collects BOTH genders is dropped (ambiguous, no vote).
export const roleGenders = (text) => {
  const s = String(text || '');
  const votes = new Map();   // nameToken → { m, f }
  const cast = (name, g) => {
    for (const tokRaw of String(name || '').toLowerCase().split(/\s+/)) {
      const t = tokRaw.replace(/[^a-z'’-]/g, '');
      if (t.length < 2 || NAME_STOP.has(t)) continue;   // a sentence-initial "His"/"The" is not a name
      const v = votes.get(t) || { m: 0, f: 0 }; v[g] += 1; votes.set(t, v);
    }
  };
  let m;
  // role → name: "his wife was Janet", "wife Janet" (skip "of X" — that's the OWNER, not the bearer).
  // Role words are matched lowercase (the reliable, common shape — "his wife", "her husband"); a
  // capitalized TITLE ("Mr Smith") is deliberately NOT matched, because a capitalized role word also
  // looks like a name and cross-contaminates the read — the lowercase kinship cue is the safe signal.
  const roleToName = new RegExp(`\\b(${ROLES_ALT})\\b\\s+(?:was|is|named|called|,|:|-)?\\s*(?!of\\b)(${NAME_RUN})`, 'g');
  while ((m = roleToName.exec(s))) cast(m[2], ROLE_OF.get(m[1]));
  // name → role: "Janet, his wife", "Janet Armstrong (his wife)"
  const nameToRole = new RegExp(`(${NAME_RUN})[\\s,()]+(?:the|a|an|his|her|their|is|was)?\\s*\\b(${ROLES_ALT})\\b`, 'g');
  while ((m = nameToRole.exec(s))) cast(m[1], ROLE_OF.get(m[2]));
  // spouse verb: a gendered SUBJECT's spouse is the other gender — "he … married (to) Carol" → Carol f,
  // "she married John" → John m. This is what pins the wife the prior answer named only by the marriage
  // ("He was also later married to Carol Held Knight"), which no standalone role word touches.
  const spouse = new RegExp(`\\b(he|him|his|she|her)\\b[^.?!]*?\\bmarr(?:ied|ies|y)\\b\\s+(?:to\\s+)?(${NAME_RUN})`, 'gi');
  while ((m = spouse.exec(s))) cast(m[2], /^(?:he|him|his)$/i.test(m[1]) ? 'f' : 'm');
  const out = new Map();
  for (const [t, v] of votes) { if (v.m && !v.f) out.set(t, 'm'); else if (v.f && !v.m) out.set(t, 'f'); }
  return out;
};

// Would binding a `pg`-gendered pronoun to this label CONTRADICT the text? True only when some token of
// the label is positively marked the other gender. Unknown → false (never demote on absence of evidence).
export const genderClashes = (label, pg, genders) => {
  if (!pg || !genders || genders.size === 0) return false;
  for (const tokRaw of String(label || '').toLowerCase().split(/\s+/)) {
    const t = tokRaw.replace(/[^a-z'’-]/g, '');
    const g = genders.get(t);
    if (g && g !== pg) return true;
  }
  return false;
};
