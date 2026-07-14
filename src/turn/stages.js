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
//
// SPLIT (2026-07 compliance pass): the 1,756-line orchestrator this file used to
// be violated the law it sat under ("no god module — no file over ~250 lines; no
// 760-line orchestrator", docs/architecture.md). The stages now live in eight
// group files along the fold's own seams — read → fold → decide → prompt → llm →
// bind → revise → close, with the cross-group helpers in stage-support.js — and
// this file is only the assembler: it names the ONE stage map the pipeline walks
// (turn/pipeline.js), so every consumer and every seam is unchanged.
//
// The delegates are CALL-TIME on purpose. The engine's import graph carries a
// legal cycle (intent → longgen → arc → turn/index → here); an eval-time spread
// of the group maps would TDZ whenever a group module is the entry point of that
// cycle. A delegate touches its group namespace only when the stage RUNS, by
// which time every module is initialized — so any entry point works.

import * as READ   from './stage-read.js';
import * as FOLD   from './stage-fold.js';
import * as DECIDE from './stage-decide.js';
import * as PROMPT from './stage-prompt.js';
import * as LLM    from './stage-llm.js';
import * as BIND   from './stage-bind.js';
import * as REVISE from './stage-revise.js';
import * as CLOSE  from './stage-close.js';

export const stages = Object.freeze({
  // READ — take the turn in
  route:       (ctx) => READ.STAGES.route(ctx),
  expect:      (ctx) => READ.STAGES.expect(ctx),
  converse:    (ctx) => READ.STAGES.converse(ctx),
  retrieve:    (ctx) => READ.STAGES.retrieve(ctx),
  inquire:     (ctx) => READ.STAGES.inquire(ctx),
  // FOLD — the reading the turn stands on
  fold:        (ctx) => FOLD.STAGES.fold(ctx),
  foldReading: (ctx) => FOLD.STAGES.foldReading(ctx),
  predict:     (ctx) => FOLD.STAGES.predict(ctx),
  // DECIDE — may the record answer this at all
  answerable:  (ctx) => DECIDE.STAGES.answerable(ctx),
  gate:        (ctx) => DECIDE.STAGES.gate(ctx),
  reason:      (ctx) => DECIDE.STAGES.reason(ctx),
  // PROMPT · LLM — the one generating seam
  prompt:      (ctx) => PROMPT.STAGES.prompt(ctx),
  llm:         (ctx) => LLM.STAGES.llm(ctx),
  // BIND — the citation bond and the fact check
  bind:        (ctx) => BIND.STAGES.bind(ctx),
  factcheck:   (ctx) => BIND.STAGES.factcheck(ctx),
  // REVISE — the gate's second chance
  revise:      (ctx) => REVISE.STAGES.revise(ctx),
  veto:        (ctx) => REVISE.STAGES.veto(ctx),
  // CLOSE — absence, validation, settlement
  absence:     (ctx) => CLOSE.STAGES.absence(ctx),
  validate:    (ctx) => CLOSE.STAGES.validate(ctx),
  settle:      (ctx) => CLOSE.STAGES.settle(ctx),
});

// The public helpers keep their historical import site.
export { scrubGraphLines } from './stage-prompt.js';
export { CHORUS_REV, significanceOpts } from './stage-fold.js';
export { shapeDescriptor, composeFoldSummary, orientationOf } from './stage-support.js';
