// EO: DEF·SIG·EVA(Entity,Field,Link → Entity,Atmosphere, Binding,Dissecting,Tracing) — reference by reading / referent resolver
// Reference by reading — resolve a follow-up's referent by reading the conversation
// as the tail of the reading line, not by matching its surface form.
// (docs/reference-by-reading.md)
//
// A pronoun ("what is his name?"), a definite description ("the musician", "the
// other one"), and a correction ("no the musician") are not three cases needing
// three detectors. They are one operation: read the warmest figure the conversation
// holds, and let retrieval nominate a referent from the document to warm beside it.
// The old path (converse/focus.js) classified the surface form — a PRONOUN regex, a
// CORRECTION regex, an ATTRIBUTE wordlist, a needsContext ladder. This reads the cast.
//
// The resolution rule, validated end to end by scripts/reference-measure.mjs over the
// audit's five turns (all five resolve, including the correction, no regex):
//
//   prefer the RETRIEVAL NOMINEE the conversation has also warmed   ← the correction
//     ("no the musician" re-nominates the musician, who is conv-warm, over the
//      talker's just-committed wrong answer — §4, read not detected),
//   else the conversation's WARMEST figure                          ← the pronoun
//     ("his name" binds to the referent the prior turn warmed, where retrieval would
//      mislead to a same-surface distractor),
//   else the RETRIEVAL NOMINEE                                      ← the description
//     (a definite description the conversation has not yet named — embedding points
//      the line at it; no CON edge or descriptor binding is required, P0).
//
// The warmth is CONVERSATION-SCOPED on purpose (P0): a referent is warm because the
// conversation named it, never because the document's tail happened to mention it. A
// γ-prior over the whole line would let the document's most-recent figure swamp a
// first follow-up; scoping warmth to the conversation cast is what makes the read
// robust to a question asked right after the document.

import { parseText } from '../../perceiver/parse/index.js';
import { namedReferents, figureSurface } from '../../perceiver/index.js';
import { projectGraph } from '../../core/index.js';

const GAMMA = 0.7;   // recency decay along the reading line — matches reading.js

const norm = (s) => String(s || '').trim().toLowerCase();

// ── Gender agreement for a follow-up pronoun ──────────────────────────────────────────
// A gendered follow-up ("where was HE born?", "where did SHE grow up?") must not bind to a
// figure the conversation marks as the OTHER gender — the Janet/Carol misfire, where "he"
// landed on the wife because she was the most recently referenced figure. This is a small,
// CONSERVATIVE read: gender comes only from an unambiguous kinship ROLE or TITLE sitting right
// beside a proper name ("his wife was Janet" → Janet f; "Mr Smith" → Smith m). It never guesses
// from a name, and a name with conflicting cues stays UNKNOWN — so it can only demote a figure the
// text positively contradicts, never invent one. Absent a gendered pronoun, none of this fires.
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
const NAME_STOP = new Set('the a an his her their its it he she they we you i who what when where why how this that these those and but or of to in on for with as at by from is was were are be been his hers'.split(/\s+/));

// The gender a gendered follow-up pronoun demands ('m' | 'f'), or null when the turn carries none.
export const pronounGender = (question) => {
  const toks = String(question || '').toLowerCase().match(/[a-z]+/g) || [];
  for (const t of toks) if (GENDER_PRONOUN[t]) return GENDER_PRONOUN[t];
  return null;
};

// roleGenders(text) → Map<nameToken(lowercased), 'm'|'f'> — the gender a role/title word pins on the
// proper name right beside it. Only the two tight shapes that are reliable: a role noun leading into a
// name ("wife was Janet", "married to Carol"→spouse handled by the role's own gender) and a name
// trailing into a role ("Janet, his wife"). A name that collects BOTH genders is dropped (ambiguous).
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
  // role → name: "his wife was Janet", "wife Janet" (skip "of X" — that's the OWNER, not the bearer).
  // Role words are matched lowercase (the reliable, common shape — "his wife", "her husband"); a
  // capitalized TITLE ("Mr Smith") is deliberately NOT matched, because a capitalized role word also
  // looks like a name and cross-contaminates the read — the lowercase kinship cue is the safe signal.
  let m;
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
  // spouse verb: "married to Carol", "married Carol" → the object bears the spouse role's default (f/m
  // is unknowable without the subject, so leave it — the leading-role and trailing-role shapes above
  // catch the wife/husband namings that actually carry the gender).
  const out = new Map();
  for (const [t, v] of votes) { if (v.m && !v.f) out.set(t, 'm'); else if (v.f && !v.m) out.set(t, 'f'); }
  return out;
};

// Would binding a `pg`-gendered pronoun to this label CONTRADICT the text? True only when some token of
// the label is positively marked the other gender. Unknown → false (never demote on absence of evidence).
const genderClashes = (label, pg, genders) => {
  if (!pg || !genders || genders.size === 0) return false;
  for (const tokRaw of String(label || '').toLowerCase().split(/\s+/)) {
    const t = tokRaw.replace(/[^a-z'’-]/g, '');
    const g = genders.get(t);
    if (g && g !== pg) return true;
  }
  return false;
};

// The figures the CONVERSATION named, warmest first. The history (USER and TALKER
// turns alike — the talker's reply is a unit on the line too, §4) and the current
// question are read through the same parse the document ran through; each named
// figure's γ-mass is folded over its mentions, decayed to the question cursor (the
// last unit). The talker's words enter only to warm WHICH referent is in focus — the
// cast, never the answer's content (the grounded prompt still withholds the talker's
// prior answers), so this carries no poisoning channel.
export const conversationCast = (history = [], question = '') => {
  // §7 — an UNBOUND talker reply never warms the cast. The talker's words enter the cast
  // only to warm WHICH referent is in focus, but a reply that bound nothing warming the
  // wrong figure (the audit's t1 father-claim warming "father") is exactly the propagation
  // §7 closes. Tagged by the pipeline (ui/app.js); absent on existing callers, so this is
  // byte-identical without it.
  const turns = [
    ...(Array.isArray(history) ? history : [])
      .filter(m => m && m.content && !(m.role === 'assistant' && m.unbound))
      .map(m => String(m.content)),
    String(question || ''),
  ].map(s => s.trim()).filter(Boolean);
  if (turns.length === 0) return [];

  const doc = parseText(turns.join('\n\n'));
  const units = doc.units || doc.sentences || [];
  const at = units.length - 1;                 // the question cursor — the line's tail
  if (at < 0) return [];

  const events = doc.log.snapshot ? doc.log.snapshot() : doc.log.events;
  // Pool every surface form onto its appearance CLASS — the projection's union-find
  // root, not the raw id the mention happened to mint. A referent renamed within the
  // conversation ("Gregor Samsa" … then bare "Samsa") is ONE warm figure, never two,
  // and its warmth is the sum over its mentions, not split across aliases and ranked by
  // whichever form came last. The earliest-INS label leads, so the canonical name shows.
  const rep = projectGraph(doc.log).representative || ((id) => id);
  const label = new Map();
  const mass  = new Map();
  // Labels come from INS — the naming authority; the earliest-INS label leads, so the canonical
  // name shows and a later alias never renames a warm figure.
  for (const e of events) {
    if (e.op !== 'INS' || e.id == null) continue;
    const id = rep(e.id);
    if (!label.has(id)) label.set(id, e.label);
  }
  // Warmth counts EVERY reference to a figure, not only its re-namings. A subject the conversation
  // carries by PRONOUN — "who was HIS wife?", "where was HE born?" — stays warm through the CON/SIG/
  // DEF edges those pronouns resolve to, so a one-off name dropped in a recent answer (a wife the
  // subject was merely related to) never outranks the subject the whole thread is about. Before, only
  // INS (a fresh naming) added mass, so a subject spoken of by pronoun went cold the moment the answer
  // named someone else, and "he" bound to that someone (the Carol-Held-Knight misfire). Each reference
  // deposits one γ-decayed unit at its sentence; only references BEFORE the cursor count (the
  // question's own line is not already-warm), and only a NAMED figure (one with an INS) is a cast member.
  const bump = (rawId, sentIdx) => {
    if (rawId == null || sentIdx == null || !(sentIdx < at)) return;
    const id = rep(rawId);
    if (!label.has(id)) return;
    mass.set(id, (mass.get(id) || 0) + Math.pow(GAMMA, at - 1 - sentIdx));
  };
  for (const e of events) { bump(e.id, e.sentIdx); bump(e.src, e.sentIdx); bump(e.tgt, e.sentIdx); }
  const ranked = [...mass.entries()]
    .map(([id, m]) => ({ id, label: label.get(id) || id, mass: m }))
    .sort((a, b) => b.mass - a.mass);

  // Gender agreement: when the live turn carries a gendered pronoun, a figure the conversation marks
  // as the OTHER gender is DEMOTED below every gender-compatible one (never dropped — a stable partition,
  // so within each side warmth still decides, and if every figure clashes the ranking is unchanged). This
  // is what keeps "where was he born?" off the wife the prior answer just named, and lands it on the
  // subject the thread is about. No gendered pronoun, or no positive gender evidence → the warmth order stands.
  const pg = pronounGender(question);
  if (!pg) return ranked;
  const genders = roleGenders(turns.join('\n\n'));
  if (genders.size === 0) return ranked;
  const compatible = ranked.filter(r => !genderClashes(r.label, pg, genders));
  const clashing   = ranked.filter(r =>  genderClashes(r.label, pg, genders));
  return clashing.length ? [...compatible, ...clashing] : ranked;
};

// localeOf — where in the DOCUMENT the referent is established: its strongest incident
// edge's line (figureSurface returns the referent's bonds weight-ranked), else its
// first mention. One hop from the warm referent to where it is grounded (§3): for "his
// name" this lands on the line that NAMES the figure, which the word "name" never
// reaches by similarity. Returns a unit index, or null when the referent has no locus.
export const localeOf = (doc, refId) => {
  if (!doc?.log || refId == null) return null;
  const { relations } = figureSurface(doc, [refId]);
  const edge = relations.find(r => Number.isFinite(r.idx));
  if (edge) return edge.idx;
  // No bond — fall back to the EARLIEST line that instantiated the referent, read over
  // its appearance CLASS, not the connected id. A later coref merge can root a referent
  // on a late-appearing alias (the naming scene folds "his sister" into the late name
  // Grete — pipeline.js:397), so scanning the raw id alone returns the cursor the
  // connection landed at, not the birth. The locus is the earliest appearance; the
  // connection cursor is always later and must never stand in for it.
  const rep = projectGraph(doc.log).representative || ((id) => id);
  const target = rep(refId);
  const events = doc.log.snapshot ? doc.log.snapshot() : doc.log.events;
  let earliest = null;
  for (const e of events) {
    if (e.op === 'INS' && e.sentIdx != null && rep(e.id) === target) {
      if (earliest == null || e.sentIdx < earliest) earliest = e.sentIdx;
    }
  }
  return earliest;
};

// The document referents retrieval points the line at — the cheap nomination channel
// (§3). Each retrieved span's named figures, in span-rank order, deduped to the
// projection representative. This is what surfaces a definite description's referent
// with no CON edge: the span about "the musician" names the figure, so embedding (or,
// under the hash organ, the shared word) carries the reference the parse cannot.
const nominate = (doc, spans = []) => {
  const out = [];
  const seen = new Set();
  for (const s of spans) {
    for (const id of namedReferents(doc, s.text || '')) {
      if (!seen.has(id)) { seen.add(id); out.push(id); }
    }
  }
  return out;
};

// referenceTarget — the turn's DEF target, read off the cast (no regex, no wordlist).
// `spans` are the turn's retrieval hits (the nomination channel). Returns
// { id, label, locale } in the DOCUMENT's id-space, or null when nothing resolves
// (then the caller keeps its existing anchor/focus — a no-op, byte-identical).
export const referenceTarget = (doc, history, question, spans = []) => {
  if (!doc?.log) return null;

  const nominees = nominate(doc, spans);                 // document ids, span-ranked
  const cast     = conversationCast(history, question);  // conv figures, warmest first

  // Map each conversation figure to the document referent it names (by label, the one
  // currency the two parses share), keeping warmth order. A conv-only figure the
  // document never holds drops out — we can only DEF a referent the document grounds.
  const castDocIds = [];
  const castSeen = new Set();
  for (const c of cast) {
    const ids = namedReferents(doc, c.label);
    const id = ids[0];
    if (id != null && !castSeen.has(id)) { castSeen.add(id); castDocIds.push(id); }
  }
  const castSet = new Set(castDocIds);

  // The rule. Prefer the nominee the conversation has also warmed (the correction and
  // the warmed-description case); else the conversation's warmest figure (the pronoun
  // case); else the top nominee (the not-yet-named description).
  const id = nominees.find(n => castSet.has(n)) ?? castDocIds[0] ?? nominees[0] ?? null;
  if (id == null) return null;

  const labelOf = (i) => doc.admission?.labelOf?.(i) || cast.find(c => namedReferents(doc, c.label)[0] === i)?.label || i;
  return { id, label: labelOf(id), locale: localeOf(doc, id) };
};
