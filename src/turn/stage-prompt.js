// EO — one group of the turn's fold (split from turn/stages.js, 2026-07 compliance
// pass: "no file over ~250 lines" / "no 760-line orchestrator", docs/architecture.md).
// PROMPT: assemble the grounded prompt (+ its private weave/scrub/conversation shapers).
// The methods are VERBATIM from stages.js; stages.js assembles the groups back
// into the one named-stage map the pipeline walks. Same holon, same seams.
import { selectExcerpts } from '../surfer/retrieve/index.js';
import { trajectory, threadBasis } from '../surfer/index.js';
import { arcGravity, arcLines } from '../weave/write/index.js';
import { serializeEOT } from '../perceiver/index.js';
import { foldConversation, groundedThread } from './converse/index.js';
import { buildGroundedMessages, buildChatMessages, projectGroundedBands, judgePrompt } from '../model/index.js';
import { RULES_REV } from '../organs/out/speech/index.js';

const SEP = '␟';   // the composite unit separator

export const scrubGraphLines = (lines = []) => lines
  .map(l => String(l)
    .replace(new RegExp(`[a-z]+-[0-9a-f]{6,}${SEP}`, 'gi'), '')  // drop the composite id prefix before the label
    .replace(new RegExp(SEP, 'g'), ' ')
    .replace(/\s+/g, ' ').trim())
  .filter(l => l && !/[a-z]+-[0-9a-f]{6,}/i.test(l));            // any opaque id left → no clean label, drop the line

// message so it rides inside the window without disturbing the grounded/chat assembly.
// Guarded entirely by mindSpans — every default turn skips it, byte-identical.


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
// The CHORUS flag (surf-chorus / multi-level surf). The fold reads the document with the multi-
// level chorus surf (chorus.js / multilevel.js): the arrest is discourse-aware (the activated
// thread conditions which spans stop) and, over a composite of several sources, off-topic sources
// are dropped before their content is read, and the per-source reads are folded to a bounded stop
// set so the reading never spams the prompt. ON by default; set CHORUS_REV=0/false/off to fall
// back to the incumbent single-ride surf (the RULES_REV idiom, speech/index.js:33 — read once).


// The conversation the GROUNDED prompt carries: the actual back-and-forth, both sides.
// The session fold (converse/history.js) already built the two registers a document gets
// — the recent turns VERBATIM (`pastTurns`, You:/Me:) and a surfed recap of older movers
// (`notes`, #i You:/#i Me:), bounded by the fold's own token budget — so the talker reads
// the real dialogue up to that budget, not a user-only checklist. The one thing withheld
// is an UNBOUND prior reply (a claim tied to no source): foldConversation drops it before
// the window is built, so a claim that never grounded cannot become a follow-up's premise.
// `settled` still rides beside the transcript. Empty (→ no slot) before anything was said.
const groundedConversation = (ctx) => {
  const notes     = String(ctx.conversation?.notes || '').trim();
  const pastTurns = (ctx.conversation?.pastTurns || []).filter(Boolean);
  // The SETTLED ground — the facts already given, read off the dialogue line (the
  // Interpretation column's firm DEFs, converse/dialogue-state.js). Named to the talker as
  // already-held so it builds on them instead of restating "the mayor is X" every turn.
  const settled = groundedThread(ctx.history || [], ctx.question).settled;
  if (!notes && !pastTurns.length && !settled.length) return {};
  const out = {};
  if (notes) out.notes = notes;
  if (pastTurns.length) out.pastTurns = pastTurns;
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

import { shapeDescriptor, composeFoldSummary, orientationOf, confabulating } from './stage-support.js';

export const STAGES = {

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
    // META-CONVERSATIONAL: the question is ABOUT the conversation (intent.js). Both paths
    // now feed the full both-role transcript (groundedConversation / metaConversation read
    // the same session fold); the flag only changes the FRAMING — a meta turn frames the
    // prior turns as the question's SUBJECT to reason over, an ordinary grounded turn frames
    // them as context to answer the latest question against (the thread bands' firewall).
    const metaTurn = grounded && !!ctx.meta;
    // The grounded frame's arguments, named once: buildGroundedMessages projects the
    // band catalog over them, and the !EVA prompt checkpoint below judges the SAME
    // projection — one derivation, two reads (a projection is NUL, free to repeat).
    const groundedArgs = grounded ? {
          question:     ctx.question,
          spans:        selectExcerpts(ctx.spans || []),  // the relevant few verbatim — the ONE channel (§2)
          orientation:  orientationOf(ctx.doc),       // filename · type · length — no recognition (§3)
          task:         ctx.task,               // the summary guard rides on a summary task
          budget:       ctx.budget,             // none by default; a caller may impose one
          conversation: metaTurn ? metaConversation(ctx) : groundedConversation(ctx),
          meta:         metaTurn,               // frame the conversation as the SUBJECT, not context-to-skip
          // the FORM the question's nearest sample answer takes — register and length only, built
          // from its shape_tags (shapeDescriptor). NOT the sample's verbatim text: handing a weak
          // talker a fact-laden sample made it copy the sample's facts (the "quarter of the training
          // cost" answer to a court-transcript question). Content-free by construction. Empty by default.
          exemplar:     shapeDescriptor(ctx.shapeTarget?.promptMatch?.best_tags),
          // THE FOLD SUMMARY (docs/topline.md): the standing topline the reading already composed for
          // the source and the figures this turn centres on, handed pre-digested so the talker phrases
          // rather than re-derives. Empty unless a caller threads foldSummary/entitySummaries → byte-identical.
          summary:      composeFoldSummary(ctx),
          strict:       ctx.grounding === 'grounded',   // "only what you read" — abstention is the honest fallback
          now:          ctx.now || null,  // hand the talker the real clock — date/time answered directly
          graph:        fedGraph,         // the meaning graph (web path); empty → §2 subjective frame
          arc:          arcBlock,         // the reading's own arc (broadcastArc); empty → no block
          reasoning:    reasoningBlock,   // the walk's marked reaches (reason stage); empty → no block
          // The answerability floor's measured decline, folded in as an honest-decline HINT
          // (bands.js `decline`): the reading diffused (no figure leads) or the corpus does
          // not name the subject asked about. Empty by default → byte-identical prompt. This
          // is what keeps a model-authored reply from confabulating where the old mechanical
          // gate used to hard-refuse: the talker is told to say plainly it didn't find it.
          declineHint:  ctx.referentDiffuse ? 'diffuse'
                        : (ctx.answerability && !ctx.answerability.licensed
                            ? (ctx.answerability.reason === 'no-subject' ? 'absent' : 'diffuse')
                            : ''),
          // No layout template: the answer-first/sectioned shape is no longer keyed off the raw
          // question. How the reply is shaped is the discourse metacognition's call (the steer),
          // not a keyword regex over the scope — so nothing rides the `shape` slot here.
        } : null;
    const messages = grounded
      ? buildGroundedMessages(groundedArgs)
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
    // !EVA prompt (model/prompt-checkpoint.js, docs/prompt-as-site.md §4): judge the
    // band assembly the talker is about to be handed, between `reason` and `llm` —
    // the input-side twin of the coder checkpoint. READ-ONLY AND ADVISORY: the
    // verdict rides the ctx for audit (typed findings — grain-mixed, desert-cell,
    // ground-inflation — the visible worklist), and only a structural error (a band
    // off the catalog) makes ok false; nothing here alters or vetoes the turn.
    // Best-effort: a faulting judge must never cost the prompt.
    let promptVerdict = null;
    if (grounded) {
      try { promptVerdict = judgePrompt(projectGroundedBands(groundedArgs), { id: 'turn.prompt' }); }
      catch { promptVerdict = null; }
    }
    return {
      ...ctx,
      messages: woven,
      fedGraph,   // the meaning graph handed to the talker this turn (empty unless groundGraph)
      arcBlock,   // the arc block handed to the talker this turn (empty unless broadcastArc)
      promptVerdict,  // the !EVA prompt verdict (null on chat turns / judge fault)
      promptText: woven.map(m => `${m.role}: ${m.content}`).join('\n\n'),
    };
  },
};
