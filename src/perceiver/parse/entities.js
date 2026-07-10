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

import {
  SEED_STARTER, SEED_FUNCTION, SEED_PREPOSITION, SEED_ROLE, SEED_AUXILIARY, SEED_DEMONYM, SEED_CALENDAR,
} from '../../core/conventions/index.js';

const TITLE = String.raw`(?:Mr|Mrs|Ms|Dr|Miss|Mister|Sir|Madam|Madame|Lady|Lord|Professor|Prof|Capt|Captain|Rev|St|Aunt|Uncle)\.?`;
// A lowercase connector (von, of, the) only counts when it sits *between* two
// capitalised words — never trailing, so "Grete the news" is just "Grete".
const CONN  = String.raw`de|von|van|der|del|di|du|la|le|of|the`;
// Letters a name is built from. The ASCII class `[A-Z][a-zA-Z]` truncated every name at its
// first accent — the Maude/Garnett transliteration of War and Peace stresses with acute marks
// (Natásha, Kutúzov, Denísov, Pávlovna), so the scanner read "Nat", "Kut", "Den", "P", inventing
// 136 truncated figures and 130 "Anna -> … : p" patronymic-split junk edges. Widen the class to
// the Latin-1 letter block (À-Ö, Ø-ö, ø-ÿ — excludes × ÷), which carries the acute/grave/diaeresis
// forms a European-name transliteration uses. These are single UTF-16 code units, so the existing
// `\b`-anchored, un-`u`-flagged regexes keep working unchanged; only the reach of a name widens.
const U = String.raw`A-ZÀ-ÖØ-Þ`;            // a capital name-initial, incl. accented (Á É Í Ó Ú …)
const L = String.raw`A-Za-zÀ-ÖØ-öø-ÿ`;      // a name-internal letter, either case, incl. accented
const NAME  = String.raw`[${U}][${L}]+(?:\s+(?:${CONN}\s+)?[${U}][${L}]+)*`;
const CAP_RE = new RegExp(String.raw`\b(?:${TITLE}\s+)?${NAME}\b`, 'g');

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
const INITIALISM_RE = new RegExp(String.raw`(${NAME})\s*\(\s*(${ACRO_RE})\s*\)`, 'g');
export const scanInitialisms = (sentence, admission) => {
  const s = String(sentence || '');
  const out = [];
  const re = new RegExp(INITIALISM_RE.source, 'g');
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
const BIRTH_RE = new RegExp(String.raw`((?:${TITLE}\s+)?${NAME})\s*(?:,?\s+(?:was\s+|were\s+)?born\s+(?:in\s+|on\s+)?|\(\s*(?:born\s+|b\.\s*)?)(\d{4})\b`, 'g');
export const scanFunctionalAttributes = (sentence, admission) => {
  const s = String(sentence || '');
  const out = [];
  const re = new RegExp(BIRTH_RE.source, 'g');
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
const lc = (s) => String(s || '').toLowerCase();
const setOf = (seed) => new Set(seed.map(lc));
const DEFAULT_CONVENTIONS = (() => {
  const starter = setOf(SEED_STARTER), fn = setOf(SEED_FUNCTION);
  const prep = setOf(SEED_PREPOSITION), role = setOf(SEED_ROLE), aux = setOf(SEED_AUXILIARY);
  const demonym = setOf(SEED_DEMONYM), calendar = setOf(SEED_CALENDAR);
  return {
    isStarter:     (w) => starter.has(lc(w)),
    isFunction:    (w) => fn.has(lc(w)),
    isPreposition: (w) => prep.has(lc(w)),
    isRole:        (w) => role.has(lc(w)),
    isAuxiliary:   (w) => aux.has(lc(w)),
    isDemonym:     (w) => demonym.has(lc(w)),
    isCalendar:    (w) => calendar.has(lc(w)),
  };
})();

const TITLE_WORDS = new Set([
  'Mr','Mrs','Ms','Dr','Miss','Mister','Sir','Madam','Madame','Lady','Lord',
  'Professor','Prof','Capt','Captain','Rev','St','Aunt','Uncle',
]);

const idFor = (label) =>
  label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

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

// A content head — an open-class word (`C.isFunction` is false), so a name beside
// it is a verb's argument rather than a function word's neighbour.
const isContent = (w, C) => !!w && /^[a-z][a-z'’]*$/.test(w) && w.length >= 2 && !C.isFunction(w);

// The gravity of one sighting, read off its local context against the live
// conventions `C`. Pure and modelless — position is the witness, the word-classes
// are the ledger's. A sighting earns the floor when it sits in an ARGUMENT
// position; anything else earns nothing (no count backstop, so a recurring
// clause-opener never accrues its way in).
const sightingGravity = (sentence, start, end, C, label = null) => {
  const after = sentence.slice(end);
  if (/^['’]s?\b/.test(after)) return 1.0;                            // possessor: "Abram's" / "the Russian's"
  const before = sentence.slice(0, start);
  const prev = (before.match(/([A-Za-z'’]+)\s*$/) || [])[1];
  const next = (after.match(/^\s*([A-Za-z'’]+)/) || [])[1];
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
  if (C.isCalendar && C.isCalendar(label ?? sentence.slice(start, end))) return 0.0;
  if (C.isDemonym && C.isDemonym(label ?? sentence.slice(start, end)))
    return (next && C.isAuxiliary(next)) ? 1.0 : 0.0;
  if (prev && (C.isRole(prev) || C.isPreposition(prev))) return 1.0;  // "his son Seth" / "unto Noah"
  if (isContent(next, C) || isContent(prev, C)) return 1.0;           // subject ("X walked") / object ("begat X")
  if (next && C.isAuxiliary(next)) return 1.0;                        // subject of a copula/aux ("Alice is …")
  // A VOCATIVE / set-off name — a proper name inset by punctuation on BOTH sides
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
  if (/,\s*$/.test(before) && (after === '' || /^\s*[,.;:!?)]/.test(after))) return 1.0;
  return 0.0;                                                         // no referential gravity
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
export const createEntityAdmission = ({ conventions, commonNouns = false } = {}) => {
  const C = conventions ? {
    isStarter:     (w) => conventions.isStarter(w),
    isFunction:    (w) => conventions.isFunction(w),
    isPreposition: (w) => conventions.isPreposition(w),
    isRole:        (w) => conventions.isRole(w),
    isAuxiliary:   (w) => conventions.isAuxiliary(w),
    isDemonym:     (w) => conventions.isDemonym ? conventions.isDemonym(w) : false,
    isCalendar:    (w) => conventions.isCalendar ? conventions.isCalendar(w) : false,
  } : DEFAULT_CONVENTIONS;
  const counts    = new Map(); // label → count
  const gravity   = new Map(); // label → Σ referential gravity over its sightings
  const admitted  = new Map(); // label → id (post-admission)
  const sightSent = new Map(); // label → number[] (every sighting's sentIdx)
  const mentions  = new Map(); // id    → number[] (sentence indices, ordered)
  const initialisms = new Map(); // acronym label → expansion id (learned org alias)

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
    const re = new RegExp(CAP_RE.source, 'g');
    let m;
    while ((m = re.exec(sentence)) !== null) {
      const label = cleanLabel(m[0], C);
      if (!label) continue;
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
      // Accrue this sighting's gravity. A multi-word proper name is referential on
      // its face (it is not a clause-opener accident), so it carries the floor.
      const g = (gravity.get(label) || 0)
        + (multiword ? GRAVITY_FLOOR : sightingGravity(sentence, m.index, m.index + m[0].length, C, label));
      gravity.set(label, g);

      if (admitted.has(label)) {
        const id = admitted.get(label);
        noteMention(id, sentIdx);
        out.push({ status: 'present', id, label });
      } else if (g >= GRAVITY_FLOOR) {
        const rawId = idFor(label);
        const alias = aliasOf(label);
        // A HEAD (given-name) containment unifies the id here, as it always did. A
        // TAIL (surname) containment does NOT: the entity keeps its own id, so the
        // thin merge the pipeline commits can be defeated by a later event without
        // rewriting this admission — the append-only discipline, applied to identity.
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
        const sg = (gravity.get(head) || 0) + sightingGravity(sentence, hs, hs + head.length, C, head);
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
    initialismOf: (acronymLabel) => initialisms.get(acronymLabel) ?? null,
    labelOf:    (id)    => {
      for (const [label, eid] of admitted) if (eid === id) return label;
      return null;
    },
    get counts()   { return counts; },
    get admitted() { return admitted; },
    get mentions() { return mentions; },
    get initialisms() { return initialisms; },
  };
};

// Exposed so the relation parser can share the exact same entity scanner.
export const scanEntities = (text) => {
  const re = new RegExp(CAP_RE.source, 'g');
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const label = cleanLabel(m[0]);
    if (label) out.push({ label, start: m.index, end: m.index + m[0].length });
  }
  return out;
};
