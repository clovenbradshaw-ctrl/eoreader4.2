// EO — one group of the turn's fold (split from turn/stages.js, 2026-07 compliance
// pass: "no file over ~250 lines" / "no 760-line orchestrator", docs/architecture.md).
// CLOSE: absence → validate → settle.
// The methods are VERBATIM from stages.js; stages.js assembles the groups back
// into the one named-stage map the pipeline walks. Same holon, same seams.
import { pickRetrievalEmbedder, selectExcerpts } from '../surfer/retrieve/index.js';
import { structuralActivations } from '../surfer/index.js';
import { TASK_MAX_TOKENS } from './intent.js';
import { buildGroundedMessages } from '../model/index.js';
import { runVetoes, isAbstention, assessAnswer } from '../enactor/ground/index.js';
import { speak } from '../model/index.js';

import { orientationOf, GROUNDING_CORRECTIVE, ASSESS_MAX_TOKENS, VALIDATION_ABSENCE } from './stage-support.js';
// validate re-runs the bind→factcheck pair directly from its group —
// a real dependency edge, not a cycle through the assembler.
import { STAGES as BIND } from './stage-bind.js';

export const STAGES = {

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

  // THE VALIDATE STAGE — the answer weighed by the reader's own reaction, measured by the
  // BORN RULE (ground/validate.js). The mechanical battery FLAGS a thin grounding but, by
  // deliberate design (ground/veto.js; the §5 gate that once forced an ungrounded answer
  // toward "I did not find it" is OFF), never gates: an `unbound-contact` answer RIDES, shown
  // as grounded. That leaves one gap the LEXICAL binder cannot see — a confident claim that
  // shares the retrieved (but off-topic) spans' vocabulary binds as unbound-contact and ships,
  // though nothing in the lines supports it (the audit-export straw-hut fabrication).
  //
  // The move is actor–critic with a MEASURED signal. The reader is asked to REACT to its own
  // draft — is this a good, supported answer? — and the reaction is not read for a yes/no word
  // (an oracle the engine refuses on principle). It is put through the Born rule: projected
  // onto a valence basis, squared, normalised, and the two shares of that one distribution
  // read off. A POSITIVE reaction (the good frame holds its squared mass, `onMass ≥ offMass`,
  // the reading's own crossing) goes FORWARD. A NEGATIVE one (the frame breaks) goes BACK: one
  // regenerate pass, steered onto the lines, with the honest absence a real option — the same
  // gate-then-rewrite `revise` uses, driven here by the model's own reaction. If it still
  // cannot answer, the draft is held for the honest absence, preserved in `revisions` (the
  // SEG/retract law). Opt-in (ctx.validate; default off → byte-identical golden turns), model-
  // gated, and SCOPED to the ambiguous middle: a pointed answer that made claims, earned NO
  // witness, did not already abstain or gate, and that the mechanical read already doubts. On
  // the STREAMING path the draft is already on the reader's screen — suppress-never-erase
  // forbids un-streaming it (the exemption revise/absence take), so a negative reaction rides
  // as a refusing flag instead of going back. An unmeasurable or positive reaction never gates:
  // the paraphrase-that-rides stays protected, and the reaction never manufactures a refusal.
  async validate(ctx) {
    if (!ctx.validate || !ctx.model || !ctx.spans?.length || !ctx.rawOutput) return ctx;
    if (ctx.stopped || ctx.gated || ctx.voidSpoken) return ctx;              // already settled honestly
    if ((ctx.task || 'answer') !== 'answer') return ctx;                     // pointed questions only
    const cited = (ctx.bound || []).some((b) => b.citation) || (ctx.sources || []).length > 0;
    if (cited) return ctx;                                                   // has a witness — leave it to the flag battery
    if (isAbstention(ctx.rawOutput || ctx.answer)) return ctx;              // the talker already declined
    // Spend the reaction only where the mechanical read already doubts the grounding — the
    // exact flags the export fired on the fabrication. Anywhere the binder was content, no
    // reaction is asked for, so a well-grounded turn pays nothing.
    const weak = (ctx.vetoes || []).some(
      (v) => v.id === 'unbound' || v.id === 'unbound-contact' || v.id === 'low-coverage');
    if (!weak) return ctx;
    // A warm meaning embedder measures the reaction's SENTIMENT geometrically (against the
    // anchors); absent one, the reaction is weighed on the lexical valence basis. Same Born
    // partition either way, same forward/back decision — the embedder only sharpens the read.
    const emb = pickRetrievalEmbedder(ctx);
    const meaningEmb = (emb?.measuresMeaning && emb.isWarm?.()) ? emb : null;
    const react = await assessAnswer({
      model: ctx.model, question: ctx.question, spans: ctx.spans,
      answer: ctx.rawOutput, embedder: meaningEmb, maxTokens: ASSESS_MAX_TOKENS, signal: ctx.signal,
    });
    // Positive reaction (good frame holds), unmeasurable, or no reaction at all → forward.
    if (!react || react.positive) return { ...ctx, assessment: react || null };
    const share = Math.round((react.offMass || 0) * 100);
    // NEGATIVE reaction. Streaming: the draft is already shown — flag it, do not un-stream.
    if (ctx.streamed) {
      const vetoes = [...(ctx.vetoes || []), Object.freeze({
        id: 'assessment-negative', refuses: true,
        message: `Asked what it made of its own draft, the reader's reaction weighed negative (${share}% of the Born mass off the "good answer" frame) — the answer is shown, flagged.`,
      })];
      return { ...ctx, assessment: react, vetoes };
    }
    // GO BACK — one regenerate pass, steered back onto the lines (the honest absence is a real
    // option), then re-bound and re-vetoed so the shipped redraft carries honest flags.
    const regenMessages = buildGroundedMessages({
      question: ctx.question, spans: selectExcerpts(ctx.spans),
      orientation: orientationOf(ctx.doc), task: ctx.task, budget: ctx.budget,
      conversation: {}, corrective: GROUNDING_CORRECTIVE,
    });
    const redraft = await speak(ctx.model, regenMessages, { fallback: null, maxTokens: ctx.maxTokens || TASK_MAX_TOKENS.answer, ...(ctx.signal ? { signal: ctx.signal } : {}) });
    // Could not answer again → hold the draft back for the honest absence (it does not go forward).
    if (!redraft || !redraft.trim()) {
      const revisions = [...(ctx.revisions || []), Object.freeze({
        draft: ctx.answer ?? ctx.rawOutput ?? '', replacedBy: VALIDATION_ABSENCE,
        why: "the reader's own reaction to the draft weighed negative and it could not answer again",
      })];
      const vetoes = [...(ctx.vetoes || []), Object.freeze({
        id: 'assessment-negative', refuses: true,
        message: 'The reader reacted negatively to its own draft and could not answer again — it held the draft back for the honest absence.',
      })];
      return { ...ctx, answer: VALIDATION_ABSENCE, sources: [], gated: true, voidSpoken: true, assessment: react, revisions, vetoes };
    }
    // The redraft goes forward in the draft's place; the superseded draft rides in the trail.
    const revisions = [...(ctx.revisions || []), Object.freeze({
      draft: ctx.rawOutput, replacedBy: redraft,
      why: `the reader's own reaction to the draft weighed negative (${share}% of the Born mass off the "good answer" frame), so it answered again`,
    })];
    const rebound = await BIND.factcheck(await BIND.bind({ ...ctx, rawOutput: redraft, messages: undefined }));
    const fired = runVetoes({
      draft: rebound.rawOutput, bound: rebound.bound, question: ctx.question,
      referential: rebound.referential, task: ctx.task, edgeVerdicts: rebound.edgeVerdicts,
    }).fired;
    const vetoes = [...fired, Object.freeze({
      id: 'assessment-revised', refuses: false,
      message: 'The reader reacted negatively to its first draft, so it answered again — this is the second pass.',
    })];
    return { ...rebound, assessment: react, wentBack: true, revisions, vetoes };
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
