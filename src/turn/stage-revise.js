// EO — one group of the turn's fold (split from turn/stages.js, 2026-07 compliance
// pass: "no file over ~250 lines" / "no 760-line orchestrator", docs/architecture.md).
// REVISE: revise → veto (+ the correctives and the regeneration conditions).
// The methods are VERBATIM from stages.js; stages.js assembles the groups back
// into the one named-stage map the pipeline walks. Same holon, same seams.
import { pickRetrievalEmbedder, selectExcerpts, retrieveLexical } from '../surfer/retrieve/index.js';
import { parseText } from '../perceiver/parse/index.js';
import { referenceTarget } from './converse/index.js';
import { TASK_MAX_TOKENS } from './intent.js';
import { answerConstraintErrors, answerPredictionError, needsReferent } from './expect.js';
import { answerFormError } from './shape.js';
import { buildGroundedMessages } from '../model/index.js';
import { runVetoes, classifyProvenance } from '../enactor/ground/index.js';
import { RULES_REV } from '../organs/out/speech/index.js';
import { speak } from '../model/index.js';

import { shapeDescriptor, orientationOf, confabulating } from './stage-support.js';
// The regenerate re-runs the bind→factcheck pair directly from its group —
// a real dependency edge, not a cycle through the assembler.
import { STAGES as BIND } from './stage-bind.js';
import { constraintCorrective, reshapeCorrective, gateCondition, needsRegen, correctiveFor } from './stage-correctives.js';

// One corrective rewrite. The user's rule: on confabulation, trigger a rewrite; if it
// still fails, put it through with the span tagged. One pass is the "a rewrite".
const REWRITE_ATTEMPTS = 1;

export const STAGES = {

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
      if (!ctx.shapeLibrary || !ctx.shapeQueryVec || !c.rawOutput) return null;
      // Grammar mode scores the draft's TEXT (parse + likelihood, model-free); only the
      // legacy cosine library needs the draft embedded, and so the warm meaning embedder.
      const grammarMode = ctx.shapeLibrary.mode === 'grammar';
      if (!grammarMode && !meaning) return null;
      try {
        const draft = grammarMode ? c.rawOutput : await meaning.embed(c.rawOutput);
        const e = answerFormError(ctx.shapeLibrary, ctx.shapeQueryVec, draft);
        // The reshape target is the content-free SHAPE descriptor (register + length), never the
        // matched sample's verbatim text — a rewrite must not re-inject a foreign answer's facts.
        return e ? { ...e, gates: true, sample: shapeDescriptor(ctx.shapeTarget?.promptMatch?.best_tags) } : null;
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
      // A Stop/stall mid-turn ends the rewrite loop with the draft that stands — never
      // another full opaque decode after the user (or the watchdog) already called it.
      if (ctx.signal?.aborted) break;
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
      const raw = await ctx.model.phrase(messages, { maxTokens: ctx.maxTokens || TASK_MAX_TOKENS.answer, signal: ctx.signal || null });
      cur = await BIND.factcheck(await BIND.bind({ ...cur, rawOutput: raw, messages }));
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
      // Grammar mode scores the draft's text model-free; the legacy cosine path still
      // embeds the draft and so still gates on the warm meaning embedder.
      const grammarMode = ctx.shapeLibrary.mode === 'grammar';
      const emb = grammarMode ? null : pickRetrievalEmbedder(ctx);
      if (grammarMode || (emb?.measuresMeaning && emb.isWarm?.())) {
        try {
          const draft = grammarMode ? ctx.rawOutput : await emb.embed(ctx.rawOutput);
          const formErr = answerFormError(ctx.shapeLibrary, ctx.shapeQueryVec, draft);
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
};
