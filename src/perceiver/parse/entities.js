// EO: INS·SIG·SYN(Void → Entity,Network, Making) — entity admission by gravity
// Entity admission — the ceiling the low places on what the high may claim.
//
// A capitalised span is admitted when it shows the SEMANTIC GRAVITY of a referent
// (see below) — not after an arbitrary number of sightings. Only admitted entities
// can be subjects of relations or be cited as sources for facts.
//
//   - A *multi-word* proper name ("Gregor Samsa", "Project Gutenberg") is
//     referential on its face and admits on first sighting.
//   - A single-token name admits as soon as it occupies an argument position —
//     subject, object, possessor, prepositional object, apposition bearer, or
//     vocative addressee — so a name spoken once, or spoken TO, anchors its proposition.
//   - Titles ("Mr.", "Mrs.", "Professor") are kept joined to the name and the
//     trailing period normalised, so "Mr. Samsa" is one entity, not a bare "Mr".
//
// The language-specific word-lists this turns on — prepositions, function words,
// role/kin words, clause-openers — are NOT held here. They are conventions
// (conventions.jsonl), seeded and learnable; admission READS them (injected by the
// pipeline, or the seeds as a standalone default). The parse leaf holds mechanism,
// not the language. The admission also remembers, per entity, the sentence indices
// where it was mentioned.

import { createConventions } from '../../core/conventions/index.js';
import { clusterAnchors } from './name-variants.js';
import { deriveNull } from '../../core/index.js';
import { readGrain } from './grain.js';

const TITLE = String.raw`(?:Mr|Mrs|Ms|Dr|Miss|Mister|Sir|Madam|Madame|Lady|Lord|Professor|Prof|Capt|Captain|Rev|St|Aunt|Uncle)\.?`;
// A lowercase connector (von, of, the) only counts when it sits *between* two
// capitalised words — never trailing, so "Grete the news" is just "Grete".
const CONN  = String.raw`de|von|van|der|del|di|du|la|le|of|the`;
// Letters a name is built from — read by Unicode PROPERTY, not by enumerating scripts. `\p{Lu}`
// is a capital in ANY cased writing system (Latin incl. accents, Cyrillic, Greek, Armenian,
// Georgian…), `\p{L}` any letter. So the scanner reads Пьер, Émile, Γλαύκων and Darcy as names
// with no per-language list — the language never enters the mechanism. (Scripts without case —
// Chinese, Arabic, Hebrew — carry `\p{Lu}` = ∅, so they simply do not mark names by capital; that
// is a different signal, not this one.) The `u` flag these need is safe now that the word edges
// are lookarounds, not the ASCII-only `\b`.
const U = String.raw`\p{Lu}`;
const L = String.raw`\p{L}`;
const NAME  = String.raw`[${U}][${L}]+(?:\s+(?:${CONN}\s+)?[${U}][${L}]+)*`;
// The word EDGES, script-agnostically. JS `\b` is ASCII-only — it treats a Cyrillic or accented
// initial as a non-word char, so `\bПьер` (and even `\bÉmile`) never matches at the leading edge.
// A name instead begins where the previous character is NOT a name letter and ends where the next
// is not: lookarounds over the letter class (any script), under the `u` flag every letter regex
// here now carries. The edges also exclude DIGITS (\p{N}), exactly as `\b` did — a letter run
// glued to a number is an alphanumeric code, not a name, so "CO2" and "80MW" never yield the
// bare "CO"/"MW" the letter-only edge would have cut out of the middle of the token.
const EDGE = String.raw`${L}\p{N}`;
const EDGE_L = String.raw`(?<![${EDGE}])`;
const EDGE_R = String.raw`(?![${EDGE}])`;
const CAP_RE = new RegExp(EDGE_L + String.raw`(?:${TITLE}\s+)?${NAME}` + EDGE_R, 'gu');

// ── Initialism (acronym ↔ expansion) — a learned, defeasible org alias ───────
// The orthographic MECHANISM only (the parse leaf holds mechanism, never a table):
// is `acronym` the initialism of `expansion`? Take the expansion's words, drop the
// lowercase connectors a name carries (the same CONN class — "of", "the", "von": a
// real initialism skips them, "Bank of America" → "BOA"), and compare the leading
// capitals to the acronym's letters. STRICT exact match keeps it high-precision — a
// shell that shares only some tokens ("NDMC" vs "Nashville Downtown Partnership")
// does NOT pass, which is exactly the structural distinctness §8 wants preserved.
// No acronym dictionary anywhere: a pair is proposed only when the text co-locates
// the two forms and the letters line up; the alias is then sedimented as a REC rule.
const CONN_SET = new Set(CONN.split('|'));
export const initialismMatch = (acronym, expansion) => {
  const ac = String(acronym || '').replace(/[^A-Za-z]/g, '').toUpperCase();
  if (ac.length < 2) return false;
  const all = String(expansion || '').trim().split(/\s+/).filter(Boolean);
  if (all.length < 2) return false;                   // a one-word "expansion" initialises nothing
  const initialsOf = (ws) => ws.map((w) => (w[0] || '').toUpperCase()).join('');
  // An acronym may either skip the connectors ("Nashville Downtown Partnership" → NDP)
  // or keep them ("Bank of America" → BOA): accept against the initials computed BOTH
  // ways, so either convention lines up. The expansion must still be ≥2 real words.
  const content = all.filter((w) => !CONN_SET.has(w.toLowerCase()));
  if (content.length < 2) return false;
  return ac === initialsOf(all) || ac === initialsOf(content);
};

// The parenthetical seeding context: an admitted multi-word name immediately
// followed by a parenthesised all-caps token whose letters are that name's
// initials — "Nashville Downtown Partnership (NDP)". Pure over the sentence + the
// live admission; reports the pair (with ids where the side is admitted) for the
// pipeline to commit as a SYN alias and learn as a convention.
const ACRO_RE = String.raw`[A-Z][A-Z.&]+`;
const INITIALISM_RE = new RegExp(String.raw`(${NAME})\s*\(\s*(${ACRO_RE})\s*\)`, 'gu');
export const scanInitialisms = (sentence, admission) => {
  const s = String(sentence || '');
  const out = [];
  const re = new RegExp(INITIALISM_RE.source, 'gu');
  let m;
  while ((m = re.exec(s)) !== null) {
    const expansion = cleanLabel(m[1]);
    const acronym   = m[2].replace(/[.&]/g, '');
    if (!expansion || !acronym) continue;
    if (!admission || !admission.isAdmitted(expansion)) continue;   // the expansion is the anchor
    if (!initialismMatch(acronym, expansion)) continue;
    const expansionId = admission.idOf(expansion);
    // The acronym's canonical id — idFor, the same normalisation a bare "NDP" admits
    // under — so the SYN alias the pipeline emits unions any independently-sighted
    // "NDP" (before OR after the definition) onto the expansion, and stays auditable
    // even when "(NDP)" alone never cleared gravity on its own.
    const acronymId = idFor(acronym);
    out.push({ acronym, acronymLabel: acronym, acronymId, expansion, expansionId, index: m.index });
  }
  return out;
};

// ── Functional-attribute extraction (a high-functionality identity key) ──────
// A birth year is the canonical functional person-key (§7 PER-4): at most one true
// value per entity. Read off the constructions that front-load it — the appositive
// "(born 1961)" / "(1961–1979)" and the copular "born in 1961" — and attach it to the
// nearest admitted name to the left. Pure over the sentence + admission; the value is
// a high-functionality attribute the conflict oracle vetoes a merge on when it differs
// (the worked-example-2 functional-conflict veto). Deliberately narrow: a 4-digit year
// behind an explicit "born"/date-paren, never a bare number, so it cannot misfire on
// the goldens (which carry no such construction).
const BIRTH_RE = new RegExp(String.raw`((?:${TITLE}\s+)?${NAME})\s*(?:,?\s+(?:was\s+|were\s+)?born\s+(?:in\s+|on\s+)?|\(\s*(?:born\s+|b\.\s*)?)(\d{4})\b`, 'gu');
export const scanFunctionalAttributes = (sentence, admission) => {
  const s = String(sentence || '');
  const out = [];
  const re = new RegExp(BIRTH_RE.source, 'gu');
  let m;
  while ((m = re.exec(s)) !== null) {
    const name = cleanLabel(m[1]);
    const year = m[2];
    if (!name || !year) continue;
    if (!admission || !admission.isAdmitted(name)) continue;     // attach only to a real referent
    out.push({ id: admission.idOf(name), key: 'bornOn', value: year, index: m.index });
  }
  return out;
};

// The default convention predicates, from the seeds — used by the standalone
// scanner and by an admission constructed without a live ledger. The pipeline
// passes its own (seed ∪ learned), so a document's dialect flows straight in.
// The fallback is a DEFAULT LEDGER, not a private copy of any list: the conventions holon is
// the ONE home of seeded knowledge, and everything reads it through the same accessors —
// including the registers that now carry no seed at all (role, auxiliary: learn-only).
const DEFAULT_CONVENTIONS = (() => {
  const c = createConventions();
  return {
    isStarter:     c.isStarter,
    isFunction:    c.isFunction,
    isPreposition: c.isPreposition,
    isRole:        c.isRole,
    isAuxiliary:   c.isAuxiliary,
    isDemonym:     c.isDemonym,
    isCalendar:    c.isCalendar,
  };
})();

// The honorifics admission keeps JOINED to the following name, its trailing period dropped
// ("Mr." → the label "Mr Samsa"). Exported so a downstream matcher (the reader's entity linker)
// can tolerate that same normalisation and carry the title back into the one entity span, rather
// than stranding it as loose text beside the name — one source of truth for what a title is.
export const TITLE_WORDS = new Set([
  'Mr','Mrs','Ms','Dr','Miss','Mister','Sir','Madam','Madame','Lady','Lord',
  'Professor','Prof','Capt','Captain','Rev','St','Aunt','Uncle',
]);

// A stable id from a label: lowercased, spaces → hyphens, keeping LETTERS and NUMBERS of any
// script. The old `[^a-z0-9-]` strip was Latin-only — it deleted every Cyrillic character, so a
// two-word Russian name ("Весь Толстой") collapsed to the id "-" and the whole cast merged into
// one node. `\p{L}\p{N}` keeps Cyrillic (and the Latin-1 accents a transliteration carries), so
// the id is faithful to the name in any language.
const idFor = (label) =>
  label.toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}-]/gu, '');

// ── Admission by SEMANTIC GRAVITY, not by a sighting count ──────────────────
//
// A referent earns admission the way mass accrues everywhere else in this system:
// by behaving like a referent. The old rule (admit on the second sighting) was a
// cheap proxy that both over- and under-fired — it missed a name spoken once that
// plainly anchors a proposition ("Cainan begat Mahalaleel" — Mahalaleel is real on
// first mention), and it admitted any capitalised token that merely recurred (KJV's
// "Behold,"/"Lo,"/"Hast thou" clause-openers become characters). Gravity fixes both:
//
//   a sighting in an ARGUMENT position has gravity ≥ the floor and admits at once —
//     · a possessor      "Abram's wife"        (it owns something)
//     · a kin/apposition  "his son Seth"        (a role names it)
//     · subject or object "Cainan begat X" / "X walked"  (it acts or is acted on)
//     · a vocative        "learning, Friedrich,"  (it is spoken TO — direct address)
//   a bare CLAUSE-OPENER ("Behold, …") has zero gravity, however often it recurs;
//   a bare mid-sentence mention has a little, so genuine list members still accrue
//   across a few sightings (the old recurrence intuition, kept as the weak case).

//   a bare CLAUSE-OPENER ("Behold, …") or a stray capital earns nothing, however
//   often it recurs — gravity, not a sighting count.

const GRAVITY_FLOOR = 1.0;

// The INHIBITOR for the common-noun admission catalyst (opt-in): heads that name no referent
// however often they recur — temporal, quantifier, and abstract-relational nouns. Without
// this, admitting definite common nouns runs away (the day / the way / the time flood the
// graph). Paired with a RECURRENCE barrier (a common noun must recur AND take a content verb
// before it reacts into a node), it admits "the soldier" / "the door" and refuses "the way".
const ABSTRACT_HEADS = new Set(['way', 'time', 'thing', 'matter', 'fact', 'case', 'point', 'kind', 'sort',
  'moment', 'sense', 'part', 'whole', 'same', 'other', 'first', 'last', 'rest', 'one', 'day', 'night',
  'morning', 'evening', 'while', 'end', 'side', 'reason', 'idea', 'word', 'name', 'sake', 'use', 'need']);

// A content head — an open-class word (`C.isFunction` is false), so a name beside it is a verb's
// argument rather than a function word's neighbour. Lowercase-initial of ANY script (\p{Ll}), so
// a Russian verb ("сказал") gives its subject the same gravity an English one does; without this
// the ASCII test saw no Cyrillic neighbour and bare Russian names never earned a sighting.
const isContent = (w, C) => !!w && /^\p{Ll}[\p{Ll}'’]*$/u.test(w) && w.length >= 2 && !C.isFunction(w);

// The gravity of one sighting, read off its local context against the live conventions `C`.
// Pure and modelless — position is the witness, the word-classes are the ledger's. Returns
// `{ g, strong }`: `g` is the referential mass (the floor or nothing), `strong` marks a cue
// that fixes a referent WHATEVER THE WORD IS — a named possession, an apposition/role bearer,
// a preposition's object, a set-off vocative. A STRONG sighting admits on its own; a WEAK one
// (mere positional adjacency to a content word or auxiliary) is enough for an orthographically
// stable name but not for a word that also lives lowercase in this document, since a lone weak
// sighting is exactly what mis-reads a clause-initial capital ("Very well…") as a subject.
const sightingGravity = (sentence, start, end, C, label = null) => {
  const after = sentence.slice(end);
  // A POSSESSIVE is the apostrophe with an optional single possessive `s` and NOTHING more
  // ("Abram's", "the Russians'"). A CONTRACTION — "Don't", "Isn't", "we'll" — is an apostrophe
  // followed by other letters, and must NOT read its stem as a possessor (the "Don"/"Isn" bug).
  if (/^['’]s?(?![A-Za-z])/.test(after)) return { g: 1.0, strong: true };   // possessor
  const before = sentence.slice(0, start);
  // Neighbours of ANY script (\p{L}), so a Cyrillic verb/noun beside a name is seen as company.
  const prev = (before.match(/([\p{L}'’]+)\s*$/u) || [])[1];
  const next = (after.match(/^\s*([\p{L}'’]+)/u) || [])[1];
  // A demonym / proper adjective ("the Russian novelist", "learning about American
  // television", "their Jewish king") is ATTRIBUTIVE — it modifies the following noun,
  // it is not a referent in its own right. That holds REGARDLESS of what precedes it,
  // so this is tested before the role/preposition branch ("about American" must not
  // read American as the object of "about"; the object is "television"). The check is on
  // the cleaned LABEL, not the raw span — a leading starter the scanner swept in ("The
  // French translation") would otherwise hide the demonym. It earns gravity only in a
  // genuinely NOMINAL frame: a possessor ("the Russian's", handled above) or the subject
  // of a copula/auxiliary ("Russian is a language"). Everything else fails toward silence
  // — the system's stance wherever a reading is uncertain, and a far cheaper error than
  // admitting a nationality as a character (the floor that turned "the Russian novelist"
  // into a figure the protagonist's first-person "I" then resolved to).
  // A calendar token (weekday / month) is a temporal expression, not a referent — deny
  // it referential gravity wherever it lands, the argument slot included ("reconvene
  // Monday"). A genuinely recurring personification would re-earn it as the convention
  // is revised; the one-shot date that the floor mistook for a figure does not.
  const word = label ?? sentence.slice(start, end);
  if (C.isCalendar && C.isCalendar(word)) return { g: 0.0, strong: false };
  if (C.isDemonym && C.isDemonym(word))
    return (next && C.isAuxiliary(next)) ? { g: 1.0, strong: false } : { g: 0.0, strong: false };
  // STRONG cues — the token is a referent whatever the word is.
  if (prev && (C.isRole(prev) || C.isPreposition(prev))) return { g: 1.0, strong: true };  // "his son Seth" / "unto Noah"
  // A VOCATIVE / set-off name (STRONG) — a proper name inset by punctuation on BOTH sides
  // (", Friedrich," / ", Friedrich.") — is direct address, apposition, or a list
  // member, and each is a referent: you address a referent, you appose a referent,
  // a comma-run of names is a roster of them ("Adam, Seth, Enosh"). This is the
  // argument position the word-adjacency checks above cannot see, because a comma
  // stops `prev`/`next` from reading across it — so a name spoken TO, or one that
  // sits between two commas, earns nothing though it is as referential as a subject.
  // The BOTH-sides requirement is what keeps it high-precision: it fires on an inset
  // name, not on a clause-initial one, so it never mistakes a heading or a stray
  // capital for a figure. It is placed AFTER the calendar/demonym denials, so
  // "…, Monday," and "…, Russian," stay refused; and `cleanLabel`'s starter strip has
  // already removed "Behold,"/"Lo,"/"Verily," before a candidate ever reaches gravity,
  // so a KJV clause-opener cannot slip in as a vocative here either.
  if (/,\s*$/.test(before) && (after === '' || /^\s*[,.;:!?)]/.test(after))) return { g: 1.0, strong: true };
  // WEAK cues — mere positional adjacency to a content word (subject / object) or an
  // auxiliary. Enough for an orthographically STABLE name, but a lone weak sighting is what
  // mis-reads a clause-initial capital ("Very well…", "Come along…") as a subject, so an
  // unstable token (§ observe) needs a strong cue or recurrence before it admits on these.
  if (isContent(next, C) || isContent(prev, C)) return { g: 1.0, strong: false };  // subject ("X walked") / object ("begat X")
  if (next && C.isAuxiliary(next)) return { g: 1.0, strong: false };               // subject of a copula/aux ("Alice is …")
  return { g: 0.0, strong: false };                                  // no referential gravity
};

// A bare article / coordinator can never be the LAST word of a referent. When sentence
// segmentation welds a heading or fragment onto the next clause ("Characters" + "The
// X-Files…", "…in general" + "The X-Files…"), the capitalised-name scan grabs the join
// as a two-word name ("Characters The", "General The"), which — being multi-word —
// admits free on first sighting. Trimming the trailing connector collapses it to the
// single token, which must then earn referential gravity on its own (and a heading word
// at a segment start, with no argument context, does not). Mirrors the leading-starter
// strip above at the other end of the span.
const TRAILING_CONNECTOR = new Set(['the', 'a', 'an', 'of', 'and', 'or', '&']);

const cleanLabel = (raw, C = DEFAULT_CONVENTIONS) => {
  let words = raw.trim().split(/\s+/);
  while (words.length > 0 && C.isStarter(words[0])) words.shift();
  while (words.length > 0 && TRAILING_CONNECTOR.has(words[words.length - 1].toLowerCase())) words.pop();
  if (words.length === 0) return null;
  // Normalise a leading title: drop the trailing period, keep it joined.
  const head = words[0].replace(/\.$/, '');
  if (TITLE_WORDS.has(head)) {
    if (words.length === 1) return null; // a bare title is not an entity
    words = [head, ...words.slice(1)];
  }
  if (words.length === 1 && C.isStarter(words[0])) return null;
  return words.join(' ');
};

// The conventions injected here are the language spec admission reads — the
// pipeline passes its live ledger (seed ∪ what the document taught); a standalone
// caller gets the seeds. Only the predicates admission needs are taken, so any
// conventions object (or a partial stub) works.
export const createEntityAdmission = ({ conventions, commonNouns = false, text = '' } = {}) => {
  const C = conventions ? {
    isStarter:     (w) => conventions.isStarter(w),
    isFunction:    (w) => conventions.isFunction(w),
    isPreposition: (w) => conventions.isPreposition(w),
    isRole:        (w) => conventions.isRole(w),
    isAuxiliary:   (w) => conventions.isAuxiliary(w),
    isDemonym:     (w) => conventions.isDemonym ? conventions.isDemonym(w) : false,
    isCalendar:    (w) => conventions.isCalendar ? conventions.isCalendar(w) : false,
  } : DEFAULT_CONVENTIONS;
  const wordsInContent = String(text || '').split(/[^\p{L}\p{N}]+/u).filter(Boolean).length;
  const contentScale = Math.max(1, Math.log2(Math.max(2, wordsInContent) / 180));
  const bornFloor = (scores) => {
    const xs = scores.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
    const nul = xs.length >= 12 ? deriveNull(xs, { scale: 'linear', alpha: 0.05, N: Math.max(xs.length, Math.ceil(Math.sqrt(Math.max(1, wordsInContent)))), grain: 0.25 }) : Infinity;
    return Number.isFinite(nul) ? Math.max(GRAVITY_FLOOR, nul, contentScale) : Math.max(GRAVITY_FLOOR, xs.length ? xs[Math.max(0, (xs.length - 1) >> 1)] : 0, contentScale);
  };

  const counts    = new Map(); // label → count
  const gravity   = new Map(); // label → Σ referential gravity over its sightings
  const admitted  = new Map(); // label → id (post-admission)
  const sightSent = new Map(); // label → number[] (every sighting's sentIdx)
  const mentions  = new Map(); // id    → number[] (sentence indices, ordered)
  const initialisms = new Map(); // acronym label → expansion id (learned org alias)
  const strongSeen = new Map(); // label → true once a STRONG cue has vouched for it
  const subjSight = new Map(); // label → times seen in SUBJECT position (nominative signal)
  const oblSight  = new Map(); // label → times seen OBLIQUE (preceded by an adposition — a setting signal)

  // ── The document's own gravity signals — read once, no title list ────────────────
  // A capitalised token is a MOON — a shared honorific, not a referent — when it heads ≥2
  // DISTINCT PEOPLE ("Prince" over Andrew & Vasíli, "Mr" over Darcy & Bingley): massless as a
  // bare figure, and it must not fuse the planets it orbits into one node. "Distinct" is by
  // NAME-VARIANT CONTAINMENT, not by the second token — "Elvis Presley" and "Elvis Aaron
  // Presley" are ONE person (one folds into the other), so "Elvis" heads a single planet and
  // is a given name, not a moon. And a token is ORTHOGRAPHICALLY UNSTABLE when it also appears
  // LOWERCASE in this document ("prince", "church", "come") — a common word capitalised by
  // position, which a lone weak sighting must not mint as a figure. Both are read from the
  // text's own statistics, so admission stays language-free (mechanism, not a list of titles).
  const headNames     = new Map();   // leading token → Set(full label) over multi-word names
  const docLowerVocab = new Set();   // words seen lowercase in the source
  const capCount      = new Map();   // lowercased form → times it appeared CAPITAL-initial
  const lowCount      = new Map();   // lowercased form → times it appeared lowercase-initial
  const internalCap   = new Map();   // lowercased form → CAPITAL-initial times NOT at a unit boundary (intrinsic caps)
  const moonCache     = new Map();   // leading token → { size, val } (recomputed only as the set grows)
  const boundMassCache = new Map();  // leading token → Σ sightings where it is only a prefix (planet-dominance)
  const preferredCase = new Map();   // idFor(label) → the first MIXED-case spelling seen (canonical form)
  const notePlanet = (label) => {
    const w = label.split(' ');
    if (w.length >= 2) { let s = headNames.get(w[0]); if (!s) headNames.set(w[0], s = new Set()); s.add(label); }
  };
  // An ALL-CAPS spelling — a play's speaker cue ("NORA."), a sign, a shouted line, a section
  // heading — is the SAME referent as its mixed-case form ("Nora"). Read the document's own
  // casing: prefer the first mixed-case spelling as canonical, so "NORA"/"MRS LINDE"/"SHERLOCK
  // HOLMES" fold onto "Nora"/"Mrs Linde"/"Sherlock Holmes" instead of standing as loud twins.
  const isAllCaps = (l) => /[A-ZÀ-ÞА-ЯЁ]/.test(l) && l === l.toUpperCase();
  // A word shouted in caps ("LINDE", "NORA") — the mark of a speaker cue / heading token, even
  // inside an otherwise mixed label ("Mrs LINDE").
  const hasCapsWord = (l) => l.split(' ').some((w) => w.length >= 2 && /[A-ZÀ-ÞА-ЯЁ]/.test(w) && w === w.toUpperCase());
  const canon = (label) => {
    if (!hasCapsWord(label)) return label;
    const pref = preferredCase.get(idFor(label));
    return (pref && pref !== label) ? pref : label;
  };
  if (text) {
    // Read the document's own casing over words of ANY script (Unicode split, no `u`-flag \b
    // needed on a split). A word that appears lowercase is orthographically unstable; the
    // CAP-RATE — how often a form is capital-initial — separates a NAME (always capital) from a
    // function/common word capitalised only by sentence position (mostly lowercase), in any
    // language and with no list.
    // Position-aware: a word capitalised only at a unit BOUNDARY (line/sentence start) is
    // capitalised by POSITION; a referent's capital is INTRINSIC — it also appears MID-unit.
    // internalCap records the intrinsic caps, so a positional word (verse-initial "Come"/"Ay"/
    // "Mas": high cap-rate yet never mid-sentence) is told from a name with no word list.
    for (const unit of String(text).split(/(?<=[.!?])\s+|\n+/u)) {
      const ws = unit.match(/[\p{L}'’]+/gu) || [];
      ws.forEach((raw, i) => {
        const w = raw.replace(/^['’]+/, '').replace(/['’].*$/, '');   // strip leading apostrophe ("'Tis") and possessive
        if (!w) return;
        const lc = w.toLowerCase();
        if (w[0] === lc[0]) { docLowerVocab.add(lc); lowCount.set(lc, (lowCount.get(lc) || 0) + 1); }
        else { capCount.set(lc, (capCount.get(lc) || 0) + 1); if (i > 0) internalCap.set(lc, (internalCap.get(lc) || 0) + 1); }
      });
    }
    const pre = new RegExp(CAP_RE.source, 'gu');
    const labels = [];
    let pm; while ((pm = pre.exec(text)) !== null) { const lab = cleanLabel(pm[0], C); if (lab) labels.push(lab); }
    // The canonical spelling of a name is its cleanest cased form — no word shouted in caps.
    for (const lab of labels) if (!hasCapsWord(lab)) { const id = idFor(lab); if (!preferredCase.has(id)) preferredCase.set(id, lab); }
    // A moon claim (≥2 distinct identities under one head) needs RECURRING evidence: the greedy
    // scan glues a one-off two-name weld ("Natásha Prince Andrew") as readily as a real second
    // identity, so a hapax label must never feed the orbital count — it would wrongly moon the
    // head and refuse a real, well-attested bare figure (Natásha, 1213 sightings) admission.
    // Feed EVERY weld to its head's orbit — even a one-off ("Exeunt Macbeth" seen once still shows
    // Exeunt orbiting Macbeth). No recurrence proxy is needed: THE LAW (isMoon) protects a real
    // figure by planet dominance — a head that stands alone as an attested figure is never mooned,
    // however many clause-edge welds land under it.
    for (const lab of labels) notePlanet(canon(lab));
  }
  // THE MOON LAW — the gravity law one level up, told by which body dominates, no word list.
  //   PLANET: a head whose OWN referential mass (gravity, standing alone) strictly outweighs the
  //     mass it lends to its orbit (appearances as a bare prefix on a bound name). "Quijote",
  //     "Natásha", "Ross" stand alone and prefix almost nothing → planets, never mooned by a
  //     clause-edge weld. Self-mass is GRAVITY, not raw count, so a bare "Exeunt."/"Enter." line —
  //     which acts on nothing — earns none and cannot masquerade as standing alone.
  //   MOON: a head that exists only bound — a shared prefix orbiting ≥2 distinct planets. isOrbital
  //     then splits it: apparatus (orbits many — "Enter"/"Exeunt"/"See") vs title (few — "Prince").
  // Each planet is a name-variant CLUSTER, so co-referential variants collapse before the count.
  const orbitPlanets = (tok) => {   // the labels welded under tok, filler trimmed ("Quijote De" → bare head, no rival)
    const set = headNames.get(tok);
    if (!set) return [];
    return [...set].map((l) => trimWeld(l).label).filter((l) => l !== tok && l.includes(' '));
  };
  const orbitCount = (tok) => new Set(clusterAnchors(orbitPlanets(tok)).values()).size;
  const boundMass = (tok) => {      // Σ sightings where tok is only a prefix on a longer name
    if (boundMassCache.has(tok)) return boundMassCache.get(tok);
    let m = 0;
    for (const [lab, e] of admissionProfile.stats) if (lab.length > tok.length && lab.startsWith(tok + ' ')) m += e.count;
    boundMassCache.set(tok, m);
    return m;
  };
  const standsAlone = (tok) => (admissionProfile.stats.get(tok)?.gravity || 0) > boundMass(tok);
  const isMoon = (tok) => {
    if (standsAlone(tok)) return false;   // own mass dominates → a planet, not a moon
    const set = headNames.get(tok);
    if (!set || set.size < 2) return false;
    const cached = moonCache.get(tok);
    if (cached && cached.size === set.size) return cached.val;
    const val = orbitPlanets(tok).length >= 2 && orbitCount(tok) >= 2;
    moonCache.set(tok, { size: set.size, val });
    return val;
  };
  const isUnstable = (tok) => docLowerVocab.has(String(tok).toLowerCase());
  // isFunctionWord(tok) — the seed-free, omnilingual function/common-word test: a form that
  // recurs AND is PREDOMINANTLY LOWERCASE in the document (capital only ~by sentence position).
  // Names run ~1.0 capital ("Pierre", "Ростов"); pronouns/openers run low ("he" .19, "ты" .25,
  // "very" .05, "что" .02); a genuine capitalised topic noun sits in between ("Dolphins" .60),
  // so a strict floor keeps it. This is what the induced SLOT cannot do — pronouns and names
  // share one slot; only the writing system's own casing tells them apart.
  const isFunctionWord = (tok) => {
    const lc = String(tok).toLowerCase();
    const c = capCount.get(lc) || 0, l = lowCount.get(lc) || 0, total = c + l;
    return total >= 5 && (c / total) < 0.35;
  };
  // isPositional — the casing law where cap-rate fails: a token that ALSO appears lowercase yet is
  // almost never capitalised MID-unit is capitalised by POSITION, not because it names anything
  // ("Come"/"Ay"/"Mas"/"Tis" at a verse-line start — high cap-rate, but intrinsic caps ~0). A real
  // referent's capital is intrinsic (it appears mid-sentence), so a name (never lowercase, or richly
  // mid-unit) is untouched. Omnilingual, no word list — the document's own positional casing.
  const isPositional = (tok) => {
    const lc = String(tok).toLowerCase();
    const c = capCount.get(lc) || 0, l = lowCount.get(lc) || 0, ic = internalCap.get(lc) || 0;
    return l > 0 && c >= 4 && (ic / c) < 0.2;
  };
  // isFiller — a STRICTER cap-rate floor than isFunctionWord: a token capitalised almost only by
  // sentence position (an opener "About"/"Now", cap-rate < 0.2), NOT a title that heads names
  // ("Count" .40, "Countess" .25, "Prince" .82, kept). Byte-distributional; casing only sharpens it.
  const isFiller = (tok) => {
    const lc = String(tok).toLowerCase();
    const c = capCount.get(lc) || 0, l = lowCount.get(lc) || 0, total = c + l;
    return total >= 8 && (c / total) < 0.2;
  };
  // trimWeld — the greedy scanner concatenates any run of capitals, so a span can absorb a filler
  // an opener glued to a name ("About Mikhelson"→"Mikhelson"). Trim filler off the EDGES only (a
  // two-name weld is separate), keeping ≥1 word; `lead` = chars trimmed off the front, so the
  // caller moves the sighting onto the real name. A no-op on a clean (high cap-rate) name.
  const trimWeld = (label) => {
    let words = label.split(' '), lead = 0;
    while (words.length > 1 && isFiller(words[0])) { lead += words[0].length + 1; words = words.slice(1); }
    while (words.length > 1 && isFiller(words[words.length - 1])) words = words.slice(0, -1);
    return { label: words.join(' '), lead };
  };


  const admissionProfile = (() => {
    const stats = new Map();
    for (const unit of String(text || '').split(/(?<=[.!?])\s+|\n+/u).filter(Boolean)) {
      const re = new RegExp(CAP_RE.source, 'gu'); let m;
      while ((m = re.exec(unit)) !== null) {
        const cleaned = cleanLabel(m[0], C); if (!cleaned) continue;
        const wt = trimWeld(canon(cleaned)), label = wt.label;
        const cue = sightingGravity(unit, m.index + wt.lead, m.index + wt.lead + label.length, C, label);
        const e = stats.get(label) || { count: 0, gravity: 0, strong: false, subject: 0, multiword: label.includes(' ') };
        e.count += 1; e.gravity += Math.max(0, cue.g); e.strong ||= cue.strong && cue.g > 0;
        const nx = (unit.slice(m.index + m[0].length).match(/^\s*([\p{L}'’]+)/u) || [])[1];
        if (isContent(nx, C) || (nx && C.isAuxiliary(nx))) e.subject += 1;
        stats.set(label, e);
      }
    }
    const scoreOf = (e) => e.gravity + Math.max(0, e.count - 1) * 0.5 + e.subject * 0.5;
    const floor = bornFloor([...stats.values()].map(scoreOf)), allowed = new Set();
    for (const [label, e] of stats) {
      const titled = e.multiword && TITLE_WORDS.has(label.split(/\s+/)[0]?.replace(/\.$/, ''));
      const holonic = titled || /[^A-Za-z\s.-]/.test(label) || e.strong || e.subject > 0 || e.count >= (e.multiword ? 2 : 3);
      if ((scoreOf(e) >= floor && holonic) || (e.multiword && holonic)) allowed.add(label);
    }
    return { floor, allowed, stats };
  })();

  // An APPARATUS label ("Enter Ross", "See CIA") is an orbital VIEW of its planet, not a referent —
  // resolve it to the planet so the figure emerges. Two directions of the nested law decide it:
  //   POSSIBILITY (low → high): the fold is possible only if the remainder standsAlone — the gravity
  //     law must already admit it as a figure ("Ross" acts; "States" barely does).
  //   PROBABILITY (high → low): the compound holon conditions its parts. Dissolve only when the
  //     remainder OUT-MASSES the compound it sits in — "Enter Ross"/"See CIA" (the figure dwarfs the
  //     stage-cue/citation) go; "United States"/"Bin Ladin"/"Central Intelligence Agency" (the
  //     compound is the heavier mass) stay whole, though "United"/"Bin"/"Central" each head many
  //     names. The tie keeps the compound — the holon's existence is a prior in its favour.
  const isOrbital = (tok) => isMoon(tok) && orbitCount(tok) >= 3;   // orbits many → apparatus, not a title
  const planetOf = (label) => {
    const sp = label.indexOf(' ');
    if (sp < 0) return label;
    const head = label.slice(0, sp), rest = label.slice(sp + 1);
    if (!isOrbital(head)) return label;
    const gRest = admissionProfile.stats.get(rest)?.gravity || 0;
    const gWhole = admissionProfile.stats.get(label)?.gravity || 0;
    if (gRest > gWhole && standsAlone(rest)) return rest;
    return label;
  };

  // Sediment a learned acronym↔expansion alias into admission state: a bare acronym
  // now RESOLVES to the expansion's id without re-deriving (the §8 ORG-1 promise).
  // Re-points the acronym's label so every later sighting is admitted under the
  // expansion — the same state mutation the head (given-name) alias makes, applied
  // to organisations. The SYN event the pipeline emits is the auditable record; this
  // is the fast path that keeps the document's own later mentions on one node.
  const registerInitialism = (acronymLabel, expansionId) => {
    if (!acronymLabel || !expansionId) return;
    initialisms.set(acronymLabel, expansionId);
    admitted.set(acronymLabel, expansionId);
  };

  const noteMention = (id, sentIdx) => {
    if (sentIdx == null) return;
    const arr = mentions.get(id) || [];
    arr.push(sentIdx);
    mentions.set(id, arr);
  };

  // Name-containment synthesis (SYN): a single-token name contained in an already-
  // admitted 2–3 word name. The WARRANT is split, because containment is not one
  // thing — this is the mr/mrs-samsa lesson:
  //
  //   'head' — the token is the GIVEN NAME (first word): "Gregor" ⊂ "Gregor Samsa".
  //            A given name individuates, so this is the high-confidence identity
  //            join: the id is unified here, as it always was.
  //   'tail' — the token is the SURNAME (last word): "Samsa" ⊂ "Gregor Samsa".
  //            A surname is SHARED across a family, so the join is THIN. It is NOT
  //            unified here; it carries the rebutter "a distinct agent bears this
  //            surname" and the pipeline commits it defeasibly, overturning it the
  //            moment the surname proves shared (the father acting alone).
  //
  // Returns { id, kind, token } (token = the shared single-token side) or null.
  const aliasOf = (label) => {
    const t = label.split(' ');
    for (const [lab, id] of admitted) {
      const lt = lab.split(' ');
      if (t.length === 1 && lt.length >= 2 && lt.length <= 3) {
        if (lt[0] === t[0])             return { id, kind: 'head', token: t[0] };
        if (lt[lt.length - 1] === t[0]) return { id, kind: 'tail', token: t[0] };
      }
      if (lt.length === 1 && t.length >= 2 && t.length <= 3) {
        if (t[0] === lt[0])             return { id, kind: 'head', token: lt[0] };
        if (t[t.length - 1] === lt[0])  return { id, kind: 'tail', token: lt[0] };
      }
    }
    return null;
  };

  const observe = (sentence, sentIdx = null) => {
    const seenInSentence = new Set();
    const out = [];
    const re = new RegExp(CAP_RE.source, 'gu');
    let m;
    while ((m = re.exec(sentence)) !== null) {
      const cleaned = cleanLabel(m[0], C);
      if (!cleaned) continue;
      const wt = trimWeld(canon(cleaned));   // canon folds an ALL-CAPS cue onto its mixed-case referent; trim a welded opener
      // An orbital-moon head ("Enter Ross", "See CIA") is apparatus, not a name — resolve the span
      // onto the planet it orbits, so the figure emerges (the remainder is a suffix of the label).
      const planet = planetOf(wt.label);
      const lead = wt.lead + (planet.length < wt.label.length ? wt.label.length - planet.length : 0);
      const label = planet;
      const mStart = m.index + lead, mEnd = mStart + label.length;   // the real name's span (past any trimmed filler / orbital head)
      if (seenInSentence.has(label)) continue;
      seenInSentence.add(label);

      if (sentIdx != null) {
        const s = sightSent.get(label) || [];
        s.push(sentIdx);
        sightSent.set(label, s);
      }

      const c = (counts.get(label) ?? 0) + 1;
      counts.set(label, c);
      const multiword = label.includes(' ');
      // Accrue this sighting's gravity. A multi-word proper name is referential on its face
      // (it is not a clause-opener accident), so it carries the floor and counts as strong.
      let strongCue = true;
      const cue = sightingGravity(sentence, mStart, mEnd, C, label);
      strongCue = multiword ? (cue.strong || (admissionProfile.stats.get(label)?.count || 0) >= 2) : cue.strong;
      const sightGravity = multiword ? GRAVITY_FLOOR : cue.g;
      gravity.set(label, (gravity.get(label) || 0) + sightGravity);
      if ((strongCue || multiword) && sightGravity > 0) strongSeen.set(label, true);
      // Company counters, either width — the GRAIN reader's evidence (grain.js) and the
      // declension fold's nominative anchor read these. SUBJECT position (followed by a content
      // word — it acts): a nominative-base does this a lot; an oblique rarely does. This is what
      // tells a declension from an independent name that merely shares a stem (Франция the
      // subject vs Франца the genitive of Франц). OBLIQUE position (preceded by an adposition —
      // "in London", "unto Nineveh"): what is moved THROUGH and seldom acts is a setting.
      const nx = (sentence.slice(mEnd).match(/^\s*([\p{L}'’]+)/u) || [])[1];
      if (isContent(nx, C)) subjSight.set(label, (subjSight.get(label) || 0) + 1);
      const pv = (sentence.slice(0, mStart).match(/([\p{L}'’]+)\s*$/u) || [])[1];
      if (pv && C.isPreposition(pv.toLowerCase())) oblSight.set(label, (oblSight.get(label) || 0) + 1);
      const g = gravity.get(label);

      // Gravity gates on a single-token candidate, read from the document's own statistics:
      //   · a MOON (heads ≥2 distinct people — "Prince", "Mr") is never a bare referent, no
      //     matter how much gravity it accrues — it is a shared honorific, not a figure;
      //   · an UNSTABLE token (also seen lowercase here) admits on its FIRST sighting only via
      //     a STRONG cue, so a clause-opener / common noun capitalised by position ("Very",
      //     "Come") never mints off a lone weak sighting. Recurrence rescues it — a word that
      //     recurs as an argument IS a discourse topic ("Dolphins" range… Dolphins are…), and
      //     a stable name (never seen lowercase) is unaffected by this gate entirely.
      const bareRefused = !multiword &&
        (isMoon(label)
         || (isUnstable(label) && !strongSeen.has(label) && c < 2)
         || (isFunctionWord(label) && !strongSeen.has(label))     // predominantly-lowercase → function/common word
         || isPositional(label));    // capital only by line position → not a referent, even inset by commas (it appears lowercase, so no name is caught)
      // A still-ALL-CAPS multi-word label (canon found no mixed-case twin) of ≥3 words is a
      // section HEADING shouted in caps ("KINGDOM OF DARIUS", "CONCERNING NEW PRINCIPALITIES…"),
      // not a figure — the document's own casing says so. Refuse it.
      const headingRefused = multiword && isAllCaps(label) && label.split(/\s+/).length >= 3;

      if (admitted.has(label)) {
        const id = admitted.get(label);
        noteMention(id, sentIdx);
        out.push({ status: 'present', id, label });
      } else if (g >= GRAVITY_FLOOR && !bareRefused && !headingRefused && !(multiword && !admissionProfile.allowed.has(label) && (admissionProfile.stats.get(label)?.count || 0) < 2 && sentence.replace(/^[\s"'“”‘’(]+|[\s"'“”‘’).,;:!?]+$/g, '') === m[0].replace(/^[\s"'“”‘’(]+|[\s"'“”‘’).,;:!?]+$/g, ''))) {
        if (multiword) notePlanet(label);   // feed the orbit; THE LAW protects real figures by dominance
        const rawId = idFor(label);
        let alias = aliasOf(label);
        // A HEAD (given-name) containment unifies the id — but NOT through a MOON token:
        // "Prince Vasíli" is not "Prince Andrew" because they share "Prince", so a head match
        // on a shared honorific is dropped and each name keeps its own id. A TAIL (surname)
        // containment never unifies here — the entity keeps its own id, so the thin merge the
        // pipeline commits can be defeated by a later event (the append-only discipline).
        if (alias && alias.kind === 'head' && isMoon(alias.token)) alias = null;
        const head = alias && alias.kind === 'head';
        const id = head ? alias.id : rawId;
        admitted.set(label, id);
        // Seed/accumulate mentions under the (possibly shared) referent id;
        // the candidate sighting had no id yet, so the first line is not lost.
        if (!mentions.has(id)) mentions.set(id, []);
        for (const si of (sightSent.get(label) || [])) mentions.get(id).push(si);
        out.push({
          status: 'admit', id, label, rawId,
          aliasOf:   alias ? alias.id : null,
          aliasKind: alias ? alias.kind : null,
          surname:   alias && alias.kind === 'tail' ? String(alias.token).toLowerCase() : null,
        });
      } else {
        out.push({ status: 'candidate', label });
      }
    }

    // The COMMON-NOUN CATALYST (opt-in). A definite common-noun referent ("the soldier")
    // never enters the capitalised scan above — it is not the reagent that reaction accepts.
    // This is a second, higher-barrier pathway: a head reacts into a node only when it RECURS
    // (≥2 sightings) AND accrues argument gravity (it takes a content verb), and is not an
    // inhibited head (function / starter / calendar / abstract). The recurrence requirement
    // is the raised activation energy a weaker, non-capitalised reagent must clear; the
    // word-class checks are the inhibitor that keeps the graph from flooding. Off by default,
    // so the capitalised reading is byte-identical.
    if (commonNouns && sentIdx != null) {
      const dre = /\bthe\s+([a-z][a-z]{2,})\b/gi;   // case-insensitive: sentence-initial "The X" counts too
      let dm;
      const here = new Set();
      while ((dm = dre.exec(sentence)) !== null) {
        const head = dm[1].toLowerCase();
        if (here.has(head)) continue; here.add(head);
        if (C.isFunction(head) || C.isStarter(head) || (C.isCalendar && C.isCalendar(head)) || ABSTRACT_HEADS.has(head)) continue;
        const hs = dm.index + dm[0].length - head.length;
        const sc = (counts.get(head) ?? 0) + 1; counts.set(head, sc);
        const sg = (gravity.get(head) || 0) + sightingGravity(sentence, hs, hs + head.length, C, head).g;
        gravity.set(head, sg);
        const ss = sightSent.get(head) || []; ss.push(sentIdx); sightSent.set(head, ss);
        if (admitted.has(head)) { const id = admitted.get(head); noteMention(id, sentIdx); out.push({ status: 'present', id, label: head }); }
        else if (sc >= 2 && sg >= GRAVITY_FLOOR) {           // recurrence barrier + argument gravity
          const id = idFor(head);
          admitted.set(head, id);
          if (!mentions.has(id)) mentions.set(id, []);
          for (const si of ss) mentions.get(id).push(si);
          out.push({ status: 'admit', id, label: head, rawId: id, aliasOf: null, aliasKind: null, surname: null, commonNoun: true });
        }
      }
    }
    return out;
  };

  return {
    observe,
    registerInitialism,
    isAdmitted: (label) => admitted.has(label),
    idOf:       (label) => admitted.get(label),
    // Admit a referent DISCOVERED outside the capital scan — an uncased-script figure found by
    // gravity (parse/uncased.js), where a name carries no capital to anchor on. It joins the same
    // maps as a scanned name (id by the same normalisation, one mention per sighting), so the graph,
    // coref, and reading treat a kanji figure exactly like a capitalised one. Idempotent on the id.
    admit: (label, sentIdx) => {
      let id = admitted.get(label);
      if (!id) { id = idFor(label); admitted.set(label, id); }
      noteMention(id, sentIdx);
      return id;
    },
    // Point a surface at an ALREADY-KNOWN referent id, the way registerInitialism re-points a
    // bare acronym onto its expansion. The unnamed-referent read uses it to register a nameless
    // figure's description HEADS ("creature", "wretch") on the ONE body it admitted, so the
    // relation parser's definite-common-noun subject path (relations.js: "the creature <verb>")
    // resolves them to that body when the read is re-run at the retroactive cursor. Never mints
    // an id — the id must already exist — and never rewrites a real admission that carries mass.
    aliasTo: (label, id) => { if (label && id) admitted.set(label, id); },
    initialismOf: (acronymLabel) => initialisms.get(acronymLabel) ?? null,
    labelOf:    (id)    => {
      for (const [label, eid] of admitted) if (eid === id) return label;
      return null;
    },
    get counts()   { return counts; },
    get admitted() { return admitted; },
    get mentions() { return mentions; },
    get initialisms() { return initialisms; },
    get subjSight() { return subjSight; },
    get oblSight()  { return oblSight; },
    get admissionFloor() { return admissionProfile.floor; },
    get sightSent() { return sightSent; },
    // The per-referent signals the individuation gate reads (individuation.js) — a NARROWED
    // contract over the maps admission already closes over, never a reach into internals.
    // `mass` is the sighting count, `gravity` the accrued referential mass, and `subjShare`
    // = subj / (subj + obl) the agency signal (it ACTS — what keeps a setting off the cast).
    // Accepts a label (admission's native key) or an admitted id; reads nothing it mutates.
    signals: (labelOrId) => {
      let label = labelOrId;
      if (!counts.has(label) && admitted.size) {
        for (const [lab, id] of admitted) if (id === labelOrId) { label = lab; break; }
      }
      const subj = subjSight.get(label) || 0;
      const obl  = oblSight.get(label) || 0;
      const denom = subj + obl;
      return {
        mass:      counts.get(label) || 0,
        gravity:   gravity.get(label) || 0,
        subjShare: denom > 0 ? subj / denom : 0,
        oblShare:  denom > 0 ? obl / denom : 0,
      };
    },
    // The GRAIN of an admitted label (grain.js) — figure / kind / setting, read off the
    // document's own company statistics. Null = HELD (no clean signal); defeasible by design.
    // `oblExtra` adds oblique sightings counted AFTER the read — under adpositions the document
    // itself taught (parse/adpositions.js), which observe()'s seeded register couldn't see.
    grainOf: (label, { oblExtra = 0 } = {}) => readGrain({
      count: counts.get(label) ?? 0,
      subj:  subjSight.get(label) ?? 0,
      obl:   (oblSight.get(label) ?? 0) + oblExtra,
      strong: strongSeen.has(label),
      lowercaseForm: /^\p{Ll}/u.test(label),
      lowerTwin:  !label.includes(' ') ? (lowCount.get(label.toLowerCase()) ?? 0) : 0,
      pluralTwin: !label.includes(' ') ? (lowCount.get(label.toLowerCase() + 's') ?? 0) : 0,
    }),
    // The NOMINATIVE forms — single-token names that behave as SUBJECTS often enough to be a
    // paradigm's base (not an oblique). The declension fold anchors on these so two names sharing
    // a stem (Франц / Франция) never merge. Read-only over the document's subject-position stats.
    nominativeForms: ({ minSight = 3, minRate = 0.25 } = {}) => {
      const noms = new Set();
      for (const label of admitted.keys()) {
        if (label.includes(' ')) continue;
        const total = counts.get(label) || 0;
        const s = subjSight.get(label) || 0;
        if (s >= minSight && total > 0 && s / total >= minRate) noms.add(label);
      }
      return noms;
    },
  };
};

// Exposed so the relation parser can share the exact same entity scanner.
export const scanEntities = (text) => {
  const re = new RegExp(CAP_RE.source, 'gu');
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const label = cleanLabel(m[0]);
    if (label) out.push({ label, start: m.index, end: m.index + m[0].length });
  }
  return out;
};
