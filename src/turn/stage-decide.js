// EO — one group of the turn's fold (split from turn/stages.js, 2026-07 compliance
// pass: "no file over ~250 lines" / "no 760-line orchestrator", docs/architecture.md).
// DECIDE: answerable → gate → reason.
// The methods are VERBATIM from stages.js; stages.js assembles the groups back
// into the one named-stage map the pipeline walks. Same holon, same seams.
import { answerVoid } from '../enactor/answer/index.js';
import { queryTouchesDoc } from '../surfer/retrieve/index.js';
import { taskOf } from './intent.js';
import { recordVoidDef } from './judgments.js';
import { projectGraph } from '../core/index.js';
import { answerabilityGate } from '../weave/longgen/index.js';
import { walkReasoning } from '../surfer/reason/index.js';

import { confabulating } from './stage-support.js';

export const STAGES = {

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

    // THE EOT ANSWERABILITY FLOOR — score grounding in the ontology's own language, not
    // lexical overlap. The lexical binder cannot tell a real answer from prose that quotes
    // the source while missing the question ("relatively uncommon compared to whaling" cited
    // for "the fastest dolphin"): it reads both as grounded. The trustworthy signal is the
    // fold's referent-binding — the EVA that decides WHO/WHAT the reading is about. When it
    // DIFFUSED (referential.concentrated === false) the surf rode to the document's loudest
    // figure, not the one asked about, so the corpus holds no answer to THIS question even
    // though it lexically touches the subject (the "fastest / most famous dolphin" asked over
    // a dolphin + Miami-Dolphins + Vaporwave composite — quarried from the wrong figure). The
    // fedGraph is ALREADY withheld on this exact measure (see `prompt` stage, landedOnReferent);
    // here it withholds the ANSWER too, before the wasted decode. A typed decline rides as the
    // honest word (grounded on the held spans, no model call), and proposeWebSearch — which
    // already keys on concentrated === false — raises the gap so web-auto re-searches for the
    // question and confirm/off offer the search button. Only a MEASURED diffusion (=== false)
    // gates; an unmeasured referent (null — no corefField, most tests/single docs) is
    // byte-identical, the same guard the fedGraph withhold uses.
    //
    // Two clauses make this safe against a FALSE refusal (worse than a missed one):
    //   · id != null — the reading LANDED ON some referent (mirrors proposeWebSearch). An EMPTY
    //     field (id null, w 0 — a small doc under the hash embedder, answer plainly in the
    //     excerpts) is not a wander; it falls through to the void measure below, as before.
    //   · margin ≤ FLAT_FIELD_MARGIN — the field is effectively FLAT: no figure leads, the top
    //     referents are tied, so the reading has no basis to say what it is about (the dolphin
    //     composite measured margin ≈ 0.00001). This is what separates a genuine wander from a
    //     merely multi-entity page where one figure DOES lead (a Curie doc measured margin ≈ 0.14
    //     and is perfectly answerable): `concentrated === false` alone conflated the two and
    //     refused the answerable one. Conservative by construction — only a near-tie gates; a
    //     value calibrated to distinguish a flat field from a led one, to be re-tuned on live data.
    const FLAT_FIELD_MARGIN = 0.02;
    if (ctx.referential?.concentrated === false && ctx.referential?.id != null
        && (ctx.referential?.margin ?? 1) <= FLAT_FIELD_MARGIN) {
      // The reading DIFFUSED — no figure leads, so the corpus holds the subject's words but
      // not a settled answer to THIS question. This once rode as a mechanical raw-span decline
      // (refusalAtom stitched the held spans and terminated the turn BEFORE the model), which
      // surfaced ellipsis-cut fragments as the answer and left "no prompt on record". Now it
      // rides as a HINT: the turn continues to the talker, which writes the honest "I didn't
      // find a settled answer" itself — a model-authored reply, with the prompt captured. The
      // diffusion is still measured on ctx.referential, which keys proposeWebSearch and the
      // soft (non-refusing) `referent-ambiguous` veto; the `prompt` stage reads `referentDiffuse`
      // to tell the talker to decline rather than pick a figure the reading didn't land on.
      return { ...ctx, referentDiffuse: true };
    }

    const v = answerVoid(ctx.doc, ctx.question, ctx.spans || [], { embedder: ctx.embedder });
    if (!v) return ctx;
    // P0.2: the void no longer auto-answers and terminates. The talker speaks for
    // every turn; the measured void RIDES as terrain context (`voidMeasure`) so the
    // diagonal guard (P1) can catch a specific claim asserted where the reading typed
    // an absence — a figure at a void — instead of the void silently pre-empting it.
    // The typed absence PROSE rides too (`voidText`): if the talker's answer comes back
    // with no witness at all, the `absence` stage speaks it (the honesty seam) — absence
    // is an available thing to assert, not just a terrain annotation.
    // Route the void verdict onto the judgment log — a DEF of absence is still a DEF, carrying
    // which absence (kind · receipt · how far the reading rode) as its witness.
    try { recordVoidDef(ctx.judgments, v.void); } catch { /* logging is best-effort */ }
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
    // The floor measured that the corpus does not supply what was asked (a named subject it
    // never mentions, or a wanted type the ground can't fill). This once terminated the turn
    // with the refusal atom AS the answer — a raw-span decline that never reached the model.
    // Now the measurement rides as a soft, non-refusing marker and the turn CONTINUES to the
    // talker: the answer is always model-authored (with a prompt on record), and the `prompt`
    // stage reads `answerability` to tell the talker to say plainly it didn't find it rather
    // than confabulate. The downstream bind/factcheck/veto/absence stages still police an
    // invented claim after the model writes.
    return { ...ctx, answerability: Object.freeze({ licensed: false, reason: g.reason, missing: g.missing || [] }) };
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
};
