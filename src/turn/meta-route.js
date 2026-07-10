// EO: EVA·DEF(Atmosphere,Field → Lens,Paradigm, Tracing,Dissecting) — route off metacognition speech
// meta-route — the route read off the metacognition's own speech (docs/discourse-routing.md).
//
// The route grain was the last decision still made by string-matching the USER's words
// (intent.js regexes, artifactKindOf, COMPOSE_VERBS) or by forcing the model into a one-word
// vocabulary (transitionPrompt's CONTINUE/COMPOSE/GROUND/ISOLATE — JSON with fewer braces).
// This module performs the same collapse the loop already performed at the token, move, and
// field grains (docs/decision-as-relaxation.md): the model POINTS, in its own natural
// language, and a deterministic engine CONSTRUCTS the route from that speech.
//
// The metacognition is asked to talk plainly about the discourse — what the user is doing,
// what would satisfy them, what we don't know — with NO format contract at all. Its paragraph
// is then measured, not parsed:
//
//   · each route direction owns a BASIS — a term profile built from exemplar phrases, the
//     same exemplar-centroid trick shape.js runs at the answer-form grain;
//   · the paragraph's Born weight |⟨B|s⟩|² against each basis (surfer/salience.js — the same
//     projection the surfer rides) is that direction's raw pull;
//   · each weight is gated by a CROSSTALK NULL (deriveNull): the background is what the OTHER
//     directions' own exemplars score against this basis — the vocabulary the directions share
//     by chance. A direction acts only when the speech aligns with it more than off-direction
//     speech does; near-degenerate bases (essay vs poem share words) are nulled structurally;
//   · the surviving weights enter the same winner-take-all relaxation the essay moves settle
//     in (longgen/relax.js), with the carried stance as the INCUMBENT — a resting potential,
//     so continuation stays the default and a transition must out-compete it. The regex seeds
//     (isExplicitCompose, taskOf) fold in the same way: they inform, they do not decide.
//
// Why no meaning embedder here: the paraphrase problem lives in USER speech ("put together a
// few stanzas" defeats every poem regex). But the text measured here is MODEL speech, and a
// model describing that request says "the user wants a short poem" — the metacognition IS the
// semantic normalizer, so a lexical Born overlap in the engine's own term space suffices, and
// the route physics runs in the zero-download default instead of going dark until an organ
// warms. MiniLM keeps its territory where text nobody re-speaks is measured per-unit.
//
// Fallback contract (the same one routeStance already keeps): speech empty, model cold, or the
// paragraph coheres toward nothing (every weight under its null) → ABSTAIN → the caller's
// baseline (markers → continuation → fresh-regex-seed) rules, byte-identical to today.

import { tok, segmentSentences } from '../perceiver/parse/index.js';
import { bornSalience } from '../surfer/salience.js';
import { deriveNull } from '../core/voidnull.js';
import { relax } from '../weave/longgen/relax.js';
import { stanceDescOf } from '../core/conversation-fold.js';

// The route alphabet — the directions the relaxation settles over. `research` is a real
// direction (the discourse says the world has to answer), but it maps to the GROUND verdict
// for routeStance: reaching outward is the web proposer's move, not a stance of its own.
export const ROUTE_ALPHABET = ['compose', 'ground', 'research', 'isolate'];

const VERDICT_OF = { compose: 'COMPOSE', ground: 'GROUND', research: 'GROUND', isolate: 'ISOLATE' };

// The direction bases — exemplar phrases in the vocabulary a small model naturally uses when
// it DESCRIBES a discourse (not the user's vocabulary: the metacognition re-speaks the turn).
// `continue` is measured like the others but is not a direction: its current flows to the
// incumbent stance (continuation is "more of the incumbent", not a place of its own).
export const ROUTE_EXEMPLARS = Object.freeze({
  compose: [
    'write a poem for them',
    'compose verse — stanzas, a haiku, a sonnet',
    'make up a story or a tale',
    'draft an original creative piece',
    'author a song, a rhyme, a limerick',
    'they want a piece of writing made, a composition produced',
  ],
  ground: [
    'a question concerning the document',
    'the answer sits in the reading',
    'find the fact in the text we loaded',
    'what does the passage say',
    'quote the source, the page holds it',
    'answer from the loaded reading',
  ],
  research: [
    'unknown — it has to be found out',
    'search the web for it',
    'recent news, current events',
    'look for it on the internet',
    'fetch it from the world outside',
    'nothing here covers it — out in the wider world',
  ],
  isolate: [
    'a fresh question, unrelated to anything prior',
    'a new topic, disconnected from earlier talk',
    'small talk, idle chatter, unconnected',
    'they changed topics entirely',
    'starting over on something new',
    'no relation to the conversation so far',
  ],
  continue: [
    'the same activity as before',
    'keep going, more of the same',
    'a refinement — shorter, longer, another like the last',
    'still the same thread, the same subject',
    'the next iteration of the ongoing work',
    'carry on where we left off',
  ],
});

// The compose-kind bases — measured on the same speech when compose wins, replacing the
// artifactKindOf keyword peel at the route grain. Same mechanics, finer alphabet.
export const FORM_EXEMPLARS = Object.freeze({
  poem: [
    'a poem in verse',
    'stanzas with rhyme and meter',
    'a haiku, a sonnet, a limerick',
    'lines of poetry',
    'a short lyric poem',
    'verses to recite',
  ],
  story: [
    'a story with characters and a plot',
    'narrative fiction, a tale',
    'a short story scene',
    'storytelling, what happens next',
    'a fable or a fairy tale',
    'a narrative with a beginning and an end',
  ],
  essay: [
    'an essay in structured prose',
    'an argumentative piece with a thesis',
    'paragraphs building an argument',
    'a long-form reflective essay',
    'an expository piece of prose',
    'a written argument developed in sections',
  ],
});

// KIND_EXEMPLARS — the ESSAY sub-kinds the composer exposes (organs/out/essay-types.js). A
// SECOND, finer form grain: once compose settles on `essay`, the same paragraph is measured
// against these to steer WHICH essay. Near-degenerate by nature — every one is an essay — so
// the crosstalk null does the real work: a kind acts only when the metacognition names its
// DISTINCTIVE move (argue-and-rebut · explain-plainly · tell-through-scenes · judge-and-verdict
// · reflect-in-first-person) better than the other kinds' speech ever does. Abstains on generic
// essay-talk, and the caller keeps the composer's selected type. Tended like every other basis
// (tests/meta-route.test.js pins self-recovery), not patched per audit failure.
export const KIND_EXEMPLARS = Object.freeze({
  argument: [
    'stake a claim and defend it',
    'make the case for a position',
    'meet the objections and rebut them',
    'persuade with reasons and evidence',
    'prove a thesis against counterarguments',
    'argue one side and press it home',
  ],
  explainer: [
    'explain how it works, plainly',
    'make a hard subject genuinely clear',
    'walk through the concept step by step',
    'clarify what it means for a beginner',
    'unpack the mechanism so anyone follows',
    'teach the idea from the ground up',
  ],
  narrative: [
    'tell it through scenes and people',
    'carry the ideas on a story over time',
    'a narrative with characters and moments',
    'show it happening rather than assert it',
    'trace the events as they unfold',
    'follow a person through what happened',
  ],
  review: [
    'judge it against criteria and land a verdict',
    'weigh its strengths and weaknesses',
    'a critical evaluation with a recommendation',
    'assess and rate how good it is',
    'appraise the work and reach a judgement',
    'recommend it or warn against it',
  ],
  reflection: [
    'think on the page in the first person',
    'a personal meditation on what it means to me',
    'turn it over in my own experience',
    'reflect and wonder aloud about it',
    'a contemplative, introspective piece',
    'muse on it from my own life',
  ],
});

// LENGTH_EXEMPLARS — the DEVELOPMENT demand, measured on the same paragraph, ORTHOGONAL to the
// route (a ground turn and a compose turn both carry a length). It answers the one question the
// keyword gate (_longformIntent) kept guessing at from the user's own adverbs: does the user
// want a LONG, developed, multi-section treatment, or a SHORT, pointed one? "detailed",
// "thorough", "comprehensive" describe ANY answer, so as bare keywords they misfire both ways
// — an "explain this in detail" tripped a whole essay walk, a paraphrased long ask with no
// trigger word rendered flat. Here the metacognition RE-SPEAKS the demand ("the user wants this
// explored at length, in several sections" vs "a quick, direct answer") and the same Born
// overlap, crosstalk-nulled against its contrast, measures it. `developDrive` rides out of
// metaRoute regardless of the winning route, exactly as `researchDrive` does — a graded length
// current the caller thresholds instead of pattern-matching. Two members so the null is finite
// and the pair holds each other apart (develop ⟂ brief); abstains on length-neutral speech.
export const LENGTH_EXEMPLARS = Object.freeze({
  develop: [
    'a long, developed treatment in several sections',
    'they want it explored in depth, at length',
    'a thorough, comprehensive piece across many paragraphs',
    'unpack the whole thing fully, section by section',
    'a detailed, multi-part deep dive into it',
    'develop it at length, not a quick reply',
  ],
  brief: [
    'a short, direct answer — just the fact they asked for',
    'a quick, concise reply in a sentence or two',
    'keep it brief and to the point',
    'a one-line answer, nothing elaborate',
    'sum it up shortly, no long piece',
    'a pointed reply, not a developed essay',
  ],
});

// REGISTER_EXEMPLARS — the last composer setting still decided by a regex (the reader's
// speculative word list in _read): does the discourse want the model WRITING FREELY — an
// invention, a speculation, its own voice — or an answer CHECKED against the reading? As bare
// keywords ("imagine", "what if") this misfires both ways: "imagine my surprise when the
// treaty failed" is a grounded ask, and a paraphrased invitation to speculate carries no
// trigger word at all. Here the metacognition RE-SPEAKS the want ("they want me to make
// something up" vs "they want what the sources actually say") and the same Born overlap,
// crosstalk-nulled against its contrast, measures it. `registerDemand` rides out of metaRoute
// on every route — a compose turn and a ground turn both carry a register — with '' when the
// speech is register-neutral, so the caller's floor rules exactly as the length contract does.
// Two members so the null is finite and the pair holds each other apart (creative ⟂ grounded).
export const REGISTER_EXEMPLARS = Object.freeze({
  creative: [
    'they want me to make something up — invent it freely',
    'a speculation, a what-if, imagined rather than looked up',
    'write from imagination, not from the sources',
    'they are asking for my own invented take, a flight of fancy',
    'a hypothetical scenario to dream up, unmoored from the reading',
    'play it out creatively — no facts required',
  ],
  grounded: [
    'they want what the sources actually say, checked against the reading',
    'an answer grounded in the documents, with citations',
    'stick to the facts that were read, nothing invented',
    'a factual reply anchored to the material at hand',
    'verify it against what has been read before asserting',
    'report the record faithfully, not an invention',
  ],
});

// CLARIFY_EXEMPLARS — the gap the WORLD cannot close because it is the USER's to close. The
// `research` direction already names one kind of "has to be found out": the world has to answer
// (recent news, a live fact). This names the complementary kind the router was blind to — the
// ask itself is UNDERSPECIFIED, and only the user can resolve it (which one they mean, whose,
// what exactly, a preference no reading or web page holds). The metacognition's own prompt asks
// it to say "what would have to be found out that neither the conversation nor the reading holds"
// — and when its honest answer is "I'd have to ask THEM," nothing acted on it: the turn guessed,
// or reached to the web for a fact the web doesn't carry. `clarifyDrive` is that current, the
// USER-side twin of `researchDrive`, exposed regardless of the winning route so a caller can
// turn around and ASK rather than answer past the ambiguity. Two members so the null is finite
// and the pair holds each other apart (clarify ⟂ actionable); abstains on unambiguous speech, so
// a clear ask never gets a needless question back.
export const CLARIFY_EXEMPLARS = Object.freeze({
  clarify: [
    // "the user" stays here on purpose: this exemplar mirrors the metacognition model's own
    // register (it describes the turn in the third person), and its "user" token seeds the
    // bases' scaffold vocabulary so leadsOf scrubs the model's "the user" framing out of the
    // walk's seeds (dolphin-disambiguation.test.js). It is a measurement anchor, never shown.
    'only the user can say which one they mean',
    'the request is ambiguous — I would have to ask them to clarify',
    'underspecified: which one, whose, what precisely — they must tell me',
    'it depends on a choice only they can make, their own preference',
    'I need them to pin down what they intend before I can answer',
    'unclear what they are after — ask them to narrow it down',
  ],
  actionable: [
    'the request is clear and specific — I can act on it as it stands',
    'no ambiguity here; I already know what they want',
    'their intent is plain, nothing needs asking back',
    'I can proceed and answer without checking anything with them',
    'the ask is self-contained and fully determined',
    'it is obvious what they mean, so just go ahead',
  ],
});

// REVISE_EXEMPLARS — the demand the router was blind to: EDIT the piece already written, do
// not compose or research anew. A standing longform answer is on the page, and the turn asks
// to rework THAT text — restructure it, cut a part, tighten it, add a section. This is not
// `continue` (which re-runs the same act — "another like the last" writes MORE) and not
// `compose` (which authors a NEW piece): it changes an existing document in place. Because
// revision presupposes a standing document (a contextual precondition, not a discourse
// direction), it is an ORTHOGONAL DEMAND read on every route — `reviseDrive` rides out of
// metaRoute like `developDrive`/`clarifyDrive`, and the CALLER gates it on a document being
// present. Two members so the crosstalk null is finite and the pair holds each other apart
// (revise ⟂ fresh); abstains on speech that names neither, so a clear new-piece ask is never
// mistaken for an edit. Fixtures are METACOGNITION speech (the model describing the turn),
// like every basis here — not the user's words.
export const REVISE_EXEMPLARS = Object.freeze({
  revise: [
    'they want to revise the piece we already wrote, not start over',
    'edit the existing draft in place — restructure it, cut a part, tighten it',
    'rework the essay already on the page, changing its sections and headings',
    'go back over the last answer and improve it, reorganizing what is there',
    'they are reshaping the standing document — trim it, reorder it, expand one part',
    'amend what was written: reorganize its sections, drop a part, reword a passage',
  ],
  fresh: [
    'they want a brand-new piece written from scratch, unrelated to any prior draft',
    'produce a fresh answer, not an edit of something already written',
    'compose something new; there is no standing draft to revise',
    'generate original prose rather than reworking an existing document',
    'a new composition, starting over rather than touching the old text',
    'write it anew — this is not a change to a prior answer',
  ],
});

// REVISE_OP_EXEMPLARS — once `revise` wins, WHICH edit: the finer grain UNDER revision, the
// same way KIND_EXEMPLARS sits under compose/essay. `structural` regroups and re-sections;
// `cut` removes a part; `add` appends a new part; `tone` rewrites the wording/length. Read off
// the same speech, null-gated argmax, '' when the read names no distinctive edit (the caller
// falls back to a whole-piece tone pass). Near-degenerate by nature — every one is an edit —
// so the crosstalk null does the real work.
export const REVISE_OP_EXEMPLARS = Object.freeze({
  structural: [
    'reorganize it into clearer sections with headings',
    'break the body into titled parts, give it structure',
    'regroup the paragraphs and add section headings',
    'restructure the piece, better sections and body paragraphs',
    'impose an outline — split it into labelled sections',
    'give it proper sections instead of a wall of paragraphs',
  ],
  cut: [
    'remove the part about that topic, drop that section',
    'cut the passage that wandered off subject',
    'delete the irrelevant material, trim what does not belong',
    'take out the section on that, it does not fit',
    'strip the tangent, get rid of that portion',
    'excise the part that strayed from the point',
  ],
  add: [
    'add a conclusion that ties it together',
    'write an introduction to open it',
    'append a closing section, a new part at the end',
    'insert a paragraph covering the missing point',
    'extend it with a section on that aspect',
    'add a new part they asked for',
  ],
  tone: [
    'make it shorter and simpler throughout',
    'tighten the prose, cut the wordiness in every paragraph',
    'rewrite it in a plainer, more formal voice',
    'condense each part, say it more concisely',
    'reword it to read more clearly',
    'trim the length across the whole thing',
  ],
});

// Tuning. The Born weights of a 2–3 sentence paragraph against a ~20-term basis live around
// 0.02–0.15, so GAIN lifts a clear signal to ~1 where it competes with the resting potentials.
// REST is the incumbent's head start (continuation-by-default as physics: a transition current
// must out-compete it through the lateral inhibition). SEED is the regex tiebreaker, folded in
// only when the measurement is alive — the same "informs, does not decide" weight relax.js
// gives p(next).
const GAIN = 10;
const REST = 0.35;
const SEED = 0.25;
const ALPHA = 0.05;

const profileOf = (phrases) => {
  const m = new Map();
  for (const p of phrases) for (const t of tok(p)) m.set(t, (m.get(t) || 0) + 1);
  return m;
};

// The crosstalk null for one basis: the background is every OTHER group's exemplar phrases
// scored against THIS basis — a CONSTRUCTED chance ensemble, samples of the overlap the
// directions' vocabularies share with no signal present. Because the ensemble is the chance
// model itself (not a bulk with real structures mixed in), the line is its CEILING — the
// α→0 extreme-value boundary, "align better than every off-direction phrase does" — floored
// by deriveNull's projection when the background is rich enough to carry one. deriveNull's
// own bulk-cut alone would misread the crosstalk tail as real structure and cut it out,
// setting the line under the very overlaps it exists to null. Infinity (thin background)
// leaves the direction dead — abstain, never guess.
const crosstalkNull = (profiles, dir, exemplars) => {
  const basis = profiles.get(dir);
  const bg = [];
  for (const [other, phrases] of Object.entries(exemplars)) {
    if (other === dir) continue;
    for (const p of phrases) bg.push(bornSalience(basis, new Set(tok(p))));
  }
  if (bg.length === 0) return Infinity;
  const line = deriveNull(bg, { alpha: ALPHA });
  return Math.max(Math.max(...bg), Number.isFinite(line) ? line : 0);
};

// buildBases(routeExemplars?, formExemplars?) → { route, form, vocab } — profiles + nulls,
// computed once. Injectable so a caller can grow a direction's exemplars (the tending surface
// that replaces regex-patching) or swap the space entirely.
export const buildBases = (routeExemplars = ROUTE_EXEMPLARS, formExemplars = FORM_EXEMPLARS, kindExemplars = KIND_EXEMPLARS, lengthExemplars = LENGTH_EXEMPLARS, registerExemplars = REGISTER_EXEMPLARS, clarifyExemplars = CLARIFY_EXEMPLARS, reviseExemplars = REVISE_EXEMPLARS, reviseOpExemplars = REVISE_OP_EXEMPLARS) => {
  const group = (exemplars) => {
    const profiles = new Map();
    for (const [dir, phrases] of Object.entries(exemplars)) profiles.set(dir, profileOf(phrases));
    const out = new Map();
    for (const dir of Object.keys(exemplars)) {
      out.set(dir, { profile: profiles.get(dir), null: crosstalkNull(profiles, dir, exemplars) });
    }
    return out;
  };
  const route = group(routeExemplars);
  const form = group(formExemplars);
  const kind = group(kindExemplars);
  const length = group(lengthExemplars);
  const register = group(registerExemplars);
  const clarify = group(clarifyExemplars);
  const revise = group(reviseExemplars);
  const reviseOp = group(reviseOpExemplars);
  const vocab = new Set();
  for (const g of [route, form, kind, length, register, clarify, revise, reviseOp]) for (const b of g.values()) for (const t of b.profile.keys()) vocab.add(t);
  return { route, form, kind, length, register, clarify, revise, reviseOp, vocab };
};

let _DEFAULT = null;
export const defaultBases = () => (_DEFAULT || (_DEFAULT = buildBases()));

// speechCurrents(speech, bases) → { weights, currents } — the paragraph's Born weight against
// each direction (weights, pre-gate, for the audit) and the null-gated, gained currents the
// relaxation consumes. A weight at or under its crosstalk null contributes NOTHING — the
// metacognition said nothing legible about that direction.
export const speechCurrents = (speech, bases = defaultBases()) => {
  const terms = new Set(tok(String(speech || '')));
  const weights = {};
  const currents = {};
  for (const [dir, b] of bases.route) {
    const w = bornSalience(b.profile, terms);
    weights[dir] = w;
    currents[dir] = w > b.null ? GAIN * w : 0;
  }
  return { weights, currents };
};

// relaxRoute({currents, incumbent, seed}) → the settled route, or abstention.
//
//   currents   the null-gated direction currents (speechCurrents), incl. `continue`.
//   incumbent  the fold's carried stance ('compose'|'ground'|null). The continue current
//              flows to it (continuation is more-of-the-incumbent); with no incumbent that
//              mass has nothing to continue and is dropped. The incumbent also receives the
//              REST potential, so a transition must beat it, not merely tie it.
//   seed       optional regex tiebreakers, {direction: truthy} → +SEED. Folded in only when
//              the measurement is alive — a dead measurement abstains before any seed.
export const relaxRoute = ({ currents = {}, incumbent = null, seed = {} } = {}) => {
  const c = {};
  for (const d of ROUTE_ALPHABET) c[d] = Math.max(0, currents[d] || 0);
  if (incumbent && c[incumbent] != null) c[incumbent] += Math.max(0, currents.continue || 0);

  // Occupancy over the alphabet AFTER the continue flow: a paragraph that coheres toward
  // nothing (or continues a thread that does not exist) drives no attractor → abstain.
  let alive = 0;
  for (const d of ROUTE_ALPHABET) alive += c[d];
  if (alive <= 0) return { route: null, abstained: true, currents: c, activations: null };

  if (incumbent && c[incumbent] != null) c[incumbent] += REST;
  for (const [d, v] of Object.entries(seed)) if (v && c[d] != null) c[d] += SEED;

  const settled = relax(c, { alphabet: ROUTE_ALPHABET });
  return { route: settled.winner, abstained: false, currents: c, activations: settled.activations };
};

// formKindOf(speech, bases) → 'poem' | 'story' | 'essay' | '' — the compose kind read off the
// same paragraph, argmax over the null-gated form weights. '' (nothing clears its null) lets
// the caller fall back to the fold's carried focus.kind, exactly as composeKind('') does.
export const formKindOf = (speech, bases = defaultBases()) => {
  const terms = new Set(tok(String(speech || '')));
  let kind = '', best = 0;
  for (const [k, b] of bases.form) {
    const w = bornSalience(b.profile, terms);
    if (w > b.null && w > best) { best = w; kind = k; }
  }
  return kind;
};

// steerKindOf(speech, bases) → an essay sub-kind id ('argument'|'explainer'|'narrative'|'review'
// |'reflection') | '' — the composer's essay TYPE read off the same paragraph, the finer grain
// UNDER form === 'essay'. Same null-gated argmax as formKindOf; '' when the speech names no
// distinctive move, so the caller keeps the composer's selected type. Robust to bases from an
// older buildBases (no kind group) → ''.
export const steerKindOf = (speech, bases = defaultBases()) => {
  if (!bases || !bases.kind) return '';
  const terms = new Set(tok(String(speech || '')));
  let kind = '', best = 0;
  for (const [k, b] of bases.kind) {
    const w = bornSalience(b.profile, terms);
    if (w > b.null && w > best) { best = w; kind = k; }
  }
  return kind;
};

// lengthDemandOf(speech, bases) → 'develop' | 'brief' | '' — the DEVELOPMENT demand read off the
// same paragraph, argmax over the null-gated length weights, orthogonal to the route. 'develop' =
// the speech asks for a long, multi-section treatment; 'brief' = a short, pointed one; '' when
// neither clears its null (length-neutral speech), so the caller falls back to its own floor.
// Robust to bases from an older buildBases (no length group) → ''.
export const lengthDemandOf = (speech, bases = defaultBases()) => {
  if (!bases || !bases.length) return '';
  const terms = new Set(tok(String(speech || '')));
  let demand = '', best = 0;
  for (const [k, b] of bases.length) {
    const w = bornSalience(b.profile, terms);
    if (w > b.null && w > best) { best = w; demand = k; }
  }
  return demand;
};

// registerDemandOf(speech, bases) → 'creative' | 'grounded' | '' — the REGISTER demand read
// off the same paragraph, argmax over the null-gated register weights, orthogonal to the
// route exactly as the length demand is. 'creative' = the speech asks for invention, the
// model's own voice; 'grounded' = it asks for the reading, checked; '' when neither clears
// its null (register-neutral speech), so the caller's floor rules. Robust to bases from an
// older buildBases (no register group) → ''.
export const registerDemandOf = (speech, bases = defaultBases()) => {
  if (!bases || !bases.register) return '';
  const terms = new Set(tok(String(speech || '')));
  let demand = '', best = 0;
  for (const [k, b] of bases.register) {
    const w = bornSalience(b.profile, terms);
    if (w > b.null && w > best) { best = w; demand = k; }
  }
  return demand;
};

// creativeDrive(speech, bases) → the null-gated `creative` current as a graded scalar,
// exposed regardless of the winner — the register-side twin of developDrive, so a caller can
// threshold a number instead of pattern-matching "imagine"/"what if".
export const creativeDrive = (speech, bases = defaultBases()) => {
  const b = bases && bases.register && bases.register.get('creative');
  if (!b) return 0;
  const w = bornSalience(b.profile, new Set(tok(String(speech || ''))));
  return w > b.null ? w : 0;
};

// clarifyWeightOf(profile, speech) → the clarify basis's Born weight, measured at the grain the
// demand is actually SPOKEN: per sentence, the max — not over the whole read as one bag.
//
// The clarify demand is uniquely LOCALIZED. Where the route, form, length and register are global
// properties of the read (the whole paragraph is "about" composing an essay, at length, in the
// grounded register), the clarify need is a single CAVEAT clause of an otherwise content-full
// read: "…a well-structured essay covering behavior, habitat, conservation — HOWEVER I'd have to
// ask them which aspect they mean." bornSalience normalizes by the span's term count (‖s‖² =
// #terms), so folding that clause into the whole paragraph divides its overlap by every content
// term the read spent describing the subject, and the signal sinks below a crosstalk null that
// was derived from single-clause exemplars — a paragraph is always more diluted than any exemplar
// it is compared against. The read genuinely says "I'd ask them," and the whole-bag measurement
// misses it: the "write me an essay about dolphins" report — the read voiced the clarify need
// ("I would need to clarify what specific aspects… the request is quite broad"), and nothing
// fired. Measured per sentence, that caveat clears on its own clause and the null (single-clause-
// calibrated) meets a single-clause span, not a diluted bag. This is the same per-unit reading
// salienceField runs over a document (surfer/salience.js maps bornSalience per sentence); the
// route measurement collapses to one bag because the route is global, clarify does not because it
// is local. A read that names the gap in ANY one sentence clears; a read that never does still
// abstains (the actionable contrast and its null are untouched), so a clear ask is never
// questioned back. Falls back to the whole text if segmentation yields nothing.
const clarifyWeightOf = (profile, speech) => {
  const text = String(speech || '');
  let sents = null;
  try { sents = segmentSentences(text); } catch (_) { sents = null; }
  const spans = (sents && sents.length) ? sents : [text];
  let best = 0;
  for (const s of spans) { const w = bornSalience(profile, new Set(tok(s))); if (w > best) best = w; }
  return best;
};

// clarifyDemandOf(speech, bases) → 'clarify' | 'actionable' | '' — does the metacognition say the
// gap is the USER's to close (the ask is ambiguous, only they can resolve it) or that the ask is
// clear enough to act on? Argmax over the null-gated clarify weights, ORTHOGONAL to the route
// (a ground turn and a compose turn can each be underspecified). '' when neither clears its null
// (the speech names no ambiguity), so the caller answers as it would today. Robust to bases from
// an older buildBases (no clarify group) → ''. The weight is read per sentence (clarifyWeightOf)
// so a localized caveat is not diluted below its null by a content-full read.
export const clarifyDemandOf = (speech, bases = defaultBases()) => {
  if (!bases || !bases.clarify) return '';
  let demand = '', best = 0;
  for (const [k, b] of bases.clarify) {
    const w = clarifyWeightOf(b.profile, speech);
    if (w > b.null && w > best) { best = w; demand = k; }
  }
  return demand;
};

// clarifyDrive(speech, bases) → the null-gated `clarify` current as a graded scalar, exposed
// REGARDLESS of the winning route — the USER-side twin of `researchDrive`. Where researchDrive
// says "the WORLD has to answer this," clarifyDrive says "the USER has to — I'd have to ask
// them." A caller thresholds it to turn around and pose a clarifying question instead of
// answering past the ambiguity. 0 when the clarify basis is absent or the speech does not clear
// its crosstalk null. Read per sentence (clarifyWeightOf), the same grain as clarifyDemandOf.
export const clarifyDrive = (speech, bases = defaultBases()) => {
  const b = bases && bases.clarify && bases.clarify.get('clarify');
  if (!b) return 0;
  const w = clarifyWeightOf(b.profile, speech);
  return w > b.null ? w : 0;
};

// developDrive(speech, bases) → the null-gated `develop` current, exposed as a graded scalar
// REGARDLESS of the route the paragraph settled on — the length-side twin of `researchDrive`. A
// ground turn and a compose turn both have a length; this is that pull, measured, so the caller
// thresholds a number instead of pattern-matching adverbs. 0 when the develop basis is absent or
// the speech does not clear its crosstalk null.
export const developDrive = (speech, bases = defaultBases()) => {
  const b = bases && bases.length && bases.length.get('develop');
  if (!b) return 0;
  const w = bornSalience(b.profile, new Set(tok(String(speech || ''))));
  return w > b.null ? w : 0;
};

// reviseDemandOf(speech, bases) → 'revise' | 'fresh' | '' — does the read say the turn EDITS
// the standing piece or asks for a NEW one? Argmax over the null-gated revise weights,
// ORTHOGONAL to the route (a ground/continue turn can each be an edit-in-place). '' when the
// speech names neither, so the caller answers as it would today. Robust to legacy bases → ''.
export const reviseDemandOf = (speech, bases = defaultBases()) => {
  if (!bases || !bases.revise) return '';
  const terms = new Set(tok(String(speech || '')));
  let demand = '', best = 0;
  for (const [k, b] of bases.revise) {
    const w = bornSalience(b.profile, terms);
    if (w > b.null && w > best) { best = w; demand = k; }
  }
  return demand;
};

// reviseDrive(speech, bases) → the null-gated `revise` current as a graded scalar, exposed
// REGARDLESS of the route — the edit-in-place twin of `researchDrive`. Where researchDrive says
// "the WORLD has to answer this," reviseDrive says "this changes the piece already on the page."
// The caller thresholds it (against researchDrive, and gated on a standing document existing) to
// edit that document instead of researching afresh. 0 when the basis is absent or the speech does
// not clear its crosstalk null.
export const reviseDrive = (speech, bases = defaultBases()) => {
  const b = bases && bases.revise && bases.revise.get('revise');
  if (!b) return 0;
  const w = bornSalience(b.profile, new Set(tok(String(speech || ''))));
  return w > b.null ? w : 0;
};

// reviseOpOf(speech, bases) → 'structural' | 'cut' | 'add' | 'tone' | '' — the finer edit grain
// UNDER revision, argmax over the null-gated reviseOp weights. '' when the read names no
// distinctive edit, so the caller falls back to a whole-piece tone pass. Robust to legacy → ''.
export const reviseOpOf = (speech, bases = defaultBases()) => {
  if (!bases || !bases.reviseOp) return '';
  const terms = new Set(tok(String(speech || '')));
  let op = '', best = 0;
  for (const [k, b] of bases.reviseOp) {
    const w = bornSalience(b.profile, terms);
    if (w > b.null && w > best) { best = w; op = k; }
  }
  return op;
};

// metaRoute(speech, fold, {bases, seed}) → the full measurement:
//   verdict        the routeStance-compatible word ('COMPOSE'|'GROUND'|'ISOLATE'|'CONTINUE')
//   route          the settled direction ('compose'|'ground'|'research'|'isolate') or null
//   kind           the compose kind ('' when unmeasured) — only read when compose settles
//   researchDrive  the null-gated research current, EXPOSED REGARDLESS of the winner — the
//                  discourse-level gap trigger the web proposer folds in (propose.js). A
//                  paragraph can settle on ground AND say "the document can't answer this."
//   lengthDemand   'develop' | 'brief' | '' — the development demand, ORTHOGONAL to the route:
//                  does the discourse want a long, multi-section piece or a short answer? Read
//                  on EVERY route (a ground turn has a length too), so the longform gate can
//                  flow from the measurement instead of matching the user's own adverbs.
//   developDrive   the graded `develop` current behind that label — the length-side twin of
//                  researchDrive, exposed regardless of the winner.
//   registerDemand 'creative' | 'grounded' | '' — the register demand, orthogonal to the
//                  route like the length demand: does the discourse want invention or the
//                  checked reading? Read on every route, so the composer's register flows
//                  from the measurement instead of a speculative word list.
//   creativeDrive  the graded `creative` current behind that label.
//   clarifyDemand  'clarify' | 'actionable' | '' — the USER-gap demand, orthogonal to the route:
//                  is the ask underspecified in a way only the user can resolve, or clear enough
//                  to act on? When it reads 'clarify', the caller can ASK a question back instead
//                  of answering past the ambiguity — closing the loop the metacognition opens when
//                  it says it would need to learn something only the user holds.
//   clarifyDrive   the graded `clarify` current behind that label — the USER-side twin of
//                  researchDrive, exposed regardless of the winner.
//   reviseDemand   'revise' | 'fresh' | '' — the edit-in-place demand, orthogonal to the route:
//                  does the turn EDIT the standing piece or ask for a new one? The caller gates it
//                  on a standing document being present before acting.
//   reviseDrive    the graded `revise` current behind that label — the edit-in-place twin of
//                  researchDrive, exposed regardless of the winner.
//   reviseOp       'structural' | 'cut' | 'add' | 'tone' | '' — which edit, when revise wins.
//   weights/currents/activations  the audit — which current won and by how much.
export const metaRoute = (speech, fold = null, { bases = defaultBases(), seed = {} } = {}) => {
  const { weights, currents } = speechCurrents(speech, bases);
  const settled = relaxRoute({ currents, incumbent: (fold && fold.stance) || null, seed });
  const verdict = settled.abstained ? 'CONTINUE' : VERDICT_OF[settled.route];
  const kind = settled.route === 'compose' ? formKindOf(speech, bases) : '';
  // The finer essay grain — only meaningful when the form settled on `essay`. '' otherwise,
  // and the caller keeps the composer's selected type.
  const steerKind = kind === 'essay' ? steerKindOf(speech, bases) : '';
  return {
    verdict,
    route: settled.route,
    kind,
    steerKind,
    researchDrive: currents.research || 0,
    lengthDemand: lengthDemandOf(speech, bases),
    developDrive: developDrive(speech, bases),
    registerDemand: registerDemandOf(speech, bases),
    creativeDrive: creativeDrive(speech, bases),
    clarifyDemand: clarifyDemandOf(speech, bases),
    clarifyDrive: clarifyDrive(speech, bases),
    reviseDemand: reviseDemandOf(speech, bases),
    reviseDrive: reviseDrive(speech, bases),
    reviseOp: reviseOpOf(speech, bases),
    abstained: settled.abstained,
    weights,
    currents: settled.currents,
    activations: settled.activations,
  };
};

// createMetaRouter({speech, fold, bases, seed}) → { warm, transitionVerdict } — an adapter
// that plugs into routeStance's EXISTING opts.model seam unchanged. The caller obtains the
// paragraph (one small model call on discoursePrompt) and hands it here; the verdict word is
// then DERIVED mechanically from the speech instead of demanded from the model. Cold (no
// speech) → warm:false → routeStance never consults it: the fallback contract holds.
export const createMetaRouter = ({ speech, fold = null, bases, seed } = {}) => {
  const text = String(speech || '').trim();
  const measured = text ? metaRoute(text, fold, { bases, seed }) : null;
  return {
    warm: !!text,
    measure: measured,
    transitionVerdict: () => (measured ? measured.verdict : 'CONTINUE'),
  };
};

// The metacognition's prompt — free speech, deliberately WITHOUT a format contract. It sees the
// discourse (the carried stance, the last exchange, the new message) AND what reading is loaded
// into the chat (`scope`) — but never the document's CONTENT: a metacognition about what is going
// on, not a planner. Knowing a document is IN SCOPE is a discourse fact (the user attached it),
// distinct from reading its text. Without it, the fold's `warm` is empty on the first turn of a
// fresh chat, so the read calls a book-scoped chat "an isolated assistant chat" and reports the
// loaded book as unspecified ("they haven't said which book") — which then steers the answer into
// a needless clarify or an ungrounded guess. `now` (a Date, or a preformatted string) anchors the
// read in time: without it the model cannot tell that "the weather", "the score", "the latest" are
// asks about a NOW it does not contain — the discourse fact that makes them world-questions.
export const discoursePrompt = (message, fold = null, { exchange = '', now = null, scope = '', standing = '' } = {}) => {
  const when = now instanceof Date
    ? now.toLocaleString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : (now ? String(now) : '');
  const reading = String(scope || '').trim();
  const standingDoc = String(standing || '').trim();
  return (
    'You are watching one conversation. Right now: ' + (reading ? 'reading ' + reading : stanceDescOf(fold)) + '.\n' +
    (reading ? 'That reading is already loaded into this chat and in scope — so when they say "this", "it", "the book", or "the document" they mean it; it is not unspecified, and you need not ask which book or document they mean.\n' : '') +
    // The discourse FACT that a piece we wrote is on the page — the referent-grounding twin of the
    // reading scope. It tells the read the standing document exists so the read's own words can say
    // "they want to edit the essay"; the ROUTE is still the Born measurement of that read, not this
    // text. It states the fact and names the referents; it does not enumerate trigger phrases.
    (standingDoc ? 'A long answer you wrote earlier — "' + standingDoc + '" — is on the page and in scope as a standing document. When they say "the essay", "it", "that part", or "the piece", they mean THAT document, and an ask to change it (reword, restructure, cut, expand, shorten) is an edit to what is already written, not a request for new research.\n' : '') +
    (when ? 'It is now ' + when + '.\n' : '') +
    (exchange ? 'The last exchange:\n' + exchange + '\n' : '') +
    'They just said: "' + String(message || '') + '"\n' +
    'In two or three plain sentences, say what they are doing, what would satisfy them, ' +
    'and what — if anything — would have to be found out that neither the conversation nor ' +
    'the loaded reading already holds. A broad, open request — "research X", "tell me about X" — ' +
    'is satisfied by a general overview of what the reading holds; that is not a gap, and their ' +
    'possibly wanting some specific aspect they never named is not something that has to be found ' +
    'out or clarified. Name a gap only when the ask genuinely turns on a choice the reading cannot ' +
    'settle. If that gap is something only they can settle — their request is ambiguous or ' +
    'underspecified and you would have to ask them to clarify which one, whose, or what exactly ' +
    'they mean — say so. Speak naturally.'
  );
};

// leadsOf(speech, {known}) → the novel content terms the metacognition introduced — the words
// of its paragraph that are neither in the conversation it was shown (`known`) nor part of the
// direction bases' own scaffold vocabulary. When the paragraph names what must be found out
// ("the recent election results"), those terms are exactly the leads: they seed the curiosity
// walk's frontier (turn/research.js) the same way a fetched page's surprising terms do. The
// metacognition never formulates a query; it deposits mass where the walk should look first.
export const leadsOf = (speech, { known = '', bases = defaultBases() } = {}) => {
  const knownSet = new Set(tok(String(known || '')));
  const seen = new Set();
  const out = [];
  for (const t of tok(String(speech || ''))) {
    if (knownSet.has(t) || bases.vocab.has(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
};
