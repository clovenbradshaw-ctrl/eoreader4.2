// EO: SEG·SIG(Field → Field,Kind, Dissecting,Binding) — the prompt's band catalog, indexed by Site terrain
// THE PROMPT AS A SITE (docs/prompt-as-site.md). Everything the engine may hand the
// talker is a BAND, and every band declares the Site terrain its content rides on —
// the same nine-terrain catalog every other part of the tree declares (core/cube.js
// TERRAINS, docs/eo-for-coders.md). Before this file the prompt was the one part of
// the engine with no Site: eleven ad-hoc block names, each patched into place. Nine
// terrains close by derivation, so completeness is checkable — a band that fits no
// terrain is a category error, surfaced, never invented inline.
//
// | terrain    | grain   | what rides there                                        |
// |------------|---------|---------------------------------------------------------|
// | Void       | Ground  | what the reading did NOT find (the absence clause)      |
// | Entity     | Figure  | the verbatim spans, the orientation                     |
// | Kind       | Pattern | the shape exemplar, the reply's form (budget)           |
// | Field      | Ground  | the settled common ground, the conversation's state     |
// | Link       | Figure  | one named bond (the cursor's typed edge)                |
// | Network    | Pattern | the fold's graph, the arc                               |
// | Atmosphere | Ground  | the register, the voice, the steer                      |
// | Lens       | Figure  | the live question as framed, the walk's inferences      |
// | Paradigm   | Pattern | what counts as an answer in this turn                   |
//
// A band is { key, terrain, role, when(view), render(view), prose, cell? } — `prose`
// lists the band's FIXED instructional literals (headers, asides, whole static
// bands), the mass tools/prompt-census measures against the corpus population
// gradient (Figure > Pattern > Ground; docs/eo-wiki.md "Lexical Analysis v2").
// Payload text (spans, graph, a caller's steer brief) is the caller's, not counted
// here. `cell` is the band's own Act/Stance reading — { op, stance } — declared ONLY
// on bands that INSTRUCT (a stance asked of the talker); material bands carry none.
// The prompt checkpoint (model/prompt-checkpoint.js) judges declared cells; it never
// guesses one, so an undeclared instruction is a catalog gap, not a silent pass.
//
// The catalog is DATA and the builders in prompt.js are PROJECTIONS over it
// (projectBands): read-time, pure, byte-identical to the hand-rolled assembly they
// replaced (tests/prompt-golden.test.js pins all three builders fixture-by-fixture).
// A projection cannot fire an act, so assembling a prompt twice is NUL, never a
// second INS. The optional `probe` argument is a READ-ONLY research instrument
// (docs/prompt-as-site.md, Tier 2): default null → byte-identical output; the three
// probes reorder or ablate bands so the audit battery can falsify the Site framing
// itself. No production caller passes a probe.

// ── The Site face, as the prompt sees it ─────────────────────────────────────
// Hardcoded mirror of core/cube.js TERRAINS (Domain × Object grain), kept import-free
// so the model holon stays standalone; tests/prompt-golden.test.js cross-checks this
// table against the kernel's, so the two cannot drift.
export const TERRAIN_GRAIN = Object.freeze({
  Void: 'Ground', Entity: 'Figure', Kind: 'Pattern',
  Field: 'Ground', Link: 'Figure', Network: 'Pattern',
  Atmosphere: 'Ground', Lens: 'Figure', Paradigm: 'Pattern',
});

// The verbatim lines the reading turned up sit under this header — what the engine found
// on this question when it read the source. Named as a reading RESULT, not a vague "what
// comes to mind": the epistemics are plain about what the data is (lines that were read),
// which is what lets the talker answer like itself instead of narrating a memory. Exported
// so the echo backend (and pleias's RAG re-extraction) can find them. Recognition-free, and
// in the reader's register — never "excerpts from the document."
export const EXCERPTS_HEADER = 'What I found reading it:';

// NO default length prescription. The earlier contract carried a sentence cap, which
// a small model read as the TASK, not a ceiling — "summarize" came back as a literal
// three-sentence stub. The real bound is max_tokens, set per task by the intent pass
// (turn/intent.js). The empty budget means "say nothing about length"; a caller may
// still pass an explicit { sentences } / { chars } budget to re-impose a cap for one
// turn. See docs/prompt-assembly.md.
export const DEFAULT_BUDGET = Object.freeze({});

// The summary degeneracy guard — FAITHFULNESS, not length. Rides only on a summary
// task (turn/intent.js). A small model handed a "summarize" turn tends to reword a
// single excerpt as the whole answer; this asks it to draw the excerpts together.
// KNOWN GRAIN-MIX (docs/prompt-as-site.md §4): this is a Paradigm-band instruction
// toward a Pattern-grain stance (Composing) issued over Entity-grain material — the
// mix the prompt checkpoint flags and probe P3 tests. It stays until P3 rules.
export const SUMMARY_GUARD =
  'They want a summary: say what it is about in your own words, drawing the lines ' +
  'together — never reword a single line as the whole answer.';

// THE HONEST FRAME (§1, see prompt.js header). The talker is told plainly WHAT it is and
// WHERE its knowledge comes from, rather than being made to pretend it read a whole
// document. The voice is stable across turns so the prefix cache holds; the per-turn
// absence clause rides last in the user block, where a small model attends hardest.
//
// LEAD WITH THE ANSWER, don't narrate the reading. Left to the bare honest frame, a small
// talker opens every reply by narrating its own reading — "Based on what I read…" — and
// the substance is buried under a paragraph of meta. So the frame asks for the answer
// HEAD-ON, and to say each point once rather than circle back and reword it.
export const SYSTEM_GROUND = `You are the voice of a reader. When you're asked something, the lines below are what your reading turned up on it — the part of what you read that bears on this question, not the whole of it.

Answer the way you naturally would: answer the question head-on, in your own words. Don't quote the lines back, don't tell whoever asked to go look, and don't open by narrating your own reading ("based on what I read…", "the text mentions…") — lead with the answer itself, and say each thing once rather than circling back to restate it. If the lines don't cover the question, say so plainly (something like "I didn't find that in what I read") and then still help however you can. Don't state a fact and then deny finding it: when the lines let you answer a part, just answer it — save "I didn't find that" for what they genuinely don't cover. Write natural prose; don't write citations or tags, those are added for you.`;

export const SYSTEM_CHAT = `You are a helpful, knowledgeable assistant. Answer their question directly and accurately, drawing on the conversation and your general knowledge. Be clear and concise.`;

// The LONG-FORM directive — appended (only) when the ask is for a developed piece (an essay,
// a detailed report). It overrides the default "be clear and concise" register: 4.2 answered
// even "write me an essay" in two sentences because every register told the model to be brief.
export const LONGFORM_DIRECTIVE = `This is a request for a DEVELOPED, long-form piece — an essay or detailed write-up, not a quick answer. Write it out in FULL: several substantial paragraphs that build on each other — an opening that frames the subject, body paragraphs that each develop a distinct point with specifics, and a closing. Aim for depth and length; do not stop after a sentence or two.`;

// The STRICT grounded register — answer from the reading first (the Grounded chip). The same
// honest frame, said plainly: the lines below are what the reading found, and that is the
// window onto the source. A faithful "I didn't find that" is the right answer here, never a
// failure.
export const SYSTEM_GROUND_STRICT = `You are the voice of a reader. When you're asked something, the lines below are what your reading turned up on it — the part of what you read that bears on this question, and your only window onto the source.

Answer from those lines when they cover the question. When they don't, say so plainly — that you didn't find it in what you read — and then, if you can, you may answer from your general knowledge, making clear that part isn't from what you read. Never claim the lines said something they didn't. Speak of "what I read", never of "the reading". Write natural prose; don't write citations or tags, those are added for you.`;

// The FREE register — general-knowledge chat that ignores the document (the Free form
// chip). Distinct from SYSTEM_CHAT, which is the conversation-only fallback: this one
// explicitly invites outside knowledge and labels itself ungrounded.
export const SYSTEM_FREE = `You are a helpful, knowledgeable assistant. Answer their question directly and accurately, drawing on your general knowledge. Be clear and concise.

(This reply is free-form — it is not grounded in any document they may have loaded.)`;

// The cursor's voice (SPEC §5, §11 — see prompt.js buildCursorMessages). One beat of a
// longer piece; same relaxed renderer posture as SYSTEM_GROUND.
export const SYSTEM_CURSOR = `You are a sharp reading companion writing one beat of a longer piece. You've read this document. Write in your OWN WORDS — synthesize, don't quote the passage back. Use what you've established so far; you don't need to reintroduce people already named. Refer to people naturally once they're established (he, she, by name) — don't repeat their full description.

Write natural prose. Don't write citations, tags, or codes; those are added for you.`;

// The current-moment line — AMBIENT CONTEXT, not an instruction. A small talker, asked "what
// is today's date?", confabulates the "I have no real-time clock" boilerplate; handed the moment
// as a plain known fact (the way it knows anything in its context), it just answers. The browser
// is the ground truth; off by default (`now` null → '' → byte-identical prompts and golden
// tests); the live turn passes `new Date()`. Formatted from LOCAL components with named
// day/month arrays so the wording is locale-independent and deterministic to test.
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];
const pad2 = (n) => String(n).padStart(2, '0');
export const currentMomentLine = (now = null) => {
  if (now == null) return '';
  let d;
  try { d = now instanceof Date ? now : new Date(now); } catch { return ''; }
  if (!d || Number.isNaN(d.getTime())) return '';
  const date = `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return `Current date and time, for context: ${date}, ${time} (local time).`;
};

const budgetLine = (b) => {
  if (!b) return '';
  if (typeof b === 'string') return b;
  const parts = [];
  if (b.sentences) parts.push(`at most ${b.sentences} sentence${b.sentences > 1 ? 's' : ''}`);
  if (b.chars)     parts.push(`under ${b.chars} characters`);
  return parts.length ? `Reply in ${parts.join(', ')}.` : '';
};

// Order the lines for the frame (position bias — Lost in the Middle / Context Rot):
// strongest first (the cursor's argmax takes primacy), second-strongest last (the span
// that most needs retaining takes recency), the weakest buried in the middle. Four to
// eight lines. A read-only permutation over a fixed span set — the verbatim text is
// untouched, only its order. Surfed spans (score 0) sort to the middle, as they should.
export const orderSpansForFrame = (spans = [], { max = 8 } = {}) => {
  const ranked = [...spans].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, max);
  if (ranked.length <= 2) return ranked;
  const first = ranked[0];                 // primacy — the argmax
  const last  = ranked[1];                 // recency — the second-strongest
  const middle = ranked.slice(2);          // the rest, weakest at the tail of this desc list
  // Bury the weakest in the CENTRE: deal the middle outside-in, so the smallest lands
  // in the middle of the middle and the stronger of the rest sit at the edges.
  const left = [], right = [];
  middle.forEach((s, i) => (i % 2 === 0 ? left : right).push(s));
  return [first, ...left, ...right.reverse(), last];
};

// ── The fixed instructional literals (the asides the census weighs) ──────────
// Each is declared once and used by the band's render, so the census and the render
// can never drift. The Site accounting of an aside follows the INSTRUCTION, not the
// material it rides on: "(Let this shape the telling…)" steers the register even
// though it rides the arc's Network band.

const ARC_ASIDE = '(Let this shape the telling — at first…, then… — with the heaviest ' +
  'emphasis at the strongest turn; the arc shows order and turns, never causes, so don\'t ' +
  'add a "therefore" it doesn\'t contain.)';

const TAIL_FRAME = 'The answer so far (continue from it; do not repeat it, and add no new fact):';

const REACHES_ASIDE = '(Those are your own inferences, not lines you read — if one helps the answer, offer it hedged, as a reading of the pattern (“this suggests…”, “it may be that…”), never as something the text states.)';

const META_THREAD_FRAME = 'The conversation so far — what you two have already talked about ' +
  '(their question below is ABOUT this conversation, so treat these prior topics as its ' +
  'subject, not as background to skip):';

const NOTES_HEADER = 'Earlier in this conversation:';
const THREAD_FIREWALL = '(Those came before — for context only; answer just their latest question below.)';
const PAST_TURNS_HEADER = 'The conversation so far:';
const SETTLED_FRAME = "Already settled with them — they know these; build on them, don't restate them:";

const EXEMPLAR_FRAME = 'For the SHAPE only — here is the kind of answer this question wants (it is ' +
  'about a different text; copy its register and length, NOT its facts):';

const STRICT_ABSENCE = 'Your reading turned up nothing bearing on their question — it is not covered by what you read. Say that plainly, the way a person would (for example: "I didn\'t find anything about that in what I read" — first person, never "the reading doesn\'t mention…"), then, if you can, answer from general knowledge, making clear that part is not from what you read.';

// The MEASURED-DECLINE hints (turn/stages.js answerable/gate). The answerability floor
// measured that the reading DIFFUSED (no figure leads — the lines hold the subject's words
// but not a settled answer to what was asked) or that the corpus does not NAME the subject.
// This once rode as a mechanical raw-span refusal that terminated the turn before the model;
// now it rides here so the talker writes the honest decline itself, in the first person,
// rather than picking a figure the reading didn't land on or confabulating an absent one.
const DECLINE_DIFFUSE = 'Your reading did not settle on which figure this question is about — the lines hold the subject\'s words but not a settled answer to exactly what was asked. Say that plainly, in the first person (for example: "I didn\'t find a settled answer to that in what I read"), then say what the lines DO hold that bears on it. Do not pick a figure your reading did not land on, and do not fill the gap from elsewhere without saying that part isn\'t from what you read.';
const DECLINE_ABSENT = 'Your reading does not appear to cover what this question names. Say that plainly, in the first person ("I didn\'t find that in what I read"); then, if you can, add what you know from general knowledge, making clear that part is not from what you read. Never present it as something the lines said.';

const STEER_AIM = ' Keep the whole reply aimed at what they’re actually after (the brief just above) — lead with what your reading speaks to it, not with whatever else happened to surface.';

const ANSWER_META = 'about the conversation above. Draw on those ' +
  'prior topics as its subject, grounded in what your reading turned up where it bears ' +
  'on the answer; say which part is from what you read and which from general knowledge.';
const ANSWER_THREADED = 'in your own words. If what you read ' +
  'doesn\'t cover it, answer from general knowledge and say that part isn\'t from what you read.';
const ANSWER_PLAIN = 'Answer them now, in your own words. If what you read doesn\'t cover it, answer from ' +
  'general knowledge and say that part isn\'t from what you read.';

// ── The grounded frame's view ────────────────────────────────────────────────
// One derivation pass over the caller's args: every gate the bands share (the
// meta-conversational read, the rendered budget line) is computed once, here, so no
// band re-derives it. The view is the whole state a band may read.
export const groundedView = ({
  question,
  spans = [],
  orientation = '',
  task = 'answer',
  budget = DEFAULT_BUDGET,
  conversation = {},
  meta = false,
  corrective = '',
  exemplar = '',
  strict = false,
  now = null,
  graph = '',
  arc = '',
  reasoning = '',
  shape = '',
  steer = '',
  tail = '',
  declineHint = '',
} = {}) => {
  // A META-CONVERSATIONAL turn (the question is ABOUT the conversation) carries the full
  // both-role thread as its SUBJECT, framed to be drawn on, not skipped. Every other
  // grounded turn keeps the prior turns as context-to-skip (the firewall band).
  const metaConv = meta && !!(conversation.notes || conversation.pastTurns?.length);
  const budgetStr = budgetLine(budget);
  return {
    question, spans, orientation, task, budget, conversation, meta, corrective,
    exemplar, strict, now, graph, arc, reasoning, shape, steer, tail, declineHint,
    metaConv, budgetStr,
  };
};

// ── The grounded band catalog (docs/prompt-as-site.md §1) ────────────────────
// Emission order is catalog order. Each band's original rationale lives with its
// literal above or inline here; the terrain names where the content LANDS.
export const GROUNDED_BANDS = Object.freeze([
  // The stable boundary + voice (prefix cache holds). Atmosphere: the register the
  // whole turn breathes — the honest frame is the interpretive weather, not a fact.
  {
    key: 'voice', terrain: 'Atmosphere', role: 'system',
    cell: { op: 'EVA', stance: 'Tending' },
    when: () => true,
    render: (v) => (v.strict ? SYSTEM_GROUND_STRICT : SYSTEM_GROUND),
    prose: [SYSTEM_GROUND, SYSTEM_GROUND_STRICT],
  },
  // The current moment — ambient state of the world, stated as plain known context.
  {
    key: 'moment', terrain: 'Field', role: 'system',
    when: (v) => !!currentMomentLine(v.now),
    render: (v) => currentMomentLine(v.now),
    prose: ['Current date and time, for context:'],
  },
  // What it was — filename · type · length, no recognition (prompt.js §3). Entity:
  // a specific existent, named without being identified.
  {
    key: 'orientation', terrain: 'Entity', role: 'user',
    when: (v) => !!v.orientation,
    render: (v) => `What it was: ${v.orientation}.`,
    prose: ['What it was:'],
  },
  // THE FOLD — the reader's own SENSE of what it read, already folded into near-prose
  // (the central figures and what the reading joined them to). Network: the fold's
  // graph, handed as language. The folding did the thinking, not this prompt.
  {
    key: 'fold', terrain: 'Network', role: 'user',
    when: (v) => !!v.graph,
    render: (v) => `Here's the sense of it, from your reading:\n${v.graph}`,
    prose: ["Here's the sense of it, from your reading:"],
  },
  // THE ARC — how the reading itself MOVED (write/gravity.js): order and turns, never
  // causes. Network material; the aside that rides it is register steering and is
  // weighed as such by the census (the aside's own grain is Atmosphere).
  {
    key: 'arc', terrain: 'Network', role: 'user',
    when: (v) => !!v.arc,
    render: (v) => `${v.arc}\n${ARC_ASIDE}`,
    prose: [ARC_ASIDE],
  },
  // The planner's READ-WINDOW (spec-planner.md §5/§6): the prose written so far this
  // turn, fed back so the next sentence opens with a real transition instead of cold.
  // Field: the turn's own settled state — already witnessed, context for the seam only.
  {
    key: 'tail', terrain: 'Field', role: 'user',
    when: (v) => !!v.tail,
    render: (v) => `${TAIL_FRAME}\n${v.tail}`,
    prose: [TAIL_FRAME],
  },
  // What the reading found — the verbatim lines it turned up, ordered for the frame.
  // THE ONE CHANNEL. Entity: the most concrete terrain in the prompt.
  {
    key: 'excerpts', terrain: 'Entity', role: 'user',
    when: (v) => v.spans.length > 0,
    render: (v) => `${EXCERPTS_HEADER}\n${orderSpansForFrame(v.spans).map(s => s.text).join('\n')}`,
    prose: [EXCERPTS_HEADER],
  },
  // THE MARKED REACHES — the reasoning walk's own inferences (src/reason/walk.js), each
  // line already carrying its grade mark. Lens: a specific reading brought to bear.
  // The grade survives the membrane here: the lines above are asserted, these are hedged.
  {
    key: 'reaches', terrain: 'Lens', role: 'user',
    when: (v) => !!v.reasoning,
    render: (v) => `${v.reasoning}\n${REACHES_ASIDE}`,
    prose: [REACHES_ASIDE],
  },
  // META-CONVERSATIONAL thread: the question is ABOUT this conversation, so the prior
  // turns are the SUBJECT, framed to be reasoned over. Field: the conversation's own
  // ground, foregrounded for one turn.
  {
    key: 'thread-meta', terrain: 'Field', role: 'user',
    when: (v) => v.metaConv,
    render: (v) => {
      const thread = [v.conversation.notes, ...(v.conversation.pastTurns || [])].filter(Boolean).join('\n');
      return `${META_THREAD_FRAME}\n${thread}`;
    },
    prose: [META_THREAD_FRAME],
  },
  // The older conversation as a SURFED recap — the movers of turns past the verbatim
  // window (#i You: / #i Me:, converse/history.js), both sides. Rides ABOVE the recent
  // verbatim window so the transcript reads oldest → newest. The firewall is deferred to
  // the recent-window band below when it follows, so the "answer just the latest" close
  // lands once, after the whole transcript. Field: the conversation's settled ground.
  {
    key: 'thread-notes', terrain: 'Field', role: 'user',
    when: (v) => !v.metaConv && !!v.conversation.notes,
    render: (v) => `${NOTES_HEADER}\n${v.conversation.notes}` +
      (v.conversation.pastTurns?.length ? '' : `\n${THREAD_FIREWALL}`),
    prose: [NOTES_HEADER, THREAD_FIREWALL],
  },
  // The recent turns VERBATIM, both sides (You: / Me:) — the actual back-and-forth up to
  // the session fold's token budget. Named as context and closed with the firewall so the
  // talker reasons over the dialogue but still answers the single live question below,
  // rather than re-answering every prior turn. Field: settled ground.
  {
    key: 'thread-past', terrain: 'Field', role: 'user',
    when: (v) => !v.metaConv && !!v.conversation.pastTurns?.length,
    render: (v) => `${PAST_TURNS_HEADER}\n${v.conversation.pastTurns.join('\n')}\n${THREAD_FIREWALL}`,
    prose: [PAST_TURNS_HEADER, THREAD_FIREWALL],
  },
  // The COMMON-GROUND cue (converse/dialogue-state.js): the facts already settled
  // between you and the user, named as already-held so the talker builds on them
  // instead of restating them. Only the settled QUESTION rides — never the prior
  // answer (the firewall holds). Field, canonically: the settled common ground.
  {
    key: 'settled', terrain: 'Field', role: 'user',
    when: (v) => !v.metaConv && !!v.conversation.settled?.length,
    render: (v) => `${SETTLED_FRAME}\n${v.conversation.settled.map(s => `- ${s}`).join('\n')}`,
    prose: [SETTLED_FRAME],
  },
  // A SHAPE exemplar — the nearest sample answer the form library matched
  // (turn/shape.js), a FORM model only. Kind: the type of answer, not its facts.
  {
    key: 'exemplar', terrain: 'Kind', role: 'user',
    when: (v) => !!v.exemplar,
    render: (v) => `${EXEMPLAR_FRAME}\n“${v.exemplar}”`,
    prose: [EXEMPLAR_FRAME],
  },
  // The live question — last of the material, just before the closing clauses.
  // Lens: the one frame this turn is asked through.
  {
    key: 'question', terrain: 'Lens', role: 'user',
    when: () => true,
    render: (v) => `They asked you: ${v.question}`,
    prose: ['They asked you:'],
  },
  // A confabulation-rewrite corrective, when the talker is re-prompted after the
  // diagonal guard caught a figure-at-a-void (turn/stages.js `revise`). Paradigm:
  // it re-rules what counts as an answer for the retry.
  {
    key: 'corrective', terrain: 'Paradigm', role: 'user',
    cell: { op: 'DEF', stance: 'Dissecting' },
    when: (v) => !!v.corrective,
    render: (v) => v.corrective,
    prose: [],
  },
  // The summary guard rides on a summary task only — faithfulness, not length.
  // Paradigm: what counts as a summary. (The known grain-mix; see SUMMARY_GUARD.)
  {
    key: 'summary-guard', terrain: 'Paradigm', role: 'user',
    cell: { op: 'SYN', stance: 'Composing' },
    when: (v) => v.task === 'summary',
    render: () => SUMMARY_GUARD,
    prose: [SUMMARY_GUARD],
  },
  // No length line by default (budget empty); a caller may re-impose a cap for a
  // turn. Kind: the reply's form.
  {
    key: 'budget', terrain: 'Kind', role: 'user',
    cell: { op: 'SEG', stance: 'Dissecting' },
    when: (v) => !!v.budgetStr,
    render: (v) => v.budgetStr,
    prose: [],
  },
  // The register bundle (LIBRARIAN, + CAPABILITY on a longform ask), just before the
  // answer clause. Never on a budgeted (capped) reply. Atmosphere: the voice.
  {
    key: 'register', terrain: 'Atmosphere', role: 'user',
    cell: { op: 'EVA', stance: 'Tending' },
    when: (v) => !!v.shape && !v.budgetStr,
    render: (v) => v.shape,
    prose: [],
  },
  // Strict mode with nothing to read: the reader had no lines on this at all. Name
  // that absence so the talker says it plainly rather than reaching past the frame.
  // Void: the one band that carries what the reading did NOT find.
  {
    key: 'absence', terrain: 'Void', role: 'user',
    cell: { op: 'DEF', stance: 'Clearing' },
    when: (v) => v.strict && !v.spans.length,
    render: () => STRICT_ABSENCE,
    prose: [STRICT_ABSENCE],
  },
  // The MEASURED-DECLINE hint (turn/stages.js answerable/gate). The floor measured that the
  // reading diffused (`declineHint: 'diffuse'`) or the corpus does not name the subject
  // (`'absent'`), so the talker is told to decline honestly rather than pick/confabulate.
  // Empty by default → the band never fires on an ordinary turn → byte-identical prompt
  // (pinned by tests/prompt-golden.test.js). Void: what the reading did NOT settle or find.
  {
    key: 'decline', terrain: 'Void', role: 'user',
    cell: { op: 'DEF', stance: 'Clearing' },
    when: (v) => !!v.declineHint,
    render: (v) => (v.declineHint === 'absent' ? DECLINE_ABSENT : DECLINE_DIFFUSE),
    prose: [DECLINE_DIFFUSE, DECLINE_ABSENT],
  },
  // THE DISCOURSE STEER — the metacognition's BRIEF on what THIS user is actually
  // after (app.dc.js _steerLine), folded in as the last instruction before the answer
  // clause. Atmosphere: ambient aim, not content. DESERT-CELL OCCUPANT
  // (docs/prompt-as-site.md §3): a generate-mode instruction at Ground grain —
  // SYN(Field, Cultivating), the cell empty across every language measured. EO's
  // remedy is the one §2 already found once: structure belongs in span selection and
  // order (the grounder), not in ambient prose. The prompt checkpoint flags this band
  // (advisory) until the re-rank lands; the flag is the worklist, not a veto.
  {
    key: 'steer', terrain: 'Atmosphere', role: 'user',
    cell: { op: 'SYN', stance: 'Cultivating' },
    when: (v) => !!v.steer,
    render: (v) => v.steer,
    prose: [],
  },
  // The ANSWER CLAUSE, last — where a small model attends hardest. The restriction is
  // lifted: the talker answers, from the lines when they cover it and from general
  // knowledge when they don't (saying which). Paradigm: what counts as an answer in
  // this turn. When a steer rode above, the clause closes on it too — the last words
  // the model reads are "aim it at what they want", not a generic "answer them now".
  {
    key: 'answer', terrain: 'Paradigm', role: 'user',
    cell: { op: 'DEF', stance: 'Dissecting' },
    when: () => true,
    render: (v) => {
      const aim = v.steer ? STEER_AIM : '';
      return (v.metaConv
        ? `Answer their question now — “${v.question}” — ${ANSWER_META}`
        : (v.conversation.notes || v.conversation.pastTurns?.length)
        ? `Answer their latest question now — “${v.question}” — ${ANSWER_THREADED}`
        : ANSWER_PLAIN) + aim;
    },
    prose: [ANSWER_META, ANSWER_THREADED, ANSWER_PLAIN, STEER_AIM,
      'Answer their question now —', 'Answer their latest question now —'],
  },
]);

// ── The cursor's band catalog (SPEC §5, §11 — one beat of a longer piece) ────
export const cursorView = ({
  orientation = '',
  established = '',
  integrals = [],          // [{ name }] — the full integral per argument Site (surface)
  open = [],               // [string]  — void attributes, held open
  edge = '',               // the typed relation in EOT surface: A -> B : tends
  beat = '',               // OR a beat instruction (free prose target)
  spans = [],              // grounded substance for this beat (exafference)
  target = '',             // the shape instruction ("one plain past-tense sentence…")
  band = 'firm',           // 'void' → hedge; 'firm' → assert. Production ALWAYS supplies
                           //   this from the propagated Resolution (write/cursor.js bandOf,
                           //   now void-on-absence), so the void-default lives there; this
                           //   bare fallback stays 'firm' only as the byte-identity anchor.
  corrective = '',         // a forward correction the previous beat's seam carried (§3c)
} = {}) => ({ orientation, established, integrals, open, edge, beat, spans, target, band, corrective });

const CURSOR_ORIENT_FRAME = 'Read what is here; do not name or place the work.';
const CURSOR_FOCUS_FRAME = 'Who this beat is about (already established — refer to them naturally):';
const CURSOR_OPEN_FRAME = 'Unsettled — do NOT assert as fact, leave open:';
const CURSOR_EDGE_FRAME = 'What happens (from the document):';
const CURSOR_VOID_HEDGE = 'This connection is not settled by the document — write it as a holding-open (suggests, stages, leaves open), never as a proven claim.';

export const CURSOR_BANDS = Object.freeze([
  // The cursor's stable voice — same relaxed renderer posture as SYSTEM_GROUND.
  {
    key: 'voice', terrain: 'Atmosphere', role: 'system',
    cell: { op: 'EVA', stance: 'Tending' },
    when: () => true,
    render: () => SYSTEM_CURSOR,
    prose: [SYSTEM_CURSOR],
  },
  {
    key: 'orientation', terrain: 'Entity', role: 'user',
    when: (v) => !!v.orientation,
    render: (v) => `You are reading ${v.orientation}. ${CURSOR_ORIENT_FRAME}`,
    prose: ['You are reading', CURSOR_ORIENT_FRAME],
  },
  // What stands so far — the piece's own settled ground.
  {
    key: 'established', terrain: 'Field', role: 'user',
    when: (v) => !!v.established,
    render: (v) => `Established so far: ${v.established}.`,
    prose: ['Established so far:'],
  },
  // Identity, collapsed AT THE CURSOR — the integral per argument Site (§5). A lone
  // referent is the Focus (cursor.mjs); a relation labels Subject / Object so the
  // model binds each slot to the right integral. Entity: identity fixed.
  {
    key: 'integrals', terrain: 'Entity', role: 'user',
    when: (v) => v.integrals.length > 0,
    render: (v) => {
      const focusLines = v.integrals
        .map((g, i) => {
          const label = v.integrals.length === 1 ? 'Focus'
            : i === 0 ? 'Subject' : i === v.integrals.length - 1 ? 'Object' : 'Also';
          return `  ${label}: ${g.name}`;
        })
        .join('\n');
      return `${CURSOR_FOCUS_FRAME}\n${focusLines}`;
    },
    prose: [CURSOR_FOCUS_FRAME],
  },
  // The void attributes, named as unsettled — do not assert (§2 FIRM-ONLY, §5).
  {
    key: 'open', terrain: 'Void', role: 'user',
    cell: { op: 'DEF', stance: 'Clearing' },
    when: (v) => v.open.length > 0,
    render: (v) => `${CURSOR_OPEN_FRAME} ${v.open.join('; ')}.`,
    prose: [CURSOR_OPEN_FRAME],
  },
  // The beat itself: a typed edge in surface. Link: one named bond — the only band
  // in either catalog that rides the Link terrain.
  {
    key: 'edge', terrain: 'Link', role: 'user',
    when: (v) => !!v.edge,
    render: (v) => `${CURSOR_EDGE_FRAME}\n  ${v.edge}`,
    prose: [CURSOR_EDGE_FRAME],
  },
  // …or a free beat instruction. Kind: the type of move this beat makes.
  {
    key: 'beat', terrain: 'Kind', role: 'user',
    when: (v) => !!v.beat,
    render: (v) => `The beat: ${v.beat}`,
    prose: ['The beat:'],
  },
  // A forward correction the prior beat's seam carried (§3c): plain language, no
  // machinery — the talker writes the qualifier into its own sentence. Paradigm.
  {
    key: 'corrective', terrain: 'Paradigm', role: 'user',
    cell: { op: 'DEF', stance: 'Dissecting' },
    when: (v) => !!v.corrective,
    render: (v) => v.corrective,
    prose: [],
  },
  {
    key: 'excerpts', terrain: 'Entity', role: 'user',
    when: (v) => v.spans.length > 0,
    render: (v) => `${EXCERPTS_HEADER}\n${v.spans.map(s => s.text).join('\n')}`,
    prose: [EXCERPTS_HEADER],
  },
  // The SOFT gate, surfaced as posture (§3b): a void synthesis must hedge. Void:
  // the unsettledness itself is the content.
  {
    key: 'void-hedge', terrain: 'Void', role: 'user',
    cell: { op: 'DEF', stance: 'Clearing' },
    when: (v) => v.band === 'void',
    render: () => CURSOR_VOID_HEDGE,
    prose: [CURSOR_VOID_HEDGE],
  },
  // The shape instruction. Kind: the form of the one sentence to write.
  {
    key: 'target', terrain: 'Kind', role: 'user',
    cell: { op: 'SEG', stance: 'Dissecting' },
    when: (v) => !!v.target,
    render: (v) => `Write: ${v.target}.`,
    prose: ['Write:'],
  },
]);

// ── The chat (no-doc) band catalog ───────────────────────────────────────────
// A chat model wants turns as turns, so the recent verbatim window rides as real
// {role,content} message history (assembled in prompt.js) and the surfed recap folds
// into the system message (docs/session-fold.md).
export const chatView = ({ question, history = [], notes = '', free = false, now = null, longform = false } = {}) =>
  ({ question, history, notes, free, now, longform });

const CHAT_NOTES_FRAME = 'Notes about our conversation before this:';

export const CHAT_BANDS = Object.freeze([
  {
    key: 'voice', terrain: 'Atmosphere', role: 'system',
    cell: { op: 'EVA', stance: 'Tending' },
    when: () => true,
    render: (v) => (v.free ? SYSTEM_FREE : SYSTEM_CHAT),
    prose: [SYSTEM_CHAT, SYSTEM_FREE],
  },
  {
    key: 'moment', terrain: 'Field', role: 'system',
    when: (v) => !!currentMomentLine(v.now),
    render: (v) => currentMomentLine(v.now),
    prose: [],
  },
  // A long-form ask overrides the default concise register (default off →
  // byte-identical). Kind: the form of the piece being asked for.
  {
    key: 'longform', terrain: 'Kind', role: 'system',
    cell: { op: 'SEG', stance: 'Dissecting' },
    when: (v) => !!v.longform,
    render: () => LONGFORM_DIRECTIVE,
    prose: [LONGFORM_DIRECTIVE],
  },
  // The surfed recap of the conversation's older movers. Field: settled ground.
  {
    key: 'notes', terrain: 'Field', role: 'system',
    when: (v) => !!v.notes,
    render: (v) => `${CHAT_NOTES_FRAME}\n${v.notes}`,
    prose: [CHAT_NOTES_FRAME],
  },
  {
    key: 'question', terrain: 'Lens', role: 'user',
    when: () => true,
    render: (v) => v.question,
    prose: [],
  },
]);

// ── The projection ───────────────────────────────────────────────────────────
// Read-time, pure, no act fired: select the live bands, apply the probe (research
// instrument, default null → identity), render each against the view. The returned
// bands carry their Site coordinates so a checkpoint (model/prompt-checkpoint.js)
// or a census can judge the assembly without re-deriving anything.
//
// probe (docs/prompt-as-site.md, Tier 2 — read-only, off in production):
//   drop         [terrain]  P2 — ablate whole terrains (user-role bands only; the
//                           system voice is not a probe target, it is the frame)
//   dropBands    [key]      P3 — ablate named bands (e.g. 'summary-guard')
//   absenceFirst boolean    P4 — hoist the Void bands to the head of the user block
//                           (EO's helix: the boundary precedes the bond and the
//                           synthesis) instead of their default late position
export const projectBands = (bands, view, probe = null) => {
  let live = bands.filter(b => b.when(view));
  if (probe?.drop?.length)
    live = live.filter(b => b.role !== 'user' || !probe.drop.includes(b.terrain));
  if (probe?.dropBands?.length)
    live = live.filter(b => !probe.dropBands.includes(b.key));
  if (probe?.absenceFirst) {
    const voids = live.filter(b => b.role === 'user' && b.terrain === 'Void');
    live = [...live.filter(b => b.role !== 'user'),
            ...voids,
            ...live.filter(b => b.role === 'user' && b.terrain !== 'Void')];
  }
  return Object.freeze(live.map(b => Object.freeze({
    key: b.key,
    terrain: b.terrain,
    grain: TERRAIN_GRAIN[b.terrain],
    role: b.role,
    cell: b.cell ?? null,
    text: b.render(view),
  })));
};

// The three named projections the builders (and the checkpoint) ride.
export const projectGroundedBands = (args, probe = null) => projectBands(GROUNDED_BANDS, groundedView(args), probe);
export const projectCursorBands   = (args, probe = null) => projectBands(CURSOR_BANDS, cursorView(args), probe);
export const projectChatBands     = (args, probe = null) => projectBands(CHAT_BANDS, chatView(args), probe);
