// EO — one group of the turn's fold (split from turn/stages.js, 2026-07 compliance
// pass: "no file over ~250 lines" / "no 760-line orchestrator", docs/architecture.md).
// READ: route → expect → converse → retrieve → inquire.
// The methods are VERBATIM from stages.js; stages.js assembles the groups back
// into the one named-stage map the pipeline walks. Same holon, same seams.
import { answerMathAsync } from '../enactor/answer/index.js';
import { answerOverTables } from '../rooms/data/index.js';
import { retrieveHybrid, reserveBySource, pickRetrievalEmbedder, retrieveStructural, retrieveNetwork, queryTouchesDoc, querySubjectTerms, dropReferenceChrome, retrieveLexical } from '../surfer/retrieve/index.js';
import { parseText } from '../perceiver/parse/index.js';
import { think, worthSayingAloud, inferGenders } from '../weave/write/index.js';
import { namedReferents, figureSurface } from '../perceiver/index.js';
import { foldConversation, resolveQuery } from './converse/index.js';
import { taskOf, isMetaConversational } from './intent.js';
import { expectAnswer } from './expect.js';

export const STAGES = {

  // MATH is the one model-free short-circuit kept live. The DOCUMENT paths (confirm /
  // relation / who) and the smalltalk / metadata short-circuits stay retired: they shipped
  // confident, UNGROUNDED claims past the veto/fact-check layer — the load-bearing harm
  // being "when was this written?" answering a Project Gutenberg *release date* as if it
  // were the work's composition, tagged a green "answered from the document" with no flag.
  // Arithmetic is the opposite case: math.js (answer/math.js — mathjs in the browser, a
  // built-in evaluator offline) computes a PROVABLY correct value that does not depend on
  // any document, so there is nothing for grounding to adjudicate. `2 + 2 = 4` holds with
  // or without a file loaded, so it terminates here and never warms the model. The gate is
  // strict — only a question that reduces to a pure math expression matches; anything with
  // real words falls straight through to the grounded/chat turn below, byte-identical.
  //   else → grounded (doc) or chat (no doc).
  async route(ctx) {
    // The math short-circuit. Cheap sync gate first (isMathQuery, inside answerMathAsync),
    // so a non-math turn never awaits the evaluator or the CDN load — it returns null at once.
    const math = await answerMathAsync(ctx.question);
    if (math) return { ...ctx, ...math, mechanical: true, terminate: true };

    // The TABLE short-circuit — a quantitative / derived question over an imported table
    // (a filtered count, a currency-aware sum or average, a ranking, a share) computes
    // through math.js and terminates here the same way arithmetic does. The figure is
    // provably correct GIVEN the cells it names, and it carries an auditable, cell-cited
    // record (rooms/data/query.js), so there is nothing for the grounding layer to
    // adjudicate. The gate is strict: a SUBTEXT question over the same table ("what's the
    // tell?", "who is acme working for?", "rank by unspoken frustration") resolves no
    // column and returns null, falling through to the grounded reading below unchanged.
    const table = answerOverTables(ctx.question, ctx.sourceDocs);
    if (table) return { ...ctx, ...table, mechanical: true, terminate: true };

    // Read the TASK register (intent.js): the prompt register (summary guard) and the
    // token ceiling — the real length bound.
    //
    // The GROUNDING register (the UI's Grounded / Free form / Auto chip, ctx.grounding)
    // chooses the route here. 'grounded' forces the document register even with no doc
    // (the downstream strict refusal answers the absence); 'free' forces ungrounded chat,
    // ignoring the document entirely; 'auto' (the default) keeps the original behaviour —
    // a document grounds the turn, its absence falls to chat.
    const taskReg = taskOf(ctx.question);
    // An explicit budget from the caller (the reader's long-form lane, LONGFORM_MAX_TOKENS) wins
    // over the per-task default so "write me an essay …" can develop past the pointed-answer cap.
    const reg = ctx.maxTokens ? { ...taskReg, maxTokens: ctx.maxTokens } : taskReg;
    // The META-CONVERSATIONAL register (intent.js): a question ABOUT the conversation.
    // Orthogonal to the route and task — it rides alongside. The grounded prompt now feeds
    // the full both-role session fold on every turn; this flag only reframes it (subject to
    // reason over vs. context to answer the latest question against — the `prompt` stage).
    const meta = isMetaConversational(ctx.question);
    const grounding = ctx.grounding || 'auto';
    if (grounding === 'free')     return { ...ctx, route: 'chat',     ...reg, meta };
    if (grounding === 'grounded') return { ...ctx, route: 'grounded', ...reg, meta };
    if (ctx.doc) return { ...ctx, route: 'grounded', ...reg, meta };
    return { ...ctx, route: 'chat', ...reg, meta };
  },

  // The expectation — the question read as a PREDICTION of its own answer (turn/expect.js).
  // The shape the answer must take to count, and with what precision: what the revise loop
  // error-corrects toward and the veto battery flags when uncorrected. Pure, needs only the
  // question; OPEN (precision 0, no gate) on every question that does not type its answer
  // sharply, so the default turn is byte-identical. Skipped after a mechanical short-circuit
  // (those terminate at `route` and never reach here).
  async expect(ctx) {
    return { ...ctx, expectation: expectAnswer(ctx.question) };
  },

  // The session fold — the conversation's own two registers, mirroring the document
  // (docs/session-fold.md). Runs for both grounded and chat turns, independent of the
  // document; the mechanical short-circuits terminate at `route` and never reach it.
  // The recent turns ride verbatim; everything older is surfed into a recap.
  async converse(ctx) {
    const conv = foldConversation(ctx.history || []);
    return {
      ...ctx,
      conversation:   { notes: conv.notes, pastTurns: conv.pastTurns },
      recentMessages: conv.recentMessages,
      lastReply:      conv.lastReply,
      convStats:      conv.stats,
    };
  },

  // Hybrid retrieval. Skipped entirely when there's no document — chat mode
  // simply has nothing to retrieve.
  async retrieve(ctx) {
    // Free-form turns ignore the document; with no document there is nothing to
    // retrieve. Either way the prompt stage builds an ungrounded chat message.
    if (!ctx.doc || ctx.grounding === 'free') return { ...ctx, spans: [] };
    // Read MEANING for the semantic channel when a meaning organ is live; else fall
    // back to the hash organ. ctx.embedder (hash) is unchanged for every other stage —
    // only retrieval's semantic vectors are upgraded (turn/pipeline threads the organ).
    const re = pickRetrievalEmbedder(ctx);
    // Resolve a follow-up against the conversation BEFORE retrieval (§6), reading the turn
    // as an operator over the dialogue line (docs/operators.md, converse/dialogue-state.js).
    // A self-contained EVA passes through untouched; a NUL hold ("now?", "prove it", "huh?",
    // "find what I'm talking about") resolves to the OPEN INTENT it points at and the WARM
    // REFERENT, rather than retrieving on its own deictic words — the failure where "find
    // what I'm talking about" matched "Find a Song by Lyrics". A pronoun-led EVA ("how has
    // HE…") keeps its topic and binds the dangling subject to the cast. Only the user's
    // turns and the figures the conversation named feed this — never the talker's answers.
    //   This runs on EVERY path, the reference-by-reading flag notwithstanding. The read
    //   path still holds the SUBJECT (the fold's cast); this is the complementary NOMINATION
    //   channel that finds the EVIDENCE spans the stall points at.
    const query = resolveQuery(ctx.question, ctx.history);
    // A PATTERN-GRAIN task (summary / list — the whole read as one frame, the network of
    // members; turn/intent.js) reads the document's own STRUCTURE, not a point. The grain is
    // the principled gate: a Figure-grain task (a pointed `answer`, or an `explain` of one
    // thing) retrieves AT a location; a Pattern task reads ACROSS the whole. This replaces the
    // old `task !== 'answer'` proxy — explain is task≠answer but Figure-grain, so it now stays
    // pointed, which is what "why did X" wants. The two Pattern TERRAINS read differently:
    //   · Paradigm (summary) → the structural skeleton: opening, headings, spread, turning points.
    //   · Network  (list)    → the figure-bearing units: the members of the entity graph.
    // A query that NAMES a term the document spells stays lexical (queryTouchesDoc is true), so a
    // targeted whole-doc question — t6 "what are the 9 operators?" — finds the operators, untouched.
    if (ctx.grain === 'Pattern' && !queryTouchesDoc(ctx.doc, query)) {
      const network = ctx.terrain === 'Network';
      const whole = network ? retrieveNetwork(ctx.doc, 12) : retrieveStructural(ctx.doc, 12);
      if (whole.length) return { ...ctx, spans: whole, retrievalQuery: query, retrieval: network ? 'network' : 'structural' };
    }
    // Source activation (docs/source-activation.md): retrieve a wider pool, then — when the
    // scope is a composite that holds a freshly-fetched WEB source beside the loaded document —
    // reserve a slot for each activated web source's best span, so the findings the search
    // brought back actually reach the talker instead of being buried under a long local doc.
    // Gated to web-bearing composites; a single doc (or a doc-only composite) takes the plain
    // top-6, byte-identical to before.
    //
    // TOPIC-WEIGHTED RETRIEVAL (opt-in via ctx.topicPrior). Resolve the turn's SUBJECT — the doc
    // referents the (conversation-resolved) query names, widened by their graph neighbourhood — and
    // hand retrieveHybrid a prior that damps spans naming an OFF-topic referent by surface form only.
    // This is what keeps an "essay about dolphins" over a homonym composite (the animal page beside
    // a Miami-Dolphins page) from reserving the football span: its best "dolphin" match is damped
    // below the activation floor before reserveBySource runs, so the reservation never seats it. The
    // subject is the SAME signal the fold's `focus` falls back to (namedReferents of the question),
    // read in the projection's id-space so it aligns with each span's named referents. Fully guarded
    // and inert by default: no flag, or no subject resolved → topic stays null, retrieve byte-identical.
    let topic = null;
    if (ctx.topicPrior && ctx.doc) {
      try {
        const subjectIds = namedReferents(ctx.doc, query);
        if (subjectIds.length) {
          const neighbourhood = figureSurface(ctx.doc, subjectIds).figures.map((f) => f.id);
          const topicIds = new Set([...subjectIds, ...neighbourhood]);
          const namedRefsOf = (s) => { try { return namedReferents(ctx.doc, s.text || ''); } catch { return []; } };
          topic = { topicIds, namedRefsOf, floor: ctx.topicFloor ?? 0.25 };
        }
      } catch { topic = null; }   // a topic-frame fault must never break retrieval
    }
    const pool = await retrieveHybrid(ctx.doc, query, re, 18, topic);
    const isWebSource = (d) => !!(d && (d.web || d.sourceKind === 'web-source'));
    const hasWebSource = ctx.doc?.isComposite && typeof ctx.doc.origin === 'function' &&
      pool.some(s => isWebSource(ctx.doc.origin(s.idx)?.doc));
    const spans = hasWebSource
      ? reserveBySource(pool, ctx.doc.origin, isWebSource, { k: 6 })
      : pool.slice(0, 6);

    // STRUCTURAL FALLBACK — read the document's own skeleton when a BROAD ask made no real
    // contact with the page. The early Pattern-grain gate above catches the clean meta-query
    // ("summarize this"); this catches the COLLOQUIAL one the grain missed and the incidental-
    // term trap `queryTouchesDoc` could not see. The observed failure: "whats the news today?"
    // over an NPR homepage retrieved the site title (dropped as nav chrome) and a bare "news"
    // nav label — the only lexical contact — so the talker, shown a stray word, said it found
    // no news while every actual story went unread. A broad ask names NO subject (`querySubject-
    // Terms` is empty once the asking/scope and content-demand words are removed): "whats the
    // news", "what's here", "what's happening", "tell me about this". When such a query's best
    // REAL (non-chrome) span is weak — below the floor, i.e. the query barely touched the page —
    // read the structural skeleton (opening · headings · spread · turning points), or the member
    // network for a list, so the question engages the document instead of a fragment. Scoped to
    // the broad, weak case: a pointed question (any named subject) and a broad ask that matched
    // strong content are both byte-identical, as is a subject the document genuinely lacks.
    const STRUCTURAL_FALLBACK_FLOOR = 0.5;
    const bestScore = dropReferenceChrome(spans).reduce((m, s) => Math.max(m, s.score || 0), 0);
    if (querySubjectTerms(query).length === 0 && bestScore < STRUCTURAL_FALLBACK_FLOOR) {
      const network = ctx.terrain === 'Network';
      const whole = network ? retrieveNetwork(ctx.doc, 12) : retrieveStructural(ctx.doc, 12);
      if (whole.length) return { ...ctx, spans: whole, retrievalQuery: query, retrieval: network ? 'network' : 'structural' };
    }

    if (spans.length === 0) {
      // NO CONTACT — the reading made no lexical contact with the document at all. A reader whose
      // whole promise is "answers only from your recorded sources — nothing enters an answer
      // unrecorded" must not free-associate an essay from outside knowledge here (the observed
      // "wild" → orca-essay drift: the model itself narrated "I didn't find any information ... in
      // the text, but from general knowledge …" and then wrote four paragraphs anyway). So stay on
      // the GROUNDED route and answer the typed absence ("the document doesn't cover this") — and,
      // in web-auto, propose the gap search that fetches real, recordable sources. This unifies the
      // auto default with strict-grounded mode: leaving the grounding chip on its default is no
      // longer a licence to invent. Only an explicit 'free' turn (the user asked to ignore the
      // document) — or a doc-less turn — still falls through to ungrounded chat. A subject the
      // corpus genuinely lacks was already handled this way in strict mode; auto now matches.
      if (ctx.grounding !== 'free' && ctx.doc) return { ...ctx, spans: [], retrievalQuery: query };
      return { ...ctx, spans: [], route: 'chat', retrievalQuery: query };
    }
    return { ...ctx, spans, retrievalQuery: query };
  },

  // Self-directed inquiry (write/think.js). Before the talker speaks, read what has been
  // retrieved, THINK over it, and if a figure stays open — one the spans keep mentioning but
  // that never acts — read another pass ON THAT OWN QUESTION and fold the results in as
  // citable spans. The engine chooses what to read next by what it found unresolved, rather
  // than answering only the user's literal query (idle.js's voids-are-the-fuel, run forward).
  //   Gated by ctx.inquire (default off → byte-identical: the stage returns the context
  //   untouched). Scoped to the pointed `answer` task — a summary's connective gaps are not
  //   voids to chase. Embedder-free (retrieveLexical), and every added span carries a real
  //   document index, so the inquiry's reading is bound and cited exactly like the first pass.
  async inquire(ctx) {
    if (!ctx.inquire || !ctx.doc || !ctx.spans?.length || (ctx.task && ctx.task !== 'answer')) return ctx;
    const seen = new Set(ctx.spans.map((s) => s.idx));
    const added = [];
    const asked = [];
    const MAX_STEPS = 2;                                       // a couple of follow-up reads, never a spin
    for (let step = 0; step < MAX_STEPS; step++) {
      const spans = [...ctx.spans, ...added];
      const reading = parseText(spans.map((s) => s.text).join(' '), { docId: 'inquiry', genderCoref: true });
      const thought = think(reading, { genders: inferGenders(reading) });
      const ask = worthSayingAloud(thought, { limit: 1 })[0];
      if (!ask) break;                                        // nothing stays open → done
      const more = retrieveLexical(ctx.doc, ask.question, 4).filter((s) => !seen.has(s.idx));
      if (!more.length) { asked.push({ q: ask.question, read: 0 }); break; }   // source silent → stop
      for (const s of more) { seen.add(s.idx); added.push({ ...s, via: 'inquire' }); }
      asked.push({ q: ask.question, read: more.length });
    }
    if (!added.length) return ctx;                            // no fresh reading → byte-identical
    return { ...ctx, spans: [...ctx.spans, ...added], inquiry: { asked } };
  },
};
