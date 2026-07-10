// EO: EVA·DEF·REC(Field,Kind → Kind,Paradigm, Tracing,Dissecting,Composing) — task register (DEF·EVA·REC)
// The task register — the turn's task, read off the question as PHYSICS, governed
// by a DEF·EVA·REC loop. (docs/task-register.md)
//
// This used to be a regex cliff: the first pattern to match decided the task. Now the
// register is a MEASUREMENT with the same mechanics the route grain already runs
// (turn/meta-route.js) and the same defeasibility the conventions ledger gives every
// word-list (core/conventions/ledger.js):
//
//   · each task owns a BASIS — a term profile built from exemplar phrases, the
//     exemplar-centroid trick shape.js and meta-route.js run at their grains;
//   · the question's Born weight |⟨B|q⟩|² against each basis (surfer/salience.js) is
//     that task's raw pull;
//   · each weight is gated by a CROSSTALK NULL (core/voidnull.js deriveNull, ceiling of
//     what the OTHER tasks' exemplars score against this basis) — a task acts only when
//     the question aligns with it better than off-task speech does;
//   · the surviving currents settle in the winner-take-all relaxation the essay moves
//     settle in (longgen/relax.js), with `answer` as the RESTING DEFAULT — a pointed
//     lookup is not a signal, it is the ground state a real current must out-compete.
//
// The old regexes are still here, DEMOTED from cliff to SEED: when the measurement is
// alive a fired regex folds in at SEED weight (it informs, it does not decide — the
// same weight relax.js gives p(next)); when the measurement abstains (a terse question
// carries too little lexical signal to clear any null) the regex baseline rules,
// byte-identical to the old readTask. And every piece of held knowledge — each
// exemplar phrase AND each regex — is a CONVENTION on the DEF·EVA·REC loop, the same
// shape as the conventions ledger and the write-side grammar rules (write/eva.js):
//
//   DEF   hold an exemplar (this phrasing asks for a summary) — the tending surface
//         that replaces regex-patching: a misrouted phrasing is taught, not matched
//   EVA   test what carried a read against how the turn went → a hold reinforces
//         (support grows, strain relaxes), a break accrues strain
//   REC   revise: when strain overtakes support the convention is DEFEATED and leaves
//         the basis (or, for a regex, stops being consulted) — and a later run of
//         holds can reinstate it. A prior is a convention with support pre-baked, a
//         head start in confidence, not an exemption: a seed can lose.
//
// The register still sets the same three things it always did:
//
//   1. the prompt register — whether the summary degeneracy guard rides (summary
//      task only); a faithfulness instruction, NOT a length instruction.
//   2. the token ceiling (max_tokens) — the REAL length bound. There is no length
//      prescription in the prompt; the answer is as long as max_tokens allows.
//   3. the CUBE PLACEMENT — where on the EO cube the task operates: its DOMAIN (the
//      order of question / reading level — Existence / Structure / Interpretation),
//      its GRAIN (the Object axis — Ground / Figure / Pattern, "at what grain"), and
//      the SITE-FACE TERRAIN the two name ("where it lands"). A task is not
//      grain-blind: reading one without its grain is exactly the error the cube
//      forbids — a Figure fix applied to a Pattern problem (docs/cube.md). The
//      placement rides into the turn context (turn/stages.js spreads the register),
//      so every downstream stage knows the grain the question is asked at.
//
// The whole-document IDENTITY question is a summary, not a pointed lookup. "what is this
// document?", "what is this about", "what is this?" all ask the talker to say what the
// WHOLE document is — drawing the excerpts together — not to find a fact at one location.
// That distinction is now carried two ways at once: the identity phrasings sit in the
// summary BASIS while the pointed "what is this WORD" phrasings sit in the answer
// CONTRAST basis, so the crosstalk null holds them apart in the measurement; and the
// doc-noun regex keeps the same line as the seed for the terse forms the physics
// abstains on.

import { terrainOf } from '../core/index.js';
import { tok } from '../perceiver/parse/index.js';
import { bornSalience } from '../surfer/salience.js';
import { deriveNull } from '../core/voidnull.js';
import { relax } from '../weave/longgen/relax.js';

export const TASK_MAX_TOKENS = Object.freeze({
  summary: 512,
  list:    448,
  explain: 448,
  answer:  384,   // the default
});

// ── The cube register — where on the EO cube each task operates ──────────────────
// Each task names the DOMAIN it reads in (the reading level, docs/reading-levels.md)
// and the GRAIN it reads at (the Object axis, core/cube.js). The pair fixes the
// Site-face TERRAIN — "where it lands" — derived from the cube authority below, never
// hardcoded, so an entry can only name a real cell. The readings:
//
//   answer  · a fact at ONE location — a concrete individual you fetch.   Existence × Figure  → Entity
//   summary · the WHOLE document read as one frame — not a fact to fetch. Interpretation × Pattern → Paradigm
//   list    · the SET of members as one regularity — enumeration.         Structure × Pattern → Network
//   explain · a thing read UNDER a frame — the how/why of one figure.     Interpretation × Figure → Lens
//
// summary and explain both live in Interpretation (level 3) but at different grains —
// summary works the Pattern (the document-as-paradigm), explain works a Figure (one
// thing, through a Lens). list is Structure (level 2): the network of parts. answer is
// the Existence default (level 1): presence at a point. That a pointed lookup and a
// "what is this document" question sit at DIFFERENT grains is the whole reason summary
// must not be answered as a lookup — the cube names the difference the router enforces.
const LEVEL = Object.freeze({ Existence: 1, Structure: 2, Interpretation: 3 });
const TASK_CUBE = Object.freeze({
  answer:  { domain: 'Existence',      grain: 'Figure'  },
  summary: { domain: 'Interpretation', grain: 'Pattern' },
  list:    { domain: 'Structure',      grain: 'Pattern' },
  explain: { domain: 'Interpretation', grain: 'Figure'  },
});

// The full cube placement of a task: its domain, grain, the terrain the two name
// (from the cube authority, core/cube.js), and the reading level. Defaults to the
// `answer` cell for any unknown task, so the register is total.
export const cubeOf = (task) => {
  const c = TASK_CUBE[task] || TASK_CUBE.answer;
  return Object.freeze({
    domain:  c.domain,
    grain:   c.grain,
    terrain: terrainOf(c.domain, c.grain),   // Site face — where it lands
    level:   LEVEL[c.domain],
  });
};

// ── The regex seeds — the old cliff, demoted to defeasible cues ──────────────────
// Kept verbatim: they are the sediment the register started from, exactly as the
// conventions ledger's word-lists are inherited sediment. Each is held as a rule on
// the DEF·EVA·REC loop (a `cue` in the ledger below) and consulted only while it is
// on. When the measurement is alive a fired cue folds in at SEED weight; when the
// measurement abstains the cue read is the baseline.

// The nouns that name the document as a whole — "what is this DOCUMENT" is a summary,
// "what is this WORD" is not. Kept narrow on purpose.
const DOCNOUN = 'document|doc|text|file|story|book|passage|article|work|novel|essay|paper|chapter';
const SUMMARY = new RegExp(
  '\\b(summar(?:y|ies|ise|ize|ising|izing)|tl;?dr|recap|gist|overview)\\b' +
  `|\\bwhat(?:'s| is| are)\\s+(?:this|it)\\b(?:` +
    `\\s+(?:${DOCNOUN})s?\\b(?:\\s+about\\b|\\s*\\??\\s*$)` +  // "what is this document?", "what is this text about"
    '|\\s*(?:mainly\\s+)?about\\b' +                          // "what is this about", "what is this mainly about"
    '|\\s*\\??\\s*$' +                                        // "what is this?" — the bare identity question
  ')',
  'i',
);
// A COVERAGE continuation — "what about the rest?", "the rest of it", "the whole thing",
// "everything else". The audit's t2: after a "summarize", the user pushed back that the
// reply was "just the top part, what about the rest?" — a request to cover the WHOLE
// document, which the bare `answer` task read as a pointed lookup and answered from a
// handful of arbitrary spans. It is a whole-document task like a summary: routing it here
// takes retrieval onto the structural skeleton (an even spread across the body), which is
// the coverage the user is asking for. Kept narrow — it matches scope-of-document phrases,
// not a pointed "what about X" naming a real term.
const COVERAGE = new RegExp(
  '\\bthe\\s+rest\\b' +                                      // "the rest", "what about the rest"
  `|\\brest\\s+of\\s+(?:it|this|that|the)\\b` +              // "the rest of it / the document"
  `|\\bthe\\s+whole\\s+(?:thing|${DOCNOUN})\\b` +            // "the whole thing / document"
  '|\\beverything\\s+else\\b|\\bwhat\\s+else\\b',            // "everything else", "what else"
  'i',
);
const LIST    = /\b(list|enumerate|bullet(?:s|ed)?|name\s+(?:every|all|each)|what\s+are\s+the)\b/i;
const EXPLAIN = /\b(explain|elaborate|walk\s+me\s+through|in\s+detail|why|how)\b/i;

// META-CONVERSATIONAL detection — a question that is ABOUT the conversation itself, not
// (only) about the document. "which topic we've discussed is in France?", "what did you
// say earlier?", "of the things we covered, which…". These route grounded (the answer
// still needs the page — "in France" wants the Eiffel-Tower spans) but ALSO need the
// prior turns as their SUBJECT, which the default grounded register withholds (it feeds
// the user's thread "for context only, answer just the latest" — the opposite of what a
// meta question wants). The flag is orthogonal to the task register: it widens what
// conversation the prompt carries and how it is framed, it does not change the task.
//
// The history-poisoning firewall the grounded register guards (a wrong prior ANSWER
// becoming a premise) is asymmetric: here the prior turns are the question's subject, not
// a premise it anchors a fact to, so opening the assistant side is the point, not a leak.
//
// Kept narrow: a subject (we / you / I, with contractions) bound to a PAST/progressive
// conversing verb ("we've discussed", "you said", "I asked"); or an explicit conversation
// noun ("this conversation", "our chat"); or a topic/thing/question noun tied back to
// we/you/I ("the topics we explored"). Present-tense bare forms that double as polite
// document phrasings ("what would you say is the theme") are deliberately NOT verbs here.
const META_SUBJ = "(?:we|you|i)(?:['’](?:ve|d|ll|m|re))?";
const META_AUX  = "(?:\\s+(?:have|had|has|been|already|just|also|recently|earlier|previously|both|now))*";
const META_VERB = "(?:discuss(?:ed|ing)|talk(?:ed|ing)|cover(?:ed|ing)|mention(?:ed|ing)|" +
  "said|saying|spoke|told|asked|brought\\s+up|went\\s+over|gone\\s+over|chat(?:ted|ting)|" +
  "establish(?:ed)?|noted|review(?:ed)?|gone\\s+through|been\\s+over)";
const META_CONV = new RegExp(
  `\\b${META_SUBJ}\\b${META_AUX}\\s+${META_VERB}\\b` +                              // "we've discussed", "you said"
  `|\\b(?:did|do|does)\\s+${META_SUBJ}\\s+(?:say|said|tell|mention|ask|asked|put|word|claim|cover|discuss|mean)\\b` +  // "did you say earlier?"
  '|\\b(?:this|our|that)\\s+(?:conversation|chat|thread|discussion|exchange|dialogue|session)\\b' +  // "this conversation"
  `|\\b(?:topics?|things?|subjects?|questions?|points?)\\b(?:\\s+\\w+){0,3}\\s+\\b${META_SUBJ}\\b` +  // "the topics we explored"
  // The IMPLICIT meta form — selecting over a TOPIC/SUBJECT without naming the conversation
  // ("which topic is in France?", "of the topics, which is oldest?"). "topic"/"subject" used as
  // a selector presupposes a set the conversation already established — you ask which CHARACTER
  // or PLACE inside a document, but which TOPIC refers back to what was discussed. Narrow on
  // purpose — only these two nouns, only in a selection frame.
  '|\\bwhich(?:ever)?\\s+(?:of\\s+(?:the|those|these)\\s+)?(?:topics?|subjects?)\\b' +  // "which topic", "which of the subjects"
  '|\\bof\\s+(?:the|those|these)\\s+(?:topics?|subjects?)\\b' +                          // "of the topics, which…"
  '|\\b(?:my|your|the)\\s+(?:first|second|third|last|previous|earlier|original|initial|prior|other)' + // "my first question", "your earlier answer"
    '\\s+(?:questions?|answers?|points?|repl(?:y|ies)|messages?|responses?|asks?)\\b',
  'i',
);

// ── The exemplar priors — the bases the measurement projects onto ─────────────────
// Inherited sediment, same status as the conventions ledger's seed lists: a prior is a
// convention with support pre-baked, not an axiom. Each phrase is one convention on
// the loop; a defeated phrase leaves its basis on the next read. The `answer` group is
// the CONTRAST basis — answer is the resting default and never a current of its own;
// its phrases exist to raise the other tasks' crosstalk nulls (the pointed lookups the
// whole-document tasks must out-align, held apart the way the develop/brief pair holds
// itself apart in meta-route.js). Short pointed forms matter: a two-term contrast sets
// a ceiling a two-term question cannot slip under on norm alone.
export const TASK_EXEMPLARS = Object.freeze({
  summary: [
    // the summary words — the regex-era sediment, re-spoken as phrases
    'summarize the whole document for me',
    'summarise the entire text',
    'give me a summary of the whole thing',
    'a quick recap of everything in it',
    'the gist of the whole document',
    'an overview of the entire piece',
    'the tldr — a tl;dr of the whole text',
    'condense it — the short version of the whole piece',
    'boil the whole thing down for me',
    // the whole-document IDENTITY question
    'what is this about',
    'what is this document about',
    'what is the text mainly about',
    'what is this story about',
    'what is the whole document saying',
    // the COVERAGE continuation
    'what about the rest of the document',
    'tell me the rest of it',
    'cover everything else in the rest of it',
  ],
  list: [
    'list every character in it',
    'enumerate them all, one by one',
    'a bulleted list of all of them',
    'name each and every member',
    'the themes — name all of them',
    'the main points, listed out',
    'all the items, listed',
  ],
  explain: [
    'explain the ending to me',
    'explain how it works',
    'explain why it happened',
    'walk me through it step by step',
    'elaborate on the reasoning in detail',
    'why did it turn out that way, and how',
    'unpack the reasoning behind it',
    'break down how and why it happened',
  ],
  answer: [
    // the CONTRAST — pointed lookups; the null-raisers, never a current
    'what about the ending',
    'what happened',
    'the name of it',
    'what is this word',
    'what is this number',
    "what is this character's name",
    'what is this place called',
    'what is this made of',
    'who is this person',
    'where did it happen',
    'what does he turn into',
    'when did it take place',
  ],
});

// The meta pair — the same contrast shape at the meta-conversational grain: `meta` is
// measured, `doc` is its contrast (the ordinary document questions meta speech must
// out-align, including the polite "what would you say" forms that defeat a bag of
// words on their shared verbs).
export const META_EXEMPLARS = Object.freeze({
  meta: [
    "which topic we've discussed comes up again",
    'of the topics we covered, which one was it',
    'which of those subjects came up first',
    'what did you say earlier in this conversation',
    'you mentioned it before — remind me',
    'what was my first question to you',
    'summarize our conversation so far',
    'the things we talked about in this chat',
    'earlier in our discussion you told me',
    'which of your answers came first',
  ],
  doc: [
    // the CONTRAST — ordinary document questions, incl. the known impostors
    'who is the main character',
    'what is the capital of the country',
    'what happened earlier in the story',
    'what would you say is the main theme',
    'tell me about the tower',
    'explain the process plainly',
    'what does he turn into',
    'who did she talk to in chapter two',
  ],
});

// Tuning — the same registers meta-route.js runs. GAIN lifts a clear Born weight to
// where it competes with the resting potential; REST is the answer default's head
// start (a pointed lookup is the ground state, a whole-document current must
// out-compete it); SEED is the fired cue's tiebreak, folded in only when the
// measurement is alive. PRIOR_SUPPORT is the pre-baked strain-history a prior
// carries — it takes more breaks to defeat a seed than a fresh learned exemplar.
const GAIN = 10;
const REST = 0.35;
const SEED = 0.25;
const ALPHA = 0.05;
const PRIOR_SUPPORT = 3;

export const TASK_ALPHABET = Object.freeze(['summary', 'list', 'explain', 'answer']);
const MEASURED = ['summary', 'list', 'explain'];          // answer is the resting default
const FAMILY = Object.freeze({                             // crosstalk stays within a family
  summary: 'task', list: 'task', explain: 'task', answer: 'task',
  meta: 'meta', doc: 'meta',
});

// The crosstalk null for one basis: the background is every OTHER group's live
// exemplars scored against THIS basis — a constructed chance ensemble of the overlap
// the vocabularies share with no signal present. The line is its CEILING (α→0
// extreme-value boundary — "align better than every off-task phrase does"), floored
// by deriveNull's projection when the background can carry one. Same construction as
// meta-route.js crosstalkNull. Infinity (no background) leaves the group dead.
const crosstalkNull = (profiles, group, groupsOf) => {
  const basis = profiles.get(group);
  const bg = [];
  for (const [other, entries] of groupsOf) {
    if (other === group || FAMILY[other] !== FAMILY[group]) continue;
    for (const e of entries.values()) if (!e.defeated) bg.push(bornSalience(basis, e.terms));
  }
  if (bg.length === 0) return Infinity;
  const line = deriveNull(bg, { alpha: ALPHA });
  return Math.max(Math.max(...bg), Number.isFinite(line) ? line : 0);
};

// createTaskRegister({ exemplars, metaExemplars, priors }) → the register: the
// measurement AND the ledger that governs it. `priors: false` constructs with the
// inherited sediment OFF — no exemplars, no cues — the falsifiability substrate: the
// register still answers (everything abstains to the `answer` default) and can be
// taught from nothing with def().
export const createTaskRegister = ({
  exemplars = TASK_EXEMPLARS,
  metaExemplars = META_EXEMPLARS,
  priors = true,
} = {}) => {
  // group → Map(phrase → entry). entry = { origin, weight, support, strain, defeated, terms }
  // — the same entry shape as the conventions ledger, keyed on the phrase.
  const groups = new Map();
  for (const g of Object.keys(FAMILY)) groups.set(g, new Map());
  const rules = [];                  // the append-only revision log (audit)
  let rev = 0;                       // bumps on membership change → bases rebuild

  const entry = (origin, weight) => ({
    origin, weight, support: origin === 'prior' ? PRIOR_SUPPORT : weight,
    strain: 0, defeated: false,
  });
  const hold = (g, phrase, origin, weight = 1) => {
    const p = String(phrase || '').trim();
    if (!p) return;
    const m = groups.get(g);
    const e = m.get(p);
    if (e) { e.weight += weight; e.support += weight; e.origin = origin === 'prior' ? e.origin : 'learned'; e.defeated = false; }
    else m.set(p, { ...entry(origin, weight), terms: new Set(tok(p)) });
    rev += 1;
  };

  if (priors) {
    for (const [g, phrases] of Object.entries(exemplars)) for (const p of phrases) hold(g, p, 'prior');
    for (const [g, phrases] of Object.entries(metaExemplars)) for (const p of phrases) hold(g, p, 'prior');
  }

  // The regex CUES, held as rules on the same loop (write/eva.js shape, ledger entry).
  // Consulted only while on; priors: false starts them defeated — nothing hard-coded true.
  const cues = new Map([
    ['summary',  { ...entry('prior', 0), task: 'summary', re: SUMMARY }],
    ['coverage', { ...entry('prior', 0), task: 'summary', re: COVERAGE }],
    ['list',     { ...entry('prior', 0), task: 'list',    re: LIST }],
    ['explain',  { ...entry('prior', 0), task: 'explain', re: EXPLAIN }],
    ['meta',     { ...entry('prior', 0), task: 'meta',    re: META_CONV }],
  ]);
  if (!priors) for (const c of cues.values()) c.defeated = true;

  // The first live cue that fires — order matters exactly as the old readTask: summary
  // is read before list/explain because "what is this about" must not be captured by
  // explain's "how/why".
  const cueOf = (q) => {
    for (const name of ['summary', 'coverage', 'list', 'explain']) {
      const c = cues.get(name);
      if (!c.defeated && c.re.test(q)) return { name, task: c.task };
    }
    return null;
  };

  // ── the bases, rebuilt lazily when the ledger revs ──
  let built = -1, bases = null;
  const basesOf = () => {
    if (built === rev) return bases;
    const profiles = new Map();
    for (const [g, m] of groups) {
      const prof = new Map();
      for (const e of m.values()) {
        if (e.defeated) continue;
        // weight-aware, as the conventions ledger's learn weight is: a re-held
        // exemplar deposits more mass, so teaching can out-weigh a prior ceiling.
        const w = Math.max(1, e.weight);
        for (const t of e.terms) prof.set(t, (prof.get(t) || 0) + w);
      }
      profiles.set(g, prof);
    }
    const nulls = new Map();
    for (const g of groups.keys()) nulls.set(g, crosstalkNull(profiles, g, groups));
    built = rev;
    bases = { profiles, nulls };
    return bases;
  };

  // measure(question) → { task, abstained, cue, weights, currents, activations } — the
  // physics. Null-gated Born currents per task; alive → relax with the answer default
  // at REST and the fired cue at SEED; dead → the cue baseline (byte-identical to the
  // old regex readTask), else the total default.
  const measure = (question) => {
    const q = String(question || '');
    const terms = new Set(tok(q));
    const b = basesOf();
    const weights = {}, gated = {};
    let alive = 0;
    for (const g of MEASURED) {
      const w = bornSalience(b.profiles.get(g), terms);
      weights[g] = w;
      gated[g] = w > b.nulls.get(g) ? GAIN * w : 0;
      alive += gated[g];
    }
    const cue = cueOf(q);
    if (alive <= 0) {
      return { task: cue ? cue.task : 'answer', abstained: true, cue: cue ? cue.name : null,
               weights, currents: null, activations: null };
    }
    const currents = { ...gated, answer: REST };
    if (cue) currents[cue.task] = (currents[cue.task] || 0) + SEED;
    const settled = relax(currents, { alphabet: [...TASK_ALPHABET] });
    return { task: settled.winner, abstained: false, cue: cue ? cue.name : null,
             weights, currents, activations: settled.activations };
  };

  // measureMeta(question) → the meta-conversational read on the same physics: the
  // question's Born weight against the meta basis, gated by the doc contrast's
  // crosstalk null. Alive → meta (the measurement decided); gated → the META_CONV
  // cue is the baseline, consulted while its rule is on.
  const measureMeta = (question) => {
    const q = String(question || '');
    const terms = new Set(tok(q));
    const b = basesOf();
    const w = bornSalience(b.profiles.get('meta'), terms);
    const n = b.nulls.get('meta');
    const c = cues.get('meta');
    const cueFired = !c.defeated && c.re.test(q);
    if (w > n) return { meta: true, abstained: false, weight: w, null: n, cue: cueFired ? 'meta' : null };
    return { meta: cueFired, abstained: true, weight: w, null: n, cue: cueFired ? 'meta' : null };
  };

  const applyEva = (e, holds) => {
    if (holds) { e.support += 1; if (e.strain > 0) e.strain -= 1; }
    else { e.strain += 1; }
    return e.strain > e.support && !e.defeated;
  };

  return {
    measure,
    measureMeta,
    isMeta: (question) => measureMeta(question).meta,

    // DEF — hold an exemplar. The tending surface: a phrasing the register misread is
    // TAUGHT into the right basis (or contrast), not patched into a regex. A held
    // phrase is learned sediment; holding it again reinforces it.
    def(group, phrase, weight = 1) {
      if (!groups.has(group)) throw new TypeError(`def: unknown group ${group}`);
      hold(group, phrase, 'learned', weight);
      rules.push({ op: 'DEF', group, phrase: String(phrase).trim(), weight, t: Date.now() });
    },

    // EVA — test what carried a read against how the turn went. The carriers are the
    // live exemplars of `group` the question made contact with, plus the cue that
    // fired toward `group`; a hold reinforces each, a break accrues strain, and REC
    // fires automatically when strain overtakes support: the convention is DEFEATED
    // and leaves the basis (a defeated cue stops being consulted).
    eva(question, group, holds = true) {
      if (!groups.has(group)) throw new TypeError(`eva: unknown group ${group}`);
      const q = String(question || '');
      const terms = new Set(tok(q));
      const touched = [];
      for (const [phrase, e] of groups.get(group)) {
        if (e.defeated) continue;
        let contact = false;
        for (const t of e.terms) if (terms.has(t)) { contact = true; break; }
        if (!contact) continue;
        if (applyEva(e, holds)) {
          e.defeated = true; rev += 1;
          rules.push({ op: 'REC', group, phrase, defeat: true, t: Date.now() });
        }
        touched.push(phrase);
      }
      const fam = FAMILY[group];
      const cue = fam === 'meta'
        ? (group === 'meta' && !cues.get('meta').defeated && META_CONV.test(q) ? 'meta' : null)
        : (() => { const c = cueOf(q); return c && c.task === group ? c.name : null; })();
      if (cue) {
        const c = cues.get(cue);
        if (applyEva(c, holds)) {
          c.defeated = true;
          rules.push({ op: 'REC', cue, defeat: true, t: Date.now() });
        }
        touched.push(`cue:${cue}`);
      }
      return { touched, holds };
    },

    // REC — revise directly: defeat a convention (a discovery beating a prior),
    // reinstate one (a later run of holds brings it back), or reinforce it.
    rec(group, phrase, { defeat = false, reinstate = false } = {}) {
      const m = groups.get(group);
      if (!m) throw new TypeError(`rec: unknown group ${group}`);
      const p = String(phrase || '').trim();
      let e = m.get(p);
      if (!e) { e = { ...entry('learned', 0), terms: new Set(tok(p)) }; m.set(p, e); }
      if (defeat) e.defeated = true;
      else if (reinstate) { e.defeated = false; e.strain = 0; }
      else e.support += 1;
      rev += 1;
      rules.push({ op: 'REC', group, phrase: p, ...(defeat ? { defeat: true } : {}), t: Date.now() });
      return { defeated: e.defeated, support: e.support, strain: e.strain };
    },
    defeatCue(name) {
      const c = cues.get(name);
      if (!c) throw new TypeError(`defeatCue: unknown cue ${name}`);
      c.defeated = true;
      rules.push({ op: 'REC', cue: name, defeat: true, t: Date.now() });
    },
    reinstateCue(name) {
      const c = cues.get(name);
      if (!c) throw new TypeError(`reinstateCue: unknown cue ${name}`);
      c.defeated = false; c.strain = 0;
      rules.push({ op: 'REC', cue: name, t: Date.now() });
    },

    // Convention status — the strain-history a consumer or a test can read.
    supportOf: (group, phrase) => groups.get(group)?.get(String(phrase).trim())?.support ?? 0,
    strainOf:  (group, phrase) => groups.get(group)?.get(String(phrase).trim())?.strain ?? 0,
    isDefeated:(group, phrase) => !!groups.get(group)?.get(String(phrase).trim())?.defeated,
    originOf:  (group, phrase) => groups.get(group)?.get(String(phrase).trim())?.origin ?? null,
    cueState:  (name) => { const c = cues.get(name); return c ? { support: c.support, strain: c.strain, on: !c.defeated } : null; },
    get rules() { return rules; },

    // Structured export — the sediment a later session could inherit, the same slot
    // the priors occupy (conventions ledger exportLedger shape).
    exportLedger() {
      const out = [];
      for (const [group, m] of groups)
        for (const [phrase, e] of m)
          out.push({ group, phrase, origin: e.origin, weight: e.weight,
                     support: e.support, strain: e.strain, defeated: e.defeated });
      for (const [name, c] of cues)
        out.push({ cue: name, task: c.task, support: c.support, strain: c.strain, defeated: c.defeated });
      return out;
    },
  };
};

// The default register — one per process, the same lazy singleton meta-route keeps
// for its bases. EVA/DEF on it tend the live routing; tests that exercise the loop
// build their own with createTaskRegister().
let _REGISTER = null;
export const taskRegister = () => (_REGISTER || (_REGISTER = createTaskRegister()));

export const readTask = (question) => taskRegister().measure(question).task;

// Does the question invoke the conversation itself? The same measurement, at the meta
// grain — physics when the question clears the meta basis's crosstalk null, the
// META_CONV cue as the baseline while its rule holds. Used by the route stage to open
// the assistant side of the session fold to the grounded prompt (turn/stages.js).
export const isMetaConversational = (question) => taskRegister().isMeta(question);

// The full register for a turn: the task name, its token ceiling, its cube placement
// (domain / grain / terrain / level), and the measurement audit (taskMeasure: did the
// physics decide or abstain, and which cue fired). The budget stays empty by default —
// no sentence line — so the only bound is max_tokens. The cube fields ride into the
// turn context (turn/stages.js), so the grain the question is asked at is available
// to every downstream stage — retrieval shape, the prompt register, the veto grain.
export const taskOf = (question) => {
  const m = taskRegister().measure(question);
  const cube = cubeOf(m.task);
  return {
    task: m.task,
    maxTokens: TASK_MAX_TOKENS[m.task] ?? TASK_MAX_TOKENS.answer,
    domain:  cube.domain,
    grain:   cube.grain,
    terrain: cube.terrain,
    level:   cube.level,
    taskMeasure: { abstained: m.abstained, cue: m.cue, weights: m.weights },
  };
};
