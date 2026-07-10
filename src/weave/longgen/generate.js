// EO: DEF·EVA(Field,Network → Lens, Making,Binding) — planner on/off toggle
// generate — the settings toggle, planner on / planner off (spec-planner.md §11).
//
// The planner trades fluency for grounding, and whether the trade is worth it is
// empirical, not assumable. Each atom is rendered in isolation with the structure
// pre-decided, so it cannot lie — and it also cannot flow the way a single free
// generation flows. So the planner is a SETTING, not a baked-in default.
//
//   planner ON   multi-prompt, grounded, every claim witnessed; the answerability
//                gate (§3), the significance arc (§8), the saturation stop (§10) and
//                the weld (§7) all running. This is runContinuation with arc on.
//   planner OFF  the plain path — one prompt, the model writes the whole answer,
//                with the void gate STILL running underneath (the §3 gate refuses an
//                unanswerable type; bind+veto strips any invented name or number on
//                the way back), so it cannot invent a name or a number either.
//
// `compareModes` runs the same question through both for the side-by-side that
// decides the default: ship the plain path with the gate until the measurement says
// the planner is worth its cost. The toggle IS the measurement.

import { generateSection, ceilingFor, FLOOR_TOKENS } from '../arc/index.js';
import { bindAndVeto as floorBind } from '../../enactor/ground/index.js';
import { runContinuation } from './continuation.js';
import { answerabilityGate, followUpOffer } from './answerable.js';

// The faithfulness of a result — the fraction of its claims that bound. The number
// the side-by-side compares: planner-on must be at LEAST as faithful as planner-off.
const faithfulness = (res) => {
  if (!res.units?.length) return 1;
  const fs = res.units.map(u => (typeof u.boundFraction === 'number' ? u.boundFraction : 1));
  return fs.reduce((a, b) => a + b, 0) / fs.length;
};

// The plain path — planner OFF. One prompt over the whole ground pool; the void gate
// runs underneath so the single free generation still cannot invent.
export const plainPath = async ({ ground = [], model, doc = null, graph = null, question = '', history = [], signal = null } = {}) => {
  // The §3 gate runs in BOTH modes — the plain path is not a licence to confabulate
  // a shape the ground cannot supply.
  const gate = answerabilityGate({ question, ground, graph });
  if (!gate.licensed) {
    const r = gate.refusal;
    const unit = { i: 0, move: 'VOID', text: r.text, sources: r.sources, boundFraction: 1, action: 'refuse', refusal: true };
    return { mode: 'plain', answer: r.text, units: [unit], sources: [...r.sources].sort((a, b) => a - b),
      stop: 'unanswerable', wantedType: gate.wantedType, followUp: '', faithfulness: 1 };
  }

  const spans = (ground || []).map((s, i) => ({ ...s, idx: s.idx ?? i }));
  const mass = spans.reduce((m, s) => m + (s.score || 0), 0);
  const section = {
    subClaim: question || 'what the lines show',
    spans,
    floor: FLOOR_TOKENS,
    ceiling: ceilingFor({ mass, spans }),
  };
  const gen = await generateSection(section, { doc, model, signal });
  // The void gate: bind the free generation against the spans and keep only what
  // ties to a source — a name or number with no line behind it is struck.
  const gated = floorBind(gen.rawOutput, spans, { doc, question: section.subClaim, task: 'answer' });
  const unit = { i: 0, move: null, text: gated.answer, sources: gated.sources,
    boundFraction: gated.boundFraction, vetoes: gated.vetoes, action: 'plain' };
  return {
    mode: 'plain',
    answer: gated.answer,
    units: [unit],
    sources: [...new Set(gated.sources)].sort((a, b) => a - b),
    stop: 'plain',
    wantedType: gate.wantedType,
    followUp: followUpOffer(ground, new Set(spans.map(s => s.idx))),
    faithfulness: gated.boundFraction,
  };
};

// The dispatcher. `planner` selects the mode; everything else passes through.
export const generate = async ({ planner = false, ...opts } = {}) => {
  if (planner) {
    const res = await runContinuation({ ...opts, arc: true, speculate: opts.speculate ?? true });
    return { mode: 'planner', ...res, faithfulness: faithfulness(res) };
  }
  return plainPath(opts);
};

// Run BOTH modes on the same question and ground — the side-by-side that decides the
// default (§11). Returns each result and the faithfulness delta the decision reads.
export const compareModes = async (opts = {}) => {
  const planner = await generate({ ...opts, planner: true });
  const plain = await generate({ ...opts, planner: false });
  return {
    planner,
    plain,
    faithfulnessDelta: round3(planner.faithfulness - plain.faithfulness),
    plannerAtLeastAsFaithful: planner.faithfulness >= plain.faithfulness - 1e-9,
  };
};

const round3 = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);
