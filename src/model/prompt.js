// EO: SYN·DEF·SEG(Field → Field,Lens, Dissecting,Composing) — grounded prompt assembler + frame
// The prompt-assembly contract — what the talker is handed.
//
// THE HONEST FRAME (docs/subjective-frame.md). The talker is not told "HERE IS YOUR
// ANSWER", nor made to pretend it read a whole document. It is told the truth: it is the
// voice of a reader, and the verbatim lines below are what its reading of the source TURNED
// UP on this question. The epistemics are stated plainly as a reading result — "here is what
// I found when I read it" — not the vaguer "what comes to mind", so the talker knows exactly
// what the data is. There is exactly one channel — those found lines — and the boundary falls
// out of the honesty: what was found is not the whole source, so speaking past it is
// incoherent rather than forbidden, and an absence is voiced the way a person voices it
// ("I didn't find that in what I read"), never as a stiff refusal. Being plain about the data
// and voicing the gap naturally is what lets a small talker answer like itself — and still
// help past the gap — instead of the over-steered stiffness the old framing produced.
//
// What this REVERSES from the earlier (prompt-assembly.md) contract, per the
// June 20 correction and docs/subjective-frame.md:
//   §2 — the fold's ARROWS leave the prompt. A model reads a flat relational arrow as a
//        causal claim even when the edge encodes only adjacency (the post-hoc
//        fallacy); the arrows shipping today are degraded verb-fragments, noise
//        not spine. Relational structure now rides in span SELECTION and ORDER
//        (the grounder's job), never as arrows in the talker's input.
//   §3 — NO recognition. Orientation is filename · type · length only — never an
//        extracted title or author. A talker that knows it is reading a famous
//        book narrates the book it remembers, not the lines it read; this is the
//        exact leak the metamorphosis battery puts under test. The front matter
//        is still ANSWERABLE — a metadata question routes to a metadata answer
//        (turn/stages.js) — it is just no longer AMBIENT in a content turn.
//   §1 — stop calling the spans "memory." A reader read some lines; that framing
//        is what makes the boundary hold with no refusal instruction behind it.
//
// Structure stays in the grounder: in selection, in order (§3 below), and in the
// edge-grounding veto on the way back. `serializeNotes` / the substrate stay
// alive — they feed the grounder and the veto — they just never reach the talker.
//
// The system message carries the stable boundary + voice (prefix cache holds);
// the per-turn user block carries the lines, the conversation so far, the
// question, and the absence clause last, where a small model attends hardest.

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
export const SUMMARY_GUARD =
  'They want a summary: say what it is about in your own words, drawing the lines ' +
  'together — never reword a single line as the whole answer.';

// THE HONEST FRAME (§1). The talker is told plainly WHAT it is and WHERE its knowledge comes
// from, rather than being made to pretend it read a whole document. The engine read the source
// and the lines below are what that reading TURNED UP on this question — the honest ontology is
// "here is what I found when I read it," stated as a reading result, not the vaguer "what comes
// to mind." Being plain about what the data IS (lines that were read) is what frees the talker to
// answer like itself: an over-steered frame ("that didn't come to mind", "the reading doesn't
// say") made a small model answer more stiffly than it naturally would. So the boundary is still
// there — what was found is not the whole source — but it is voiced as a person would ("I didn't
// find that in what I read"), and the talker keeps its freedom to help past the gap. The voice is
// stable across turns so the prefix cache holds; the per-turn absence clause rides last in the
// user block, where a small model attends hardest (buildGroundedMessages).
export const SYSTEM_GROUND = `You are the voice of a reader. When you're asked something, the lines below are what your reading turned up on it — the part of what you read that bears on this question, not the whole of it.

Answer the way you naturally would: say what those lines show, in your own words — don't quote them back or tell whoever asked to go look. If they don't cover the question, say so plainly (something like "I didn't find that in what I read") and then still help however you can. Write natural prose; don't write citations or tags, those are added for you.`;

export const SYSTEM_CHAT = `You are a helpful, knowledgeable assistant. Answer their question directly and accurately, drawing on the conversation and your general knowledge. Be clear and concise.`;

// The STRICT grounded register — answer from the reading first (the Grounded chip). The same honest
// frame, said plainly: the lines below are what the reading found, and that is the window onto the
// source. When they don't cover the question the honest report is "I didn't find it in what I read,"
// after which the talker may still help from general knowledge if it says so — a faithful "I didn't
// find that" is the right answer here, never a failure.
export const SYSTEM_GROUND_STRICT = `You are the voice of a reader. When you're asked something, the lines below are what your reading turned up on it — the part of what you read that bears on this question, and your only window onto the source.

Answer from those lines when they cover the question. When they don't, say so plainly — that you didn't find it in what you read — and then, if you can, you may answer from your general knowledge, making clear that part isn't from what you read. Never claim the lines said something they didn't. Speak of "what I read", never of "the reading". Write natural prose; don't write citations or tags, those are added for you.`;

// The FREE register — general-knowledge chat that ignores the document (the Free form
// chip). Distinct from SYSTEM_CHAT, which is the conversation-only fallback: this one
// explicitly invites outside knowledge and labels itself ungrounded.
export const SYSTEM_FREE = `You are a helpful, knowledgeable assistant. Answer their question directly and accurately, drawing on your general knowledge. Be clear and concise.

(This reply is free-form — it is not grounded in any document they may have loaded.)`;

// The current-moment line — AMBIENT CONTEXT, not an instruction. A small talker, asked "what
// is today's date?", confabulates the "I have no real-time clock" boilerplate; handed the moment
// as a plain known fact (the way it knows anything in its context), it just answers. So this is
// stated as context the chat already has — no "use this", no "you do/don't have a clock", nothing
// for the model to echo back about clocks at all. The browser is the ground truth; off by default
// (`now` null → '' → byte-identical prompts and golden tests); the live turn passes `new Date()`.
// Formatted from LOCAL components — the user's wall clock — with named day/month arrays so the
// wording is locale-independent and deterministic to test.
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

// The orientation line: filename, type, length — and NOTHING that lets the talker
// narrate a famous text from memory (§3). No title, no author, no genre: the epistemic
// position of a reader who just set a file down. The front matter stays ANSWERABLE — a
// metadata question routes to a metadata answer (answerMetadata, turn/stages.js) — it is
// simply no longer AMBIENT in a content turn, where it invites narration-from-memory.
export const orientationLine = ({ filename, type, length } = {}) => {
  const parts = [filename || 'the document', type || 'text'];
  if (length != null) parts.push(`${length} sentences`);
  return parts.join(' · ');
};

// The document's own front-matter metadata, rendered as a labeled block (doc.metadata,
// by canonical key — omnimodal: text harvests it from labeled lines, an image from EXIF,
// a score from ID3). This NO LONGER rides the grounded content prompt (§3 — title/author
// are the recognition leak the battery tests). It feeds the METADATA ANSWERER instead
// (answerMetadata), which answers "who wrote this / when" from the front matter as a
// distinct fact. Known keys lead in a stable reading order (title, then author, then the
// rest); any extra key follows under a title-cased label. Empty string when none.
const META_LABEL = {
  title: 'Title', subtitle: 'Subtitle', author: 'Author', editor: 'Editor',
  translator: 'Translator', illustrator: 'Illustrator', contributor: 'Contributor',
  composer: 'Composer', director: 'Director', artist: 'Artist', performer: 'Performer',
  producer: 'Producer', publisher: 'Publisher', date: 'Date', updated: 'Updated',
  language: 'Language', source: 'Source', subject: 'Subject', genre: 'Genre',
  series: 'Series', volume: 'Volume', edition: 'Edition', rights: 'Rights',
  isbn: 'ISBN', doi: 'DOI', from: 'From', to: 'To', cc: 'Cc',
};
const META_ORDER = ['title', 'subtitle', 'author', 'editor', 'translator', 'illustrator',
  'composer', 'director', 'artist', 'performer', 'producer', 'publisher', 'date', 'updated',
  'language', 'source', 'subject', 'genre', 'series', 'volume', 'edition', 'isbn', 'doi',
  'from', 'to', 'cc', 'rights'];
const titleCase = (k) => String(k).replace(/\b\w/g, (c) => c.toUpperCase());

export const metadataBlock = (metadata = {}, header = 'About this document (its own front matter):') => {
  const keys = Object.keys(metadata || {});
  if (!keys.length) return '';
  const ordered = [...META_ORDER.filter(k => k in metadata),
                   ...keys.filter(k => !META_ORDER.includes(k))];
  const lines = ordered
    .filter(k => metadata[k] != null && String(metadata[k]).trim())
    .map(k => `- ${META_LABEL[k] || titleCase(k)}: ${metadata[k]}`);
  return lines.length ? `${header}\n${lines.join('\n')}` : '';
};

// THE SHAPE CUE WAS RETIRED HERE. A broad question no longer trips a keyword regex
// (shapeForScope) that stamps a visible answer-first/sectioned TEMPLATE onto the talker's
// prompt ("Shape your answer like this: ## Heading, **bold**, close with 'Want me to go
// deeper on:'"). That template fought the discourse metacognition, which already owns how a
// reply is shaped — its brief (app.dc.js _steerLine) says "let it decide what you foreground
// AND how you shape the reply". Shape is now emergent from that invisible read, not forced by
// a template the talker parrots: the metacognition does the steering. See _steerLine for the
// (invisible, "don't quote it") shaping guidance that replaced this, and the answer-first
// layout is now something the read may reach for when the material genuinely sections — not a
// mandated form. `shape` (the buildGroundedMessages param) still carries the LIBRARIAN and
// CAPABILITY registers; it no longer carries a layout template.

// THE LIBRARIAN REGISTER. The reader is a research librarian surfacing what the sources hold,
// not an expert holding forth — so the answer keeps the sources in the foreground, attributes
// rather than asserts, prefers the source's own telling phrasing, and is honest about silence.
// Opt-in (the reader passes it); never rides the default turn prompt, so the golden tests stand.
//
// The first cut handed the talker two LITERAL attribution templates — "the source notes…",
// "one account says…" — and a small model parrots a stock phrase the moment you name it: every
// answer opened "The source notes that…", then padded with "(the source notes…)" asides, and
// echoed the prompt's own framing labels ("What it means") back as headings. The register reads
// robotic. So this asks for the SAME librarian posture but in natural, varied prose: attribute
// when it matters, in your own words, without a recurring crutch phrase or parenthetical aside,
// and answer the question directly rather than narrating the act of reading.
//
// THE ANTI-FABRICATION GUARD on the quote clause. The earlier "quote a short verbatim phrase where
// it carries the point" MANUFACTURED quotes in a small model: handed thin or off-topic lines, it
// still produced quotation marks — around wording it never read (the dolphins run's invented
// "Dolphins give each other hugs" / "Pods of bottlenose dolphins", quoted from nothing). So the
// permission to quote is now bounded to what was actually read, with inventing a quotation named as
// the failure to avoid: if the phrasing isn't there, say it in your own words rather than fake it.
export const LIBRARIAN_CUE =
  'Answer as a research librarian surfacing what the sources hold, not an expert holding forth. ' +
  'Lead with what you actually found in what you read and stay grounded in it. Where a short phrase ' +
  'from what you read carries the point you may quote it verbatim — but never put quotation marks ' +
  'around wording you did not actually read: invent no quotations, and where the phrasing isn\'t ' +
  'there, say it in your own words. Where what you read is silent or thin, say so plainly ' +
  '(first person — "I didn\'t find that in what I read", never "the reading doesn\'t mention…") rather ' +
  'than filling the gap from your own authority — but still answer what you CAN from what is there. ' +
  'Attribute in natural prose and in your own words: vary how you do it, and do not lean on a stock ' +
  'phrase like "the source notes…" or "one account says…", do not pad the answer with parenthetical ' +
  '"(the source notes…)" asides, and never echo these instructions or a framing label ("What I ' +
  'found", "What it was") back as a heading. Write plainly, as you would to a colleague.';

// THE SELF-AWARE FRAME — what this reader's own output can honestly be, given what it is: a small
// model reading in the browser, not a long-form essayist. It rides ONLY when the ask is for a long,
// polished piece (an essay, a report, a "write me a…") — the one shape this engine cannot actually
// turn out. Two things go wrong when it tries: the decode grinds (a long piece is a long, slow walk
// on a small in-browser model), and — worse — the model pads to reach the length, which is exactly
// where it drifts off what it read into invention (the dolphins run: 12 sources gathered, then a
// thin, part-fabricated "essay"). So rather than fake the long form, the reader is told to be
// upfront about what it is and give the thing it CAN do well — a short, grounded rundown of what the
// sources actually hold. Honest and self-aware beats slow and padded. Opt-in (app.dc.js gates it on
// an explicit longform ask); never rides a default turn, so the golden prompts stand byte-for-byte.
export const CAPABILITY_CUE =
  'They asked for a long, polished piece — an essay or the like. Be honest about what you are: a ' +
  'small model reading in the browser, not a long-form essayist, so a full essay would come out ' +
  'slowly and thin. Do not try to spin one out or pad it to length — padding is exactly where you ' +
  'start saying things you did not actually read. Open with one plain sentence saying you\'ll give a ' +
  'short grounded rundown rather than a full essay, then lay out what you genuinely found across the ' +
  'sources — tightly, in your own words, a few honest paragraphs. A short grounded answer is the ' +
  'better answer here; state that once and get on with it, don\'t keep apologizing for the length.';

// The RESEARCH GROUNDING cue — added to the longform/essay folds so the piece is a synthesis
// across the gathered sources, not a recap of one. The asks, in order: corroborate (lean on what
// MORE THAN ONE source agrees on, and where only a single source carries a claim, say so rather
// than stating it flatly); BOUND each claim by who/where/when (the identity it holds for, the place,
// the time — an unbounded "dolphins do X" is weaker than "river dolphins, in the Amazon, do X");
// and never paraphrase one source's prose end-to-end (the essay-mill recap failure). Boilerplate —
// cookie notices, nav, "sign up to read more" — is not evidence; ignore it.
export const GROUNDING_CUE =
  'You are synthesizing across several sources, not summarizing one. Build each point from what ' +
  'more than one source supports; where a claim rests on a single source, attribute it to that ' +
  'source rather than asserting it as settled fact, and where the sources disagree, say so. Keep ' +
  'every claim bounded — to whom it applies, where, and when — instead of stating it as a timeless ' +
  'universal. Do not retell or paraphrase any one source end to end; weave the threads together in ' +
  'your own words. Ignore boilerplate (cookie notices, navigation, sign-up prompts) — it is not evidence.';

// shapeForScope WAS RETIRED. It was a keyword regex over the question ("compare", "explain",
// "how did…") that returned the STRUCTURE_CUE layout template — a keyword cliff deciding the
// answer's shape. Shape is no longer read off surface words; the discourse metacognition reads
// what the turn is FOR and its brief (_steerLine) does the shaping, invisibly. A pointed lookup
// and a broad survey diverge because the metacognition read them differently, not because a word
// matched. Deleting the export is intentional — no caller should key layout off the raw question.

const budgetLine = (b) => {
  if (!b) return '';
  if (typeof b === 'string') return b;
  const parts = [];
  if (b.sentences) parts.push(`at most ${b.sentences} sentence${b.sentences > 1 ? 's' : ''}`);
  if (b.chars)     parts.push(`under ${b.chars} characters`);
  return parts.length ? `Reply in ${parts.join(', ')}.` : '';
};

// Order the lines for the frame (§3, position bias — Lost in the Middle / Context Rot):
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

// Build the grounded user turn as the SUBJECTIVE FRAME (§1–§3). One channel — the
// verbatim lines, the only thing the reader read — framed as a reading, with the
// question and the absence clause LAST where a small model attends hardest. No arrows
// (§2): relational structure rode into span selection and order upstream, never as
// `A -> B : rel` in the talker's input. No recognition (§3): orientation is
// filename · type · length, never a title or author. The conversation rides in the same
// reader's register (this reading so far), the USER's thread only — the talker's prior
// answers stay withheld (the poisoning channel), and an unbound one never folds in (§7).
//
// THE META-CONVERSATIONAL EXCEPTION (`meta:true`, turn/intent.js). When the question is
// ABOUT the conversation ("which topic we discussed is in France?"), the prior turns are
// its SUBJECT, not a premise it might anchor a wrong fact to — so the full both-role thread
// is fed and framed to be reasoned over, not skipped. The asymmetry is the point: the
// firewall guards a prior ANSWER becoming a premise; here a prior topic is the question.
export const buildGroundedMessages = ({
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
  arc = '',                // the reading's own arc (write/gravity.js arcLines); '' → no block, byte-identical
  reasoning = '',          // the reasoning walk's marked reaches (turn/stages.js `prompt`, src/reason);
                           // '' → no block, byte-identical. Pre-rendered lines, each carrying its grade mark.
  shape = '',              // the register bundle — LIBRARIAN (+ CAPABILITY on longform); no layout template. '' → no block, byte-identical
  steer = '',              // the discourse read's BRIEF — what THIS user actually wants (app.dc.js _steerLine);
                           // folded in just before the answer clause and echoed in it. '' → no block, byte-identical.
  tail = '',              // the planner's read-window — the prose written so far this turn (spec-planner.md §5/§6)
} = {}) => {
  const blocks = [];
  // A META-CONVERSATIONAL turn (the question is ABOUT the conversation) carries the full
  // both-role thread as its SUBJECT, framed to be drawn on, not skipped. Every other
  // grounded turn keeps the prior turns as context-to-skip (the firewall below).
  const metaConv = meta && !!(conversation.notes || conversation.pastTurns?.length);

  // What it was — filename · type · length, no recognition (§3).
  if (orientation) blocks.push(`What it was: ${orientation}.`);

  // THE FOLD — the reader's own SENSE of what it read, handed to the talker the way the talker
  // hands back its answer: as language, not as a data structure. §2 keeps the fold's ARROWS out of
  // the default frame because a small model reads a flat "A -> B" as a causal claim; so a caller
  // that wants the fold in the window passes it ALREADY FOLDED INTO NEAR-PROSE (the reader's
  // `foldProse`) — the central figures and what the reading joined them to, said plainly. The
  // talker is then simply GIVEN the content, the way a person is handed it, without the machinery
  // of where it arose from, and only makes it fluent: the folding did the thinking, not this
  // prompt, which is why the frame stays one short line. It leads; the high-value verbatim lines
  // follow as its grounding. Empty → no block, byte-identical.
  if (graph)
    blocks.push(`Here's the sense of it, from your reading:\n${graph}`);

  // THE ARC — how the reading itself MOVED, opt-in (write/gravity.js, docs/weight-of-the-
  // turn.md): the focus's relations phase to phase, segmented at the turns where the reading
  // was rewritten, each turn weighted by how hard. This is the surf's own dynamics broadcast
  // into the window — the arriving-at beside the conclusions — so the telling can carry the
  // turn as a turn instead of flattening it into equal claims. The arc shows order and turns,
  // never causes; the cue says so, and the connective leash holds the output to it. Empty on
  // every default turn → no block → byte-identical.
  if (arc)
    blocks.push(`${arc}\n(Let this shape the telling — at first…, then… — with the heaviest ` +
      `emphasis at the strongest turn; the arc shows order and turns, never causes, so don't ` +
      `add a "therefore" it doesn't contain.)`);

  // The planner's READ-WINDOW (spec-planner.md §5/§6): the prose written so far this
  // turn, fed back so the next sentence opens with a real transition instead of cold.
  // It is context for the SEAM only — already witnessed, NOT to be repeated or
  // re-grounded — so it rides just BEFORE the source lines, the prose then the
  // material then the ask. Empty (→ no block) on every non-planner caller, so
  // byte-identical there.
  if (tail)
    blocks.push(`The answer so far (continue from it; do not repeat it, and add no new fact):\n${tail}`);

  // What the reading found — the verbatim lines it turned up, ordered for the frame (§3). The ONE channel.
  if (spans.length)
    blocks.push(`${EXCERPTS_HEADER}\n${orderSpansForFrame(spans).map(s => s.text).join('\n')}`);

  // THE MARKED REACHES — the reasoning walk's own inferences (src/reason/walk.js), each line
  // already carrying its grade mark from the turn. The grade survives the membrane HERE: the
  // lines above are asserted (the text says them); these are hedged (the reading inferred
  // them). The instruction is the epistemics, said once — hedge an inference as an inference,
  // never state it as what the text says. Empty on every turn the walk did not run →
  // no block → byte-identical.
  if (reasoning)
    blocks.push(`${reasoning}\n(Those are your own inferences, not lines you read — if one helps the answer, offer it hedged, as a reading of the pattern (“this suggests…”, “it may be that…”), never as something the text states.)`);

  // The conversation so far, in the reader's register — never document content (§1, §6).
  if (metaConv) {
    // META-CONVERSATIONAL: the question is ABOUT this conversation, so the prior turns are
    // the SUBJECT, not a checklist to skip. Feed both sides (the surfed recap of older
    // movers and the recent verbatim window), framed to be reasoned over — the opposite of
    // the "answer just their latest" cue below, which would discard the very topics asked about.
    const thread = [conversation.notes, ...(conversation.pastTurns || [])].filter(Boolean).join('\n');
    blocks.push(`The conversation so far — what you two have already talked about ` +
      `(their question below is ABOUT this conversation, so treat these prior topics as its ` +
      `subject, not as background to skip):\n${thread}`);
  } else {
    // The prior turns ride as CONTEXT, not as a checklist: a small talker fed bare
    // "You asked: …" lines answers every one of them (the audit's t5 regurgitated the
    // whole thread as bullets), so the block names them as already-handled and points the
    // talker at the single live question below.
    if (conversation.notes)
      blocks.push(`Earlier in this reading:\n${conversation.notes}\n(Those came before — for context only; answer just their latest question below.)`);
    if (conversation.pastTurns?.length)
      blocks.push(`They had asked you:\n${conversation.pastTurns.join('\n')}` +
        // When `notes` rode above it already carried the firewall; a pastTurns-only
        // thread (the reader chat) gets it here, so the prior turns read as already-handled
        // context and not a checklist the talker re-answers (the "restated the old one" bug).
        (conversation.notes ? '' : '\n(Those came before — for context only; answer just their latest question below.)'));
    // The COMMON-GROUND cue (converse/dialogue-state.js): the facts already settled between
    // you and the user. A small talker re-asserts "the mayor is X" every turn because the
    // thread above reads as a checklist; naming the settled ground as already-held tells it
    // to build on it instead of restating it. Only the settled QUESTION rides — never the
    // prior answer (the firewall holds). Empty → no block → byte-identical.
    if (conversation.settled?.length)
      blocks.push(`Already settled with them — they know these; build on them, don't restate them:\n${conversation.settled.map(s => `- ${s}`).join('\n')}`);
  }

  // A SHAPE exemplar — the nearest sample answer the form library matched (turn/shape.js),
  // offered so the FIRST draft is laid out in the right register and length. It is a FORM
  // model only: it is about a different text, so the talker must copy its shape, never its
  // facts. Empty (→ no block) on every turn with no library threaded — byte-identical.
  if (exemplar)
    blocks.push(`For the SHAPE only — here is the kind of answer this question wants (it is ` +
      `about a different text; copy its register and length, NOT its facts):\n“${exemplar}”`);

  // The live question — last of the material, just before the closing clause.
  blocks.push(`They asked you: ${question}`);

  // A confabulation-rewrite corrective, when the talker is re-prompted after the
  // diagonal guard caught a figure-at-a-void (turn/stages.js `revise`).
  if (corrective) blocks.push(corrective);

  // The summary guard rides on a summary task only — faithfulness, not length.
  if (task === 'summary') blocks.push(SUMMARY_GUARD);

  // No length line by default (budget empty); a caller may re-impose a cap for a turn.
  const budgetStr = budgetLine(budget);
  if (budgetStr) blocks.push(budgetStr);

  // The register bundle (LIBRARIAN, + CAPABILITY on a longform ask), just before the answer
  // clause. No layout template rides here any more — how the reply is shaped is the discourse
  // metacognition's call, carried by the steer below. Never on a budgeted (capped) reply.
  if (shape && !budgetStr) blocks.push(shape);

  // Strict mode with nothing to read: the reader had no lines on this at all. Name that
  // absence so the talker says it plainly rather than reaching past the frame for outside
  // knowledge (the strict system message already forbids that; this is the in-register cue).
  if (strict && !spans.length)
    blocks.push('Your reading turned up nothing bearing on their question — it is not covered by what you read. Say that plainly, the way a person would (for example: "I didn\'t find anything about that in what I read" — first person, never "the reading doesn\'t mention…"), then, if you can, answer from general knowledge, making clear that part is not from what you read.');

  // THE DISCOURSE STEER — the metacognition's BRIEF on what THIS user is actually after, folded in
  // as the last instruction before the answer clause (where a small model attends hardest). It is a
  // note to the model about how to AIM the reply, not content to echo — so it decides what gets
  // foregrounded, not what gets restated. The dolphins failure this fixes: a read that said the user
  // wanted an overview of dolphins still answered with whatever spans surfaced (climate change, meat)
  // because the read only rode along as passive "steering". Now it leads the answer clause. Empty
  // (every non-steered caller) → no block → byte-identical.
  if (steer) blocks.push(steer);

  // The ANSWER CLAUSE, last (§1) — where a small model attends hardest. The restriction is
  // lifted: the talker answers, from the lines when they cover it and from general knowledge
  // when they don't (saying which). Not from document is FLAGGED downstream, not forbidden here.
  //   When a prior thread rode above, the clause names the live question outright so the talker
  //   answers THAT one and not the earlier turns it just saw.
  //   When a steer rode above, the clause closes on it too — the last words the model reads are
  //   "aim it at what they want", not a generic "answer them now" that discards the brief.
  const aim = steer ? ' Keep the whole reply aimed at what they’re actually after (the brief just above) — lead with what your reading speaks to it, not with whatever else happened to surface.' : '';
  blocks.push((metaConv
    ? `Answer their question now — “${question}” — about the conversation above. Draw on those ` +
      'prior topics as its subject, grounded in what your reading turned up where it bears ' +
      'on the answer; say which part is from what you read and which from general knowledge.'
    : (conversation.notes || conversation.pastTurns?.length)
    ? `Answer their latest question now — “${question}” — in your own words. If what you read ` +
      'doesn\'t cover it, answer from general knowledge and say that part isn\'t from what you read.'
    : 'Answer them now, in your own words. If what you read doesn\'t cover it, answer from ' +
      'general knowledge and say that part isn\'t from what you read.') + aim);

  const sysBase = strict ? SYSTEM_GROUND_STRICT : SYSTEM_GROUND;
  const moment = currentMomentLine(now);
  return [
    { role: 'system', content: moment ? `${sysBase}\n\n${moment}` : sysBase },
    { role: 'user',   content: blocks.join('\n\n') },
  ];
};

// ── The cursor contract (SPEC §5, §11) ───────────────────────────────────────
// The generation membrane. Where the reading path answers a question, the writing
// path realizes ONE beat of a longer piece: the substrate hands the model a locally
// resolved impression — the integral name per argument Site (identity fixed), the
// open questions held OUT (unsettled, do not assert), the typed edge in surface, the
// grounded spans — and the model collapses it to one fluent sentence. The substrate
// OVER-specifies the input (full integral, to kill mis-binding); the model
// UNDER-specifies the output (natural form, he/Gregor, no repetition). Same relaxed
// renderer posture as SYSTEM_GROUND; the surface discipline (§3) governs the whole
// prompt — no hashes, no codes, no indices ever reach the model.
export const SYSTEM_CURSOR = `You are a sharp reading companion writing one beat of a longer piece. You've read this document. Write in your OWN WORDS — synthesize, don't quote the passage back. Use what you've established so far; you don't need to reintroduce people already named. Refer to people naturally once they're established (he, she, by name) — don't repeat their full description.

Write natural prose. Don't write citations, tags, or codes; those are added for you.`;

// buildCursorMessages — assemble the prompt for ONE cell from the cursor's slots.
// Every argument Site arrives as its INTEGRAL (full standing name, surface form);
// the open (void) attributes arrive named as unsettled. A void-resolved beat (§3b)
// carries a HEDGE instruction so the renderer withholds rather than overclaims. The
// returned shape is the {system,user} pair model.phrase(messages, opts) consumes.
export const buildCursorMessages = ({
  orientation = '',
  established = '',
  integrals = [],          // [{ name }] — the full integral per argument Site (surface)
  open = [],               // [string]  — void attributes, held open
  edge = '',               // the typed relation in EOT surface: A -> B : tends
  beat = '',               // OR a beat instruction (free prose target)
  spans = [],              // grounded substance for this beat (exafference)
  target = '',             // the shape instruction ("one plain past-tense sentence…")
  band = 'firm',           // 'void' → hedge; 'firm' → assert (the propagated Resolution)
  corrective = '',         // a forward correction the previous beat's seam carried (§3c)
} = {}) => {
  const blocks = [];
  if (orientation) blocks.push(`You are reading ${orientation}. Read what is here; do not name or place the work.`);
  if (established)  blocks.push(`Established so far: ${established}.`);

  // Identity, collapsed AT THE CURSOR — the integral per argument Site (§5). A lone
  // referent is the Focus (cursor.mjs); a relation labels Subject / Object so the
  // model binds each slot to the right integral.
  if (integrals.length) {
    const focusLines = integrals
      .map((g, i) => {
        const label = integrals.length === 1 ? 'Focus'
          : i === 0 ? 'Subject' : i === integrals.length - 1 ? 'Object' : 'Also';
        return `  ${label}: ${g.name}`;
      })
      .join('\n');
    blocks.push(`Who this beat is about (already established — refer to them naturally):\n${focusLines}`);
  }
  // The void attributes, named as unsettled — do not assert (§2 FIRM-ONLY, §5).
  if (open.length)
    blocks.push(`Unsettled — do NOT assert as fact, leave open: ${open.join('; ')}.`);

  // The beat itself: a typed edge in surface, or a free instruction.
  if (edge) blocks.push(`What happens (from the document):\n  ${edge}`);
  if (beat) blocks.push(`The beat: ${beat}`);

  // A forward correction the prior beat's seam carried (§3c): the reading drifted
  // past the noise null, so the NEXT sentence acknowledges it in prose rather than
  // un-saying the last one. Plain language, no machinery — the talker just writes
  // the qualifier into its own sentence.
  if (corrective) blocks.push(corrective);

  if (spans.length)
    blocks.push(`${EXCERPTS_HEADER}\n${spans.map(s => s.text).join('\n')}`);

  // The SOFT gate, surfaced as posture (§3b): a void synthesis must hedge.
  if (band === 'void')
    blocks.push('This connection is not settled by the document — write it as a holding-open (suggests, stages, leaves open), never as a proven claim.');

  if (target) blocks.push(`Write: ${target}.`);

  return [
    { role: 'system', content: SYSTEM_CURSOR },
    { role: 'user',   content: blocks.filter(Boolean).join('\n\n') },
  ];
};

// The chat (no-doc) path: a chat model wants turns as turns, so the recent verbatim
// window rides as real {role,content} message history and the surfed recap folds into
// the system message (docs/session-fold.md).
export const buildChatMessages = ({ question, history = [], notes = '', free = false, now = null } = {}) => {
  const base   = free ? SYSTEM_FREE : SYSTEM_CHAT;
  const moment = currentMomentLine(now);
  const withMoment = moment ? `${base}\n\n${moment}` : base;
  const system = notes
    ? `${withMoment}\n\nNotes about our conversation before this:\n${notes}`
    : withMoment;
  return [
    { role: 'system', content: system },
    ...history,
    { role: 'user',   content: question },
  ];
};
