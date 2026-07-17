// EO: INS·SIG·CON(Void,Network → Entity,Lens, Making·Tending·Binding) — the calibration local() adapter
// metabolism/calibration-local.js — wires runCalibrationCycle's `local(task, allocation)` (calibrate.js)
// to the SAME real turn pipeline answerer.js already drives for challenger.js, so calibration mode
// never runs a toy pipeline — it is the real fold -> answer path a live chat runs, read at the running
// genome's allocation.
//
// "fold" and "plan" (docs/calibration-mode.md §1) are not a separate stage in turn/ today — the
// mechanical reading the pipeline actually computes (pipeline.js's buildReading: the retrieved spans,
// the surfer's field/stops, the assembled llm brief) IS the fold, and the surfer's STOPS — the arrest
// points stage-llm.js's streamParagraphs already generates one paragraph per — ARE the plan: a real,
// live, ordered beat sequence, just not yet reified into surfToPlan's richer per-cell shape
// (weave/write/plan.js — built, never wired into turn/; docs/calibration-mode.md §7 build order #2
// names reviving it as future work). This module reads what the pipeline actually computes rather than
// pretending a chunk-prompt planning stage exists that does not.
//
// `allocation.maxTokens` and `allocation.retrieveK` are the two calibration dials the live pipeline
// already accepts per call (runTurn's `maxTokens`, runTurnWithResearch's `k` — both threaded through
// answerer.js). The rest of genome.js's dials (foldWidth, bindFloor, arcEpsilon, gamma) are today read
// from fixed constants elsewhere in the tree (see genome.js's own comments for their locations), not
// yet threaded per-call — the same gap the retrieval-lift objective (lift.js's liftWorld) already lives
// with. Calibration mode inherits that gap honestly rather than faking the wiring.

import { createResearchAnswerer } from './answerer.js';

export const createCalibrationLocal = ({
  model, embedder, geometricEmbedder = null, auditLog, search,
  maxHops = 4, onResearch = null,
} = {}) => {
  if (!auditLog) throw new TypeError('createCalibrationLocal needs an auditLog');
  if (typeof search !== 'function') throw new TypeError('createCalibrationLocal needs a search primitive');

  return async (task, allocation = {}) => {
    // A fresh answerer PER CYCLE, built at the allocation under test — maxTokens/k are runTurn's and
    // runTurnWithResearch's own per-call knobs, so the running genome actually reaches the live
    // pipeline rather than a fixed constructor-time setting.
    const answerer = createResearchAnswerer({
      model, embedder, geometricEmbedder, auditLog, search, onResearch,
      maxHops, k: allocation.retrieveK ?? 3, maxTokens: allocation.maxTokens ?? null,
    });
    const out = await answerer(task);
    const reading = out.reading || null;
    return {
      answer: out.answer,
      fold: (reading?.spans?.length ? reading.spans : out.sources) || null,
      plan: planOf(reading),
      sources: out.sources, trail: out.trail, arrivals: out.arrivals,
    };
  };
};

// planOf — the ordered beat sequence the pipeline actually walks: the surfer's stops, each matched
// to the span text captured at that index (when the fold caught one), so fold-plan-judge.js's grader
// reads a human-legible plan rather than bare indices.
const planOf = (reading) => {
  const stops = reading?.surf?.stops;
  if (!Array.isArray(stops) || !stops.length) return null;
  const byIdx = new Map((reading.spans || []).map((s) => [s.idx, s.text]));
  return stops.map((idx) => ({ stop: idx, summary: byIdx.get(idx) || `beat @${idx}` }));
};
