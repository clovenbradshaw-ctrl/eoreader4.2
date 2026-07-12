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
// Structure stays in the grounder: in selection, in order, and in the
// edge-grounding veto on the way back. `serializeNotes` / the substrate stay
// alive — they feed the grounder and the veto — they just never reach the talker.
//
// THE PROMPT IS A SITE (docs/prompt-as-site.md). Every block the talker is handed is
// a BAND with a declared Site terrain, and the catalog of bands lives in
// model/bands.js — nine terrains, closed by derivation, instead of ad-hoc block
// names. The three builders below are PROJECTIONS over that catalog (projectBands):
// read-time, pure, byte-identical to the hand-rolled assembly they replaced
// (tests/prompt-golden.test.js). The system message carries the stable boundary +
// voice (prefix cache holds); the per-turn user block carries the lines, the
// conversation so far, the question, and the absence clause last, where a small
// model attends hardest.

import {
  GROUNDED_BANDS, CURSOR_BANDS, CHAT_BANDS,
  groundedView, cursorView, chatView, projectBands,
} from './bands.js';

// The band literals and frame constants live with the catalog (model/bands.js);
// re-exported here so every existing import site — and the model/index.js barrel —
// keeps its surface byte-for-byte.
export {
  TERRAIN_GRAIN,
  EXCERPTS_HEADER, DEFAULT_BUDGET, SUMMARY_GUARD,
  SYSTEM_GROUND, SYSTEM_CHAT, SYSTEM_GROUND_STRICT, SYSTEM_FREE, SYSTEM_CURSOR,
  LONGFORM_DIRECTIVE, currentMomentLine, orderSpansForFrame,
  projectBands, projectGroundedBands, projectCursorBands, projectChatBands,
  GROUNDED_BANDS, CURSOR_BANDS, CHAT_BANDS, groundedView, cursorView, chatView,
} from './bands.js';

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

// Build the grounded user turn as the SUBJECTIVE FRAME (§1–§3), as a PROJECTION over
// the band catalog (model/bands.js GROUNDED_BANDS — each band's rationale and Site
// terrain live there, with the literals). One channel — the verbatim lines, the only
// thing the reader read — framed as a reading, with the question and the absence
// clause LAST where a small model attends hardest. No arrows (§2): relational
// structure rode into span selection and order upstream. No recognition (§3):
// orientation is filename · type · length, never a title or author. The conversation
// rides in the same reader's register, the USER's thread only — the talker's prior
// answers stay withheld (the poisoning channel), and an unbound one never folds in (§7).
//
// THE META-CONVERSATIONAL EXCEPTION (`meta:true`, turn/intent.js). When the question is
// ABOUT the conversation ("which topic we discussed is in France?"), the prior turns are
// its SUBJECT, not a premise it might anchor a wrong fact to — so the full both-role thread
// is fed and framed to be reasoned over, not skipped. The asymmetry is the point: the
// firewall guards a prior ANSWER becoming a premise; here a prior topic is the question.
//
// `probe` is the read-only research instrument (docs/prompt-as-site.md, Tier 2):
// null on every production turn → byte-identical output, pinned by the golden test.
export const buildGroundedMessages = (args = {}) => {
  const bands = projectBands(GROUNDED_BANDS, groundedView(args), args.probe ?? null);
  return [
    { role: 'system', content: bands.filter(b => b.role === 'system').map(b => b.text).join('\n\n') },
    { role: 'user',   content: bands.filter(b => b.role === 'user').map(b => b.text).join('\n\n') },
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
//
// buildCursorMessages — assemble the prompt for ONE cell from the cursor's slots, as
// a projection over CURSOR_BANDS. Every argument Site arrives as its INTEGRAL (full
// standing name, surface form); the open (void) attributes arrive named as unsettled.
// A void-resolved beat (§3b) carries a HEDGE instruction so the renderer withholds
// rather than overclaims. The returned shape is the {system,user} pair
// model.phrase(messages, opts) consumes.
export const buildCursorMessages = (args = {}) => {
  const bands = projectBands(CURSOR_BANDS, cursorView(args), args.probe ?? null);
  return [
    { role: 'system', content: bands.filter(b => b.role === 'system').map(b => b.text).join('\n\n') },
    { role: 'user',   content: bands.filter(b => b.role === 'user').map(b => b.text).filter(Boolean).join('\n\n') },
  ];
};

// The chat (no-doc) path: a chat model wants turns as turns, so the recent verbatim
// window rides as real {role,content} message history and the surfed recap folds into
// the system message (docs/session-fold.md). The system side is a projection over
// CHAT_BANDS; the history splices between it and the live question.
export const buildChatMessages = (args = {}) => {
  const { history = [] } = args;
  const bands = projectBands(CHAT_BANDS, chatView(args), args.probe ?? null);
  return [
    { role: 'system', content: bands.filter(b => b.role === 'system').map(b => b.text).join('\n\n') },
    ...history,
    { role: 'user',   content: bands.find(b => b.key === 'question')?.text ?? '' },
  ];
};
