// EO: INS·SYN·EVA·DEF(Void → Entity,Network, Composing) — a referent pointed at without a name
// A REFERENT IS NEVER IN THE TEXT. It is a centre of mass the mind mints to point at something out
// there; every surface — name, definite description, pronoun — is one of its MANIFESTATIONS, none
// privileged. There is no "light" referent (with a name) and no "dark" one (without): every referent
// is pointed at, and a name is merely the brightest handle one may wear.
// The capital scanner (entities.js) and the uncased read (uncased.js) are conveniences that anchor
// on that bright handle because it is cheapest. When a figure wears none — Frankenstein's *creature*
// is only ever "the creature", "the monster", "the wretch" and a hail of pronouns — the convenience
// finds nothing, yet the referent is as present as any named one. This leaf finds that SAME centre
// by the only manifestations it has: the descriptions and pronouns that point at it.
//
// You read it off the orbits it bends: a description the text keeps RETURNING to, standing where an
// AGENT stands (a subject that ACTS — "the creature stretched"), carrying real mass. That is the
// ordinary signature of a referent (recurrence × agency), the same read entities.js/grain.js run,
// with no name at its centre. It is the SETTING's opposite: "the room" recurs too but is moved
// THROUGH — oblique, never acting — so the figure test (subject-dominant) separates the creature
// from the room. An elided adjective ("the old") is refused outright (modifier-law.js). And where a
// description already orbits a NAMED centre it is that centre's — in *Metamorphosis* "the creature" IS Gregor.
//
// MECHANICAL AND MODELLESS, like every leaf here: it names the body by its own dominant description
// ("the creature"). Whether "the monster" and "the wretch" are the SAME body is world knowledge the
// mechanics abstain on — `nameReferent` (the injected hook, ideally the talker) MAY rename/merge
// before admission. Mechanics propose; the hook disposes — the coref-as-proposal discipline.

import { VERDICTS } from '../../core/index.js';
import { censusModifiers } from './modifier-law.js';
import { segmentClauses } from './clauses.js';

// The determiner that fronts a definite/indefinite description. Sentence-initial "The" is caught
// by allowing the leading capital; the HEAD stays strictly lowercase so a proper name ("the White
// House") is never mistaken for a description.
const DET = String.raw`(?:[Tt]he|[Aa]n?)`;
// modifiers: up to three lowercase adjectives between the determiner and the head noun.
const MODS = String.raw`(?:[a-z][a-z'’-]+\s+){0,3}`;
const HEAD = String.raw`([a-z][a-z'’-]{2,})`;
const DESC_RE = new RegExp(String.raw`\b${DET}\s+${MODS}?${HEAD}\b`, 'g');

// Heads that recur yet name no FIGURE — the same inhibitor entities.js's common-noun catalyst
// carries, kept here so a description built on one ("the same", "the way", "the storm") never reacts
// into a body. The language-specific classes (function / starter / role / calendar / demonym) are
// read from the conventions ledger. LUMINOSITY (animacy) is the principled test that a setting is not
// a figure — a body pronouns fly through, not one they bind to — but it needs enough sightings to be
// trustworthy; this curated set is the backstop for the low-count tail (a weather noun met a handful
// of times whose animate rate the gate cannot yet judge). Three groups: abstract-relational, natural
// world / weather / place, and temporal — none of which a reader ever means as a person.
const ABSTRACT_HEADS = new Set([
  // abstract / relational
  'way', 'time', 'thing', 'matter', 'fact', 'case', 'point', 'kind', 'sort', 'moment', 'sense',
  'part', 'whole', 'same', 'other', 'first', 'last', 'rest', 'one', 'while', 'end', 'side', 'reason',
  'idea', 'word', 'name', 'sake', 'use', 'need', 'life', 'people', 'man', 'woman', 'men', 'women',
  'question', 'condition', 'threat', 'voyage', 'news', 'crime', 'trial', 'science', 'soul', 'evil',
  'degree', 'figure', 'present', 'leave', 'period',
  // natural world / weather / place
  'world', 'place', 'sun', 'moon', 'sky', 'star', 'sea', 'earth', 'ground', 'air', 'light', 'fire',
  'water', 'wind', 'rain', 'snow', 'ice', 'cloud', 'storm', 'thunder', 'mist', 'breeze', 'wave',
  'frost', 'weather', 'blood', 'mountain', 'river', 'lake', 'tree', 'wood', 'forest', 'field', 'road',
  'house', 'room', 'door', 'window', 'wall', 'heaven',
  // temporal
  'day', 'night', 'morning', 'evening', 'year', 'hour', 'week', 'month', 'season', 'age', 'winter',
  'summer', 'spring', 'autumn']);

// PERSON-ROLE heads — a role names MANY bearers ("the father", "the sailor", "the professor" are
// different people at different turns), so a role is not the ONE nameless protagonist the unnamed
// read is for. The creature's epithets (creature/monster/wretch/fiend/devil) are UNIQUE descriptors,
// never roles. This is the seed of the ledger's own (learn-only) role register, kept here so a role
// noun is not folded onto the nameless body it is not — the coreference of distinct minor figures is
// a later, field-based job; this backstop keeps the obvious ones off the protagonist.
const PERSON_ROLE = new Set([
  'father', 'mother', 'brother', 'sister', 'son', 'daughter', 'parent', 'child', 'baby', 'boy', 'girl',
  'man', 'woman', 'lad', 'youth', 'maiden', 'wife', 'husband', 'widow', 'uncle', 'aunt', 'cousin',
  'lady', 'gentleman', 'sir', 'master', 'mistress', 'servant', 'maid', 'nurse', 'sailor', 'soldier',
  'officer', 'captain', 'doctor', 'professor', 'teacher', 'student', 'judge', 'lawyer', 'priest',
  'king', 'queen', 'prince', 'princess', 'lord', 'peasant', 'friend', 'stranger', 'neighbour',
  'neighbor', 'companion', 'fellow', 'guest', 'host', 'guard', 'guide', 'clerk', 'merchant',
  'traveller', 'traveler', 'villain', 'hero', 'heroine', 'witness', 'prisoner', 'victim']);

// A content head — an open-class word (a verb/noun, not a function word) — so a description
// followed by one stands where an agent's verb stands ("the creature STRETCHED"). Lowercase-
// initial of any script, mirroring entities.js's own `isContent`.
const isContent = (w, C) => !!w && /^\p{Ll}[\p{Ll}'’]*$/u.test(w) && w.length >= 2 && !C.isFunction(w);

// A stable id from a label — lowercased, spaces → hyphens, letters/numbers of any script kept.
// The same normalisation entities.js's `idFor` uses, so an unnamed referent's id is minted exactly
// like a named one's and the projection treats it identically.
const idFor = (label) =>
  label.toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}-]/gu, '');

// Approximate singularisation so "the creatures"/"the creature" fold onto one head. Deliberately
// timid — plain trailing -s only, never -es/-ies (which mangle more than they help) — because an
// over-eager stemmer merges distinct heads, the error this read most wants to avoid.
const singular = (h) => (h.length > 4 && h.endsWith('s') && !h.endsWith('ss')) ? h.slice(0, -1) : h;

// ── The gravitational census: which "the X" heads are BODIES the reading can point at ──────────
// A referent is weighed by the bound orbit it captures, not its own light. Two measurements decide
// whether a recurring description head is a body worth tracking (docs/unnamed-referents-relativistic.md):
//   REST MASS   — head-dominance = asHead / (asHead + attrib), where `attrib` counts the head standing
//                 BEFORE another content word in a "the …" run ("the great house") and `asHead` counts
//                 it ending the run ("the creature"). A substantivized adjective ("the great") is
//                 attributive even when it heads an elided NP, so it sits LOW; a figure-noun sits high.
//                 This is the adjective filter the modifier law misses when prose substantivizes freely.
//   LUMINOSITY  — animacy = the rate at which the head co-occurs with a personal pronoun (he/she/him/
//                 her). A FIGURE binds animate satellites; a SETTING ("the sea", "the door") is a dark
//                 medium pronouns fly through. This is the one thing rest-mass and raw mass cannot tell
//                 apart, and the reason a crude mass gate was the only thing that ever worked.
// Plus AGENCY (subject-dominant — it ACTS) and RECURRENCE. No star-scale gate here: a body's mass is
// often SCATTERED across epithets (creature/monster/wretch), so admission is decided later, on the
// POOLED virial mass, against a born/null floor — never per-head against the top name.
const PERSONAL_PRONOUN = /\b(?:he|him|his|she|her|hers|himself|herself)\b/i;
const RUN_RE = new RegExp(String.raw`\b(?:[Tt]he|[Aa]n?)\s+((?:[a-z][a-z'’-]+\s+){0,4}[a-z][a-z'’-]{2,})\b`, 'g');
export const censusUnnamedCentres = (sentences, { conventions,
  minSightings = 3, minAgency = 2, restMassFloor = 0.6, luminosityFloor = 0.5 } = {}) => {
  if (!Array.isArray(sentences) || !sentences.length) return new Map();
  const C = {
    isFunction:    (w) => conventions?.isFunction?.(w) ?? false,
    isStarter:     (w) => conventions?.isStarter?.(w) ?? false,
    isRole:        (w) => conventions?.isRole?.(w) ?? false,
    isCalendar:    (w) => conventions?.isCalendar?.(w) ?? false,
    isDemonym:     (w) => conventions?.isDemonym?.(w) ?? false,
    isPreposition: (w) => conventions?.isPreposition?.(w) ?? false,
  };
  const isModifierHead = censusModifiers(sentences, C);
  // A head that is really a NAME (lowercased) is dropped. Read the names off the document's own
  // casing law, not admission — so the census is admission-INDEPENDENT and runs up front (before the
  // main loop admits anyone), exactly as the uncased read discovers its figures up front. A NAME's
  // capital is INTRINSIC: it appears capital-initial MID-sentence ("met Victor"), where a mere
  // sentence-initial capital ("Wretch swore…") is positional — so "Wretch"/"Devil" stay candidates
  // while "Victor"/"Frankenstein" are excluded.
  const nameTokens = new Set();
  for (const sent of sentences) {
    const ws = String(sent).match(/[\p{L}'’]+/gu) || [];
    ws.forEach((w, i) => { if (i > 0 && /^\p{Lu}/u.test(w)) nameTokens.add(w.toLowerCase()); });
  }
  const excluded = (h) => h.length < 3 || C.isFunction(h) || C.isStarter(h) || C.isRole(h)
    || C.isCalendar(h) || C.isDemonym(h) || ABSTRACT_HEADS.has(h) || isModifierHead(h) || nameTokens.has(h)
    || PERSON_ROLE.has(h)          // a role names MANY bearers ("the father", "the sailor"), not the ONE nameless body
    || h.endsWith('est');          // a superlative ("the highest", "the greatest") is an adjective, not a body

  // Pass 1 — the dominance census (rest mass): attrib vs asHead over every "the …" run. A head is
  // ATTRIB only when the next content word is a DETERMINER-TAKER (a noun the text fronts with the/a
  // elsewhere), never when it is a VERB — so "the creature stretched" reads creature as a HEAD, not a
  // modifier of "stretched". Verbs never enter detTakers (nothing says "the stretched"), which is the
  // modifier law's own discriminator (modifier-law.js) — here read as a ratio, not a boolean.
  const runs = [], detTakers = new Set();
  for (const sent of sentences) {
    const s = String(sent); const re = new RegExp(RUN_RE.source, 'g'); let m;
    while ((m = re.exec(s)) !== null) {
      const ws = m[1].split(/\s+/).map((w) => singular(w.toLowerCase())).filter((w) => w.length >= 3 && !C.isFunction(w));
      if (ws.length) { runs.push(ws); detTakers.add(ws[0]); }
    }
  }
  const attrib = new Map(), asHead = new Map();
  for (const ws of runs)
    for (let i = 0; i < ws.length; i++) {
      const bank = (ws[i + 1] && detTakers.has(ws[i + 1])) ? attrib : asHead;
      bank.set(ws[i], (bank.get(ws[i]) || 0) + 1);
    }
  const dominance = (h) => { const a = attrib.get(h) || 0, hd = asHead.get(h) || 0; return (a + hd) ? hd / (a + hd) : 0; };

  // Pass 2 — per-head sightings, agency, animacy, surfaces.
  const heads = new Map();
  sentences.forEach((sent, sentIdx) => {
    const s = String(sent); const re = new RegExp(DESC_RE.source, 'g'); let m;
    const near = s + ' ' + String(sentences[sentIdx + 1] || '');
    const animateHere = PERSONAL_PRONOUN.test(near);
    const seen = new Set();
    while ((m = re.exec(s)) !== null) {
      const raw = m[1], head = singular(raw.toLowerCase());
      if (excluded(head)) continue;
      const before = s.slice(0, m.index), after = s.slice(m.index + m[0].length);
      const prev = (before.match(/([\p{L}'’]+)\s*$/u) || [])[1];
      const next = (after.match(/^\s*([\p{L}'’]+)/u) || [])[1];
      let h = heads.get(head);
      if (!h) heads.set(head, h = { head, count: 0, subj: 0, obl: 0, animate: 0, appears: 0, mentions: new Set(), surfaces: new Map() });
      h.count++;
      h.mentions.add(sentIdx);
      const surface = m[0].replace(/^\s*[A-Z]/, (c) => c.toLowerCase()).replace(/\s+/g, ' ').trim();
      h.surfaces.set(surface, (h.surfaces.get(surface) || 0) + 1);
      if (isContent(next, C)) h.subj++;
      if (prev && C.isPreposition(prev.toLowerCase())) h.obl++;
      if (!seen.has(head)) { seen.add(head); h.appears++; if (animateHere) h.animate++; }
    }
  });

  // The bodies: recurring, agentive, with rest mass (a noun) and luminosity (binds animate satellites).
  // REST MASS (dominance) is read on any amount of text and always applies — it tells a noun from an
  // adjective. LUMINOSITY (animacy) needs enough sightings for the rate to be trustworthy, and it only
  // MATTERS where a setting can pose as a subject ("the sun rose") — which takes a long text. So it
  // filters only WELL-ATTESTED heads (count ≥ luminosityMin); in a short passage recurrence + agency +
  // rest mass suffice, and the creature (few personal pronouns nearby yet) is not wrongly excluded.
  const centres = new Map();   // head → { head, id, dominance, animacy, subj, obl, count, mentions, surfaces }
  // A VERY frequent agentive noun that never binds a person-pronoun is a setting ("the sun rose" ×38);
  // a real figure recurs far less (the creature ~13). So the luminosity gate fires only on heavily
  // attested heads, where a low animate rate is decisive — never on a figure or a short passage.
  const luminosityMin = 16;
  for (const h of heads.values()) {
    const count = h.mentions.size;
    if (count < minSightings || h.subj < minAgency || h.subj <= h.obl) continue;
    const dom = dominance(h.head), anim = h.appears ? h.animate / h.appears : 0;
    if (dom < restMassFloor) continue;                              // a noun, not an adjective
    if (count >= luminosityMin && anim < luminosityFloor) continue; // a figure, not a setting (well-attested only)
    const label = [...h.surfaces.entries()].sort((a, b) => b[1] - a[1] || (a[0].length - b[0].length) || (a[0] < b[0] ? -1 : 1))[0][0];
    centres.set(h.head, { head: h.head, id: idFor(label), label, dominance: dom, animacy: anim,
      subj: h.subj, obl: h.obl, count, mentions: [...h.mentions].sort((a, b) => a - b), surfaces: [...h.surfaces.keys()] });
  }
  return centres;
};

// discoverUnnamedReferents(sentences, opts) → proposal[]
//   Each proposal: { id, label, head, count, subj, obl, mass, mentions:[sentIdx], surfaces:[form] }
// The candidate BODIES, from the gravitational census (censusUnnamedCentres): recurring, agentive,
// with rest mass (a noun) and luminosity (binds animate satellites). NO per-head star-scale gate —
// a body's mass is scattered across epithets (creature/monster/wretch), each below any per-head
// floor, so the star-scale test is applied LATER to the POOLED body (admitUnnamedReferents), never
// to a lone epithet. `admission` is accepted for back-compat but no longer needed: the census reads
// names off the document's own casing law, so it runs before or after admission alike.
export const discoverUnnamedReferents = (sentences, { conventions } = {}) => {
  if (!Array.isArray(sentences) || !sentences.length) return [];
  const centres = censusUnnamedCentres(sentences, { conventions });
  const out = [...centres.values()].map((c) => ({
    id: c.id, label: c.label, head: c.head, count: c.count, subj: c.subj, obl: c.obl,
    mass: c.count, mentions: c.mentions, surfaces: c.surfaces, animacy: c.animacy, dominance: c.dominance,
  }));
  // the heaviest body first — the referent the name scan could not anchor.
  out.sort((a, b) => b.mass - a.mass || b.subj - a.subj || (a.label < b.label ? -1 : 1));
  return out;
};

export { idFor as unnamedReferentId };

// ── The coreference fold — many descriptions, one nameless body ─────────────
// The mechanics find each recurring nameless description on its own ("the creature", "the
// wretch", "the monster"). Whether they are ONE body is world knowledge the read abstains on —
// deferred to `nameReferent` when a talker is present. Absent one, the DEFAULT reading folds
// every surviving unnamed body onto the HEAVIEST: a document almost never carries two nameless
// star-scale protagonists, so "the wretch" is the creature under another description. The one
// refusal keeps the honest case apart — two descriptions that each stand as a SUBJECT (the head
// immediately followed by a content word) in the SAME sentence are two figures on stage at once
// ("the plaintiff alleges … the defendant denies"), and are left as distinct bodies. The fold is
// PROPOSED here; admitUnnamedReferents commits it as a DEFEASIBLE SYN, overturnable like a surname.
// The word after a description that is NOT its verb — a particle ("drove the wretch AWAY"), a
// preposition ("the creature IN the woods"), or a bleached adverb/connector. A follower in this
// class means the description did not ACT there, so it does not witness two figures on stage.
const NOT_PREDICATE = new Set([
  'away', 'out', 'off', 'up', 'down', 'back', 'aside', 'apart', 'along', 'ahead', 'forward',
  'onward', 'around', 'about', 'over', 'through', 'aboard', 'overboard', 'here', 'there',
  'to', 'into', 'onto', 'of', 'in', 'on', 'at', 'from', 'with', 'for', 'by', 'as', 'than',
  'toward', 'towards', 'upon', 'within', 'against', 'near', 'past', 'after', 'before', 'until',
  'then', 'again', 'too', 'also', 'once', 'soon', 'later', 'now', 'and', 'or', 'but', 'so', 'yet', 'nor',
]);
const bothActInOneSentence = (sentences, headA, headB, C) => {
  const subjRe = (h) => new RegExp(String.raw`\b${DET}\s+${MODS}?${h}\b\s+([\p{L}'’]+)`, 'u');
  const reA = subjRe(headA), reB = subjRe(headB);
  const acted = (m) => m && isContent(m[1], C) && !NOT_PREDICATE.has(m[1].toLowerCase());
  for (const s of sentences) {
    const str = String(s);
    if (acted(reA.exec(str)) && acted(reB.exec(str))) return true;   // both acted here → distinct
  }
  return false;
};

// foldUnnamedReferents(proposals, sentences, C) → proposals
//   The heaviest body absorbs each other body it does not co-act with AND whose LUMINOSITY is
//   compatible — an epithet of one body shares its animate signature, so a low-animacy remnant a
//   noun-filter let through ("the utmost", "the fallen") is NOT folded onto the creature. Compatible
//   means the absorbed body's animate rate is near the primary's (so two neuter epithets on a short
//   passage — creature/wretch, both "it" — still fold) OR clearly animate on its own. Each absorbed
//   body rides on as a `mergedFrom` alias; the survivor's mentions are the union. A distinct nameless
//   figure (a co-actor) or a luminosity-incompatible remnant is kept apart. Idempotent-shaped.
export const foldUnnamedReferents = (proposals, sentences = [], C = { isFunction: () => false }) => {
  if (!Array.isArray(proposals) || proposals.length < 2) return proposals;
  const sorted = [...proposals].sort((a, b) => (b.mass || 0) - (a.mass || 0) || (a.label < b.label ? -1 : 1));
  const primary = sorted[0];
  const pa = primary.animacy;
  // An epithet of the body is a SYNONYM — a highly nominal (rest-mass ≥ 0.8) name-substitute, not a
  // substantivized adjective ("the utmost", "the deadly") that a lower noun-floor let through. And it
  // is LUMINOSITY-compatible: its animate rate near the primary's (so two neuter epithets on a short
  // passage — creature/wretch, both "it" — still fold) or clearly animate on its own. Undefined
  // fields (a caller that did not measure them) never block, so a hand-built proposal folds as before.
  const compatible = (p) =>
    (p.dominance == null || p.dominance >= 0.8)
    && (p.animacy == null || pa == null || p.animacy >= 0.5 || Math.abs(p.animacy - pa) <= 0.25);
  const distinct = [];       // unnamed bodies that ACT alongside the primary, or a luminosity mismatch
  const folded = [];         // unnamed bodies with no such conflict → the primary under another description
  for (const p of sorted.slice(1))
    (bothActInOneSentence(sentences, primary.head, p.head, C) || !compatible(p) ? distinct : folded).push(p);
  if (!folded.length) return proposals;
  const mentions = [...new Set([...(primary.mentions || []), ...folded.flatMap((f) => f.mentions || [])])]
    .sort((a, b) => a - b);
  const mergedFrom = folded.map((f) => ({ id: f.id, label: f.label, head: f.head }));
  const surfaces = [...new Set([...(primary.surfaces || []), ...folded.flatMap((f) => f.surfaces || [])])];
  return [{ ...primary, mentions, surfaces, mergedFrom }, ...distinct];
};

// ── The centre scanner — seat the unnamed body in the reading, so its pronouns bind by activation ──
// The census proposes the bodies and the fold pools their epithets — all admission-independent, so
// this runs UP FRONT (like the uncased read). The pipeline then admits the body INLINE as its
// epithets are read and notes it in the coref field, so the SAME activation + gendered pronoun
// binding a named figure gets now resolves the creature too: "the creature stretched. It fled." —
// "It" finds the creature freshly activated in the field and binds to IT, not to a named figure the
// reading last saw. No retroactive second cursor: the centre is instantiated (INS) before it is
// bonded (CON), in reading order (docs/unnamed-referents-relativistic.md).
//
// Only bodies that reach STAR-SCALE are seated — a pooled mass ≥ ½ the top named mass (estimated up
// front from the document's own intrinsic-capital name frequencies, so the seat decision needs no
// finished admission). A distinct low-mass remnant the fold kept apart is therefore never seated,
// and never pollutes the field. Returns { active, headToBody, bodies, scan }.
export const createCentreScanner = (sentences, { conventions, nameReferent } = {}) => {
  const centres = censusUnnamedCentres(sentences, { conventions });
  if (!centres.size) return { active: false, headToBody: new Map(), bodies: [], scan: () => [] };
  const C = { isFunction: (w) => conventions?.isFunction?.(w) ?? false };
  const proposals = [...centres.values()];
  // Mechanics propose; the talker disposes (the coref-as-proposal discipline). An injected
  // `nameReferent(proposals,{sentences})` — ideally a talker with the world knowledge that "the
  // wretch" IS "the creature" — MAY rename a body and fold synonyms, and it does so over the RAW,
  // unfolded proposals (so it can see each epithet). Absent or on any fault, the mechanical fold
  // stands. The id is re-derived from the (possibly new) label so admission and aliasing stay sound.
  let pooled;
  if (typeof nameReferent === 'function') {
    try { const named = nameReferent(proposals, { sentences }); pooled = Array.isArray(named) ? named : foldUnnamedReferents(proposals, sentences, C); }
    catch { pooled = foldUnnamedReferents(proposals, sentences, C); }
  } else {
    pooled = foldUnnamedReferents(proposals, sentences, C);
  }
  for (const b of pooled) b.id = idFor(b.label);
  // Estimate the top named mass from intrinsic-capital name frequency (a name's capital is mid-unit;
  // a sentence-initial capital is positional and skipped), so a body is seated only if it rivals a
  // real name — the star-scale test, made up front and admission-free.
  const nameFreq = new Map();
  for (const sent of sentences) {
    const ws = String(sent).match(/[\p{L}'’]+/gu) || [];
    // length ≥ 2 skips the mid-sentence pronoun "I" (and "A"), which is capital-initial everywhere
    // and would otherwise dwarf every real name and set the floor impossibly high.
    ws.forEach((w, i) => { if (i > 0 && w.length >= 2 && /^\p{Lu}/u.test(w)) { const lc = w.toLowerCase(); nameFreq.set(lc, (nameFreq.get(lc) || 0) + 1); } });
  }
  const topNamed = Math.max(0, ...nameFreq.values());
  const massFloor = Math.max(3, Math.ceil(0.5 * topNamed));
  const bodies = pooled.filter((b) => (b.mentions?.length || 0) >= massFloor);
  if (!bodies.length) return { active: false, headToBody: new Map(), bodies: [], scan: () => [] };
  const headToBody = new Map();   // bare epithet head → { id, label } of its seated body
  const headOfLabel = (l) => { const t = String(l || '').trim().toLowerCase().split(/\s+/); return singular(t[t.length - 1] || ''); };
  for (const b of bodies)
    for (const h of [b.head || headOfLabel(b.label), ...(b.mergedFrom || []).map((m) => m.head || headOfLabel(m.label))].filter(Boolean))
      headToBody.set(h, { id: b.id, label: b.label });
  // scan(sent, sentIdx) → [{ id, label, head, at }] — the body mentions in this sentence, each at its
  // PROPOSITION position `at` (sentIdx + clause ordinal / clause count) so the field decays by clause.
  const scan = (sent, sentIdx) => {
    const clauses = segmentClauses(sent);
    const spans = clauses.length ? clauses : [{ text: String(sent) }];
    const out = []; const seen = new Set();
    spans.forEach((clause, k) => {
      const at = sentIdx + (spans.length > 1 ? k / spans.length : 0);
      const s = String(clause.text || ''); const re = new RegExp(DESC_RE.source, 'g'); let m;
      while ((m = re.exec(s)) !== null) {
        const head = singular(m[1].toLowerCase());
        const body = headToBody.get(head);
        if (!body || seen.has(head + '@' + at)) continue;
        seen.add(head + '@' + at);
        out.push({ id: body.id, label: body.label, head, at });
      }
    });
    return out;
  };
  return { active: true, headToBody, bodies, scan };
};

// admitUnnamedReferents(ctx) — the pipeline's whole unnamed-referent pass, kept in this holon so the
// orchestrator gains only a call. Detects the nameless bodies (above), lets an injected
// `nameReferent(proposals,{sentences}) → proposals` hook rename/fold them (ideally the talker;
// the mechanical labels stand if it is absent or throws), then admits each like a scanned name:
// one INS per sighting (a real ×N badge), a coref trace (pronouns can now fall to it), a SYN
// folding any hook-merged synonym onto the body, and a defeasible figure-grain DEF. Returns the
// last INS `{ id, sentIdx }` so the orchestrator can advance its arrow of time. Pure but for the
// log/admission/coref it is handed — the same injected-substrate discipline the pipeline uses.
export const admitUnnamedReferents = ({ sentences, admission, conventions, corefField, log, emit,
                                     nameReferent, npEndpoints } = {}) => {
  if (!log || !admission) return { lastIns: null, unnamedRefs: [] };
  let proposals = discoverUnnamedReferents(sentences, { admission, conventions });
  if (proposals.length && typeof nameReferent === 'function') {
    try { const named = nameReferent(proposals, { sentences }); if (Array.isArray(named)) proposals = named; }
    catch { /* naming is optional — the mechanical labels stand */ }
  } else if (proposals.length > 1) {
    // No talker: fold the coreferent descriptions onto one body, mechanically and defeasibly.
    const C = { isFunction: (w) => conventions?.isFunction?.(w) ?? false };
    proposals = foldUnnamedReferents(proposals, sentences, C);
  }
  // STAR-SCALE, on the POOLED body — never a lone epithet. The creature's mass is scattered across
  // creature/monster/wretch, each below any per-head floor; folded into one body it must rival a
  // named one (½ the top name's mass, or at least the recurrence floor). Read the top named
  // referent's mass off admission's merged mentions. This is where the "a name should be here" gate
  // finally belongs — after the barycenter has gathered the body's full mass.
  let topNamed = 0;
  for (const arr of (admission.mentions?.values?.() || [])) topNamed = Math.max(topNamed, new Set(arr).size);
  const massFloor = Math.max(3, Math.ceil(0.5 * topNamed));
  proposals = proposals.filter((p) => (p.mentions?.length || 0) >= massFloor);
  // The np-object endpoints the main read already emitted (ids the relation parser minted from
  // a bare description in OBJECT position, e.g. "Frankenstein pursued the wretch" → tgt "wretch").
  // A description HEAD folded onto the body must union those orphaned lemma nodes onto it, so the
  // bond the main read DID make lands on the referent too — not just the ones the re-read adds.
  const npEnd = npEndpoints instanceof Set ? npEndpoints : new Set();
  const headOf = (label) => { const t = String(label || '').trim().toLowerCase().split(/\s+/); return singular(t[t.length - 1] || ''); };
  let lastIns = null;
  const unnamedRefs = [];
  for (const p of proposals) {
    if (!p || !p.label || !Array.isArray(p.mentions) || !p.mentions.length) continue;
    let id = null;
    for (const si of p.mentions) {
      id = admission.admit(p.label, si);
      log.append({ op: 'INS', id, label: p.label, sentIdx: si }, emit);   // shape-identical to a name's INS — no species tag
      corefField?.note?.(id, si);
      lastIns = { id, sentIdx: si };
    }
    if (id == null) continue;
    for (const alias of (p.mergedFrom || [])) {
      if (!alias || !alias.label) continue;
      const aliasId = admission.admit(alias.label, p.mentions[0]);
      if (aliasId && aliasId !== id) {
        const syn = log.append({ op: 'SYN', kind: 'merge', from: aliasId, to: id, label: p.label,
                                 sentIdx: 0, match: 'unnamed-alias', warrant: 'coreference' }, emit);
        log.append({ op: 'EVA', site: 'merge', ref: syn.seq, verdict: VERDICTS.CORROBORATED,
                     reason: 'unnamed-referent-coreference', sentIdx: 0 }, emit);
      }
    }
    // Register every description HEAD this body wears — its own and each merged alias's — onto the
    // one referent id, so the relation parser resolves "the creature <verb>" / "the wretch <verb>"
    // to it when the sentences are re-read at the retroactive cursor. Where the SAME head already
    // rode as an np-object lemma in the main read, a SYN unions that orphaned node onto the body.
    const heads = [...new Set([headOf(p.label), ...(p.mergedFrom || []).map((a) => a.head || headOf(a.label))].filter(Boolean))];
    for (const h of heads) {
      admission.aliasTo?.(h, id);
      if (idFor(h) !== id && npEnd.has(h)) {
        const syn = log.append({ op: 'SYN', kind: 'merge', from: idFor(h), to: id, label: p.label,
                                 sentIdx: 0, match: 'unnamed-surface', warrant: 'description' }, emit);
        log.append({ op: 'EVA', site: 'merge', ref: syn.seq, verdict: VERDICTS.CORROBORATED,
                     reason: 'unnamed-referent-description', head: h, sentIdx: 0 }, emit);
      }
    }
    log.append({ op: 'DEF', id, key: 'grain', value: 'figure', grain: 'Figure',
                 cue: 'unnamed-referent', defeasible: true, sentIdx: 0 }, emit);
    unnamedRefs.push({ id, label: p.label, head: p.head, heads, mentions: [...p.mentions].sort((a, b) => a - b) });
  }
  return { lastIns, unnamedRefs };
};
