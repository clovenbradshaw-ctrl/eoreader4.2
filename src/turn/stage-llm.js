// EO — one group of the turn's fold (split from turn/stages.js, 2026-07 compliance
// pass: "no file over ~250 lines" / "no 760-line orchestrator", docs/architecture.md).
// LLM: the one generating stage (+ its private lens machinery).
// The methods are VERBATIM from stages.js; stages.js assembles the groups back
// into the one named-stage map the pipeline walks. Same holon, same seams.
import { foldConversation } from './converse/index.js';
import { buildArchon } from '../enactor/ground/index.js';
import { canGroundedSpeak, groundedSpeak, RULES_REV } from '../organs/out/speech/index.js';
import { streamParagraphs } from '../weave/write/index.js';
import { streamPhrase } from '../model/index.js';
import { buildConceptTokenMap } from '../weave/write/index.js';
import { mountPersonality, defaultPantheonBank, defaultStanceBanks, defaultSiteBank, stanceFamily, resolveOverlap, dialMultipliers } from '../weave/write/index.js';


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
  // The judgment DEFs accumulated so far this turn (reference · void — the pre-draw verdicts)
  // JOIN the steering rail, so the same-vs-other judgments ride the Given-Log beside the
  // void-conflict / suppress / rec events, not outside it. The binding and correspondence DEFs
  // are logged after the draw; the full census is folded from the judgment log in pipeline.js.
  let defs = [];
  try { defs = ctx.judgments?.all?.() || []; } catch { defs = []; }
  const all = [...events, ...recs, ...defs];
  return all.length ? all : null;
};

// The conversation the GROUNDED prompt carries: the actual back-and-forth, both sides.
// The session fold (converse/history.js) already built the two registers a document gets
// — the recent turns VERBATIM (`pastTurns`, You:/Me:) and a surfed recap of older movers
// (`notes`, #i You:/#i Me:), bounded by the fold's own token budget — so the talker reads
// the real dialogue up to that budget, not a user-only checklist. The one thing withheld
// is an UNBOUND prior reply (a claim tied to no source): foldConversation drops it before
// the window is built, so a claim that never grounded cannot become a follow-up's premise.
// `settled` still rides beside the transcript. Empty (→ no slot) before anything was said.

export const STAGES = {

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
        // A pointed answer is ONE coherent decode, not a multi-call continuation loop.
        // The per-paragraph loop feeds the answer-so-far back with CONTINUE_CUE each round;
        // a small model follows that cue poorly and restates/contradicts itself across
        // paragraphs ("the shortfin mako is indeed the fastest dolphin, but it's not the
        // only one"). Only a genuine long-form ask (`ctx.longform`) develops multiple
        // paragraphs; every other grounded answer caps at a single paragraph so the reply
        // reads as one coherent piece, and the boundary gate (streamed===draft, mid-sentence
        // tail drop) still governs it.
        // THE ARCHON (docs/archon-source-gate.md). When the GROUNDED chip is set the answer is
        // span-anchored as it streams: each finished sentence is admitted only if every proposition
        // it asserts is grounded in the document AND corroborated by ≥2 distinct witnessing spans;
        // an unsourceable sentence is dropped before it is forwarded. Keyed on the explicit chip
        // (ctx.grounding === 'grounded'), NOT ctx.route — route is 'grounded' in auto too when a doc
        // is present, and only an explicit Grounded request opts into strict. Off → archon null, and
        // streamParagraphs takes its exact current path (byte-identical).
        const strict = ctx.grounding === 'grounded';
        const archon = strict
          ? buildArchon(ctx.doc, (ctx.spans || []).map((s) => s.idx), { minWitnesses: 2 })
          : null;
        const streamed = await streamParagraphs({
          model: ctx.model, messages: ctx.messages, onToken: ctx.onToken,
          budget: maxTokens, signal, maxParagraphs: ctx.longform ? null : 1,
          archon, groundStrict: strict,
        });
        if (streamed && streamed.draft) {
          // The user stopped mid-decode: the partial paragraphs are the answer —
          // short-circuit the pipeline exactly as the plain path does below.
          if (signal?.aborted) {
            return { ...ctx, rawOutput: streamed.draft, answer: streamed.draft.trim(), sources: [], maxTokens, streamed, stopped: true, terminate: true };
          }
          // Carry the archon's record forward: `sourced` (each admitted sentence + its ≥2
          // witnessing citations) feeds the multi-citation assembly in `bind`; `groundDropped`
          // feeds the honest "left out" flag in the pipeline.
          return { ...ctx, rawOutput: streamed.draft, maxTokens, streamed,
                   sourced: streamed.sourced || null, groundDropped: streamed.dropped || [] };
        }
        // NPJ-strict and the archon refused EVERY sentence (streamed non-null, empty draft): do NOT
        // fall through to the ungrounded one-shot path below — it would ship exactly the prose the
        // archon just refused. Answer the honest absence, grounded on nothing, and terminate.
        if (strict && streamed) {
          const answer = "I couldn't source that in this document — nothing I could say was corroborated by at least two of its lines.";
          return { ...ctx, rawOutput: '', answer, sources: [], maxTokens, streamed,
                   groundDropped: streamed.dropped || [], terminate: true };
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
};
