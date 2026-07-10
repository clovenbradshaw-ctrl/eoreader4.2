// EO: CON·SIG·DEF(Field,Entity → Link,Lens, Binding,Tracing) — relation extraction (CON/SIG/DEF)
// Relation extraction → CON (bond), SIG (attribution/speech), DEF (define).
//
// The contract is unchanged: never invent a node. Every endpoint of an edge
// is an admitted entity, or a pronoun resolved by coreference to one. The
// gains over the single rigid SVO regex are where the weakness was:
//
//   - Coreference. A leading subject pronoun ("He", "She", "They") resolves
//     to the most recently mentioned entity (within a few sentences). In a
//     single-protagonist text this is the difference between a handful of
//     edges and a real graph.
//   - Verb classification. Speech / attribution verbs ("said", "told",
//     "asked") emit SIG; copulas ("is", "was") emit DEF; everything else
//     that links two entities emits CON.
//   - An open verb slot. The verb is no longer a tiny whitelist — any verb
//     between two admitted entities bonds them. Precision is held by the
//     admitted-endpoints rule, not by enumerating verbs.
//   - Kinship apposition. "his sister Grete", "Gregor's father" bond the
//     owner to the named relative through the kin term.

import { scanEntities } from './entities.js';
import { segmentClauses, SEED_CLAUSE_BOUNDARY } from './clauses.js';
import { SEED_COPULA, SEED_MODIFIER, SEED_SPEECH, SEED_CONJUNCTION } from '../../core/conventions/index.js';

// The verb-classification word-lists live in the conventions ledger (the home for
// the language-specific stuff), seeded and learnable. The parser holds NO list of
// its own: it takes predicates, defaulting to the ledger's seeds so a standalone
// call (the edge-grounding veto) still works. The pipeline hands it the live
// conventions, so a document's learned dialect flows straight in.
const COPULA_SEED      = new Set(SEED_COPULA);       // is/am/was/… → DEF, never a relation
const SPEECH_SEED      = new Set(SEED_SPEECH);       // said/asked/… → SIG
const MODIFIER_SEED    = new Set(SEED_MODIFIER);     // adverbs/intensifiers/auxiliaries to step over
const CONJUNCTION_SEED = new Set(SEED_CONJUNCTION);  // and/or/nor → joins coordinated subjects
const defIsCopula      = (w) => COPULA_SEED.has(w);
const defIsSpeech      = (w) => SPEECH_SEED.has(w);
const defIsModifier    = (w) => MODIFIER_SEED.has(w);
const defIsConjunction = (w) => CONJUNCTION_SEED.has(w);

const SUBJECT_PRONOUN = new Set(['He', 'She', 'They', 'We', 'It', 'I', 'You']);

// Relative pronouns that open a clause whose subject is the ANTECEDENT, not the
// running sentence subject ("…an unspeaking jazz player who refuses to speak" — the
// one refusing is the player, not the narrator). The clause splitter consumes the
// pronoun, so the relative clause arrives subjectless. Without the total read we do
// not resolve antecedents and let it fail toward silence; under the total read the
// antecedent is the running figure, and the embedded clause is read as a full
// proposition with that antecedent as subject (§2 — closing the "arrives subjectless"
// gap), graded by the `relative` prior so the harder read carries its own number.
const RELATIVE_OPENER = new Set(['who', 'whom', 'whose', 'which', 'that']);

// §3 — inter-proposition links. A subordinator that opens a clause is not noise to be
// dropped; it is a TYPED relation between the proposition it introduces and the matrix
// proposition it hangs off. The clause splitter (clauses.js) only cuts on a
// high-precision subset of connectives, so the openers reaching us are exactly these;
// each maps to the closed link-type vocab the synthesis closes a holon over. The
// literal connective rides beside the type as `connective`, the way the raw verb rides
// beside `relType` on an ordinary bond.
const SUBORDINATOR_TYPE = Object.freeze({
  because: 'cause', since: 'cause', so: 'cause', therefore: 'cause', as: 'cause',
  although: 'contrast', though: 'contrast', whereas: 'contrast', despite: 'contrast',
  unless: 'condition', if: 'condition', provided: 'condition',
  when: 'sequence', while: 'sequence', after: 'sequence', before: 'sequence',
});

// §4 — Confidence is carried, never dropped. The per-construction PRIOR: how surely a
// reader apprehends a proposition pulled from THIS kind of site (not "how true is it";
// "how surely did I read it"). A clean SVO main clause reads near-1; a relation buried
// in a noun phrase never does (§9). The table is the reader's, held in one place,
// inspectable and learnable — not magic numbers scattered through the scan. Total
// capture means the low number RIDES the edge; it is never a reason to drop it (§1).
export const CONFIDENCE = Object.freeze({
  main:           0.95,   // subject–verb–object, the clause's head proposition
  copula:         0.90,   // a copular DEF / predicative
  passive:        0.85,   // a passive recovered to its active edge
  coordSubject:   0.85,   // a coordinated-subject convergence ("Delgado and Reyes listed…")
  np:             0.80,   // an SVO whose object is an NP-head referent, not a named figure
  kinship:        0.80,   // a kinship apposition ("his sister Grete")
  apposition:     0.70,   // a renaming noun phrase → is-a ("Samsa, a travelling salesman")
  attribution:    0.70,   // a reported source ("per series creator Chris Carter")
  coordPredicate: 0.70,   // a non-first conjunct of a coordinated predicate
  subordinate:    0.65,   // a proposition read inside a subordinate clause
  relative:       0.60,   // a proposition recovered from a relative clause
  interProp:      0.55,   // an inter-proposition (subordinator) link
  nominalized:    0.45,   // a relation buried in a noun phrase ("captivity of animals")
});

// The endpoint-resolution adjustment (§4: "adjusted by how cleanly the endpoints
// resolved"). A name resolves cleanly (×1); a pronoun or an inherited (open-activation)
// subject is a guess the reader is less sure it read right; an NP-head object is a
// referent, not an admitted figure. The factors are GENTLE — the magnitude of the
// resolution uncertainty already rides the coupling channel (`w`); confidence is the
// orthogonal "did I read this construction right" channel, so a clean main clause with
// a pronoun subject still reads high, never near nothing.
const SUBJ_CONF_FACTOR = { name: 1, pronoun: 0.9, inherited: 0.85, relative: 0.85, prop: 1 };
const gradeConfidence = (site, subjKind = 'name', objKind = null) => {
  const base = CONFIDENCE[site] ?? 0.5;
  const sf = SUBJ_CONF_FACTOR[subjKind] ?? 1;
  const of = objKind === 'np' ? 0.9 : 1;
  return Math.round(base * sf * of * 1000) / 1000;
};

// The reified id of a proposition (§3) — a CON/SIG bond or a copular DEF read as a node
// so an inter-proposition link can take it as an endpoint. Built from the edge's own
// figures, so two readings of the same proposition reify to the SAME id (idempotent,
// §7), and it traces to the spans the bond already carries (§6 — never an invented
// node, an apprehended one). Tagged `prop` downstream so the figure set never absorbs it.
const slugProp = (v) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const propIdOf = (edge) =>
  edge.op === 'DEF'
    ? `prop:${edge.id}~is~${slugProp(edge.value).slice(0, 24)}`
    : `prop:${edge.src}~${slugProp(edge.via)}~${edge.tgt}`;

// Words that are not verbs: if the head slot lands on one of these, there is no
// relation here — better silence than "Grete who Just" or "Gregor -> spoke :
// between". Prepositions, indefinite pronouns, and bare cardinals are added because
// they were the surface words the flat extractor mistook for predicates
// ("Gregor -> awful : something", "Gregor -> whole : two") — exactly the junk the
// note format forbids in the relation slot.
const NOT_HEAD = new Set([
  'who', 'whom', 'whose', 'which', 'that', 'what', 'where', 'when', 'why', 'how',
  // Expletive / deictic adverbs: "there is an unspeaking jazz player", "here stands a
  // man" front a clause but are no predicate. Without them the head-verb walk took the
  // existential "there" as the relation ("X -> player : there"), inventing a bond out of
  // a presentational clause. Same closed-class footing as the wh-adverbs above.
  'there', 'here',
  'by', 'of', 'in', 'on', 'at', 'to', 'from', 'with', 'for', 'as', 'than', 'about',
  'and', 'but', 'or', 'nor', 'so', 'because', 'although', 'while', 'if', 'unless',
  'a', 'an', 'the', 'his', 'her', 'their', 'its', 'this', 'these', 'those',
  'my', 'your', 'our', 'mine', 'yours', 'ours',
  'between', 'among', 'amongst', 'through', 'throughout', 'without', 'within',
  'into', 'onto', 'upon', 'over', 'under', 'across', 'behind', 'beside', 'below',
  'above', 'near', 'past', 'around', 'round', 'against', 'toward', 'towards',
  'during', 'off', 'up', 'down', 'out',
  'something', 'nothing', 'anything', 'everything', 'someone', 'anyone', 'everyone',
  'somebody', 'anybody', 'everybody', 'nobody', 'none', 'one',
  'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  // Determiners and quantifiers that open a NOUN PHRASE, never a predicate. When a
  // clause has no admitted subject and falls to the inherited/last-INS fill, its head
  // walk would otherwise take the leading quantifier as the verb — "All these families
  // belong to Odontoceti" bonding an unrelated running figure via "all", a quarter of
  // a real run's triples (the audit's "X -> Y : All", "X -> Y : Several", "X -> Y : Some" junk).
  // A determiner-headed clause is a noun phrase the name-only reader cannot subject, so
  // it fails toward silence here rather than minting a bond on a non-verb. (more/most/
  // less/much/such/so are already modifiers — stepped over to the real verb, not here.)
  'all', 'some', 'any', 'each', 'every', 'both', 'either', 'neither', 'several',
  'many', 'few', 'fewer', 'other', 'another', 'various', 'numerous', 'multiple',
  'enough', 'certain', 'including',
]);

// The polarity / modality channel the flat predicate dropped. A negation ("not",
// "never", an n't-contraction) flips polarity to −; a modal ("could", "must") or a
// hedge verb ("seemed") sets the modality. The negation word AND the modal aux are
// STEPPED OVER so the real verb is still reached — "couldn't understand" → the verb
// `understand`, polarity −, modality epistemic — where the old walk either swallowed
// the negation as a modifier (dropping it) or mistook the contraction for the verb
// ("-> understand : couldn't"). Small closed sets; a later pass can move them to the
// conventions ledger, the home for language-specific lists.
const NEGATION        = new Set(['not', 'never', 'cannot']);
const MODAL_EPISTEMIC = new Set(['could', 'would', 'might', 'may']);
const MODAL_DEONTIC   = new Set(['must', 'should', 'shall', 'ought']);
const MODAL_IRREALIS  = new Set(['will', 'can']);
const MODALS          = new Set([...MODAL_EPISTEMIC, ...MODAL_DEONTIC, ...MODAL_IRREALIS]);
const HEDGE_VERB      = new Set(['seem', 'seems', 'seemed', 'appear', 'appears', 'appeared', 'look', 'looks', 'looked']);
const NEG_CONTRACTION = /^([a-z]+)n['’]t$/;            // couldn't, didn't, won't, isn't — the
                                                       // apostrophe is REQUIRED, so plain -nt words
                                                       // ("went", "want", "meant") are not negations
const DO_SUPPORT      = new Set(['do', 'does', 'did']); // dummy aux in "didn't X" — carries no modality

// The polarity/modality fields for an edge, written only when they DEPART from the
// default (positive · realis), so a plain bond's event is unchanged and only the
// marked cases carry the extra channel.
const polmod = (head) => ({
  ...(head.polarity === '−' ? { polarity: '−' } : {}),
  ...(head.modality && head.modality !== 'realis' ? { modality: head.modality } : {}),
});

const KIN_NOUNS = Object.freeze([
  'father', 'mother', 'sister', 'brother', 'son', 'daughter', 'wife', 'husband', 'parents',
  'uncle', 'aunt', 'cousin', 'nephew', 'niece', 'grandfather', 'grandmother', 'friend', 'master',
  'servant', 'boss', 'chief', 'partner', 'neighbour', 'neighbor', 'colleague', 'lover', 'fiance', 'fiancee',
]);
export { KIN_NOUNS };
const KIN = `(?:${KIN_NOUNS.join('|')})`;

// "Gregor's sister Grete" | "his sister, Grete"
const KIN_RE = new RegExp(
  String.raw`(?:([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)'s|\b(his|her|their|its)\b)\s+(${KIN})\s*,?\s+([A-Z][a-zA-Z]+)`,
  'gi',
);

// Resolve the sentence's leading subject. A name resolves with full coupling
// (w = 1). A pronoun does not decide — it reads the referent field and takes
// the strongest candidate, carrying that candidate's weight as the bond's
// coupling so the uncertainty rides along instead of being thrown away.
//
// This resolves the subject at the head of whatever span it is handed. The old
// carve limit — subjects found only at the SENTENCE head, so a mid-sentence subject
// ("…, and Grete opened the door") never reached the field — is lifted upstream now:
// parseRelations runs this PER CLAUSE (segmentClauses, the SEG-first rework), so a
// mid-sentence subject arrives here as a clause-initial one. This function stays a
// pure head-resolver and holds NO segmentation of its own — the split is one module.
// A leading coordinator / opener at a clause head ("And he begat…", "Now Cainan
// …") is not the subject — it pushes the real head one token right. KJV runs
// almost every verse through one, so without skipping it the pronoun/name resolver
// never reaches the subject. The set is the conjunctions/openers, by hand here;
// it could move to a conventions register like the rest.
const LEAD_COORD = /^\s*(?:and|but|now|so|then|or|nor|yet|for|therefore|thus)\b[\s,]*/i;

// A colon introduces an independent clause ("The filings told the real story: Delgado
// and Reyes had each…"), so under coordinated-subject reading it is a clause boundary
// too — otherwise a framing head ("…: ") buries the coordinated subjects mid-clause and
// the reading misses them. Held WITH the coordinated-subject switch (it widens
// segmentation, so it ships behind the same gate that keeps the default byte-identical),
// and appended to the seeded boundary list — a text-organ token, not an engine fact.
const COORD_CLAUSE_BOUNDARY = [...SEED_CLAUSE_BOUNDARY, ': '];

const leadingSubject = (sentence, admission, coref) => {
  const lead = (sentence.match(LEAD_COORD) || [''])[0].length;   // skip a leading coordinator
  const rest = sentence.slice(lead);
  // Case-INSENSITIVE: clause segmentation yields lowercase-initial clauses
  // ("…, and he turned" → "he turned"), so a clause-head subject pronoun is as
  // often lower- as upper-case. The capitalised-only match dropped every split-off
  // pronoun subject — the half of Move 1 that was never wired to the clause splitter.
  const pn = rest.match(/^\s*(he|she|they|we|it|i|you)\b/i);
  if (pn) {
    const cands = coref?.field ? coref.field() : [];
    const top = cands[0];
    const start = lead + (pn[0].length - pn[1].length); // the pronoun's offset past the lead
    return { id: top?.id ?? null, start, end: lead + pn[0].length, text: pn[1], kind: 'pronoun', w: top?.w ?? 0 };
  }
  // Otherwise the first capitalised phrase, if it is an admitted entity.
  const ents = scanEntities(rest);
  const first = ents.find(e => e.start <= 1); // clause-initial (after the coordinator)
  if (first && admission.isAdmitted(first.label)) {
    return { id: admission.idOf(first.label), start: lead + first.start, end: lead + first.end,
             text: rest.slice(first.start, first.end), kind: 'name', w: 1 };
  }
  // A clause-initial definite common-noun SUBJECT, but only when the common-noun catalyst has
  // already reacted that head into an entity ("the soldier"). scanEntities is capitalised, so
  // it never yields this span; we recover it from admission, which leadingSubject already
  // holds. With the catalyst off, no common-noun head is admitted, so this never fires —
  // byte-identical. This is the bond half the reagent half (entities.js) sets up.
  const dn = rest.match(/^\s*the\s+([a-z][a-z]{2,})\b/i);
  if (dn && admission.isAdmitted(dn[1].toLowerCase())) {
    const head = dn[1].toLowerCase();
    const start = lead + dn[0].toLowerCase().indexOf(head);
    return { id: admission.idOf(head), start, end: start + head.length, text: head, kind: 'name', w: 1 };
  }
  return null;
};

// Coordinated subjects at a clause head: "Name and Name <predicate>", "Name, Name
// and Name <predicate>". Returns the FULL list of admitted-name subjects sharing
// the clause's predicate, or null if the head is not a coordination of names. This
// is the symmetric partner to `running` (one subject across many clauses); here it
// is many subjects in one clause. Pronoun and inherited subjects are NOT coordinated
// here — only admitted names, so the path stays a figure-to-figure structure and no
// guessing enters. The end offset is the LAST conjunct's end, so the caller seeks the
// verb after the whole subject coordination, not after the first name.
//
// `isConjunction` is the LEDGER's coordinator predicate, injected like every other
// word-class the parser asks (isCopula/isSpeech/isModifier): the parser holds NO
// coordinator list of its own. The gap between two conjuncts must be orthography
// (list comma, the "&" logogram, whitespace) carrying at most ONE conjunction word,
// and that word's class is decided by the ledger, never by a literal typed here.
const coordinatedSubjects = (sentence, admission, isConjunction) => {
  const lead = (sentence.match(LEAD_COORD) || [''])[0].length;
  const rest = sentence.slice(lead);
  const ents = scanEntities(rest);
  if (!ents.length || ents[0].start > 1) return null;        // must be clause-initial
  // Walk conjuncts while the gap between consecutive names is ONLY coordinator
  // material — strip the orthography (commas, "&", whitespace); what remains must be
  // empty or a single LEDGER conjunction. That, and only that, is subject coordination.
  const subjects = [];
  let prevEnd = null;
  for (const e of ents) {
    if (prevEnd !== null) {
      const word = rest.slice(prevEnd, e.start).replace(/[\s,&]/g, '').toLowerCase();
      if (word !== '' && !isConjunction(word)) break;         // not a coordinator → run ends
    }
    if (!admission.isAdmitted(e.label)) break;                // every conjunct must be a figure
    subjects.push({ id: admission.idOf(e.label),
                    start: lead + e.start, end: lead + e.end,
                    text: rest.slice(e.start, e.end) });
    prevEnd = e.end;
  }
  return subjects.length >= 2 ? { subjects, end: subjects[subjects.length - 1].end } : null;
};

// Round a coupling weight for the log; only sub-unit (inferred) weights are
// stamped — a named, certain bond carries no weight field and projects at 1. A
// pronoun and an inherited subject (the open-activation fill, below) both ride
// their weight; a named subject is certain and carries none.
const coupling = (subj) =>
  (subj.kind === 'pronoun' || subj.kind === 'inherited')
    ? { w: Math.round((subj.w ?? 0) * 1000) / 1000 } : {};

// Step over leading adverbs/auxiliaries to the head verb. Returns the verb
// (lowercased) and the remaining text, or null if no verb-like token follows.
// Exported so the edge-grounding veto can reuse the SAME head-verb scan the page
// uses to tell a relational talker sentence (whose endpoints may not resolve)
// from a non-relational one — the SVO clause parser, pointed at the talker.
// `at` is the verb token's start offset in `text`; `restStart` is where the
// post-verb remainder begins in `text`. Both let the caller place the verb and
// object spans back into the sentence (the logged argument-span SEG, §3). The
// existing fields (verb, rest, copular) are unchanged, so the edge-grounding
// veto's reuse of this scan is unaffected.
export const headVerb = (text, { isCopula = defIsCopula, isModifier = defIsModifier } = {}) => {
  let rest = text.replace(/^[\s,]+/, '');
  let consumed = text.length - rest.length;             // chars of `text` walked past
  let polarity = '+';                                   // captured as we step over the aux run
  let modality = 'realis';
  const setModality = (w) => {
    if (MODAL_EPISTEMIC.has(w) || HEDGE_VERB.has(w)) modality = 'epistemic';
    else if (MODAL_DEONTIC.has(w)) modality = 'deontic';
    else if (MODAL_IRREALIS.has(w) && modality === 'realis') modality = 'irrealis';
  };
  const stepOver = (m) => {
    const sliced  = rest.slice(m[0].length);
    const trimmed = sliced.replace(/^[\s,]+/, '');
    consumed += m[0].length + (sliced.length - trimmed.length);
    rest = trimmed;
  };
  // The verb guard, ReVerb's relation-phrase constraint by hand: step over the
  // adverbs/intensifiers/auxiliaries (the modifier list), AND over negation and modal
  // auxiliaries while capturing the polarity/modality they carry, route a copula to
  // its own DEF branch, and reject a preposition/relative as a head. What remains is
  // verb-headed — or, if we only ever found modifiers, nothing, and that clause is no
  // relation. The guard limit is generous because a clause can stack several markers
  // ("had not really quite walked").
  for (let guard = 0; guard < 8; guard++) {
    const m = rest.match(/^([A-Za-z][a-zA-Z'’]*)\b/);
    if (!m) return null;
    const w = m[1].toLowerCase();
    const at = consumed;                                // verb token start in `text`
    const restStart = at + m[0].length;                 // post-verb text start in `text`
    // A negative contraction ("couldn't" = could + not): negation AND a modal/aux
    // stem, both stepped over so the REAL verb is found next, neither dropped.
    const contr = w.match(NEG_CONTRACTION);
    if (contr) { polarity = '−'; if (!DO_SUPPORT.has(contr[1])) setModality(contr[1]); stepOver(m); continue; }
    if (NEGATION.has(w)) { polarity = '−'; stepOver(m); continue; }
    if (MODALS.has(w))   { setModality(w);  stepOver(m); continue; }
    if (isCopula(w)) {
      // PROGRESSIVE, not copula: a copula IMMEDIATELY followed by a present participle
      // is the progressive auxiliary — "was developing a reboot" is the verb `developing`
      // (an active CON edge), not "X is [a developing reboot]" (a DEF). Step over the
      // copula and let the participle be the head verb. Gated tightly so it does not
      // disturb the copula DEF path: the -ing must follow at once (a determiner between —
      // "was a developing nation" — is an adjective, left as a DEF), and a PAST participle
      // after a copula is PASSIVE ("was developed by …"), reached by the caller's passive
      // scan, so only -ing is taken here. The length floor screens bare -ing nouns
      // ("was king" → DEF, "thing"/"wing"/"ring").
      const after = rest.slice(m[0].length).replace(/^[\s,]+/, '');
      const part = after.match(/^([A-Za-z]+ing)\b/);
      if (part && part[1].length > 4 && !isModifier(part[1].toLowerCase())) { stepOver(m); continue; }
      return { verb: w, rest: rest.slice(m[0].length), copular: true, at, restStart, polarity, modality };
    }
    if (isModifier(w)) { stepOver(m); continue; }
    if (NOT_HEAD.has(w)) return null;   // a preposition/relative pronoun is not a verb
    if (HEDGE_VERB.has(w)) modality = 'epistemic';      // "seemed", "appeared" → a hedge
    return { verb: w, rest: rest.slice(m[0].length), copular: false, at, restStart, polarity, modality };
  }
  return null;
};

// PASSIVE VOICE → the typed active edge. "<patient> is/was [being|been] <participle> by <agent>"
// becomes AGENT -> PATIENT : participle, so "developed/produced/created/directed/founded by X"
// reaches the graph as a relation instead of a flat copular DEF that buries the agent — the
// difference between a rich graph and a list of "X: is being developed by …" on real web prose.
// Conservative by construction: the participle is -ed or a known irregular, there must be a
// "by" agent, and (at the call site) the agent must be an ADMITTED named entity.
const PASSIVE_IRREGULAR = new Set([
  'made', 'written', 'built', 'led', 'shown', 'run', 'cast', 'told', 'given', 'taken', 'held',
  'set', 'put', 'sent', 'kept', 'drawn', 'known', 'found', 'won', 'begun', 'born', 'grown',
  'sung', 'done', 'seen', 'brought', 'sold', 'paid', 'read', 'left', 'won',
]);
// Returns { verb, partStart, byEnd } when `rest` (the text after the copula) opens a passive
// with a "by" agent; null otherwise. `partStart`/`byEnd` are offsets within `rest`.
const passiveParticiple = (rest) => {
  const lead = (rest.match(/^\s*(?:(?:being|been)\s+)?/i) || [''])[0].length;
  const m = rest.slice(lead).match(/^([A-Za-z]+)\s+by\s+/i);
  if (!m) return null;
  const lw = m[1].toLowerCase();
  if (!(/[a-z]ed$/.test(lw) || PASSIVE_IRREGULAR.has(lw))) return null;
  return { verb: lw, partStart: lead, byEnd: lead + m[0].length };
};

// Each admitted object, with its offsets within `text` so the caller can place
// the object span back into the sentence. (Was ids only — the spans were computed
// and thrown away, the v1 gap this spec closes.)
//
// The object scope STOPS at an attribution opener ("…, per series creator Chris Carter"):
// a name introduced by per / according to / as per is the SOURCE the claim is reported
// from, never the verb's patient. Without the cut, "developing a new reboot, per … Chris
// Carter" bonds the named Carter as the object — "Ryan Coogler -> Chris Carter : developing",
// the nonsense edge behind the audit's wrong answer — because a named patient outranks the
// "reboot" NP head. Truncating here lets the NP head ("reboot") win, and attributionEdges
// records Carter as the SIG source separately.
const ATTRIBUTION_CUT = /\b(?:per|according to|as per|citing)\s+/i;
const objectEntities = (text, admission, excludeId) => {
  const cut = text.match(ATTRIBUTION_CUT);
  const scope = cut ? text.slice(0, cut.index) : text;
  const out = [];
  const seen = new Set([excludeId]);
  for (const e of scanEntities(scope)) {
    if (!admission.isAdmitted(e.label)) continue;
    const id = admission.idOf(e.label);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label: e.label, start: e.start, end: e.end });
  }
  return out;
};

// ── Move 2: the noun-phrase object slot ────────────────────────────────────
// The object endpoint is no longer only an admitted name. The HEAD noun of the
// post-verb NP ("the room", "his back", "the chief clerk", "an apple") becomes a
// REFERENT endpoint — a lowercased lemma node tagged `np`, never an admitted figure
// (admission stays the gate for figures; this never invents one). Two guards keep it
// from manufacturing junk: a light POS/stoplist here (function words, pronouns,
// bleached nouns, bare adverbs are not heads), and the recurrence gate in the
// pipeline (a once-seen referent rides as weak coupling, never dropped). This is what
// fills the graph with the propositions a novella actually holds — a man alone in a
// room with a door and a chair — that the name-to-name rule could never reach.
const NP_PREP = new Set([
  'over', 'under', 'into', 'onto', 'across', 'through', 'toward', 'towards', 'at',
  'to', 'on', 'in', 'behind', 'beside', 'below', 'above', 'near', 'past', 'around',
  'round', 'up', 'down', 'off', 'against', 'upon', 'within', 'from', 'by', 'of',
  'with', 'for', 'about', 'before', 'after',
]);
const NP_DET = new Set([
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'his', 'her', 'their', 'its',
  'my', 'your', 'our', 'some', 'any', 'no', 'each', 'every', 'another', 'one', 'all', 'both',
]);
// Closed-class and bleached tokens that cannot be an NP head — pronouns, the
// determiner/preposition set, conjunctions, wh-words, light "nouns" that name no
// referent (thing/way/time/day…), and adverbs of time/place/degree that sit at a
// clause tail and would otherwise read as a noun.
const NP_NON_HEAD = new Set([
  ...NP_DET, ...NP_PREP,
  'and', 'but', 'or', 'nor', 'so', 'yet', 'as', 'than', 'then', 'if', 'because',
  'he', 'she', 'it', 'they', 'we', 'i', 'you', 'him', 'them', 'us', 'me', 'who',
  'whom', 'whose', 'which', 'what', 'where', 'when', 'why', 'how', 'here', 'there',
  'not', 'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
  'thing', 'things', 'way', 'ways', 'time', 'times', 'day', 'days', 'moment', 'while',
  'part', 'lot', 'kind', 'sort', 'bit', 'deal', 'course', 'something', 'nothing',
  'anything', 'everything', 'someone', 'anyone', 'everyone', 'ones', 'order', 'sense', 'fact',
  'later', 'earlier', 'soon', 'ago', 'away', 'again', 'together', 'onward', 'forward',
  'backward', 'meanwhile', 'afterward', 'afterwards', 'today', 'tonight', 'tomorrow',
  'yesterday', 'now', 'once', 'too', 'enough', 'indeed', 'perhaps',
]);
// Tokens that END the object NP run — a coordinator, a subordinator, or a relative.
const NP_BOUNDARY = new Set([
  'and', 'but', 'or', 'nor', 'so', 'yet', 'while', 'when', 'where', 'because',
  'although', 'though', 'since', 'after', 'before', 'until', 'unless', 'who', 'which',
  'that', 'as', 'than',
]);
// Particles and directional adverbs that follow a verb but name no referent
// ("looked OUT", "showed it OFF"). Distinct from NP_PREP because they take no object.
const NP_PARTICLE = new Set([
  'out', 'away', 'aside', 'apart', 'along', 'ahead', 'aback', 'aboard', 'forward',
  'backward', 'upward', 'downward', 'inward', 'outward', 'onward', 'indoors', 'outdoors',
  'abroad', 'overboard', 'here', 'there', 'everywhere', 'anywhere', 'nowhere', 'somewhere',
]);
// A reflexive is the verb's own subject, not a new referent ("found HIMSELF").
const NP_REFLEX = new Set([
  'himself', 'herself', 'itself', 'themselves', 'myself', 'yourself', 'ourselves', 'oneself',
]);
const isAdverbLy   = (lw) => lw.length > 4 && lw.endsWith('ly');
const isParticiple = (lw) => lw.length > 4 && (lw.endsWith('ing') || lw.endsWith('ed'));

// The light NP-head extractor: the head of the FIRST object NP after the verb, or
// null. The object NP lives in the IMMEDIATE post-verb segment — bounded at the first
// clause punctuation so a comma-spliced trailing clause cannot bleed into the head.
// One leading preposition is stepped over (motion/spatial objects sit after one:
// "crawled OVER the wall"), then the run is walked to its head — the LAST content
// token ("the chief CLERK", "a LADY fitted out"), preferring a true noun over a
// participle so "a lady fitted out" heads on `lady`, not `fitted`. Names, particles,
// reflexives, -ly adverbs and verbs are never heads, so the figure path owns names and
// the channel manufactures no junk. `guards` carries the live copula/modifier/speech
// predicates. Defeasible: a mis-head rides as a once-seen, recurrence-weakened node.
const npObject = (rest, guards) => {
  const seg = String(rest).split(/[,;:.!?…—–()"]/)[0];
  const toks = [];
  const re = /[A-Za-z][A-Za-z'’]*/g;
  let m;
  while ((m = re.exec(seg)) !== null)
    toks.push({ w: m[0], lw: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
  if (!toks.length) return null;

  const isVerbish = (lw) => guards.isCopula(lw) || guards.isModifier(lw) || guards.isSpeech(lw);
  const stops = (t) => NP_BOUNDARY.has(t.lw) || NP_PREP.has(t.lw) || NP_REFLEX.has(t.lw) || isVerbish(t.lw);
  let i = NP_PREP.has(toks[0].lw) ? 1 : 0;     // step over one leading preposition
  const run = [];
  for (; i < toks.length && run.length < 5; i++) {
    const t = toks[i];
    if (run.length > 0 && stops(t)) break;
    run.push(t);
  }
  const eligible = (t, allowParticiple) => {
    if (/^[A-Z]/.test(t.w)) return false;       // a name → figure path owns it
    if (NP_NON_HEAD.has(t.lw) || NP_PARTICLE.has(t.lw) || NP_REFLEX.has(t.lw)) return false;
    if (isVerbish(t.lw) || isAdverbLy(t.lw) || t.lw.length < 2) return false;
    if (!allowParticiple && isParticiple(t.lw)) return false;   // prefer a true-noun head
    return true;
  };
  // Pass 1 prefers a non-participle head; pass 2 falls back to allow -ed/-ing so real
  // nouns (bed, morning, ceiling) still ride.
  for (const allow of [false, true])
    for (let k = run.length - 1; k >= 0; k--)
      if (eligible(run[k], allow)) return { lemma: run[k].lw, start: run[k].start, end: run[k].end };
  return null;
};

const kinshipEdges = (sentence, admission, coref) => {
  const out = [];
  const re = new RegExp(KIN_RE.source, KIN_RE.flags);
  let m;
  while ((m = re.exec(sentence)) !== null) {
    const ownerName = m[1];
    const ownerPron = m[2];
    const kin       = m[3].toLowerCase();
    const relName   = m[4];
    let ownerId = null;
    if (ownerName && admission.isAdmitted(ownerName)) ownerId = admission.idOf(ownerName);
    else if (ownerPron && coref?.resolve)            ownerId = coref.resolve(ownerPron);
    if (!ownerId) continue;
    if (!admission.isAdmitted(relName)) continue;
    const relId = admission.idOf(relName);
    if (relId === ownerId) continue;
    out.push({ op: 'CON', src: ownerId, tgt: relId, via: kin });
  }
  return out;
};

// Attribution — "per X" / "according to X" / "as per X" names the SOURCE the claim is
// reported FROM, not a participant IN it. The t2 audit answered "Chris Carter is making
// the reboot" because "…Ryan Coogler was developing a new reboot of the series, per series
// creator Chris Carter" left Carter an unconnected admitted figure the realizer then
// grabbed as the agent. Carter is the attributor: emit a SIG (the attribution op, the
// LINK-shaped sibling of speech) from the source to the claim's figure, so the graph marks
// him a source — never the maker. The source is the first admitted figure AFTER the opener
// (lowercase role words like "series creator" are stepped over by the capitalised scan);
// the figure attributed-about is the nearest admitted figure before it (the clause subject),
// or, for a sentence-initial "According to X, Y …", the next admitted figure after X. A
// bare "miles per hour" / "per cent" never fires — the opener must be followed by a figure.
const ATTRIBUTION_OPENER = /\b(per|according to|as per|citing)\s+/gi;
const attributionEdges = (sentence, admission) => {
  const out = [];
  const re = new RegExp(ATTRIBUTION_OPENER.source, ATTRIBUTION_OPENER.flags);
  let m;
  while ((m = re.exec(sentence)) !== null) {
    const srcEnts = scanEntities(sentence.slice(m.index + m[0].length)).filter(e => admission.isAdmitted(e.label));
    if (!srcEnts.length) continue;
    const srcId = admission.idOf(srcEnts[0].label);
    const before = scanEntities(sentence.slice(0, m.index))
      .filter(e => admission.isAdmitted(e.label) && admission.idOf(e.label) !== srcId);
    let topicId = before.length ? admission.idOf(before[before.length - 1].label) : null;
    if (!topicId) {
      const follow = srcEnts.slice(1).find(e => admission.idOf(e.label) !== srcId);
      topicId = follow ? admission.idOf(follow.label) : null;
    }
    if (!topicId || topicId === srcId) continue;
    out.push({ op: 'SIG', src: srcId, tgt: topicId, via: m[1].toLowerCase().replace(/\s+/g, '-') });
  }
  return out;
};

// Standing-description scan — the third coref channel's extraction half. A role
// epithet with NO adjacent name is a STANDING DESCRIPTION, not an apposition:
// "his sister", "Gregor's sister" — but NEVER "his sister Grete" / "his sister,
// Grete", which are apposition the kinship CON path already binds. The owner is
// reported, never resolved here: a NAME owner is authoritative; a PRONOUN owner
// is a guess the caller resolves under a margin guard. Reuses the KIN lexicon.
// This deposits nothing on its own — the pipeline turns each sighting into a held
// descriptor; binding a name to the role is the trigger's job, not this scan's.
const DESC_NAME_RE = new RegExp(String.raw`\b([A-Z][a-zA-Z]+)['’]s\s+(${KIN})\b`, 'gi');
const DESC_PRON_RE = new RegExp(String.raw`\b(his|her|their|its)\s+(${KIN})\b`, 'gi');

export const scanDescriptors = (sentence) => {
  const s = String(sentence || '');
  // Apposition iff the role is immediately followed (after optional comma/space)
  // by a capitalised name — that case belongs to the kinship CON path, not here.
  const isApposition = (endIdx) => /^[,\s]+[A-Z][a-z]/.test(s.slice(endIdx));
  const out = [];
  let m;
  const reN = new RegExp(DESC_NAME_RE.source, 'gi');
  while ((m = reN.exec(s)) !== null) {
    if (isApposition(m.index + m[0].length)) continue;
    out.push({ roleKey: m[2].toLowerCase(), owner: { kind: 'name', name: m[1] } });
  }
  const reP = new RegExp(DESC_PRON_RE.source, 'gi');
  while ((m = reP.exec(s)) !== null) {
    if (isApposition(m.index + m[0].length)) continue;
    out.push({ roleKey: m[2].toLowerCase(), owner: { kind: 'pron', pron: m[1].toLowerCase() } });
  }
  return out;
};

// Vocative scan — the naming half of the SYN discovery (parse/naming.js). A bare
// capitalised name immediately before ! or ? is a DIRECT ADDRESS ("Grete!",
// "Mother?"). This is a pure ORTHOGRAPHIC primitive: whether the word before it is
// an interjection ("Oh God!") is a LEDGER question (conventions.isStarter), so
// naming.js applies that class — here we only read the punctuation. Like
// scanDescriptors this reports surface names only; admission and person-hood are the
// caller's gate. The responder to a name-call is that name: naming.js pairs each
// vocative with the role epithet that answers it, the apposition-free bridge by which
// a reader learns "his sister" is Grete (Kafka never writes them adjacent).
export const scanVocatives = (sentence) => {
  const s = String(sentence || '');
  const out = [];
  for (const m of s.matchAll(/\b([A-Z][a-zA-Z]+)\s*[!?]/g)) out.push({ name: m[1], index: m.index });
  return out;
};

// §2 — General apposition. A noun phrase that RENAMES a referent ("Samsa, a travelling
// salesman") is Samsa→is-a→salesman, a DEF, exactly as the kinship-apposition path
// already reads "his sister Grete". The construction is a NAME followed by a comma and a
// determiner-led common-noun phrase; the figure path owns the leading name, so this never
// invents a node — it only reads the predicate the comma apposes onto an admitted figure.
// Bounded at the next clause punctuation so a comma-spliced continuation cannot bleed in.
const APPOSITION_RE = /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\s*,\s+(an?|the)\s+([a-z][a-zA-Z]+(?:[\s-][a-z][a-zA-Z]+){0,3})/g;
const appositionEdges = (sentence, admission) => {
  const out = [];
  const re = new RegExp(APPOSITION_RE.source, APPOSITION_RE.flags);
  let m;
  while ((m = re.exec(sentence)) !== null) {
    const name = m[1];
    if (!admission.isAdmitted(name)) continue;
    const value = `${m[2]} ${m[3]}`.trim();
    if (!value) continue;
    out.push({ op: 'DEF', id: admission.idOf(name), key: 'predicate', value, apposition: true });
  }
  return out;
};

// §2 — Nominalized / prepositional relations. A relation can sit buried in a noun phrase:
// "the captivity of intelligent animals" carries captivity→of→animals. Read conservatively
// (§6 — apprehend, do not infer): the "of" genitive only, both heads ordinary common-noun
// referents (never a name — the figure path owns those, and "the death of Caesar" is a
// figure relation the SVO scan would mishandle), light/bleached heads screened by the same
// NP stoplist. Graded by the `nominalized` prior — the lowest in the table, because it is
// the hardest read. Endpoints are np-tagged lemmas; the never-invent rule holds.
const NOMINALIZED_RE = /\bthe\s+([a-z][a-zA-Z]+)\s+of\s+(?:(?:the|a|an|its|his|her|their|some|all|these|those|each|every|[a-z]+ly|[a-z]+ent|[a-z]+ed|[a-z]+ing)\s+)*([a-z][a-zA-Z]+)\b/gi;
const nominalizedEdges = (sentence) => {
  const out = [];
  const re = new RegExp(NOMINALIZED_RE.source, NOMINALIZED_RE.flags);
  let m;
  while ((m = re.exec(sentence)) !== null) {
    const head = m[1].toLowerCase(), obj = m[2].toLowerCase();
    if (NP_NON_HEAD.has(head) || NP_NON_HEAD.has(obj)) continue;
    if (head.length < 3 || obj.length < 3) continue;
    if (head === obj) continue;
    out.push({ op: 'CON', src: head, tgt: obj, via: 'of', srcKind: 'np', tgtKind: 'np', nominalized: true });
  }
  return out;
};

export const parseRelations = (sentence, admission, coref = {}, opts = {}) => {
  // Speech / copula / modifier classification comes from the conventions ledger
  // when one is supplied (its seed ∪ Pass-0 learned), falling back to the seeds.
  const isSpeech = opts.isSpeech || defIsSpeech;
  const isConjunction = opts.isConjunction || defIsConjunction;   // ledger coordinator predicate
  const verbOpts = { isCopula: opts.isCopula || defIsCopula, isModifier: opts.isModifier || defIsModifier };
  const npGuards = { isSpeech, isCopula: verbOpts.isCopula, isModifier: verbOpts.isModifier };
  // The NP referent object slot (move 2) is ON for the page (the pipeline asks for
  // referents) and OFF for the talker-claim veto (correspond.js): an unanchored
  // common noun is an UNRESOLVED endpoint there, not a node — the veto grounds only
  // against document figures. So an undefined opt keeps the old name-only behaviour.
  const wantReferents = !!opts.referents;
  // §1/§4 — the total read. OFF (the default, the talker-claim veto, every golden) the
  // scan is byte-identical: one edge per clause head, no confidence field, relative
  // clauses fail to silence, subordinators are dropped. ON, the reader withholds nothing
  // it apprehends: every clause and sub-clause is a proposition site (§2), each edge
  // carries a confidence (§4), the relative clause binds its antecedent (§2), and the
  // subordinators become inter-proposition links (§3). Total over the phenomenon, never
  // over the noumenon — the widening is over the syntactic forms read, never the
  // semantic liberty taken (§6).
  const totalRead = !!opts.totalRead;
  const out = [];
  const s = sentence.trim();

  // Move 1 — run the SVO scan PER CLAUSE, not once per sentence. A clause-initial
  // subject is reachable where a sentence-initial one was not (the carve-limit fix);
  // each clause carries its offset so the argument-span SEG still walks back to `s`.
  // `running` is the sentence's OPEN ACTIVATION: the subject a prior clause
  // established, the one a verb-initial continuation ("…, and begat Enoch") attaches
  // to. A genealogy's "And he begat… and begat… and begat…" is exactly this — one
  // patriarch, held active, gathering sons across subjectless clauses.
  let running = null;
  // §3 — the matrix proposition a subordinate clause hangs off: the head proposition of
  // the clause read just before this one, reified (propIdOf). Carried across clauses so a
  // subordinator opener links THIS clause's proposition back to it.
  let prevProp = null;
  // The per-clause body is a closure so its early exits stay `return`s while the loop
  // still runs the inter-proposition bookkeeping (§3) and the confidence stamp (§4) after
  // each clause. `running` and `out` are the outer bindings it folds into.
  const emitClause = (clause) => {
    const base = clause.offset;                       // clause-relative offset → `s`
    // §2/§4 — which proposition SITE this clause is, fixing the confidence prior and
    // (for §3) whether it links back to the matrix. A relative opener (who/which) reads
    // its body as the antecedent's proposition; a subordinator opener (because/when/…)
    // reads a full proposition that also links. Null → an ordinary main/continuation clause.
    const relativeAntecedent = totalRead && RELATIVE_OPENER.has(clause.opener);
    const clauseSite = RELATIVE_OPENER.has(clause.opener) ? 'relative'
                     : (SUBORDINATOR_TYPE[clause.opener] ? 'subordinate' : null);
    // Stamp a graded confidence onto an edge when the total read is on; a no-op otherwise,
    // so the default edge shape is byte-identical (§9 golden parity).
    const graded = (edge, site, subjKind, objKind) =>
      totalRead ? { ...edge, confidence: gradeConfidence(site, subjKind, objKind) } : edge;

    // Coordinated subjects: read every conjunct, seek the verb after the WHOLE
    // coordination, and bond each conjunct to the shared object — two subjects on one
    // object is a length-two path between them, the structural signature of
    // convergence the single-subject scan (first conjunct only) drops. Gated by
    // `opts.coordSubjects` so the legacy single-subject graph is byte-identical when
    // off; the conjunction word-class is asked of the ledger, never hard-listed.
    if (opts.coordSubjects) {
      const coord = coordinatedSubjects(clause.text, admission, isConjunction);
      if (coord) {
        const after = clause.text.slice(coord.end);
        const head  = headVerb(after, verbOpts);
        if (head && !head.copular) {
          const op = isSpeech(head.verb) ? 'SIG' : 'CON';
          const restBase = base + coord.end + head.restStart;
          // Shared object: a named patient if present (excluding the subjects), else
          // the NP head — the SAME object both conjuncts converge on. One edge per
          // conjunct to it.
          const named = objectEntities(head.rest, admission, null)
                          .filter(o => !coord.subjects.some(su => su.id === o.id));
          const targets = named.length
            ? named.map(o => ({ id: o.id, start: o.start, end: o.end, kind: undefined }))
            : (() => { const np = wantReferents ? npObject(head.rest, npGuards) : null;
                       return np ? [{ id: np.lemma, start: np.start, end: np.end, kind: 'np' }] : []; })();
          for (const t of targets) {
            const oStart = restBase + t.start, oEnd = restBase + t.end;
            const object = { text: s.slice(oStart, oEnd), start: oStart, end: oEnd, id: t.id };
            const verb   = { text: head.verb, start: base + coord.end + head.at, end: restBase };
            for (const su of coord.subjects) {
              const subject = { text: su.text, start: base + su.start, end: base + su.end, id: su.id };
              out.push(graded({ op, src: su.id, tgt: t.id, via: head.verb,
                         ...(t.kind ? { tgtKind: t.kind } : {}), ...polmod(head),
                         coord: true, args: { subject, verb, object, op } },
                       clauseSite || 'coordSubject', 'name', t.kind));
            }
          }
          if (targets.length) { running = { id: coord.subjects[coord.subjects.length - 1].id, w: 1 }; return; }
        }
      }
    }

    let subj = leadingSubject(clause.text, admission, coref);
    if (!subj || !subj.id) {
      // No subject token, but a head verb after any coordinator → DEFAULT TO THE
      // LAST INS REFERENT ACTIVATED. The arrow of time, not the gravity well: the
      // running subject this sentence established, else the most recently
      // instantiated referent still in the activation window (`coref.lastIns`) —
      // never the field's mass-argmax, which in a God-heavy text is just the
      // biggest well. Its weight rides as coupling: a witnessed deposit, not a
      // certain claim.
      const lead = (clause.text.match(LEAD_COORD) || [''])[0].length;
      // A relative clause ("…player WHO refuses…") binds its subject to the ANTECEDENT,
      // the head noun the splitter dropped, never an arbitrary running subject. Without
      // the total read there is no antecedent resolver, so it fails toward silence (the
      // wrong-subject read — "refuses to speak" pinned on the narrator — is worse than a
      // missed edge). Under the total read the antecedent IS the running figure (the head
      // the relative clause modifies, established by the clause just before it), so the
      // embedded clause is read as a full proposition with that figure as subject (§2),
      // graded by the `relative` prior — present and low, never dropped (§1).
      if (relativeAntecedent) {
        if (running && running.id && headVerb(clause.text.slice(lead), verbOpts))
          subj = { id: running.id, start: lead, end: lead, text: '', kind: 'relative', w: running.w ?? 1 };
      } else if (!RELATIVE_OPENER.has(clause.opener) && headVerb(clause.text.slice(lead), verbOpts)) {
        const inh = running || (coref.lastIns ? coref.lastIns() : null);
        if (inh && inh.id) subj = { id: inh.id, start: lead, end: lead, text: '', kind: 'inherited', w: inh.w ?? 0 };
      }
    }
    if (!subj || !subj.id) return;

    // Compound subjects — "A and B [and C …] verb …" — collect co-subjects by
    // scanning for "and|or [AdmittedName]" immediately after the leading subject
    // and before the verb. Only expands for a NAMED initial subject; a pronoun
    // subject is a single resolved referent, not a conjunction candidate.
    // When expansion fires, `afterStart` advances past all co-subjects so the verb
    // scan starts at the right position, and each co-subject gets its own bond.
    // Single-subject sentences are unaffected: subjects remains [subj], afterStart
    // stays subj.end, and every downstream calculation is byte-identical.
    let afterStart = subj.end;
    const subjects = [subj];
    if (subj.kind === 'name') {
      const rest0 = clause.text.slice(subj.end);
      let conjConsumed = 0;
      while (true) {
        const cjM = rest0.slice(conjConsumed).match(/^\s*(?:and|or)\s+/i);
        if (!cjM) break;
        const nameStart = conjConsumed + cjM[0].length;
        const ents = scanEntities(rest0.slice(nameStart));
        const first = ents.find(e => e.start <= 1);
        if (!first || !admission.isAdmitted(first.label)) break;
        const coId = admission.idOf(first.label);
        if (!coId || coId === subj.id) break;
        subjects.push({ id: coId, start: subj.end + nameStart + first.start,
                        end: subj.end + nameStart + first.end, text: first.label, kind: 'name', w: 1 });
        conjConsumed = nameStart + first.end;
      }
      if (subjects.length > 1) afterStart = subj.end + conjConsumed;
    }
    running = { id: subjects[subjects.length - 1].id,
                w: subjects[subjects.length - 1].kind === 'name' ? 1 : (subjects[subjects.length - 1].w ?? 0) };

    const after = clause.text.slice(afterStart);
    const head  = headVerb(after, verbOpts);
    if (!head) return;

    // Argument spans — offsets back into `s` (which equals doc.sentences[sentIdx] —
    // segmentSentences trims), each carrying its verbatim text so the walk is
    // self-verifying. The pipeline emits these as a logged clause-level SEG before
    // the bond, so a CON is walkable back to the text its endpoints were read from
    // (§3). Carried on the rel as `args`; the pipeline strips it after emitting the SEG.
    const vStart = base + afterStart + head.at, vEnd = base + afterStart + head.restStart;
    const verb     = { text: s.slice(vStart, vEnd), start: vStart, end: vEnd };
    const restBase = vEnd;

    if (head.copular) {
      // PASSIVE → typed active edge: "<patient> is/was [being] <participle> by <AGENT>" becomes
      // AGENT -> patient : participle, when the agent is an admitted named entity. Otherwise the
      // copular predicate flattens to a DEF as before.
      const pv = passiveParticiple(head.rest);
      if (pv) {
        const agentText = head.rest.slice(pv.byEnd);
        const agentBase = restBase + pv.byEnd;
        const vStartP = restBase + pv.partStart, vEndP = vStartP + pv.verb.length;
        const verbSpan = { text: s.slice(vStartP, vEndP), start: vStartP, end: vEndP };
        let emitted = false;
        for (const csub of subjects) {
          const cw = coupling(csub);
          const patient = { text: csub.text, start: base + csub.start, end: base + csub.end, id: csub.id };
          for (const ag of objectEntities(agentText, admission, csub.id)) {
            const aStart = agentBase + ag.start, aEnd = agentBase + ag.end;
            const agent = { text: s.slice(aStart, aEnd), start: aStart, end: aEnd, id: ag.id };
            out.push(graded({ op: 'CON', src: ag.id, tgt: csub.id, via: pv.verb, ...cw, ...polmod(head),
                       args: { subject: agent, verb: verbSpan, object: patient, op: 'CON' } },
                     clauseSite || 'passive', 'name'));
            emitted = true;
          }
        }
        if (emitted) return;   // the typed edge stands in for the flat copular DEF
      }
      const pred = head.rest.replace(/^[\s,]+/, '').replace(/[.!?]+\s*$/, '').trim();
      if (pred) {
        // §2 — Coordinated predicates. "Dolphins are intelligent, social, and emotional" is
        // THREE propositions, one DEF per conjunct from the shared subject, not one DEF over
        // the whole tail. Off the total read the predicate stays whole (byte-identical); on,
        // it splits on the coordination, the first conjunct graded `copula`, the rest the
        // weaker `coordPredicate`. A single-conjunct predicate ("a violinist") splits to one.
        const parts = totalRead
          ? pred.split(/\s*,\s*(?:and\s+|or\s+)?|\s+and\s+|\s+or\s+/i).map(p => p.trim()).filter(Boolean)
          : [pred];
        for (const csub of subjects) {
          const cw = coupling(csub);
          parts.forEach((value, pi) => {
            out.push(graded({ op: 'DEF', id: csub.id, key: 'predicate', value, ...cw, ...polmod(head) },
                     clauseSite || (pi === 0 ? 'copula' : 'coordPredicate'), csub.kind));
          });
        }
      }
      return;
    }
    const op = isSpeech(head.verb) ? 'SIG' : 'CON';

    for (const csub of subjects) {
      const cw = coupling(csub);
      const subject = { text: csub.text, start: base + csub.start, end: base + csub.end, id: csub.id };
      let bonded = false;
      for (const obj of objectEntities(head.rest, admission, csub.id)) {
        const oStart = restBase + obj.start, oEnd = restBase + obj.end;
        const object = { text: s.slice(oStart, oEnd), start: oStart, end: oEnd, id: obj.id };
        out.push(graded({ op, src: csub.id, tgt: obj.id, via: head.verb, ...cw, ...polmod(head), args: { subject, verb, object, op } },
                 clauseSite || 'main', csub.kind));
        bonded = true;
      }
      // The NP referent object — only when the page asks for referents, and only when
      // a named patient did not already bond this clause (a figure is never shadowed
      // by an incidental noun). The endpoint is the lemma id, tagged `np` so the
      // fold and the pipeline read it as a referent, never a figure.
      if (wantReferents && !bonded) {
        const np = npObject(head.rest, npGuards);
        if (np) {
          const oStart = restBase + np.start, oEnd = restBase + np.end;
          const object = { text: s.slice(oStart, oEnd), start: oStart, end: oEnd, id: np.lemma };
          out.push(graded({ op, src: csub.id, tgt: np.lemma, via: head.verb, tgtKind: 'np', ...cw, ...polmod(head),
                     args: { subject, verb, object, op } }, clauseSite || 'main', csub.kind, 'np'));
        }
      }
    }
  };  // end emitClause

  // The clause driver. Each clause folds its propositions into `out`; then (§3) a
  // subordinator opener links this clause's head proposition back to the matrix one,
  // and the head proposition becomes the matrix for the next clause. The link itself is
  // a CON between two REIFIED proposition nodes (srcKind/tgtKind 'prop'), typed by the
  // subordinator — the object-to-object bond the graph is starved of without it (§3).
  for (const clause of segmentClauses(s, opts.coordSubjects ? { boundaries: COORD_CLAUSE_BOUNDARY } : undefined)) {
    const clauseStart = out.length;
    emitClause(clause);
    if (!totalRead) continue;
    // The clause's OWN head proposition — the first bond/define it emitted, never an
    // inter-proposition link folded in by an earlier clause.
    const primary = out.slice(clauseStart).find(e => (e.op === 'CON' || e.op === 'SIG' || e.op === 'DEF') && !e.linkKind);
    if (!primary) {
      // §2 — the coordinated-predicate tail. "Dolphins are intelligent, social, and
      // emotional" is three predicates, but the clause splitter shears the last conjunct
      // onto its own clause at the ', and ' boundary, where it has no verb and emits
      // nothing. Recover it as another DEF on the matrix subject — gated to a COPULAR
      // matrix (prevProp.def), so a verb continuation ("…, and slept") is never misread
      // as a predicate, and to a single bare content word that is not itself a modifier.
      const tail = (/^(and|or|nor)$/.test(clause.opener || '') && prevProp && prevProp.def)
        ? clause.text.replace(/^[\s,]+/, '').replace(/[.!?,;:]+\s*$/, '').trim() : '';
      if (tail && /^[a-z][a-z-]*$/i.test(tail) && !verbOpts.isModifier(tail.toLowerCase()) && !verbOpts.isCopula(tail.toLowerCase())) {
        out.push({ op: 'DEF', id: prevProp.subjId, key: 'predicate', value: tail,
                   confidence: gradeConfidence('coordPredicate') });
      }
      continue;   // prevProp unchanged: the copular matrix still owns the next tail
    }
    const curId = propIdOf(primary);
    const linkType = SUBORDINATOR_TYPE[clause.opener];
    if (linkType && prevProp && prevProp.id !== curId) {
      out.push({ op: 'CON', src: curId, tgt: prevProp.id, via: linkType,
                 srcKind: 'prop', tgtKind: 'prop', linkKind: 'inter-proposition',
                 connective: clause.opener, confidence: gradeConfidence('interProp') });
    }
    // The matrix the next subordinate/coordinated clause hangs off. A copular DEF carries
    // its subject so a sheared predicate tail can rejoin it.
    prevProp = primary.op === 'DEF' ? { id: curId, def: true, subjId: primary.id } : { id: curId };
  }

  // §2 — General apposition and nominalized relations, read across the whole sentence
  // (they are not clause-local). Apposition needs admission (a renamed figure); the
  // nominalized "of" genitive is an NP-to-NP referent bond, so it rides with the page's
  // referent reading. Both are total-read only and deduped against what the SVO scan
  // already emitted, so nothing is double-counted.
  if (totalRead) {
    for (const a of appositionEdges(s, admission)) {
      if (!out.some(o => o.op === 'DEF' && o.id === a.id && o.value === a.value))
        out.push({ ...a, confidence: gradeConfidence('apposition') });
    }
    if (wantReferents) for (const n of nominalizedEdges(s)) {
      if (!out.some(o => o.op === 'CON' && o.src === n.src && o.tgt === n.tgt && o.via === n.via))
        out.push({ ...n, confidence: gradeConfidence('nominalized', 'np', 'np') });
    }
  }

  for (const k of kinshipEdges(s, admission, coref)) {
    if (!out.some(o => o.op === k.op && o.src === k.src && o.tgt === k.tgt))
      out.push(totalRead ? { ...k, confidence: gradeConfidence('kinship') } : k);
  }

  for (const a of attributionEdges(s, admission)) {
    if (!out.some(o => o.op === a.op && o.src === a.src && o.tgt === a.tgt))
      out.push(totalRead ? { ...a, confidence: gradeConfidence('attribution') } : a);
  }

  return out;
};
