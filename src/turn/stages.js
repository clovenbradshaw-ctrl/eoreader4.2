// EO: SEG·INS·EVA(Field,Network → Entity,Lens,Network, Dissecting,Making,Binding) — the named pipeline stages
// The named, pure stages of a turn. Each takes a context, returns a context.
// The pipeline composes them; a stage returning {terminate:true} short-
// circuits the rest.
//
// Stages are tolerant of a missing document: with no doc the pipeline
// degrades to ungrounded chat. Mechanical math still short-circuits.
//
// Vetoes are flag-only — they never substitute the model's answer.
// The user sees what the model actually said, with a flag pinned to it.

import { answerVoid, answerMathAsync } from '../enactor/answer/index.js';
import { retrieveHybrid, reserveBySource, pickRetrievalEmbedder, selectExcerpts, retrieveStructural, retrieveNetwork, queryTouchesDoc, querySubjectTerms, dropReferenceChrome, retrieveLexical } from '../surfer/retrieve/index.js';
import { parseText } from '../perceiver/parse/index.js';
import { think, worthSayingAloud, inferGenders } from '../weave/write/index.js';
import { foldNote }         from '../surfer/fold/index.js';
import { surfFold, centroidBasis, projectUnits, structuralActivations, siteTerrainAt, trajectory, threadBasis } from '../surfer/index.js';
import { arcGravity, arcLines } from '../weave/write/gravity.js';
import { namedReferents, referentialConfidence, siteIndices, serializeEOT, figureSurface } from '../perceiver/index.js';
import { foldConversation, resolveQuery, groundedThread, referenceTarget } from './converse/index.js';
import { taskOf, TASK_MAX_TOKENS, isMetaConversational } from './intent.js';
import { expectAnswer, answerConstraintErrors, answerPredictionError, needsReferent } from './expect.js';
import { answerFormError } from './shape.js';
import { rereadOnUnsettled } from './reread.js';
import { buildGroundedMessages, buildChatMessages, orientationLine } from '../model/index.js';
import { bindCitations, renderBound } from '../enactor/ground/index.js';
import { runVetoes, isUnbound, isAbstention, classifyProvenance } from '../enactor/ground/index.js';
import { canGroundedSpeak, groundedSpeak, RULES_REV } from '../organs/out/speech/index.js';
import { projectGraph, VERDICTS } from '../core/index.js';
import { answerabilityGate } from '../weave/longgen/answerable.js';
import { walkReasoning } from '../surfer/reason/index.js';
import { factCheck, auditPropositions } from '../enactor/factcheck/index.js';
import { streamParagraphs } from '../weave/write/index.js';
import { streamPhrase }     from '../model/index.js';
import { buildConceptTokenMap } from '../weave/write/concept-tokens.js';
import { mountPersonality, defaultPantheonBank, defaultStanceBanks, defaultSiteBank, stanceFamily, resolveOverlap, dialMultipliers } from '../weave/write/voice.js';

// Weave the mind's recalled lines into the prompt as labelled BACKGROUND — only when
// the user has the Mind chip in weave mode (ctx.mindSpans present). The memory is
// offered for context and explicitly marked as NOT the document: grounded claims are
// still cited to the document's spans, never to these. Appended to the final (user)
// Scrub the meaning-graph lines at the membrane (the surface discipline: no codes or ids ever
// reach the talker). A COMPOSITE doc namespaces its entity ids (`web-<hash>␟label`); when the
// label map misses, structureSurface falls back to that raw id, leaking it into an arrow. Strip
// the `id␟` namespacing to the human label, drop the unit-separator, and drop any line that
// still carries an opaque `kind-<hex>` id with no readable label behind it.
const SEP = '␟';   // the composite unit separator
export const scrubGraphLines = (lines = []) => lines
  .map(l => String(l)
    .replace(new RegExp(`[a-z]+-[0-9a-f]{6,}${SEP}`, 'gi'), '')  // drop the composite id prefix before the label
    .replace(new RegExp(SEP, 'g'), ' ')
    .replace(/\s+/g, ' ').trim())
  .filter(l => l && !/[a-z]+-[0-9a-f]{6,}/i.test(l));            // any opaque id left → no clean label, drop the line

// message so it rides inside the window without disturbing the grounded/chat assembly.
// Guarded entirely by mindSpans — every default turn skips it, byte-identical.
const weaveMemory = (messages, mindSpans) => {
  if (!messages?.length || !mindSpans?.length) return messages;
  const lines = mindSpans.slice(0, 5).map((s) => {
    const who = s.book?.authors ? ` — ${String(s.book.authors).split(';')[0].trim()}` : '';
    const line = String(s.text || '').replace(/\s+/g, ' ').trim();
    return `- “${line}” (${s.book?.title || 'unknown'}${who})`;
  }).join('\n');
  const block = `\n\n[From memory — eoreader’s read corpus, offered as background only. ` +
    `These are not the open document; cite the document for any grounded claim.]\n${lines}`;
  const out = messages.map((m) => ({ ...m }));
  const last = out.length - 1;
  out[last] = { ...out[last], content: `${out[last].content}${block}` };
  return out;
};

// The Significance column's opts for the fold's surf. Returns {} — the byte-identical
// default — unless a MEANING-measuring embedder and a centroid prior are both present.
// The async embedding work happens HERE (the fold stage is async); the surf itself
// stays a synchronous pure function fed pre-computed activations. The dominant REAL
// lens (one whose Born weight beat the spectral null) conditions the surf; absent any
// real lens, the column still rides as a report (atmosphere + lenses) with the peak
// unchanged. Degrades to {} on any embedding fault — a flaky meaning organ must never
// crash the fold.
const significanceOpts = async (ctx, anchor) => {
  if (!ctx.doc) return {};
  const emb = ctx.geometricEmbedder;
  // THE MEANING PATH (the upgrade). A live meaning-measuring embedder AND a centroid prior
  // → the embedding column: the full atmosphere/paradigm/stance read, ridden forward inside
  // the dominant lens (lens-conditioned arrest). This is the richest reading and unchanged.
  if (ctx.centroids && emb?.measuresMeaning && typeof ctx.doc.sentenceEmbeddings === 'function') {
    const basis = centroidBasis(ctx.centroids);
    if (basis) {
      try {
        const vectors = await ctx.doc.sentenceEmbeddings(emb);
        const activations = projectUnits(vectors, basis);
        const report = surfFold(ctx.doc, anchor, { activations, prior: basis, lensReport: true });
        const dom = report.lenses?.find(l => l.real)?.lens ?? report.lenses?.[0]?.lens ?? null;
        return { activations, prior: basis, lensReport: true, atmosphere: true, paradigm: true, stance: true,
                 alpha: ctx.alpha ?? 0.05, ...(dom ? { lens: dom } : {}) };
      } catch { /* fall through to the structural default — never a dark fold */ }
    }
  }
  // THE STRUCTURAL DEFAULT (the embedder-free column, surfing-next.md §2). ρ from the
  // OPERATOR PROFILES (structure-basis.js) — read off the log, no model — so the column
  // (lenses, lensEntropy, stance) lights up on EVERY turn, not only when a meaning model
  // is loaded. Conservative by construction: the dominant lens is NOT passed, so the surf
  // is not lens-conditioned and `stops`/`peak` (the fields the answer rides) stay
  // byte-identical to the no-significance surf. Lens-conditioned arrest on this basis is
  // the follow-on, bench-validated before it changes the reading. The stance it computes
  // is what the veto battery now reads (the surfer's own confabulation guard, §3).
  try {
    const { activations, signs } = structuralActivations(ctx.doc);
    if (!activations.length || !activations.some(v => v.some(x => x > 0))) return {};
    // `alpha` is deliberately NOT passed: it would flip the cursor axis from the median
    // rule to the derived VOID boundary (surf.js `useBoundary`), changing which cursors
    // arrest — a reading change for the bench-gated follow-on, not here. The significance
    // pass falls back to its own internal 0.05 for the lens/stance nulls, so the column is
    // fully measured while the arrest stays byte-identical.
    return { activations, signs, lensReport: true, stance: true };
  } catch { return {}; }
};

export const stages = {

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
    // Orthogonal to the route and task — it rides alongside, opening the assistant side of
    // the session fold to the grounded prompt (the `prompt` stage reads it). A chat turn
    // already carries the full both-role history, so this only changes the grounded path.
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
      // Strict grounded mode never falls through to free generation: it stays on the
      // grounded route and answers the absence ("the document doesn't cover this")
      // rather than inventing from outside knowledge.
      if (ctx.grounding === 'grounded') return { ...ctx, spans: [], retrievalQuery: query };
      // Auto / default: doc loaded but nothing matches — fall through to ungrounded chat.
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

  // Fold the spans into a single note the model can read — the reading. With a doc
  // this is the consciousness: existence + structure + significance. The cursor is no
  // longer blindly the top lexical hit — the SURFER (docs/surfing-the-fold.md) is
  // seeded at that anchor and steps down the Bayesian-surprise gradient to the PEAK,
  // where the significance reading is taken. Any high-significance line retrieval
  // missed is folded in as a citable span (via:'surf', its index real), so it is both
  // read by the consciousness and bindable.
  async fold(ctx) {
    const folded = await stages.foldReading(ctx);
    // THE ACTIVE-INFERENCE RE-READ (surfing-next.md §3, opt-in via ctx.reread). When the surf
    // could not SETTLE on a figure at the peak (the stance-reserve guard) on a pointed
    // question, read more of the document on the figure the reading circled and fold AGAIN
    // from the wider evidence — `inquire`'s loop brought in-turn, bounded to one extra pass.
    // Inert unless the caller opts in, so the default turn is byte-identical to foldReading.
    if (!ctx.reread || !folded.surf) return folded;
    const re = pickRetrievalEmbedder(ctx);
    const widened = await rereadOnUnsettled({
      doc: ctx.doc, spans: folded.spans, surf: folded.surf, task: ctx.task,
      referential: folded.referential,        // the diffuse-coref trigger (the live one on the default path)
      query: ctx.retrievalQuery || ctx.question,
      retrieve: (q, k) => retrieveHybrid(ctx.doc, q, re, k),
    });
    if (!widened.added) return folded;
    const refolded = await stages.foldReading({ ...ctx, spans: widened.spans });
    return { ...refolded, rereadInfo: { added: widened.added, asked: widened.asked } };
  },

  // The reading proper — fold the spans into the note (the surf + significance column). Split
  // out from `fold` so the re-read can run it twice: once on the retrieved spans, once on the
  // widened set. Byte-identical to the former fold body.
  async foldReading(ctx) {
    if (!ctx.spans?.length) return { ...ctx, note: null };
    // Reference by reading (RULES_REV, docs/reference-by-reading.md §2–§3). The turn's
    // DEF target is read off the CONVERSATION CAST — the warmest figure the conversation
    // holds, with retrieval nominating a document referent beside it — and the document
    // surf is seeded at that referent's LOCUS (localeOf), the one hop from the warm
    // referent to where the document establishes it. So "his name" lands on the line
    // that NAMES the figure, which the word "name" never reaches by similarity. Flag
    // off: the anchor is the top retrieval hit and the focus is the named referents of
    // the question, exactly as before — byte-identical, the read path is dark.
    const refTarget0 = RULES_REV ? referenceTarget(ctx.doc, ctx.history, ctx.question, ctx.spans) : null;
    // CAST CYCLE — EVA (cast.js, docs/source-activation.md). When a session cast is threaded,
    // let it evaluate which referent THIS turn concerns: the live read wins when it resolves;
    // only a NULL live read carries forward a referent the conversation has SETTLED and is still
    // holding — so a thin follow-up stays on the thing being discussed instead of the anchor
    // degrading to the loudest retrieval hit. Null cast → refTarget0 unchanged (byte-identical).
    const refTarget = ctx.cast
      ? ctx.cast.evaluate({ doc: ctx.doc, history: ctx.history, question: ctx.question, refTarget: refTarget0 })
      : refTarget0;
    const anchor = (refTarget?.locale ?? ctx.spans[0]?.idx) ?? 0;
    // THE SIGNIFICANCE COLUMN (significance-column spec). When a meaning-measuring
    // embedder AND a centroid prior are present, the surf rides the full column: it
    // registers the document's interpretive Atmosphere, decomposes its Lenses, and
    // rides forward INSIDE the dominant reading (lens-conditioning) so the peak lands on
    // that reading's surprise rather than the document's loudest overall. Inert under
    // the hash embedder (a cosine between spelling-space and MiniLM-space measures
    // nothing — the same firewall the geometric classifier runs), so `sigOpts` is `{}`
    // there and the surf is byte-identical to today. This is the column improving the
    // chat only where it can honestly measure, and staying dark where it cannot.
    const sigOpts = await significanceOpts(ctx, anchor);
    const surf   = ctx.doc ? surfFold(ctx.doc, anchor, sigOpts) : null;

    let spans = ctx.spans;
    if (surf) {
      const units = ctx.doc.units || ctx.doc.sentences || [];
      const have  = new Set(spans.map(s => s.idx));
      const surfed = surf.stops
        .filter(idx => !have.has(idx) && units[idx] != null)
        .map(idx => ({ idx, text: units[idx], score: 0, via: 'surf' }));
      if (surfed.length) spans = [...spans, ...surfed];
    }

    const cursor = surf ? surf.peak : anchor;
    // The referents the message named (if any). When it names one, the fold centres
    // the structured reading on that referent — everything tied to it, coref
    // collapsed — instead of the figures the surfed window happened to cross.
    //   Reference by reading (RULES_REV): the referent is READ off the conversation
    //   cast (refTarget), so a pronoun / definite description / correction centres the
    //   reading on the figure it refers to, not only one the question names by surface
    //   form. Flag off: the question's named referents, exactly as before.
    const focus  = refTarget ? [refTarget.id] : (ctx.doc ? namedReferents(ctx.doc, ctx.question) : []);
    // The RICH NOTES path rides behind RULES_REV (rich-notes §6): with the flag off the
    // fold is byte-identical (flat arrows + significance summary); with it on the note
    // is projected through the reading substrate (settled · held-open · turns), and the
    // surfer's located RECs feed the turns group, so the Significance face the flat
    // notes drop reaches the talker.
    const note   = foldNote(spans, { doc: ctx.doc, cursor, focus, surf: RULES_REV ? surf : null, grouped: RULES_REV });
    // Pattern: if the basis itself was defeated (a measured Paradigm REC), the note
    // records a REFRAME, not a deeper read — append-only, carrying its surprise-delta
    // (the helix turning: REC re-admits what counts as ground). Off the dark path
    // (no surf.paradigmRec) the note is untouched.
    if (note && surf?.paradigmRec) note.reframed = surf.paradigmRec;
    // The reader's confidence about WHO this passage concerns — read off the
    // grounded coref posterior at the cursor (the same field the fold rode). No
    // longer measured and discarded: it rides the turn, and a diffuse field
    // (no dominant referent) becomes a flag in the veto battery.
    const referential = ctx.doc?.corefField
      ? referentialConfidence(ctx.doc.corefField.fieldGrounded(cursor))
      : null;
    // CAST CYCLE — REC (cast.js). Commit this turn's target as SETTLED only when the fold
    // CONCENTRATED (referential.concentrated), so the carried state holds only referents a
    // reading actually landed on; a diffuse, wandering fold commits nothing.
    const cast = ctx.cast
      ? ctx.cast.reconcile({ id: refTarget?.id ?? null, label: refTarget?.label ?? null,
                             locale: refTarget?.locale ?? null, concentrated: referential?.concentrated === true })
      : null;
    return { ...ctx, spans, note, surf, focus, referential, refTarget, castStep: cast };
  },

  // The PREDICTION — the engine's own grounded generation, before the talker speaks
  // (docs/answer-expectation.md). The mechanical writer (src/write `think`) says, from the
  // graph alone, what it would answer; that draft is the prior the fluent answer is checked
  // against. We read only its CONTENT — the named figures the grounded reading centers on —
  // not its surface: the mechanical SURFACE is corpus-dependent (learned conventions, often
  // telegraphic), but WHICH figures it is about is read straight off the log, so it is a
  // reliable content prediction even when the prose is clumsy. A confident grounded reading
  // that centers on a named figure the talker then drops is an under-answer (the mirror of a
  // confabulation). Fully guarded: a clumsy predictor must never break the answer.
  async predict(ctx) {
    if (!ctx.doc || !ctx.spans?.length) return ctx;
    try {
      const cursor = ctx.surf?.peak ?? ctx.spans[0]?.idx ?? 0;
      const t = think(ctx.doc, { cursor, genders: ctx.genders || {} });
      const draft = String(t?.voiced || '');
      const labelOf = (id) => ctx.doc.admission?.labelOf?.(id) || id;
      const entities = [...new Set(namedReferents(ctx.doc, draft).map(labelOf))];
      // the figure the grounded reading centers on: the fold's focus when it resolved one,
      // else the strongest figure the mechanical draft named.
      const focusId = ctx.focus?.[0] ?? null;
      const primaryName = focusId != null ? labelOf(focusId) : (entities[0] || null);
      const confident = !!ctx.referential?.concentrated;
      const prediction = { draft, entities, primaryName, confident };

      // The FORM prediction, from the sample-answer library (turn/shape.js): read the wanted
      // shape off the question's nearest sample answers. Embedder-gated — a cosine is meaning
      // only under a meaning-measuring embedder — and inert without a threaded library, so the
      // default turn is byte-identical. The question's embedding rides to `veto`, where the
      // talker's answer is scored against this shape.
      let shapeTarget = null, shapeQueryVec = null;
      if (ctx.shapeLibrary) {
        const emb = pickRetrievalEmbedder(ctx);
        if (emb?.measuresMeaning && emb.isWarm?.()) {
          try {
            shapeQueryVec = await emb.embed(ctx.question);
            shapeTarget = ctx.shapeLibrary.selectForQuestion(shapeQueryVec);
          } catch { /* a clumsy predictor must never break the answer */ }
        }
      }
      return { ...ctx, prediction, shapeTarget, shapeQueryVec };
    } catch { return ctx; }
  },

  // The answerability gate — is there an answer to give, or is the field VOID?
  // (docs/answerability.md) Before the talker is warmed, measure whether the field
  // where the question landed holds any structure. When it does not — no referent
  // resolves, no retrieval hit is strong, and the reach is measurably flat — the turn
  // answers the typed absence directly (a DEF to VOID) instead of handing the talker
  // an empty field to invent from. A MEASUREMENT, not a refusal: the field is the
  // witness, the noise null is the verdict (read/answerable.js). Conservative by
  // construction — a short or unmeasurable field is never voided; the talker speaks.
  // Skipped without a document (pure chat has nothing to be void about); the
  // mechanical short-circuits terminate at `route` and never reach it.
  //
  // Only the default 'answer' task is gated — the SPECIFIC question that points at a
  // location on the page, where retrieval finding nothing IS the absence. A
  // whole-document task (summary / list / explain) operates over the document as a
  // whole, so retrieval-weakness is not evidence of a void — "summarize this" must
  // never come back "the document does not say." Those reach the talker; the unbound
  // and edge-grounding vetoes catch an invented claim on the way back.
  async answerable(ctx) {
    // A META-CONVERSATIONAL turn is exempt like a whole-document task: its answer draws on
    // the conversation as well as the page, so weak document retrieval is not evidence of a
    // void — "of the topics we discussed, which is in France?" must not come back "the
    // document does not say."
    if (!ctx.doc || ctx.meta || (ctx.task && ctx.task !== 'answer')) return ctx;
    const v = answerVoid(ctx.doc, ctx.question, ctx.spans || [], { embedder: ctx.embedder });
    if (!v) return ctx;
    // P0.2: the void no longer auto-answers and terminates. The talker speaks for
    // every turn; the measured void RIDES as terrain context (`voidMeasure`) so the
    // diagonal guard (P1) can catch a specific claim asserted where the reading typed
    // an absence — a figure at a void — instead of the void silently pre-empting it.
    // The typed absence PROSE rides too (`voidText`): if the talker's answer comes back
    // with no witness at all, the `absence` stage speaks it (the honesty seam) — absence
    // is an available thing to assert, not just a terrain annotation.
    return { ...ctx, voidMeasure: v.void, voidText: v.text };
  },

  // Build messages. Grounded when we have spans; plain chat when we don't.
  //
  // The talker is handed the document's own reading — the fold's arrows (`ctx.note`) —
  // BESIDE the verbatim excerpts. The arrows are grounding it speaks FROM on the way out
  // and is held TO on the way back (the edge-grounding veto checks the same arrows). Hand
  // a small model spans alone and it fills the gaps between sentences with probable tokens
  // and invents a place; discarding the computed fold here was the generation-side cause
  // of that hallucination (docs/prompt-assembly.md). So the note enters the window again.
  //
  // The conversation carried into a grounded turn is the USER's side only — the thread of
  // what was asked — never the talker's prior answers. That keeps follow-up continuity
  // ("now?", "answer my first question") while withholding the one channel that poisons:
  // a small model re-reading its own earlier (maybe wrong) reply and anchoring on it. The
  // talker's output is a weaker witness (converse/provenance.js); on this path it is not
  // carried at all. The document note (the fold's arrows) rides as before.
  // THE ANSWERABILITY GATE (longgen/answerable.js, spec-planner.md §3), in FRONT of the
  // talker. The void gate strips an invented NAME or NUMBER on the way back, but it cannot
  // catch an invented SHAPE: a corpus about Errol Musk handed "write a long essay about
  // Grok" produced two sections inventing a Robert E. Howard novel, every word grounded in
  // nothing, the model even narrating its own void ("I don't have any information about
  // Grok from the reading") before confabulating anyway. The lie is not at the token grain;
  // it is the gap between what the question asked for and what the ground can give. So
  // before any model call, type the question and test the ground against the type, and test
  // that the corpus knows the subjects the question NAMES. When neither holds the walk does
  // not run: the turn terminates with the refusal atom — the honest one-sentence answer,
  // grounded on what the corpus DOES hold, short by construction.
  //
  // Runs after `fold` (ctx.spans and the graph are ready) and only on a GROUNDED route — a
  // pure chat turn has no corpus to be unanswerable against. The lenient whole-document
  // types (summary / list / explain) still pass groundSupplies; the named-subject test is
  // what catches an essay about a figure the corpus never mentions.
  async gate(ctx) {
    if (ctx.route !== 'grounded' || ctx.meta) return ctx;
    // Only gate a question that ENGAGES the corpus. A question that makes no lexical
    // contact with the document ("What is 2 + 2?" with a doc loaded) is a chat question
    // that happens to have a document open, not an unanswerable grounded request — it
    // reaches the talker, where the void gate still holds it on the way back. The gate is
    // for a question that points AT the corpus and asks for what the corpus does not hold
    // (the Grok essay against an Errol Musk page), not for one that points away from it.
    if (!queryTouchesDoc(ctx.doc, ctx.question)) return ctx;
    const graph = ctx.doc?.log ? projectGraph(ctx.doc.log) : null;
    const ground = (ctx.spans || []).map((s, i) => ({ idx: s.idx ?? i, text: s.text, score: s.score }));
    const g = answerabilityGate({ question: ctx.question, ground, graph });
    if (g.licensed) return ctx;
    const r = g.refusal;
    // The refusal atom IS the answer — typed decline, grounded on the held spans, never a
    // model call. `gated:true` records that the floor substituted a decline; the walk's
    // downstream stages are skipped via `terminate`.
    return {
      ...ctx,
      terminate: true,
      gated: true,
      answer: r.text,
      sources: [...(r.sources || [])].sort((a, b) => a - b),
      vetoes: [Object.freeze({ id: 'unanswerable', refuses: true,
        message: `The corpus does not hold ${g.reason === 'no-subject' && g.missing?.length ? g.missing.join(' or ') : 'what was asked'}; the walk was not run.` })],
    };
  },

  // THE REASONING WALK (src/reason/walk.js) — the one stage that COMMITS structure. It appends
  // real SYN / CON / REC events to the document's own log through the ENACTOR door, so every
  // stage after this one reads a graph that includes them (continuity by accumulation), while
  // canWitness stays false for every step by the provenance type law — a committed step can
  // ORIENT the next step but never witness a later claim as world. Each step carries its grade
  // (grounded / warranted-ungrounded / idle-ungrounded), read off the log, never elected.
  //
  // INTENT-GATED — this is the answerability VOID gate's conditioning (docs/answerability.md):
  // only an OPEN, analytical turn reaches. `explain` (turn/intent.js taskOf) runs the walk; so
  // does a composer route when a caller threads one (ctx.metaRoute === 'compose'). A pointed
  // fact-lookup (`answer`) keeps today's behaviour exactly — there, retrieval finding nothing
  // IS the absence, and a reach would be a lie. The Pattern tasks (summary / list) reorganize
  // what the document already holds, so they do not reach either. Chat has no corpus log to
  // commit to. Sits after `gate` on purpose: an unanswerable turn terminates with the refusal
  // atom and the walk is never run.
  //
  // Best-effort and bounded: saturation is the terminator, maxSteps the hard backstop, and a
  // faulting walk must never cost the turn.
  async reason(ctx) {
    const open = ctx.task === 'explain' || ctx.metaRoute === 'compose';
    if (ctx.route !== 'grounded' || ctx.meta || !open || !ctx.doc?.log || !ctx.spans?.length) return ctx;
    try {
      const r = await walkReasoning(ctx.doc.log, { enactment: 'reason', maxSteps: 12 });
      return r.steps.length ? { ...ctx, reasoning: r } : ctx;
    } catch { return ctx; }
  },

  async prompt(ctx) {
    // The register is the route the grounding chip selected upstream — not just
    // "did we get spans". A strict-grounded turn with no spans still builds a
    // grounded (strict-refusal) message; a free-form turn always builds chat.
    const grounded = ctx.route === 'grounded';
    // THE MEANING GRAPH, opt-in (the web path): the typed relations the fold read off what it
    // just read — so the talker reasons over the MEANING, not just the raw lines. Empty unless
    // ctx.groundGraph is set, so the default reading stays the subjective frame (§2). Stashed on
    // the returned ctx (fedGraph) so the caller can surface exactly what graph it answered from.
    //   Built over the WHOLE fetched content (every unit), not just the retrieved window — for
    //   web we want the full meaning the parser extracted, not only the spans nearest the
    //   question. Its richness is bounded by relation extraction on prose (entities + their
    //   definitions always; typed relations where the parser recognized the verb).
    // The graph is the SURFER's reading — the structure over the spans the surf actually settled
    // on (ctx.note.levels.structure), NOT a dump of every unit. Reading the whole document folds
    // in nav chrome and off-topic sentences ("Main -> Random : page"); the surf is what selects
    // the significant few. EOT-serialized (docs/eot-surface-syntax.md) and scrubbed at the membrane.
    //   The graph is only as trustworthy as the referent the fold LANDED ON. When the reading
    //   diffused — no dominant figure at the cursor (referential.concentrated === false) — the
    //   surf rode to the document's loudest figure, not the one the question is about, so the
    //   relations it read off are ABOUT THE WRONG THING (the audit's "who is behind the X-Files
    //   reboot?" folded a graph centred on Rotten Tomatoes / Godzilla and fed it to the talker).
    //   A confident-looking graph built on a wandering focus is worse than none: withhold it and
    //   fall back to the plain excerpt frame. Only a MEASURED diffusion (=== false) withholds; an
    //   unmeasured referent (null, no corefField — most tests) feeds the graph as before.
    const landedOnReferent = ctx.referential?.concentrated !== false;
    let fedGraph = '';
    if (grounded && ctx.groundGraph && landedOnReferent && ctx.note?.levels?.structure) {
      try {
        const lines = serializeEOT(ctx.note.levels.structure, { max: 24 });
        fedGraph = scrubGraphLines(lines).join('\n');
      } catch { fedGraph = ''; }
    }
    // THE ARC BROADCAST (write/gravity.js, docs/weight-of-the-turn.md), opt-in via
    // ctx.broadcastArc. The fold already computed the reading's dynamics — the surf's REC
    // frame-breaks, the surprise field — and until now they died at this boundary: the
    // talker got the salient lines, never the movement between them. When the flag is on
    // and a focus settled, the trajectory (segmented at the RECs) is lifted into a
    // weighted arc and rendered as a plain-language block beside the excerpts, so the
    // answer can voice the turn as a turn, weighted where the reading was rewritten
    // hardest. Off (the default), or no focus, or no turn on the log → '' → no block →
    // byte-identical. Best-effort: a faulting arc must never cost the prompt.
    let arcBlock = '';
    if (grounded && ctx.broadcastArc && ctx.doc && ctx.surf) {
      try {
        const focusLabel = ctx.surf.focus
          ?? (ctx.focus?.[0] != null ? (ctx.doc.admission?.labelOf?.(ctx.focus[0]) ?? null) : null);
        if (focusLabel) {
          const traj = trajectory(ctx.doc, { focus: focusLabel, segments: ctx.surf.recCursors || [] });
          const thread = threadBasis({ query: ctx.question, history: ctx.history || [], doc: ctx.doc });
          arcBlock = arcLines(arcGravity(traj, { surf: ctx.surf, thread }));
        }
      } catch { arcBlock = ''; }
    }
    // THE GRADE THROUGH THE MEMBRANE (src/reason, docs/ungrounded-emitted.md). The walk's
    // REACHES — warranted / idle steps, each voiced as a declarative `said` — ride into the
    // window as a marked inference block, so the talker hedges them instead of flattening a
    // reach into confident prose (the passing-off rate, I2). A GROUNDED step is deliberately
    // left out: its witnessing sentence already rides among the excerpts, asserted; repeating
    // it here would double-tell. Empty on every turn the walk did not run → no block →
    // byte-identical.
    let reasoningBlock = '';
    if (ctx.reasoning?.steps?.length) {
      const mark = (s) => s.grade === 'warranted-ungrounded'
        ? 'follows a pattern in what you read, though it is not stated'
        : 'your own conjecture';
      const lines = ctx.reasoning.steps
        .filter(s => s.grade !== 'grounded' && s.said)
        .slice(0, 8)
        .map(s => `- ${s.said} (${mark(s)})`);
      if (lines.length) reasoningBlock = `Reaching past the lines, your reading also drew these inferences:\n${lines.join('\n')}`;
    }
    // META-CONVERSATIONAL: the question is ABOUT the conversation (intent.js). Open the
    // FULL session fold to the grounded prompt — the talker's prior answers included —
    // because here the prior topics are the question's SUBJECT, not a premise it might
    // anchor a wrong fact to (the asymmetry the history-poisoning firewall misses). Every
    // other grounded turn keeps the user-only thread, withholding the poisoning channel.
    const metaTurn = grounded && !!ctx.meta;
    const messages = grounded
      ? buildGroundedMessages({
          question:     ctx.question,
          spans:        selectExcerpts(ctx.spans || []),  // the relevant few verbatim — the ONE channel (§2)
          orientation:  orientationOf(ctx.doc),       // filename · type · length — no recognition (§3)
          task:         ctx.task,               // the summary guard rides on a summary task
          budget:       ctx.budget,             // none by default; a caller may impose one
          conversation: metaTurn ? metaConversation(ctx) : groundedConversation(ctx),
          meta:         metaTurn,               // frame the conversation as the SUBJECT, not context-to-skip
          // the nearest sample answer's SHAPE, when the form library matched one (turn/shape.js)
          // — so the first draft is laid out right, not only corrected after. Empty by default.
          exemplar:     ctx.shapeTarget?.promptMatch?.best_response || '',
          strict:       ctx.grounding === 'grounded',   // "only what you read" — abstention is the honest fallback
          now:          ctx.now || null,  // hand the talker the real clock — date/time answered directly
          graph:        fedGraph,         // the meaning graph (web path); empty → §2 subjective frame
          arc:          arcBlock,         // the reading's own arc (broadcastArc); empty → no block
          reasoning:    reasoningBlock,   // the walk's marked reaches (reason stage); empty → no block
          // No layout template: the answer-first/sectioned shape is no longer keyed off the raw
          // question. How the reply is shaped is the discourse metacognition's call (the steer),
          // not a keyword regex over the scope — so nothing rides the `shape` slot here.
        })
      : buildChatMessages({
          question: ctx.question,
          history:  ctx.recentMessages || [],   // a chat model wants turns as turns
          notes:    ctx.conversation?.notes || '',
          free:     ctx.grounding === 'free',   // general-knowledge register, explicitly ungrounded
          now:      ctx.now || null,            // the running app knows the moment; the weights don't (null in tests → byte-identical)
          longform: ctx.longform || false,      // a "write me an essay" ask develops the piece, not a 2-liner
        });
    // Weave in the read corpus (the mind) when the user opted into weave mode. Null
    // otherwise — the present prompt is untouched, golden parses byte-identical.
    const woven = weaveMemory(messages, ctx.mindSpans);
    return {
      ...ctx,
      messages: woven,
      fedGraph,   // the meaning graph handed to the talker this turn (empty unless groundGraph)
      arcBlock,   // the arc block handed to the talker this turn (empty unless broadcastArc)
      promptText: woven.map(m => `${m.role}: ${m.content}`).join('\n\n'),
    };
  },

  // The model. The token ceiling is the task register's max_tokens (the real length
  // bound) — not a fixed 256. Verbatim raw output is captured in `rawOutput` for audit.
  //
  // Two paths, one default. The GOLDEN path is phrase()+veto, unchanged: the model
  // samples the whole reply, the binder cites it, the veto flags it. The GATED path
  // (enactor/gate.js, driven via the speech renderer) is taken only behind RULES_REV AND when the backend exposes
  // `propose` (logit access) AND the surfer's reading is in hand — grounded speech at
  // the proposition, the answer SELECTED by grounding rather than flagged after it. Its
  // emitted surface flows down the SAME bind/factcheck/veto stages, so veto is now the
  // auditory-loop annotation that confirms grounding (§8). Absent any precondition the
  // talker falls back to phrase(), byte-identical — non-breaking by construction.
  async llm(ctx) {
    const maxTokens = ctx.maxTokens || 384;

    // THE LENS PORT (spec-the-lens-port.md). When the toggle is on, the backend exposes its
    // tokenizer, and a doc + surfer reading are in hand, build the per-document concept→token
    // map and a Born distribution over the salient figures, and hand the steering config down
    // the same beat loop. Off (or any precondition absent) ⇒ lens === null ⇒ the golden path is
    // byte-identical. The void numeral/entity gates are always on once armed; relevance leads
    // (μ on the surfer's focus); personality (λ) stays off until per-figure activations are wired
    // (the spec's build order: the smallest honest first test is μ-only relevance + the void gate).
    const lens = buildLens(ctx);

    // THE PARAGRAPH LOOP (write/paragraphs.js). When a grounded turn streams, the model
    // is handed the SAME prompt the one-shot path built — the fold's content: the lines
    // the reading turned up, the conversation, the question — and answers one paragraph
    // at a time, each continuation riding as its own assistant turn (so a multiround
    // backend reuses its KV cache). This retires the sentence-per-beat loop and its
    // lens-port steering from the answer path: trust the model to write grounded prose,
    // keep the grounding MECHANICAL and downstream — bind cites per claim, factcheck
    // adjudicates, veto flags. Falls back to the one-shot draw below on any fault —
    // non-breaking by construction; the present chat / golden paths are untouched.
    // CANCELLATION (the Stop button): the turn's AbortSignal, threaded into every
    // generation path so the backend can halt the decode and hand back the partial.
    const signal = ctx.signal || null;
    if (ctx.stream && ctx.route === 'grounded' && ctx.doc && ctx.spans?.length) {
      try {
        const streamed = await streamParagraphs({
          model: ctx.model, messages: ctx.messages, onToken: ctx.onToken,
          budget: maxTokens, signal,
        });
        if (streamed && streamed.draft) {
          // The user stopped mid-decode: the partial paragraphs are the answer —
          // short-circuit the pipeline exactly as the plain path does below.
          if (signal?.aborted) {
            return { ...ctx, rawOutput: streamed.draft, answer: streamed.draft.trim(), sources: [], maxTokens, streamed, stopped: true, terminate: true };
          }
          return { ...ctx, rawOutput: streamed.draft, maxTokens, streamed };
        }
      } catch { /* a streaming fault degrades to the one-shot path below, never a dead turn */ }
    }

    if (canGroundedSpeak(ctx.model, ctx)) {
      const gated = await groundedSpeak({
        model: ctx.model, messages: ctx.messages, doc: ctx.doc,
        surf: ctx.surf, question: ctx.question,
        alpha: ctx.alpha ?? undefined, opts: { maxTokens, signal },
      });
      return { ...ctx, rawOutput: gated.answer, maxTokens, gated, gatedVoided: gated.voided };
    }
    // PLAIN token streaming (the default visible mode, docs/streaming-answer.md):
    // forward `ctx.onToken` to the ordinary draw so the one-shot answer fills in
    // token by token where the backend exposes a decode callback (webllm, onnx-chat,
    // wllama). A backend without one falls back to draw-then-emit — the whole answer
    // once — and a turn with no `onToken` is byte-identical to the bare phrase().
    const raw = await streamPhrase(ctx.model, ctx.messages, { maxTokens, onToken: ctx.onToken, lens, signal });
    // The user stopped mid-decode: the partial text is the answer. Short-circuit the rest
    // of the pipeline (bind/factcheck/veto) so Stop is immediate, not "stop, then grind the
    // grounding checks over a half-sentence". bind below would do this anyway, but a measured
    // void or the geometric fact-check can be slow, and there is nothing to verify here.
    if (signal?.aborted) {
      return { ...ctx, rawOutput: raw, answer: String(raw || '').trim(), sources: [], maxTokens, stopped: true, terminate: true };
    }
    return { ...ctx, rawOutput: raw, maxTokens, lensEvents: drainLens(ctx), lensMounted: lens?.mounted || null };
  },

  // Mechanical citation binding. The model never wrote [sN]; we do.
  // Without spans we skip binding — the raw output is the answer.
  async bind(ctx) {
    if (!ctx.spans?.length) {
      return { ...ctx, bound: [], answer: String(ctx.rawOutput || '').trim(), sources: [] };
    }
    // The binder rides the same reading the fold sat on: the document for idf,
    // the surfer's peak (the cursor the significance reading was taken at) for
    // the γ-field tilt. Both are priors — with no doc they flatten and binding
    // is the old lexical overlap.
    const cursor = ctx.surf?.peak ?? ctx.spans[0]?.idx ?? 0;
    // Bind PER PARAGRAPH so the draft's blank lines survive into the answer —
    // renderBound joins claims with a space, which would flatten the paragraph
    // loop's structure (and any one-shot draft that used blank lines). A draft
    // with no blank line is one paragraph: byte-identical to binding it whole.
    const paras = String(ctx.rawOutput || '').split(/\n[ \t]*\n+/).map(p => p.trim()).filter(Boolean);
    const boundParas = paras.map(p => bindCitations(p, ctx.spans, { doc: ctx.doc, cursor }));
    const bound = boundParas.flat();
    // Mark the zero-contact claims — a grounded answer wears its provenance at claim
    // grain, so an unsourced sentence can no longer read as sourced (bind.js UNSOURCED_MARK).
    const answer = boundParas.map(p => renderBound(p, { mark: true })).join('\n\n');
    const sources = [...new Set(
      bound.filter(b => b.citation).map(b => parseInt(b.citation.slice(1), 10))
    )];
    return { ...ctx, bound, answer, sources };
  },

  // Contrast the talker's propositional assertions against the document graph.
  // (factcheck/correspond.js) We do NOT gate what the model may say — it can answer
  // from its own memory — because every claimed RELATION is adjudicated here against
  // the reading the fold built: corroborated (it matches a document edge, and EARNS
  // that edge's citation), contradicted (a carved VOID or a disjoint axiom denies it
  // — the libel-grade catch), unsupported (no witness — it rides, flagged),
  // indeterminate (cannot be measured — held). The verdicts flow into
  // ctx.edgeVerdicts, which the veto battery already reads. Flag-and-tell: the answer
  // is never gagged here. The symbolic relation algebra runs embedder-free, so a
  // disjoint-kinship contradiction fires even under the hash organ; the geometric
  // verdicts need a live classifier and otherwise degrade to indeterminate (held).
  // Skipped in chat mode (no doc) and after a measured void (terminate short-circuit).
  async factcheck(ctx) {
    if (!ctx.doc || !ctx.rawOutput) return ctx;
    const cursor = ctx.surf?.peak ?? ctx.spans?.[0]?.idx ?? Infinity;
    const graph  = projectGraph(ctx.doc.log, { cursor });
    const fc = await factCheck({
      prose: ctx.rawOutput, doc: ctx.doc, graph, cursor,
      classifier: ctx.classifier || null, adjacency: ctx.adjacency || null,
      // P1: the Site-face terrain at the answer locus, for the diagonal guard. A
      // measured void rides as Void; this is what turns a specific claim made over an
      // absence into an OFF_DIAGONAL verdict the veto battery can tag.
      terrain: terrainAtLocus(ctx, cursor),
      // §4 (behind RULES_REV): the change-of-state object-functional clash — Gregor, not
      // the father, underwent the transformation. Off by default → byte-identical.
      changeOfState: RULES_REV,
    });
    // A claim the GRAPH corroborates earns the cited sentence even when the model
    // spoke from memory: fold those citations into the answer's sources, de-duped.
    const earned = (fc.citations || [])
      .map(c => parseInt(String(c).slice(1), 10)).filter(Number.isFinite);
    const sources = earned.length ? [...new Set([...(ctx.sources || []), ...earned])] : ctx.sources;

    // Feed an edge-corroboration back into the per-claim BIND. The lexical binder cites on
    // surface overlap with a single span; a kinship claim ("Gregor's sister is Grete") whose
    // witness sentence shares few words stays uncited there, so unbound-contact / low-coverage
    // (ground/veto.js — both read `bound`, not the edge verdicts) fire on a correct, graph-
    // witnessed answer. When the factcheck corroborated a claim against a document edge, attach
    // that edge's citation to the matching bound claim, so the answer reads as grounded where
    // the GRAPH grounds it — not only where lexical overlap did. Only fills an UNcited claim
    // (a real lexical citation is never overwritten); when nothing matches, bound is untouched.
    let bound = ctx.bound, answer = ctx.answer;
    if (Array.isArray(ctx.bound) && ctx.bound.length) {
      const corro = (fc.claims || []).filter(c => c.verdict === VERDICTS.CORROBORATED && c.citation && c.sentence);
      if (corro.length) {
        const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
        let changed = false;
        bound = ctx.bound.map(b => {
          if (b.citation) return b;
          const hit = corro.find(c => { const cs = norm(c.sentence), bs = norm(b.claim); return cs && bs && (bs.includes(cs) || cs.includes(bs)); });
          if (!hit) return b;
          changed = true;
          return { ...b, citation: hit.citation, edgeGrounded: true };
        });
        if (changed) answer = renderBound(bound, { mark: true });
        else bound = ctx.bound;
      }
    }
    // The PROPOSITION channel (the DEF/claim-grain sibling of the edge veto above).
    // claimedEdges is edges-only, so a single-argument predication — "O'Connell is a
    // council member" — produces no edge and is never graded; a stale exclusive office
    // survives even when the sources say "Mayor O'Connell". This evaluates every DEF
    // proposition the answer asserts against the sources' own DEF props read at the
    // cursor where each sits, and flags a superseded/stale office. Flag-and-tell, never
    // refusing: its corrections ride out as flags, the answer is never gagged. Pure and
    // additive — it touches neither the edge verdicts the veto battery reads nor `refuse`.
    let propositions = null;
    try { propositions = auditPropositions({ prose: ctx.rawOutput, doc: ctx.doc, cursor, now: ctx.now || null }); }
    catch { propositions = null; }
    return { ...ctx, edgeVerdicts: fc.edgeVerdicts, factcheck: fc, propositions, sources, bound, answer };
  },

  // The regenerate pass — gate-then-rewrite (§5). Two triggers re-prompt the talker once
  // against the SAME lines and re-run bind + fact-check on the new draft:
  //   (a) the confabulation proper — a specific claim asserted at a measured Void (the
  //       off-diagonal guard). Rewrite-then-TAG: a survivor ships, flagged.
  //   (b) the §5 GATE — a REFUSING edge-grounded veto on the answer's load-bearing claim:
  //       a relation the reading DENIES (factcheck.refuse), or a from-nowhere `unbound`
  //       answer. Under the subjective frame abstention is free and coherent, so the
  //       calculus that made these RIDE now inverts: they gate and regenerate. The turn
  //       is recorded `gated` whether or not the regenerate clears it — the gate engaged;
  //       with a real model the corrective pulls the redo toward an honest "I did not find
  //       it." Scoped to the default `answer` task (the pointed question), so a summary's
  //       connective claims are never gated.
  // If the rewrite clears it, the clean draft replaces the first outright; a survivor
  // ships with the veto's flag (never silently dropped). Inert with no model / no doc / in
  // chat mode. Both guards are classifier-free, so this arms even under the hash organ.
  async revise(ctx) {
    // Retired on the streaming-answer path (docs/streaming-answer.md §3c, §5): the
    // block rewrite would un-stream tokens the reader has already seen, which the
    // suppress-never-erase law forbids. On that path a void was hedged prospectively
    // (band:'void' at the cursor) and any drift rode forward into the next beat — the
    // correction is already in the trail, so there is nothing to rewrite here.
    if (ctx.streamed) return ctx;
    if (!ctx.doc || !ctx.spans?.length || !ctx.model) return ctx;
    // The referent the question asks about — resolved ONCE, used to judge a NAME answer
    // (turn/expect.js) and to steer the corrective. Best-effort and read-only: it calls the
    // reference reader directly (even with RULES_REV off) so the adequacy check can use the
    // name the engine CAN resolve — the knowledge the answer path used to discard — without
    // changing what retrieval/fold already did. Computed only for a gating expectation (a
    // name question), so every other turn is byte-identical, referent stays null.
    const referent = needsReferent(ctx.expectation)
      ? (ctx.refTarget || referenceTarget(ctx.doc, ctx.history, ctx.question, ctx.spans))
      : null;
    // A regenerate is owed on the grounding triggers (confab / §5 gate) OR when the answer
    // misses a GATING constraint the prompt predicted — a name not given, a length overrun, a
    // backwards retelling told forwards. The miss is the prediction error; restarting is the
    // error-correction. Soft (non-gating) misses are left to the veto flag, not retried.
    const errsOf  = (c) => {
      const ce = answerConstraintErrors(c.expectation, c.rawOutput, { doc: c.doc, referent, bound: c.bound });
      const pe = answerPredictionError(c.prediction, c.rawOutput);   // the mechanical-draft divergence
      return pe ? [...ce, pe] : ce;
    };
    const gatingOf = (c) => errsOf(c).filter((e) => e.gates);
    // FORM DRIVES REVISION (turn/shape.js): the sample-answer library scores the draft's shape
    // against what this kind of question wants. Embedder-gated; where it can measure, an
    // off-basin draft is a gating trigger here (a reshape), with the matched sample as the
    // target — flag-only in veto, but a reason to answer again here. Async (it embeds the
    // draft), inert without a threaded library / warm meaning embedder.
    const meaning = (() => { const e = pickRetrievalEmbedder(ctx); return (e?.measuresMeaning && e.isWarm?.()) ? e : null; })();
    const formErrOf = async (c) => {
      if (!ctx.shapeLibrary || !ctx.shapeQueryVec || !meaning || !c.rawOutput) return null;
      try {
        const e = answerFormError(ctx.shapeLibrary, ctx.shapeQueryVec, await meaning.embed(c.rawOutput));
        return e ? { ...e, gates: true, sample: ctx.shapeTarget?.promptMatch?.best_response || '' } : null;
      } catch { return null; }
    };
    let curForm = await formErrOf(ctx);
    const regenNeeded = (c) => needsRegen(c) || gatingOf(c).length > 0;
    if (!regenNeeded(ctx) && !curForm) return ctx;
    // The §5 gate engaged at entry — recorded for the audit even if the regenerate clears.
    const gated = gateCondition(ctx);
    let cur = ctx, attempts = 0;
    const revisions = [];
    while (attempts < REWRITE_ATTEMPTS && (regenNeeded(cur) || curForm)) {
      attempts++;
      // Record the superseded draft BESIDE its successor — never erase it. The reason it was
      // made to answer again travels with it (the off-diagonal verdicts that condemned it,
      // and a plain `why`), so the trail shows verbatim what the machine said, why it stopped,
      // and what it said instead. This is the log's own SEG/retract law (core/log.js) applied
      // to the conversational record: a truer word may be appended, the false one is not
      // unwritten — and the user can WATCH it catch itself and begin again.
      const supersededDraft    = cur.rawOutput;
      const supersededVerdicts = (cur.edgeVerdicts || []).filter(v => v.verdict === 'off_diagonal' && v.void);
      // The trigger, content/constraint before form: the first unmet gating constraint, else
      // the off-shape form miss.
      const shapeErr = gatingOf(cur)[0] || curForm;
      const why = shapeErr ? shapeErr.reason
        : (gateCondition(cur) && !confabulating(cur))
          ? 'a load-bearing claim was not grounded in the lines'
          : 'a specific claim was asserted where the lines mark an absence';
      const corrective = !shapeErr ? correctiveFor(cur)
        : shapeErr.dim === 'form' ? reshapeCorrective(shapeErr)   // answer like this sample
        : constraintCorrective(shapeErr);                          // name them / shorten / reverse
      const messages = buildGroundedMessages({
        question:    ctx.question,
        spans:       selectExcerpts(ctx.spans),   // same trimmed lines the first pass saw
        orientation: orientationOf(ctx.doc),
        task:        ctx.task,
        budget:      ctx.budget,
        conversation: {},                     // history still withheld on the grounded path
        corrective,
      });
      const raw = await ctx.model.phrase(messages, { maxTokens: ctx.maxTokens || TASK_MAX_TOKENS.answer });
      cur = await stages.factcheck(await stages.bind({ ...cur, rawOutput: raw, messages }));
      curForm = await formErrOf(cur);
      revisions.push(Object.freeze({ draft: supersededDraft, offDiagonal: supersededVerdicts, replacedBy: raw, why }));
    }
    return { ...cur, revised: { attempts, resolved: !(regenNeeded(cur) || curForm), errors: errsOf(cur).map(e => e.id) }, revisions,
             ...(gated ? { gated: true } : {}) };
  },

  // The veto pass — flag-and-tell, ALWAYS. The vetoes ride alongside the model's answer
  // as the fact-check's annotations; they never substitute it. We trust the talker to say
  // the thing, surface what it said, and pin a flag where the grounding is thin or
  // contested (low-coverage, edge-unsupported / contradicted, off-diagonal, referent-
  // ambiguous, abstained, and the from-nowhere `unbound`). A flag is an ADDITION to the
  // answer, not a trade for it: the user sees the answer the model gave — never a canned
  // decline, never a raw span swapped in for it — with the caveats attached. Surfacing the
  // model's word and telling the user what we could and couldn't ground is the whole job;
  // hiding it behind a typed refusal was the old span-extractive reflex, now retired. If
  // the talker truly needs to know more before it can speak, that is the upstream retrieval
  // / revise loop's problem, not a reason to gag the answer here. Without a doc we skip the
  // grounding vetoes entirely.
  async veto(ctx) {
    if (!ctx.spans?.length) return { ...ctx, vetoes: [] };
    // The WITNESS check: classify the answer's propositions against the document's graph and
    // ask whether they rest on the WORLD (exafference) or only on the engine's own reading
    // (reafference — e.g. an EOT notes doc). When everything grounded is interpretation, the
    // `interpretation` veto flags it. Inert for prose (the text is the world → exafference).
    let provenance = ctx.doc && ctx.rawOutput ? classifyProvenance(ctx.rawOutput, { doc: ctx.doc }) : null;
    let witnessSought = null;
    // ACTIVELY SEEK THE WITNESS: when the answer rests only on the engine's reading AND an
    // exafferent SOURCE is available (ctx.witnessSource — the corpus the notes were read from),
    // go fetch the spans about the interpretation's figures and re-check. A claim the source
    // attests is CONFIRMED (upgraded to witnessed); one it is silent on stays interpretation.
    // The engine does not just accept a witness when offered — it goes and looks for one.
    if (provenance?.onlyInterpretation && ctx.witnessSource) {
      const figs = [...new Set(provenance.propositions.filter((p) => p.interpretation)
        .flatMap((p) => [p.subj, p.obj].filter(Boolean)))];
      const spans = [...new Set(figs.flatMap((f) => retrieveLexical(ctx.witnessSource, f, 3).map((s) => s.text)))];
      if (spans.length) {
        const witness = parseText(spans.join(' '), { docId: 'witness' });
        provenance = classifyProvenance(ctx.rawOutput, { doc: ctx.doc, witness });
        witnessSought = { figures: figs, read: spans.length, confirmed: !provenance.onlyInterpretation };
      }
    }
    // The residual SHAPE error: did the final answer fill the slot the question predicted
    // (turn/expect.js)? Computed only for a gating expectation (a name question), so every
    // other turn passes `shapeError: null` and the battery is byte-identical. When the
    // revise loop already corrected the miss this is null; when it could not (or no model
    // ran), the unmet slot ships as a flag — the prediction error the engine could not
    // discharge, told to the user rather than hidden.
    const shapeReferent = needsReferent(ctx.expectation)
      ? (ctx.refTarget || referenceTarget(ctx.doc, ctx.history, ctx.question, ctx.spans))
      : null;
    const constraintErrors = answerConstraintErrors(ctx.expectation, ctx.rawOutput,
      { doc: ctx.doc, referent: shapeReferent, bound: ctx.bound });
    const predErr = answerPredictionError(ctx.prediction, ctx.rawOutput);
    if (predErr) constraintErrors.push(predErr);
    // The FORM check (turn/shape.js): embed the answer and score it against the shape the
    // question's sample answers predicted. A soft (non-gating) miss rides as a flag — taste is
    // not refusable. Embedder-gated and inert without a threaded library → byte-identical.
    if (ctx.shapeLibrary && ctx.shapeTarget && ctx.shapeQueryVec && ctx.rawOutput) {
      const emb = pickRetrievalEmbedder(ctx);
      if (emb?.measuresMeaning && emb.isWarm?.()) {
        try {
          const draftVec = await emb.embed(ctx.rawOutput);
          const formErr = answerFormError(ctx.shapeLibrary, ctx.shapeQueryVec, draftVec);
          if (formErr) constraintErrors.push(formErr);
        } catch { /* the form check never breaks the answer */ }
      }
    }
    const { fired } = runVetoes({
      draft: ctx.rawOutput, bound: ctx.bound, question: ctx.question,
      referential: ctx.referential, task: ctx.task, provenance, constraintErrors,
      // The surfer's measured commit stance — its own confabulation guard (stance-reserve):
      // a Ground-grain reserve at the peak means the reading did not settle on a figure.
      // Computed on every turn now the structural significance column is the default (§2).
      stance: ctx.surf?.stance,
      // The edge-grounding verdicts the factcheck stage just deposited — the link-
      // shaped sibling of the node-level `unbound` check. Without this they were
      // computed and discarded; now a claim the graph DENIES becomes a flag.
      edgeVerdicts: ctx.edgeVerdicts,
    });
    return { ...ctx, vetoes: fired, witnessSought };
  },

  // THE ABSENCE STAGE — the void reaching the voice (the honesty seam). The `answerable`
  // stage measured the field and found nothing (voidMeasure), the talker spoke anyway
  // (P0.2 — so the diagonal guard could adjudicate), bind found no span to cite,
  // factcheck earned no citation from the graph, and revise had its one rewrite. When
  // after ALL of that the answer still carries no witness — no claim cited, lexically
  // or by an edge — the honest word is the typed absence the measurement already
  // rendered, not an invention wearing the shape of an answer. The draft is preserved
  // BESIDE the absence in `revisions` (the SEG/retract law: correction beside error,
  // nothing unwritten), the turn is marked `gated`, and a non-refusing flag tells the
  // user what happened. A talker that already abstained in its own words keeps them —
  // this stage never replaces honesty with different honesty. Streaming and stopped
  // turns are exempt (suppress-never-erase); a turn with any citation ships untouched.
  async absence(ctx) {
    if (!ctx.voidMeasure || !ctx.voidText || ctx.stopped || ctx.streamed) return ctx;
    const cited = (ctx.bound || []).some((b) => b.citation) || (ctx.sources || []).length > 0;
    if (cited) return ctx;
    if (isAbstention(ctx.rawOutput || ctx.answer)) return ctx;
    const revisions = [...(ctx.revisions || []), Object.freeze({
      draft: ctx.answer ?? ctx.rawOutput ?? '',
      replacedBy: ctx.voidText,
      why: 'the field measured an absence and no source witnessed the draft',
    })];
    const vetoes = [...(ctx.vetoes || []), Object.freeze({
      id: 'void-asserted', refuses: false,
      message: `The reading measured an absence (${ctx.voidMeasure.receipt || ctx.voidMeasure.kind}); the unwitnessed draft was replaced by the typed absence and kept in the trail.`,
    })];
    return { ...ctx, answer: ctx.voidText, sources: [], gated: true, voidSpoken: true, revisions, vetoes };
  },

  // Settle: fold this turn's reading into the session's persistent Horizon (surfing-next.md
  // §4) — the moved density operator that accumulates across turns, curing the surf's
  // per-turn amnesia. Observe-only and AFTER the answer is formed, so it never changes the
  // reading the user just saw; it grows the cross-turn memory the NEXT turn can be read
  // against (the conditioning step is the staged follow-on). The reading folded in is the
  // embedder-free operator-profile activations — the same structural basis the significance
  // column rides — so the Horizon accumulates on every turn, not only under a meaning model.
  // Inert with no threaded Horizon (the default) and on a turn with no document; a fault here
  // must never disturb the answer, so it is fully guarded.
  async settle(ctx) {
    if (!ctx.horizon || !ctx.doc) return ctx;
    try {
      const { activations } = structuralActivations(ctx.doc);
      const live = activations.filter(v => v.some(x => x > 0));
      if (live.length) {
        const reading = ctx.horizon.observe(live);
        // Track F staleness: when the Horizon re-grounds (the helix turns), the steering rules
        // tuned to the old frame decay back toward σ — a rule good for one frame should not keep
        // firing once the field has moved (the lens-port addendum, invariant #4).
        if (reading?.regrounded) { try { ctx.model?.lensDecay?.({ regrounded: true }); } catch { /* best-effort */ } }
        return { ...ctx, horizonReading: reading };
      }
    } catch { /* a memory fold must never break a settled answer */ }
    return ctx;
  },
};

// One corrective rewrite. The user's rule: on confabulation, trigger a rewrite; if it
// still fails, put it through with the span tagged. One pass is the "a rewrite".
const REWRITE_ATTEMPTS = 1;

// The corrective handed to the talker on the rewrite pass — a REFINE, not a retreat. It
// names the specific over-reach (a connection the passages don't support) and asks for a
// truer answer in the model's own words, dropping the unsupported link — NOT for a blanket
// "the document does not say." We are still trusting the talker; we are only steering it
// off the one claim the reading could not witness.
const CONFAB_CORRECTIVE =
  'A previous attempt asserted a specific connection between named figures — a cause, an ' +
  'action, an identity, a relationship — that the lines do not actually support. Answer ' +
  'again in your own words, keeping to what the lines support. State the connection only ' +
  'if it is really there; otherwise answer the part you can and leave the unsupported link out.';

// The §5 corrective — handed when the GATE engaged (a refusing edge-grounded veto, or a
// from-nowhere unbound answer), distinct from the confab refine. It steers the talker
// back onto the lines and names the honest absence as a real option: under the subjective
// frame "I did not find it" is coherent, so the regenerate can reach it.
const GROUNDING_CORRECTIVE =
  'Read the lines again. Part of what you just said is not in them — either it is not ' +
  'there at all, or it conflicts with what they show. Answer again, keeping strictly to ' +
  'what the lines say. If the answer is not in them, tell them plainly you did not find it.';

// The corrective for a missed CONSTRAINT (turn/expect.js), by dimension. A REFINE, not a
// retreat: it names the one thing the draft got wrong and asks for it again, in the talker's
// own words. For a name the reading already resolved, hand it over outright — the engine knows
// it; the first draft simply failed to say it.
const constraintCorrective = (err) => {
  if (err.dim === 'coverage')
    return `Your answer is about the right passage but never names ${err.expectedName}, who the ` +
      'reading centers on. Answer again and name them where they belong.';
  if (err.dim === 'name')
    return err.expectedName
      ? `They asked for a name. The reading resolves it as “${err.expectedName}”. Answer with that ` +
        'name plainly — do not describe the person in place of naming them.'
      : 'They asked for a name — a specific person’s name. Give the name if the lines provide one; ' +
        'if they do not, say plainly you did not find it. Do not answer with a description in place of a name.';
  if (err.dim === 'length')
    return `They asked for the answer in ${err.params.max} ${err.params.unit}${err.params.max > 1 ? 's' : ''}. ` +
      'Give it that short — no more.';
  if (err.dim === 'order')
    return err.params.dir === 'desc'
      ? 'They asked for it backwards — tell it from the end to the beginning, the latest events first.'
      : 'They asked for it in order — tell it from the beginning through to the end.';
  return CONFAB_CORRECTIVE;
};

// The reshape corrective — handed when the FORM predictor (turn/shape.js) found the draft
// off-shape for this kind of question. It hands over the matched sample answer as a SHAPE
// target (its facts are about a different text), so the redo copies the register and length,
// not the content.
const reshapeCorrective = (err) =>
  err.sample
    ? `Your last answer did not read like the kind of answer this question wants. Here is the ` +
      `right SHAPE (it is about a different text — copy its register and length, NOT its facts):\n` +
      `“${err.sample}”\nAnswer again in that shape, grounded in the lines you read.`
    : 'Your last answer did not read like the kind of answer this question wants. Answer again in a ' +
      'fitting register and length, grounded in the lines you read.';

// Did the diagonal guard catch the confabulation proper — a specific claim asserted at
// a measured Void (the figure-at-a-void shape)? The hard case the rewrite targets.
const confabulating = (ctx) =>
  (ctx.edgeVerdicts || []).some(v => v.verdict === 'off_diagonal' && v.void);

// The §5 GATE condition. Under the subjective frame, a REFUSING edge-grounded veto on the
// answer's load-bearing claim no longer rides: a relation the reading DENIES
// (factcheck.refuse — a confident contradiction), or a from-nowhere `unbound` answer whose
// claims tie to nothing, engages the gate and regenerates. Scoped to the default `answer`
// task — the pointed question where retrieval finding nothing IS the absence; a whole-
// document task's connective claims legitimately have no single witness. low-coverage, the
// weak contradiction, edge-unsupported, and the off-diagonal grain over-read stay flag-only.
const refusingEdge       = (ctx) => !!ctx.factcheck?.refuse;
const loadBearingUnbound = (ctx) => isUnbound(ctx.bound || [], ctx.rawOutput);
const gateCondition      = (ctx) => ctx.task === 'answer' && (refusingEdge(ctx) || loadBearingUnbound(ctx));

// A regenerate is owed when the off-diagonal confab guard fired — a SPECIFIC claim asserted at
// a measured Void (a figure-at-a-void hallucination). The §5 grounding gate that forced an
// ungrounded/unsupported answer to rewrite toward "I did not find it" is OFF: the answer is no
// longer restricted to the document, so an ungrounded answer RIDES with a flag rather than being
// gated into an abstention. (gateCondition is kept for the audit `gated` marker only.)
const needsRegen = (ctx) => confabulating(ctx);

// The corrective for the regenerate, by failure: a pure §5 gate (no confab) steers back
// onto the lines; otherwise the confab refine drops the unsupported link.
const correctiveFor = (ctx) =>
  (gateCondition(ctx) && !confabulating(ctx)) ? GROUNDING_CORRECTIVE : CONFAB_CORRECTIVE;

// The Site-face terrain the reading typed at the answer locus, for the diagonal guard.
// The guard itself is general over all nine terrains (factcheck/correspond.js: terrainInfo →
// domain+grain, grain the discriminator); it was only ever FED a corner of the face. Now it
// gets the real terrain, typed off the locus's operators (surfer/terrain.js) — a bonded locus
// is a Link, a bare figure an Entity, an interpretive locus a Lens — so the off-diagonal
// verdict records the true Site, and a grain-mismatched claim is caught against whichever of
// the nine the locus actually is, not a hardcoded Entity. The two authorities the engine has
// already MEASURED still win: a measured void is Void (the confabulation guard's Void signal),
// and a DEF'd site (boilerplate / furniture, read/site.js) is ambient Atmosphere. A
// contentless locus that was NOT measured void is not downgraded to Void here (the measured
// void is the only Void authority) — it falls back to Entity, exactly as before.
const terrainAtLocus = (ctx, cursor) => {
  if (ctx.voidMeasure) return 'Void';
  if (cursor != null && Number.isFinite(cursor) && ctx.doc && siteIndices(ctx.doc).has(cursor)) return 'Atmosphere';
  if (cursor == null || !Number.isFinite(cursor) || !ctx.doc) return 'Entity';
  const t = siteTerrainAt(ctx.doc, cursor);
  return (t === 'Void' || t === 'Field') ? 'Entity' : t;   // only a MEASURED void is Void
};

// The orientation line: the talker is handed the FILENAME, type, and length, read off
// `docId` (the ingest sets it from the file name) — and NOTHING that lets it narrate a
// famous text from memory (§3). The document's own metadata (title, author, date) does
// not ride here, nor anywhere in the content prompt; it is answered separately, as a
// distinct fact, by the metadata answerer (answer/metadata.js, routed in `route`).
const orientationOf = (doc) => {
  if (!doc) return '';
  const units = doc.units || doc.sentences || [];
  return orientationLine({
    filename: doc.docId || 'the document',
    type:     doc.modality === 'image' ? 'image' : 'text',
    length:   units.length,
  });
};

// buildLens — assemble the lens-port steering config for this turn, or null to leave the
// golden path untouched (spec-the-lens-port.md, Tracks B–D). Requires the toggle, a backend
// that exposes its tokenizer (the bridge seam), and a doc + surfer reading.
const buildLens = (ctx) => {
  if (!ctx.lensPort) return null;
  const tokenizer = ctx.model?.getTokenizer?.();
  if (!tokenizer || !ctx.doc || !ctx.surf) return null;
  // Track F: fold in surfaces a span-gated REC re-grounded on earlier turns — the gate tightens.
  const extraForms = (() => { try { return ctx.model.lensApproved?.() || []; } catch { return []; } })();
  const conceptMap = buildConceptTokenMap(ctx.doc, ctx.surf, tokenizer, { extraForms });
  if (!conceptMap.coverage.figuresMapped && !conceptMap.coverage.groundedNumbers) return null;

  // THE PANTHEON (spec-the-pantheon.md): auto-mount the Act cartridge for the cell the surfer
  // already read, Born-weighted by the stance firmness, under a total bias budget. NUL-on-VOID
  // is a GOVERNANCE LOCK — when the void gate fires, Chaos mounts and cannot be dialed into a
  // confident register, the exact failure the provenance stance exists to prevent. The baked
  // vectors ship empty, so this names which gods mount (the log) while λ stays a no-op until the
  // bake lands; with vectors present it becomes the standing voice tilt.
  const st = ctx.surf?.stance || {};
  // The cell address across the cube's three axes: Act (the pantheon), Mode (Stance), grain (the
  // thin Site layer — Figure is carried by μ, so only Ground/Pattern mount a diction cartridge).
  const grain = st.grain && st.grain !== 'Figure' ? st.grain : null;
  const cell = ctx.voidMeasure
    ? { act: 'NUL', mode: stanceFamily(st.stance), grain, locked: true }   // NUL-on-VOID governance lock
    : { act: st.op || null, mode: stanceFamily(st.stance), grain };
  const w = Number.isFinite(st.firmness) ? st.firmness : 1;
  const dialMul = dialMultipliers(ctx.voicePref);   // the plain-language standing preference (Track E)
  const { bias: personality, mounted } = mountPersonality({
    cell, weights: { act: w, mode: w, grain: w, tilt: 1 }, banks: lensBanks(), budget: 6, dialMul,
  });

  return {
    conceptMap,
    figureWeights: figureWeightsFromSurf(ctx.surf),   // the surfer's salience as a token bias (μ)
    personality,                                      // the standing surf-stance λ sum (non-streaming path)
    mounted,                                           // the mounted-set, for the Given-Log
    mu: 2, lambda: personality.size ? 1 : 0, alpha: ctx.alpha ?? 0.05,
    // The streaming answer loop mounts the BAND cartridge per beat (existence/structure/
    // significance) from each cell's provenance, so it needs the banks + the standing grain +
    // the dial (the per-beat mount applies the same plain-language preference).
    banks: lensBanks(), budget: 6, grain, locked: !!ctx.voidMeasure, dialMul,
  };
};

// The cartridge banks, loaded once: the Act pantheon, the Stance Mode/Resolution faces, and the
// thin Site grain layer. The register-orthogonality gate runs at load (collapses Stance-defeat into
// Act-REC if the baked vectors prove too aligned). All ship with EMPTY vectors (λ no-op); a baked
// data file swaps the steering vectors in without touching the mount mechanism.
let _banks = null;
const lensBanks = () => {
  if (!_banks) {
    const act = defaultPantheonBank();
    const stance = defaultStanceBanks();
    resolveOverlap(act, stance);
    _banks = { act, mode: stance.mode, resolution: stance.resolution, grain: defaultSiteBank() };
  }
  return _banks;
};

// figureWeightsFromSurf — the surfer's Born-rule salience as a distribution over figure labels.
// First cut (the spec's smallest test): the focus figure carries the mass; Track-D full reads the
// per-span field. Returns null when the reading named no figure.
const figureWeightsFromSurf = (surf) => {
  const focus = surf?.focus ? String(surf.focus).toLowerCase() : null;
  return focus ? new Map([[focus, 1]]) : null;
};

// drainLens — pull the steering provenance the stack accumulated this turn into the Given-Log
// (which lenses fired, suppressed tokens, void-conflicts, the entropy at each gated step), and
// close the Track-F loop: run the SPAN-GATED re-grounding decision on each void-conflict so a
// conflict only widens the trie when a SOURCE SPAN justifies it (else it stays a review entry).
const drainLens = (ctx) => {
  let events = [];
  try { events = ctx.model?.lensEvents?.() || []; } catch { events = []; }
  const recs = [];
  for (const ev of events) {
    if (ev.type === 'void-conflict' && ev.surface) {
      try { const r = ctx.model.lensRecGate?.(ev.surface, ctx.spans || []); if (r) recs.push({ type: 'rec', ...r }); }
      catch { /* re-grounding is best-effort; the conflict is already logged */ }
    }
  }
  const all = [...events, ...recs];
  return all.length ? all : null;
};

// The conversation the GROUNDED prompt carries: the user's OWN recent turns — the thread
// of what was ASKED — and never the talker's prior answers. Recent user turns ride from
// the session fold's verbatim window; older ones from its surfed `#i You:` movers. This
// restores follow-up continuity without re-feeding the model the replies it anchors on
// (the poisoning channel). Empty (→ no slot) when the user hasn't asked anything yet.
const groundedConversation = (ctx) => {
  const recentUser = (ctx.recentMessages || [])
    .filter(m => m && m.role === 'user' && m.content).map(m => m.content);
  const olderUser = String(ctx.conversation?.notes || '')
    .split('\n').filter(l => /^#\d+\s*You:/.test(l)).map(l => l.replace(/^#\d+\s*You:\s*/, '').trim());
  const thread = [...olderUser, ...recentUser].filter(Boolean);
  // The SETTLED ground — the facts already given, read off the dialogue line (the
  // Interpretation column's firm DEFs, converse/dialogue-state.js). Named to the talker as
  // already-held so it builds on them instead of restating "the mayor is X" every turn.
  // Only the settled QUESTION rides — never the answer (the firewall stays closed).
  const settled = groundedThread(ctx.history || [], ctx.question).settled;
  if (!thread.length && !settled.length) return {};
  const out = {};
  // Carry only the most recent few. The full thread, fed verbatim as "You asked: …"
  // lines, reads to a small talker as a checklist of open tasks — the audit's t5
  // answered every prior question in a bulleted list and overran its token budget.
  // The recent turns are what continuity ("now?", "prove it") actually needs; the
  // tail only widens the leak surface.
  if (thread.length) out.notes = thread.slice(-3).map(q => `You asked: ${q}`).join('\n');
  if (settled.length) out.settled = settled;
  return out;
};

// The conversation a META-CONVERSATIONAL grounded turn carries: the FULL thread — BOTH the
// user's questions and the talker's prior answers — because the question is about the
// conversation, so its prior topics (which live on both sides — a topic named in a question,
// a fact given in an answer) are the SUBJECT. The session fold already built exactly this
// (the `converse` stage): the surfed both-role recap of older movers (#i You: / #i Me:) and
// the recent verbatim window (You: / Me:). Nothing extra is computed — groundedConversation
// was simply discarding the assistant side. Empty (→ no slot) before anything was said.
const metaConversation = (ctx) => {
  const notes     = String(ctx.conversation?.notes || '').trim();
  const pastTurns = (ctx.conversation?.pastTurns || []).filter(Boolean);
  if (!notes && !pastTurns.length) return {};
  return { notes, pastTurns };
};
